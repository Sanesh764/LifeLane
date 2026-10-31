import express from 'express';
import mongoose from 'mongoose';
import { isDbConnected } from '../config/db.js';
import { AmbulanceTrip } from '../models/AmbulanceTrip.js';
import { TripLocationHistory } from '../models/TripLocationHistory.js';
import { authenticate, requireActiveDriver } from '../middlewares/auth.js';
import { locationUpdateRateLimiter } from '../middlewares/rateLimiter.js';
import {
  dispatchAlertsForTrip,
  startTripAlertInterval,
  handleTripEnded,
} from '../services/notificationService.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = express.Router();

/**
 * Coordinate extraction and validation helper
 * Accepts [lng, lat], { latitude, longitude }, or { location: { coordinates: [lng, lat] } }
 */
function parseCoordinates(input, fieldName = 'coordinates') {
  if (!input) {
    return { error: `${fieldName} is required.` };
  }

  let lng;
  let lat;

  if (Array.isArray(input)) {
    if (input.length !== 2) {
      return { error: `${fieldName} array must contain exactly [longitude, latitude].` };
    }
    lng = Number(input[0]);
    lat = Number(input[1]);
  } else if (typeof input === 'object') {
    if (Array.isArray(input.coordinates)) {
      if (input.coordinates.length !== 2) {
        return { error: `${fieldName}.coordinates must contain exactly [longitude, latitude].` };
      }
      lng = Number(input.coordinates[0]);
      lat = Number(input.coordinates[1]);
    } else if (
      (input.latitude !== undefined || input.lat !== undefined) &&
      (input.longitude !== undefined || input.lng !== undefined)
    ) {
      lat = Number(input.latitude !== undefined ? input.latitude : input.lat);
      lng = Number(input.longitude !== undefined ? input.longitude : input.lng);
    } else {
      return { error: `${fieldName} must provide latitude and longitude.` };
    }
  } else {
    return { error: `Invalid ${fieldName} format.` };
  }

  if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
    return { error: `${fieldName} coordinates must be finite numbers.` };
  }

  if (lat < -90 || lat > 90) {
    return { error: `${fieldName} latitude must be between -90 and 90 degrees.` };
  }

  if (lng < -180 || lng > 180) {
    return { error: `${fieldName} longitude must be between -180 and 180 degrees.` };
  }

  return { coordinates: [lng, lat] };
}

/**
 * POST /api/v1/trips
 * Start an emergency trip
 */
router.post(
  '/',
  authenticate,
  requireActiveDriver,
  asyncHandler(async (req, res) => {
    if (!isDbConnected()) {
      throw ApiError.serviceUnavailable(
        'Database service is temporarily unavailable.',
        'DATABASE_UNAVAILABLE'
      );
    }

    const driverId = req.user._id;

    // Check if driver already has an active trip (One Active Trip rule)
    const existingActiveTrip = await AmbulanceTrip.findOne({
      driverId,
      status: 'ACTIVE',
    });

    if (existingActiveTrip) {
      throw new ApiError(
        409,
        'Driver already has an active emergency trip. Complete the existing trip before starting a new one.',
        'ACTIVE_TRIP_EXISTS',
        { activeTripId: existingActiveTrip._id.toString() }
      );
    }

    const { destination, initialLocation, origin, locationAccuracyMeters } = req.body || {};

    // Validate Destination Label
    if (
      !destination ||
      typeof destination !== 'object' ||
      !destination.label ||
      typeof destination.label !== 'string' ||
      !destination.label.trim()
    ) {
      throw ApiError.badRequest(
        'destination.label is required and must be a non-empty string.',
        'INVALID_REQUEST'
      );
    }

    // Validate Destination Coordinates
    const destLocInput = destination.location || destination.coordinates || destination;
    const parsedDest = parseCoordinates(destLocInput, 'destination');
    if (parsedDest.error) {
      throw ApiError.badRequest(parsedDest.error, 'INVALID_COORDINATES');
    }

    // Validate Initial Location / Origin Coordinates
    const originInput = initialLocation || origin || req.body;
    const parsedOrigin = parseCoordinates(originInput, 'initialLocation');
    if (parsedOrigin.error) {
      throw ApiError.badRequest(parsedOrigin.error, 'INVALID_COORDINATES');
    }

    // Validate Accuracy if supplied
    let accuracy = null;
    const rawAcc = locationAccuracyMeters !== undefined ? locationAccuracyMeters : req.body.accuracy;
    if (rawAcc !== undefined && rawAcc !== null) {
      const numAcc = Number(rawAcc);
      if (!Number.isFinite(numAcc) || numAcc < 0) {
        throw ApiError.badRequest(
          'Location accuracy must be a non-negative finite number.',
          'INVALID_ACCURACY'
        );
      }
      accuracy = numAcc;
    }

    // Create Emergency Trip using strictly trusted driver & assigned unit from req.user
    const trip = new AmbulanceTrip({
      driverId,
      status: 'ACTIVE',
      assignedUnit: req.user.assignedUnit || {},
      origin: {
        type: 'Point',
        coordinates: parsedOrigin.coordinates,
      },
      destination: {
        label: destination.label.trim(),
        location: {
          type: 'Point',
          coordinates: parsedDest.coordinates,
        },
      },
      currentLocation: {
        type: 'Point',
        coordinates: parsedOrigin.coordinates,
      },
      locationAccuracyMeters: accuracy,
      startedAt: new Date(),
      lastLocationReceivedAt: new Date(),
      currentRoute: {
        status: 'UNAVAILABLE',
        reason: 'ROUTING_PROVIDER_PENDING',
      },
    });

    try {
      await trip.save();
    } catch (saveErr) {
      // Catch MongoDB unique constraint violation on unique_active_trip_per_driver index
      if (saveErr.code === 11000) {
        throw ApiError.conflict(
          'An active trip is already recorded for this driver.',
          'ACTIVE_TRIP_EXISTS'
        );
      }
      throw saveErr;
    }

    // Record initial location in telemetry history
    try {
      await TripLocationHistory.create({
        tripId: trip._id,
        driverId,
        location: {
          type: 'Point',
          coordinates: parsedOrigin.coordinates,
        },
        accuracyMeters: accuracy,
        receivedAt: new Date(),
      });
    } catch (histErr) {
      console.warn('[Trip Location History Warning] Failed to log initial point:', histErr.message);
    }

    // Asynchronously dispatch proximity alerts & start refresh interval (Non-blocking)
    dispatchAlertsForTrip(trip._id, parsedOrigin.coordinates).catch((alertErr) => {
      console.warn('[Alert Warning] Initial proximity dispatch error:', alertErr.message);
    });
    startTripAlertInterval(trip._id);

    return ApiResponse.created(
      {
        trip: trip.toJSON(),
        route: {
          status: 'UNAVAILABLE',
          reason: 'ROUTING_PROVIDER_PENDING',
        },
      },
      'Emergency trip started successfully.'
    ).send(res);
  })
);

/**
 * GET /api/v1/trips/current & GET /api/v1/trips/active
 * Retrieve the current active trip for the authenticated driver
 */
const handleGetActiveTrip = asyncHandler(async (req, res) => {
  if (!isDbConnected()) {
    throw ApiError.serviceUnavailable(
      'Database service is temporarily unavailable.',
      'DATABASE_UNAVAILABLE'
    );
  }

  const trip = await AmbulanceTrip.findOne({
    driverId: req.user._id,
    status: 'ACTIVE',
  });

  if (!trip) {
    return ApiResponse.ok(null, 'No active emergency trip found.').send(res);
  }

  return ApiResponse.ok(
    {
      trip: trip.toJSON(),
    },
    'Active emergency trip retrieved successfully.'
  ).send(res);
});

router.get('/current', authenticate, requireActiveDriver, handleGetActiveTrip);
router.get('/active', authenticate, requireActiveDriver, handleGetActiveTrip);

/**
 * GET /api/v1/trips/public-active
 * Unauthenticated public route returning current active emergency mission metadata
 * for public citizen awareness, notifications, and corridor radar.
 */
router.get(
  '/public-active',
  asyncHandler(async (req, res) => {
    if (!isDbConnected()) {
      return ApiResponse.ok({ active: false, trip: null }, 'Database disconnected.').send(res);
    }

    const activeTrip = await AmbulanceTrip.findOne({ status: 'ACTIVE' })
      .sort({ startedAt: -1 })
      .lean();

    if (!activeTrip) {
      return ApiResponse.ok({ active: false, trip: null }, 'No active emergency missions.').send(res);
    }

    return ApiResponse.ok(
      {
        active: true,
        trip: {
          id: activeTrip._id.toString(),
          ambulanceCallsign: activeTrip.assignedUnit?.callSign || 'Patna Emergency Unit 108',
          vehicleNumber: activeTrip.assignedUnit?.vehicleNumber || 'BR-01-EA-108',
          destinationHospital: activeTrip.destination?.label || 'Emergency Medical Facility',
          destinationCoordinates: activeTrip.destination?.location?.coordinates || null,
          originCoordinates: activeTrip.origin?.coordinates || null,
          currentCoordinates:
            activeTrip.currentLocation?.coordinates || activeTrip.origin?.coordinates || null,
          startedAt: activeTrip.startedAt,
          status: 'ACTIVE',
        },
      },
      'Active emergency mission retrieved.'
    ).send(res);
  })
);

/**
 * GET /api/v1/trips/:id
 * Retrieve details for a specific trip (Ownership enforced)
 */
router.get(
  '/:id',
  authenticate,
  requireActiveDriver,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw ApiError.badRequest('Invalid trip ID format.', 'INVALID_ID');
    }

    const trip = await AmbulanceTrip.findById(id);
    if (!trip) {
      throw ApiError.notFound('Emergency trip not found.', 'TRIP_NOT_FOUND');
    }

    // Ownership Check
    const isOwner = trip.driverId.toString() === req.user._id.toString();
    const isAdmin = req.user.role === 'ADMIN';
    if (!isOwner && !isAdmin) {
      throw ApiError.forbidden('Access denied. You do not own this emergency trip.', 'FORBIDDEN');
    }

    return ApiResponse.ok(
      {
        trip: trip.toJSON(),
      },
      'Emergency trip retrieved successfully.'
    ).send(res);
  })
);

/**
 * POST & PATCH /api/v1/trips/:id/location
 * Submit live GPS location update for an active trip
 */
const handleLocationUpdate = asyncHandler(async (req, res) => {
  if (!isDbConnected()) {
    throw ApiError.serviceUnavailable(
      'Database service is temporarily unavailable.',
      'DATABASE_UNAVAILABLE'
    );
  }

  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw ApiError.badRequest('Invalid trip ID format.', 'INVALID_ID');
  }

  const trip = await AmbulanceTrip.findById(id);
  if (!trip) {
    throw ApiError.notFound('Emergency trip not found.', 'TRIP_NOT_FOUND');
  }

  // Ownership Enforcement
  if (trip.driverId.toString() !== req.user._id.toString() && req.user.role !== 'ADMIN') {
    throw ApiError.forbidden(
      'Access denied. You can only update locations for your own trips.',
      'FORBIDDEN'
    );
  }

  // Active Status Enforcement
  if (trip.status !== 'ACTIVE') {
    throw ApiError.conflict(
      `Location updates are only accepted for ACTIVE trips. This trip is ${trip.status}.`,
      'TRIP_NOT_ACTIVE'
    );
  }

  // Coordinate Parsing & Validation
  const locationInput = req.body?.location || req.body?.coordinates || req.body;
  const parsed = parseCoordinates(locationInput, 'location');
  if (parsed.error) {
    throw ApiError.badRequest(parsed.error, 'INVALID_COORDINATES');
  }

  // Validate Heading (0 <= heading <= 360)
  let heading = null;
  const rawHeading = req.body?.headingDegrees !== undefined ? req.body.headingDegrees : req.body?.heading;
  if (rawHeading !== undefined && rawHeading !== null) {
    const numHeading = Number(rawHeading);
    if (!Number.isFinite(numHeading) || numHeading < 0 || numHeading > 360) {
      throw ApiError.badRequest(
        'Heading must be a number between 0 and 360 degrees.',
        'INVALID_HEADING'
      );
    }
    heading = numHeading === 360 ? 0 : numHeading;
  }

  // Validate Speed
  let speed = null;
  const rawSpeed = req.body?.speedMetersPerSecond !== undefined ? req.body.speedMetersPerSecond : req.body?.speed;
  if (rawSpeed !== undefined && rawSpeed !== null) {
    const numSpeed = Number(rawSpeed);
    if (!Number.isFinite(numSpeed) || numSpeed < 0) {
      throw ApiError.badRequest('Speed must be a non-negative number.', 'INVALID_SPEED');
    }
    speed = numSpeed;
  }

  // Validate Accuracy
  let accuracy = null;
  const rawAccuracy = req.body?.accuracyMeters !== undefined ? req.body.accuracyMeters : req.body?.accuracy;
  if (rawAccuracy !== undefined && rawAccuracy !== null) {
    const numAccuracy = Number(rawAccuracy);
    if (!Number.isFinite(numAccuracy) || numAccuracy < 0) {
      throw ApiError.badRequest('Accuracy must be a non-negative number.', 'INVALID_ACCURACY');
    }
    accuracy = numAccuracy;
  }

  // Validate Client Timestamp
  let capturedAtDate = null;
  const rawCapturedAt = req.body?.capturedAt || req.body?.timestamp;
  if (rawCapturedAt) {
    const parsedDate = new Date(rawCapturedAt);
    if (Number.isNaN(parsedDate.getTime())) {
      throw ApiError.badRequest(
        'capturedAt must be a valid ISO 8601 timestamp.',
        'INVALID_TIMESTAMP'
      );
    }

    // Check future timestamp (allow 60s clock drift tolerance)
    if (parsedDate.getTime() > Date.now() + 60000) {
      throw ApiError.badRequest(
        'Location capture timestamp cannot be in the future.',
        'INVALID_TIMESTAMP'
      );
    }

    // Check out-of-order / stale update
    if (trip.lastLocationCapturedAt && parsedDate.getTime() < trip.lastLocationCapturedAt.getTime()) {
      throw ApiError.validationError(
        'Location update has an earlier capture timestamp than the latest accepted update.',
        null,
        'STALE_LOCATION_UPDATE'
      );
    }

    capturedAtDate = parsedDate;
  }

  const receivedAt = new Date();

  // Atomically update trip document
  trip.currentLocation = {
    type: 'Point',
    coordinates: parsed.coordinates,
  };
  if (accuracy !== null) trip.locationAccuracyMeters = accuracy;
  if (heading !== null) trip.headingDegrees = heading;
  if (speed !== null) trip.speedMetersPerSecond = speed;
  if (capturedAtDate !== null) trip.lastLocationCapturedAt = capturedAtDate;
  trip.lastLocationReceivedAt = receivedAt;

  await trip.save();

  // Record historical telemetry in separate collection
  try {
    await TripLocationHistory.create({
      tripId: trip._id,
      driverId: req.user._id,
      location: {
        type: 'Point',
        coordinates: parsed.coordinates,
      },
      accuracyMeters: accuracy,
      headingDegrees: heading,
      speedMetersPerSecond: speed,
      capturedAt: capturedAtDate,
      receivedAt,
    });
  } catch (histErr) {
    console.warn('[Trip Location History Warning] Failed to log telemetry point:', histErr.message);
  }

  // Asynchronously dispatch proximity alerts on ambulance movement (Non-blocking)
  dispatchAlertsForTrip(trip._id, parsed.coordinates).catch((alertErr) => {
    console.warn('[Alert Warning] Proximity location refresh error:', alertErr.message);
  });

  return ApiResponse.ok(
    {
      accepted: true,
      tripId: trip._id.toString(),
      currentLocation: trip.currentLocation,
      locationAccuracyMeters: trip.locationAccuracyMeters,
      headingDegrees: trip.headingDegrees,
      speedMetersPerSecond: trip.speedMetersPerSecond,
      lastLocationCapturedAt: trip.lastLocationCapturedAt,
      receivedAt: receivedAt.toISOString(),
    },
    'Location update accepted.'
  ).send(res);
});

router.post(
  '/:id/location',
  authenticate,
  requireActiveDriver,
  locationUpdateRateLimiter.middleware(),
  handleLocationUpdate
);

router.patch(
  '/:id/location',
  authenticate,
  requireActiveDriver,
  locationUpdateRateLimiter.middleware(),
  handleLocationUpdate
);

/**
 * POST /api/v1/trips/:id/end
 * End an active emergency trip
 */
router.post(
  '/:id/end',
  authenticate,
  requireActiveDriver,
  asyncHandler(async (req, res) => {
    if (!isDbConnected()) {
      throw ApiError.serviceUnavailable(
        'Database service is temporarily unavailable.',
        'DATABASE_UNAVAILABLE'
      );
    }

    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw ApiError.badRequest('Invalid trip ID format.', 'INVALID_ID');
    }

    const trip = await AmbulanceTrip.findById(id);
    if (!trip) {
      throw ApiError.notFound('Emergency trip not found.', 'TRIP_NOT_FOUND');
    }

    // Ownership check
    if (trip.driverId.toString() !== req.user._id.toString() && req.user.role !== 'ADMIN') {
      throw ApiError.forbidden(
        'Access denied. You can only end your own emergency trips.',
        'FORBIDDEN'
      );
    }

    // Conflict if already completed
    if (trip.status === 'COMPLETED') {
      throw new ApiError(
        409,
        'This emergency trip is already completed.',
        'TRIP_ALREADY_COMPLETED',
        {
          endedAt: trip.endedAt,
          endReason: trip.endReason,
        }
      );
    }

    if (trip.status !== 'ACTIVE') {
      throw ApiError.conflict(`Cannot end a trip with status ${trip.status}.`, 'INVALID_STATE_TRANSITION');
    }

    // Reason validation
    const rawReason = req.body?.reason ? String(req.body.reason).toUpperCase().trim() : 'ARRIVED';
    const validReasons = ['ARRIVED', 'CANCELLED', 'OTHER'];
    const endReason = validReasons.includes(rawReason) ? rawReason : 'ARRIVED';

    const endedAt = new Date();

    trip.status = 'COMPLETED';
    trip.endedAt = endedAt;
    trip.endReason = endReason;

    await trip.save();

    // Asynchronously dispatch trip completion clear message and stop intervals (Non-blocking)
    handleTripEnded(trip._id).catch((endErr) => {
      console.warn('[Alert Warning] Trip end alert handling error:', endErr.message);
    });

    return ApiResponse.ok(
      {
        trip: trip.toJSON(),
      },
      'Emergency trip ended successfully.'
    ).send(res);
  })
);

export default router;

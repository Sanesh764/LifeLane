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
router.post('/', authenticate, requireActiveDriver, async (req, res, next) => {
  try {
    if (!isDbConnected()) {
      return res.status(503).json({
        error: {
          code: 'DATABASE_UNAVAILABLE',
          message: 'Database service is temporarily unavailable.',
        },
      });
    }

    const driverId = req.user._id;

    // Check if driver already has an active trip (One Active Trip rule)
    const existingActiveTrip = await AmbulanceTrip.findOne({
      driverId,
      status: 'ACTIVE',
    });

    if (existingActiveTrip) {
      return res.status(409).json({
        error: {
          code: 'ACTIVE_TRIP_EXISTS',
          message:
            'Driver already has an active emergency trip. Complete the existing trip before starting a new one.',
          details: {
            activeTripId: existingActiveTrip._id.toString(),
          },
        },
      });
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
      return res.status(400).json({
        error: {
          code: 'INVALID_REQUEST',
          message: 'destination.label is required and must be a non-empty string.',
        },
      });
    }

    // Validate Destination Coordinates
    const destLocInput = destination.location || destination.coordinates || destination;
    const parsedDest = parseCoordinates(destLocInput, 'destination');
    if (parsedDest.error) {
      return res.status(400).json({
        error: {
          code: 'INVALID_COORDINATES',
          message: parsedDest.error,
        },
      });
    }

    // Validate Initial Location / Origin Coordinates
    const originInput = initialLocation || origin || req.body;
    const parsedOrigin = parseCoordinates(originInput, 'initialLocation');
    if (parsedOrigin.error) {
      return res.status(400).json({
        error: {
          code: 'INVALID_COORDINATES',
          message: parsedOrigin.error,
        },
      });
    }

    // Validate Accuracy if supplied
    let accuracy = null;
    const rawAcc = locationAccuracyMeters !== undefined ? locationAccuracyMeters : req.body.accuracy;
    if (rawAcc !== undefined && rawAcc !== null) {
      const numAcc = Number(rawAcc);
      if (!Number.isFinite(numAcc) || numAcc < 0) {
        return res.status(400).json({
          error: {
            code: 'INVALID_ACCURACY',
            message: 'Location accuracy must be a non-negative finite number.',
          },
        });
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
        return res.status(409).json({
          error: {
            code: 'ACTIVE_TRIP_EXISTS',
            message: 'An active trip is already recorded for this driver.',
          },
        });
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

    // Asynchronously dispatch proximity alerts & start refresh interval
    dispatchAlertsForTrip(trip._id, parsedOrigin.coordinates).catch((alertErr) => {
      console.warn('[Alert Warning] Initial proximity dispatch error:', alertErr.message);
    });
    startTripAlertInterval(trip._id);

    res.status(201).json({
      data: {
        trip: trip.toJSON(),
        route: {
          status: 'UNAVAILABLE',
          reason: 'ROUTING_PROVIDER_PENDING',
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/trips/current & GET /api/v1/trips/active
 * Retrieve the current active trip for the authenticated driver
 */
const handleGetActiveTrip = async (req, res, next) => {
  try {
    if (!isDbConnected()) {
      return res.status(503).json({
        error: {
          code: 'DATABASE_UNAVAILABLE',
          message: 'Database service is temporarily unavailable.',
        },
      });
    }

    const trip = await AmbulanceTrip.findOne({
      driverId: req.user._id,
      status: 'ACTIVE',
    });

    if (!trip) {
      return res.status(200).json({
        data: null,
      });
    }

    res.status(200).json({
      data: {
        trip: trip.toJSON(),
      },
    });
  } catch (err) {
    next(err);
  }
};

router.get('/current', authenticate, requireActiveDriver, handleGetActiveTrip);
router.get('/active', authenticate, requireActiveDriver, handleGetActiveTrip);

/**
 * GET /api/v1/trips/:id
 * Retrieve details for a specific trip (Ownership enforced)
 */
router.get('/:id', authenticate, requireActiveDriver, async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        error: {
          code: 'INVALID_ID',
          message: 'Invalid trip ID format.',
        },
      });
    }

    const trip = await AmbulanceTrip.findById(id);
    if (!trip) {
      return res.status(404).json({
        error: {
          code: 'TRIP_NOT_FOUND',
          message: 'Emergency trip not found.',
        },
      });
    }

    // Ownership Check
    const isOwner = trip.driverId.toString() === req.user._id.toString();
    const isAdmin = req.user.role === 'ADMIN';
    if (!isOwner && !isAdmin) {
      return res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'Access denied. You do not own this emergency trip.',
        },
      });
    }

    res.status(200).json({
      data: {
        trip: trip.toJSON(),
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST & PATCH /api/v1/trips/:id/location
 * Submit live GPS location update for an active trip
 */
const handleLocationUpdate = async (req, res, next) => {
  try {
    if (!isDbConnected()) {
      return res.status(503).json({
        error: {
          code: 'DATABASE_UNAVAILABLE',
          message: 'Database service is temporarily unavailable.',
        },
      });
    }

    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        error: {
          code: 'INVALID_ID',
          message: 'Invalid trip ID format.',
        },
      });
    }

    const trip = await AmbulanceTrip.findById(id);
    if (!trip) {
      return res.status(404).json({
        error: {
          code: 'TRIP_NOT_FOUND',
          message: 'Emergency trip not found.',
        },
      });
    }

    // Ownership Enforcement
    if (trip.driverId.toString() !== req.user._id.toString() && req.user.role !== 'ADMIN') {
      return res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'Access denied. You can only update locations for your own trips.',
        },
      });
    }

    // Active Status Enforcement
    if (trip.status !== 'ACTIVE') {
      return res.status(409).json({
        error: {
          code: 'TRIP_NOT_ACTIVE',
          message: `Location updates are only accepted for ACTIVE trips. This trip is ${trip.status}.`,
        },
      });
    }

    // Coordinate Parsing & Validation
    const locationInput = req.body?.location || req.body?.coordinates || req.body;
    const parsed = parseCoordinates(locationInput, 'location');
    if (parsed.error) {
      return res.status(400).json({
        error: {
          code: 'INVALID_COORDINATES',
          message: parsed.error,
        },
      });
    }

    // Validate Heading (0 <= heading <= 360)
    let heading = null;
    const rawHeading = req.body?.headingDegrees !== undefined ? req.body.headingDegrees : req.body?.heading;
    if (rawHeading !== undefined && rawHeading !== null) {
      const numHeading = Number(rawHeading);
      if (!Number.isFinite(numHeading) || numHeading < 0 || numHeading > 360) {
        return res.status(400).json({
          error: {
            code: 'INVALID_HEADING',
            message: 'Heading must be a number between 0 and 360 degrees.',
          },
        });
      }
      heading = numHeading === 360 ? 0 : numHeading;
    }

    // Validate Speed
    let speed = null;
    const rawSpeed = req.body?.speedMetersPerSecond !== undefined ? req.body.speedMetersPerSecond : req.body?.speed;
    if (rawSpeed !== undefined && rawSpeed !== null) {
      const numSpeed = Number(rawSpeed);
      if (!Number.isFinite(numSpeed) || numSpeed < 0) {
        return res.status(400).json({
          error: {
            code: 'INVALID_SPEED',
            message: 'Speed must be a non-negative number.',
          },
        });
      }
      speed = numSpeed;
    }

    // Validate Accuracy
    let accuracy = null;
    const rawAccuracy = req.body?.accuracyMeters !== undefined ? req.body.accuracyMeters : req.body?.accuracy;
    if (rawAccuracy !== undefined && rawAccuracy !== null) {
      const numAccuracy = Number(rawAccuracy);
      if (!Number.isFinite(numAccuracy) || numAccuracy < 0) {
        return res.status(400).json({
          error: {
            code: 'INVALID_ACCURACY',
            message: 'Accuracy must be a non-negative number.',
          },
        });
      }
      accuracy = numAccuracy;
    }

    // Validate Client Timestamp
    let capturedAtDate = null;
    const rawCapturedAt = req.body?.capturedAt || req.body?.timestamp;
    if (rawCapturedAt) {
      const parsedDate = new Date(rawCapturedAt);
      if (Number.isNaN(parsedDate.getTime())) {
        return res.status(400).json({
          error: {
            code: 'INVALID_TIMESTAMP',
            message: 'capturedAt must be a valid ISO 8601 timestamp.',
          },
        });
      }

      // Check future timestamp (allow 60s clock drift tolerance)
      if (parsedDate.getTime() > Date.now() + 60000) {
        return res.status(400).json({
          error: {
            code: 'INVALID_TIMESTAMP',
            message: 'Location capture timestamp cannot be in the future.',
          },
        });
      }

      // Check out-of-order / stale update
      if (
        trip.lastLocationCapturedAt &&
        parsedDate.getTime() < trip.lastLocationCapturedAt.getTime()
      ) {
        return res.status(422).json({
          error: {
            code: 'STALE_LOCATION_UPDATE',
            message: 'Location update has an earlier capture timestamp than the latest accepted update.',
          },
        });
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

    // Asynchronously dispatch proximity alerts on ambulance movement
    dispatchAlertsForTrip(trip._id, parsed.coordinates).catch((alertErr) => {
      console.warn('[Alert Warning] Proximity location refresh error:', alertErr.message);
    });

    res.status(200).json({
      data: {
        accepted: true,
        tripId: trip._id.toString(),
        currentLocation: trip.currentLocation,
        locationAccuracyMeters: trip.locationAccuracyMeters,
        headingDegrees: trip.headingDegrees,
        speedMetersPerSecond: trip.speedMetersPerSecond,
        lastLocationCapturedAt: trip.lastLocationCapturedAt,
        receivedAt: receivedAt.toISOString(),
      },
    });
  } catch (err) {
    next(err);
  }
};

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
router.post('/:id/end', authenticate, requireActiveDriver, async (req, res, next) => {
  try {
    if (!isDbConnected()) {
      return res.status(503).json({
        error: {
          code: 'DATABASE_UNAVAILABLE',
          message: 'Database service is temporarily unavailable.',
        },
      });
    }

    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        error: {
          code: 'INVALID_ID',
          message: 'Invalid trip ID format.',
        },
      });
    }

    const trip = await AmbulanceTrip.findById(id);
    if (!trip) {
      return res.status(404).json({
        error: {
          code: 'TRIP_NOT_FOUND',
          message: 'Emergency trip not found.',
        },
      });
    }

    // Ownership check
    if (trip.driverId.toString() !== req.user._id.toString() && req.user.role !== 'ADMIN') {
      return res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'Access denied. You can only end your own emergency trips.',
        },
      });
    }

    // Conflict if already completed
    if (trip.status === 'COMPLETED') {
      return res.status(409).json({
        error: {
          code: 'TRIP_ALREADY_COMPLETED',
          message: 'This emergency trip is already completed.',
          details: {
            endedAt: trip.endedAt,
            endReason: trip.endReason,
          },
        },
      });
    }

    if (trip.status !== 'ACTIVE') {
      return res.status(409).json({
        error: {
          code: 'INVALID_STATE_TRANSITION',
          message: `Cannot end a trip with status ${trip.status}.`,
        },
      });
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

    // Asynchronously dispatch trip completion clear message and stop intervals
    handleTripEnded(trip._id).catch((endErr) => {
      console.warn('[Alert Warning] Trip end alert handling error:', endErr.message);
    });

    res.status(200).json({
      data: {
        trip: trip.toJSON(),
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;

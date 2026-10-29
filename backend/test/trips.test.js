import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { app } from '../server.js';
import { connectDB, disconnectDB } from '../config/db.js';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { AmbulanceTrip } from '../models/AmbulanceTrip.js';
import { TripLocationHistory } from '../models/TripLocationHistory.js';
import { locationUpdateRateLimiter } from '../middlewares/rateLimiter.js';

describe('Phase B3: Emergency Trip Management and GPS Location APIs', () => {
  let server;
  let baseUrl;

  let driver1;
  let driver1Token;

  let driver2;
  let driver2Token;

  let roadUser;
  let roadUserToken;

  let unverifiedDriver;
  let unverifiedToken;

  let disabledDriver;
  let disabledToken;

  let testTripId = null;

  before(async () => {
    await connectDB();

    await new Promise((resolve) => {
      server = app.listen(0, () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });

    // Create isolated test driver 1
    driver1 = await User.findOneAndUpdate(
      { email: 'b3_driver1@amburoute.test' },
      {
        name: 'Unit B3 Driver One',
        email: 'b3_driver1@amburoute.test',
        passwordHash: '$2a$10$abcdefghijklmnopqrstuv',
        role: 'AMBULANCE_DRIVER',
        status: 'active',
        driverVerificationStatus: 'VERIFIED',
        assignedUnit: {
          callSign: 'Patna Unit 108 — Beta',
          vehicleNumber: 'BR-01-EA-108B',
          hospitalBase: 'PMCH Emergency Center',
        },
      },
      { upsert: true, new: true }
    );

    driver1Token = jwt.sign(
      { sub: driver1._id.toString(), email: driver1.email, role: driver1.role, status: driver1.status },
      env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    // Create isolated test driver 2
    driver2 = await User.findOneAndUpdate(
      { email: 'b3_driver2@amburoute.test' },
      {
        name: 'Unit B3 Driver Two',
        email: 'b3_driver2@amburoute.test',
        passwordHash: '$2a$10$abcdefghijklmnopqrstuv',
        role: 'AMBULANCE_DRIVER',
        status: 'active',
        driverVerificationStatus: 'VERIFIED',
        assignedUnit: {
          callSign: 'Patna Unit 108 — Gamma',
          vehicleNumber: 'BR-01-EA-108C',
          hospitalBase: 'AIIMS Patna Trauma Center',
        },
      },
      { upsert: true, new: true }
    );

    driver2Token = jwt.sign(
      { sub: driver2._id.toString(), email: driver2.email, role: driver2.role, status: driver2.status },
      env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    // Create road user
    roadUser = await User.findOneAndUpdate(
      { email: 'b3_roaduser@amburoute.test' },
      {
        name: 'Citizen Road User',
        email: 'b3_roaduser@amburoute.test',
        passwordHash: '$2a$10$abcdefghijklmnopqrstuv',
        role: 'ROAD_USER',
        status: 'active',
        driverVerificationStatus: 'NOT_REQUIRED',
      },
      { upsert: true, new: true }
    );

    roadUserToken = jwt.sign(
      { sub: roadUser._id.toString(), email: roadUser.email, role: roadUser.role, status: roadUser.status },
      env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    // Create unverified driver
    unverifiedDriver = await User.findOneAndUpdate(
      { email: 'b3_unverified@amburoute.test' },
      {
        name: 'Unverified Driver',
        email: 'b3_unverified@amburoute.test',
        passwordHash: '$2a$10$abcdefghijklmnopqrstuv',
        role: 'AMBULANCE_DRIVER',
        status: 'active',
        driverVerificationStatus: 'PENDING',
      },
      { upsert: true, new: true }
    );

    unverifiedToken = jwt.sign(
      { sub: unverifiedDriver._id.toString(), email: unverifiedDriver.email, role: unverifiedDriver.role, status: unverifiedDriver.status },
      env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    // Create disabled driver
    disabledDriver = await User.findOneAndUpdate(
      { email: 'b3_disabled@amburoute.test' },
      {
        name: 'Disabled Driver',
        email: 'b3_disabled@amburoute.test',
        passwordHash: '$2a$10$abcdefghijklmnopqrstuv',
        role: 'AMBULANCE_DRIVER',
        status: 'disabled',
        driverVerificationStatus: 'VERIFIED',
      },
      { upsert: true, new: true }
    );

    disabledToken = jwt.sign(
      { sub: disabledDriver._id.toString(), email: disabledDriver.email, role: disabledDriver.role, status: disabledDriver.status },
      env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    // Clean up any stale test trips from prior runs
    await AmbulanceTrip.deleteMany({ driverId: { $in: [driver1._id, driver2._id] } });
  });

  after(async () => {
    if (driver1) {
      await AmbulanceTrip.deleteMany({ driverId: { $in: [driver1._id, driver2._id] } });
      await TripLocationHistory.deleteMany({ driverId: { $in: [driver1._id, driver2._id] } });
      await User.deleteMany({
        email: {
          $in: [
            'b3_driver1@amburoute.test',
            'b3_driver2@amburoute.test',
            'b3_roaduser@amburoute.test',
            'b3_unverified@amburoute.test',
            'b3_disabled@amburoute.test',
          ],
        },
      });
    }

    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    await disconnectDB();
  });

  describe('1. Trip Creation Authentication & Authorization', () => {
    it('rejects unauthenticated trip creation with 401 UNAUTHORIZED', async () => {
      const res = await fetch(`${baseUrl}/api/v1/trips`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          destination: { label: 'PMCH', coordinates: [85.1376, 25.5941] },
          initialLocation: [85.14, 25.6],
        }),
      });
      assert.equal(res.status, 401);
      const json = await res.json();
      assert.equal(json.error.code, 'UNAUTHORIZED');
    });

    it('rejects trip creation from ROAD_USER with 403 FORBIDDEN', async () => {
      const res = await fetch(`${baseUrl}/api/v1/trips`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${roadUserToken}`,
        },
        body: JSON.stringify({
          destination: { label: 'PMCH', coordinates: [85.1376, 25.5941] },
          initialLocation: [85.14, 25.6],
        }),
      });
      assert.equal(res.status, 403);
      const json = await res.json();
      assert.equal(json.error.code, 'FORBIDDEN');
    });

    it('rejects trip creation from unverified driver with 403 DRIVER_NOT_VERIFIED', async () => {
      const res = await fetch(`${baseUrl}/api/v1/trips`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${unverifiedToken}`,
        },
        body: JSON.stringify({
          destination: { label: 'PMCH', coordinates: [85.1376, 25.5941] },
          initialLocation: [85.14, 25.6],
        }),
      });
      assert.equal(res.status, 403);
      const json = await res.json();
      assert.equal(json.error.code, 'DRIVER_NOT_VERIFIED');
    });

    it('rejects trip creation from disabled driver with 403 ACCOUNT_INACTIVE', async () => {
      const res = await fetch(`${baseUrl}/api/v1/trips`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${disabledToken}`,
        },
        body: JSON.stringify({
          destination: { label: 'PMCH', coordinates: [85.1376, 25.5941] },
          initialLocation: [85.14, 25.6],
        }),
      });
      assert.equal(res.status, 403);
      const json = await res.json();
      assert.equal(json.error.code, 'ACCOUNT_INACTIVE');
    });
  });

  describe('2. Start Emergency Trip Input Validation', () => {
    it('rejects trip creation when destination label is missing', async () => {
      const res = await fetch(`${baseUrl}/api/v1/trips`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${driver1Token}`,
        },
        body: JSON.stringify({
          destination: { coordinates: [85.1376, 25.5941] },
          initialLocation: [85.14, 25.6],
        }),
      });
      assert.equal(res.status, 400);
      const json = await res.json();
      assert.equal(json.error.code, 'INVALID_REQUEST');
    });

    it('rejects trip creation with invalid out-of-range coordinates', async () => {
      const res = await fetch(`${baseUrl}/api/v1/trips`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${driver1Token}`,
        },
        body: JSON.stringify({
          destination: { label: 'PMCH', coordinates: [195.0, 25.5941] }, // lng > 180
          initialLocation: [85.14, 25.6],
        }),
      });
      assert.equal(res.status, 400);
      const json = await res.json();
      assert.equal(json.error.code, 'INVALID_COORDINATES');
    });

    it('rejects trip creation with malformed coordinates (non-numbers)', async () => {
      const res = await fetch(`${baseUrl}/api/v1/trips`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${driver1Token}`,
        },
        body: JSON.stringify({
          destination: { label: 'PMCH', coordinates: ['invalid', 'point'] },
          initialLocation: [85.14, 25.6],
        }),
      });
      assert.equal(res.status, 400);
      const json = await res.json();
      assert.equal(json.error.code, 'INVALID_COORDINATES');
    });

    it('rejects trip creation with negative accuracy', async () => {
      const res = await fetch(`${baseUrl}/api/v1/trips`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${driver1Token}`,
        },
        body: JSON.stringify({
          destination: { label: 'PMCH', coordinates: [85.1376, 25.5941] },
          initialLocation: [85.14, 25.6],
          locationAccuracyMeters: -5,
        }),
      });
      assert.equal(res.status, 400);
      const json = await res.json();
      assert.equal(json.error.code, 'INVALID_ACCURACY');
    });
  });

  describe('3. Successful Trip Creation & Active Trip Retrieval', () => {
    it('creates an active emergency trip with trusted driver & assigned unit from token', async () => {
      const res = await fetch(`${baseUrl}/api/v1/trips`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${driver1Token}`,
        },
        body: JSON.stringify({
          destination: {
            label: 'PMCH Emergency Trauma Center',
            location: {
              type: 'Point',
              coordinates: [85.1585, 25.6206],
            },
          },
          initialLocation: {
            type: 'Point',
            coordinates: [85.1376, 25.5941],
          },
          locationAccuracyMeters: 8.5,
          // Attacker attempts to spoof driverId or unit in request body
          driverId: driver2._id.toString(),
          assignedUnit: { callSign: 'Hacked Unit' },
        }),
      });

      assert.equal(res.status, 201);
      const json = await res.json();
      assert.ok(json.data.trip);

      const trip = json.data.trip;
      assert.equal(trip.status, 'ACTIVE');
      // Verify trusted identity derived from req.user, NOT client body
      assert.equal(trip.driverId, driver1._id.toString());
      assert.equal(trip.assignedUnit.callSign, 'Patna Unit 108 — Beta');
      assert.equal(trip.assignedUnit.vehicleNumber, 'BR-01-EA-108B');
      assert.deepEqual(trip.origin.coordinates, [85.1376, 25.5941]);
      assert.deepEqual(trip.destination.location.coordinates, [85.1585, 25.6206]);
      assert.equal(trip.locationAccuracyMeters, 8.5);
      assert.equal(json.data.route.status, 'UNAVAILABLE');

      testTripId = trip.id;
    });

    it('enforces one-active-trip rule and rejects second active trip with 409 Conflict', async () => {
      const res = await fetch(`${baseUrl}/api/v1/trips`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${driver1Token}`,
        },
        body: JSON.stringify({
          destination: {
            label: 'AIIMS Patna',
            coordinates: [85.0444, 25.5583],
          },
          initialLocation: [85.14, 25.6],
        }),
      });

      assert.equal(res.status, 409);
      const json = await res.json();
      assert.equal(json.error.code, 'ACTIVE_TRIP_EXISTS');
      assert.ok(json.error.details.activeTripId);
    });

    it('GET /api/v1/trips/current retrieves the driver active trip', async () => {
      const res = await fetch(`${baseUrl}/api/v1/trips/current`, {
        headers: {
          Authorization: `Bearer ${driver1Token}`,
        },
      });

      assert.equal(res.status, 200);
      const json = await res.json();
      assert.ok(json.data.trip);
      assert.equal(json.data.trip.id, testTripId);
      assert.equal(json.data.trip.status, 'ACTIVE');
      assert.equal(json.data.trip.destination.label, 'PMCH Emergency Trauma Center');
    });

    it('GET /api/v1/trips/current returns data: null when driver has no active trip', async () => {
      const res = await fetch(`${baseUrl}/api/v1/trips/current`, {
        headers: {
          Authorization: `Bearer ${driver2Token}`, // driver 2 has no trip
        },
      });

      assert.equal(res.status, 200);
      const json = await res.json();
      assert.equal(json.data, null);
    });
  });

  describe('4. Cross-Driver Ownership & Protection', () => {
    it('Driver 2 cannot view Driver 1 trip details (403 FORBIDDEN)', async () => {
      const res = await fetch(`${baseUrl}/api/v1/trips/${testTripId}`, {
        headers: {
          Authorization: `Bearer ${driver2Token}`,
        },
      });

      assert.equal(res.status, 403);
      const json = await res.json();
      assert.equal(json.error.code, 'FORBIDDEN');
    });

    it('Driver 2 cannot update Driver 1 trip location (403 FORBIDDEN)', async () => {
      const res = await fetch(`${baseUrl}/api/v1/trips/${testTripId}/location`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${driver2Token}`,
        },
        body: JSON.stringify({
          latitude: 25.6,
          longitude: 85.14,
        }),
      });

      assert.equal(res.status, 403);
      const json = await res.json();
      assert.equal(json.error.code, 'FORBIDDEN');
    });

    it('Driver 2 cannot end Driver 1 trip (403 FORBIDDEN)', async () => {
      const res = await fetch(`${baseUrl}/api/v1/trips/${testTripId}/end`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${driver2Token}`,
        },
        body: JSON.stringify({
          reason: 'ARRIVED',
        }),
      });

      assert.equal(res.status, 403);
      const json = await res.json();
      assert.equal(json.error.code, 'FORBIDDEN');
    });
  });

  describe('5. GPS Location Telemetry Ingestion & Validation', () => {
    it('accepts valid GPS location update via POST', async () => {
      locationUpdateRateLimiter.reset();

      const captureTime = new Date().toISOString();
      const res = await fetch(`${baseUrl}/api/v1/trips/${testTripId}/location`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${driver1Token}`,
        },
        body: JSON.stringify({
          latitude: 25.602,
          longitude: 85.142,
          headingDegrees: 45,
          speedMetersPerSecond: 12.5,
          accuracyMeters: 6.0,
          capturedAt: captureTime,
        }),
      });

      assert.equal(res.status, 200);
      const json = await res.json();
      assert.equal(json.data.accepted, true);
      assert.deepEqual(json.data.currentLocation.coordinates, [85.142, 25.602]);
      assert.equal(json.data.headingDegrees, 45);
      assert.equal(json.data.speedMetersPerSecond, 12.5);
      assert.equal(json.data.locationAccuracyMeters, 6.0);
      assert.ok(json.data.receivedAt);

      // Verify trip document was updated
      const updatedTrip = await AmbulanceTrip.findById(testTripId);
      assert.deepEqual(updatedTrip.currentLocation.coordinates, [85.142, 25.602]);

      // Verify location history document was created
      const historyRecord = await TripLocationHistory.findOne({ tripId: testTripId }).sort({ receivedAt: -1 });
      assert.ok(historyRecord);
      assert.deepEqual(historyRecord.location.coordinates, [85.142, 25.602]);
      assert.equal(historyRecord.driverId.toString(), driver1._id.toString());
    });

    it('accepts location update via PATCH verb per API specification', async () => {
      const res = await fetch(`${baseUrl}/api/v1/trips/${testTripId}/location`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${driver1Token}`,
        },
        body: JSON.stringify({
          location: {
            type: 'Point',
            coordinates: [85.145, 25.605],
          },
        }),
      });

      assert.equal(res.status, 200);
      const json = await res.json();
      assert.equal(json.data.accepted, true);
      assert.deepEqual(json.data.currentLocation.coordinates, [85.145, 25.605]);
    });

    it('rejects location update with invalid heading (> 360 degrees)', async () => {
      const res = await fetch(`${baseUrl}/api/v1/trips/${testTripId}/location`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${driver1Token}`,
        },
        body: JSON.stringify({
          latitude: 25.602,
          longitude: 85.142,
          headingDegrees: 395, // invalid
        }),
      });

      assert.equal(res.status, 400);
      const json = await res.json();
      assert.equal(json.error.code, 'INVALID_HEADING');
    });

    it('rejects future-dated location timestamp (> 60s in future)', async () => {
      const futureDate = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minutes in future
      const res = await fetch(`${baseUrl}/api/v1/trips/${testTripId}/location`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${driver1Token}`,
        },
        body: JSON.stringify({
          latitude: 25.602,
          longitude: 85.142,
          capturedAt: futureDate,
        }),
      });

      assert.equal(res.status, 400);
      const json = await res.json();
      assert.equal(json.error.code, 'INVALID_TIMESTAMP');
    });

    it('rejects out-of-order stale location update (older than last accepted capturedAt)', async () => {
      // Send location with current timestamp
      const t1 = new Date();
      await fetch(`${baseUrl}/api/v1/trips/${testTripId}/location`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${driver1Token}`,
        },
        body: JSON.stringify({
          latitude: 25.603,
          longitude: 85.143,
          capturedAt: t1.toISOString(),
        }),
      });

      // Send location with timestamp 5 minutes prior to t1
      const staleTime = new Date(t1.getTime() - 5 * 60 * 1000).toISOString();
      const res = await fetch(`${baseUrl}/api/v1/trips/${testTripId}/location`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${driver1Token}`,
        },
        body: JSON.stringify({
          latitude: 25.601,
          longitude: 85.141,
          capturedAt: staleTime,
        }),
      });

      assert.equal(res.status, 422);
      const json = await res.json();
      assert.equal(json.error.code, 'STALE_LOCATION_UPDATE');
    });
  });

  describe('6. End Emergency Trip & Post-Completion Invariants', () => {
    it('successfully ends an active trip by its owner', async () => {
      const res = await fetch(`${baseUrl}/api/v1/trips/${testTripId}/end`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${driver1Token}`,
        },
        body: JSON.stringify({
          reason: 'ARRIVED',
        }),
      });

      assert.equal(res.status, 200);
      const json = await res.json();
      assert.equal(json.data.trip.status, 'COMPLETED');
      assert.equal(json.data.trip.endReason, 'ARRIVED');
      assert.ok(json.data.trip.endedAt);
    });

    it('rejects ending an already completed trip with 409 Conflict', async () => {
      const res = await fetch(`${baseUrl}/api/v1/trips/${testTripId}/end`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${driver1Token}`,
        },
        body: JSON.stringify({
          reason: 'ARRIVED',
        }),
      });

      assert.equal(res.status, 409);
      const json = await res.json();
      assert.equal(json.error.code, 'TRIP_ALREADY_COMPLETED');
    });

    it('rejects location updates on completed trips with 409 Conflict', async () => {
      const res = await fetch(`${baseUrl}/api/v1/trips/${testTripId}/location`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${driver1Token}`,
        },
        body: JSON.stringify({
          latitude: 25.61,
          longitude: 85.15,
        }),
      });

      assert.equal(res.status, 409);
      const json = await res.json();
      assert.equal(json.error.code, 'TRIP_NOT_ACTIVE');
    });

    it('driver can start a new trip after the previous one was ended', async () => {
      const res = await fetch(`${baseUrl}/api/v1/trips`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${driver1Token}`,
        },
        body: JSON.stringify({
          destination: {
            label: 'IGIMS Patna',
            coordinates: [85.0883, 25.6125],
          },
          initialLocation: [85.1585, 25.6206],
        }),
      });

      assert.equal(res.status, 201);
      const json = await res.json();
      assert.equal(json.data.trip.status, 'ACTIVE');

      // Clean up newly created trip
      await AmbulanceTrip.findByIdAndDelete(json.data.trip.id);
    });
  });
});

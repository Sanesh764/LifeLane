import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { app } from '../server.js';
import { env } from '../config/env.js';
import { connectDB, disconnectDB } from '../config/db.js';
import { User } from '../models/User.js';
import { PushSubscription, hashEndpoint } from '../models/PushSubscription.js';
import { AmbulanceTrip } from '../models/AmbulanceTrip.js';
import { AlertDispatch } from '../models/AlertDispatch.js';
import { dispatchAlertsForTrip } from '../services/notificationService.js';
import { setPushProvider, MockPushProvider } from '../services/pushProvider.js';
import dns from "dns";
dns.setServers(['1.1.1.1','8.8.8.8']);
describe('Phase 6.2: Global Emergency Push Notification Dispatch', () => {
  let server;
  let baseUrl;
  let driverUser;
  let driverToken;
  let sentNotifications = [];

  const mockPushProvider = {
    sendNotification: async (subscription, payload, options) => {
      sentNotifications.push({ subscription, payload, options });

      // Simulate expired endpoint on mock.push.test
      if (subscription.endpoint.includes('expired')) {
        const error = new Error('Push service returned HTTP 410 (unsubscribed / expired)');
        error.statusCode = 410;
        error.isExpired = true;
        throw error;
      }

      // Simulate generic server failure on mock.push.test
      if (subscription.endpoint.includes('fail')) {
        const error = new Error('Push service returned HTTP 500 (internal server error)');
        error.statusCode = 500;
        throw error;
      }

      return {
        statusCode: 201,
        headers: {},
        body: '',
      };
    },
  };

  before(async () => {
    await connectDB();

    await new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });

    // Clean test state
    await User.deleteMany({ email: { $regex: /@phase62\.test$/i } });
    await PushSubscription.deleteMany({ endpoint: { $regex: /phase62|mock\.push\.test/i } });
    await AmbulanceTrip.deleteMany({ 'assignedUnit.callSign': 'Phase 6.2 Unit' });
    await AlertDispatch.deleteMany({});

    // Seed Driver
    const hash = await User.hashPassword('DriverPass123!');
    driverUser = await User.create({
      name: 'Phase 6 Driver',
      email: 'driver@phase62.test',
      passwordHash: hash,
      role: 'AMBULANCE_DRIVER',
      status: 'active',
      driverVerificationStatus: 'VERIFIED',
      assignedUnit: {
        callSign: 'Phase 6.2 Unit',
        vehicleNumber: 'BR-01-P602',
        hospitalBase: 'Patna Medical College',
      },
    });

    driverToken = jwt.sign(
      { sub: driverUser._id.toString(), email: driverUser.email, role: driverUser.role, status: 'active' },
      env.JWT_SECRET,
      { expiresIn: 3600 }
    );

    // Mock push provider for deterministic assertions
    setPushProvider(mockPushProvider);
  });

  after(async () => {
    try {
      await User.deleteMany({ email: { $regex: /@phase62\.test$/i } });
      await PushSubscription.deleteMany({ endpoint: { $regex: /phase62|mock\.push\.test/i } });
      await AmbulanceTrip.deleteMany({ 'assignedUnit.callSign': 'Phase 6.2 Unit' });
      await AlertDispatch.deleteMany({});
    } catch {}

    setPushProvider(new MockPushProvider());
    await new Promise((resolve) => server.close(resolve));
    await disconnectDB();
  });

  describe('1. Global Broadcast Across Locations & Exclusion Rules', () => {
    let subPatna;
    let subDelhi;
    let subBangalore;
    let subDisabled;
    let subExpired;

    before(async () => {
      sentNotifications = [];
      await PushSubscription.deleteMany({});
      await AlertDispatch.deleteMany({});

      // Active subscriber in Patna (near ambulance)
      subPatna = await PushSubscription.create({
        endpoint: 'https://fcm.googleapis.com/fcm/send/phase62_patna',
        keys: { p256dh: 'patna_p256dh_key_test_123', auth: 'patna_auth_secret_test_123' },
        notificationConsent: true,
        locationConsent: true,
        location: { type: 'Point', coordinates: [85.1376, 25.5941] }, // Patna
        locationAccuracyMeters: 15,
        lastLocationCapturedAt: new Date(),
        status: 'ACTIVE',
      });

      // Active subscriber in Delhi (1,000+ km away - should receive alert in GLOBAL mode)
      subDelhi = await PushSubscription.create({
        endpoint: 'https://fcm.googleapis.com/fcm/send/phase62_delhi',
        keys: { p256dh: 'delhi_p256dh_key_test_123', auth: 'delhi_auth_secret_test_123' },
        notificationConsent: true,
        locationConsent: true,
        location: { type: 'Point', coordinates: [77.2090, 28.6139] }, // Delhi
        locationAccuracyMeters: 20,
        lastLocationCapturedAt: new Date(),
        status: 'ACTIVE',
      });

      // Active subscriber in Bangalore (2,000+ km away, without location coordinates)
      subBangalore = await PushSubscription.create({
        endpoint: 'https://fcm.googleapis.com/fcm/send/phase62_bangalore',
        keys: { p256dh: 'blr_p256dh_key_test_123', auth: 'blr_auth_secret_test_123' },
        notificationConsent: true,
        status: 'ACTIVE',
      });

      // Disabled subscriber (must NOT receive notification)
      subDisabled = await PushSubscription.create({
        endpoint: 'https://fcm.googleapis.com/fcm/send/phase62_disabled',
        keys: { p256dh: 'dis_p256dh_key_test_123', auth: 'dis_auth_secret_test_123' },
        notificationConsent: false,
        status: 'DISABLED',
      });

      // Expired subscriber (must NOT receive notification)
      subExpired = await PushSubscription.create({
        endpoint: 'https://fcm.googleapis.com/fcm/send/phase62_expired_initial',
        keys: { p256dh: 'exp_p256dh_key_test_123', auth: 'exp_auth_secret_test_123' },
        notificationConsent: true,
        status: 'EXPIRED',
      });
    });

    it('dispatches to all active subscriptions globally regardless of distance', async () => {
      // Ensure GLOBAL mode is active
      env.EMERGENCY_NOTIFICATION_MODE = 'GLOBAL';

      const trip = await AmbulanceTrip.create({
        driverId: driverUser._id,
        status: 'ACTIVE',
        assignedUnit: driverUser.assignedUnit,
        origin: { type: 'Point', coordinates: [85.1376, 25.5941] },
        currentLocation: { type: 'Point', coordinates: [85.1376, 25.5941] },
        destination: { label: 'PMCH Trauma Center', location: { type: 'Point', coordinates: [85.1500, 25.6100] } },
        startedAt: new Date(),
      });

      const result = await dispatchAlertsForTrip(trip._id, [85.1376, 25.5941], trip);

      assert.equal(result.dispatched >= 3, true);
      assert.equal(result.suppressed, 0);

      const notifiedEndpoints = sentNotifications.map((n) => n.subscription.endpoint);
      assert.ok(notifiedEndpoints.includes(subPatna.endpoint), 'Patna sub must be notified');
      assert.ok(notifiedEndpoints.includes(subDelhi.endpoint), 'Delhi sub must be notified globally');
      assert.ok(notifiedEndpoints.includes(subBangalore.endpoint), 'Bangalore sub must be notified globally');
      assert.ok(!notifiedEndpoints.includes(subDisabled.endpoint), 'Disabled sub must NOT be notified');
      assert.ok(!notifiedEndpoints.includes(subExpired.endpoint), 'Expired sub must NOT be notified');

      // Verify payload structure
      const sampleNotification = sentNotifications.find((n) => n.subscription.endpoint === subDelhi.endpoint);
      assert.equal(sampleNotification.payload.title, 'AmbuRoute Emergency Alert 🚑');
      assert.ok(sampleNotification.payload.body.includes('Please give way and keep the road clear'));
      assert.equal(sampleNotification.payload.data.missionId, trip._id.toString());
      assert.equal(sampleNotification.payload.data.eventType, 'EMERGENCY_STARTED');
      assert.equal(sampleNotification.payload.data.ambulanceCallsign, 'Phase 6.2 Unit');
      assert.equal(sampleNotification.payload.data.destinationHospital, 'PMCH Trauma Center');
      assert.equal(sampleNotification.payload.data.mode, 'GLOBAL');
      assert.ok(sampleNotification.payload.data.timestamp);

      // Verify AlertDispatch database records
      const dispatches = await AlertDispatch.find({ tripId: trip._id });
      assert.ok(dispatches.length >= 3);
      assert.ok(dispatches.every((d) => d.status === 'ACCEPTED'));
    });

    it('prevents duplicate notifications on repeated trip dispatch calls', async () => {
      const activeTrip = await AmbulanceTrip.findOne({ 'assignedUnit.callSign': 'Phase 6.2 Unit', status: 'ACTIVE' });
      assert.ok(activeTrip);

      const beforeCount = sentNotifications.length;

      // Second dispatch for the exact same trip
      const dupResult = await dispatchAlertsForTrip(activeTrip._id, [85.1376, 25.5941], activeTrip);

      assert.equal(dupResult.dispatched, 0, 'No new notifications should be sent for already notified subscribers');
      assert.equal(dupResult.suppressed >= 3, true, 'Subscribers must be recorded as suppressed');
      assert.equal(sentNotifications.length, beforeCount, 'Sent notification array must not have increased');
    });
  });

  describe('2. Multiple Devices for Single User', () => {
    let multiUser;

    before(async () => {
      sentNotifications = [];
      multiUser = await User.create({
        name: 'Multi Device User',
        email: 'multidevice@phase62.test',
        passwordHash: 'dummyHash123',
        role: 'PUBLIC_USER',
        status: 'active',
      });

      // Device 1: Laptop
      await PushSubscription.create({
        endpoint: 'https://fcm.googleapis.com/fcm/send/phase62_multi_laptop',
        keys: { p256dh: 'laptop_p256dh_123', auth: 'laptop_auth_123' },
        notificationConsent: true,
        userId: multiUser._id,
        deviceType: 'desktop',
        status: 'ACTIVE',
      });

      // Device 2: Phone
      await PushSubscription.create({
        endpoint: 'https://fcm.googleapis.com/fcm/send/phase62_multi_phone',
        keys: { p256dh: 'phone_p256dh_123', auth: 'phone_auth_123' },
        notificationConsent: true,
        userId: multiUser._id,
        deviceType: 'mobile',
        status: 'ACTIVE',
      });
    });

    it('notifies all active registered devices belonging to the user', async () => {
      await AmbulanceTrip.updateMany({ driverId: driverUser._id, status: 'ACTIVE' }, { status: 'COMPLETED' });

      const newTrip = await AmbulanceTrip.create({
        driverId: driverUser._id,
        status: 'ACTIVE',
        assignedUnit: driverUser.assignedUnit,
        origin: { type: 'Point', coordinates: [85.1376, 25.5941] },
        currentLocation: { type: 'Point', coordinates: [85.1376, 25.5941] },
        destination: { label: 'AIIMS Patna', location: { type: 'Point', coordinates: [85.1400, 25.6000] } },
        startedAt: new Date(),
      });

      await dispatchAlertsForTrip(newTrip._id, [85.1376, 25.5941], newTrip);

      const endpoints = sentNotifications.map((n) => n.subscription.endpoint);
      assert.ok(endpoints.includes('https://fcm.googleapis.com/fcm/send/phase62_multi_laptop'));
      assert.ok(endpoints.includes('https://fcm.googleapis.com/fcm/send/phase62_multi_phone'));
    });
  });

  describe('3. HTTP 410 Expired Subscription Pruning & Failure Resilience', () => {
    let expiredSub;
    let failingSub;

    before(async () => {
      await PushSubscription.deleteMany({ endpoint: { $regex: /phase62_expired|phase62_fail/i } });

      expiredSub = await PushSubscription.create({
        endpoint: 'https://mock.push.test/phase62_expired',
        keys: { p256dh: 'key_exp', auth: 'auth_exp' },
        notificationConsent: true,
        status: 'ACTIVE',
      });

      failingSub = await PushSubscription.create({
        endpoint: 'https://mock.push.test/phase62_fail',
        keys: { p256dh: 'key_fail', auth: 'auth_fail' },
        notificationConsent: true,
        status: 'ACTIVE',
      });
    });

    it('marks subscription as EXPIRED when provider returns HTTP 410', async () => {
      await AmbulanceTrip.updateMany({ driverId: driverUser._id, status: 'ACTIVE' }, { status: 'COMPLETED' });

      const trip = await AmbulanceTrip.create({
        driverId: driverUser._id,
        status: 'ACTIVE',
        assignedUnit: driverUser.assignedUnit,
        origin: { type: 'Point', coordinates: [85.1376, 25.5941] },
        currentLocation: { type: 'Point', coordinates: [85.1376, 25.5941] },
        destination: { label: 'Emergency Center', location: { type: 'Point', coordinates: [85.1400, 25.6000] } },
        startedAt: new Date(),
      });

      await dispatchAlertsForTrip(trip._id, [85.1376, 25.5941], trip);

      // Verify expired sub status updated in MongoDB
      const updatedExpiredSub = await PushSubscription.findById(expiredSub._id);
      assert.equal(updatedExpiredSub.status, 'EXPIRED');
      assert.equal(updatedExpiredSub.notificationConsent, false);

      const dispatchRecord = await AlertDispatch.findOne({
        tripId: trip._id,
        subscriptionId: expiredSub._id,
      });
      assert.ok(dispatchRecord);
      assert.equal(dispatchRecord.status, 'EXPIRED');
    });

    it('push delivery failures never cancel or block emergency trip creation', async () => {
      // Clean previous active trip for driver
      await AmbulanceTrip.updateMany({ driverId: driverUser._id, status: 'ACTIVE' }, { status: 'COMPLETED' });

      // Start trip via HTTP endpoint POST /api/v1/trips
      const res = await fetch(`${baseUrl}/api/v1/trips`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${driverToken}`,
        },
        body: JSON.stringify({
          destination: {
            label: 'IGIMS Emergency Hospital',
            location: { coordinates: [85.1200, 25.6200] },
          },
          initialLocation: {
            coordinates: [85.1000, 25.6000],
          },
        }),
      });

      // Must succeed with 201 Created despite push mock having failing & expired subscribers
      assert.equal(res.status, 201);
      const json = await res.json();
      assert.ok(json.data.trip);
      assert.equal(json.data.trip.status, 'ACTIVE');
      assert.equal(json.data.trip.destination.label, 'IGIMS Emergency Hospital');
    });
  });

  describe('4. Proximity Mode Preservation', () => {
    it('restricts delivery to nearby subscribers when EMERGENCY_NOTIFICATION_MODE=PROXIMITY', async () => {
      env.EMERGENCY_NOTIFICATION_MODE = 'PROXIMITY';
      env.NOTIFICATION_DEMO_BROADCAST_ALL = false;

      // Clean active trip
      await AmbulanceTrip.updateMany({ driverId: driverUser._id, status: 'ACTIVE' }, { status: 'COMPLETED' });

      sentNotifications = [];

      const trip = await AmbulanceTrip.create({
        driverId: driverUser._id,
        status: 'ACTIVE',
        assignedUnit: driverUser.assignedUnit,
        origin: { type: 'Point', coordinates: [85.1376, 25.5941] }, // Patna
        currentLocation: { type: 'Point', coordinates: [85.1376, 25.5941] },
        destination: { label: 'Patna Hospital', location: { type: 'Point', coordinates: [85.1400, 25.6000] } },
        startedAt: new Date(),
      });

      // Clear lastNotifiedTripId for Patna and Delhi subs
      await PushSubscription.updateMany(
        { endpoint: { $in: ['https://fcm.googleapis.com/fcm/send/phase62_patna', 'https://fcm.googleapis.com/fcm/send/phase62_delhi'] } },
        { $set: { lastNotifiedTripId: null, lastNotifiedAt: null } }
      );

      await dispatchAlertsForTrip(trip._id, [85.1376, 25.5941], trip);

      const endpoints = sentNotifications.map((n) => n.subscription.endpoint);
      assert.ok(endpoints.includes('https://fcm.googleapis.com/fcm/send/phase62_patna'), 'Patna sub must be notified');
      assert.ok(!endpoints.includes('https://fcm.googleapis.com/fcm/send/phase62_delhi'), 'Delhi sub must NOT be notified in proximity mode');

      // Restore GLOBAL mode for subsequent phases
      env.EMERGENCY_NOTIFICATION_MODE = 'GLOBAL';
    });
  });
});

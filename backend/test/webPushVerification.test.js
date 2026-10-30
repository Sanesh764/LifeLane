import { describe, it, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { app } from '../server.js';
import { connectDB, disconnectDB } from '../config/db.js';
import { env } from '../config/env.js';
import { PushSubscription, hashEndpoint } from '../models/PushSubscription.js';
import { AlertDispatch } from '../models/AlertDispatch.js';
import { AmbulanceTrip } from '../models/AmbulanceTrip.js';
import { User } from '../models/User.js';
import { MockPushProvider, setPushProvider } from '../services/pushProvider.js';
import { dispatchAlertsForTrip } from '../services/notificationService.js';

describe('Web Push Verification & Multi-Device Dispatch Testing', () => {
  let server;
  let baseUrl;
  let testDriver;
  let driverToken;
  let mockPush;

  const centerCoords = [86.1235, 24.9990]; // Lakhisarai reference
  const nearCoords = [86.1300, 25.0050];   // ~1 km away
  const outerCoords = [86.1550, 25.0150];  // ~3.5 km away
  const farCoords = [86.3500, 25.1500];    // ~25 km away

  before(async () => {
    mockPush = new MockPushProvider();
    setPushProvider(mockPush);

    await connectDB();

    await new Promise((resolve) => {
      server = app.listen(0, () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });

    // Create driver
    testDriver = await User.findOneAndUpdate(
      { email: 'webpush_test_driver@amburoute.test' },
      {
        name: 'WebPush Driver',
        email: 'webpush_test_driver@amburoute.test',
        passwordHash: '$2a$10$abcdefghijklmnopqrstuv',
        role: 'AMBULANCE_DRIVER',
        status: 'active',
        driverVerificationStatus: 'VERIFIED',
        assignedUnit: {
          callSign: 'Ambu Test 1',
          vehicleNumber: 'BR-TEST-01',
          hospitalBase: 'District Hospital',
        },
      },
      { upsert: true, returnDocument: 'after' }
    );

    driverToken = jwt.sign(
      {
        sub: testDriver._id.toString(),
        email: testDriver.email,
        role: testDriver.role,
        status: testDriver.status,
      },
      env.JWT_SECRET,
      { expiresIn: '1h' }
    );
  });

  beforeEach(async () => {
    mockPush.clear();
    await PushSubscription.deleteMany({});
    await AlertDispatch.deleteMany({});
    await AmbulanceTrip.deleteMany({ driverId: testDriver._id });
  });

  after(async () => {
    await PushSubscription.deleteMany({});
    await AlertDispatch.deleteMany({});
    await AmbulanceTrip.deleteMany({ driverId: testDriver._id });
    await User.deleteMany({ email: 'webpush_test_driver@amburoute.test' });
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    await disconnectDB();
  });

  describe('1. VAPID Key Stability', () => {
    it('returns consistent VAPID public key matching environment configuration', async () => {
      const res = await fetch(`${baseUrl}/api/v1/notifications/vapid-public-key`);
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.ok(body.data.publicKey);
      assert.equal(body.data.publicKey, env.VAPID.publicKey);
      assert.ok(body.data.publicKey.length >= 40);
    });
  });

  describe('2. Demo Broadcast Mode (NOTIFICATION_DEMO_BROADCAST_ALL = true)', () => {
    before(() => {
      env.NOTIFICATION_DEMO_BROADCAST_ALL = true;
    });

    after(() => {
      env.NOTIFICATION_DEMO_BROADCAST_ALL = false;
    });

    it('broadcasts to all active subscribed devices regardless of location consent or distance', async () => {
      // Device A: has notification consent, NO location consent, no coordinates
      await PushSubscription.create({
        endpoint: 'https://fcm.googleapis.com/fcm/send/demo-device-a',
        endpointHash: hashEndpoint('https://fcm.googleapis.com/fcm/send/demo-device-a'),
        keys: { p256dh: 'kA', auth: 'aA' },
        notificationConsent: true,
        locationConsent: false,
        status: 'ACTIVE',
      });

      // Device B: far away (25km), stale location (>10 hours)
      await PushSubscription.create({
        endpoint: 'https://updates.push.services.mozilla.com/wpush/v2/demo-device-b',
        endpointHash: hashEndpoint('https://updates.push.services.mozilla.com/wpush/v2/demo-device-b'),
        keys: { p256dh: 'kB', auth: 'aB' },
        notificationConsent: true,
        locationConsent: true,
        location: { type: 'Point', coordinates: farCoords },
        locationAccuracyMeters: 500, // inaccurate
        lastLocationCapturedAt: new Date(Date.now() - 36000 * 1000), // stale
        status: 'ACTIVE',
      });

      const tripId = new mongoose.Types.ObjectId();
      const result = await dispatchAlertsForTrip(tripId, centerCoords);

      assert.equal(result.dispatched, 2, 'Both devices must receive notifications in demo broadcast mode');
      assert.equal(mockPush.getSentNotifications().length, 2);

      const sentEndpoints = mockPush.getSentNotifications().map((n) => n.subscription.endpoint);
      assert.ok(sentEndpoints.includes('https://fcm.googleapis.com/fcm/send/demo-device-a'));
      assert.ok(sentEndpoints.includes('https://updates.push.services.mozilla.com/wpush/v2/demo-device-b'));
    });

    it('prevents duplicate notifications if trip dispatch is triggered twice for the same trip', async () => {
      await PushSubscription.create({
        endpoint: 'https://fcm.googleapis.com/fcm/send/demo-device-dedup',
        endpointHash: hashEndpoint('https://fcm.googleapis.com/fcm/send/demo-device-dedup'),
        keys: { p256dh: 'kD', auth: 'aD' },
        notificationConsent: true,
        status: 'ACTIVE',
      });

      const tripId = new mongoose.Types.ObjectId();
      // First dispatch
      const res1 = await dispatchAlertsForTrip(tripId, centerCoords);
      assert.equal(res1.dispatched, 1);

      // Re-trigger dispatch for the same trip
      const res2 = await dispatchAlertsForTrip(tripId, centerCoords);
      assert.equal(res2.dispatched, 0, 'Must not duplicate alert on repeat trip-start event');
      assert.equal(res2.suppressed, 1, 'Duplicate must be suppressed');
      assert.equal(mockPush.getSentNotifications().length, 1);
    });

    it('one failed subscription does not prevent other valid subscriptions from receiving alerts', async () => {
      // Device 1: expired endpoint that returns 410 Gone
      await PushSubscription.create({
        endpoint: 'https://fcm.googleapis.com/fcm/send/demo-device-expired',
        endpointHash: hashEndpoint('https://fcm.googleapis.com/fcm/send/demo-device-expired'),
        keys: { p256dh: 'kE', auth: 'aE' },
        notificationConsent: true,
        status: 'ACTIVE',
      });
      mockPush.setFailNext((sub) => {
        if (sub.endpoint.includes('demo-device-expired')) {
          return { statusCode: 410, message: 'Subscription has expired' };
        }
        return null;
      });

      // Device 2: healthy subscriber
      await PushSubscription.create({
        endpoint: 'https://fcm.googleapis.com/fcm/send/demo-device-healthy',
        endpointHash: hashEndpoint('https://fcm.googleapis.com/fcm/send/demo-device-healthy'),
        keys: { p256dh: 'kH', auth: 'aH' },
        notificationConsent: true,
        status: 'ACTIVE',
      });

      const tripId = new mongoose.Types.ObjectId();
      const res = await dispatchAlertsForTrip(tripId, centerCoords);

      assert.equal(res.dispatched, 1, 'Healthy device must receive notification');
      assert.equal(res.failed, 1, 'Expired device must be recorded as failed');

      // Verify expired device was marked EXPIRED
      const expiredSub = await PushSubscription.findOne({
        endpointHash: hashEndpoint('https://fcm.googleapis.com/fcm/send/demo-device-expired'),
      });
      assert.equal(expiredSub.status, 'EXPIRED');
    });
  });

  describe('3. Real Proximity Mode (NOTIFICATION_DEMO_BROADCAST_ALL = false)', () => {
    before(() => {
      env.NOTIFICATION_DEMO_BROADCAST_ALL = false;
    });

    it('strictly filters by location consent, freshness, and proximity radius', async () => {
      const now = new Date();

      // Device 1: Near (<2km) with valid location consent and fresh GPS -> ELIGIBLE
      await PushSubscription.create({
        endpoint: 'https://fcm.googleapis.com/fcm/send/prox-near-user',
        endpointHash: hashEndpoint('https://fcm.googleapis.com/fcm/send/prox-near-user'),
        keys: { p256dh: 'k1', auth: 'a1' },
        notificationConsent: true,
        locationConsent: true,
        location: { type: 'Point', coordinates: nearCoords },
        locationAccuracyMeters: 15,
        lastLocationCapturedAt: now,
        status: 'ACTIVE',
      });

      // Device 2: Outer (3.5km) with valid location consent and fresh GPS -> ELIGIBLE
      await PushSubscription.create({
        endpoint: 'https://fcm.googleapis.com/fcm/send/prox-outer-user',
        endpointHash: hashEndpoint('https://fcm.googleapis.com/fcm/send/prox-outer-user'),
        keys: { p256dh: 'k2', auth: 'a2' },
        notificationConsent: true,
        locationConsent: true,
        location: { type: 'Point', coordinates: outerCoords },
        locationAccuracyMeters: 25,
        lastLocationCapturedAt: now,
        status: 'ACTIVE',
      });

      // Device 3: Far (25km) -> INELIGIBLE (outside 5km)
      await PushSubscription.create({
        endpoint: 'https://fcm.googleapis.com/fcm/send/prox-far-user',
        endpointHash: hashEndpoint('https://fcm.googleapis.com/fcm/send/prox-far-user'),
        keys: { p256dh: 'k3', auth: 'a3' },
        notificationConsent: true,
        locationConsent: true,
        location: { type: 'Point', coordinates: farCoords },
        locationAccuracyMeters: 15,
        lastLocationCapturedAt: now,
        status: 'ACTIVE',
      });

      // Device 4: Near (<2km) but NO location consent -> INELIGIBLE
      await PushSubscription.create({
        endpoint: 'https://fcm.googleapis.com/fcm/send/prox-no-consent',
        endpointHash: hashEndpoint('https://fcm.googleapis.com/fcm/send/prox-no-consent'),
        keys: { p256dh: 'k4', auth: 'a4' },
        notificationConsent: true,
        locationConsent: false,
        location: { type: 'Point', coordinates: nearCoords },
        locationAccuracyMeters: 15,
        lastLocationCapturedAt: now,
        status: 'ACTIVE',
      });

      // Device 5: Near (<2km) but stale coordinates (>90s) -> INELIGIBLE
      await PushSubscription.create({
        endpoint: 'https://fcm.googleapis.com/fcm/send/prox-stale-user',
        endpointHash: hashEndpoint('https://fcm.googleapis.com/fcm/send/prox-stale-user'),
        keys: { p256dh: 'k5', auth: 'a5' },
        notificationConsent: true,
        locationConsent: true,
        location: { type: 'Point', coordinates: nearCoords },
        locationAccuracyMeters: 15,
        lastLocationCapturedAt: new Date(Date.now() - 120 * 1000), // 120s old (> 90s max age)
        status: 'ACTIVE',
      });

      const tripId = new mongoose.Types.ObjectId();
      const res = await dispatchAlertsForTrip(tripId, centerCoords);

      assert.equal(res.dispatched, 2, 'Only the 2 fresh, consented, nearby subscribers must be notified');
      const sent = mockPush.getSentNotifications();
      assert.equal(sent.length, 2);

      const nearNotif = sent.find((n) => n.subscription.endpoint.includes('prox-near-user'));
      const outerNotif = sent.find((n) => n.subscription.endpoint.includes('prox-outer-user'));
      assert.ok(nearNotif);
      assert.ok(outerNotif);
      assert.equal(nearNotif.payload.data.tier, 'NEAR');
      assert.equal(outerNotif.payload.data.tier, 'OUTER');
    });
  });
});

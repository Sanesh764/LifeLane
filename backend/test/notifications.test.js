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
import { getPushProvider, MockPushProvider, setPushProvider } from '../services/pushProvider.js';
import {
  findEligibleSubscribers,
  dispatchAlertsForTrip,
  handleTripEnded,
  calculateDistanceMeters,
  stopAllTripAlertIntervals,
} from '../services/notificationService.js';
import { validatePushEndpoint } from '../routers/notifications.js';

describe('Phase B4: Emergency Alert & Web Push Notification Engine', () => {
  let server;
  let baseUrl;
  let testDriver;
  let driverToken;
  let mockPush;

  // Reference coordinates: Patna PMCH Trauma Center [lng, lat]
  const patnaCenter = [85.1585, 25.6207];
  // 1 km away (Near tier: < 2km)
  const patnaNear = [85.163, 25.623];
  // 3.5 km away (Outer tier: 2km - 5km)
  const patnaOuter = [85.19, 25.63];
  // 10 km away (Outside radius: > 5km)
  const patnaFar = [85.26, 25.64];

  before(async () => {
    // Ensure mock push provider is active
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

    // Seed verified active test driver
    testDriver = await User.findOneAndUpdate(
      { email: 'b4_driver@amburoute.test' },
      {
        name: 'B4 Test Driver',
        email: 'b4_driver@amburoute.test',
        passwordHash: '$2a$10$abcdefghijklmnopqrstuv',
        role: 'AMBULANCE_DRIVER',
        status: 'active',
        driverVerificationStatus: 'VERIFIED',
        assignedUnit: {
          callSign: 'Ambu B4',
          vehicleNumber: 'BR-01-B4-108',
          hospitalBase: 'PMCH Patna',
        },
      },
      { upsert: true, new: true }
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
    stopAllTripAlertIntervals();
    await PushSubscription.deleteMany({});
    await AlertDispatch.deleteMany({});
    await AmbulanceTrip.deleteMany({ driverId: testDriver._id });
    await User.deleteMany({ email: 'b4_driver@amburoute.test' });
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    await disconnectDB();
  });

  // 1. Subscription Security & SSRF Protection
  describe('1. Push Endpoint Validation & SSRF Protection', () => {
    it('rejects endpoints missing https protocol', () => {
      const res = validatePushEndpoint('http://fcm.googleapis.com/fcm/send/sub-1');
      assert.equal(res.valid, false);
      assert.match(res.message, /HTTPS/);
    });

    it('rejects localhost and loopback targets (SSRF protection)', () => {
      const res1 = validatePushEndpoint('https://localhost:8080/push');
      assert.equal(res1.valid, false);
      assert.match(res1.message, /SSRF/);

      const res2 = validatePushEndpoint('https://127.0.0.1:443/push');
      assert.equal(res2.valid, false);
      assert.match(res2.message, /SSRF/);
    });

    it('rejects private IPv4 ranges (10.x, 192.168.x, 169.254.x, 172.16.x)', () => {
      const targets = [
        'https://10.0.0.1/notify',
        'https://192.168.1.100/notify',
        'https://169.254.169.254/latest/meta-data',
        'https://172.16.0.5/push',
      ];
      for (const target of targets) {
        const res = validatePushEndpoint(target);
        assert.equal(res.valid, false);
        assert.match(res.message, /SSRF/);
      }
    });

    it('rejects arbitrary untrusted external hostnames', () => {
      const res = validatePushEndpoint('https://attacker.evil.com/leak');
      assert.equal(res.valid, false);
      assert.match(res.message, /recognized web push/);
    });

    it('accepts legitimate web push delivery service providers', () => {
      const validEndpoints = [
        'https://fcm.googleapis.com/fcm/send/sample-token-1',
        'https://updates.push.services.mozilla.com/wpush/v2/sample-token-2',
        'https://web.push.apple.com/sample-token-3',
        'https://wns2-sn1p.notify.windows.com/sample-token-4',
      ];
      for (const endpoint of validEndpoints) {
        const res = validatePushEndpoint(endpoint);
        assert.equal(res.valid, true);
      }
    });
  });

  // 2. Subscription Registration & Public Key Endpoints
  describe('2. Subscription Registration & VAPID Endpoints', () => {
    it('GET /api/v1/notifications/vapid-public-key returns VAPID public key', async () => {
      const res = await fetch(`${baseUrl}/api/v1/notifications/vapid-public-key`);
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.ok(body.data.publicKey);
      assert.equal(typeof body.data.publicKey, 'string');
    });

    it('POST /api/v1/notifications/subscriptions rejects missing notification consent', async () => {
      const res = await fetch(`${baseUrl}/api/v1/notifications/subscriptions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: 'https://fcm.googleapis.com/fcm/send/token-no-consent',
          keys: { p256dh: 'test-p256dh', auth: 'test-auth' },
          notificationConsent: false,
        }),
      });
      assert.equal(res.status, 400);
      const body = await res.json();
      assert.equal(body.error.code, 'NOTIFICATION_CONSENT_REQUIRED');
    });

    it('POST /api/v1/notifications/subscriptions successfully registers subscription and redacts secrets', async () => {
      const res = await fetch(`${baseUrl}/api/v1/notifications/subscriptions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: 'https://fcm.googleapis.com/fcm/send/token-registered',
          keys: { p256dh: 'BNcRdre-test-key-p256dh', auth: 'test-auth-secret' },
          notificationConsent: true,
          locationConsent: true,
          deviceType: 'mobile',
        }),
      });
      assert.equal(res.status, 201);
      const body = await res.json();
      assert.ok(body.data.subscription);
      assert.ok(body.data.subscription.endpointHash);
      assert.equal(body.data.subscription.status, 'ACTIVE');
      assert.equal(body.data.subscription.notificationConsent, true);
      assert.equal(body.data.subscription.locationConsent, true);
      // Secrets must never be exposed
      assert.equal(body.data.subscription.endpoint, undefined);
      assert.equal(body.data.subscription.keys, undefined);
    });

    it('POST /api/v1/notifications/subscriptions is idempotent on duplicate registration', async () => {
      const payload = {
        endpoint: 'https://fcm.googleapis.com/fcm/send/token-idempotent',
        keys: { p256dh: 'key1', auth: 'auth1' },
        notificationConsent: true,
        locationConsent: false,
      };

      const res1 = await fetch(`${baseUrl}/api/v1/notifications/subscriptions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      assert.equal(res1.status, 201);

      // Second registration updates existing subscription
      const res2 = await fetch(`${baseUrl}/api/v1/notifications/subscriptions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, locationConsent: true }),
      });
      assert.equal(res2.status, 201);

      const count = await PushSubscription.countDocuments({
        endpointHash: hashEndpoint(payload.endpoint),
      });
      assert.equal(count, 1);
    });
  });

  // 3. Consented Location Heartbeat Validation
  describe('3. Consented Location Ingestion & Validation', () => {
    let subWithLocationConsent;
    let subWithoutLocationConsent;

    beforeEach(async () => {
      subWithLocationConsent = await PushSubscription.create({
        endpoint: 'https://fcm.googleapis.com/fcm/send/sub-with-loc',
        endpointHash: hashEndpoint('https://fcm.googleapis.com/fcm/send/sub-with-loc'),
        keys: { p256dh: 'p1', auth: 'a1' },
        notificationConsent: true,
        locationConsent: true,
        status: 'ACTIVE',
      });

      subWithoutLocationConsent = await PushSubscription.create({
        endpoint: 'https://fcm.googleapis.com/fcm/send/sub-without-loc',
        endpointHash: hashEndpoint('https://fcm.googleapis.com/fcm/send/sub-without-loc'),
        keys: { p256dh: 'p2', auth: 'a2' },
        notificationConsent: true,
        locationConsent: false,
        status: 'ACTIVE',
      });
    });

    it('rejects location heartbeat if locationConsent is false', async () => {
      const res = await fetch(`${baseUrl}/api/v1/notifications/location`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpointHash: subWithoutLocationConsent.endpointHash,
          coordinates: patnaNear,
          accuracyMeters: 15,
          capturedAt: new Date().toISOString(),
        }),
      });
      assert.equal(res.status, 403);
      const body = await res.json();
      assert.equal(body.error.code, 'LOCATION_CONSENT_REQUIRED');
    });

    it('rejects location with accuracy worse than 200m limit', async () => {
      const res = await fetch(`${baseUrl}/api/v1/notifications/location`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpointHash: subWithLocationConsent.endpointHash,
          coordinates: patnaNear,
          accuracyMeters: 250, // exceeds 200m max
          capturedAt: new Date().toISOString(),
        }),
      });
      assert.equal(res.status, 422);
      const body = await res.json();
      assert.equal(body.error.code, 'LOCATION_ACCURACY_TOO_LOW');
    });

    it('rejects stale location older than 90 seconds', async () => {
      const staleTime = new Date(Date.now() - 120 * 1000).toISOString();
      const res = await fetch(`${baseUrl}/api/v1/notifications/location`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpointHash: subWithLocationConsent.endpointHash,
          coordinates: patnaNear,
          accuracyMeters: 20,
          capturedAt: staleTime,
        }),
      });
      assert.equal(res.status, 422);
      const body = await res.json();
      assert.equal(body.error.code, 'STALE_LOCATION');
    });

    it('rejects future-dated location timestamps (> 60s in future)', async () => {
      const futureTime = new Date(Date.now() + 120 * 1000).toISOString();
      const res = await fetch(`${baseUrl}/api/v1/notifications/location`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpointHash: subWithLocationConsent.endpointHash,
          coordinates: patnaNear,
          accuracyMeters: 10,
          capturedAt: futureTime,
        }),
      });
      assert.equal(res.status, 422);
      const body = await res.json();
      assert.equal(body.error.code, 'FUTURE_TIMESTAMP');
    });

    it('accepts valid fresh location update and stores GeoJSON Point', async () => {
      const now = new Date();
      const res = await fetch(`${baseUrl}/api/v1/notifications/location`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpointHash: subWithLocationConsent.endpointHash,
          coordinates: patnaNear,
          accuracyMeters: 25,
          capturedAt: now.toISOString(),
        }),
      });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.data.status, 'LOCATION_ACCEPTED');

      const updated = await PushSubscription.findById(subWithLocationConsent._id);
      assert.equal(updated.location.type, 'Point');
      assert.deepEqual(updated.location.coordinates, patnaNear);
      assert.equal(updated.locationAccuracyMeters, 25);
      assert.ok(updated.lastLocationCapturedAt);
    });
  });

  // 4. Unsubscribe & Location Privacy Purge
  describe('4. Unsubscribe & Privacy Purge', () => {
    it('DELETE /api/v1/notifications/subscriptions disables subscription and purges location', async () => {
      const sub = await PushSubscription.create({
        endpoint: 'https://fcm.googleapis.com/fcm/send/sub-to-delete',
        endpointHash: hashEndpoint('https://fcm.googleapis.com/fcm/send/sub-to-delete'),
        keys: { p256dh: 'p', auth: 'a' },
        notificationConsent: true,
        locationConsent: true,
        location: { type: 'Point', coordinates: patnaNear },
        locationAccuracyMeters: 10,
        lastLocationCapturedAt: new Date(),
        status: 'ACTIVE',
      });

      const res = await fetch(`${baseUrl}/api/v1/notifications/subscriptions`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpointHash: sub.endpointHash }),
      });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.data.status, 'UNSUBSCRIBED');

      const refreshed = await PushSubscription.findById(sub._id);
      assert.equal(refreshed.status, 'DISABLED');
      assert.equal(refreshed.notificationConsent, false);
      assert.equal(refreshed.locationConsent, false);
      assert.equal(refreshed.location, undefined);
      assert.equal(refreshed.locationAccuracyMeters, null);
      assert.equal(refreshed.lastLocationCapturedAt, null);
    });
  });

  // 5. Proximity Targeting & Alert Tier Policy
  describe('5. Proximity Targeting & Alert Tier Policy', () => {
    it('calculates Haversine distance correctly', () => {
      const dNear = calculateDistanceMeters(patnaCenter, patnaNear);
      assert.ok(dNear > 0 && dNear < 2000, `Expected dNear < 2000, got ${dNear}`);

      const dOuter = calculateDistanceMeters(patnaCenter, patnaOuter);
      assert.ok(dOuter >= 2000 && dOuter <= 5000, `Expected dOuter 2000-5000, got ${dOuter}`);

      const dFar = calculateDistanceMeters(patnaCenter, patnaFar);
      assert.ok(dFar > 5000, `Expected dFar > 5000, got ${dFar}`);
    });

    it('geospatially targets subscribers within 5km radius and ignores farther subscribers', async () => {
      // Near subscriber (~600m)
      await PushSubscription.create({
        endpoint: 'https://fcm.googleapis.com/fcm/send/sub-near',
        endpointHash: hashEndpoint('https://fcm.googleapis.com/fcm/send/sub-near'),
        keys: { p256dh: 'k1', auth: 'a1' },
        notificationConsent: true,
        locationConsent: true,
        location: { type: 'Point', coordinates: patnaNear },
        locationAccuracyMeters: 15,
        lastLocationCapturedAt: new Date(),
        status: 'ACTIVE',
      });

      // Outer subscriber (~3.5km)
      await PushSubscription.create({
        endpoint: 'https://fcm.googleapis.com/fcm/send/sub-outer',
        endpointHash: hashEndpoint('https://fcm.googleapis.com/fcm/send/sub-outer'),
        keys: { p256dh: 'k2', auth: 'a2' },
        notificationConsent: true,
        locationConsent: true,
        location: { type: 'Point', coordinates: patnaOuter },
        locationAccuracyMeters: 30,
        lastLocationCapturedAt: new Date(),
        status: 'ACTIVE',
      });

      // Far subscriber (> 10km)
      await PushSubscription.create({
        endpoint: 'https://fcm.googleapis.com/fcm/send/sub-far',
        endpointHash: hashEndpoint('https://fcm.googleapis.com/fcm/send/sub-far'),
        keys: { p256dh: 'k3', auth: 'a3' },
        notificationConsent: true,
        locationConsent: true,
        location: { type: 'Point', coordinates: patnaFar },
        locationAccuracyMeters: 10,
        lastLocationCapturedAt: new Date(),
        status: 'ACTIVE',
      });

      const eligible = await findEligibleSubscribers(patnaCenter);
      assert.equal(eligible.length, 2);
      const hashes = eligible.map((s) => s.endpointHash);
      assert.ok(hashes.includes(hashEndpoint('https://fcm.googleapis.com/fcm/send/sub-near')));
      assert.ok(hashes.includes(hashEndpoint('https://fcm.googleapis.com/fcm/send/sub-outer')));
      assert.ok(!hashes.includes(hashEndpoint('https://fcm.googleapis.com/fcm/send/sub-far')));
    });

    it('assigns NEAR tier (<2km) and OUTER tier (2km-5km) templates accurately', async () => {
      const tripId = new mongoose.Types.ObjectId();

      const subNear = await PushSubscription.create({
        endpoint: 'https://fcm.googleapis.com/fcm/send/tier-near',
        endpointHash: hashEndpoint('https://fcm.googleapis.com/fcm/send/tier-near'),
        keys: { p256dh: 'k1', auth: 'a1' },
        notificationConsent: true,
        locationConsent: true,
        location: { type: 'Point', coordinates: patnaNear },
        locationAccuracyMeters: 10,
        lastLocationCapturedAt: new Date(),
        status: 'ACTIVE',
      });

      const subOuter = await PushSubscription.create({
        endpoint: 'https://fcm.googleapis.com/fcm/send/tier-outer',
        endpointHash: hashEndpoint('https://fcm.googleapis.com/fcm/send/tier-outer'),
        keys: { p256dh: 'k2', auth: 'a2' },
        notificationConsent: true,
        locationConsent: true,
        location: { type: 'Point', coordinates: patnaOuter },
        locationAccuracyMeters: 10,
        lastLocationCapturedAt: new Date(),
        status: 'ACTIVE',
      });

      const result = await dispatchAlertsForTrip(tripId, patnaCenter);
      assert.equal(result.dispatched, 2);

      const sent = mockPush.getSentNotifications();
      assert.equal(sent.length, 2);

      const nearNotif = sent.find((n) => n.subscription.endpointHash === subNear.endpointHash);
      const outerNotif = sent.find((n) => n.subscription.endpointHash === subOuter.endpointHash);

      assert.equal(nearNotif.payload.data.tier, 'NEAR');
      assert.match(nearNotif.payload.title, /GIVE WAY SAFELY/);
      assert.equal(nearNotif.payload.tag, `ambulance-alert-${tripId}`);

      assert.equal(outerNotif.payload.data.tier, 'OUTER');
      assert.match(outerNotif.payload.title, /AMBULANCE APPROACHING/);
      assert.equal(outerNotif.payload.tag, `ambulance-alert-${tripId}`);
    });

    it('bypasses cooldown when transitioning from OUTER to NEAR tier (urgent safety upgrade)', async () => {
      const tripId = new mongoose.Types.ObjectId();

      const sub = await PushSubscription.create({
        endpoint: 'https://fcm.googleapis.com/fcm/send/sub-upgrade',
        endpointHash: hashEndpoint('https://fcm.googleapis.com/fcm/send/sub-upgrade'),
        keys: { p256dh: 'k', auth: 'a' },
        notificationConsent: true,
        locationConsent: true,
        location: { type: 'Point', coordinates: patnaOuter },
        locationAccuracyMeters: 10,
        lastLocationCapturedAt: new Date(),
        status: 'ACTIVE',
      });

      // 1. Initial outer dispatch
      await dispatchAlertsForTrip(tripId, patnaCenter);
      assert.equal(mockPush.getSentNotifications().length, 1);

      // 2. Immediate movement into NEAR zone (cooldown hasn't elapsed)
      sub.location = { type: 'Point', coordinates: patnaNear };
      await sub.save();

      await dispatchAlertsForTrip(tripId, patnaCenter);

      // Upgrade bypasses cooldown and delivers immediately with renotify: true
      const sent = mockPush.getSentNotifications();
      assert.equal(sent.length, 2);
      assert.equal(sent[1].payload.data.tier, 'NEAR');
      assert.equal(sent[1].payload.renotify, true);
    });

    it('throttles repeat notifications within cooldown when tier is unchanged', async () => {
      const tripId = new mongoose.Types.ObjectId();

      await PushSubscription.create({
        endpoint: 'https://fcm.googleapis.com/fcm/send/sub-throttle',
        endpointHash: hashEndpoint('https://fcm.googleapis.com/fcm/send/sub-throttle'),
        keys: { p256dh: 'k', auth: 'a' },
        notificationConsent: true,
        locationConsent: true,
        location: { type: 'Point', coordinates: patnaNear },
        locationAccuracyMeters: 10,
        lastLocationCapturedAt: new Date(),
        status: 'ACTIVE',
      });

      // 1st dispatch succeeds
      const r1 = await dispatchAlertsForTrip(tripId, patnaCenter);
      assert.equal(r1.dispatched, 1);

      // 2nd immediate dispatch is suppressed
      const r2 = await dispatchAlertsForTrip(tripId, patnaCenter);
      assert.equal(r2.dispatched, 0);
      assert.equal(r2.suppressed, 1);

      // Verify AlertDispatch record has status SUPPRESSED
      const suppressedRecord = await AlertDispatch.findOne({ status: 'SUPPRESSED' });
      assert.ok(suppressedRecord);
    });

    it('marks subscription EXPIRED when push provider returns 410 Gone', async () => {
      const tripId = new mongoose.Types.ObjectId();

      const sub = await PushSubscription.create({
        endpoint: 'https://fcm.googleapis.com/fcm/send/sub-expired-test',
        endpointHash: hashEndpoint('https://fcm.googleapis.com/fcm/send/sub-expired-test'),
        keys: { p256dh: 'k', auth: 'a' },
        notificationConsent: true,
        locationConsent: true,
        location: { type: 'Point', coordinates: patnaNear },
        locationAccuracyMeters: 10,
        lastLocationCapturedAt: new Date(),
        status: 'ACTIVE',
      });

      // Configure mock provider to fail next push with 410 Gone
      mockPush.setFailNext({
        message: 'Push subscription has expired or unsubscribed',
        statusCode: 410,
      });

      const res = await dispatchAlertsForTrip(tripId, patnaCenter);
      assert.equal(res.failed, 1);

      const refreshed = await PushSubscription.findById(sub._id);
      assert.equal(refreshed.status, 'EXPIRED');

      const dispatchRecord = await AlertDispatch.findOne({ status: 'EXPIRED' });
      assert.ok(dispatchRecord);
    });
  });

  // 6. End-to-End Emergency Trip Lifecycle Integration
  describe('6. Trip Lifecycle Integration', () => {
    it('triggers proximity dispatch when driver creates an emergency trip', async () => {
      // Setup a nearby subscribed road user
      const roadUser = await PushSubscription.create({
        endpoint: 'https://fcm.googleapis.com/fcm/send/trip-lifecycle-user',
        endpointHash: hashEndpoint('https://fcm.googleapis.com/fcm/send/trip-lifecycle-user'),
        keys: { p256dh: 'k', auth: 'a' },
        notificationConsent: true,
        locationConsent: true,
        location: { type: 'Point', coordinates: patnaNear },
        locationAccuracyMeters: 10,
        lastLocationCapturedAt: new Date(),
        status: 'ACTIVE',
      });

      // Driver starts emergency trip
      const tripRes = await fetch(`${baseUrl}/api/v1/trips`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${driverToken}`,
        },
        body: JSON.stringify({
          origin: patnaCenter,
          destination: {
            label: 'Patna AIIMS Emergency',
            coordinates: [85.044, 25.561],
          },
        }),
      });
      assert.equal(tripRes.status, 201);
      const tripBody = await tripRes.json();
      const tripId = tripBody.data.trip.id;

      // Wait for async dispatch to complete over Atlas network
      for (let i = 0; i < 30; i++) {
        if (mockPush.getSentNotifications().length >= 1) break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      const sent = mockPush.getSentNotifications();
      assert.ok(sent.length >= 1);
      assert.equal(sent[0].payload.data.tripId, tripId);
      assert.equal(sent[0].payload.data.tier, 'NEAR');

      // Now end the emergency trip
      const endRes = await fetch(`${baseUrl}/api/v1/trips/${tripId}/end`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${driverToken}`,
        },
        body: JSON.stringify({ reason: 'ARRIVED' }),
      });
      assert.equal(endRes.status, 200);

      // Wait for ended notification to deliver over network
      for (let i = 0; i < 30; i++) {
        if (mockPush.getSentNotifications().some((n) => n.payload.data.tier === 'ENDED')) break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      // Verify clear/ended notification was delivered
      const sentAll = mockPush.getSentNotifications();
      const endedNotif = sentAll.find((n) => n.payload.data.tier === 'ENDED');
      assert.ok(endedNotif);
      assert.match(endedNotif.payload.title, /Alert Ended/);
      assert.equal(endedNotif.payload.tag, `ambulance-alert-${tripId}`);
    });
  });

  describe('7. Test Notification Dispatch', () => {
    it('dispatches a verified test push notification to active subscriber', async () => {
      mockPush.clear();
      const endpoint = 'https://fcm.googleapis.com/fcm/send/test-verification-device';
      const sub = await PushSubscription.create({
        endpoint,
        endpointHash: hashEndpoint(endpoint),
        keys: { p256dh: 'test-p256', auth: 'test-auth' },
        notificationConsent: true,
        locationConsent: true,
        status: 'ACTIVE',
      });

      const res = await fetch(`${baseUrl}/api/v1/notifications/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpointHash: sub.endpointHash }),
      });

      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.data.success, true);

      const sent = mockPush.getSentNotifications();
      assert.equal(sent.length, 1);
      assert.equal(sent[0].subscription.endpointHash, sub.endpointHash);
      assert.match(sent[0].payload.title, /Web Push Active/);
      assert.equal(sent[0].payload.data.type, 'TEST_VERIFICATION');
    });

    it('returns 404 if subscriber endpointHash is unknown', async () => {
      const res = await fetch(`${baseUrl}/api/v1/notifications/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpointHash: 'unknown-hash-123' }),
      });

      assert.equal(res.status, 404);
      const body = await res.json();
      assert.equal(body.error.code, 'SUBSCRIPTION_NOT_FOUND');
    });
  });
});

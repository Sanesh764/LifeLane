import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { app } from '../server.js';
import { env } from '../config/env.js';
import { connectDB, disconnectDB } from '../config/db.js';
import { User } from '../models/User.js';
import { PushSubscription, hashEndpoint } from '../models/PushSubscription.js';
import { clearRevocationsForTesting } from '../middlewares/auth.js';
import dns from "dns";
dns.setServers(['1.1.1.1','8.8.8.8']);
describe('Phase 6.1: Public User Roles, Registration & User Push Subscriptions', () => {
  let server;
  let baseUrl;
  let testDriver;
  let driverToken;

  before(async () => {
    clearRevocationsForTesting();
    await connectDB();

    await new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });

    // Clean up any test accounts
    await User.deleteMany({ email: { $regex: /@phase61\.test$/i } });
    await PushSubscription.deleteMany({ endpoint: { $regex: /phase61/i } });

    // Seed a verified driver
    const hash = await User.hashPassword('DriverPass123!');
    testDriver = await User.create({
      name: 'Phase 6 Driver',
      email: 'driver@phase61.test',
      passwordHash: hash,
      role: 'AMBULANCE_DRIVER',
      status: 'active',
      driverVerificationStatus: 'VERIFIED',
      assignedUnit: { callSign: 'Unit 601', vehicleNumber: 'BR-01-P601', hospitalBase: 'City Hospital' },
    });

    driverToken = jwt.sign(
      { sub: testDriver._id.toString(), email: testDriver.email, role: testDriver.role, status: 'active' },
      env.JWT_SECRET,
      { expiresIn: 3600 }
    );
  });

  after(async () => {
    try {
      await User.deleteMany({ email: { $regex: /@phase61\.test$/i } });
      await PushSubscription.deleteMany({ endpoint: { $regex: /phase61/i } });
    } catch {}
    clearRevocationsForTesting();
    await new Promise((resolve) => server.close(resolve));
    await disconnectDB();
  });

  describe('1. Public User Registration & Role Enforcement', () => {
    it('registers a public user with default PUBLIC_USER role and active status', async () => {
      const res = await fetch(`${baseUrl}/api/v1/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Jane Citizen',
          email: 'jane@phase61.test',
          password: 'Password123!',
        }),
      });

      assert.equal(res.status, 201);
      const json = await res.json();
      assert.ok(json.data.accessToken);
      assert.equal(json.data.user.name, 'Jane Citizen');
      assert.equal(json.data.user.email, 'jane@phase61.test');
      assert.equal(json.data.user.role, 'PUBLIC_USER');
      assert.equal(json.data.user.status, 'active');
      assert.equal(json.data.user.driverVerificationStatus, 'NOT_REQUIRED');
      assert.equal(json.data.user.passwordHash, undefined); // password hash must never leak
    });

    it('strictly prevents privilege escalation to AMBULANCE_DRIVER or ADMIN', async () => {
      const res = await fetch(`${baseUrl}/api/v1/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Sneaky Attacker',
          email: 'attacker@phase61.test',
          password: 'Password123!',
          role: 'AMBULANCE_DRIVER',
          driverVerificationStatus: 'VERIFIED',
          status: 'active',
        }),
      });

      assert.equal(res.status, 201);
      const json = await res.json();
      assert.equal(json.data.user.role, 'PUBLIC_USER');
      assert.equal(json.data.user.driverVerificationStatus, 'NOT_REQUIRED');

      // Verify directly from DB
      const dbUser = await User.findOne({ email: 'attacker@phase61.test' });
      assert.equal(dbUser.role, 'PUBLIC_USER');
      assert.equal(dbUser.driverVerificationStatus, 'NOT_REQUIRED');
    });

    it('rejects duplicate email registrations with HTTP 409', async () => {
      const res = await fetch(`${baseUrl}/api/v1/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Jane Citizen Duplicate',
          email: 'jane@phase61.test',
          password: 'Password123!',
        }),
      });

      assert.equal(res.status, 409);
      const json = await res.json();
      assert.equal(json.error.code, 'EMAIL_ALREADY_REGISTERED');
    });

    it('validates input: rejects short passwords and invalid emails', async () => {
      const resShortPass = await fetch(`${baseUrl}/api/v1/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Bob Short',
          email: 'bob@phase61.test',
          password: '123',
        }),
      });
      assert.equal(resShortPass.status, 400);

      const resBadEmail = await fetch(`${baseUrl}/api/v1/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Bob BadEmail',
          email: 'not-an-email',
          password: 'Password123!',
        }),
      });
      assert.equal(resBadEmail.status, 400);
    });
  });

  describe('2. Authentication & Login Verification', () => {
    it('allows registered public users to log in with email and password', async () => {
      const res = await fetch(`${baseUrl}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'jane@phase61.test',
          password: 'Password123!',
        }),
      });

      assert.equal(res.status, 200);
      const json = await res.json();
      assert.ok(json.data.accessToken);
      assert.equal(json.data.user.role, 'PUBLIC_USER');
    });

    it('rejects public user login with invalid password', async () => {
      const res = await fetch(`${baseUrl}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'jane@phase61.test',
          password: 'WrongPassword!',
        }),
      });

      assert.equal(res.status, 401);
    });

    it('preserves existing driver login behavior', async () => {
      const res = await fetch(`${baseUrl}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'driver@phase61.test',
          password: 'DriverPass123!',
        }),
      });

      assert.equal(res.status, 200);
      const json = await res.json();
      assert.equal(json.data.user.role, 'AMBULANCE_DRIVER');
      assert.equal(json.data.user.driverVerificationStatus, 'VERIFIED');
    });

    it('public users cannot start an emergency trip (enforces requireActiveDriver)', async () => {
      // First get public user token
      const loginRes = await fetch(`${baseUrl}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'jane@phase61.test',
          password: 'Password123!',
        }),
      });
      const { data: { accessToken: publicToken } } = await loginRes.json();

      const tripRes = await fetch(`${baseUrl}/api/v1/trips`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${publicToken}`,
        },
        body: JSON.stringify({
          destination: { label: 'Hospital Test', location: { coordinates: [85.1, 25.6] } },
          initialLocation: { coordinates: [85.0, 25.5] },
        }),
      });

      assert.equal(tripRes.status, 403);
      const tripJson = await tripRes.json();
      assert.equal(tripJson.error.code, 'FORBIDDEN');
    });
  });

  describe('3. Push Subscription Management & Ownership', () => {
    let janeToken;
    let bobToken;
    let janeSubEndpoint = 'https://fcm.googleapis.com/fcm/send/phase61_jane_device';
    let bobSubEndpoint = 'https://fcm.googleapis.com/fcm/send/phase61_bob_device';
    let anonSubEndpoint = 'https://fcm.googleapis.com/fcm/send/phase61_anon_device';

    before(async () => {
      // Register Bob
      const regBob = await fetch(`${baseUrl}/api/v1/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Bob Citizen',
          email: 'bob.sub@phase61.test',
          password: 'Password123!',
        }),
      });
      const bobData = await regBob.json();
      bobToken = bobData.data.accessToken;

      // Login Jane
      const loginJane = await fetch(`${baseUrl}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'jane@phase61.test',
          password: 'Password123!',
        }),
      });
      const janeData = await loginJane.json();
      janeToken = janeData.data.accessToken;
    });

    it('allows anonymous subscription (backward compatibility with userId: null)', async () => {
      const res = await fetch(`${baseUrl}/api/v1/notifications/subscriptions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: anonSubEndpoint,
          keys: { p256dh: 'anon_p256dh_key_test_123', auth: 'anon_auth_secret_test_123' },
          notificationConsent: true,
          deviceType: 'desktop',
        }),
      });

      assert.equal(res.status, 201);
      const json = await res.json();
      assert.equal(json.data.subscription.status, 'ACTIVE');

      const dbSub = await PushSubscription.findOne({ endpoint: anonSubEndpoint });
      assert.equal(dbSub.userId, null);
    });

    it('links push subscription to authenticated user when token is provided', async () => {
      const res = await fetch(`${baseUrl}/api/v1/notifications/subscriptions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${janeToken}`,
        },
        body: JSON.stringify({
          endpoint: janeSubEndpoint,
          keys: { p256dh: 'jane_p256dh_key_test_123', auth: 'jane_auth_secret_test_123' },
          notificationConsent: true,
          deviceType: 'mobile',
        }),
      });

      assert.equal(res.status, 201);
      const json = await res.json();
      assert.equal(json.data.subscription.status, 'ACTIVE');

      const dbSub = await PushSubscription.findOne({ endpoint: janeSubEndpoint });
      assert.ok(dbSub.userId);
      assert.equal(dbSub.userId.toString(), json.data.subscription.userId);
    });

    it('allows user to query their own subscriptions via GET /my-subscriptions', async () => {
      const res = await fetch(`${baseUrl}/api/v1/notifications/my-subscriptions`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${janeToken}` },
      });

      assert.equal(res.status, 200);
      const json = await res.json();
      assert.equal(json.data.total, 1);
      assert.equal(json.data.hasActive, true);
    });

    it('forbids a user from disabling another user subscription (HTTP 403)', async () => {
      const janeHash = hashEndpoint(janeSubEndpoint);

      // Bob tries to disable Jane's subscription
      const res = await fetch(`${baseUrl}/api/v1/notifications/subscriptions/disable`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${bobToken}`,
        },
        body: JSON.stringify({ endpointHash: janeHash }),
      });

      assert.equal(res.status, 403);
      const json = await res.json();
      assert.equal(json.error.code, 'FORBIDDEN');

      // Verify Jane's subscription is still ACTIVE
      const dbSub = await PushSubscription.findOne({ endpointHash: janeHash });
      assert.equal(dbSub.status, 'ACTIVE');
    });

    it('allows subscription owner to disable their own subscription', async () => {
      const janeHash = hashEndpoint(janeSubEndpoint);

      const res = await fetch(`${baseUrl}/api/v1/notifications/subscriptions/disable`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${janeToken}`,
        },
        body: JSON.stringify({ endpointHash: janeHash }),
      });

      assert.equal(res.status, 200);
      const json = await res.json();
      assert.equal(json.data.subscription.status, 'DISABLED');

      const dbSub = await PushSubscription.findOne({ endpointHash: janeHash });
      assert.equal(dbSub.status, 'DISABLED');
      assert.equal(dbSub.notificationConsent, false);
    });
  });
});

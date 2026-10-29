import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { app } from '../server.js';
import { connectDB, disconnectDB } from '../config/db.js';
import { env } from '../config/env.js';

describe('Phase B2: Real End-to-End Driver Auth Integration', () => {
  let server;
  let baseUrl;
  let accessToken;

  before(async () => {
    await connectDB();
    await new Promise((resolve) => {
      server = app.listen(0, () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    await disconnectDB();
  });

  it('1. POST /api/v1/auth/login logs in the seeded driver and returns JWT token', async () => {
    const res = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: env.INITIAL_DRIVER.email,
        password: env.INITIAL_DRIVER.password,
      }),
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(body.data);
    assert.ok(body.data.accessToken);
    assert.equal(body.data.tokenType, 'Bearer');
    assert.equal(body.data.user.email, env.INITIAL_DRIVER.email.toLowerCase());
    assert.equal(body.data.user.role, 'AMBULANCE_DRIVER');
    assert.equal(body.data.user.status, 'active');
    assert.equal(body.data.user.driverVerificationStatus, 'VERIFIED');
    assert.equal(body.data.user.passwordHash, undefined);

    accessToken = body.data.accessToken;
  });

  it('2. POST /api/v1/auth/login rejects invalid password with generic 401 error', async () => {
    const res = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: env.INITIAL_DRIVER.email,
        password: 'DefinitivelyWrongPassword123',
      }),
    });

    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.error.code, 'INVALID_CREDENTIALS');
    assert.equal(body.error.message, 'Invalid email or password.');
  });

  it('3. GET /api/v1/auth/me retrieves authenticated driver profile using Bearer token', async () => {
    assert.ok(accessToken, 'Expected accessToken to be set');

    const res = await fetch(`${baseUrl}/api/v1/auth/me`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.data.user.email, env.INITIAL_DRIVER.email.toLowerCase());
    assert.equal(body.data.user.role, 'AMBULANCE_DRIVER');
    assert.equal(body.data.user.passwordHash, undefined);
  });

  it('4. GET /api/v1/driver/profile accesses driver-only protected endpoint', async () => {
    const res = await fetch(`${baseUrl}/api/v1/driver/profile`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(body.data.driver);
    assert.equal(body.data.driver.role, 'AMBULANCE_DRIVER');
    assert.ok(body.data.driver.assignedUnit);
    assert.equal(body.data.driver.assignedUnit.callSign, env.INITIAL_DRIVER.callSign);
  });

  it('5. POST /api/v1/auth/logout successfully invalidates the active token session', async () => {
    const res = await fetch(`${baseUrl}/api/v1/auth/logout`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.data.message, 'Logged out successfully.');
  });

  it('6. Subsequent requests with the logged-out token are rejected with 401 TOKEN_REVOKED', async () => {
    const res = await fetch(`${baseUrl}/api/v1/auth/me`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.error.code, 'TOKEN_REVOKED');
  });

  it('7. GET /api/v1/driver/profile with the logged-out token is also rejected with 401 TOKEN_REVOKED', async () => {
    const res = await fetch(`${baseUrl}/api/v1/driver/profile`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.error.code, 'TOKEN_REVOKED');
  });
});

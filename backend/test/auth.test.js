import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { app } from '../server.js';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import {
  authenticate,
  requireRole,
  requireActiveDriver,
  revokeToken,
  isTokenRevoked,
  clearRevocationsForTesting,
} from '../middlewares/auth.js';

describe('Phase B2: Driver Authentication & Authorization', () => {
  let server;
  let baseUrl;

  before(async () => {
    clearRevocationsForTesting();
    await new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  after(async () => {
    clearRevocationsForTesting();
    await new Promise((resolve) => server.close(resolve));
  });

  describe('1. User Model & Password Hashing', () => {
    it('hashes passwords using bcrypt and verifies correctly', async () => {
      const plain = 'SecurePassword123!';
      const hash = await User.hashPassword(plain);

      assert.notEqual(plain, hash);
      assert.ok(hash.startsWith('$2')); // bcrypt prefix

      const dummyUser = new User({
        name: 'Test Driver',
        email: 'test.driver@amburoute.test',
        passwordHash: hash,
        role: 'AMBULANCE_DRIVER',
        status: 'active',
      });

      const matchValid = await dummyUser.comparePassword('SecurePassword123!');
      assert.equal(matchValid, true);

      const matchInvalid = await dummyUser.comparePassword('WrongPassword');
      assert.equal(matchInvalid, false);
    });

    it('toJSON serialization never exposes passwordHash or internal fields', async () => {
      const hash = await User.hashPassword('MySecretPass');
      const dummyUser = new User({
        name: 'Amitabh Sen',
        email: 'driver@amburoute.demo',
        passwordHash: hash,
        role: 'AMBULANCE_DRIVER',
        status: 'active',
        driverVerificationStatus: 'VERIFIED',
        assignedUnit: {
          callSign: 'Patna Unit 108 — Alpha',
          vehicleNumber: 'BR-01-EA-108',
        },
      });

      const json = dummyUser.toJSON();
      assert.equal(json.passwordHash, undefined);
      assert.equal(json.__v, undefined);
      assert.equal(json.name, 'Amitabh Sen');
      assert.equal(json.role, 'AMBULANCE_DRIVER');
      assert.equal(json.assignedUnit.callSign, 'Patna Unit 108 — Alpha');
    });

    it('defaults new user to pending status and prevents auto-verification', () => {
      const newUser = new User({
        name: 'Pending Driver',
        email: 'pending@amburoute.test',
        passwordHash: 'dummyhash',
        role: 'AMBULANCE_DRIVER',
      });

      assert.equal(newUser.status, 'pending');
      assert.equal(newUser.driverVerificationStatus, 'PENDING');
    });
  });

  describe('2. Token Lifecycle & Revocation', () => {
    it('revokes tokens on logout and marks them in revocation registry', () => {
      const testToken = 'sample.jwt.token.string';
      assert.equal(isTokenRevoked(testToken), false);

      revokeToken(testToken, Math.floor(Date.now() / 1000) + 3600);
      assert.equal(isTokenRevoked(testToken), true);
    });

    it('rejects expired tokens with TOKEN_EXPIRED error code', async () => {
      // Create an already-expired token
      const expiredToken = jwt.sign(
        { sub: '507f1f77bcf86cd799439011', role: 'AMBULANCE_DRIVER' },
        env.JWT_SECRET,
        { expiresIn: '-1s' }
      );

      const req = {
        headers: { authorization: `Bearer ${expiredToken}` },
      };
      let capturedStatus = null;
      let capturedBody = null;
      const res = {
        status: (code) => {
          capturedStatus = code;
          return {
            json: (body) => {
              capturedBody = body;
            },
          };
        },
      };

      await authenticate(req, res, () => {});
      assert.equal(capturedStatus, 401);
      assert.equal(capturedBody.error.code, 'TOKEN_EXPIRED');
    });

    it('rejects malformed or forged tokens with INVALID_TOKEN error code', async () => {
      const req = {
        headers: { authorization: 'Bearer invalid.forged.signature' },
      };
      let capturedStatus = null;
      let capturedBody = null;
      const res = {
        status: (code) => {
          capturedStatus = code;
          return {
            json: (body) => {
              capturedBody = body;
            },
          };
        },
      };

      await authenticate(req, res, () => {});
      assert.equal(capturedStatus, 401);
      assert.equal(capturedBody.error.code, 'INVALID_TOKEN');
    });

    it('rejects requests missing the Authorization header with UNAUTHORIZED', async () => {
      const req = { headers: {} };
      let capturedStatus = null;
      let capturedBody = null;
      const res = {
        status: (code) => {
          capturedStatus = code;
          return {
            json: (body) => {
              capturedBody = body;
            },
          };
        },
      };

      await authenticate(req, res, () => {});
      assert.equal(capturedStatus, 401);
      assert.equal(capturedBody.error.code, 'UNAUTHORIZED');
    });
  });

  describe('3. Role & Driver Verification Middleware', () => {
    it('requireRole denies access to unauthorized roles with 403 FORBIDDEN', () => {
      const req = {
        user: { role: 'ROAD_USER', status: 'active' },
      };
      let capturedStatus = null;
      let capturedBody = null;
      const res = {
        status: (code) => {
          capturedStatus = code;
          return {
            json: (body) => {
              capturedBody = body;
            },
          };
        },
      };

      const middleware = requireRole('AMBULANCE_DRIVER');
      middleware(req, res, () => {});

      assert.equal(capturedStatus, 403);
      assert.equal(capturedBody.error.code, 'FORBIDDEN');
    });

    it('requireRole grants access when user has permitted role', () => {
      const req = {
        user: { role: 'AMBULANCE_DRIVER', status: 'active' },
      };
      let nextCalled = false;
      const middleware = requireRole('AMBULANCE_DRIVER');
      middleware(req, {}, () => {
        nextCalled = true;
      });

      assert.equal(nextCalled, true);
    });

    it('requireActiveDriver denies drivers who are pending verification', () => {
      const req = {
        user: {
          role: 'AMBULANCE_DRIVER',
          status: 'active',
          driverVerificationStatus: 'PENDING',
        },
      };
      let capturedStatus = null;
      let capturedBody = null;
      const res = {
        status: (code) => {
          capturedStatus = code;
          return {
            json: (body) => {
              capturedBody = body;
            },
          };
        },
      };

      requireActiveDriver(req, res, () => {});
      assert.equal(capturedStatus, 403);
      assert.equal(capturedBody.error.code, 'DRIVER_NOT_VERIFIED');
    });

    it('requireActiveDriver denies drivers whose account status is inactive or suspended', () => {
      const req = {
        user: {
          role: 'AMBULANCE_DRIVER',
          status: 'suspended',
          driverVerificationStatus: 'VERIFIED',
        },
      };
      let capturedStatus = null;
      let capturedBody = null;
      const res = {
        status: (code) => {
          capturedStatus = code;
          return {
            json: (body) => {
              capturedBody = body;
            },
          };
        },
      };

      requireActiveDriver(req, res, () => {});
      assert.equal(capturedStatus, 403);
      assert.equal(capturedBody.error.code, 'ACCOUNT_INACTIVE');
    });

    it('requireActiveDriver grants access to verified active ambulance drivers', () => {
      const req = {
        user: {
          role: 'AMBULANCE_DRIVER',
          status: 'active',
          driverVerificationStatus: 'VERIFIED',
        },
      };
      let nextCalled = false;
      requireActiveDriver(req, {}, () => {
        nextCalled = true;
      });

      assert.equal(nextCalled, true);
    });
  });

  describe('4. HTTP Endpoint Validation & Behavior', () => {
    it('POST /api/v1/auth/login validates required email and password fields', async () => {
      const res = await fetch(`${baseUrl}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: '' }),
      });
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.error.code, 'INVALID_REQUEST');
    });

    it('GET /api/v1/auth/me rejects unauthenticated request with 401 UNAUTHORIZED', async () => {
      const res = await fetch(`${baseUrl}/api/v1/auth/me`);
      assert.equal(res.status, 401);
      const data = await res.json();
      assert.equal(data.error.code, 'UNAUTHORIZED');
    });

    it('GET /api/v1/driver/profile rejects unauthenticated request with 401 UNAUTHORIZED', async () => {
      const res = await fetch(`${baseUrl}/api/v1/driver/profile`);
      assert.equal(res.status, 401);
      const data = await res.json();
      assert.equal(data.error.code, 'UNAUTHORIZED');
    });

    it('POST /api/v1/auth/logout rejects unauthenticated request with 401 UNAUTHORIZED', async () => {
      const res = await fetch(`${baseUrl}/api/v1/auth/logout`, {
        method: 'POST',
      });
      assert.equal(res.status, 401);
      const data = await res.json();
      assert.equal(data.error.code, 'UNAUTHORIZED');
    });
  });
});

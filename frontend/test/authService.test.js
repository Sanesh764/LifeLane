import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { authService, normalizeUser } from '../src/services/authService.js';

describe('Phase 9: Frontend Authentication Service Tests', () => {
  // Mock sessionStorage in Node environment
  const mockStorage = new Map();
  global.window = {
    sessionStorage: {
      getItem: (key) => mockStorage.get(key) || null,
      setItem: (key, val) => mockStorage.set(key, String(val)),
      removeItem: (key) => mockStorage.delete(key),
      clear: () => mockStorage.clear(),
    },
  };

  beforeEach(() => {
    mockStorage.clear();
    authService.clearSession();
  });

  describe('1. Validation & Input Handling', () => {
    it('rejects empty email or password without making network call', async () => {
      const res1 = await authService.login('', 'somepass');
      assert.equal(res1.success, false);
      assert.match(res1.error, /Please enter both/);

      const res2 = await authService.login('driver@example.com', '');
      assert.equal(res2.success, false);
      assert.match(res2.error, /Please enter both/);
      assert.equal(authService.isAuthenticated(), false);
    });

    it('normalizes email before sending and validates response format', async () => {
      const originalFetch = global.fetch;
      let requestedUrl = null;
      let requestedBody = null;

      global.fetch = async (url, options) => {
        requestedUrl = url;
        requestedBody = JSON.parse(options.body);
        return {
          ok: false,
          status: 401,
          json: async () => ({
            error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password.' },
          }),
        };
      };

      try {
        const res = await authService.login('  Driver@Example.COM  ', 'testpass');
        assert.equal(res.success, false);
        assert.equal(res.error, 'Invalid email or password.');
        assert.ok(requestedUrl.endsWith('/auth/login'));
        assert.equal(requestedBody.email, 'driver@example.com');
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  describe('2. Successful Backend Authentication', () => {
    it('accepts login only when backend confirms active verified AMBULANCE_DRIVER', async () => {
      const originalFetch = global.fetch;
      global.fetch = async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            user: {
              id: 'user_123',
              name: 'Officer Amitabh Sen',
              email: 'driver@amburoute.demo',
              role: 'AMBULANCE_DRIVER',
              status: 'active',
              driverVerificationStatus: 'VERIFIED',
              assignedUnit: {
                callSign: 'Patna Unit 108 — Alpha',
                vehicleNumber: 'BR-01-EA-108',
                hospitalBase: 'PMCH Emergency Trauma Center',
              },
            },
            accessToken: 'valid.mock.jwt.token',
            tokenType: 'Bearer',
            expiresIn: 3600,
          },
        }),
      });

      try {
        const res = await authService.login('driver@amburoute.demo', 'AmbuRoute@Demo2026');
        assert.equal(res.success, true);
        assert.ok(res.user);
        assert.equal(res.user.authorized, true);
        assert.equal(res.user.driverName, 'Officer Amitabh Sen');
        assert.equal(res.user.callSign, 'Patna Unit 108 — Alpha');
        assert.equal(res.user.vehicleNumber, 'BR-01-EA-108');
        assert.equal(res.token, 'valid.mock.jwt.token');

        // Session stored
        assert.equal(authService.getToken(), 'valid.mock.jwt.token');
        assert.equal(authService.isAuthenticated(), true);
      } finally {
        global.fetch = originalFetch;
      }
    });

    it('rejects authentication if role is ROAD_USER or not an authorized driver', async () => {
      const originalFetch = global.fetch;
      global.fetch = async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            user: {
              id: 'road_user_456',
              name: 'Citizen User',
              email: 'citizen@example.com',
              role: 'ROAD_USER',
              status: 'active',
              driverVerificationStatus: 'NOT_REQUIRED',
            },
            accessToken: 'road.user.token',
          },
        }),
      });

      try {
        const res = await authService.login('citizen@example.com', 'mypass');
        assert.equal(res.success, false);
        assert.match(res.error, /lacks verified driver permissions/);
        assert.equal(authService.isAuthenticated(), false);
        assert.equal(authService.getToken(), null);
      } finally {
        global.fetch = originalFetch;
      }
    });

    it('rejects authentication if driver account is pending verification', async () => {
      const originalFetch = global.fetch;
      global.fetch = async () => ({
        ok: false,
        status: 403,
        json: async () => ({
          error: {
            code: 'DRIVER_NOT_VERIFIED',
            message: 'Driver account is awaiting verification.',
          },
        }),
      });

      try {
        const res = await authService.login('pending@example.com', 'mypass');
        assert.equal(res.success, false);
        assert.match(res.error, /awaiting verification/);
        assert.equal(authService.isAuthenticated(), false);
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  describe('3. Network Outage & Server Errors', () => {
    it('returns informative error without authenticating when backend is unreachable', async () => {
      const originalFetch = global.fetch;
      global.fetch = async () => {
        throw new TypeError('fetch failed');
      };

      try {
        const res = await authService.login('driver@example.com', 'password123');
        assert.equal(res.success, false);
        assert.match(res.error, /Unable to connect to AmbuRoute backend server/);
        assert.equal(authService.isAuthenticated(), false);
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  describe('4. Session Verification & Refresh (GET /api/v1/auth/me)', () => {
    it('restores authenticated session only when backend confirms token validity', async () => {
      // Simulate stored token
      mockStorage.set('amburoute_auth_token', 'saved.session.token');

      const originalFetch = global.fetch;
      let authHeaderUsed = null;

      global.fetch = async (url, options) => {
        authHeaderUsed = options.headers?.Authorization;
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: {
              user: {
                id: 'user_123',
                name: 'Verified Driver',
                email: 'driver@amburoute.demo',
                role: 'AMBULANCE_DRIVER',
                status: 'active',
                driverVerificationStatus: 'VERIFIED',
              },
            },
          }),
        };
      };

      try {
        const verified = await authService.verifySession();
        assert.ok(verified);
        assert.equal(verified.authorized, true);
        assert.equal(authHeaderUsed, 'Bearer saved.session.token');
        assert.equal(authService.isAuthenticated(), true);
      } finally {
        global.fetch = originalFetch;
      }
    });

    it('clears session when backend rejects token (e.g. expired or revoked)', async () => {
      mockStorage.set('amburoute_auth_token', 'revoked.token');

      const originalFetch = global.fetch;
      global.fetch = async () => ({
        ok: false,
        status: 401,
        json: async () => ({
          error: { code: 'TOKEN_REVOKED', message: 'Token has been revoked' },
        }),
      });

      try {
        const verified = await authService.verifySession();
        assert.equal(verified, null);
        assert.equal(authService.isAuthenticated(), false);
        assert.equal(authService.getToken(), null);
        assert.equal(global.window.sessionStorage.getItem('amburoute_auth_token'), null);
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  describe('5. Real Logout (POST /api/v1/auth/logout)', () => {
    it('calls backend logout endpoint and invalidates local session credentials', async () => {
      authService.setSession('active.session.token', {
        id: 'u1',
        name: 'Driver',
        role: 'AMBULANCE_DRIVER',
        status: 'active',
        driverVerificationStatus: 'VERIFIED',
      });
      assert.equal(authService.isAuthenticated(), true);

      let logoutCalled = false;
      let logoutToken = null;
      const originalFetch = global.fetch;

      global.fetch = async (url, options) => {
        if (url.endsWith('/auth/logout')) {
          logoutCalled = true;
          logoutToken = options.headers?.Authorization;
          return {
            ok: true,
            status: 200,
            json: async () => ({ data: { message: 'Logged out successfully.' } }),
          };
        }
        return { ok: false, status: 404 };
      };

      try {
        await authService.logout();
        assert.equal(logoutCalled, true);
        assert.equal(logoutToken, 'Bearer active.session.token');
        assert.equal(authService.isAuthenticated(), false);
        assert.equal(authService.getToken(), null);
        assert.equal(authService.getCurrentUser(), null);
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  describe('6. User Normalization', () => {
    it('computes authorized flag based on role, status, and verification', () => {
      const activeVerified = normalizeUser({
        role: 'AMBULANCE_DRIVER',
        status: 'active',
        driverVerificationStatus: 'VERIFIED',
      });
      assert.equal(activeVerified.authorized, true);

      const pendingVerification = normalizeUser({
        role: 'AMBULANCE_DRIVER',
        status: 'active',
        driverVerificationStatus: 'PENDING',
      });
      assert.equal(pendingVerification.authorized, false);

      const suspendedDriver = normalizeUser({
        role: 'AMBULANCE_DRIVER',
        status: 'suspended',
        driverVerificationStatus: 'VERIFIED',
      });
      assert.equal(suspendedDriver.authorized, false);

      const roadUser = normalizeUser({
        role: 'ROAD_USER',
        status: 'active',
        driverVerificationStatus: 'NOT_REQUIRED',
      });
      assert.equal(roadUser.authorized, false);
    });
  });
});

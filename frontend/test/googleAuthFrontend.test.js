import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { authService, normalizeUser } from '../src/services/authService.js';
import { apiClient } from '../src/services/api.js';

describe('Phase 3: Frontend Google OAuth Integration & Security Gate Tests', () => {
  const mockStorage = new Map();
  global.window = {
    location: {
      origin: 'http://localhost:5173',
      pathname: '/',
      hash: '',
    },
    sessionStorage: {
      getItem: (key) => mockStorage.get(key) || null,
      setItem: (key, val) => mockStorage.set(key, String(val)),
      removeItem: (key) => mockStorage.delete(key),
      clear: () => mockStorage.clear(),
    },
    localStorage: {
      getItem: (key) => mockStorage.get(key) || null,
      setItem: (key, val) => mockStorage.set(key, String(val)),
      removeItem: (key) => mockStorage.delete(key),
      clear: () => mockStorage.clear(),
    },
    history: {
      replaceState: () => {},
    },
  };

  beforeEach(() => {
    mockStorage.clear();
    authService.clearSession();
  });

  describe('1. Static UI & Role Isolation Verification', () => {
    const loginPageSource = readFileSync(resolve('src/pages/LoginPage.jsx'), 'utf-8');

    it('Google button is rendered in Public Sign In and New Citizen Register tabs', () => {
      assert.ok(loginPageSource.includes('Continue with Google'));
      assert.ok(loginPageSource.includes('Sign up with Google'));
      assert.ok(loginPageSource.includes('GoogleIcon'));
    });

    it('STRICT SECURITY RULE: Google button NEVER appears in Driver Cockpit login', () => {
      // Guard condition ensuring google button is excluded from driver mode
      assert.ok(loginPageSource.includes("authMode !== 'driver_login'"));
      // The driver cockpit section does not contain Google sign in elements
      const driverSectionMatch = loginPageSource.match(/authMode === 'driver_login'[\s\S]*?Sign In to Driver Cockpit/);
      assert.ok(driverSectionMatch);
      assert.equal(driverSectionMatch[0].includes('Continue with Google'), false);
    });

    it('LoginPage handles disabled and loading state on Google button during request', () => {
      assert.ok(loginPageSource.includes('isGoogleLoading'));
      assert.ok(loginPageSource.includes('disabled={isSubmitting || isGoogleLoading}'));
    });
  });

  describe('2. Google Authorization URL Request (getGoogleAuthUrl)', () => {
    it('successfully requests Google OAuth consent URL with session credentials enabled', async () => {
      const originalFetch = global.fetch;
      let capturedUrl = null;
      let capturedCredentials = null;

      global.fetch = async (url, options) => {
        capturedUrl = url;
        capturedCredentials = options?.credentials;
        return {
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            data: {
              url: 'https://accounts.google.com/o/oauth2/v2/auth?client_id=test-client&redirect_uri=http%3A%2F%2Flocalhost%3A5000%2Fapi%2Fv1%2Fauth%2Fgoogle%2Fcallback',
            },
          }),
        };
      };

      try {
        const res = await authService.getGoogleAuthUrl('http://localhost:5173');
        assert.equal(res.success, true);
        assert.ok(res.url.startsWith('https://accounts.google.com'));
        assert.ok(capturedUrl.includes('/auth/google/url?redirectUrl='));
        assert.equal(capturedCredentials, 'include');
      } finally {
        global.fetch = originalFetch;
      }
    });

    it('handles backend error response gracefully without crashing', async () => {
      const originalFetch = global.fetch;

      global.fetch = async () => ({
        ok: false,
        status: 500,
        json: async () => ({
          error: { code: 'GOOGLE_OAUTH_NOT_CONFIGURED', message: 'Missing Google Client ID configuration.' },
        }),
      });

      try {
        const res = await authService.getGoogleAuthUrl();
        assert.equal(res.success, false);
        assert.equal(res.code, 'GOOGLE_OAUTH_NOT_CONFIGURED');
        assert.match(res.error, /Missing Google Client ID/);
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  describe('3. Single-Use Ticket Exchange & Session Establishment', () => {
    it('rejects exchange requests with missing or empty ticket', async () => {
      const res1 = await authService.exchangeGoogleTicket('');
      assert.equal(res1.success, false);
      assert.equal(res1.code, 'MISSING_TICKET');

      const res2 = await authService.exchangeGoogleTicket(null);
      assert.equal(res2.success, false);
      assert.equal(res2.code, 'MISSING_TICKET');
    });

    it('successfully exchanges a valid ticket, establishes PUBLIC_USER session in storage', async () => {
      const originalFetch = global.fetch;
      let capturedBody = null;
      let capturedCredentials = null;

      global.fetch = async (url, options) => {
        capturedBody = JSON.parse(options.body);
        capturedCredentials = options?.credentials;
        return {
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            data: {
              user: {
                id: '66fa89c001',
                name: 'Ananya Sharma',
                email: 'ananya.sharma@example.org',
                role: 'PUBLIC_USER',
                status: 'active',
                driverVerificationStatus: 'NOT_REQUIRED',
                avatar: 'https://lh3.googleusercontent.com/photo.jpg',
                authProvider: 'google',
              },
              accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test.jwt',
              tokenType: 'Bearer',
              expiresIn: 3600,
            },
          }),
        };
      };

      try {
        const res = await authService.exchangeGoogleTicket('valid-test-ticket-xyz');
        assert.equal(res.success, true);
        assert.equal(capturedBody.ticket, 'valid-test-ticket-xyz');
        assert.equal(capturedCredentials, 'include');

        // Check user session normalization
        assert.equal(res.user.role, 'PUBLIC_USER');
        assert.equal(res.user.isPublicUser, true);
        assert.equal(res.user.authorized, false); // Not an ambulance driver
        assert.equal(res.user.isDriver, false);

        // Session must be persisted in storage
        assert.equal(authService.getToken(), 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test.jwt');
        const currentUser = authService.getCurrentUser();
        assert.ok(currentUser);
        assert.equal(currentUser.email, 'ananya.sharma@example.org');
        assert.equal(currentUser.role, 'PUBLIC_USER');
      } finally {
        global.fetch = originalFetch;
      }
    });

    it('STRICT SECURITY RULE: Rejects session and clears storage if Google OAuth returns AMBULANCE_DRIVER or ADMIN', async () => {
      const originalFetch = global.fetch;

      global.fetch = async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: {
            user: {
              id: '66fa89c099',
              name: 'Malicious Attempt',
              email: 'driver@amburoute.demo',
              role: 'AMBULANCE_DRIVER',
              status: 'active',
            },
            accessToken: 'invalid-privileged-jwt',
          },
        }),
      });

      try {
        const res = await authService.exchangeGoogleTicket('forged-ticket-123');
        assert.equal(res.success, false);
        assert.equal(res.code, 'GOOGLE_AUTH_ROLE_RESTRICTED');
        assert.match(res.error, /Ambulance driver and administrative accounts must use the Driver Cockpit/);

        // Storage must be completely clear
        assert.equal(authService.getToken(), null);
        assert.equal(authService.getCurrentUser(), null);
      } finally {
        global.fetch = originalFetch;
      }
    });

    it('handles expired or already-consumed tickets with friendly error message', async () => {
      const originalFetch = global.fetch;

      global.fetch = async () => ({
        ok: false,
        status: 400,
        json: async () => ({
          error: {
            code: 'INVALID_EXCHANGE_TICKET',
            message: 'OAuth exchange ticket is invalid, expired, or has already been used.',
          },
        }),
      });

      try {
        const res = await authService.exchangeGoogleTicket('already-consumed-ticket');
        assert.equal(res.success, false);
        assert.equal(res.code, 'INVALID_EXCHANGE_TICKET');
        assert.match(res.error, /invalid, expired, or has already been used/);
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  describe('4. Session Persistence & Role Boundaries', () => {
    it('public Google user session survives page refresh simulation', () => {
      const mockUser = {
        id: '66fa89c002',
        name: 'Rahul Verma',
        email: 'rahul.verma@example.org',
        role: 'PUBLIC_USER',
        status: 'active',
        driverVerificationStatus: 'NOT_REQUIRED',
        authProvider: 'google',
      };
      authService.setSession('persisted-google-token-456', mockUser);

      // Verify immediate read
      const restoredUser = authService.getCurrentUser();
      assert.ok(restoredUser);
      assert.equal(restoredUser.email, 'rahul.verma@example.org');
      assert.equal(restoredUser.isPublicUser, true);
      assert.equal(restoredUser.isDriver, false);
      assert.equal(restoredUser.authorized, false);
      assert.equal(authService.getToken(), 'persisted-google-token-456');

      // Logout clears public session
      authService.clearSession();
      assert.equal(authService.getToken(), null);
      assert.equal(authService.getCurrentUser(), null);
    });

    it('verified ambulance driver authentication remains completely isolated from Google auth', () => {
      const driverUser = {
        id: '66fa89c003',
        name: 'Sanesh Kumar',
        email: 'driver@amburoute.demo',
        role: 'AMBULANCE_DRIVER',
        status: 'active',
        driverVerificationStatus: 'VERIFIED',
        assignedUnit: { callSign: 'Patna Emergency 108', vehicleNumber: 'BR-01-EA-108' },
      };
      authService.setSession('driver-jwt-token-789', driverUser);

      const restoredDriver = authService.getCurrentUser();
      assert.ok(restoredDriver);
      assert.equal(restoredDriver.isDriver, true);
      assert.equal(restoredDriver.authorized, true);
      assert.equal(restoredDriver.isPublicUser, false);
      assert.equal(authService.isAuthenticated(), true);
    });
  });

  describe('5. ApiClient Methods Compatibility', () => {
    it('apiClient exposes getGoogleAuthUrl and exchangeGoogleTicket methods', () => {
      assert.equal(typeof apiClient.getGoogleAuthUrl, 'function');
      assert.equal(typeof apiClient.exchangeGoogleTicket, 'function');
    });
  });
});

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { app } from '../server.js';
import { env } from '../config/env.js';
import { connectDB } from '../config/db.js';
import { User } from '../models/User.js';
import { OAuthExchangeTicket } from '../models/OAuthExchangeTicket.js';
import { OAuthState } from '../models/OAuthState.js';
import {
  generateOAuthState,
  verifyOAuthState,
  validateFrontendRedirectUrl,
  getGoogleAuthorizationUrl,
  authenticateGoogleUser,
  createExchangeTicket,
  consumeExchangeTicket,
} from '../services/googleAuthService.js';

describe('Phase 2: Backend Google OAuth Implementation & Security Gates', () => {
  let server;
  let baseUrl;

  before(async () => {
    await connectDB();
    await new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  after(async () => {
    // Clean up test documents created during testing
    await User.deleteMany({ email: /@test-google-oauth\.org$/i });
    await OAuthExchangeTicket.deleteMany({ ticket: /^test-ticket-/ });
    await OAuthState.deleteMany({});
    await new Promise((resolve) => server.close(resolve));
    await mongoose.disconnect();
  });

  describe('1. OAuth State Generation & CSRF Protection', () => {
    it('generates a cryptographically signed state token bound to browser session and verifies single-use', async () => {
      const sessionToken = 'browser-session-xyz-123';
      const state = await generateOAuthState('http://localhost:5173/#public', sessionToken);
      assert.ok(state.includes('.'), 'State must be HMAC signed with payload.signature');

      // First verification: MUST succeed and match session
      const verified = await verifyOAuthState(state, sessionToken);
      assert.equal(verified.redirectUrl, 'http://localhost:5173/#public');
      assert.ok(verified.nonce && verified.nonce.length >= 16);

      // Replay check: MUST be rejected because state is single-use!
      await assert.rejects(
        () => verifyOAuthState(state, sessionToken),
        (err) => err.code === 'INVALID_OAUTH_STATE',
        'State cannot be replayed'
      );
    });

    it('rejects state if presented by a different browser session', async () => {
      const browser1Session = 'browser-session-user-1';
      const browser2Session = 'browser-session-user-2';
      const state = await generateOAuthState('http://localhost:5173', browser1Session);

      await assert.rejects(
        () => verifyOAuthState(state, browser2Session),
        (err) => err.code === 'OAUTH_SESSION_MISMATCH',
        'State must be bound to the initiating session'
      );
    });

    it('rejects tampered or forged state parameters', async () => {
      const state = await generateOAuthState('http://localhost:5173');
      const parts = state.split('.');
      const tampered = `${parts[0]}.forgedsignature12345`;

      await assert.rejects(
        () => verifyOAuthState(tampered),
        (err) => err.code === 'INVALID_OAUTH_STATE'
      );
    });

    it('sanitizes redirect destinations to prevent open redirect vulnerabilities', () => {
      const maliciousUrl = 'https://attacker-controlled-site.com/steal-token';
      const safe = validateFrontendRedirectUrl(maliciousUrl);
      assert.ok(
        env.GOOGLE.authorizedFrontendOrigins.includes(safe) ||
          env.GOOGLE.authorizedFrontendOrigins.some((orig) => safe.startsWith(orig)),
        'Must fallback to authorized frontend origin'
      );
    });

    it('builds a compliant Google authorization URL with required parameters', async () => {
      const authUrl = await getGoogleAuthorizationUrl('http://localhost:5173');
      assert.ok(authUrl.startsWith('https://accounts.google.com/o/oauth2/v2/auth'));
      assert.ok(authUrl.includes(`client_id=${env.GOOGLE.clientId}`));
      assert.ok(authUrl.includes('response_type=code'));
      assert.ok(authUrl.includes('scope=openid+email+profile'));
      assert.ok(authUrl.includes('state='));
    });
  });

  describe('2. MongoDB-Backed Single-Use Exchange Ticket Lifecycle', () => {
    it('creates and atomically consumes a short-lived exchange ticket', async () => {
      const dummyUser = {
        id: new mongoose.Types.ObjectId().toString(),
        name: 'Test Citizen',
        email: 'citizen1@test-google-oauth.org',
        role: 'PUBLIC_USER',
        status: 'active',
        avatar: 'https://example.com/avatar.jpg',
      };
      const dummyToken = 'mock-jwt-access-token-12345';

      const ticket = await createExchangeTicket(dummyUser, dummyToken, 3600);
      assert.ok(ticket && typeof ticket === 'string');

      // First consumption: MUST succeed
      const consumed = await consumeExchangeTicket(ticket);
      assert.equal(consumed.user.id, dummyUser.id);
      assert.equal(consumed.accessToken, dummyToken);
      assert.equal(consumed.user.role, 'PUBLIC_USER');

      // Second consumption (REPLAY ATTACK): MUST be rejected
      await assert.rejects(
        () => consumeExchangeTicket(ticket),
        (err) => err.code === 'INVALID_EXCHANGE_TICKET',
        'Replayed tickets must be rejected'
      );
    });

    it('rejects expired tickets', async () => {
      const expiredTicketId = 'test-ticket-expired-123';
      await OAuthExchangeTicket.create({
        ticket: expiredTicketId,
        user: {
          id: new mongoose.Types.ObjectId().toString(),
          name: 'Expired User',
          email: 'expired@test-google-oauth.org',
          role: 'PUBLIC_USER',
          status: 'active',
        },
        accessToken: 'expired-token',
        expiresAt: new Date(Date.now() - 5000), // 5 seconds in the past
      });

      await assert.rejects(
        () => consumeExchangeTicket(expiredTicketId),
        (err) => err.code === 'INVALID_EXCHANGE_TICKET'
      );
    });
  });

  describe('3. Strict Role Separation & Security Gates in Google Auth', () => {
    it('creates a new PUBLIC_USER when authenticating an unrecognised Google account', async () => {
      const googleProfile = {
        sub: `google-sub-${Date.now()}`,
        email: `newcitizen_${Date.now()}@test-google-oauth.org`,
        name: 'Priya Sharma',
        picture: 'https://lh3.googleusercontent.com/test-priya.png',
        emailVerified: true,
      };

      const session = await authenticateGoogleUser(googleProfile);
      assert.ok(session.accessToken);
      assert.equal(session.user.role, 'PUBLIC_USER');
      assert.equal(session.user.email, googleProfile.email);
      assert.equal(session.user.authProvider, 'google');

      // Verify in DB
      const userInDb = await User.findOne({ email: googleProfile.email });
      assert.ok(userInDb);
      assert.equal(userInDb.role, 'PUBLIC_USER');
      assert.equal(userInDb.googleId, googleProfile.sub);
      assert.equal(userInDb.driverVerificationStatus, 'NOT_REQUIRED');
    });

    it('links Google identity safely to an existing PUBLIC_USER account', async () => {
      const existingEmail = `existingpublic_${Date.now()}@test-google-oauth.org`;
      const passHash = await User.hashPassword('StandardPass123!');
      const existingPublicUser = await User.create({
        name: 'Existing Citizen',
        email: existingEmail,
        passwordHash: passHash,
        role: 'PUBLIC_USER',
        status: 'active',
      });

      const googleProfile = {
        sub: `google-link-${Date.now()}`,
        email: existingEmail,
        name: 'Existing Citizen Google',
        picture: 'https://lh3.googleusercontent.com/linked.png',
        emailVerified: true,
      };

      const session = await authenticateGoogleUser(googleProfile);
      assert.equal(session.user.id, existingPublicUser._id.toString());
      assert.equal(session.user.role, 'PUBLIC_USER');

      // Verify DB document has updated googleId without altering password or role
      const updated = await User.findById(existingPublicUser._id).select('+passwordHash');
      assert.equal(updated.googleId, googleProfile.sub);
      assert.equal(updated.role, 'PUBLIC_USER');
      assert.ok(updated.passwordHash); // Original password preserved!
    });

    it('STRICT SECURITY RULE: Rejects AMBULANCE_DRIVER accounts attempting Google login', async () => {
      const driverEmail = `driver_${Date.now()}@test-google-oauth.org`;
      const passHash = await User.hashPassword('AmbulanceDriverSecret999!');
      await User.create({
        name: 'Officer Rajesh Kumar',
        email: driverEmail,
        passwordHash: passHash,
        role: 'AMBULANCE_DRIVER',
        status: 'active',
        driverVerificationStatus: 'VERIFIED',
        assignedUnit: { callSign: 'Patna 108' },
      });

      const googleProfile = {
        sub: `google-driver-hijack-${Date.now()}`,
        email: driverEmail,
        name: 'Rajesh Kumar Google',
        emailVerified: true,
      };

      await assert.rejects(
        () => authenticateGoogleUser(googleProfile),
        (err) => {
          assert.equal(err.code, 'GOOGLE_AUTH_ROLE_RESTRICTED');
          assert.match(err.message, /Ambulance drivers and administrators must sign in through their dedicated portal/i);
          return true;
        },
        'Driver accounts must be strictly prohibited from authenticating via Google'
      );
    });

    it('STRICT SECURITY RULE: Rejects ADMIN accounts attempting Google login', async () => {
      const adminEmail = `admin_${Date.now()}@test-google-oauth.org`;
      const passHash = await User.hashPassword('SuperAdminPass123!');
      await User.create({
        name: 'System Admin',
        email: adminEmail,
        passwordHash: passHash,
        role: 'ADMIN',
        status: 'active',
      });

      const googleProfile = {
        sub: `google-admin-hijack-${Date.now()}`,
        email: adminEmail,
        name: 'System Admin Google',
        emailVerified: true,
      };

      await assert.rejects(
        () => authenticateGoogleUser(googleProfile),
        (err) => {
          assert.equal(err.code, 'GOOGLE_AUTH_ROLE_RESTRICTED');
          return true;
        },
        'Admin accounts must be strictly prohibited from authenticating via Google'
      );
    });
  });

  describe('4. HTTP Endpoints & Route Compatibility', () => {
    it('GET /api/v1/auth/google/url returns JSON with authorization URL', async () => {
      const res = await fetch(`${baseUrl}/api/v1/auth/google/url?redirectUrl=http://localhost:5173`);
      assert.equal(res.status, 200);

      const json = await res.json();
      assert.equal(json.success, true);
      assert.ok(json.data.url.includes('accounts.google.com'));
    });

    it('Directs to Google Cloud Console configured route /api/auth/google seamlessly', async () => {
      const res = await fetch(`${baseUrl}/api/auth/google?redirectUrl=http://localhost:5173`, {
        headers: { Accept: 'application/json' },
      });
      assert.equal(res.status, 200);

      const json = await res.json();
      assert.equal(json.success, true);
      assert.ok(json.data.url.includes('accounts.google.com'));
    });

    it('GET /api/auth/google/callback redirects to frontend with error if code is missing', async () => {
      const state = await generateOAuthState('http://localhost:5173');
      const res = await fetch(`${baseUrl}/api/auth/google/callback?state=${encodeURIComponent(state)}`, {
        redirect: 'manual',
      });
      assert.equal(res.status, 302);

      const location = res.headers.get('location');
      assert.ok(location.includes('#login?error='));
      assert.ok(location.includes('MISSING_AUTH_CODE'));
    });

    it('POST /api/v1/auth/google/exchange returns 400 for missing or invalid ticket', async () => {
      const res = await fetch(`${baseUrl}/api/v1/auth/google/exchange`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticket: 'non-existent-ticket-xyz' }),
      });
      assert.equal(res.status, 400);

      const json = await res.json();
      assert.equal(json.error.code, 'INVALID_EXCHANGE_TICKET');
    });

    it('POST /api/auth/google/exchange routes to the same handler without version prefix', async () => {
      const res = await fetch(`${baseUrl}/api/auth/google/exchange`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticket: 'non-existent-ticket-xyz' }),
      });
      assert.equal(res.status, 400);

      const json = await res.json();
      assert.equal(json.error.code, 'INVALID_EXCHANGE_TICKET');
    });
  });

  describe('5. Credentialed CORS & Preflight Compliance', () => {
    it('OPTIONS preflight from localhost:5173 returns 200 with Access-Control-Allow-Credentials: true', async () => {
      const res = await fetch(`${baseUrl}/api/v1/auth/google/url?redirectUrl=http%3A%2F%2Flocalhost%3A5173`, {
        method: 'OPTIONS',
        headers: {
          Origin: 'http://localhost:5173',
          'Access-Control-Request-Method': 'GET',
          'Access-Control-Request-Headers': 'Content-Type, Accept',
        },
      });

      assert.equal(res.status, 200);
      assert.equal(res.headers.get('access-control-allow-origin'), 'http://localhost:5173');
      assert.equal(res.headers.get('access-control-allow-credentials'), 'true');
      assert.ok(res.headers.get('access-control-allow-methods').includes('GET'));
      assert.ok(res.headers.get('access-control-allow-headers'));
    });

    it('GET request with Origin: http://localhost:5173 includes Access-Control-Allow-Credentials: true', async () => {
      const res = await fetch(`${baseUrl}/api/v1/auth/google/url?redirectUrl=http%3A%2F%2Flocalhost%3A5173`, {
        method: 'GET',
        headers: {
          Origin: 'http://localhost:5173',
          Accept: 'application/json',
        },
      });

      assert.equal(res.status, 200);
      assert.equal(res.headers.get('access-control-allow-origin'), 'http://localhost:5173');
      assert.equal(res.headers.get('access-control-allow-credentials'), 'true');
      const body = await res.json();
      assert.equal(body.success, true);
      assert.ok(body.data?.url);
    });

    it('Accepts production AWS Amplify origin with exact origin and credentials enabled', async () => {
      const res = await fetch(`${baseUrl}/api/v1/auth/google/url?redirectUrl=https%3A%2F%2Fmain.d37a0y0p7v19sh.amplifyapp.com`, {
        method: 'OPTIONS',
        headers: {
          Origin: 'https://main.d37a0y0p7v19sh.amplifyapp.com',
          'Access-Control-Request-Method': 'GET',
        },
      });

      assert.equal(res.status, 200);
      assert.equal(res.headers.get('access-control-allow-origin'), 'https://main.d37a0y0p7v19sh.amplifyapp.com');
      assert.equal(res.headers.get('access-control-allow-credentials'), 'true');
    });

    it('Rejects unauthorized origins by omitting Access-Control-Allow-Origin', async () => {
      const res = await fetch(`${baseUrl}/api/v1/auth/google/url`, {
        method: 'OPTIONS',
        headers: {
          Origin: 'https://unauthorized-malicious-domain.com',
          'Access-Control-Request-Method': 'GET',
        },
      });

      assert.equal(res.headers.get('access-control-allow-origin'), null);
      assert.equal(res.headers.get('access-control-allow-credentials'), null);
    });

    it('OPTIONS preflight for POST /api/v1/auth/google/exchange returns 200 with credentials: true', async () => {
      const res = await fetch(`${baseUrl}/api/v1/auth/google/exchange`, {
        method: 'OPTIONS',
        headers: {
          Origin: 'http://localhost:5173',
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'Content-Type, Accept',
        },
      });

      assert.equal(res.status, 200);
      assert.equal(res.headers.get('access-control-allow-origin'), 'http://localhost:5173');
      assert.equal(res.headers.get('access-control-allow-credentials'), 'true');
      assert.ok(res.headers.get('access-control-allow-methods').includes('POST'));
    });
  });
});

import express from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { isDbConnected } from '../config/db.js';
import { User } from '../models/User.js';
import { authenticate, revokeToken } from '../middlewares/auth.js';
import { loginRateLimiter } from '../middlewares/rateLimiter.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  getGoogleAuthorizationUrl,
  verifyOAuthState,
  exchangeCodeForTokens,
  fetchGoogleProfile,
  authenticateGoogleUser,
  createExchangeTicket,
  consumeExchangeTicket,
  validateFrontendRedirectUrl,
} from '../services/googleAuthService.js';

const router = express.Router();

/**
 * POST /api/v1/auth/register
 * Public user registration endpoint
 * Automatically assigns PUBLIC_USER role. Strictly forbids driver/admin role assignment.
 */
router.post(
  '/register',
  asyncHandler(async (req, res) => {
    const { name, email, password } = req.body || {};

    // Validate database connection
    if (!isDbConnected()) {
      throw ApiError.serviceUnavailable(
        'Registration service is temporarily unavailable. Database is disconnected.',
        'DATABASE_UNAVAILABLE'
      );
    }

    // Email validation
    if (!email || typeof email !== 'string' || !email.trim()) {
      throw ApiError.badRequest('Valid email address is required.', 'INVALID_EMAIL');
    }

    const normalizedEmail = email.trim().toLowerCase();
    const emailRegex = /^\S+@\S+\.\S+$/;
    if (!emailRegex.test(normalizedEmail)) {
      throw ApiError.badRequest('Please provide a valid email address format.', 'INVALID_EMAIL');
    }

    // Name validation & automatic derivation if omitted
    let finalName = '';
    if (name && typeof name === 'string' && name.trim()) {
      finalName = name.trim();
      if (finalName.length < 2 || finalName.length > 100) {
        throw ApiError.badRequest(
          'Full name must be between 2 and 100 characters.',
          'INVALID_NAME'
        );
      }
    } else {
      const emailPrefix = normalizedEmail.split('@')[0].replace(/[._-]+/g, ' ').trim();
      finalName = emailPrefix
        ? emailPrefix.charAt(0).toUpperCase() + emailPrefix.slice(1)
        : 'Citizen User';
    }

    if (!password || typeof password !== 'string' || password.length < 8) {
      throw ApiError.badRequest(
        'Password is required and must be at least 8 characters long.',
        'INVALID_PASSWORD'
      );
    }

    // Check if email already registered
    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) {
      throw ApiError.conflict(
        'An account with this email address already exists.',
        'EMAIL_ALREADY_REGISTERED'
      );
    }

    // Secure password hashing
    const passwordHash = await User.hashPassword(password);

    // Strictly enforce role: PUBLIC_USER (never allow role escalation to AMBULANCE_DRIVER or ADMIN)
    const newUser = new User({
      name: finalName,
      email: normalizedEmail,
      passwordHash,
      role: 'PUBLIC_USER',
      status: 'active',
      driverVerificationStatus: 'NOT_REQUIRED',
      assignedUnit: { callSign: null, vehicleNumber: null, hospitalBase: null },
    });

    await newUser.save();

    // Sign JWT access token with unique jti to guarantee anti-collision against revocation list
    const expiresIn = parseInt(env.JWT_EXPIRES_IN, 10) || 3600;
    const token = jwt.sign(
      {
        sub: newUser._id.toString(),
        email: newUser.email,
        role: newUser.role,
        status: newUser.status,
        jti: crypto.randomUUID(),
      },
      env.JWT_SECRET,
      { expiresIn }
    );

    return ApiResponse.created(
      {
        user: {
          id: newUser._id.toString(),
          name: newUser.name,
          email: newUser.email,
          role: newUser.role,
          status: newUser.status,
          driverVerificationStatus: newUser.driverVerificationStatus,
          assignedUnit: newUser.assignedUnit,
        },
        accessToken: token,
        tokenType: 'Bearer',
        expiresIn,
      },
      'User registered successfully.'
    ).send(res);
  })
);

/**
 * POST /api/v1/auth/login
 * Driver / User login endpoint
 */
router.post(
  '/login',
  loginRateLimiter.middleware(),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body || {};

    if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
      if (req.rateLimiter) req.rateLimiter.recordFailure();
      throw ApiError.badRequest('Email and password are required strings.', 'INVALID_REQUEST');
    }

    if (!isDbConnected()) {
      throw ApiError.serviceUnavailable(
        'Authentication service is temporarily unavailable. Database is disconnected.',
        'DATABASE_UNAVAILABLE'
      );
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Query user and explicitly select passwordHash
    const user = await User.findOne({ email: normalizedEmail }).select('+passwordHash');

    if (!user) {
      if (req.rateLimiter) req.rateLimiter.recordFailure();
      throw ApiError.unauthorized('Invalid email or password.', 'INVALID_CREDENTIALS');
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      if (req.rateLimiter) req.rateLimiter.recordFailure();
      throw ApiError.unauthorized('Invalid email or password.', 'INVALID_CREDENTIALS');
    }

    // Account status check
    if (user.status !== 'active') {
      throw ApiError.forbidden(
        `Account is ${user.status}. Active account status is required to log in.`,
        'ACCOUNT_INACTIVE'
      );
    }

    // Driver verification check
    if (user.role === 'AMBULANCE_DRIVER' && user.driverVerificationStatus !== 'VERIFIED') {
      throw ApiError.forbidden(
        'Driver account is pending verification or has been rejected.',
        'DRIVER_NOT_VERIFIED'
      );
    }

    // Reset rate limiter on successful authentication
    if (req.rateLimiter) req.rateLimiter.recordSuccess();

    // Sign JWT access token with unique jti to guarantee anti-collision against revocation list
    const expiresIn = parseInt(env.JWT_EXPIRES_IN, 10) || 3600;
    const token = jwt.sign(
      {
        sub: user._id.toString(),
        email: user.email,
        role: user.role,
        status: user.status,
        jti: crypto.randomUUID(),
      },
      env.JWT_SECRET,
      { expiresIn }
    );

    return ApiResponse.ok(
      {
        user: {
          id: user._id.toString(),
          name: user.name,
          email: user.email,
          role: user.role,
          status: user.status,
          driverVerificationStatus: user.driverVerificationStatus,
          assignedUnit: user.assignedUnit,
        },
        accessToken: token,
        tokenType: 'Bearer',
        expiresIn,
      },
      'Login successful.'
    ).send(res);
  })
);

/**
 * GET /api/v1/auth/me
 * Returns authenticated user profile
 */
router.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    return ApiResponse.ok(
      {
        user: {
          id: req.user._id.toString(),
          name: req.user.name,
          email: req.user.email,
          role: req.user.role,
          status: req.user.status,
          driverVerificationStatus: req.user.driverVerificationStatus,
          assignedUnit: req.user.assignedUnit,
        },
      },
      'User profile retrieved successfully.'
    ).send(res);
  })
);

/**
 * POST /api/v1/auth/logout
 * Invalidate the active authentication token
 */
router.post(
  '/logout',
  authenticate,
  asyncHandler(async (req, res) => {
    revokeToken(req.token, req.tokenExp);
    return ApiResponse.ok(
      {
        message: 'Logged out successfully.',
      },
      'Logged out successfully.'
    ).send(res);
  })
);

function getCookie(req, name) {
  const header = req.headers?.cookie;
  if (!header) return null;
  const match = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * GET /api/v1/auth/google/url
 * Returns JSON containing the Google OAuth consent URL with session-bound state
 */
router.get(
  '/google/url',
  asyncHandler(async (req, res) => {
    const redirectUrl = req.query.redirectUrl || req.query.redirect_uri;
    const sessionToken = getCookie(req, 'amburoute_oauth_session') || crypto.randomUUID();
    const authUrl = await getGoogleAuthorizationUrl(redirectUrl, sessionToken);

    res.setHeader(
      'Set-Cookie',
      `amburoute_oauth_session=${encodeURIComponent(sessionToken)}; Path=/; HttpOnly; SameSite=${env.IS_PRODUCTION ? 'None' : 'Lax'}${env.IS_PRODUCTION ? '; Secure' : ''}; Max-Age=600`
    );

    return ApiResponse.ok(
      { url: authUrl },
      'Google authorization URL generated successfully.'
    ).send(res);
  })
);

/**
 * GET /api/v1/auth/google
 * Initiate Google OAuth authentication flow - redirects directly to Google consent screen
 * or returns JSON if Accept: application/json or redirect=false
 */
router.get(
  '/google',
  asyncHandler(async (req, res) => {
    const redirectUrl = req.query.redirectUrl || req.query.redirect_uri;
    const sessionToken = getCookie(req, 'amburoute_oauth_session') || crypto.randomUUID();
    const authUrl = await getGoogleAuthorizationUrl(redirectUrl, sessionToken);

    res.setHeader(
      'Set-Cookie',
      `amburoute_oauth_session=${encodeURIComponent(sessionToken)}; Path=/; HttpOnly; SameSite=${env.IS_PRODUCTION ? 'None' : 'Lax'}${env.IS_PRODUCTION ? '; Secure' : ''}; Max-Age=600`
    );

    if (req.query.redirect === 'false' || req.headers.accept?.includes('application/json')) {
      return ApiResponse.ok(
        { url: authUrl },
        'Google authorization URL generated successfully.'
      ).send(res);
    }

    return res.redirect(authUrl);
  })
);

/**
 * GET /api/v1/auth/google/callback
 * Google OAuth redirect callback endpoint with atomic state consumption
 */
router.get(
  '/google/callback',
  asyncHandler(async (req, res) => {
    const { code, state, error: googleError } = req.query;

    let targetRedirect = env.GOOGLE.authorizedFrontendOrigins[0] || 'http://localhost:5173';
    const sessionToken = getCookie(req, 'amburoute_oauth_session');

    // Clean up session cookie
    res.setHeader(
      'Set-Cookie',
      `amburoute_oauth_session=; Path=/; HttpOnly; SameSite=${env.IS_PRODUCTION ? 'None' : 'Lax'}${env.IS_PRODUCTION ? '; Secure' : ''}; Max-Age=0`
    );

    // Verify and atomically consume state parameter (single-use, anti-replay)
    try {
      if (state) {
        const statePayload = await verifyOAuthState(state, sessionToken);
        targetRedirect = statePayload.redirectUrl;
      } else {
        throw new Error('Missing state parameter from Google OAuth response.');
      }
    } catch (stateErr) {
      console.warn('[GoogleCallback] State verification error:', stateErr.message);
      const errRedirect = `${targetRedirect}/#login?error=${encodeURIComponent(stateErr.message)}&code=INVALID_OAUTH_STATE`;
      return res.redirect(errRedirect);
    }

    // Check if Google returned an error (e.g. user cancelled)
    if (googleError) {
      console.warn('[GoogleCallback] Google error:', googleError);
      const errRedirect = `${targetRedirect}/#login?error=${encodeURIComponent('Google sign in was cancelled or denied.')}&code=GOOGLE_AUTH_CANCELLED`;
      return res.redirect(errRedirect);
    }

    if (!code) {
      const errRedirect = `${targetRedirect}/#login?error=${encodeURIComponent('No authorization code received from Google.')}&code=MISSING_AUTH_CODE`;
      return res.redirect(errRedirect);
    }

    try {
      // 1. Exchange authorization code for Google access token
      const { accessToken } = await exchangeCodeForTokens(code);

      // 2. Retrieve verified Google profile
      const profile = await fetchGoogleProfile(accessToken);

      // 3. Authenticate or register PUBLIC_USER with strict role checks
      const session = await authenticateGoogleUser(profile);

      // 4. Create single-use exchange ticket stored in MongoDB (60s TTL)
      const ticket = await createExchangeTicket(
        session.user,
        session.accessToken,
        session.expiresIn
      );

      // 5. Safely redirect browser to frontend with exchange ticket (no JWT in URL)
      const successRedirect = `${targetRedirect}/#oauth_callback?ticket=${encodeURIComponent(ticket)}`;
      return res.redirect(successRedirect);
    } catch (authErr) {
      console.error('[GoogleCallback] Authentication error:', authErr.message);
      const errorCode = authErr.code || 'GOOGLE_AUTH_FAILED';
      const errorMessage = authErr.message || 'Google authentication failed.';
      const errRedirect = `${targetRedirect}/#login?error=${encodeURIComponent(errorMessage)}&code=${encodeURIComponent(errorCode)}`;
      return res.redirect(errRedirect);
    }
  })
);

/**
 * POST /api/v1/auth/google/exchange
 * Atomically consume single-use ticket and establish authenticated session
 */
router.post(
  '/google/exchange',
  asyncHandler(async (req, res) => {
    const { ticket } = req.body || {};

    if (!ticket || typeof ticket !== 'string' || !ticket.trim()) {
      throw ApiError.badRequest('OAuth exchange ticket is required.', 'MISSING_TICKET');
    }

    const sessionData = await consumeExchangeTicket(ticket.trim());

    return ApiResponse.ok(
      {
        user: sessionData.user,
        accessToken: sessionData.accessToken,
        tokenType: sessionData.tokenType,
        expiresIn: sessionData.expiresIn,
      },
      'Google authentication completed successfully.'
    ).send(res);
  })
);

export default router;

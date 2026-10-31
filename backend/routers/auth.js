import express from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { isDbConnected } from '../config/db.js';
import { User } from '../models/User.js';
import { authenticate, revokeToken } from '../middlewares/auth.js';
import { loginRateLimiter } from '../middlewares/rateLimiter.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';

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

    // Input validation
    if (!name || typeof name !== 'string' || !name.trim()) {
      throw ApiError.badRequest(
        'Full name is required (string between 2 and 100 characters).',
        'INVALID_NAME'
      );
    }

    const trimmedName = name.trim();
    if (trimmedName.length < 2 || trimmedName.length > 100) {
      throw ApiError.badRequest(
        'Full name must be between 2 and 100 characters.',
        'INVALID_NAME'
      );
    }

    if (!email || typeof email !== 'string' || !email.trim()) {
      throw ApiError.badRequest('Valid email address is required.', 'INVALID_EMAIL');
    }

    const normalizedEmail = email.trim().toLowerCase();
    const emailRegex = /^\S+@\S+\.\S+$/;
    if (!emailRegex.test(normalizedEmail)) {
      throw ApiError.badRequest('Please provide a valid email address format.', 'INVALID_EMAIL');
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
      name: trimmedName,
      email: normalizedEmail,
      passwordHash,
      role: 'PUBLIC_USER',
      status: 'active',
      driverVerificationStatus: 'NOT_REQUIRED',
      assignedUnit: { callSign: null, vehicleNumber: null, hospitalBase: null },
    });

    await newUser.save();

    // Sign JWT access token
    const expiresIn = parseInt(env.JWT_EXPIRES_IN, 10) || 3600;
    const token = jwt.sign(
      {
        sub: newUser._id.toString(),
        email: newUser.email,
        role: newUser.role,
        status: newUser.status,
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

    // Sign JWT access token
    const expiresIn = parseInt(env.JWT_EXPIRES_IN, 10) || 3600;
    const token = jwt.sign(
      {
        sub: user._id.toString(),
        email: user.email,
        role: user.role,
        status: user.status,
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

export default router;

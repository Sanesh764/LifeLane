import express from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { isDbConnected } from '../config/db.js';
import { User } from '../models/User.js';
import { authenticate, revokeToken } from '../middlewares/auth.js';
import { loginRateLimiter } from '../middlewares/rateLimiter.js';

const router = express.Router();

/**
 * POST /api/v1/auth/login
 * Driver / User login endpoint
 */
router.post('/login', loginRateLimiter.middleware(), async (req, res, next) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
      if (req.rateLimiter) req.rateLimiter.recordFailure();
      return res.status(400).json({
        error: {
          code: 'INVALID_REQUEST',
          message: 'Email and password are required strings.',
        },
      });
    }

    if (!isDbConnected()) {
      return res.status(503).json({
        error: {
          code: 'DATABASE_UNAVAILABLE',
          message: 'Authentication service is temporarily unavailable. Database is disconnected.',
        },
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Query user and explicitly select passwordHash
    const user = await User.findOne({ email: normalizedEmail }).select('+passwordHash');

    if (!user) {
      if (req.rateLimiter) req.rateLimiter.recordFailure();
      return res.status(401).json({
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid email or password.',
        },
      });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      if (req.rateLimiter) req.rateLimiter.recordFailure();
      return res.status(401).json({
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid email or password.',
        },
      });
    }

    // Account status check
    if (user.status !== 'active') {
      return res.status(403).json({
        error: {
          code: 'ACCOUNT_INACTIVE',
          message: `Account is ${user.status}. Active account status is required to log in.`,
        },
      });
    }

    // Driver verification check
    if (user.role === 'AMBULANCE_DRIVER' && user.driverVerificationStatus !== 'VERIFIED') {
      return res.status(403).json({
        error: {
          code: 'DRIVER_NOT_VERIFIED',
          message: 'Driver account is pending verification or has been rejected.',
        },
      });
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

    res.status(200).json({
      data: {
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
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/auth/me
 * Returns authenticated user profile
 */
router.get('/me', authenticate, (req, res) => {
  res.status(200).json({
    data: {
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
  });
});

/**
 * POST /api/v1/auth/logout
 * Invalidate the active authentication token
 */
router.post('/logout', authenticate, (req, res) => {
  revokeToken(req.token, req.tokenExp);
  res.status(200).json({
    data: {
      message: 'Logged out successfully.',
    },
  });
});

export default router;

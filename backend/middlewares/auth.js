import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { isDbConnected } from '../config/db.js';
import { User } from '../models/User.js';

// In-memory token revocation registry
const revokedTokens = new Map(); // token -> expiryEpochMs

// Periodic cleanup of expired revoked tokens every 10 minutes
const cleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [token, expiry] of revokedTokens.entries()) {
    if (now > expiry) {
      revokedTokens.delete(token);
    }
  }
}, 10 * 60 * 1000);
if (cleanupInterval.unref) {
  cleanupInterval.unref();
}

/**
 * Add a token to the revocation list until its natural expiry
 */
export const revokeToken = (token, decodedExpSeconds) => {
  if (!token) return;
  const expiryMs = decodedExpSeconds ? decodedExpSeconds * 1000 : Date.now() + 3600 * 1000;
  revokedTokens.set(token, expiryMs);
};

export const isTokenRevoked = (token) => {
  return revokedTokens.has(token);
};

export const clearRevocationsForTesting = () => {
  revokedTokens.clear();
};

/**
 * Authentication Middleware: Validates Bearer JWT
 */
export const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication token required in Authorization header (Bearer <token>).',
        },
      });
    }

    const token = authHeader.substring(7).trim();
    if (!token) {
      return res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Malformed authorization header.',
        },
      });
    }

    // Check if token was explicitly revoked via logout
    if (isTokenRevoked(token)) {
      return res.status(401).json({
        error: {
          code: 'TOKEN_REVOKED',
          message: 'This session has been logged out. Please log in again.',
        },
      });
    }

    // Verify token cryptographic signature and expiration
    let decoded;
    try {
      decoded = jwt.verify(token, env.JWT_SECRET);
    } catch (jwtErr) {
      if (jwtErr.name === 'TokenExpiredError') {
        return res.status(401).json({
          error: {
            code: 'TOKEN_EXPIRED',
            message: 'Authentication token has expired. Please log in again.',
          },
        });
      }
      return res.status(401).json({
        error: {
          code: 'INVALID_TOKEN',
          message: 'Invalid authentication token.',
        },
      });
    }

    // Retrieve active user from database to ensure account was not disabled after token issuance
    if (!isDbConnected()) {
      return res.status(503).json({
        error: {
          code: 'DATABASE_UNAVAILABLE',
          message: 'Database is temporarily unavailable.',
        },
      });
    }

    const user = await User.findById(decoded.sub);
    if (!user) {
      return res.status(401).json({
        error: {
          code: 'USER_NOT_FOUND',
          message: 'The user account associated with this token no longer exists.',
        },
      });
    }

    if (user.status !== 'active') {
      return res.status(403).json({
        error: {
          code: 'ACCOUNT_INACTIVE',
          message: `User account is ${user.status}. Access is denied.`,
        },
      });
    }

    // Attach user and raw token to request
    req.user = user;
    req.token = token;
    req.tokenExp = decoded.exp;
    next();
  } catch (err) {
    next(err);
  }
};

/**
 * Role-Based Access Control Middleware
 * Supports standard roles: 'AMBULANCE_DRIVER', 'ROAD_USER', 'ADMIN', and alias 'driver', 'admin'
 */
export const requireRole = (...allowedRoles) => {
  const normalizedAllowed = allowedRoles.map((r) => {
    const upper = r.toUpperCase();
    if (upper === 'DRIVER') return 'AMBULANCE_DRIVER';
    return upper;
  });

  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required before checking permissions.',
        },
      });
    }

    const userRole = (req.user.role || '').toUpperCase();
    if (!normalizedAllowed.includes(userRole)) {
      return res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: `Access denied. Requires one of roles: ${allowedRoles.join(', ')}.`,
        },
      });
    }

    next();
  };
};

/**
 * Driver Verification Middleware
 * Requires that user is AMBULANCE_DRIVER, active, and driverVerificationStatus === 'VERIFIED'
 */
export const requireActiveDriver = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required.',
      },
    });
  }

  const role = (req.user.role || '').toUpperCase();
  if (role !== 'AMBULANCE_DRIVER' && role !== 'ADMIN') {
    return res.status(403).json({
      error: {
        code: 'FORBIDDEN',
        message: 'Access restricted to authorized ambulance drivers.',
      },
    });
  }

  if (req.user.status !== 'active') {
    return res.status(403).json({
      error: {
        code: 'ACCOUNT_INACTIVE',
        message: `Driver account is ${req.user.status}. Active account required.`,
      },
    });
  }

  if (role === 'AMBULANCE_DRIVER' && req.user.driverVerificationStatus !== 'VERIFIED') {
    return res.status(403).json({
      error: {
        code: 'DRIVER_NOT_VERIFIED',
        message: 'Ambulance driver account has not completed official verification.',
      },
    });
  }

  next();
};

/**
 * Optional Authentication Middleware
 * If Authorization Bearer token is provided, validates and attaches req.user.
 * If not provided or invalid, proceeds gracefully without failing (req.user = null).
 */
export const optionalAuthenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      req.user = null;
      return next();
    }

    const token = authHeader.substring(7).trim();
    if (!token || isTokenRevoked(token)) {
      req.user = null;
      return next();
    }

    let decoded;
    try {
      decoded = jwt.verify(token, env.JWT_SECRET);
    } catch {
      req.user = null;
      return next();
    }

    if (!isDbConnected()) {
      req.user = null;
      return next();
    }

    const user = await User.findById(decoded.sub);
    if (!user || user.status !== 'active') {
      req.user = null;
      return next();
    }

    req.user = user;
    req.token = token;
    req.tokenExp = decoded.exp;
    next();
  } catch {
    req.user = null;
    next();
  }
};

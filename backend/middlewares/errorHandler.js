/**
 * Centralized Error & Developer Logging Middleware for AmbuRoute
 * 
 * Conforms to:
 * - docs/API.md Section 6 (Standard Error Response)
 * - AmbuRoute Code Quality Phase Architecture (Phases 5 & 8)
 * 
 * Handles:
 * - Custom ApiError instances
 * - MongoDB duplicate key errors (11000 -> HTTP 409)
 * - Mongoose validation errors (ValidationError -> HTTP 422)
 * - Mongoose cast errors (CastError -> HTTP 400)
 * - JWT authentication errors (JsonWebTokenError & TokenExpiredError -> HTTP 401)
 * - Express JSON syntax and payload size errors (HTTP 400 / 413)
 * - Unknown / unexpected errors (HTTP 500)
 * - Structured console logging: [YYYY-MM-DD HH:mm:ss] LEVEL | METHOD /path | CODE | message
 */

import { ApiError } from '../utils/ApiError.js';
import { env } from '../config/env.js';

/**
 * Format date for structured developer console logging
 */
function formatLogTimestamp() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const YYYY = now.getFullYear();
  const MM = pad(now.getMonth() + 1);
  const DD = pad(now.getDate());
  const HH = pad(now.getHours());
  const mm = pad(now.getMinutes());
  const ss = pad(now.getSeconds());
  return `${YYYY}-${MM}-${DD} ${HH}:${mm}:${ss}`;
}

/**
 * Structured console logger for AmbuRoute backend
 */
export const logger = {
  info(method, path, message, extra = null) {
    const ts = formatLogTimestamp();
    const extraStr = extra ? ` | ${JSON.stringify(extra)}` : '';
    console.log(`[${ts}] INFO  | ${method} ${path} | ${message}${extraStr}`);
  },
  warn(method, path, code, message) {
    const ts = formatLogTimestamp();
    console.warn(`[${ts}] WARN  | ${method} ${path} | ${code} | ${message}`);
  },
  error(method, path, code, message, stack = null) {
    const ts = formatLogTimestamp();
    console.error(`[${ts}] ERROR | ${method} ${path} | ${code} | ${message}`);
    if (stack && env.NODE_ENV !== 'production') {
      console.error(stack);
    }
  },
};

/**
 * 404 Not Found Handler for unmatched routes
 */
export const notFoundHandler = (req, res, next) => {
  const url = req.originalUrl || req.url || 'unknown';
  const method = req.method || 'GET';
  const notFoundErr = ApiError.notFound(`Resource not found: ${method} ${url}`, 'NOT_FOUND');
  next(notFoundErr);
};

/**
 * Global centralized error-handling middleware
 */
export const errorHandler = (err, req, res, next) => {
  const method = req?.method || 'UNKNOWN';
  const reqPath = req?.originalUrl || req?.url || 'unknown';

  let apiError = null;

  // 1. Direct ApiError instance
  if (err instanceof ApiError) {
    apiError = err;
  }
  // 2. MongoDB Duplicate Key Error (E11000)
  else if (err?.code === 11000 || err?.name === 'MongoServerError' && err?.code === 11000) {
    const field = err.keyValue ? Object.keys(err.keyValue)[0] : 'resource';
    const message = `A record with this ${field} already exists.`;
    apiError = ApiError.conflict(message, 'DUPLICATE_RESOURCE');
  }
  // 3. Mongoose Schema Validation Error
  else if (err?.name === 'ValidationError' && err?.errors) {
    const details = Object.values(err.errors).map((e) => ({
      field: e.path,
      message: e.message,
    }));
    apiError = ApiError.validationError('Validation failed for one or more fields.', details, 'VALIDATION_ERROR');
  }
  // 4. Mongoose CastError (e.g. invalid MongoDB ObjectId format)
  else if (err?.name === 'CastError') {
    const message = `Invalid identifier format for field '${err.path}'.`;
    apiError = ApiError.badRequest(message, 'INVALID_IDENTIFIER');
  }
  // 5. JWT Authentication Errors
  else if (err?.name === 'JsonWebTokenError') {
    apiError = ApiError.unauthorized('Invalid authentication token.', 'INVALID_TOKEN');
  } else if (err?.name === 'TokenExpiredError') {
    apiError = ApiError.unauthorized('Authentication token has expired. Please log in again.', 'TOKEN_EXPIRED');
  }
  // 6. Express Body Parser Malformed JSON Error
  else if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    apiError = ApiError.badRequest('Malformed JSON in request body.', 'INVALID_JSON_BODY');
  }
  // 7. Express Payload Too Large
  else if (err?.type === 'entity.too.large' || err?.status === 413) {
    apiError = ApiError.payloadTooLarge('Request payload exceeds maximum allowed size.', 'PAYLOAD_TOO_LARGE');
  }
  // 8. Rate Limiter or Pre-set Status Errors
  else if (Number.isInteger(err?.status) && err.status >= 400 && err.status < 600) {
    const code = err.code || (err.status === 429 ? 'TOO_MANY_REQUESTS' : 'INVALID_REQUEST');
    apiError = new ApiError(err.status, err.message || 'The request could not be processed.', code, err.details || null);
  }
  // 9. Unknown Internal Server Error
  else {
    const isProd = env.NODE_ENV === 'production';
    const safeMessage = isProd
      ? 'Something went wrong. Please try again.'
      : err?.message || 'An unexpected internal server error occurred.';
    apiError = ApiError.internal(safeMessage, 'INTERNAL_SERVER_ERROR');
    apiError.stack = err?.stack || '';
  }

  // Structured Console Logging (Phase 8)
  const isServerError = apiError.statusCode >= 500;
  if (isServerError) {
    logger.error(method, reqPath, apiError.code, apiError.message, apiError.stack);
  } else {
    logger.warn(method, reqPath, apiError.code, apiError.message);
  }

  // Standardized Response conforming to docs/API.md Section 6 and Phase 4/5 contract
  const responseBody = {
    success: false,
    message: apiError.message,
    errorCode: apiError.code,
    error: {
      code: apiError.code,
      message: apiError.message,
      ...(apiError.details ? { details: apiError.details } : {}),
      ...(req?.requestId ? { requestId: req.requestId } : {}),
    },
  };

  res.status(apiError.statusCode).json(responseBody);
};

/**
 * Standardized ApiError Class for AmbuRoute
 * 
 * Provides:
 * - Proper JavaScript Error inheritance and clean stack trace preservation
 * - Operational vs unexpected error differentiation
 * - Standardized error code and field-level validation details
 * - Static factory methods for all common HTTP error scenarios (400, 401, 403, 404, 409, 413, 422, 429, 500, 503)
 * - Safe client serialization (stack traces excluded)
 */

class ApiError extends Error {
  /**
   * @param {number} statusCode - HTTP status code (e.g. 400, 401, 404, 500)
   * @param {string} message - Human-readable error message
   * @param {string} [code] - Machine-readable error code (e.g. 'TRIP_NOT_FOUND', 'INVALID_REQUEST')
   * @param {Array|null} [details] - Optional field-level validation errors
   * @param {boolean} [isOperational=true] - Whether this error is a known operational error
   * @param {string} [stack=""] - Custom stack trace override
   */
  constructor(
    statusCode = 500,
    message = 'Something went wrong. Please try again.',
    code = 'INTERNAL_SERVER_ERROR',
    details = null,
    isOperational = true,
    stack = ''
  ) {
    super(message);

    this.name = this.constructor.name;
    this.statusCode = Number.isInteger(statusCode) ? statusCode : 500;
    this.status = this.statusCode; // Backward compatibility with Express err.status
    this.code = code || (this.statusCode >= 500 ? 'INTERNAL_SERVER_ERROR' : 'INVALID_REQUEST');
    this.errorCode = this.code;
    this.message = message;
    this.success = false;
    this.data = null;
    this.isOperational = Boolean(isOperational);

    // Normalize details
    if (Array.isArray(details)) {
      this.details = details;
      this.errors = details;
    } else if (details && typeof details === 'object') {
      this.details = details;
      this.errors = [details];
    } else {
      this.details = null;
      this.errors = [];
    }

    if (stack) {
      this.stack = stack;
    } else if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  // Common Factory Methods

  static badRequest(message = 'Bad request: The request contains invalid data.', code = 'BAD_REQUEST', details = null) {
    return new ApiError(400, message, code, details, true);
  }

  static unauthorized(message = 'Authentication required. Please provide a valid authorization token.', code = 'UNAUTHORIZED') {
    return new ApiError(401, message, code, null, true);
  }

  static forbidden(message = "Access denied: You don't have permission to perform this action.", code = 'FORBIDDEN') {
    return new ApiError(403, message, code, null, true);
  }

  static notFound(message = 'Requested resource not found.', code = 'NOT_FOUND') {
    return new ApiError(404, message, code, null, true);
  }

  static conflict(message = 'Conflict: The requested operation conflicts with the current resource state.', code = 'CONFLICT') {
    return new ApiError(409, message, code, null, true);
  }

  static payloadTooLarge(message = 'Request payload too large.', code = 'PAYLOAD_TOO_LARGE') {
    return new ApiError(413, message, code, null, true);
  }

  static validationError(message = 'Validation failed for one or more fields.', details = null, code = 'VALIDATION_ERROR') {
    return new ApiError(422, message, code, details, true);
  }

  static tooManyRequests(message = 'Too many requests. Please slow down and try again later.', code = 'TOO_MANY_REQUESTS') {
    return new ApiError(429, message, code, null, true);
  }

  static internal(message = 'Something went wrong. Please try again.', code = 'INTERNAL_SERVER_ERROR') {
    return new ApiError(500, message, code, null, false);
  }

  static serviceUnavailable(message = 'Service temporarily unavailable. Please try again later.', code = 'SERVICE_UNAVAILABLE') {
    return new ApiError(503, message, code, null, true);
  }

  toJSON() {
    return {
      success: false,
      message: this.message,
      error: {
        code: this.code,
        message: this.message,
        ...(this.details ? { details: this.details } : {}),
      },
    };
  }
}

export { ApiError };
export default ApiError;

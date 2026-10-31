/**
 * Unit Test Suite for Centralized Error Handling & API Response Architecture
 * 
 * Tests:
 * 1. ApiError construction, properties, inheritance, and factory methods
 * 2. asyncHandler promise resolution and rejected error propagation
 * 3. ApiResponse format, status code mapping, metadata, and transmission
 * 4. Centralized errorHandler handling for:
 *    - ApiError instances
 *    - MongoDB duplicate key errors (11000 -> 409)
 *    - Mongoose validation errors (ValidationError -> 422)
 *    - Mongoose cast errors (CastError -> 400)
 *    - JWT errors (JsonWebTokenError, TokenExpiredError -> 401)
 *    - Express body parse syntax errors (400)
 *    - Express payload too large (413)
 *    - Unknown internal errors (500)
 *    - 404 notFoundHandler
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { errorHandler, notFoundHandler } from '../middlewares/errorHandler.js';

describe('AmbuRoute Centralized Error Handling & Response Architecture', () => {

  // --- 1. ApiError Tests ---
  describe('1. ApiError Class & Factory Helpers', () => {
    it('creates an ApiError with custom status, code, details, and message', () => {
      const err = new ApiError(404, 'Trip not found', 'TRIP_NOT_FOUND', [{ field: 'id', message: 'Missing' }]);

      assert.ok(err instanceof Error);
      assert.ok(err instanceof ApiError);
      assert.equal(err.statusCode, 404);
      assert.equal(err.status, 404);
      assert.equal(err.code, 'TRIP_NOT_FOUND');
      assert.equal(err.message, 'Trip not found');
      assert.equal(err.success, false);
      assert.equal(err.isOperational, true);
      assert.deepEqual(err.details, [{ field: 'id', message: 'Missing' }]);
      assert.ok(err.stack);
    });

    it('provides working factory helpers for common HTTP status codes', () => {
      const badReq = ApiError.badRequest('Invalid coordinates', 'INVALID_COORDS');
      assert.equal(badReq.statusCode, 400);
      assert.equal(badReq.code, 'INVALID_COORDS');

      const unauth = ApiError.unauthorized('No token provided');
      assert.equal(unauth.statusCode, 401);
      assert.equal(unauth.code, 'UNAUTHORIZED');

      const forbid = ApiError.forbidden();
      assert.equal(forbid.statusCode, 403);
      assert.equal(forbid.code, 'FORBIDDEN');

      const notFound = ApiError.notFound('Resource missing', 'RESOURCE_MISSING');
      assert.equal(notFound.statusCode, 404);
      assert.equal(notFound.code, 'RESOURCE_MISSING');

      const conflict = ApiError.conflict('Already exists', 'ALREADY_EXISTS');
      assert.equal(conflict.statusCode, 409);
      assert.equal(conflict.code, 'ALREADY_EXISTS');

      const valErr = ApiError.validationError('Validation error', [{ field: 'email', message: 'Invalid' }]);
      assert.equal(valErr.statusCode, 422);
      assert.equal(valErr.code, 'VALIDATION_ERROR');
      assert.equal(valErr.details.length, 1);

      const rateLimit = ApiError.tooManyRequests();
      assert.equal(rateLimit.statusCode, 429);
      assert.equal(rateLimit.code, 'TOO_MANY_REQUESTS');

      const internal = ApiError.internal();
      assert.equal(internal.statusCode, 500);
      assert.equal(internal.code, 'INTERNAL_SERVER_ERROR');
      assert.equal(internal.isOperational, false);

      const serviceUnavailable = ApiError.serviceUnavailable();
      assert.equal(serviceUnavailable.statusCode, 503);
      assert.equal(serviceUnavailable.code, 'SERVICE_UNAVAILABLE');
    });

    it('serializes cleanly to JSON without leaking stack traces', () => {
      const err = ApiError.notFound('User not found', 'USER_NOT_FOUND');
      const json = err.toJSON();

      assert.equal(json.success, false);
      assert.equal(json.message, 'User not found');
      assert.equal(json.error.code, 'USER_NOT_FOUND');
      assert.equal(json.error.message, 'User not found');
      assert.equal(json.stack, undefined);
    });
  });

  // --- 2. asyncHandler Tests ---
  describe('2. asyncHandler Wrapper', () => {
    it('executes successful asynchronous handler and resolves properly', async () => {
      let executed = false;
      const fn = asyncHandler(async (req, res, next) => {
        executed = true;
        return 'DONE';
      });

      const req = {};
      const res = {};
      const next = (err) => {
        assert.fail(`next should not be called with error: ${err}`);
      };

      await fn(req, res, next);
      assert.equal(executed, true);
    });

    it('catches rejected promises in async route handlers and calls next(err)', async () => {
      const thrownError = new Error('Async DB Failure');
      const fn = asyncHandler(async () => {
        throw thrownError;
      });

      let caughtErr = null;
      const req = {};
      const res = {};
      const next = (err) => {
        caughtErr = err;
      };

      await fn(req, res, next);
      assert.equal(caughtErr, thrownError);
    });

    it('throws TypeError if non-function is passed to asyncHandler', () => {
      assert.throws(() => asyncHandler(null), TypeError);
      assert.throws(() => asyncHandler('notAFunction'), TypeError);
    });
  });

  // --- 3. ApiResponse Tests ---
  describe('3. ApiResponse Class & Factory Helpers', () => {
    it('creates an ApiResponse with expected envelope structure', () => {
      const resData = { tripId: 'trip_123', status: 'ACTIVE' };
      const resp = new ApiResponse(200, resData, 'Trip retrieved successfully');

      assert.equal(resp.success, true);
      assert.equal(resp.statusCode, 200);
      assert.equal(resp.message, 'Trip retrieved successfully');
      assert.deepEqual(resp.data, resData);
      assert.equal(resp.meta, undefined);
    });

    it('supports metadata and factory helpers', () => {
      const created = ApiResponse.created({ id: 'res_1' }, 'Trip created');
      assert.equal(created.statusCode, 201);
      assert.equal(created.success, true);

      const withMeta = ApiResponse.ok([1, 2, 3], 'List fetched', { total: 3, page: 1 });
      assert.equal(withMeta.meta.total, 3);
      assert.equal(withMeta.toJSON().meta.page, 1);
    });

    it('transmits response cleanly through Express res object using .send()', () => {
      let sentStatus = null;
      let sentJson = null;

      const mockRes = {
        status(code) {
          sentStatus = code;
          return this;
        },
        json(payload) {
          sentJson = payload;
          return this;
        },
      };

      const resp = ApiResponse.ok({ message: 'Live transit clear' }, 'Corridor status verified');
      resp.send(mockRes);

      assert.equal(sentStatus, 200);
      assert.equal(sentJson.success, true);
      assert.equal(sentJson.data.message, 'Live transit clear');
      assert.equal(sentJson.message, 'Corridor status verified');
    });
  });

  // --- 4. Centralized errorHandler Tests ---
  describe('4. Centralized errorHandler Middleware', () => {
    // Helper to simulate Express middleware invocation
    function runMiddleware(middleware, err, req = {}) {
      let statusCode = 200;
      let jsonPayload = null;

      const mockReq = {
        method: req.method || 'GET',
        originalUrl: req.url || '/api/v1/test',
        ...req,
      };

      const mockRes = {
        status(code) {
          statusCode = code;
          return this;
        },
        json(payload) {
          jsonPayload = payload;
          return this;
        },
      };

      let nextCalled = false;
      const next = (e) => {
        nextCalled = true;
        if (e) {
          // Trigger error handler
          errorHandler(e, mockReq, mockRes, () => {});
        }
      };

      middleware(err, mockReq, mockRes, next);
      return { statusCode, jsonPayload, nextCalled };
    }

    it('handles ApiError instances with correct status and error envelope', () => {
      const customErr = ApiError.notFound('Mission not found', 'MISSION_NOT_FOUND');
      const { statusCode, jsonPayload } = runMiddleware(errorHandler, customErr);

      assert.equal(statusCode, 404);
      assert.equal(jsonPayload.success, false);
      assert.equal(jsonPayload.errorCode, 'MISSION_NOT_FOUND');
      assert.equal(jsonPayload.error.code, 'MISSION_NOT_FOUND');
      assert.equal(jsonPayload.error.message, 'Mission not found');
    });

    it('maps MongoDB duplicate key error (code 11000) to HTTP 409 DUPLICATE_RESOURCE', () => {
      const mongoDupErr = {
        code: 11000,
        name: 'MongoServerError',
        keyValue: { email: 'duplicate@amburoute.test' },
      };

      const { statusCode, jsonPayload } = runMiddleware(errorHandler, mongoDupErr);
      assert.equal(statusCode, 409);
      assert.equal(jsonPayload.errorCode, 'DUPLICATE_RESOURCE');
      assert.ok(jsonPayload.message.includes('email'));
    });

    it('maps Mongoose ValidationError to HTTP 422 VALIDATION_ERROR with field details', () => {
      const valErr = {
        name: 'ValidationError',
        errors: {
          location: { path: 'location.coordinates', message: 'Coordinates are required.' },
          destination: { path: 'destination.label', message: 'Destination label cannot be empty.' },
        },
      };

      const { statusCode, jsonPayload } = runMiddleware(errorHandler, valErr);
      assert.equal(statusCode, 422);
      assert.equal(jsonPayload.errorCode, 'VALIDATION_ERROR');
      assert.equal(jsonPayload.error.details.length, 2);
      assert.equal(jsonPayload.error.details[0].field, 'location.coordinates');
    });

    it('maps Mongoose CastError to HTTP 400 INVALID_IDENTIFIER', () => {
      const castErr = {
        name: 'CastError',
        path: '_id',
        value: 'invalid-non-object-id',
      };

      const { statusCode, jsonPayload } = runMiddleware(errorHandler, castErr);
      assert.equal(statusCode, 400);
      assert.equal(jsonPayload.errorCode, 'INVALID_IDENTIFIER');
      assert.ok(jsonPayload.message.includes('_id'));
    });

    it('maps JWT JsonWebTokenError and TokenExpiredError to HTTP 401', () => {
      const jwtErr = { name: 'JsonWebTokenError', message: 'jwt malformed' };
      const res1 = runMiddleware(errorHandler, jwtErr);
      assert.equal(res1.statusCode, 401);
      assert.equal(res1.jsonPayload.errorCode, 'INVALID_TOKEN');

      const expErr = { name: 'TokenExpiredError', message: 'jwt expired' };
      const res2 = runMiddleware(errorHandler, expErr);
      assert.equal(res2.statusCode, 401);
      assert.equal(res2.jsonPayload.errorCode, 'TOKEN_EXPIRED');
    });

    it('maps Express malformed JSON SyntaxError to HTTP 400 INVALID_JSON_BODY', () => {
      const syntaxErr = new SyntaxError('Unexpected token } in JSON');
      syntaxErr.status = 400;
      syntaxErr.body = '{ "invalid": }';

      const { statusCode, jsonPayload } = runMiddleware(errorHandler, syntaxErr);
      assert.equal(statusCode, 400);
      assert.equal(jsonPayload.errorCode, 'INVALID_JSON_BODY');
    });

    it('maps Express payload too large error to HTTP 413 PAYLOAD_TOO_LARGE', () => {
      const largeErr = { type: 'entity.too.large', status: 413, message: 'request entity too large' };
      const { statusCode, jsonPayload } = runMiddleware(errorHandler, largeErr);
      assert.equal(statusCode, 413);
      assert.equal(jsonPayload.errorCode, 'PAYLOAD_TOO_LARGE');
    });

    it('handles unexpected unknown errors with safe HTTP 500 without leaking stack traces', () => {
      const unknownErr = new Error('Unexpected undefined pointer in third-party library');
      const { statusCode, jsonPayload } = runMiddleware(errorHandler, unknownErr);

      assert.equal(statusCode, 500);
      assert.equal(jsonPayload.success, false);
      assert.equal(jsonPayload.errorCode, 'INTERNAL_SERVER_ERROR');
      assert.equal(jsonPayload.error.code, 'INTERNAL_SERVER_ERROR');
      // Stack trace is never exposed in response payload
      assert.equal(jsonPayload.stack, undefined);
      assert.equal(jsonPayload.error.stack, undefined);
    });

    it('notFoundHandler calls next with ApiError.notFound', () => {
      let forwardedErr = null;
      const req = { method: 'POST', originalUrl: '/api/v1/non-existent-corridor' };
      const res = {};
      const next = (err) => {
        forwardedErr = err;
      };

      notFoundHandler(req, res, next);
      assert.ok(forwardedErr instanceof ApiError);
      assert.equal(forwardedErr.statusCode, 404);
      assert.equal(forwardedErr.code, 'NOT_FOUND');
      assert.ok(forwardedErr.message.includes('/api/v1/non-existent-corridor'));
    });
  });
});

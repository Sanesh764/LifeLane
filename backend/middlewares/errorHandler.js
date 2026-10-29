/**
 * Standardized API Error Handling Middleware for AmbuRoute
 * Conforms to docs/API.md Section 6.
 */

export const notFoundHandler = (req, res) => {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: `Resource not found: ${req.method} ${req.originalUrl || req.url}`,
    },
  });
};

export const errorHandler = (err, req, res, next) => {
  // Log unexpected errors internally without exposing sensitive details to clients
  console.error('[API Error]', {
    method: req.method,
    url: req.originalUrl || req.url,
    message: err.message,
    status: err.status || 500,
  });

  const statusCode = Number.isInteger(err.status) && err.status >= 400 && err.status < 600
    ? err.status
    : 500;

  const errorCode = err.code || (statusCode === 500 ? 'INTERNAL_SERVER_ERROR' : 'INVALID_REQUEST');
  const message = statusCode === 500
    ? 'An unexpected internal server error occurred.'
    : err.message || 'The request could not be processed.';

  const responseBody = {
    error: {
      code: errorCode,
      message,
    },
  };

  if (err.details && Array.isArray(err.details)) {
    responseBody.error.details = err.details;
  }

  res.status(statusCode).json(responseBody);
};

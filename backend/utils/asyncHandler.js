/**
 * Standardized Async Handler Wrapper for Express Routes
 * 
 * Intercepts unhandled promise rejections in async route handlers
 * and forwards them to the centralized Express error middleware without
 * repetitive try/catch boilerplate.
 */

const asyncHandler = (requestHandler) => {
  if (typeof requestHandler !== 'function') {
    throw new TypeError('asyncHandler expects a function as argument');
  }

  return (req, res, next) => {
    Promise.resolve(requestHandler(req, res, next)).catch((err) => next(err));
  };
};

export { asyncHandler };
export default asyncHandler;

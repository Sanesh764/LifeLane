import express from 'express';
import { isDbConnected } from '../config/db.js';
import { authenticate, requireActiveDriver } from '../middlewares/auth.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = express.Router();

/**
 * GET /api/v1/driver/profile
 * Returns the authenticated driver's operational profile
 */
router.get(
  '/profile',
  authenticate,
  requireActiveDriver,
  asyncHandler(async (req, res) => {
    if (!isDbConnected()) {
      throw ApiError.serviceUnavailable(
        'Database service is temporarily unavailable.',
        'DATABASE_UNAVAILABLE'
      );
    }

    if (!req.user) {
      throw ApiError.unauthorized('Driver authentication required.', 'UNAUTHORIZED');
    }

    return ApiResponse.ok(
      {
        driver: {
          id: req.user._id.toString(),
          name: req.user.name,
          email: req.user.email,
          role: req.user.role,
          status: req.user.status,
          driverVerificationStatus: req.user.driverVerificationStatus,
          assignedUnit: req.user.assignedUnit || null,
        },
      },
      'Driver profile retrieved successfully.'
    ).send(res);
  })
);

export default router;

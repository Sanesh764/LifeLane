import express from 'express';
import { authenticate, requireActiveDriver } from '../middlewares/auth.js';

const router = express.Router();

/**
 * GET /api/v1/driver/profile
 * Returns the authenticated driver's operational profile
 */
router.get('/profile', authenticate, requireActiveDriver, (req, res) => {
  res.status(200).json({
    data: {
      driver: {
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

export default router;

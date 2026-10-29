import express from 'express';
import { fetchNearbyHospitals } from '../services/hospitalService.js';

const router = express.Router();

/**
 * GET /api/v1/hospitals/nearby
 * Search for hospitals nearby the driver's current coordinates
 * Query params:
 *   - lat / latitude: number (required)
 *   - lng / longitude / lon: number (required)
 *   - radius / radiusMeters: number (optional, 1000 - 50000)
 */
router.get('/nearby', async (req, res, next) => {
  try {
    const rawLat = req.query.lat ?? req.query.latitude;
    const rawLng = req.query.lng ?? req.query.longitude ?? req.query.lon;
    const rawRadius = req.query.radius ?? req.query.radiusMeters;

    if (rawLat === undefined || rawLng === undefined) {
      return res.status(400).json({
        error: {
          code: 'MISSING_COORDINATES',
          message: 'Both lat and lng query parameters are required for nearby hospital search.',
        },
      });
    }

    const lat = Number(rawLat);
    const lng = Number(rawLng);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({
        error: {
          code: 'INVALID_COORDINATES',
          message: 'Coordinates lat and lng must be valid finite numbers.',
        },
      });
    }

    if (lat < -90 || lat > 90) {
      return res.status(400).json({
        error: {
          code: 'INVALID_LATITUDE',
          message: 'Latitude must be between -90 and 90 degrees.',
        },
      });
    }

    if (lng < -180 || lng > 180) {
      return res.status(400).json({
        error: {
          code: 'INVALID_LONGITUDE',
          message: 'Longitude must be between -180 and 180 degrees.',
        },
      });
    }

    let radiusMeters = 35000;
    if (rawRadius !== undefined) {
      const parsedRadius = Number(rawRadius);
      if (Number.isFinite(parsedRadius) && parsedRadius > 0) {
        radiusMeters = Math.min(Math.max(parsedRadius, 1000), 50000);
      }
    }

    console.log(`[HospitalsAPI] Dynamic search request: lat=${lat}, lng=${lng}, radius=${radiusMeters}m`);
    const data = await fetchNearbyHospitals(lat, lng, radiusMeters);

    res.status(200).json({
      success: true,
      data,
    });
  } catch (err) {
    next(err);
  }
});

export default router;

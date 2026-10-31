import express from 'express';
import { fetchNearbyHospitals } from '../services/hospitalService.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = express.Router();

/**
 * GET /api/v1/hospitals/nearby
 * Search for hospitals nearby the driver's current coordinates
 * Query params:
 *   - lat / latitude: number (required)
 *   - lng / longitude / lon: number (required)
 *   - radius / radiusMeters: number (optional, 1000 - 50000)
 */
router.get(
  '/nearby',
  asyncHandler(async (req, res) => {
    const rawLat = req.query.lat ?? req.query.latitude;
    const rawLng = req.query.lng ?? req.query.longitude ?? req.query.lon;
    const rawRadius = req.query.radius ?? req.query.radiusMeters;

    if (rawLat === undefined || rawLng === undefined) {
      throw ApiError.badRequest(
        'Both lat and lng query parameters are required for nearby hospital search.',
        'MISSING_COORDINATES'
      );
    }

    const lat = Number(rawLat);
    const lng = Number(rawLng);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      throw ApiError.badRequest(
        'Coordinates lat and lng must be valid finite numbers.',
        'INVALID_COORDINATES'
      );
    }

    if (lat < -90 || lat > 90) {
      throw ApiError.badRequest(
        'Latitude must be between -90 and 90 degrees.',
        'INVALID_LATITUDE'
      );
    }

    if (lng < -180 || lng > 180) {
      throw ApiError.badRequest(
        'Longitude must be between -180 and 180 degrees.',
        'INVALID_LONGITUDE'
      );
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

    return ApiResponse.ok(data, 'Nearby hospitals retrieved successfully.').send(res);
  })
);

export default router;

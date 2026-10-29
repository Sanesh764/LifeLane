import express from 'express';
import { TrafficReport } from '../models/TrafficReport.js';

const router = express.Router();

const VALID_REPORT_TYPES = ['CLEAR', 'TRAFFIC_HIGH', 'ROAD_BLOCKED', 'CANNOT_ASSESS'];

/**
 * Helper to compute freshness label from date
 */
function computeFreshness(date) {
  const diffMins = Math.floor((Date.now() - new Date(date).getTime()) / 60000);
  if (diffMins < 5) return 'JUST_NOW';
  if (diffMins < 20) return 'FRESH';
  return 'STALE';
}

/**
 * Format a DB document into the standardized client report payload
 */
function formatReport(doc) {
  const obj = doc.toJSON ? doc.toJSON() : doc;
  const coords = obj.location?.coordinates; // [lng, lat]
  const leafletCoords = coords && coords.length === 2 ? [coords[1], coords[0]] : null; // [lat, lng]

  return {
    id: obj.id || obj._id,
    reportType: obj.reportType,
    roadSegment: obj.roadSegment,
    locationDescription: obj.locationDescription || `Reported on ${obj.roadSegment}`,
    timestamp: obj.capturedAt || obj.createdAt,
    freshness: computeFreshness(obj.capturedAt || obj.createdAt),
    verifiedCount: obj.verifiedCount || 1,
    source: obj.source || 'Participating Road User',
    status: obj.status || 'ACTIVE',
    locationStatus: obj.locationStatus || 'LOCATION_MATCHED',
    coordinates: leafletCoords,
    rawGeoPoint: obj.location || null,
    gpsAccuracy: obj.locationAccuracyMeters || null,
    locationCapturedAt: obj.capturedAt || obj.createdAt,
    corroborationStatus: (obj.verifiedCount || 1) > 1 ? 'CORROBORATED' : 'UNVERIFIED REPORT',
  };
}

/**
 * POST /api/v1/traffic/reports
 * Submit a real-time community road condition observation
 */
router.post('/reports', async (req, res, next) => {
  try {
    const {
      reportType,
      roadSegment,
      locationDescription,
      description,
      location,
      coordinates,
      accuracyMeters,
      locationAccuracyMeters,
      locationStatus,
      source,
    } = req.body;

    // 1. Validate reportType
    if (!reportType || typeof reportType !== 'string') {
      return res.status(400).json({
        error: {
          code: 'MISSING_REPORT_TYPE',
          message: 'reportType is required and must be one of: CLEAR, TRAFFIC_HIGH, ROAD_BLOCKED, CANNOT_ASSESS.',
        },
      });
    }

    const upperType = reportType.trim().toUpperCase();
    if (!VALID_REPORT_TYPES.includes(upperType)) {
      return res.status(400).json({
        error: {
          code: 'INVALID_REPORT_TYPE',
          message: `reportType must be one of: ${VALID_REPORT_TYPES.join(', ')}.`,
        },
      });
    }

    // 2. Validate roadSegment
    if (!roadSegment || typeof roadSegment !== 'string' || roadSegment.trim().length === 0) {
      return res.status(400).json({
        error: {
          code: 'MISSING_ROAD_SEGMENT',
          message: 'roadSegment name is required and cannot be empty.',
        },
      });
    }

    const cleanRoad = roadSegment.trim();

    // 3. Parse coordinates if provided
    let geoPoint = null;
    let rawCoords = coordinates || location?.coordinates;

    if (rawCoords && Array.isArray(rawCoords) && rawCoords.length === 2) {
      // Check if coordinates were passed as [lat, lng] or [lng, lat]
      let lng = Number(rawCoords[0]);
      let lat = Number(rawCoords[1]);

      // If lat/lng reversed (e.g. lat > 90 or lng within lat range and lat within lng range)
      if (Math.abs(lng) <= 90 && Math.abs(lat) > 90) {
        // Swap to [lng, lat]
        const temp = lng;
        lng = lat;
        lat = temp;
      }

      if (Number.isFinite(lng) && Number.isFinite(lat) && lng >= -180 && lng <= 180 && lat >= -90 && lat <= 90) {
        geoPoint = {
          type: 'Point',
          coordinates: [lng, lat],
        };
      }
    }

    const accuracy = Number(accuracyMeters ?? locationAccuracyMeters);
    const parsedAccuracy = Number.isFinite(accuracy) && accuracy >= 0 ? accuracy : null;

    // 4. Check for corroborating active reports on the same road in last 45 minutes
    const fortyFiveMinsAgo = new Date(Date.now() - 45 * 60 * 1000);
    const existingSimilar = await TrafficReport.find({
      roadSegment: { $regex: new RegExp(`^${cleanRoad.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
      status: 'ACTIVE',
      capturedAt: { $gte: fortyFiveMinsAgo },
    });

    const corroborationCount = existingSimilar.length + 1;

    // 5. Create report in MongoDB
    const report = await TrafficReport.create({
      reportType: upperType,
      roadSegment: cleanRoad,
      locationDescription: (description || locationDescription || `Reported on ${cleanRoad}`).trim(),
      location: geoPoint,
      locationAccuracyMeters: parsedAccuracy,
      locationStatus: locationStatus === 'LOCATION_UNVERIFIED' ? 'LOCATION_UNVERIFIED' : 'LOCATION_MATCHED',
      source: (source || 'Participating Road User').trim(),
      status: 'ACTIVE',
      verifiedCount: corroborationCount,
      capturedAt: new Date(),
    });

    // Also bump verifiedCount on existing corroborating reports
    if (existingSimilar.length > 0) {
      await TrafficReport.updateMany(
        { _id: { $in: existingSimilar.map((d) => d._id) } },
        { $inc: { verifiedCount: 1 } }
      );
    }

    console.log(
      `[TrafficAPI] Created traffic report: ${report.reportType} on "${report.roadSegment}" (Corroborated: ${corroborationCount})`
    );

    res.status(201).json({
      success: true,
      data: {
        report: formatReport(report),
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/traffic/reports
 * Fetch active real-time traffic condition reports
 */
router.get('/reports', async (req, res, next) => {
  try {
    const rawLat = req.query.lat ?? req.query.latitude;
    const rawLng = req.query.lng ?? req.query.longitude;
    const rawRadius = req.query.radius ?? req.query.radiusMeters;

    // Only active reports from the last 2 hours
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const query = {
      status: 'ACTIVE',
      capturedAt: { $gte: twoHoursAgo },
    };

    // If coordinates supplied, optionally sort/filter geographically
    if (rawLat !== undefined && rawLng !== undefined) {
      const lat = Number(rawLat);
      const lng = Number(rawLng);
      const radius = Number(rawRadius) || 50000;

      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        query.location = {
          $near: {
            $geometry: {
              type: 'Point',
              coordinates: [lng, lat],
            },
            $maxDistance: Math.min(Math.max(radius, 1000), 100000),
          },
        };
      }
    }

    const reports = await TrafficReport.find(query)
      .sort({ capturedAt: -1 })
      .limit(50);

    res.status(200).json({
      success: true,
      data: {
        reports: reports.map(formatReport),
        count: reports.length,
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;

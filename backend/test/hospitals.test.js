import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { app } from '../server.js';
import { connectDB, disconnectDB } from '../config/db.js';
import {
  calculateDistanceMeters,
  formatDistance,
  deduplicateHospitals,
  fetchNearbyHospitals,
} from '../services/hospitalService.js';

describe('Nearby Hospitals API & Discovery Service (Dynamic Geographic Search)', () => {
  let server;
  let baseUrl;

  before(async () => {
    await connectDB();
    await new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    await disconnectDB();
  });

  describe('1. Input Validation & Parameter Handling', () => {
    it('rejects request missing lat/lng query parameters with 400', async () => {
      const res = await fetch(`${baseUrl}/api/v1/hospitals/nearby`);
      assert.equal(res.status, 400);
      const body = await res.json();
      assert.equal(body.error.code, 'MISSING_COORDINATES');
    });

    it('rejects invalid latitude with 400 INVALID_LATITUDE', async () => {
      const res = await fetch(`${baseUrl}/api/v1/hospitals/nearby?lat=999&lng=85.15`);
      assert.equal(res.status, 400);
      const body = await res.json();
      assert.equal(body.error.code, 'INVALID_LATITUDE');
    });

    it('rejects invalid longitude with 400 INVALID_LONGITUDE', async () => {
      const res = await fetch(`${baseUrl}/api/v1/hospitals/nearby?lat=25.59&lng=250`);
      assert.equal(res.status, 400);
      const body = await res.json();
      assert.equal(body.error.code, 'INVALID_LONGITUDE');
    });

    it('accepts alternative parameter names (latitude, longitude, radiusMeters)', async () => {
      const res = await fetch(
        `${baseUrl}/api/v1/hospitals/nearby?latitude=25.5941&longitude=85.1376&radiusMeters=20000`
      );
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.success, true);
      assert.ok(Array.isArray(body.data.hospitals));
    });
  });

  describe('2. Distance Calculation & Deduplication Utilities', () => {
    it('calculateDistanceMeters computes accurate Haversine distance between coordinates', () => {
      // Patna Junction [85.1376, 25.5941] to PMCH [85.1585, 25.6206] is ~3.6 km
      const meters = calculateDistanceMeters([85.1376, 25.5941], [85.1585, 25.6206]);
      assert.ok(meters > 3000 && meters < 4500);

      // Same location is 0 meters
      assert.equal(calculateDistanceMeters([85.1376, 25.5941], [85.1376, 25.5941]), 0);
    });

    it('formatDistance produces readable meter and kilometer strings', () => {
      assert.equal(formatDistance(450), '450 m');
      assert.equal(formatDistance(3200), '3.2 km');
      assert.equal(formatDistance(15000), '15.0 km');
    });

    it('deduplicateHospitals removes duplicate hospital names within proximity', () => {
      const mockHospitals = [
        {
          id: '1',
          name: 'Sadar Hospital Lakhisarai',
          coordinates: [86.0945, 25.1764],
          distanceMeters: 100,
        },
        {
          id: '2',
          name: 'Sadar Hospital Lakhisarai (Emergency Wing)',
          coordinates: [86.0947, 25.1766], // 30m away
          distanceMeters: 120,
        },
        {
          id: '3',
          name: 'Sub-Divisional Hospital Barhiya',
          coordinates: [86.0289, 25.2678],
          distanceMeters: 12000,
        },
      ];

      const deduped = deduplicateHospitals(mockHospitals);
      assert.equal(deduped.length, 2);
      assert.equal(deduped[0].name, 'Sadar Hospital Lakhisarai');
      assert.equal(deduped[1].name, 'Sub-Divisional Hospital Barhiya');
    });
  });

  describe('3. Dynamic Geographic Separation (Lakhisarai vs Patna)', () => {
    it('returns nearby hospitals for Lakhisarai coordinates and NEVER returns Patna hospitals', async () => {
      // Lakhisarai District Center: [86.0945, 25.1764]
      const res = await fetch(
        `${baseUrl}/api/v1/hospitals/nearby?lat=25.1764&lng=86.0945&radius=35000`
      );
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.ok(body.data);
      assert.ok(body.data.hospitals.length > 0);

      // Verify that every returned hospital is geographically close (< 50 km)
      for (const h of body.data.hospitals) {
        assert.ok(
          h.distanceMeters <= 50000,
          `Hospital ${h.name} distance (${h.distanceMeters}m) exceeds search radius!`
        );
        // Verify NO fixed Patna trauma centers (PMCH / AIIMS / Paras) are leaked into Lakhisarai search
        assert.ok(
          !h.name.toLowerCase().includes('pmch') &&
          !h.name.toLowerCase().includes('aiims') &&
          !h.name.toLowerCase().includes('paras hmri'),
          `Fixed Patna hospital leaked into Lakhisarai search: ${h.name}`
        );
      }

      // Check closest result is in Lakhisarai
      const closest = body.data.threeClosestHospitals[0] || body.data.hospitals[0];
      assert.ok(closest.name.toLowerCase().includes('lakhisarai') || closest.distanceMeters < 15000);
      assert.equal(closest.distanceType, 'STRAIGHT_LINE');
    });

    it('returns genuine live nearby hospitals for New Delhi coordinates with zero Patna leakage', async () => {
      // New Delhi Coordinates: [77.2090, 28.6139]
      const res = await fetch(
        `${baseUrl}/api/v1/hospitals/nearby?lat=28.6139&lng=77.2090&radius=25000`
      );
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.ok(body.data);
      assert.ok(body.data.hospitals.length > 0);

      for (const h of body.data.hospitals) {
        assert.ok(
          h.distanceMeters <= 35000,
          `Hospital ${h.name} distance (${h.distanceMeters}m) exceeds search radius!`
        );
        assert.ok(
          !h.name.toLowerCase().includes('patna') && !h.name.toLowerCase().includes('pmch'),
          `Patna hospital leaked into Delhi search: ${h.name}`
        );
      }

      const closest = body.data.threeClosestHospitals[0];
      assert.ok(closest);
      assert.ok(closest.distanceMeters < 15000);
      assert.equal(closest.distanceType, 'STRAIGHT_LINE');
    });

    it('returns top 3 closest results structure with metadata', async () => {
      const res = await fetch(`${baseUrl}/api/v1/hospitals/nearby?lat=25.6206&lng=85.1585`);
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.ok(body.data.threeClosestHospitals);
      assert.ok(Array.isArray(body.data.threeClosestHospitals));
      assert.ok(body.data.threeClosestHospitals.length <= 3);

      // Verify sorted in ascending order of distance
      const three = body.data.threeClosestHospitals;
      for (let i = 1; i < three.length; i++) {
        assert.ok(
          three[i].distanceMeters >= three[i - 1].distanceMeters,
          `Hospitals not sorted by distance: ${three[i - 1].distanceMeters} > ${three[i].distanceMeters}`
        );
      }
    });

    it('returns empty array when coordinates have no hospitals within search radius (e.g. ocean/remote)', async () => {
      // Coordinates in the Indian Ocean: lat 0.0, lng 80.0
      const res = await fetch(`${baseUrl}/api/v1/hospitals/nearby?lat=0.0&lng=80.0&radius=5000`);
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.data.hospitals.length, 0);
      assert.equal(body.data.threeClosestHospitals.length, 0);
      assert.equal(body.data.hasAtLeastThree, false);
      assert.equal(body.data.count, 0);
    });
  });
});

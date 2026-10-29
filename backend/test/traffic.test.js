import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { app } from '../server.js';
import { connectDB, disconnectDB } from '../config/db.js';
import { TrafficReport } from '../models/TrafficReport.js';

describe('Real-Time Community Traffic Reporting API', () => {
  let server;
  let baseUrl;

  before(async () => {
    await connectDB();
    await TrafficReport.deleteMany({ source: 'Test Suite' });

    await new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  after(async () => {
    await TrafficReport.deleteMany({ source: 'Test Suite' });
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    await disconnectDB();
  });

  describe('1. Input Validation', () => {
    it('rejects report missing reportType with 400', async () => {
      const res = await fetch(`${baseUrl}/api/v1/traffic/reports`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roadSegment: 'Main Road' }),
      });
      assert.equal(res.status, 400);
      const body = await res.json();
      assert.equal(body.error.code, 'MISSING_REPORT_TYPE');
    });

    it('rejects invalid reportType with 400', async () => {
      const res = await fetch(`${baseUrl}/api/v1/traffic/reports`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportType: 'UNKNOWN_TYPE', roadSegment: 'Main Road' }),
      });
      assert.equal(res.status, 400);
      const body = await res.json();
      assert.equal(body.error.code, 'INVALID_REPORT_TYPE');
    });

    it('rejects missing or empty roadSegment with 400', async () => {
      const res = await fetch(`${baseUrl}/api/v1/traffic/reports`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportType: 'ROAD_BLOCKED', roadSegment: '   ' }),
      });
      assert.equal(res.status, 400);
      const body = await res.json();
      assert.equal(body.error.code, 'MISSING_ROAD_SEGMENT');
    });
  });

  describe('2. Real-Time Report Submission & Geo Coordinates', () => {
    it('creates traffic report with live GPS coordinates and returns formatted payload', async () => {
      // Real coordinates from user device (e.g. 24.99902° N, 86.12359° E)
      const payload = {
        reportType: 'ROAD_BLOCKED',
        roadSegment: 'NH-33 Commercial Arterial',
        description: 'Overturned cargo vehicle blocking north lane near milestone 42',
        coordinates: [86.12359, 24.99902],
        accuracyMeters: 12,
        locationStatus: 'LOCATION_MATCHED',
        source: 'Test Suite',
      };

      const res = await fetch(`${baseUrl}/api/v1/traffic/reports`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      assert.equal(res.status, 201);
      const body = await res.json();
      assert.equal(body.success, true);
      assert.ok(body.data.report);

      const rep = body.data.report;
      assert.equal(rep.reportType, 'ROAD_BLOCKED');
      assert.equal(rep.roadSegment, 'NH-33 Commercial Arterial');
      assert.equal(rep.locationStatus, 'LOCATION_MATCHED');
      assert.equal(rep.gpsAccuracy, 12);
      assert.equal(rep.freshness, 'JUST_NOW');
      assert.equal(rep.verifiedCount, 1);
      assert.deepEqual(rep.coordinates, [24.99902, 86.12359]); // Leaflet format [lat, lng]
    });

    it('corroborates repeated reports on the same road within time window', async () => {
      const payload = {
        reportType: 'ROAD_BLOCKED',
        roadSegment: 'NH-33 Commercial Arterial',
        description: 'Confirmed blockage, tailback growing rapidly',
        coordinates: [86.1237, 24.9991],
        accuracyMeters: 15,
        source: 'Test Suite',
      };

      const res = await fetch(`${baseUrl}/api/v1/traffic/reports`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      assert.equal(res.status, 201);
      const body = await res.json();
      const rep = body.data.report;
      assert.ok(rep.verifiedCount >= 2, `Expected verifiedCount >= 2, got ${rep.verifiedCount}`);
      assert.equal(rep.corroborationStatus, 'CORROBORATED');
    });
  });

  describe('3. Real-Time Report Retrieval', () => {
    it('GET /api/v1/traffic/reports returns active reports list', async () => {
      const res = await fetch(`${baseUrl}/api/v1/traffic/reports`);
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.success, true);
      assert.ok(Array.isArray(body.data.reports));
      assert.ok(body.data.reports.length >= 2);

      const found = body.data.reports.find((r) => r.roadSegment === 'NH-33 Commercial Arterial');
      assert.ok(found);
      assert.equal(found.reportType, 'ROAD_BLOCKED');
      assert.ok(found.freshness === 'JUST_NOW' || found.freshness === 'FRESH');
    });
  });
});

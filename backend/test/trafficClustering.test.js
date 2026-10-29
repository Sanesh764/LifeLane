import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { app } from '../server.js';
import { connectDB, disconnectDB } from '../config/db.js';
import { TrafficReport } from '../models/TrafficReport.js';
import { clusterActiveReports, getRelevantClustersForLocation } from '../services/trafficClusteringService.js';
import { generateDeterministicAdvisory } from '../services/trafficAdvisoryService.js';

describe('Traffic Clustering & Corridor Intelligence', () => {
  let server;
  let baseUrl;

  before(async () => {
    await connectDB();
    await TrafficReport.deleteMany({ source: 'Clustering Test Suite' });

    await new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  after(async () => {
    await TrafficReport.deleteMany({ source: 'Clustering Test Suite' });
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    await disconnectDB();
  });

  describe('1. Deterministic Fallback Advisory Generator', () => {
    it('produces structured, truthful advisory without fabricating AI output', () => {
      const mockCluster = {
        roadSegment: 'NH-33 Arterial Corridor',
        reportType: 'ROAD_BLOCKED',
        reportCount: 3,
        distinctReporters: 3,
        corroborationLevel: 'CORROBORATED_INCIDENT',
      };

      const advisory = generateDeterministicAdvisory(mockCluster);
      assert.ok(advisory.summary);
      assert.ok(advisory.recommendedCaution);
      assert.equal(advisory.advisorySource, 'DETERMINISTIC_FALLBACK');
      assert.equal(advisory.metaAiStatus, 'FALLBACK_ACTIVE');
      assert.ok(advisory.summary.includes('NH-33 Arterial Corridor'));
      assert.ok(advisory.summary.includes('Corroborated'));
    });
  });

  describe('2. Spatial & Distinct Reporter Clustering', () => {
    it('clusters 3 reports from distinct users within 500m into 1 CORROBORATED_INCIDENT', async () => {
      // Clear suite data
      await TrafficReport.deleteMany({ source: 'Clustering Test Suite' });

      // Report 1 - User A
      await TrafficReport.create({
        reporterId: 'user-a-phone-1',
        reportType: 'ROAD_BLOCKED',
        roadSegment: 'Bypass Road Milestone 4',
        location: { type: 'Point', coordinates: [86.1230, 24.9990] },
        locationDescription: 'Tree fallen',
        source: 'Clustering Test Suite',
        status: 'ACTIVE',
        capturedAt: new Date(),
      });

      // Report 2 - User B (200m away)
      await TrafficReport.create({
        reporterId: 'user-b-phone-2',
        reportType: 'ROAD_BLOCKED',
        roadSegment: 'Bypass Road Milestone 4',
        location: { type: 'Point', coordinates: [86.1245, 24.9992] },
        locationDescription: 'Complete road block',
        source: 'Clustering Test Suite',
        status: 'ACTIVE',
        capturedAt: new Date(),
      });

      // Report 3 - User C (300m away)
      await TrafficReport.create({
        reporterId: 'user-c-phone-3',
        reportType: 'ROAD_BLOCKED',
        roadSegment: 'Bypass Road Milestone 4',
        location: { type: 'Point', coordinates: [86.1225, 24.9988] },
        locationDescription: 'Traffic backing up 1km',
        source: 'Clustering Test Suite',
        status: 'ACTIVE',
        capturedAt: new Date(),
      });

      const clusters = await clusterActiveReports();
      const testCluster = clusters.find((c) => c.roadSegment && c.roadSegment.includes('Bypass Road'));
      assert.ok(testCluster, 'Cluster should exist for Bypass Road');
      assert.equal(testCluster.distinctReporters, 3);
      assert.equal(testCluster.corroborationLevel, 'CORROBORATED_INCIDENT');
      assert.equal(testCluster.reportType, 'ROAD_BLOCKED');
      assert.ok(testCluster.advisory);
    });

    it('prevents a single user submitting multiple times from artificially corroborating an incident', async () => {
      await TrafficReport.deleteMany({ source: 'Clustering Test Suite' });

      // Same user submitting 4 times
      for (let i = 0; i < 4; i++) {
        await TrafficReport.create({
          reporterId: 'spammer-device-999',
          reportType: 'ROAD_BLOCKED',
          roadSegment: 'Single User Repeated Road',
          location: { type: 'Point', coordinates: [86.1300, 25.0000] },
          locationDescription: `Attempt ${i + 1}`,
          source: 'Clustering Test Suite',
          status: 'ACTIVE',
          capturedAt: new Date(),
        });
      }

      const clusters = await clusterActiveReports();
      const spamCluster = clusters.find((c) => c.roadSegment && c.roadSegment.includes('Single User Repeated Road'));
      assert.ok(spamCluster);
      assert.equal(spamCluster.reportCount, 4);
      assert.equal(spamCluster.distinctReporters, 1, 'Distinct reporters must be strictly 1');
      assert.equal(spamCluster.corroborationLevel, 'UNVERIFIED_SINGLE_REPORT', 'Classification must remain UNVERIFIED');
    });

    it('does not merge reports that are > 1000m apart into the same cluster', async () => {
      await TrafficReport.deleteMany({ source: 'Clustering Test Suite' });

      // Point 1 in Lakhisarai
      await TrafficReport.create({
        reporterId: 'loc-1',
        reportType: 'ROAD_BLOCKED',
        roadSegment: 'District Highway 5 Point A',
        location: { type: 'Point', coordinates: [86.1200, 25.0000] },
        locationDescription: 'Accident at km 12',
        source: 'Clustering Test Suite',
        status: 'ACTIVE',
        capturedAt: new Date(),
      });

      // Point 2 ~5km away
      await TrafficReport.create({
        reporterId: 'loc-2',
        reportType: 'ROAD_BLOCKED',
        roadSegment: 'District Highway 5 Point B',
        location: { type: 'Point', coordinates: [86.1700, 25.0000] },
        locationDescription: 'Accident at km 17',
        source: 'Clustering Test Suite',
        status: 'ACTIVE',
        capturedAt: new Date(),
      });

      const clusters = await clusterActiveReports();
      const dh5Clusters = clusters.filter((c) => c.roadSegment && c.roadSegment.includes('District Highway 5'));
      assert.equal(dh5Clusters.length, 2, 'Reports >1000m apart should form 2 distinct clusters');
    });
  });

  describe('3. GET /api/v1/traffic/clusters Endpoint', () => {
    it('returns clusters near specified ambulance coordinates', async () => {
      const res = await fetch(`${baseUrl}/api/v1/traffic/clusters?lat=25.0000&lng=86.1200&radius=5000`);
      assert.equal(res.status, 200);
      const json = await res.json();
      assert.equal(json.success, true);
      assert.ok(Array.isArray(json.data.clusters));
      assert.ok(json.data.count >= 1);
    });

    it('rejects invalid latitude or longitude with 400', async () => {
      const res = await fetch(`${baseUrl}/api/v1/traffic/clusters?lat=abc&lng=xyz`);
      assert.equal(res.status, 400);
      const json = await res.json();
      assert.equal(json.error.code, 'INVALID_COORDINATES');
    });
  });
});

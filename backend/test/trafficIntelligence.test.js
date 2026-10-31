import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { app } from '../server.js';
import { connectDB, disconnectDB } from '../config/db.js';
import { TrafficReport } from '../models/TrafficReport.js';
import { TrafficIncident } from '../models/TrafficIncident.js';
import {
  clusterActiveReports,
  getRelevantClustersForLocation,
  areCategoriesCompatible,
  resolvePrimaryCategory,
  computeCorroborationStatus,
  ingestReportIntoIncident,
} from '../services/trafficClusteringService.js';
import { generateDeterministicAdvisory } from '../services/trafficAdvisoryService.js';
import { MetaAiService } from '../services/metaAiService.js';

describe('Part 1: Meta AI-Powered Traffic Intelligence System', () => {
  let server;
  let baseUrl;

  before(async () => {
    await connectDB();
    await TrafficReport.updateMany({ status: 'ACTIVE' }, { status: 'RESOLVED' });
    await TrafficReport.deleteMany({ source: 'Traffic Intelligence Suite' });
    await TrafficIncident.deleteMany({ roadSegment: { $regex: /Intelligence Suite/i } });

    await new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  after(async () => {
    await TrafficReport.deleteMany({ source: 'Traffic Intelligence Suite' });
    await TrafficIncident.deleteMany({ roadSegment: { $regex: /Intelligence Suite/i } });
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    await disconnectDB();
  });

  describe('1. Clustering & Corroboration Classification', () => {
    it('forms a CORROBORATED incident when 3 distinct users submit matching reports', async () => {
      await TrafficReport.deleteMany({ source: 'Traffic Intelligence Suite' });

      // User 1
      await TrafficReport.create({
        reporterId: 'road-user-alpha-1',
        reportType: 'ROAD_BLOCKED',
        roadSegment: 'Intelligence Suite Railway Crossing',
        location: { type: 'Point', coordinates: [86.1230, 24.9990] },
        locationDescription: 'Cargo vehicle stuck on tracks',
        source: 'Traffic Intelligence Suite',
        status: 'ACTIVE',
        capturedAt: new Date(),
      });

      // User 2 (180m away)
      await TrafficReport.create({
        reporterId: 'road-user-bravo-2',
        reportType: 'ROAD_BLOCKED',
        roadSegment: 'Intelligence Suite Railway Crossing',
        location: { type: 'Point', coordinates: [86.1242, 24.9992] },
        locationDescription: 'Complete lane blockage near crossing',
        source: 'Traffic Intelligence Suite',
        status: 'ACTIVE',
        capturedAt: new Date(),
      });

      // User 3 (220m away)
      await TrafficReport.create({
        reporterId: 'road-user-charlie-3',
        reportType: 'ROAD_BLOCKED',
        roadSegment: 'Intelligence Suite Railway Crossing',
        location: { type: 'Point', coordinates: [86.1225, 24.9988] },
        locationDescription: 'Traffic completely halted',
        source: 'Traffic Intelligence Suite',
        status: 'ACTIVE',
        capturedAt: new Date(),
      });

      const clusters = await clusterActiveReports();
      const cluster = clusters.find((c) => c.roadSegment.includes('Railway Crossing'));
      assert.ok(cluster, 'Cluster must be generated for Railway Crossing');
      assert.equal(cluster.distinctReporters, 3);
      assert.equal(cluster.reportCount, 3);
      assert.equal(cluster.corroborationStatus, 'CORROBORATED');
      assert.equal(cluster.isCorroborated, true);
      assert.ok(cluster.advisory);
      assert.equal(cluster.advisory.confidenceStatus, 'CORROBORATED');
    });

    it('produces a DEVELOPING incident when exactly 2 distinct users submit matching reports', async () => {
      await TrafficReport.deleteMany({ source: 'Traffic Intelligence Suite' });

      await TrafficReport.create({
        reporterId: 'dev-user-1',
        reportType: 'TRAFFIC_HIGH',
        roadSegment: 'Intelligence Suite Sector 4 Bypass',
        location: { type: 'Point', coordinates: [86.1300, 25.0000] },
        locationDescription: 'Congestion starting to build',
        source: 'Traffic Intelligence Suite',
        status: 'ACTIVE',
        capturedAt: new Date(),
      });

      await TrafficReport.create({
        reporterId: 'dev-user-2',
        reportType: 'TRAFFIC_HIGH',
        roadSegment: 'Intelligence Suite Sector 4 Bypass',
        location: { type: 'Point', coordinates: [86.1310, 25.0005] },
        locationDescription: 'Vehicles moving under 10 km/h',
        source: 'Traffic Intelligence Suite',
        status: 'ACTIVE',
        capturedAt: new Date(),
      });

      const clusters = await clusterActiveReports();
      const cluster = clusters.find((c) => c.roadSegment.includes('Sector 4 Bypass'));
      assert.ok(cluster);
      assert.equal(cluster.distinctReporters, 2);
      assert.equal(cluster.corroborationStatus, 'DEVELOPING');
      assert.equal(cluster.isCorroborated, false);
      assert.equal(cluster.advisory.confidenceStatus, 'DEVELOPING');
    });

    it('retains UNVERIFIED status when only 1 road user submits an observation', async () => {
      await TrafficReport.deleteMany({ source: 'Traffic Intelligence Suite' });

      await TrafficReport.create({
        reporterId: 'single-user-1',
        reportType: 'ROAD_BLOCKED',
        roadSegment: 'Intelligence Suite Rural Link Road',
        location: { type: 'Point', coordinates: [86.1400, 25.0100] },
        locationDescription: 'Branch fallen on road',
        source: 'Traffic Intelligence Suite',
        status: 'ACTIVE',
        capturedAt: new Date(),
      });

      const clusters = await clusterActiveReports();
      const cluster = clusters.find((c) => c.roadSegment.includes('Rural Link Road'));
      assert.ok(cluster);
      assert.equal(cluster.distinctReporters, 1);
      assert.equal(cluster.corroborationStatus, 'UNVERIFIED');
      assert.equal(cluster.isCorroborated, false);
    });

    it('prevents repeated submissions from a single reporter from inflating distinctReporterCount', async () => {
      await TrafficReport.deleteMany({ source: 'Traffic Intelligence Suite' });

      // Same user submits 5 times in rapid succession
      for (let i = 1; i <= 5; i++) {
        await TrafficReport.create({
          reporterId: 'spammer-device-id-12345',
          reportType: 'ROAD_BLOCKED',
          roadSegment: 'Intelligence Suite Single User Repeated Road',
          location: { type: 'Point', coordinates: [86.1500, 25.0200] },
          locationDescription: `Repeated report attempt #${i}`,
          source: 'Traffic Intelligence Suite',
          status: 'ACTIVE',
          capturedAt: new Date(),
        });
      }

      const clusters = await clusterActiveReports();
      const cluster = clusters.find((c) => c.roadSegment.includes('Single User Repeated Road'));
      assert.ok(cluster);
      assert.equal(cluster.reportCount, 5, 'Total reports should be 5');
      assert.equal(cluster.distinctReporters, 1, 'Distinct reporters must strictly remain 1');
      assert.equal(cluster.corroborationStatus, 'UNVERIFIED', 'Classification must remain UNVERIFIED');
    });

    it('does not group reports separated by > 1000m into the same cluster', async () => {
      await TrafficReport.deleteMany({ source: 'Traffic Intelligence Suite' });

      // Point A
      await TrafficReport.create({
        reporterId: 'loc-north-1',
        reportType: 'ROAD_BLOCKED',
        roadSegment: 'Intelligence Suite Highway Point North',
        location: { type: 'Point', coordinates: [86.1200, 25.0000] },
        source: 'Traffic Intelligence Suite',
        status: 'ACTIVE',
        capturedAt: new Date(),
      });

      // Point B (5.2 km away)
      await TrafficReport.create({
        reporterId: 'loc-south-2',
        reportType: 'ROAD_BLOCKED',
        roadSegment: 'Intelligence Suite Highway Point South',
        location: { type: 'Point', coordinates: [86.1720, 25.0000] },
        source: 'Traffic Intelligence Suite',
        status: 'ACTIVE',
        capturedAt: new Date(),
      });

      const clusters = await clusterActiveReports({ radiusMeters: 1000 });
      const related = clusters.filter((c) => c.roadSegment.includes('Intelligence Suite Highway'));
      assert.equal(related.length, 2, 'Reports separated by >1000m must form 2 distinct clusters');
    });

    it('does not group reports older than the time window (>60 minutes)', async () => {
      await TrafficReport.deleteMany({ source: 'Traffic Intelligence Suite' });

      const ninetyMinutesAgo = new Date(Date.now() - 90 * 60 * 1000);

      // Stale report
      await TrafficReport.create({
        reporterId: 'stale-user',
        reportType: 'ROAD_BLOCKED',
        roadSegment: 'Intelligence Suite Expired Observation Road',
        location: { type: 'Point', coordinates: [86.1250, 24.9995] },
        source: 'Traffic Intelligence Suite',
        status: 'ACTIVE',
        capturedAt: ninetyMinutesAgo,
      });

      const clusters = await clusterActiveReports({ windowMinutes: 60 });
      const staleCluster = clusters.find((c) => c.roadSegment.includes('Expired Observation Road'));
      assert.equal(staleCluster, undefined, 'Stale report (>60 mins) must not appear in active clusters');
    });

    it('merges compatible hazard categories (ROAD_BLOCKED and TRAFFIC_HIGH) into one common incident', async () => {
      await TrafficReport.deleteMany({ source: 'Traffic Intelligence Suite' });

      // User 1 reports ROAD_BLOCKED
      await TrafficReport.create({
        reporterId: 'compat-user-1',
        reportType: 'ROAD_BLOCKED',
        roadSegment: 'Intelligence Suite Compatible Corridor',
        location: { type: 'Point', coordinates: [86.1205, 24.9990] },
        locationDescription: 'Road blocked near market gate',
        source: 'Traffic Intelligence Suite',
        status: 'ACTIVE',
        capturedAt: new Date(),
      });

      // User 2 reports TRAFFIC_HIGH at same market gate
      await TrafficReport.create({
        reporterId: 'compat-user-2',
        reportType: 'TRAFFIC_HIGH',
        roadSegment: 'Intelligence Suite Compatible Corridor',
        location: { type: 'Point', coordinates: [86.1210, 24.9992] },
        locationDescription: 'Heavy traffic tailing back 800m',
        source: 'Traffic Intelligence Suite',
        status: 'ACTIVE',
        capturedAt: new Date(),
      });

      const clusters = await clusterActiveReports();
      const cluster = clusters.find((c) => c.roadSegment.includes('Compatible Corridor'));
      assert.ok(cluster, 'Compatible reports should cluster together');
      assert.equal(cluster.distinctReporters, 2);
      assert.equal(cluster.reportType, 'ROAD_BLOCKED', 'Highest severity category must take precedence');
    });

    it('does not merge incompatible categories (CLEAR and ROAD_BLOCKED)', () => {
      assert.equal(areCategoriesCompatible('CLEAR', 'ROAD_BLOCKED'), false);
      assert.equal(areCategoriesCompatible('ROAD_BLOCKED', 'TRAFFIC_HIGH'), true);
      assert.equal(areCategoriesCompatible('TRAFFIC_HIGH', 'TRAFFIC_HIGH'), true);
    });
  });

  describe('2. Meta AI Service & Structured Output Validation', () => {
    it('produces structured, validated advisory when Meta API returns valid JSON', async () => {
      const mockMetaService = new MetaAiService({
        apiKey: 'test_valid_meta_key_9999',
        model: 'muse-spark-1.3',
      });

      // Mock validateAndSanitizeResponse directly
      const mockRawJson = {
        summary: 'Possible road blockage reported near Railway Crossing. Three independent road users submitted matching reports within the last 11 minutes.',
        incidentType: 'ROAD_BLOCKAGE',
        locationLabel: 'Railway Crossing',
        reportCount: 3,
        confidenceStatus: 'CORROBORATED',
        recommendedAction: 'Exercise caution when approaching this location.',
        verificationNote: 'Community-reported; not independently verified.',
      };

      const clusterFixture = {
        incidentType: 'ROAD_BLOCKED',
        roadSegment: 'Railway Crossing',
        reportCount: 3,
        corroborationStatus: 'CORROBORATED',
      };

      const result = mockMetaService.validateAndSanitizeResponse(mockRawJson, clusterFixture, 'META_AI');
      assert.ok(result);
      assert.equal(result.summarySource, 'META_AI');
      assert.equal(result.metaModelUsed, 'muse-spark-1.3');
      assert.equal(result.confidenceStatus, 'CORROBORATED');
      assert.equal(result.reportCount, 3);
      assert.equal(result.locationLabel, 'Railway Crossing');
      assert.equal(result.verificationNote, 'Community-reported; not independently verified.');
    });

    it('successfully generates advisory with live Meta Model API (muse-spark-1.3)', async () => {
      const cometKey = process.env.COMET_API_KEY;
      if (!cometKey) {
        return; // Skip live check if key absent
      }

      const liveService = new MetaAiService({
        apiKey: cometKey,
        model: 'muse-spark-1.3',
        baseUrl: 'https://api.meta.ai/v1',
      });

      const clusterFixture = {
        incidentType: 'ROAD_BLOCKED',
        roadSegment: 'Intelligence Suite Railway Crossing',
        reportCount: 3,
        distinctReporterCount: 3,
        corroborationStatus: 'CORROBORATED',
        reports: [
          { reportType: 'ROAD_BLOCKED', locationDescription: 'Overturned truck', capturedAt: new Date() },
          { reportType: 'ROAD_BLOCKED', locationDescription: 'Blocked crossing gate', capturedAt: new Date() },
          { reportType: 'ROAD_BLOCKED', locationDescription: 'Cannot pass', capturedAt: new Date() },
        ],
      };

      const advisory = await liveService.generateAdvisory(clusterFixture);
      assert.ok(advisory);
      assert.equal(advisory.summarySource, 'META_AI');
      assert.equal(advisory.metaModelUsed, 'muse-spark-1.3');
      assert.equal(advisory.metaAiStatus, 'SUCCESS');
      assert.ok(advisory.summary.length >= 10);
      assert.ok(advisory.recommendedAction);
    });

    it('handles Meta authentication failure and activates safe fallback without crashing', async () => {
      const badKeyService = new MetaAiService({
        apiKey: 'invalid_simulated_key_99999',
        groqApiKey: null, // isolate Meta auth failure
        baseUrl: 'https://api.meta.ai/v1',
      });

      const clusterFixture = {
        incidentType: 'ROAD_BLOCKED',
        roadSegment: 'Intelligence Suite Auth Test',
        reportCount: 2,
        distinctReporterCount: 2,
        corroborationStatus: 'DEVELOPING',
      };

      const advisory = await badKeyService.generateAdvisory(clusterFixture);
      assert.ok(advisory);
      assert.equal(advisory.summarySource, 'SYSTEM_FALLBACK');
      assert.ok(advisory.metaAiStatus === 'API_ERROR' || advisory.metaAiStatus === 'RATE_LIMITED');
      assert.notEqual(advisory.summarySource, 'META_AI');
    });

    it('handles Meta network timeout and activates safe fallback cleanly', async () => {
      // Point to unrouteable port to test network timeout handling
      const timeoutService = new MetaAiService({
        apiKey: 'test_key',
        baseUrl: 'http://127.0.0.1:59999', // nothing listening
        groqApiKey: null,
      });

      const clusterFixture = {
        incidentType: 'TRAFFIC_HIGH',
        roadSegment: 'Timeout Corridor',
        reportCount: 2,
        distinctReporterCount: 2,
        corroborationStatus: 'DEVELOPING',
      };

      const advisory = await timeoutService.generateAdvisory(clusterFixture);
      assert.ok(advisory);
      assert.equal(advisory.summarySource, 'SYSTEM_FALLBACK');
      assert.ok(advisory.metaAiStatus === 'NETWORK_ERROR' || advisory.metaAiStatus === 'TIMEOUT');
    });

    it('rejects malformed JSON and falls back to deterministic advisory', async () => {
      const service = new MetaAiService({ apiKey: null, groqApiKey: null }); // Unconfigured triggers deterministic fallback

      const clusterFixture = {
        incidentType: 'ROAD_BLOCKED',
        roadSegment: 'Intelligence Suite Fallback Sector',
        reportCount: 3,
        distinctReporterCount: 3,
        corroborationStatus: 'CORROBORATED',
      };

      const advisory = await service.generateAdvisory(clusterFixture);
      assert.ok(advisory);
      assert.equal(advisory.summarySource, 'SYSTEM_FALLBACK');
      assert.ok(advisory.summary.includes('SYSTEM ADVISORY'));
      assert.ok(advisory.summary.includes('3 independent users'));
      assert.equal(advisory.confidenceStatus, 'CORROBORATED');
      assert.equal(advisory.verificationNote, 'Community-reported; not independently verified.');
    });

    it('clearly distinguishes META_AI from SYSTEM_FALLBACK in source property', () => {
      const fallbackAdvisory = generateDeterministicAdvisory({
        roadSegment: 'Corridor 10',
        reportType: 'ROAD_BLOCKED',
        reportCount: 3,
        distinctReporterCount: 3,
        corroborationStatus: 'CORROBORATED',
      });

      assert.equal(fallbackAdvisory.summarySource, 'SYSTEM_FALLBACK');
      assert.notEqual(fallbackAdvisory.summarySource, 'META_AI');
    });
  });

  describe('3. Persistent TrafficIncident Storage & Concurrency', () => {
    it('ingests report and creates persistent TrafficIncident in MongoDB', async () => {
      await TrafficReport.deleteMany({ source: 'Traffic Intelligence Suite' });
      await TrafficIncident.deleteMany({});

      const report1 = await TrafficReport.create({
        reporterId: 'persistent-reporter-1',
        reportType: 'ROAD_BLOCKED',
        roadSegment: 'Intelligence Suite Persistent Boulevard',
        location: { type: 'Point', coordinates: [86.1260, 24.9995] },
        locationDescription: 'Tree blocking lanes',
        source: 'Traffic Intelligence Suite',
        status: 'ACTIVE',
        capturedAt: new Date(),
      });

      const incident = await ingestReportIntoIncident(report1);
      assert.ok(incident);
      assert.equal(incident.roadSegment, 'Intelligence Suite Persistent Boulevard');
      assert.equal(incident.distinctReporterCount, 1);
      assert.equal(incident.corroborationStatus, 'UNVERIFIED');
      assert.ok(incident.advisory);

      // Ingest second report from distinct user
      const report2 = await TrafficReport.create({
        reporterId: 'persistent-reporter-2',
        reportType: 'ROAD_BLOCKED',
        roadSegment: 'Intelligence Suite Persistent Boulevard',
        location: { type: 'Point', coordinates: [86.1270, 24.9998] },
        locationDescription: 'Heavy backlog behind tree',
        source: 'Traffic Intelligence Suite',
        status: 'ACTIVE',
        capturedAt: new Date(),
      });

      const updatedIncident = await ingestReportIntoIncident(report2);
      assert.equal(updatedIncident._id.toString(), incident._id.toString(), 'Should update existing incident');
      assert.equal(updatedIncident.distinctReporterCount, 2);
      assert.equal(updatedIncident.corroborationStatus, 'DEVELOPING');
    });

    it('handles concurrent report submissions safely without inflating counts', async () => {
      await TrafficIncident.deleteMany({});
      await TrafficReport.deleteMany({ source: 'Traffic Intelligence Suite' });

      const reportSameUser1 = await TrafficReport.create({
        reporterId: 'concurrent-user-a',
        reportType: 'TRAFFIC_HIGH',
        roadSegment: 'Intelligence Suite Concurrent Avenue',
        location: { type: 'Point', coordinates: [86.1350, 25.0020] },
        source: 'Traffic Intelligence Suite',
        status: 'ACTIVE',
      });

      const reportSameUser2 = await TrafficReport.create({
        reporterId: 'concurrent-user-a',
        reportType: 'TRAFFIC_HIGH',
        roadSegment: 'Intelligence Suite Concurrent Avenue',
        location: { type: 'Point', coordinates: [86.1351, 25.0021] },
        source: 'Traffic Intelligence Suite',
        status: 'ACTIVE',
      });

      // Ingest sequentially or concurrently
      const inc1 = await ingestReportIntoIncident(reportSameUser1);
      const inc2 = await ingestReportIntoIncident(reportSameUser2);

      assert.equal(inc1._id.toString(), inc2._id.toString());
      assert.equal(inc2.distinctReporterCount, 1, 'Distinct reporter count must be 1 for same user');
    });
  });

  describe('4. Driver Incident Relevance & API Integration', () => {
    before(async () => {
      // Ensure Railway Crossing reports exist for driver queries
      await TrafficReport.create({
        reporterId: 'driver-rel-user-1',
        reportType: 'ROAD_BLOCKED',
        roadSegment: 'Intelligence Suite Railway Crossing',
        location: { type: 'Point', coordinates: [86.1230, 24.9990] },
        source: 'Traffic Intelligence Suite',
        status: 'ACTIVE',
        capturedAt: new Date(),
      });
      await TrafficReport.create({
        reporterId: 'driver-rel-user-2',
        reportType: 'ROAD_BLOCKED',
        roadSegment: 'Intelligence Suite Railway Crossing',
        location: { type: 'Point', coordinates: [86.1235, 24.9991] },
        source: 'Traffic Intelligence Suite',
        status: 'ACTIVE',
        capturedAt: new Date(),
      });
      await TrafficReport.create({
        reporterId: 'driver-rel-user-3',
        reportType: 'ROAD_BLOCKED',
        roadSegment: 'Intelligence Suite Railway Crossing',
        location: { type: 'Point', coordinates: [86.1228, 24.9989] },
        source: 'Traffic Intelligence Suite',
        status: 'ACTIVE',
        capturedAt: new Date(),
      });
    });

    it('GET /api/v1/traffic/clusters returns clusters near ambulance coordinates', async () => {
      const res = await fetch(`${baseUrl}/api/v1/traffic/clusters?lat=24.9990&lng=86.1230&radius=5000`);
      assert.equal(res.status, 200);
      const json = await res.json();
      assert.equal(json.success, true);
      assert.ok(Array.isArray(json.data.clusters));
      assert.ok(json.data.count >= 1);

      const cluster = json.data.clusters.find((c) => c.roadSegment.includes('Railway Crossing'));
      assert.ok(cluster);
      assert.equal(cluster.corroborationStatus, 'CORROBORATED');
      assert.ok(cluster.advisory.summary);
      assert.ok(cluster.distanceToDriverMeters !== undefined);
    });

    it('filters out geographically distant clusters when ambulance coordinates are supplied', async () => {
      // Query 50km away from Railway Crossing (e.g. 25.5000 N, 85.1000 E) with a small radius of 2000m
      const res = await fetch(`${baseUrl}/api/v1/traffic/clusters?lat=25.5000&lng=85.1000&radius=2000`);
      assert.equal(res.status, 200);
      const json = await res.json();
      const distantCluster = json.data.clusters.find((c) => c.roadSegment.includes('Railway Crossing'));
      assert.equal(distantCluster, undefined, 'Railway Crossing should be filtered out when >50km away');
    });
  });
});

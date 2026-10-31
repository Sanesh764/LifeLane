import { TrafficReport } from '../models/TrafficReport.js';
import { TrafficIncident } from '../models/TrafficIncident.js';
import { calculateDistanceMeters } from './notificationService.js';
import { metaAiService } from './metaAiService.js';
import { env } from '../config/env.js';

/**
 * Traffic Clustering & Corroboration Engine
 * 
 * Aggregates crowdsourced citizen reports into corroborated traffic incidents
 * using spatial proximity, category compatibility, time windows, and distinct reporter tracking.
 */

export const CLUSTER_CONFIG = {
  windowMinutes: env.TRAFFIC?.clusterWindowMinutes || 60,
  radiusMeters: env.TRAFFIC?.clusterRadiusMeters || 1000,
  corroborationThreshold: env.TRAFFIC?.corroborationThreshold || 3,
};

/**
 * Checks whether two categories are compatible for incident grouping
 * ROAD_BLOCKED and TRAFFIC_HIGH both indicate severe roadway obstruction
 */
export function areCategoriesCompatible(typeA, typeB) {
  if (typeA === typeB) return true;
  const hazardGroup = new Set(['ROAD_BLOCKED', 'TRAFFIC_HIGH']);
  if (hazardGroup.has(typeA) && hazardGroup.has(typeB)) return true;
  return false;
}

/**
 * Returns higher severity category when merging compatible reports
 */
export function resolvePrimaryCategory(typeA, typeB) {
  if (typeA === 'ROAD_BLOCKED' || typeB === 'ROAD_BLOCKED') return 'ROAD_BLOCKED';
  if (typeA === 'TRAFFIC_HIGH' || typeB === 'TRAFFIC_HIGH') return 'TRAFFIC_HIGH';
  if (typeA === 'CANNOT_ASSESS' || typeB === 'CANNOT_ASSESS') return 'CANNOT_ASSESS';
  return typeA || typeB || 'CLEAR';
}

/**
 * Determines corroboration status from distinct reporter count
 */
export function computeCorroborationStatus(distinctCount, threshold = CLUSTER_CONFIG.corroborationThreshold) {
  if (distinctCount >= threshold) return 'CORROBORATED';
  if (distinctCount >= 2) return 'DEVELOPING';
  return 'UNVERIFIED';
}

/**
 * Checks whether two road names can describe the same corridor / intersection
 */
export function areRoadNamesCompatible(roadA, roadB) {
  if (!roadA || !roadB) return true; // If either is unassigned, permit coordinate-based match
  const cleanA = roadA.toLowerCase().replace(/[^a-z0-9]/g, ' ').trim();
  const cleanB = roadB.toLowerCase().replace(/[^a-z0-9]/g, ' ').trim();
  if (cleanA === cleanB || cleanA.includes(cleanB) || cleanB.includes(cleanA)) {
    return true;
  }
  // Exclude common generic tokens so unrelated roads aren't falsely grouped by prefixes
  const stopWords = new Set(['intelligence', 'suite', 'road', 'street', 'avenue', 'marg', 'path', 'corridor', 'lane', 'dr', 'drive', 'point']);
  const tokensA = new Set(cleanA.split(/\s+/).filter((t) => t.length > 2 && !stopWords.has(t)));
  const tokensB = new Set(cleanB.split(/\s+/).filter((t) => t.length > 2 && !stopWords.has(t)));
  if (tokensA.size === 0 || tokensB.size === 0) return false;
  const common = Array.from(tokensB).filter((t) => tokensA.has(t));
  return common.length > 0;
}

/**
 * Check whether report coordinates/road match a cluster within configured radius
 * Enforces: Do not combine reports from geographically unrelated roads.
 */
export function isGeographicallyOrNameMatched(
  reportCoords,
  reportRoad,
  clusterCoords,
  clusterRoad,
  radiusMeters = CLUSTER_CONFIG.radiusMeters
) {
  // Enforce road compatibility: do not combine reports from unrelated roads
  if (reportRoad && clusterRoad && !areRoadNamesCompatible(reportRoad, clusterRoad)) {
    return false;
  }

  if (reportCoords && clusterCoords) {
    const dist = calculateDistanceMeters(reportCoords, clusterCoords);
    if (dist !== null && dist <= radiusMeters) return true;
    if (dist !== null && dist > radiusMeters) return false;
  }

  // Fallback: If coordinates are absent for either, match by road name
  if (!reportCoords || !clusterCoords) {
    if (reportRoad && clusterRoad && areRoadNamesCompatible(reportRoad, clusterRoad)) {
      return true;
    }
  }

  return false;
}

/**
 * Ingest a newly submitted report into persistent TrafficIncident representation
 */
export async function ingestReportIntoIncident(report) {
  if (!report) return null;

  const reportCoords = report.location?.coordinates; // [lng, lat]
  const reportRoad = report.roadSegment;
  const reportType = report.reportType;
  const reporterKey = (report.reporterId || report.source || report._id.toString()).trim();
  const windowMins = CLUSTER_CONFIG.windowMinutes;
  const radiusMeters = CLUSTER_CONFIG.radiusMeters;
  const since = new Date(Date.now() - windowMins * 60 * 1000);

  // Look for existing active incidents on or near this segment within the time window
  const query = {
    status: 'ACTIVE',
    latestReportedAt: { $gte: since },
  };

  let candidates = await TrafficIncident.find(query).sort({ latestReportedAt: -1 }).limit(50);

  // Filter candidates by category compatibility and geographical/name proximity
  let matchedIncident = candidates.find((cand) =>
    areCategoriesCompatible(cand.incidentType, reportType) &&
    isGeographicallyOrNameMatched(reportCoords, reportRoad, cand.location?.coordinates, cand.roadSegment, radiusMeters)
  );

  if (matchedIncident) {
    // Add report to existing incident
    if (!matchedIncident.reportIds.includes(report._id)) {
      matchedIncident.reportIds.push(report._id);
    }

    const reporterSet = new Set(matchedIncident.reporterIds || []);
    const wasNewReporter = !reporterSet.has(reporterKey);
    reporterSet.add(reporterKey);

    matchedIncident.reporterIds = Array.from(reporterSet);
    matchedIncident.distinctReporterCount = reporterSet.size;
    matchedIncident.reportCount = matchedIncident.reportIds.length;
    matchedIncident.latestReportedAt = report.capturedAt || new Date();
    matchedIncident.incidentType = resolvePrimaryCategory(matchedIncident.incidentType, reportType);
    matchedIncident.corroborationStatus = computeCorroborationStatus(matchedIncident.distinctReporterCount);

    // Recompute average center coordinates
    if (reportCoords) {
      const allReports = await TrafficReport.find({ _id: { $in: matchedIncident.reportIds } }).select('location');
      const validCoords = allReports
        .map((r) => r.location?.coordinates)
        .filter((c) => Array.isArray(c) && c.length === 2);

      if (validCoords.length > 0) {
        const sumLng = validCoords.reduce((acc, c) => acc + c[0], 0);
        const sumLat = validCoords.reduce((acc, c) => acc + c[1], 0);
        matchedIncident.location.coordinates = [
          Number((sumLng / validCoords.length).toFixed(6)),
          Number((sumLat / validCoords.length).toFixed(6)),
        ];
      }
    }

    // Refresh advisory only if a new distinct reporter joined or category escalated
    if (wasNewReporter || !matchedIncident.advisory?.summary) {
      matchedIncident.advisory = await metaAiService.generateAdvisory(matchedIncident);
    }

    await matchedIncident.save();
    return matchedIncident;
  }

  // Create new incident
  const fallbackCoords = reportCoords || [86.1236, 24.9992];
  const newIncident = new TrafficIncident({
    incidentType: reportType,
    roadSegment: reportRoad,
    location: {
      type: 'Point',
      coordinates: fallbackCoords,
    },
    locationDescription: report.locationDescription || `Reported near ${reportRoad}`,
    reportIds: [report._id],
    reporterIds: [reporterKey],
    distinctReporterCount: 1,
    reportCount: 1,
    corroborationStatus: 'UNVERIFIED',
    firstReportedAt: report.capturedAt || new Date(),
    latestReportedAt: report.capturedAt || new Date(),
    advisory: {
      summary: `Preliminary report near ${reportRoad}.`,
      summarySource: 'SYSTEM_FALLBACK',
    },
    status: 'ACTIVE',
  });

  newIncident.advisory = await metaAiService.generateAdvisory(newIncident);
  await newIncident.save();
  return newIncident;
}

/**
 * Cluster active reports from the database into consolidated incidents
 * Keeps backward compatibility for existing callers and tests.
 */
export async function clusterActiveReports(options = {}) {
  const windowMins = options.windowMinutes || CLUSTER_CONFIG.windowMinutes;
  const radiusMeters = options.radiusMeters || CLUSTER_CONFIG.radiusMeters;
  const threshold = options.corroborationThreshold || CLUSTER_CONFIG.corroborationThreshold;

  const since = new Date(Date.now() - windowMins * 60 * 1000);

  const activeReports = await TrafficReport.find({
    status: 'ACTIVE',
    capturedAt: { $gte: since },
  }).sort({ capturedAt: -1 });

  const rawClusters = [];

  for (const report of activeReports) {
    const reportCoords = report.location?.coordinates; // [lng, lat]
    const reportRoad = report.roadSegment;
    const reportType = report.reportType;

    let matchedCluster = null;

    for (const cluster of rawClusters) {
      if (!areCategoriesCompatible(cluster.reportType, reportType)) continue;

      if (
        isGeographicallyOrNameMatched(
          reportCoords,
          reportRoad,
          cluster.centerCoordinates,
          cluster.roadSegment,
          radiusMeters
        )
      ) {
        matchedCluster = cluster;
        break;
      }
    }

    if (matchedCluster) {
      matchedCluster.reports.push(report);
      const reporterKey = (report.reporterId || report.source || report._id.toString()).trim();
      matchedCluster.reporterSet.add(reporterKey);
      matchedCluster.reportType = resolvePrimaryCategory(matchedCluster.reportType, reportType);

      if (reportCoords) {
        matchedCluster.coordsList.push(reportCoords);
        const sumLng = matchedCluster.coordsList.reduce((acc, c) => acc + c[0], 0);
        const sumLat = matchedCluster.coordsList.reduce((acc, c) => acc + c[1], 0);
        matchedCluster.centerCoordinates = [
          Number((sumLng / matchedCluster.coordsList.length).toFixed(6)),
          Number((sumLat / matchedCluster.coordsList.length).toFixed(6)),
        ];
      }

      if (new Date(report.capturedAt) > new Date(matchedCluster.latestReportedAt)) {
        matchedCluster.latestReportedAt = report.capturedAt;
      }
      if (new Date(report.capturedAt) < new Date(matchedCluster.firstReportedAt)) {
        matchedCluster.firstReportedAt = report.capturedAt;
      }
    } else {
      const reporterKey = (report.reporterId || report.source || report._id.toString()).trim();
      const reporterSet = new Set([reporterKey]);
      const coordsList = reportCoords ? [reportCoords] : [];

      rawClusters.push({
        id: `cluster-${report.reportType.toLowerCase()}-${rawClusters.length + 1}-${Date.now().toString(36)}`,
        reportType,
        incidentType: reportType,
        roadSegment: reportRoad,
        locationDescription: report.locationDescription || `Reported near ${reportRoad}`,
        centerCoordinates: reportCoords || null,
        coordsList,
        reporterSet,
        firstReportedAt: report.capturedAt,
        latestReportedAt: report.capturedAt,
        reports: [report],
      });
    }
  }

  // Format and annotate each cluster with classification and advisory
  const formattedClusters = await Promise.all(
    rawClusters.map(async (c) => {
      const distinctReporters = c.reporterSet.size;
      const reportCount = c.reports.length;
      const corroborationStatus = computeCorroborationStatus(distinctReporters, threshold);

      // Backwards compatibility for previous string constants
      const corroborationLevel =
        corroborationStatus === 'CORROBORATED'
          ? 'CORROBORATED_INCIDENT'
          : corroborationStatus === 'DEVELOPING'
          ? 'DEVELOPING_REPORT'
          : 'UNVERIFIED_SINGLE_REPORT';

      const clusterData = {
        id: c.id,
        reportType: c.reportType,
        incidentType: c.reportType,
        roadSegment: c.roadSegment,
        locationDescription: c.locationDescription,
        centerCoordinates: c.centerCoordinates, // [lng, lat]
        leafletCoordinates:
          c.centerCoordinates && c.centerCoordinates.length === 2
            ? [c.centerCoordinates[1], c.centerCoordinates[0]] // [lat, lng]
            : null,
        reportCount,
        distinctReporters,
        distinctReporterCount: distinctReporters,
        corroborationThreshold: threshold,
        corroborationStatus,
        corroborationLevel,
        isCorroborated: corroborationStatus === 'CORROBORATED',
        firstReportedAt: c.firstReportedAt,
        latestReportedAt: c.latestReportedAt,
        reports: c.reports.map((r) => ({
          id: r._id ? r._id.toString() : r.id,
          reportType: r.reportType,
          capturedAt: r.capturedAt,
          locationStatus: r.locationStatus,
          accuracyMeters: r.locationAccuracyMeters,
          source: r.source,
        })),
      };

      const advisory = await metaAiService.generateAdvisory(clusterData);
      return {
        ...clusterData,
        advisory,
      };
    })
  );

  return formattedClusters;
}

/**
 * Filter clusters to those relevant to a specific geographic position (e.g. active ambulance)
 */
export async function getRelevantClustersForLocation(lat, lng, radiusMeters = 15000) {
  const allClusters = await clusterActiveReports();

  if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) {
    return allClusters;
  }

  const driverCoords = [Number(lng), Number(lat)];

  const relevant = allClusters.filter((cluster) => {
    if (!cluster.centerCoordinates) {
      return false;
    }
    const dist = calculateDistanceMeters(driverCoords, cluster.centerCoordinates);
    cluster.distanceToDriverMeters = Math.round(dist);
    cluster.distanceToDriverKm = Number((dist / 1000).toFixed(1));
    return dist <= radiusMeters;
  });

  // Sort by distance ascending, then by severity
  relevant.sort((a, b) => {
    const severityOrder = { ROAD_BLOCKED: 0, TRAFFIC_HIGH: 1, CANNOT_ASSESS: 2, CLEAR: 3 };
    const sevA = severityOrder[a.reportType] ?? 99;
    const sevB = severityOrder[b.reportType] ?? 99;
    if (sevA !== sevB) return sevA - sevB;
    return (a.distanceToDriverMeters || 0) - (b.distanceToDriverMeters || 0);
  });

  return relevant;
}

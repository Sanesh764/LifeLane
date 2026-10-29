import { TrafficReport } from '../models/TrafficReport.js';
import { calculateDistanceMeters } from './notificationService.js';
import { generateClusterAdvisory } from './trafficAdvisoryService.js';

/**
 * Configuration defaults (overrideable via process.env)
 */
export const CLUSTER_CONFIG = {
  windowMinutes: parseInt(process.env.TRAFFIC_CLUSTER_WINDOW_MINUTES || '60', 10),
  radiusMeters: parseInt(process.env.TRAFFIC_CLUSTER_RADIUS_METERS || '1000', 10),
  corroborationThreshold: parseInt(process.env.TRAFFIC_CORROBORATION_THRESHOLD || '3', 10),
};

/**
 * Checks whether two reports or a report and cluster belong together
 */
function isGeographicallyOrNameMatched(reportCoords, reportRoad, clusterCoords, clusterRoad, radiusMeters) {
  if (reportCoords && clusterCoords) {
    const dist = calculateDistanceMeters(reportCoords, clusterCoords);
    if (dist <= radiusMeters) return true;
  }

  // Fallback: Road name normalized matching
  if (reportRoad && clusterRoad) {
    const r1 = reportRoad.toLowerCase().trim();
    const r2 = clusterRoad.toLowerCase().trim();
    if (r1 === r2 || r1.includes(r2) || r2.includes(r1)) {
      return true;
    }
  }

  return false;
}

/**
 * Cluster active reports from the database into consolidated incidents
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
      if (cluster.reportType !== reportType) continue;

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
      // Update distinct reporters set
      const reporterKey = report.reporterId || report.source || report._id.toString();
      matchedCluster.reporterSet.add(reporterKey);

      // Recompute average center coordinates
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
      const reporterKey = report.reporterId || report.source || report._id.toString();
      const reporterSet = new Set([reporterKey]);
      const coordsList = reportCoords ? [reportCoords] : [];

      rawClusters.push({
        id: `cluster-${report.reportType.toLowerCase()}-${rawClusters.length + 1}-${Date.now().toString(36)}`,
        reportType,
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

      let corroborationLevel = 'UNVERIFIED_SINGLE_REPORT';
      if (distinctReporters >= threshold) {
        corroborationLevel = 'CORROBORATED_INCIDENT';
      } else if (distinctReporters >= 2) {
        corroborationLevel = 'DEVELOPING_REPORT';
      }

      const clusterData = {
        id: c.id,
        reportType: c.reportType,
        roadSegment: c.roadSegment,
        locationDescription: c.locationDescription,
        centerCoordinates: c.centerCoordinates, // [lng, lat]
        leafletCoordinates:
          c.centerCoordinates && c.centerCoordinates.length === 2
            ? [c.centerCoordinates[1], c.centerCoordinates[0]] // [lat, lng]
            : null,
        reportCount,
        distinctReporters,
        corroborationThreshold: threshold,
        corroborationLevel,
        isCorroborated: corroborationLevel === 'CORROBORATED_INCIDENT',
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

      const advisory = await generateClusterAdvisory(clusterData);
      return {
        ...clusterData,
        advisory,
      };
    })
  );

  return formattedClusters;
}

/**
 * Filter clusters to those relevant to a specific geographic position (e.g., active ambulance)
 */
export async function getRelevantClustersForLocation(lat, lng, radiusMeters = 15000) {
  const allClusters = await clusterActiveReports();

  if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) {
    return allClusters;
  }

  const driverCoords = [Number(lng), Number(lat)];

  const relevant = allClusters.filter((cluster) => {
    if (!cluster.centerCoordinates) {
      // If no coordinates, do not inject into an explicit coordinate-filtered search
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

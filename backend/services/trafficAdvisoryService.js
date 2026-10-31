/**
 * AmbuRoute Traffic Advisory Service (Deterministic Safety Fallback)
 * 
 * Provides reliable, deterministic operational advisories directly from cluster data
 * when AI is unavailable, unconfigured, timed out, or rate-limited.
 */

export function generateDeterministicAdvisory({
  incidentType,
  reportType,
  roadSegment,
  reportCount = 1,
  distinctReporterCount = 1,
  distinctReporters = 1,
  corroborationStatus = 'UNVERIFIED',
  corroborationLevel = null,
}) {
  const type = incidentType || reportType || 'TRAFFIC_HIGH';
  const reporters = distinctReporterCount || distinctReporters || 1;
  const count = reportCount || reporters || 1;

  // Normalize status to standard 'UNVERIFIED' | 'DEVELOPING' | 'CORROBORATED'
  let status = corroborationStatus;
  if (!status || status === 'UNVERIFIED_SINGLE_REPORT') {
    status = reporters >= 3 ? 'CORROBORATED' : reporters >= 2 ? 'DEVELOPING' : 'UNVERIFIED';
  } else if (corroborationLevel) {
    status =
      corroborationLevel === 'CORROBORATED_INCIDENT'
        ? 'CORROBORATED'
        : corroborationLevel === 'DEVELOPING_REPORT'
        ? 'DEVELOPING'
        : 'UNVERIFIED';
  }

  const typeDescription =
    type === 'ROAD_BLOCKED'
      ? 'road blockage'
      : type === 'TRAFFIC_HIGH'
      ? 'heavy traffic congestion'
      : type === 'CLEAR'
      ? 'clear traffic flow'
      : 'traffic condition';

  const userNoun = reporters === 1 ? 'One road user' : `${reporters} independent users`;

  let summary = '';
  let recommendedAction = '';

  if (status === 'CORROBORATED') {
    summary = `SYSTEM ADVISORY: ${userNoun} reported a possible ${typeDescription} near ${roadSegment} within the last hour. Corroborated incident. Exercise caution.`;
    recommendedAction =
      type === 'ROAD_BLOCKED'
        ? 'High probability of lane obstruction. Review alternative route if approaching this sector.'
        : 'Expect heavy traffic and slower transit times through this corridor.';
  } else if (status === 'DEVELOPING') {
    summary = `SYSTEM ADVISORY: ${userNoun} reported developing ${typeDescription} near ${roadSegment}. Approaching corroboration threshold.`;
    recommendedAction = 'Developing community reports. Proceed with heightened awareness.';
  } else {
    summary = `SYSTEM ADVISORY: ${userNoun} reported an unverified ${typeDescription} near ${roadSegment}.`;
    recommendedAction = 'Single unverified report. Do not divert unless confirmed by dispatch.';
  }

  return {
    summary,
    incidentType: type,
    locationLabel: roadSegment,
    reportCount: count,
    confidenceStatus: status,
    recommendedAction,
    recommendedCaution: recommendedAction, // Alias for backwards compatibility
    verificationNote: 'Community-reported; not independently verified.',
    summarySource: 'SYSTEM_FALLBACK',
    advisorySource: 'DETERMINISTIC_FALLBACK', // Backwards compatibility alias
    metaAiStatus: 'FALLBACK_ACTIVE',
    metaModelUsed: null,
    generatedAt: new Date().toISOString(),
  };
}

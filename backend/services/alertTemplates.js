/**
 * Standardized Emergency Alert Templates & Payloads
 * Note: AmbuRoute is currently in Phase B4 (proximity-based fallback).
 * These alerts are strictly proximity-based and must not be marked as route-aware.
 */

export const ALERT_TIERS = {
  OUTER: 'OUTER',
  NEAR: 'NEAR',
  ENDED: 'ENDED',
};

export const buildAlertPayload = ({ tier, tripId, distanceMeters, renotify = false }) => {
  const tripIdStr = tripId ? tripId.toString() : 'unknown';
  const tag = `ambulance-alert-${tripIdStr}`;
  const timestamp = new Date().toISOString();

  if (tier === ALERT_TIERS.NEAR) {
    const formattedMeters = Math.round(distanceMeters || 0);
    return {
      title: '🚨 AMBULANCE NEARBY — PLEASE GIVE WAY SAFELY',
      body: `An emergency ambulance is approximately ${formattedMeters}m away from your location. Yield right-of-way safely.`,
      icon: '/icons/alert-icon-192.png',
      badge: '/icons/alert-badge-72.png',
      tag,
      renotify: Boolean(renotify),
      requireInteraction: true,
      silent: false,
      data: {
        tripId: tripIdStr,
        tier: ALERT_TIERS.NEAR,
        distanceMeters: formattedMeters,
        timestamp,
        targetingMethod: 'PROXIMITY_GEOSPATIAL',
        disclaimer: 'Proximity-based estimate. Route-aware targeting is pending routing engine implementation.',
      },
    };
  }

  if (tier === ALERT_TIERS.OUTER) {
    const km = ((distanceMeters || 0) / 1000).toFixed(1);
    return {
      title: '🚨 URGENT: AMBULANCE APPROACHING',
      body: `An emergency ambulance is active within ~${km} km. Please stay alert and prepare to give way.`,
      icon: '/icons/alert-icon-192.png',
      badge: '/icons/alert-badge-72.png',
      tag,
      renotify: Boolean(renotify),
      requireInteraction: false,
      silent: false,
      data: {
        tripId: tripIdStr,
        tier: ALERT_TIERS.OUTER,
        distanceMeters: Math.round(distanceMeters || 0),
        timestamp,
        targetingMethod: 'PROXIMITY_GEOSPATIAL',
        disclaimer: 'Proximity-based estimate. Route-aware targeting is pending routing engine implementation.',
      },
    };
  }

  if (tier === ALERT_TIERS.ENDED) {
    return {
      title: 'Ambulance Alert Ended',
      body: 'The emergency response in your area has concluded. Thank you for keeping the roads clear.',
      icon: '/icons/alert-icon-192.png',
      badge: '/icons/alert-badge-72.png',
      tag,
      renotify: false,
      requireInteraction: false,
      silent: true,
      data: {
        tripId: tripIdStr,
        tier: ALERT_TIERS.ENDED,
        timestamp,
        targetingMethod: 'PROXIMITY_GEOSPATIAL',
      },
    };
  }

  throw new Error(`Unsupported alert tier: ${tier}`);
};

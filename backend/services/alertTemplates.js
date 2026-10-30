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
      title: '🚑 AmbuRoute — Ambulance Approaching — PLEASE GIVE WAY SAFELY',
      body: 'An ambulance is approaching your area. Please give way when safe.',
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
        url: '/#alerts',
        disclaimer: 'Proximity-based estimate. Route-aware targeting is pending routing engine implementation.',
      },
    };
  }

  if (tier === ALERT_TIERS.OUTER) {
    return {
      title: '🚑 AmbuRoute — Ambulance Approaching',
      body: 'An ambulance is approaching your area. Please give way when safe.',
      icon: '/icons/alert-icon-192.png',
      badge: '/icons/alert-badge-72.png',
      tag,
      renotify: Boolean(renotify),
      requireInteraction: true,
      silent: false,
      data: {
        tripId: tripIdStr,
        tier: ALERT_TIERS.OUTER,
        distanceMeters: Math.round(distanceMeters || 0),
        timestamp,
        targetingMethod: 'PROXIMITY_GEOSPATIAL',
        url: '/#alerts',
        disclaimer: 'Proximity-based estimate. Route-aware targeting is pending routing engine implementation.',
      },
    };
  }

  if (tier === ALERT_TIERS.ENDED) {
    return {
      title: '🚑 AmbuRoute — Ambulance Alert Ended',
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
        url: '/#alerts',
      },
    };
  }

  throw new Error(`Unsupported alert tier: ${tier}`);
};

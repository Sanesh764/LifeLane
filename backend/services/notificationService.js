import { PushSubscription } from '../models/PushSubscription.js';
import { AlertDispatch } from '../models/AlertDispatch.js';
import { AmbulanceTrip } from '../models/AmbulanceTrip.js';
import { env } from '../config/env.js';
import { getPushProvider } from './pushProvider.js';
import { buildAlertPayload, ALERT_TIERS } from './alertTemplates.js';

// Active periodic refresh timers mapped by tripId
const activeTripTimers = new Map();

/**
 * Calculates distance in meters between two [lng, lat] coordinate points using Haversine formula
 */
export const calculateDistanceMeters = (coord1, coord2) => {
  if (!coord1 || !coord2) return Infinity;
  const [lng1, lat1] = coord1;
  const [lng2, lat2] = coord2;

  const R = 6371000; // Earth's radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

/**
 * Query eligible subscribers within proximity radius
 */
export const findEligibleSubscribers = async (ambulanceCoords, maxDistanceMeters = env.ALERTS.outerRadiusMeters) => {
  if (!ambulanceCoords || ambulanceCoords.length !== 2) {
    return [];
  }

  const [lng, lat] = ambulanceCoords;
  const maxAgeMs = env.ALERTS.locationMaxAgeSeconds * 1000;
  const minCapturedAt = new Date(Date.now() - maxAgeMs);
  const maxAccuracy = env.ALERTS.maxLocationAccuracyMeters;

  // Convert distance in meters to radians for $centerSphere: distance / earthRadius
  const radiusInRadians = maxDistanceMeters / 6378137;

  const subscribers = await PushSubscription.find({
    status: 'ACTIVE',
    notificationConsent: true,
    locationConsent: true,
    lastLocationCapturedAt: { $gte: minCapturedAt },
    locationAccuracyMeters: { $lte: maxAccuracy, $ne: null },
    location: {
      $geoWithin: {
        $centerSphere: [[lng, lat], radiusInRadians],
      },
    },
  });

  return subscribers;
};

/**
 * Dispatches emergency alerts for an active trip to all nearby eligible subscribers
 */
export const dispatchAlertsForTrip = async (tripId, ambulanceCoords) => {
  if (!tripId || !ambulanceCoords) return { dispatched: 0, suppressed: 0, failed: 0 };

  const pushProvider = getPushProvider();
  const eligibleSubscribers = await findEligibleSubscribers(ambulanceCoords);

  let dispatched = 0;
  let suppressed = 0;
  let failed = 0;

  for (const sub of eligibleSubscribers) {
    try {
      const distance = calculateDistanceMeters(ambulanceCoords, sub.location.coordinates);

      // Determine alert tier
      const tier =
        distance <= env.ALERTS.nearRadiusMeters ? ALERT_TIERS.NEAR : ALERT_TIERS.OUTER;

      // Check transition & cooldown
      const isSameTrip = sub.lastNotifiedTripId && sub.lastNotifiedTripId.toString() === tripId.toString();
      const isTierUpgrade = isSameTrip && sub.lastAlertTier === ALERT_TIERS.OUTER && tier === ALERT_TIERS.NEAR;

      const now = Date.now();
      const lastNotifiedMs = sub.lastNotifiedAt ? new Date(sub.lastNotifiedAt).getTime() : 0;
      const cooldownElapsed = now - lastNotifiedMs >= env.ALERTS.repeatCooldownSeconds * 1000;

      // If cooldown has not elapsed and not an upgrade, suppress alert
      if (isSameTrip && !cooldownElapsed && !isTierUpgrade) {
        suppressed++;
        await AlertDispatch.create({
          tripId,
          subscriptionId: sub._id,
          endpointHash: sub.endpointHash,
          alertTier: tier,
          distanceMeters: Math.round(distance),
          status: 'SUPPRESSED',
          ambulanceLocation: {
            type: 'Point',
            coordinates: ambulanceCoords,
          },
        });
        continue;
      }

      // Upgrade triggers renotify: true so device alerts user with sound/vibration
      const renotify = isTierUpgrade || tier === ALERT_TIERS.NEAR;
      const payload = buildAlertPayload({
        tier,
        tripId,
        distanceMeters: distance,
        renotify,
      });

      // Deliver notification via push provider
      try {
        await pushProvider.sendNotification(
          {
            endpoint: sub.endpoint,
            endpointHash: sub.endpointHash,
            keys: sub.keys,
          },
          payload,
          {
            topic: `ambulance-trip-${tripId}`,
            urgency: tier === ALERT_TIERS.NEAR ? 'high' : 'normal',
          }
        );

        // Update subscriber state
        sub.lastNotifiedAt = new Date();
        sub.lastNotifiedTripId = tripId;
        sub.lastAlertTier = tier;
        await sub.save();

        await AlertDispatch.create({
          tripId,
          subscriptionId: sub._id,
          endpointHash: sub.endpointHash,
          alertTier: tier,
          distanceMeters: Math.round(distance),
          status: 'ACCEPTED',
          ambulanceLocation: {
            type: 'Point',
            coordinates: ambulanceCoords,
          },
        });

        dispatched++;
      } catch (sendErr) {
        if (sendErr.isExpired || sendErr.statusCode === 410 || sendErr.statusCode === 404) {
          sub.status = 'EXPIRED';
          await sub.save();

          await AlertDispatch.create({
            tripId,
            subscriptionId: sub._id,
            endpointHash: sub.endpointHash,
            alertTier: tier,
            distanceMeters: Math.round(distance),
            status: 'EXPIRED',
            errorDetails: sendErr.message,
            ambulanceLocation: {
              type: 'Point',
              coordinates: ambulanceCoords,
            },
          });
        } else {
          await AlertDispatch.create({
            tripId,
            subscriptionId: sub._id,
            endpointHash: sub.endpointHash,
            alertTier: tier,
            distanceMeters: Math.round(distance),
            status: 'FAILED',
            errorDetails: sendErr.message,
            ambulanceLocation: {
              type: 'Point',
              coordinates: ambulanceCoords,
            },
          });
        }
        failed++;
      }
    } catch (procErr) {
      failed++;
    }
  }

  console.log(
    `[PushDispatch] Trip ${tripId}: Dispatched=${dispatched}, Suppressed=${suppressed}, Failed=${failed} (Eligible Subscribers=${eligibleSubscribers.length})`
  );

  return { dispatched, suppressed, failed };
};

/**
 * Schedules periodic refresh alerts for an active trip
 */
export const startTripAlertInterval = (tripId) => {
  stopTripAlertInterval(tripId);

  // In test environment, prevent background timers from leaking across subtests
  if (env.NODE_ENV === 'test') {
    return;
  }

  const tripIdStr = tripId.toString();
  const intervalMs = env.ALERTS.refreshIntervalSeconds * 1000;

  const timer = setInterval(async () => {
    try {
      const trip = await AmbulanceTrip.findById(tripIdStr);
      if (!trip || trip.status !== 'ACTIVE') {
        stopTripAlertInterval(tripIdStr);
        return;
      }
      if (trip.currentLocation?.coordinates) {
        await dispatchAlertsForTrip(trip._id, trip.currentLocation.coordinates);
      }
    } catch (err) {
      // Background interval error suppression
    }
  }, intervalMs);

  // Unref timer in Node so it doesn't prevent graceful shutdown
  if (timer.unref) {
    timer.unref();
  }

  activeTripTimers.set(tripIdStr, timer);
};

/**
 * Stops periodic refresh alerts for a trip
 */
export const stopTripAlertInterval = (tripId) => {
  if (!tripId) return;
  const tripIdStr = tripId.toString();
  const timer = activeTripTimers.get(tripIdStr);
  if (timer) {
    clearInterval(timer);
    activeTripTimers.delete(tripIdStr);
  }
};

/**
 * Stops all active recurring alert intervals (used on server shutdown and test cleanup)
 */
export const stopAllTripAlertIntervals = () => {
  for (const [tripId, timer] of activeTripTimers.entries()) {
    clearInterval(timer);
  }
  activeTripTimers.clear();
};

/**
 * Handles emergency trip completion: sends clear/ended alert and cancels intervals
 */
export const handleTripEnded = async (tripId) => {
  if (!tripId) return;
  const tripIdStr = tripId.toString();

  stopTripAlertInterval(tripIdStr);

  const pushProvider = getPushProvider();

  // Find all subscribers who received an alert for this trip
  const alertedSubscribers = await PushSubscription.find({
    lastNotifiedTripId: tripId,
    status: 'ACTIVE',
  });

  const payload = buildAlertPayload({
    tier: ALERT_TIERS.ENDED,
    tripId: tripIdStr,
  });

  for (const sub of alertedSubscribers) {
    try {
      await pushProvider.sendNotification(
        {
          endpoint: sub.endpoint,
          endpointHash: sub.endpointHash,
          keys: sub.keys,
        },
        payload,
        {
          topic: `ambulance-trip-${tripIdStr}`,
          urgency: 'normal',
        }
      );

      await AlertDispatch.create({
        tripId,
        subscriptionId: sub._id,
        endpointHash: sub.endpointHash,
        alertTier: ALERT_TIERS.ENDED,
        status: 'ACCEPTED',
      });
    } catch (err) {
      // Ignore delivery failures for ended messages
    } finally {
      try {
        await PushSubscription.updateOne(
          { _id: sub._id },
          { $set: { lastAlertTier: null, lastNotifiedTripId: null } }
        );
      } catch (saveErr) {
        // Safe document cleanup ignore
      }
    }
  }
};

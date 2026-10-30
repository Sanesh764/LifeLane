import express from 'express';
import { env } from '../config/env.js';
import { isDbConnected } from '../config/db.js';
import { PushSubscription, hashEndpoint } from '../models/PushSubscription.js';
import { subscriberLocationRateLimiter } from '../middlewares/rateLimiter.js';
import { getPushProvider } from '../services/pushProvider.js';

const router = express.Router();

/**
 * Validates push endpoint URL for SSRF security and web push compliance
 */
export const validatePushEndpoint = (endpoint) => {
  if (!endpoint || typeof endpoint !== 'string') {
    return { valid: false, message: 'Push subscription endpoint must be a non-empty string.' };
  }
  let parsed;
  try {
    parsed = new URL(endpoint);
  } catch (err) {
    return { valid: false, message: 'Invalid URL format for push subscription endpoint.' };
  }

  if (parsed.protocol !== 'https:') {
    return { valid: false, message: 'Push subscription endpoint must use secure HTTPS protocol.' };
  }

  const hostname = parsed.hostname.toLowerCase();

  // SSRF Protection: Block localhost, local loopback, and private IPv4 ranges
  const isPrivateOrLocal =
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname.startsWith('10.') ||
    hostname.startsWith('192.168.') ||
    hostname.startsWith('169.254.') ||
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname) ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal');

  if (isPrivateOrLocal) {
    return {
      valid: false,
      message: 'Push endpoint host cannot target private or loopback addresses (SSRF protection).',
    };
  }

  // Allowed push service providers
  const allowedProviders = [
    /\.googleapis\.com$/,
    /\.google\.com$/,
    /\.push\.apple\.com$/,
    /\.services\.mozilla\.com$/,
    /\.mozilla\.com$/,
    /\.notify\.windows\.com$/,
  ];

  const isRecognizedProvider = allowedProviders.some((pattern) => pattern.test(hostname));

  // In test/dev, permit mock test domains, but still strictly block private/loopback
  const isTestOrDev = env.NODE_ENV === 'test' || env.NODE_ENV === 'development';
  const isAllowedTestHost =
    isTestOrDev &&
    (hostname.endsWith('.test') ||
      hostname.endsWith('.example.com') ||
      hostname === 'mock.push.test');

  if (!isRecognizedProvider && !isAllowedTestHost) {
    return {
      valid: false,
      message: 'Push endpoint host is not a recognized web push delivery provider.',
    };
  }

  return { valid: true, url: parsed };
};

/**
 * GET /api/v1/notifications/vapid-public-key
 * Returns VAPID public key for browser PushManager subscription
 */
router.get('/vapid-public-key', (req, res) => {
  res.status(200).json({
    data: {
      publicKey: env.VAPID.publicKey,
    },
  });
});

/**
 * POST /api/v1/notifications/subscriptions
 * Register or update a Web Push subscription
 */
const handleRegisterSubscription = async (req, res, next) => {
  try {
    if (!isDbConnected()) {
      return res.status(503).json({
        error: {
          code: 'DATABASE_UNAVAILABLE',
          message: 'Database service is temporarily unavailable.',
        },
      });
    }

    const {
      endpoint,
      keys,
      notificationConsent,
      locationConsent = false,
      deviceType = 'unknown',
    } = req.body || {};

    if (!endpoint) {
      return res.status(400).json({
        error: {
          code: 'MISSING_ENDPOINT',
          message: 'Subscription endpoint is required.',
        },
      });
    }

    const endpointValidation = validatePushEndpoint(endpoint);
    if (!endpointValidation.valid) {
      return res.status(400).json({
        error: {
          code: 'INVALID_PUSH_ENDPOINT',
          message: endpointValidation.message,
        },
      });
    }

    if (!keys || typeof keys !== 'object' || !keys.p256dh || !keys.auth) {
      return res.status(400).json({
        error: {
          code: 'INVALID_KEYS',
          message: 'Subscription keys with valid p256dh and auth strings are required.',
        },
      });
    }

    if (notificationConsent !== true) {
      return res.status(400).json({
        error: {
          code: 'NOTIFICATION_CONSENT_REQUIRED',
          message: 'Explicit notification consent (notificationConsent: true) is required to register subscription.',
        },
      });
    }

    const endpointHash = hashEndpoint(endpoint);
    const userAgent = req.headers['user-agent'] || null;

    // Atomic idempotent upsert by endpointHash
    const subscription = await PushSubscription.findOneAndUpdate(
      { endpointHash },
      {
        $set: {
          endpoint,
          endpointHash,
          keys: {
            p256dh: keys.p256dh.trim(),
            auth: keys.auth.trim(),
          },
          notificationConsent: true,
          locationConsent: Boolean(locationConsent),
          status: 'ACTIVE',
          deviceType: ['mobile', 'desktop', 'tablet', 'unknown'].includes(deviceType)
            ? deviceType
            : 'unknown',
          ...(userAgent ? { userAgent } : {}),
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.status(201).json({
      data: {
        subscription: subscription.toJSON(),
      },
    });
  } catch (err) {
    if (err.code === 11000 || (err.message && err.message.includes('E11000'))) {
      try {
        const hash = endpointHash || hashEndpoint(req.body?.endpoint || '');
        const existing = await PushSubscription.findOne({ endpointHash: hash });
        if (existing) {
          return res.status(200).json({
            data: {
              subscription: existing.toJSON(),
            },
          });
        }
      } catch (findErr) {
        return next(findErr);
      }
    }
    next(err);
  }
};

router.post('/subscriptions', handleRegisterSubscription);
router.post('/', handleRegisterSubscription);

/**
 * POST /api/v1/notifications/location
 * Update consented road-user location heartbeat
 */
router.post(
  '/location',
  subscriberLocationRateLimiter.middleware(),
  async (req, res, next) => {
    try {
      if (!isDbConnected()) {
        return res.status(503).json({
          error: {
            code: 'DATABASE_UNAVAILABLE',
            message: 'Database service is temporarily unavailable.',
          },
        });
      }

      const {
        endpointHash: bodyHash,
        endpoint,
        coordinates,
        accuracyMeters,
        capturedAt,
      } = req.body || {};

      const endpointHash =
        req.headers['x-endpoint-hash'] ||
        bodyHash ||
        (endpoint ? hashEndpoint(endpoint) : null);

      if (!endpointHash) {
        return res.status(400).json({
          error: {
            code: 'MISSING_SUBSCRIPTION_IDENTIFIER',
            message: 'Subscription endpointHash or endpoint is required.',
          },
        });
      }

      const subscription = await PushSubscription.findOne({ endpointHash });
      if (!subscription || subscription.status !== 'ACTIVE') {
        return res.status(404).json({
          error: {
            code: 'SUBSCRIPTION_NOT_FOUND',
            message: 'Active push subscription not found for the provided identifier.',
          },
        });
      }

      // Allow enabling location consent directly via consented heartbeat
      if (req.body?.locationConsent === true || req.body?.locationConsent === 'true') {
        subscription.locationConsent = true;
      }

      if (!subscription.locationConsent) {
        return res.status(403).json({
          error: {
            code: 'LOCATION_CONSENT_REQUIRED',
            message:
              'Location sharing consent has not been granted for this subscription. Enable locationConsent before submitting location.',
          },
        });
      }

      // Coordinate validation
      let lng;
      let lat;
      if (Array.isArray(coordinates) && coordinates.length === 2) {
        lng = Number(coordinates[0]);
        lat = Number(coordinates[1]);
      } else if (
        typeof coordinates === 'object' &&
        coordinates !== null &&
        (coordinates.latitude !== undefined || coordinates.lat !== undefined) &&
        (coordinates.longitude !== undefined || coordinates.lng !== undefined)
      ) {
        lat = Number(coordinates.latitude !== undefined ? coordinates.latitude : coordinates.lat);
        lng = Number(coordinates.longitude !== undefined ? coordinates.longitude : coordinates.lng);
      } else {
        return res.status(400).json({
          error: {
            code: 'INVALID_COORDINATES',
            message: 'Coordinates must be [longitude, latitude] or { latitude, longitude }.',
          },
        });
      }

      if (!Number.isFinite(lng) || !Number.isFinite(lat) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        return res.status(400).json({
          error: {
            code: 'INVALID_COORDINATES',
            message: 'Coordinates must be valid numbers: latitude [-90..90], longitude [-180..180].',
          },
        });
      }

      // Accuracy validation (max 200m)
      const acc = Number(accuracyMeters);
      if (!Number.isFinite(acc) || acc < 0) {
        return res.status(400).json({
          error: {
            code: 'INVALID_ACCURACY',
            message: 'accuracyMeters must be a non-negative number.',
          },
        });
      }

      if (acc > env.ALERTS.maxLocationAccuracyMeters) {
        return res.status(422).json({
          error: {
            code: 'LOCATION_ACCURACY_TOO_LOW',
            message: `Accuracy (${acc}m) exceeds the maximum allowed accuracy of ${env.ALERTS.maxLocationAccuracyMeters}m for safety.`,
          },
        });
      }

      // Timestamp validation (freshness)
      const parsedCapturedAt = capturedAt ? new Date(capturedAt) : new Date();
      if (Number.isNaN(parsedCapturedAt.getTime())) {
        return res.status(400).json({
          error: {
            code: 'INVALID_TIMESTAMP',
            message: 'capturedAt must be a valid ISO-8601 timestamp.',
          },
        });
      }

      const now = Date.now();
      const capturedMs = parsedCapturedAt.getTime();

      // Reject future-dated timestamp > 60s
      if (capturedMs > now + 60 * 1000) {
        return res.status(422).json({
          error: {
            code: 'FUTURE_TIMESTAMP',
            message: 'capturedAt cannot be more than 60 seconds in the future.',
          },
        });
      }

      // Reject stale location > maxAgeSeconds (90s)
      if (capturedMs < now - env.ALERTS.locationMaxAgeSeconds * 1000) {
        return res.status(422).json({
          error: {
            code: 'STALE_LOCATION',
            message: `capturedAt is older than ${env.ALERTS.locationMaxAgeSeconds} seconds.`,
          },
        });
      }

      // Update location data
      subscription.location = {
        type: 'Point',
        coordinates: [lng, lat],
      };
      subscription.locationAccuracyMeters = acc;
      subscription.lastLocationCapturedAt = parsedCapturedAt;
      subscription.lastLocationReceivedAt = new Date();

      await subscription.save();

      res.status(200).json({
        data: {
          status: 'LOCATION_ACCEPTED',
          endpointHash: subscription.endpointHash,
          lastLocationCapturedAt: subscription.lastLocationCapturedAt,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * DELETE /api/v1/notifications/subscriptions
 * Unsubscribe and purge sensitive location telemetry
 */
const handleUnsubscribe = async (req, res, next) => {
  try {
    if (!isDbConnected()) {
      return res.status(503).json({
        error: {
          code: 'DATABASE_UNAVAILABLE',
          message: 'Database service is temporarily unavailable.',
        },
      });
    }

    const { endpointHash: bodyHash, endpoint } = req.body || {};
    const endpointHash =
      req.headers['x-endpoint-hash'] ||
      bodyHash ||
      (endpoint ? hashEndpoint(endpoint) : null);

    if (!endpointHash) {
      return res.status(400).json({
        error: {
          code: 'MISSING_SUBSCRIPTION_IDENTIFIER',
          message: 'Subscription endpointHash or endpoint is required.',
        },
      });
    }

    const subscription = await PushSubscription.findOne({ endpointHash });
    if (!subscription) {
      return res.status(404).json({
        error: {
          code: 'SUBSCRIPTION_NOT_FOUND',
          message: 'Subscription not found for the provided identifier.',
        },
      });
    }

    subscription.status = 'DISABLED';
    subscription.notificationConsent = false;
    subscription.locationConsent = false;
    subscription.location = undefined;
    subscription.locationAccuracyMeters = null;
    subscription.lastLocationCapturedAt = null;

    await subscription.save();

    res.status(200).json({
      data: {
        status: 'UNSUBSCRIBED',
        endpointHash: subscription.endpointHash,
      },
    });
  } catch (err) {
    next(err);
  }
};

router.delete('/subscriptions', handleUnsubscribe);
router.post('/unsubscribe', handleUnsubscribe);

/**
 * POST /api/v1/notifications/test
 * Dispatches an explicit test Web Push alert to verify browser, service worker, and OS permissions
 */
router.post('/test', async (req, res, next) => {
  try {
    if (!isDbConnected()) {
      return res.status(503).json({
        error: {
          code: 'DATABASE_UNAVAILABLE',
          message: 'Database service is temporarily unavailable.',
        },
      });
    }

    const endpointHash =
      req.header('X-Endpoint-Hash') ||
      req.body?.endpointHash ||
      req.query?.endpointHash;

    if (!endpointHash) {
      return res.status(400).json({
        error: {
          code: 'ENDPOINT_HASH_REQUIRED',
          message: 'endpointHash is required to dispatch a test notification.',
        },
      });
    }

    const subscription = await PushSubscription.findOne({ endpointHash, status: 'ACTIVE' });
    if (!subscription) {
      return res.status(404).json({
        error: {
          code: 'SUBSCRIPTION_NOT_FOUND',
          message: 'Active push subscription not found for the provided identifier.',
        },
      });
    }

    const pushProvider = getPushProvider();
    const payload = {
      title: '🚑 AmbuRoute — Demo Ambulance Alert (Web Push Active)',
      body: 'An ambulance mission has just started. This is a hackathon demonstration notification.',
      icon: '/icons/alert-icon-192.png',
      badge: '/icons/alert-badge-72.png',
      tag: 'amburoute-test-push',
      renotify: true,
      requireInteraction: true,
      data: {
        type: 'TEST_VERIFICATION',
        timestamp: new Date().toISOString(),
        url: '/#alerts',
      },
    };

    await pushProvider.sendNotification(
      {
        endpoint: subscription.endpoint,
        endpointHash: subscription.endpointHash,
        keys: subscription.keys,
      },
      payload,
      {
        topic: 'amburoute-test',
        urgency: 'high',
      }
    );

    return res.status(200).json({
      data: {
        success: true,
        message: 'Test notification successfully dispatched to browser push service.',
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;

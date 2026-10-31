import express from 'express';
import { env } from '../config/env.js';
import { isDbConnected } from '../config/db.js';
import { PushSubscription, hashEndpoint } from '../models/PushSubscription.js';
import { subscriberLocationRateLimiter } from '../middlewares/rateLimiter.js';
import { getPushProvider } from '../services/pushProvider.js';
import { authenticate, optionalAuthenticate } from '../middlewares/auth.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';

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
  return ApiResponse.ok(
    {
      publicKey: env.VAPID.publicKey,
    },
    'VAPID public key retrieved successfully.'
  ).send(res);
});

/**
 * POST /api/v1/notifications/subscriptions
 * Register or update a Web Push subscription
 */
const handleRegisterSubscription = async (req, res) => {
  if (!isDbConnected()) {
    throw ApiError.serviceUnavailable(
      'Database service is temporarily unavailable.',
      'DATABASE_UNAVAILABLE'
    );
  }

  const {
    endpoint,
    keys,
    notificationConsent,
    locationConsent = false,
    deviceType = 'unknown',
  } = req.body || {};

  if (!endpoint) {
    throw ApiError.badRequest('Subscription endpoint is required.', 'MISSING_ENDPOINT');
  }

  const endpointValidation = validatePushEndpoint(endpoint);
  if (!endpointValidation.valid) {
    throw ApiError.badRequest(endpointValidation.message, 'INVALID_PUSH_ENDPOINT');
  }

  if (!keys || typeof keys !== 'object' || !keys.p256dh || !keys.auth) {
    throw ApiError.badRequest(
      'Subscription keys with valid p256dh and auth strings are required.',
      'INVALID_KEYS'
    );
  }

  if (notificationConsent !== true) {
    throw ApiError.badRequest(
      'Explicit notification consent (notificationConsent: true) is required to register subscription.',
      'NOTIFICATION_CONSENT_REQUIRED'
    );
  }

  const endpointHash = hashEndpoint(endpoint);
  const userAgent = req.headers['user-agent'] || null;
  const authenticatedUserId = req.user?._id || null;

  try {
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
          ...(authenticatedUserId ? { userId: authenticatedUserId } : {}),
        },
      },
      { upsert: true, new: true, returnDocument: 'after', setDefaultsOnInsert: true }
    );

    return ApiResponse.created(
      {
        subscription: subscription.toJSON(),
      },
      'Push subscription registered successfully.'
    ).send(res);
  } catch (err) {
    if (err.code === 11000 || (err.message && err.message.includes('E11000'))) {
      const hash = endpointHash || hashEndpoint(req.body?.endpoint || '');
      const existing = await PushSubscription.findOne({ endpointHash: hash });
      if (existing) {
        if (req.user?._id && !existing.userId) {
          existing.userId = req.user._id;
          existing.status = 'ACTIVE';
          existing.notificationConsent = true;
          await existing.save();
        }
        return ApiResponse.created(
          {
            subscription: existing.toJSON(),
          },
          'Push subscription registered successfully.'
        ).send(res);
      }
    }
    throw err;
  }
};

router.post('/subscriptions', optionalAuthenticate, asyncHandler(handleRegisterSubscription));
router.post('/', optionalAuthenticate, asyncHandler(handleRegisterSubscription));

/**
 * POST /api/v1/notifications/subscriptions/disable
 * Disables browser push notifications for the authenticated user.
 * Strictly verifies subscription ownership: users can only disable their own subscriptions.
 */
router.post(
  '/subscriptions/disable',
  authenticate,
  asyncHandler(async (req, res) => {
    if (!isDbConnected()) {
      throw ApiError.serviceUnavailable(
        'Database service is temporarily unavailable.',
        'DATABASE_UNAVAILABLE'
      );
    }

    const { endpointHash, endpoint } = req.body || {};
    const targetHash = endpointHash || (endpoint ? hashEndpoint(endpoint) : null);

    if (targetHash) {
      const subscription = await PushSubscription.findOne({ endpointHash: targetHash });
      if (!subscription) {
        throw ApiError.notFound(
          'Push subscription not found for the provided identifier.',
          'SUBSCRIPTION_NOT_FOUND'
        );
      }

      // Ownership verification
      const userIdStr = req.user._id.toString();
      const subUserIdStr = subscription.userId ? subscription.userId.toString() : null;

      if (subUserIdStr && subUserIdStr !== userIdStr && req.user.role !== 'ADMIN') {
        throw ApiError.forbidden(
          'You are not authorized to disable this subscription.',
          'FORBIDDEN'
        );
      }

      subscription.status = 'DISABLED';
      subscription.notificationConsent = false;
      if (!subscription.userId) {
        subscription.userId = req.user._id;
      }
      await subscription.save();

      return ApiResponse.ok(
        {
          message: 'Push notifications disabled successfully.',
          subscription: subscription.toJSON(),
        },
        'Push notifications disabled successfully.'
      ).send(res);
    }

    // Disable all active subscriptions for this user
    const result = await PushSubscription.updateMany(
      { userId: req.user._id, status: 'ACTIVE' },
      { $set: { status: 'DISABLED', notificationConsent: false } }
    );

    return ApiResponse.ok(
      {
        message: 'All push notifications disabled successfully.',
        modifiedCount: result.modifiedCount,
      },
      'All push notifications disabled successfully.'
    ).send(res);
  })
);

/**
 * GET /api/v1/notifications/my-subscriptions
 * Retrieves all push subscriptions registered by the authenticated user
 */
router.get(
  '/my-subscriptions',
  authenticate,
  asyncHandler(async (req, res) => {
    if (!isDbConnected()) {
      throw ApiError.serviceUnavailable(
        'Database service is temporarily unavailable.',
        'DATABASE_UNAVAILABLE'
      );
    }

    const subscriptions = await PushSubscription.find({ userId: req.user._id }).sort({ createdAt: -1 });

    return ApiResponse.ok(
      {
        subscriptions: subscriptions.map((s) => s.toJSON()),
        total: subscriptions.length,
        hasActive: subscriptions.some((s) => s.status === 'ACTIVE' && s.notificationConsent),
      },
      'User subscriptions retrieved successfully.'
    ).send(res);
  })
);

/**
 * POST /api/v1/notifications/location
 * Update consented road-user location heartbeat
 */
router.post(
  '/location',
  subscriberLocationRateLimiter.middleware(),
  asyncHandler(async (req, res) => {
    if (!isDbConnected()) {
      throw ApiError.serviceUnavailable(
        'Database service is temporarily unavailable.',
        'DATABASE_UNAVAILABLE'
      );
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
      throw ApiError.badRequest(
        'Subscription endpointHash or endpoint is required.',
        'MISSING_SUBSCRIPTION_IDENTIFIER'
      );
    }

    const subscription = await PushSubscription.findOne({ endpointHash });
    if (!subscription || subscription.status !== 'ACTIVE') {
      throw ApiError.notFound(
        'Active push subscription not found for the provided identifier.',
        'SUBSCRIPTION_NOT_FOUND'
      );
    }

    // Allow enabling location consent directly via consented heartbeat
    if (req.body?.locationConsent === true || req.body?.locationConsent === 'true') {
      subscription.locationConsent = true;
    }

    if (!subscription.locationConsent) {
      throw ApiError.forbidden(
        'Location sharing consent has not been granted for this subscription. Enable locationConsent before submitting location.',
        'LOCATION_CONSENT_REQUIRED'
      );
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
      throw ApiError.badRequest(
        'Coordinates must be [longitude, latitude] or { latitude, longitude }.',
        'INVALID_COORDINATES'
      );
    }

    if (!Number.isFinite(lng) || !Number.isFinite(lat) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      throw ApiError.badRequest(
        'Coordinates must be valid numbers: latitude [-90..90], longitude [-180..180].',
        'INVALID_COORDINATES'
      );
    }

    // Accuracy validation (max 200m)
    const acc = Number(accuracyMeters);
    if (!Number.isFinite(acc) || acc < 0) {
      throw ApiError.badRequest(
        'accuracyMeters must be a non-negative number.',
        'INVALID_ACCURACY'
      );
    }

    if (acc > env.ALERTS.maxLocationAccuracyMeters) {
      throw new ApiError(
        422,
        `Accuracy (${acc}m) exceeds the maximum allowed accuracy of ${env.ALERTS.maxLocationAccuracyMeters}m for safety.`,
        'LOCATION_ACCURACY_TOO_LOW'
      );
    }

    // Timestamp validation (freshness)
    const parsedCapturedAt = capturedAt ? new Date(capturedAt) : new Date();
    if (Number.isNaN(parsedCapturedAt.getTime())) {
      throw ApiError.badRequest(
        'capturedAt must be a valid ISO-8601 timestamp.',
        'INVALID_TIMESTAMP'
      );
    }

    const now = Date.now();
    const capturedMs = parsedCapturedAt.getTime();

    // Reject future-dated timestamp > 60s
    if (capturedMs > now + 60 * 1000) {
      throw new ApiError(
        422,
        'capturedAt cannot be more than 60 seconds in the future.',
        'FUTURE_TIMESTAMP'
      );
    }

    // Reject stale location > maxAgeSeconds (90s)
    if (capturedMs < now - env.ALERTS.locationMaxAgeSeconds * 1000) {
      throw new ApiError(
        422,
        `capturedAt is older than ${env.ALERTS.locationMaxAgeSeconds} seconds.`,
        'STALE_LOCATION'
      );
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

    return ApiResponse.ok(
      {
        status: 'LOCATION_ACCEPTED',
        endpointHash: subscription.endpointHash,
        lastLocationCapturedAt: subscription.lastLocationCapturedAt,
      },
      'Location update accepted.'
    ).send(res);
  })
);

/**
 * DELETE /api/v1/notifications/subscriptions
 * Unsubscribe and purge sensitive location telemetry
 */
const handleUnsubscribe = async (req, res) => {
  if (!isDbConnected()) {
    throw ApiError.serviceUnavailable(
      'Database service is temporarily unavailable.',
      'DATABASE_UNAVAILABLE'
    );
  }

  const { endpointHash: bodyHash, endpoint } = req.body || {};
  const endpointHash =
    req.headers['x-endpoint-hash'] ||
    bodyHash ||
    (endpoint ? hashEndpoint(endpoint) : null);

  if (!endpointHash) {
    throw ApiError.badRequest(
      'Subscription endpointHash or endpoint is required.',
      'MISSING_SUBSCRIPTION_IDENTIFIER'
    );
  }

  const subscription = await PushSubscription.findOne({ endpointHash });
  if (!subscription) {
    throw ApiError.notFound(
      'Subscription not found for the provided identifier.',
      'SUBSCRIPTION_NOT_FOUND'
    );
  }

  subscription.status = 'DISABLED';
  subscription.notificationConsent = false;
  subscription.locationConsent = false;
  subscription.location = undefined;
  subscription.locationAccuracyMeters = null;
  subscription.lastLocationCapturedAt = null;

  await subscription.save();

  return ApiResponse.ok(
    {
      status: 'UNSUBSCRIBED',
      endpointHash: subscription.endpointHash,
    },
    'Unsubscribed successfully.'
  ).send(res);
};

router.delete('/subscriptions', asyncHandler(handleUnsubscribe));
router.post('/unsubscribe', asyncHandler(handleUnsubscribe));

/**
 * POST /api/v1/notifications/test
 * Dispatches an explicit test Web Push alert to verify browser, service worker, and OS permissions
 */
router.post(
  '/test',
  asyncHandler(async (req, res) => {
    if (!isDbConnected()) {
      throw ApiError.serviceUnavailable(
        'Database service is temporarily unavailable.',
        'DATABASE_UNAVAILABLE'
      );
    }

    const endpointHash =
      req.header('X-Endpoint-Hash') ||
      req.body?.endpointHash ||
      req.query?.endpointHash;

    if (!endpointHash) {
      throw ApiError.badRequest(
        'endpointHash is required to dispatch a test notification.',
        'ENDPOINT_HASH_REQUIRED'
      );
    }

    const subscription = await PushSubscription.findOne({ endpointHash, status: 'ACTIVE' });
    if (!subscription) {
      throw ApiError.notFound(
        'Active push subscription not found for the provided identifier.',
        'SUBSCRIPTION_NOT_FOUND'
      );
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

    return ApiResponse.ok(
      {
        success: true,
        message: 'Test notification successfully dispatched to browser push service.',
      },
      'Test notification successfully dispatched to browser push service.'
    ).send(res);
  })
);

export default router;

import 'dotenv/config';
import webpush from 'web-push';

/**
 * Validated environment configuration for AmbuRoute Backend
 */
const nodeEnv = process.env.NODE_ENV || 'development';
const isProduction = nodeEnv === 'production';

const port = parseInt(process.env.PORT || '5000', 10);
const mongoUri = process.env.MONGODB_URI;

let jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) {
  if (isProduction) {
    throw new Error('[FATAL] JWT_SECRET environment variable is required in production.');
  }
  // Safe local-development fallback
  jwtSecret = 'dev_amburoute_insecure_jwt_secret_do_not_use_in_production_key';
  if (nodeEnv !== 'test') {
    console.warn('[SECURITY WARNING] JWT_SECRET is not set. Using insecure fallback secret for development.');
  }
}

// VAPID keys configuration for Web Push notifications
let vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
let vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:emergency-ops@amburoute.org';

const isPlaceholder = (k) => !k || typeof k !== 'string' || k.startsWith('your_') || k.length < 40;

if (isPlaceholder(vapidPublicKey) || isPlaceholder(vapidPrivateKey)) {
  if (isProduction) {
    throw new Error('[FATAL] Valid VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY are required in production.');
  }
  // Ephemeral keys for dev/test environments
  try {
    const generated = webpush.generateVAPIDKeys();
    vapidPublicKey = generated.publicKey;
    vapidPrivateKey = generated.privateKey;
    if (nodeEnv !== 'test') {
      console.warn('[PUSH NOTIFICATIONS] Generated ephemeral VAPID keys for local development.');
    }
  } catch (keyGenErr) {
    console.error('[PUSH NOTIFICATIONS] Key generation failed:', keyGenErr.message);
  }
}

export const env = {
  NODE_ENV: nodeEnv,
  IS_PRODUCTION: isProduction,
  PORT: Number.isFinite(port) ? port : 5000,
  MONGODB_URI: mongoUri,
  JWT_SECRET: jwtSecret,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '3600',
  CORS_ORIGIN: process.env.CORS_ORIGIN || '*',
  INITIAL_DRIVER: {
    email: process.env.INITIAL_DRIVER_EMAIL || 'driver@amburoute.demo',
    password: process.env.INITIAL_DRIVER_PASSWORD || 'AmbuRoute@Demo2026',
    name: process.env.INITIAL_DRIVER_NAME || 'Amitabh Sen',
    callSign: process.env.INITIAL_DRIVER_CALLSIGN || 'Patna Unit 108 — Alpha',
    vehicleNumber: process.env.INITIAL_DRIVER_VEHICLE || 'BR-01-EA-108',
    hospitalBase: process.env.INITIAL_DRIVER_HOSPITAL || 'PMCH Emergency Trauma Center',
  },
  VAPID: {
    publicKey: vapidPublicKey,
    privateKey: vapidPrivateKey,
    subject: vapidSubject,
  },
  ALERTS: {
    outerRadiusMeters: parseInt(process.env.ALERT_OUTER_RADIUS_METERS || '5000', 10),
    nearRadiusMeters: parseInt(process.env.ALERT_NEAR_RADIUS_METERS || '2000', 10),
    refreshIntervalSeconds: parseInt(process.env.ALERT_REFRESH_INTERVAL_SECONDS || '25', 10),
    repeatCooldownSeconds: parseInt(process.env.ALERT_REPEAT_COOLDOWN_SECONDS || '20', 10),
    locationMaxAgeSeconds: parseInt(process.env.ROAD_USER_LOCATION_MAX_AGE_SECONDS || '90', 10),
    maxLocationAccuracyMeters: parseInt(process.env.ROAD_USER_MAX_LOCATION_ACCURACY_METERS || '200', 10),
  },
};


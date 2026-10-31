import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import webpush from 'web-push';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Ensure backend/.env is loaded whether started from workspace root or backend directory
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });
dotenv.config();

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
  NOTIFICATION_DEMO_BROADCAST_ALL:
    process.env.NOTIFICATION_DEMO_BROADCAST_ALL !== undefined
      ? process.env.NOTIFICATION_DEMO_BROADCAST_ALL === 'true'
      : undefined,
  EMERGENCY_NOTIFICATION_MODE:
    process.env.EMERGENCY_NOTIFICATION_MODE || 'GLOBAL',
  ALERTS: {
    outerRadiusMeters: parseInt(process.env.ALERT_OUTER_RADIUS_METERS || '5000', 10),
    nearRadiusMeters: parseInt(process.env.ALERT_NEAR_RADIUS_METERS || '2000', 10),
    refreshIntervalSeconds: parseInt(process.env.ALERT_REFRESH_INTERVAL_SECONDS || '25', 10),
    repeatCooldownSeconds: parseInt(process.env.ALERT_REPEAT_COOLDOWN_SECONDS || '20', 10),
    locationMaxAgeSeconds: parseInt(process.env.ROAD_USER_LOCATION_MAX_AGE_SECONDS || '90', 10),
    maxLocationAccuracyMeters: parseInt(process.env.ROAD_USER_MAX_LOCATION_ACCURACY_METERS || '200', 10),
    pushTtlSeconds: parseInt(process.env.ALERT_PUSH_TTL_SECONDS || '1800', 10),
  },
  TRAFFIC: {
    clusterRadiusMeters: parseInt(process.env.TRAFFIC_CLUSTER_RADIUS_METERS || '1000', 10),
    clusterWindowMinutes: parseInt(process.env.TRAFFIC_CLUSTER_WINDOW_MINUTES || '60', 10),
    corroborationThreshold: parseInt(process.env.TRAFFIC_CORROBORATION_THRESHOLD || '3', 10),
  },
  META_AI: {
    apiKey: process.env.COMET_API_KEY || process.env.MODEL_API_KEY || process.env.META_API_KEY || null,
    model: process.env.META_MODEL || 'muse-spark-1.3',
    baseUrl: process.env.META_API_BASE_URL || 'https://api.meta.ai/v1',
  },
  GROQ: {
    apiKey: process.env.GROQ_API_KEY || null,
    whisperModel: process.env.GROQ_WHISPER_MODEL || 'whisper-large-v3-turbo',
    chatModel: process.env.GROQ_CHAT_MODEL || 'openai/gpt-oss-20b',
    ttsModel: process.env.GROQ_TTS_MODEL || 'canopylabs/orpheus-v1-english',
    baseUrl: 'https://api.groq.com/openai/v1',
  },
};

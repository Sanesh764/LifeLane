import 'dotenv/config';
import express from 'express';
import { fileURLToPath } from 'url';
import path from 'path';
import { connectDB, disconnectDB, isDbConnected } from './config/db.js';
import { env } from './config/env.js';
import authRouter from './routers/auth.js';
import driverRouter from './routers/driver.js';
import tripRouter from './routers/trips.js';
import notificationRouter from './routers/notifications.js';
import hospitalRouter from './routers/hospitals.js';
import trafficRouter from './routers/traffic.js';
import voiceRouter from './routers/voice.js';
import { stopAllTripAlertIntervals } from './services/notificationService.js';
import { notFoundHandler, errorHandler } from './middlewares/errorHandler.js';

export const app = express();

// Trust reverse proxy (Render, AWS Amplify proxy, Cloudflare) for accurate client IP detection & rate limiting
app.set('trust proxy', 1);

// Production & Development CORS Configuration
const allowedOrigins = new Set([
  'https://main.d37a0y0p7v19sh.amplifyapp.com',
  'http://localhost:5173',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:3000',
]);

// Include any additional comma-separated origins from CORS_ORIGIN environment variable
if (env.CORS_ORIGIN && env.CORS_ORIGIN !== '*') {
  env.CORS_ORIGIN.split(',').forEach((orig) => {
    const trimmed = orig.trim();
    if (trimmed) allowedOrigins.add(trimmed);
  });
}

// CORS middleware conforming to docs/SECURITY.md
app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (origin) {
    if (allowedOrigins.has(origin)) {
      res.header('Access-Control-Allow-Origin', origin);
      res.header('Vary', 'Origin');
    } else if (!env.IS_PRODUCTION && (env.CORS_ORIGIN === '*' || !env.CORS_ORIGIN)) {
      // Allow in development/test if wildcard explicitly allowed
      res.header('Access-Control-Allow-Origin', origin);
      res.header('Vary', 'Origin');
    }
  }

  const reqHeaders = req.header('Access-Control-Request-Headers');
  res.header(
    'Access-Control-Allow-Headers',
    reqHeaders ||
      'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-Endpoint-Hash, x-endpoint-hash'
  );
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.header('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

app.use(express.json({ limit: '10mb' }));

// Health check endpoints (Lightweight, database status and uptime aware)
const handleHealth = (req, res) => {
  const dbReady = isDbConnected();
  res.status(200).json({
    status: 'ok',
    service: 'amburoute-backend',
    uptime: Math.floor(process.uptime()),
    database: dbReady ? 'connected' : 'connecting',
    timestamp: new Date().toISOString(),
  });
};

app.get('/health', handleHealth);
app.get('/api/v1/health', handleHealth);

// Readiness check endpoints (Verifies database connectivity)
const handleReadiness = (req, res) => {
  const dbReady = isDbConnected();
  if (dbReady) {
    return res.status(200).json({
      status: 'ready',
      database: 'connected',
      timestamp: new Date().toISOString(),
    });
  }

  return res.status(503).json({
    status: 'not_ready',
    database: 'disconnected',
    timestamp: new Date().toISOString(),
  });
};

app.get('/ready', handleReadiness);
app.get('/api/v1/ready', handleReadiness);

// Versioned API Routes
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/driver', driverRouter);
app.use('/api/v1/trips', tripRouter);
app.use('/api/v1/notifications', notificationRouter);
app.use('/api/v1/push-subscriptions', notificationRouter);
app.use('/api/v1/hospitals', hospitalRouter);
app.use('/api/v1/traffic', trafficRouter);
app.use('/api/v1/voice', voiceRouter);

// 404 Handler for unknown routes
app.use(notFoundHandler);

// Centralized Error Handler
app.use(errorHandler);

// Server startup and graceful shutdown
let serverInstance = null;

export const startServer = async (port = env.PORT) => {
  const listenPromise = new Promise((resolve) => {
    serverInstance = app.listen(port, '0.0.0.0', () => {
      console.log(`[AmbuRoute Backend] Server listening on 0.0.0.0:${port}`);
      resolve(serverInstance);
    });
  });

  // Connect to DB asynchronously so HTTP health checks are immediately accessible
  connectDB().catch((err) => {
    console.error('[MongoDB Error] Initial connection failed:', err.message);
  });

  return listenPromise;
};

export const stopServer = async () => {
  stopAllTripAlertIntervals();
  if (serverInstance) {
    await new Promise((resolve) => serverInstance.close(resolve));
    serverInstance = null;
  }
  await disconnectDB();
};

const setupGracefulShutdown = () => {
  const handleSignal = async (signal) => {
    console.log(`\n[AmbuRoute Backend] Received ${signal}. Shutting down gracefully...`);
    await stopServer();
    process.exit(0);
  };

  process.on('SIGINT', () => handleSignal('SIGINT'));
  process.on('SIGTERM', () => handleSignal('SIGTERM'));
};

const isMainModule = () => {
  if (!process.argv[1]) return false;
  try {
    return path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
};

if (isMainModule()) {
  setupGracefulShutdown();
  startServer().catch((err) => {
    console.error('[AmbuRoute Backend] Fatal startup error:', err);
    process.exit(1);
  });
}

export default app;

import mongoose from 'mongoose';
import crypto from 'crypto';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';

const STATE_TTL_SECONDS = 10 * 60; // 10 minutes

const OAuthStateSchema = new mongoose.Schema(
  {
    stateId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    nonce: {
      type: String,
      required: true,
    },
    redirectUrl: {
      type: String,
      required: true,
    },
    sessionBindingHash: {
      type: String,
      default: null,
    },
    expiresAt: {
      type: Date,
      required: true,
      default: () => new Date(Date.now() + STATE_TTL_SECONDS * 1000),
      index: { expires: 0 },
    },
  },
  {
    timestamps: true,
  }
);

/**
 * Persist a new single-use OAuth state record with session binding
 */
OAuthStateSchema.statics.createState = async function ({ redirectUrl, sessionToken }) {
  const stateId = crypto.randomUUID();
  const nonce = crypto.randomBytes(16).toString('hex');

  let sessionBindingHash = null;
  if (sessionToken && typeof sessionToken === 'string') {
    sessionBindingHash = crypto
      .createHmac('sha256', env.JWT_SECRET)
      .update(sessionToken)
      .digest('hex');
  }

  await this.create({
    stateId,
    nonce,
    redirectUrl,
    sessionBindingHash,
    expiresAt: new Date(Date.now() + STATE_TTL_SECONDS * 1000),
  });

  // Create HMAC signature of stateId to prevent guessing
  const signature = crypto
    .createHmac('sha256', env.JWT_SECRET)
    .update(stateId)
    .digest('base64url');

  return `${stateId}.${signature}`;
};

/**
 * Atomically consume and invalidate an OAuth state record.
 * Guarantees single-use: cannot be replayed.
 */
OAuthStateSchema.statics.consumeState = async function (stateString, sessionToken) {
  if (!stateString || typeof stateString !== 'string' || !stateString.includes('.')) {
    throw ApiError.badRequest('Invalid or malformed OAuth state parameter.', 'INVALID_OAUTH_STATE');
  }

  const [stateId, signature] = stateString.split('.');
  if (!stateId || !signature) {
    throw ApiError.badRequest('Malformed OAuth state format.', 'INVALID_OAUTH_STATE');
  }

  // Verify HMAC signature
  const expectedSignature = crypto
    .createHmac('sha256', env.JWT_SECRET)
    .update(stateId)
    .digest('base64url');

  const sigBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (
    sigBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(sigBuffer, expectedBuffer)
  ) {
    throw ApiError.badRequest('OAuth state verification failed. Signature mismatch.', 'INVALID_OAUTH_STATE');
  }

  // Atomically find and delete unexpired record (Single-Use consumption)
  const now = new Date();
  const stateDoc = await this.findOneAndDelete({
    stateId,
    expiresAt: { $gt: now },
  });

  if (!stateDoc) {
    throw ApiError.badRequest(
      'OAuth state has expired, is invalid, or has already been used. Please try logging in again.',
      'INVALID_OAUTH_STATE'
    );
  }

  // If session binding was used, verify session token
  if (stateDoc.sessionBindingHash && sessionToken) {
    const expectedBinding = crypto
      .createHmac('sha256', env.JWT_SECRET)
      .update(sessionToken)
      .digest('hex');

    if (stateDoc.sessionBindingHash !== expectedBinding) {
      throw ApiError.badRequest(
        'OAuth state is not bound to this browser session. Possible CSRF.',
        'OAUTH_SESSION_MISMATCH'
      );
    }
  }

  return {
    redirectUrl: stateDoc.redirectUrl,
    nonce: stateDoc.nonce,
  };
};

export const OAuthState = mongoose.model('OAuthState', OAuthStateSchema);

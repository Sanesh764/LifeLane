import crypto from 'crypto';
import axios from 'axios';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { OAuthExchangeTicket } from '../models/OAuthExchangeTicket.js';
import { OAuthState } from '../models/OAuthState.js';
import { ApiError } from '../utils/ApiError.js';

const GOOGLE_AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_ENDPOINT = 'https://www.googleapis.com/oauth2/v3/userinfo';
const STATE_MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Validate that a target frontend URL belongs to an authorized origin
 */
export function validateFrontendRedirectUrl(targetUrl) {
  const allowed = env.GOOGLE.authorizedFrontendOrigins || [];
  if (!targetUrl || typeof targetUrl !== 'string') {
    return allowed[0] || 'http://localhost:5173';
  }

  try {
    const parsed = new URL(targetUrl);
    const origin = parsed.origin;
    if (allowed.some((a) => a.toLowerCase() === origin.toLowerCase())) {
      return targetUrl;
    }
  } catch {
    // Malformed URL
  }

  return allowed[0] || 'http://localhost:5173';
}

/**
 * Generate a cryptographically signed, single-use state parameter bound to browser session
 */
export async function generateOAuthState(redirectUrl, sessionToken = null) {
  const safeRedirect = validateFrontendRedirectUrl(redirectUrl);
  return OAuthState.createState({ redirectUrl: safeRedirect, sessionToken });
}

/**
 * Atomically verify and consume an incoming state parameter (Single-use, anti-replay)
 */
export async function verifyOAuthState(stateString, sessionToken = null) {
  return OAuthState.consumeState(stateString, sessionToken);
}

/**
 * Build the full Google OAuth authorization URL
 */
export async function getGoogleAuthorizationUrl(redirectFrontendUrl, sessionToken = null) {
  if (!env.GOOGLE.clientId) {
    throw ApiError.internal(
      'Google OAuth is not configured on this server. Missing GOOGLE_CLIENT_ID.',
      'GOOGLE_OAUTH_NOT_CONFIGURED'
    );
  }

  const state = await generateOAuthState(redirectFrontendUrl, sessionToken);
  const params = new URLSearchParams({
    client_id: env.GOOGLE.clientId,
    redirect_uri: env.GOOGLE.redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    access_type: 'offline',
    prompt: 'select_account',
  });

  return `${GOOGLE_AUTH_ENDPOINT}?${params.toString()}`;
}

/**
 * Securely exchange Google authorization code for access and ID tokens
 */
export async function exchangeCodeForTokens(code) {
  if (!code || typeof code !== 'string') {
    throw ApiError.badRequest('Authorization code is required.', 'INVALID_AUTH_CODE');
  }

  if (!env.GOOGLE.clientId || !env.GOOGLE.clientSecret) {
    throw ApiError.internal(
      'Google OAuth credentials are not fully configured on server.',
      'GOOGLE_OAUTH_NOT_CONFIGURED'
    );
  }

  try {
    const response = await axios.post(
      GOOGLE_TOKEN_ENDPOINT,
      new URLSearchParams({
        code: code.trim(),
        client_id: env.GOOGLE.clientId,
        client_secret: env.GOOGLE.clientSecret,
        redirect_uri: env.GOOGLE.redirectUri,
        grant_type: 'authorization_code',
      }).toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        timeout: 10000,
      }
    );

    const { access_token, id_token } = response.data || {};
    if (!access_token) {
      throw ApiError.badRequest('Google did not return an access token.', 'TOKEN_EXCHANGE_FAILED');
    }

    return { accessToken: access_token, idToken: id_token };
  } catch (err) {
    const errDetails = err.response?.data?.error_description || err.response?.data?.error || err.message;
    console.error('[GoogleAuth] Token exchange failed:', errDetails);
    throw ApiError.badRequest(
      `Failed to exchange authorization code with Google: ${errDetails}`,
      'GOOGLE_TOKEN_EXCHANGE_FAILED'
    );
  }
}

/**
 * Fetch verified user profile from Google userinfo endpoint
 */
export async function fetchGoogleProfile(accessToken) {
  try {
    const response = await axios.get(GOOGLE_USERINFO_ENDPOINT, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
      timeout: 10000,
    });

    const data = response.data || {};
    if (!data.sub || !data.email) {
      throw ApiError.badRequest('Google profile is missing subject ID or email address.', 'INVALID_GOOGLE_PROFILE');
    }

    if (data.email_verified === false) {
      throw ApiError.badRequest(
        'Google email address is not verified. A verified email is required.',
        'UNVERIFIED_GOOGLE_EMAIL'
      );
    }

    return {
      sub: data.sub,
      email: data.email.trim().toLowerCase(),
      name: data.name || (data.given_name ? `${data.given_name} ${data.family_name || ''}`.trim() : 'Citizen User'),
      picture: data.picture || null,
      emailVerified: true,
    };
  } catch (err) {
    if (err instanceof ApiError) throw err;
    console.error('[GoogleAuth] Userinfo request failed:', err.response?.data || err.message);
    throw ApiError.badRequest('Failed to retrieve user profile from Google.', 'GOOGLE_USERINFO_FAILED');
  }
}

/**
 * Core Google Authentication & Role Separation Gate:
 * Strictly enforces that Google OAuth is exclusively for PUBLIC_USER accounts.
 * AMBULANCE_DRIVER and ADMIN accounts are rejected with 403 Forbidden.
 */
export async function authenticateGoogleUser(profile) {
  const normalizedEmail = profile.email.toLowerCase();

  // Look for existing user by Google Sub ID or verified email
  const existingUser = await User.findOne({
    $or: [{ googleId: profile.sub }, { email: normalizedEmail }],
  });

  if (existingUser) {
    // STRICT SECURITY GATE: Ambulance Drivers and Admins MUST NOT authenticate via Google
    if (existingUser.role === 'AMBULANCE_DRIVER' || existingUser.role === 'ADMIN') {
      console.warn(
        `[SECURITY] Google Sign-In attempt rejected for restricted role: ${existingUser.role} (email: ${normalizedEmail})`
      );
      throw ApiError.forbidden(
        'Google Sign-In is restricted to public citizen accounts. Ambulance drivers and administrators must sign in through their dedicated portal.',
        'GOOGLE_AUTH_ROLE_RESTRICTED'
      );
    }

    if (existingUser.status !== 'active') {
      throw ApiError.forbidden(
        `Account is ${existingUser.status}. Active account status is required to log in.`,
        'ACCOUNT_INACTIVE'
      );
    }

    // Safely link Google identity to existing public citizen if not linked yet
    if (!existingUser.googleId) {
      existingUser.googleId = profile.sub;
      existingUser.authProvider = existingUser.authProvider || 'google';
      existingUser.emailVerified = true;
      if (profile.picture && !existingUser.avatar) {
        existingUser.avatar = profile.picture;
      }
      await existingUser.save();
    }

    return issueSessionPayload(existingUser);
  }

  // Create new public citizen account (strictly assigned PUBLIC_USER)
  const newUser = new User({
    name: profile.name && profile.name.trim() ? profile.name.trim() : 'Citizen User',
    email: normalizedEmail,
    googleId: profile.sub,
    authProvider: 'google',
    role: 'PUBLIC_USER',
    status: 'active',
    driverVerificationStatus: 'NOT_REQUIRED',
    emailVerified: true,
    avatar: profile.picture || null,
    assignedUnit: { callSign: null, vehicleNumber: null, hospitalBase: null },
  });

  await newUser.save();
  return issueSessionPayload(newUser);
}

/**
 * Helper to generate standard AmbuRoute JWT and return user payload
 */
function issueSessionPayload(user) {
  const expiresIn = parseInt(env.JWT_EXPIRES_IN, 10) || 3600;
  const token = jwt.sign(
    {
      sub: user._id.toString(),
      email: user.email,
      role: user.role,
      status: user.status,
      jti: crypto.randomUUID(),
    },
    env.JWT_SECRET,
    { expiresIn }
  );

  return {
    user: {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status,
      driverVerificationStatus: user.driverVerificationStatus,
      assignedUnit: user.assignedUnit,
      avatar: user.avatar || null,
      authProvider: user.authProvider || 'google',
    },
    accessToken: token,
    tokenType: 'Bearer',
    expiresIn,
  };
}

/**
 * Persist short-lived single-use exchange ticket in MongoDB
 */
export async function createExchangeTicket(user, accessToken, expiresIn) {
  const ticket = crypto.randomUUID();

  await OAuthExchangeTicket.create({
    ticket,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status,
      avatar: user.avatar,
    },
    accessToken,
    tokenType: 'Bearer',
    expiresIn,
    expiresAt: new Date(Date.now() + 60 * 1000), // 60s TTL
  });

  return ticket;
}

/**
 * Consume single-use exchange ticket atomically from MongoDB
 */
export async function consumeExchangeTicket(ticketString) {
  const ticketDoc = await OAuthExchangeTicket.consume(ticketString);
  if (!ticketDoc) {
    throw ApiError.badRequest(
      'OAuth exchange ticket is invalid, expired, or has already been used.',
      'INVALID_EXCHANGE_TICKET'
    );
  }

  return {
    user: ticketDoc.user,
    accessToken: ticketDoc.accessToken,
    tokenType: ticketDoc.tokenType || 'Bearer',
    expiresIn: ticketDoc.expiresIn || 3600,
  };
}

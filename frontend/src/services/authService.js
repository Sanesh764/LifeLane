/**
 * AmbuRoute Real Backend Authentication Service
 *
 * Replaces old demo/mock authentication with real cryptographic verification
 * backed by Express and MongoDB at /api/v1/auth.
 *
 * Security:
 * - Passwords and credentials are never hardcoded or evaluated locally.
 * - Sessions use short-lived bearer tokens verified by the server.
 * - Role, active status, and driver verification status are strictly enforced by the backend.
 */

import { API_BASE_URL } from './api.js';

const TOKEN_STORAGE_KEY = 'amburoute_auth_token';
const USER_STORAGE_KEY = 'amburoute_auth_user';

// In-memory session cache for fast component access
let memoryToken = null;
let memoryUser = null;

/**
 * Normalize backend user payload to ensure consistent property access
 * across existing driver UI components.
 */
export function normalizeUser(user) {
  if (!user) return null;
  const assignedUnit = user.assignedUnit || {};
  const isDriver = user.role === 'AMBULANCE_DRIVER' || user.role === 'ADMIN';
  const isActive = user.status === 'active';
  const isVerified = user.driverVerificationStatus === 'VERIFIED';

  return {
    id: user.id || user._id,
    name: user.name || 'Authorized Driver',
    driverName: user.name || 'Authorized Driver',
    email: user.email,
    role: user.role,
    status: user.status,
    driverVerificationStatus: user.driverVerificationStatus,
    assignedUnit,
    callSign: assignedUnit.callSign || 'Patna Emergency 108',
    vehicleNumber: assignedUnit.vehicleNumber || 'BR-01-EA-108',
    hospitalBase: assignedUnit.hospitalBase || 'PMCH Emergency Trauma Center',
    driverId: user.id ? `BR-DRV-${String(user.id).slice(-5).toUpperCase()}` : 'BR-DRV-10842',
    authorized: isDriver && isActive && isVerified,
  };
}

function safeGetStorage(key) {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      return window.sessionStorage.getItem(key);
    }
  } catch (err) {
    console.warn('[authService] Storage read error:', err);
  }
  return null;
}

function safeSetStorage(key, value) {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      window.sessionStorage.setItem(key, value);
    }
  } catch (err) {
    console.warn('[authService] Storage write error:', err);
  }
}

function safeRemoveStorage(key) {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      window.sessionStorage.removeItem(key);
    }
  } catch (err) {
    console.warn('[authService] Storage remove error:', err);
  }
}

export const authService = {
  /**
   * Retrieve active bearer token from memory or session storage
   */
  getToken() {
    if (memoryToken) return memoryToken;
    const stored = safeGetStorage(TOKEN_STORAGE_KEY);
    if (stored) {
      memoryToken = stored;
      return stored;
    }
    return null;
  },

  /**
   * Retrieve currently cached user
   */
  getCurrentUser() {
    if (memoryUser) return memoryUser;
    const stored = safeGetStorage(USER_STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        memoryUser = normalizeUser(parsed);
        return memoryUser;
      } catch {
        safeRemoveStorage(USER_STORAGE_KEY);
      }
    }
    return null;
  },

  /**
   * Check if active driver session is authenticated and authorized
   */
  isAuthenticated() {
    const user = this.getCurrentUser();
    return Boolean(user && user.authorized);
  },

  /**
   * Store active session
   */
  setSession(token, user) {
    memoryToken = token;
    const normalized = normalizeUser(user);
    memoryUser = normalized;
    if (token) {
      safeSetStorage(TOKEN_STORAGE_KEY, token);
    }
    if (normalized) {
      safeSetStorage(USER_STORAGE_KEY, JSON.stringify(normalized));
    }
  },

  /**
   * Clear active session locally
   */
  clearSession() {
    memoryToken = null;
    memoryUser = null;
    safeRemoveStorage(TOKEN_STORAGE_KEY);
    safeRemoveStorage(USER_STORAGE_KEY);
  },

  /**
   * Real backend driver login
   * POST /api/v1/auth/login
   */
  async login(email, password) {
    const trimmedEmail = (email || '').trim().toLowerCase();
    const cleanPassword = password || '';

    if (!trimmedEmail || !cleanPassword) {
      return {
        success: false,
        error: 'Please enter both email address and password.',
      };
    }

    try {
      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          email: trimmedEmail,
          password: cleanPassword,
        }),
      });

      let responseData = null;
      try {
        responseData = await response.json();
      } catch {
        // Non-JSON response body
      }

      if (!response.ok) {
        const errorCode = responseData?.error?.code;
        const errorMessage = responseData?.error?.message;

        if (response.status === 400) {
          return {
            success: false,
            error: errorMessage || 'Invalid request. Please provide valid credentials.',
          };
        }
        if (response.status === 401) {
          return {
            success: false,
            error: errorMessage || 'Invalid email or password. Please verify your driver credentials.',
          };
        }
        if (response.status === 403) {
          if (errorCode === 'DRIVER_NOT_VERIFIED') {
            return {
              success: false,
              error: 'Driver account is awaiting verification. Contact operations dispatch.',
            };
          }
          if (errorCode === 'ACCOUNT_INACTIVE') {
            return {
              success: false,
              error: 'Driver account is inactive or disabled. Contact administrator.',
            };
          }
          return {
            success: false,
            error: errorMessage || 'Access denied. Account is not authorized for driver cockpit.',
          };
        }
        if (response.status === 429) {
          return {
            success: false,
            error: errorMessage || 'Too many failed login attempts. Please try again after 15 minutes.',
          };
        }
        if (response.status === 503) {
          return {
            success: false,
            error: 'Authentication database is currently unavailable. Please try again shortly.',
          };
        }

        return {
          success: false,
          error: errorMessage || `Login failed (HTTP ${response.status}).`,
        };
      }

      const payload = responseData?.data;
      if (!payload || !payload.accessToken || !payload.user) {
        return {
          success: false,
          error: 'Malformed response received from authentication server.',
        };
      }

      const normalized = normalizeUser(payload.user);

      // Verify that backend verified the account as an active authorized driver
      if (!normalized.authorized) {
        this.clearSession();
        return {
          success: false,
          error: 'Account authenticated, but lacks verified driver permissions.',
        };
      }

      this.setSession(payload.accessToken, normalized);
      return {
        success: true,
        user: normalized,
        token: payload.accessToken,
      };
    } catch (networkErr) {
      console.error('[authService] Network error during login:', networkErr);
      return {
        success: false,
        error: 'Unable to connect to AmbuRoute backend server. Please verify backend is running on port 5000.',
      };
    }
  },

  /**
   * Verify existing session with the backend on page load or refresh
   * GET /api/v1/auth/me
   */
  async verifySession() {
    const token = this.getToken();
    if (!token) {
      this.clearSession();
      return null;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/auth/me`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        // Token is invalid, expired, revoked, or account was suspended
        console.warn(`[authService] Session verification failed with status ${response.status}. Clearing local session.`);
        this.clearSession();
        return null;
      }

      const json = await response.json();
      const user = json?.data?.user;
      if (!user) {
        this.clearSession();
        return null;
      }

      const normalized = normalizeUser(user);
      if (!normalized.authorized) {
        this.clearSession();
        return null;
      }

      // Refresh cached user in storage
      this.setSession(token, normalized);
      return normalized;
    } catch (networkErr) {
      console.warn('[authService] Network error during session verification:', networkErr);
      // If backend is completely unreachable, do NOT blindly trust the session
      this.clearSession();
      return null;
    }
  },

  /**
   * Real backend driver logout and token invalidation
   * POST /api/v1/auth/logout
   */
  async logout() {
    const token = this.getToken();
    if (token) {
      try {
        await fetch(`${API_BASE_URL}/auth/logout`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
          },
        });
      } catch (err) {
        console.warn('[authService] Server logout request failed:', err);
      }
    }

    this.clearSession();
    return { success: true };
  },
};

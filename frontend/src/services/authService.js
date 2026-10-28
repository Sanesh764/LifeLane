/**
 * AmbuRoute Demo Authentication Service
 *
 * SECURITY LIMITATION NOTICE:
 * This is a frontend-only demo authentication service for prototype UI access control.
 * It gates driver features in the browser during hackathon evaluation.
 * In a real production deployment, authentication and role authorization must be
 * enforced cryptographically on the backend using secure tokens and institutional vetting.
 */

const DEMO_CREDENTIALS = {
  email: 'driver@amburoute.demo',
  password: 'AmbuRoute@Demo2026',
  driverName: 'Amitabh Sen',
  callSign: 'Patna Unit 108 — Alpha',
  vehicleNumber: 'BR-01-EA-108',
  hospitalBase: 'PMCH Emergency Trauma Center',
};

const SESSION_STORAGE_KEY = 'amburoute_driver_session';

export const authService = {
  /**
   * Attempt demo driver login
   * @param {string} email
   * @param {string} password
   * @returns {{ success: boolean, user?: object, error?: string }}
   */
  login(email, password) {
    const trimmedEmail = (email || '').trim().toLowerCase();
    const cleanPassword = password || '';

    if (!trimmedEmail || !cleanPassword) {
      return {
        success: false,
        error: 'Please enter both email and password.',
      };
    }

    if (
      trimmedEmail === DEMO_CREDENTIALS.email.toLowerCase() &&
      cleanPassword === DEMO_CREDENTIALS.password
    ) {
      const user = {
        email: DEMO_CREDENTIALS.email,
        driverName: DEMO_CREDENTIALS.driverName,
        callSign: DEMO_CREDENTIALS.callSign,
        vehicleNumber: DEMO_CREDENTIALS.vehicleNumber,
        hospitalBase: DEMO_CREDENTIALS.hospitalBase,
        authorized: true,
        sessionStarted: new Date().toISOString(),
      };

      try {
        sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(user));
      } catch (err) {
        console.warn('[authService] Storage error:', err);
      }

      return { success: true, user };
    }

    // Generic error message without revealing which credential failed
    return {
      success: false,
      error: 'Invalid email or password. Please verify your driver credentials.',
    };
  },

  /**
   * Log out the current driver session
   */
  logout() {
    try {
      sessionStorage.removeItem(SESSION_STORAGE_KEY);
    } catch (err) {
      console.warn('[authService] Storage error:', err);
    }
  },

  /**
   * Get the currently logged-in driver session
   */
  getCurrentUser() {
    try {
      const session = sessionStorage.getItem(SESSION_STORAGE_KEY);
      if (session) {
        return JSON.parse(session);
      }
    } catch (err) {
      console.warn('[authService] Parse error:', err);
    }
    return null;
  },

  /**
   * Check if an authorized driver session is active
   */
  isAuthenticated() {
    const user = this.getCurrentUser();
    return Boolean(user && user.authorized);
  },
};

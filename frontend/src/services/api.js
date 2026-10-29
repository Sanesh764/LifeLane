/**
 * AmbuRoute Frontend API Client Layer
 * Connected to Node/Express backend endpoints at /api/v1
 */

const rawBaseUrl =
  typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_BASE_URL
    ? import.meta.env.VITE_API_BASE_URL
    : 'http://localhost:5000';

const cleanBaseUrl = rawBaseUrl.replace(/\/+$/, '');

export const API_BASE_URL = cleanBaseUrl.endsWith('/api/v1')
  ? cleanBaseUrl
  : `${cleanBaseUrl}/api/v1`;

/**
 * Standard fetch helper with JSON parsing and standardized error handling
 */
async function request(endpoint, options = {}) {
  const url = `${API_BASE_URL}${endpoint}`;
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  try {
    const res = await fetch(url, {
      ...options,
      headers,
    });

    let json = null;
    const text = await res.text();
    if (text) {
      try {
        json = JSON.parse(text);
      } catch {
        json = { error: { message: text } };
      }
    }

    if (!res.ok) {
      const errorMsg = json?.error?.message || `HTTP ${res.status} request failed`;
      const errorCode = json?.error?.code || 'API_ERROR';
      return {
        success: false,
        status: res.status,
        error: { code: errorCode, message: errorMsg, details: json?.error?.details },
      };
    }

    return {
      success: true,
      status: res.status,
      data: json?.data !== undefined ? json.data : json,
    };
  } catch (err) {
    const errorMsg =
      err.message === 'Failed to fetch' || err.name === 'TypeError'
        ? 'Unable to connect to backend server. Please verify backend is running.'
        : err.message || 'Network connection to backend failed.';
    return {
      success: false,
      status: 0,
      error: {
        code: 'NETWORK_ERROR',
        message: errorMsg,
      },
    };
  }
}

export const apiClient = {
  // --- Emergency Trip Endpoints ---

  /**
   * Start an emergency trip
   * POST /api/v1/trips
   */
  async createTrip(tripPayload, token) {
    return request('/trips', {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: JSON.stringify(tripPayload),
    });
  },

  /**
   * Get active trip for current driver
   * GET /api/v1/trips/current
   */
  async getActiveTrip(token) {
    return request('/trips/current', {
      method: 'GET',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  },

  /**
   * Submit live GPS location telemetry update for active trip
   * PATCH /api/v1/trips/:id/location
   */
  async updateTripLocation(tripId, locationPayload, token) {
    return request(`/trips/${tripId}/location`, {
      method: 'PATCH',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: JSON.stringify(locationPayload),
    });
  },

  /**
   * End an active emergency trip
   * POST /api/v1/trips/:id/end
   */
  async endTrip(tripId, endPayload = { reason: 'ARRIVED' }, token) {
    const body = typeof endPayload === 'string' ? { reason: endPayload } : endPayload;
    return request(`/trips/${tripId}/end`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: JSON.stringify(body),
    });
  },

  // --- Hospital Discovery ---

  /**
   * Discover nearby hospitals using driver's GPS coordinates
   * GET /api/v1/hospitals/nearby?lat=...&lng=...&radius=...
   */
  async getNearbyHospitals(lat, lng, radiusMeters = 25000) {
    return request(`/hospitals/nearby?lat=${lat}&lng=${lng}&radius=${radiusMeters}`, {
      method: 'GET',
    });
  },

  // --- Web Push & Notification Endpoints ---

  /**
   * Fetch backend VAPID public key
   * GET /api/v1/notifications/vapid-public-key
   */
  async getVapidPublicKey() {
    return request('/notifications/vapid-public-key', {
      method: 'GET',
    });
  },

  /**
   * Register or update a browser Web Push subscription
   * POST /api/v1/notifications/subscriptions
   */
  async registerSubscription(subData) {
    return request('/notifications/subscriptions', {
      method: 'POST',
      body: JSON.stringify(subData),
    });
  },

  /**
   * Submit consented road-user location heartbeat
   * POST /api/v1/notifications/location
   */
  async sendLocationHeartbeat(heartbeatData) {
    return request('/notifications/location', {
      method: 'POST',
      body: JSON.stringify(heartbeatData),
    });
  },

  /**
   * Dispatch an explicit test push notification to verify browser & OS alerting
   * POST /api/v1/notifications/test
   */
  async sendTestNotification(testData) {
    return request('/notifications/test', {
      method: 'POST',
      body: JSON.stringify(testData),
    });
  },

  /**
   * Unsubscribe from push alerts and purge stored location
   * DELETE /api/v1/notifications/subscriptions
   */
  async unsubscribe(unsubscribeData) {
    const payload = typeof unsubscribeData === 'string' ? { endpoint: unsubscribeData } : (unsubscribeData || {});
    const headers = payload.endpointHash
      ? { 'X-Endpoint-Hash': payload.endpointHash }
      : {};

    return request('/notifications/subscriptions', {
      method: 'DELETE',
      headers,
      body: JSON.stringify(payload),
    });
  },

  // --- Traffic Reports & Real-Time Intelligence ---
  /**
   * Submit real-time community road condition report
   * POST /api/v1/traffic/reports
   */
  async submitReport(reportData) {
    return request('/traffic/reports', {
      method: 'POST',
      body: JSON.stringify(reportData),
    });
  },

  async createTrafficReport(reportData) {
    return request('/traffic/reports', {
      method: 'POST',
      body: JSON.stringify(reportData),
    });
  },

  /**
   * Fetch active community traffic reports
   * GET /api/v1/traffic/reports
   */
  async getTrafficReports(query = {}) {
    const q = new URLSearchParams();
    if (query.lat !== undefined) q.append('lat', query.lat);
    if (query.lng !== undefined) q.append('lng', query.lng);
    if (query.radius !== undefined) q.append('radius', query.radius);
    const qs = q.toString() ? `?${q.toString()}` : '';
    return request(`/traffic/reports${qs}`, {
      method: 'GET',
    });
  },

  /**
   * Reverse-geocode coordinates to identify real road / area name
   */
  async reverseGeocode(lat, lng) {
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`;
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'AmbuRoute-Emergency/1.0 (dev@amburoute.org)',
          Accept: 'application/json',
        },
      });
      if (!res.ok) return null;
      const data = await res.json();
      if (!data) return null;
      const addr = data.address || {};
      const road = addr.road || addr.pedestrian || addr.highway || addr.suburb || addr.neighbourhood || addr.village || addr.town || addr.city;
      const locality = addr.suburb || addr.neighbourhood || addr.county || addr.state_district || addr.city;
      const displayName = [road, locality].filter(Boolean).join(', ') || data.name || data.display_name?.split(',').slice(0, 2).join(', ');
      return {
        road: road || 'Detected Local Road',
        displayName: displayName || `${lat.toFixed(5)}°N, ${lng.toFixed(5)}°E`,
        fullAddress: data.display_name,
      };
    } catch (e) {
      console.warn('[apiClient] Reverse geocoding failed:', e);
      return null;
    }
  },
};

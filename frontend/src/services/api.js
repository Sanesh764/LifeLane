/**
 * AmbuRoute Frontend API Client Layer
 * Pre-configured for future Node/Express backend endpoints at /api/v1
 * Currently operates in mock mode with clear simulated responses.
 */

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api/v1';

export const apiClient = {
  // Trips
  async createTrip(tripData) {
    console.log(`[API simulated] POST ${API_BASE_URL}/trips`, tripData);
    return {
      success: true,
      data: {
        id: `trip-${Date.now()}`,
        status: 'ACTIVE',
        startTime: new Date().toISOString(),
        ...tripData,
      },
    };
  },

  async endTrip(tripId) {
    console.log(`[API simulated] POST ${API_BASE_URL}/trips/:id/end`, tripId);
    return {
      success: true,
      data: { id: tripId, status: 'COMPLETED', endTime: new Date().toISOString() },
    };
  },

  // Traffic Reports
  async submitReport(reportData) {
    console.log(`[API simulated] POST ${API_BASE_URL}/traffic-reports`, reportData);
    return {
      success: true,
      data: {
        id: `rep-${Date.now()}`,
        timestamp: new Date().toISOString(),
        status: 'RECEIVED',
        freshness: 'FRESH',
        ...reportData,
      },
    };
  },

  // Push Subscriptions
  async registerSubscription(subData) {
    console.log(`[API simulated] POST ${API_BASE_URL}/push-subscriptions`, subData);
    return {
      success: true,
      data: { id: `sub-${Date.now()}`, subscribed: true, registeredAt: new Date().toISOString() },
    };
  },
};

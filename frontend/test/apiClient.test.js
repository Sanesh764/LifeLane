import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert';
import { apiClient } from '../src/services/api.js';

function mockResponse(status, body) {
  const jsonString = JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => jsonString,
    json: async () => body,
  };
}

describe('Phase F1: Frontend API Client Tests', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('1. Trip API Methods', () => {
    it('createTrip sends POST with authorization header and returns trip data', async () => {
      let capturedUrl;
      let capturedOptions;

      global.fetch = async (url, options) => {
        capturedUrl = url;
        capturedOptions = options;
        return mockResponse(201, {
          success: true,
          data: {
            trip: {
              id: 'trip-12345',
              status: 'ACTIVE',
              origin: { type: 'Point', coordinates: [85.1376, 25.5941] },
              destination: { label: 'PMCH Patna', location: { type: 'Point', coordinates: [85.1588, 25.6080] } },
            },
          },
        });
      };

      const result = await apiClient.createTrip(
        {
          destination: { label: 'PMCH Patna', location: { type: 'Point', coordinates: [85.1588, 25.6080] } },
          initialLocation: { type: 'Point', coordinates: [85.1376, 25.5941] },
        },
        'mock-jwt-token'
      );

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.data.trip.id, 'trip-12345');
      assert.ok(capturedUrl.includes('/api/v1/trips'));
      assert.strictEqual(capturedOptions.method, 'POST');
      assert.strictEqual(capturedOptions.headers.Authorization, 'Bearer mock-jwt-token');
      assert.strictEqual(capturedOptions.headers['Content-Type'], 'application/json');
    });

    it('getActiveTrip sends GET to /api/v1/trips/current', async () => {
      let capturedUrl;
      let capturedOptions;

      global.fetch = async (url, options) => {
        capturedUrl = url;
        capturedOptions = options;
        return mockResponse(200, {
          success: true,
          data: {
            trip: { id: 'trip-active-1', status: 'ACTIVE' },
          },
        });
      };

      const result = await apiClient.getActiveTrip('mock-jwt-token');
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.data.trip.id, 'trip-active-1');
      assert.ok(capturedUrl.includes('/api/v1/trips/current'));
      assert.strictEqual(capturedOptions.method, 'GET');
    });

    it('updateTripLocation sends PATCH to /api/v1/trips/:id/location', async () => {
      let capturedUrl;
      let capturedOptions;

      global.fetch = async (url, options) => {
        capturedUrl = url;
        capturedOptions = options;
        return mockResponse(200, {
          success: true,
          data: {
            updatedTrip: { id: 'trip-123' },
            alertsTriggered: 2,
          },
        });
      };

      const locationPayload = {
        coordinates: [85.14, 25.60],
        accuracyMeters: 12,
        capturedAt: new Date().toISOString(),
      };

      const result = await apiClient.updateTripLocation('trip-123', locationPayload, 'mock-jwt-token');
      assert.strictEqual(result.success, true);
      assert.ok(capturedUrl.includes('/api/v1/trips/trip-123/location'));
      assert.strictEqual(capturedOptions.method, 'PATCH');
      assert.strictEqual(result.data.alertsTriggered, 2);
    });

    it('endTrip sends POST to /api/v1/trips/:id/end with completion reason', async () => {
      let capturedUrl;
      let capturedOptions;

      global.fetch = async (url, options) => {
        capturedUrl = url;
        capturedOptions = options;
        return mockResponse(200, {
          success: true,
          data: {
            trip: { id: 'trip-123', status: 'COMPLETED' },
          },
        });
      };

      const result = await apiClient.endTrip('trip-123', 'PATIENT_DELIVERED', 'mock-jwt-token');
      assert.strictEqual(result.success, true);
      assert.ok(capturedUrl.includes('/api/v1/trips/trip-123/end'));
      assert.strictEqual(capturedOptions.method, 'POST');
      assert.strictEqual(JSON.parse(capturedOptions.body).reason, 'PATIENT_DELIVERED');
    });
  });

  describe('2. Hospital Discovery API', () => {
    it('getNearbyHospitals requests /api/v1/hospitals/nearby with query parameters', async () => {
      let capturedUrl;

      global.fetch = async (url) => {
        capturedUrl = url;
        return mockResponse(200, {
          success: true,
          data: {
            count: 2,
            hospitals: [
              { id: 'patna-aiims', name: 'AIIMS Patna', distanceKm: 4.8 },
              { id: 'patna-pmch', name: 'Patna Medical College Hospital', distanceKm: 2.1 },
            ],
          },
        });
      };

      const result = await apiClient.getNearbyHospitals(25.5941, 85.1376, 12000);
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.data.hospitals.length, 2);
      assert.ok(capturedUrl.includes('/api/v1/hospitals/nearby'));
      assert.ok(capturedUrl.includes('lat=25.5941'));
      assert.ok(capturedUrl.includes('lng=85.1376'));
      assert.ok(capturedUrl.includes('radius=12000'));
    });
  });

  describe('3. Web Push & Notification Subscription APIs', () => {
    it('getVapidPublicKey fetches /api/v1/notifications/vapid-public-key', async () => {
      global.fetch = async (url) => {
        assert.ok(url.includes('/api/v1/notifications/vapid-public-key'));
        return mockResponse(200, {
          success: true,
          data: { publicKey: 'BH-1OBY85A6pCe0yBfKaEy_lgnUhj8I9R2sjTtfiHTf...' },
        });
      };

      const result = await apiClient.getVapidPublicKey();
      assert.strictEqual(result.success, true);
      assert.ok(result.data.publicKey.startsWith('BH-'));
    });

    it('registerSubscription posts push subscription and consents', async () => {
      let capturedBody;

      global.fetch = async (url, options) => {
        assert.ok(url.includes('/api/v1/notifications/subscriptions'));
        assert.strictEqual(options.method, 'POST');
        capturedBody = JSON.parse(options.body);
        return mockResponse(201, {
          success: true,
          data: {
            subscription: {
              endpointHash: 'hash-abc-123',
              notificationConsent: true,
              locationConsent: true,
            },
          },
        });
      };

      const payload = {
        endpoint: 'https://fcm.googleapis.com/fcm/send/test-token-123',
        keys: { p256dh: 'key-p256', auth: 'key-auth' },
        notificationConsent: true,
        locationConsent: true,
      };

      const result = await apiClient.registerSubscription(payload);
      assert.strictEqual(result.success, true);
      assert.strictEqual(capturedBody.endpoint, payload.endpoint);
      assert.strictEqual(result.data.subscription.endpointHash, 'hash-abc-123');
    });

    it('sendLocationHeartbeat posts updated coordinates and returns freshness info', async () => {
      let capturedBody;

      global.fetch = async (url, options) => {
        assert.ok(url.includes('/api/v1/notifications/location'));
        assert.strictEqual(options.method, 'POST');
        capturedBody = JSON.parse(options.body);
        return mockResponse(200, {
          success: true,
          data: {
            endpointHash: 'hash-abc-123',
            lastLocationCapturedAt: capturedBody.capturedAt,
          },
        });
      };

      const now = new Date().toISOString();
      const result = await apiClient.sendLocationHeartbeat({
        endpointHash: 'hash-abc-123',
        coordinates: [85.14, 25.60],
        accuracyMeters: 15,
        capturedAt: now,
      });

      assert.strictEqual(result.success, true);
      assert.strictEqual(capturedBody.endpointHash, 'hash-abc-123');
      assert.deepStrictEqual(capturedBody.coordinates, [85.14, 25.60]);
    });

    it('unsubscribe sends DELETE to /api/v1/notifications/subscriptions', async () => {
      let capturedUrl;
      let capturedMethod;

      global.fetch = async (url, options) => {
        capturedUrl = url;
        capturedMethod = options.method;
        return mockResponse(200, {
          success: true,
          data: { message: 'Subscription removed' },
        });
      };

      const result = await apiClient.unsubscribe('https://push.example.com/sub/123');
      assert.strictEqual(result.success, true);
      assert.ok(capturedUrl.includes('/api/v1/notifications/subscriptions'));
      assert.strictEqual(capturedMethod, 'DELETE');
    });
  });

  describe('4. Error Handling & Network Resilience', () => {
    it('returns consistent error object when fetch throws network failure', async () => {
      global.fetch = async () => {
        throw new TypeError('Failed to fetch');
      };

      const result = await apiClient.getActiveTrip('some-token');
      assert.strictEqual(result.success, false);
      assert.strictEqual(result.error.code, 'NETWORK_ERROR');
      assert.ok(result.error.message.includes('backend server'));
    });

    it('parses structured backend error responses', async () => {
      global.fetch = async () =>
        mockResponse(409, {
          error: {
            code: 'ACTIVE_TRIP_EXISTS',
            message: 'Driver already has an active emergency trip.',
            details: { activeTripId: 'trip-existing-99' },
          },
        });

      const result = await apiClient.createTrip({ destination: { label: 'Test' } }, 'token');
      assert.strictEqual(result.success, false);
      assert.strictEqual(result.error.code, 'ACTIVE_TRIP_EXISTS');
      assert.strictEqual(result.error.details.activeTripId, 'trip-existing-99');
    });
  });

  describe('5. Real-Time Community Traffic Reporting APIs', () => {
    it('createTrafficReport sends POST to /api/v1/traffic/reports with payload', async () => {
      let capturedUrl;
      let capturedOptions;

      global.fetch = async (url, options) => {
        capturedUrl = url;
        capturedOptions = options;
        return mockResponse(201, {
          success: true,
          data: {
            report: {
              id: 'rep-live-1',
              reportType: 'ROAD_BLOCKED',
              roadSegment: 'NH-33 Commercial Arterial',
              coordinates: [24.99902, 86.12359],
            },
          },
        });
      };

      const result = await apiClient.createTrafficReport({
        reportType: 'ROAD_BLOCKED',
        roadSegment: 'NH-33 Commercial Arterial',
        coordinates: [86.12359, 24.99902],
        accuracyMeters: 10,
      });

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.data.report.id, 'rep-live-1');
      assert.ok(capturedUrl.includes('/api/v1/traffic/reports'));
      assert.strictEqual(capturedOptions.method, 'POST');
      const body = JSON.parse(capturedOptions.body);
      assert.strictEqual(body.reportType, 'ROAD_BLOCKED');
      assert.strictEqual(body.roadSegment, 'NH-33 Commercial Arterial');
    });

    it('getTrafficReports requests /api/v1/traffic/reports with coordinates', async () => {
      let capturedUrl;

      global.fetch = async (url) => {
        capturedUrl = url;
        return mockResponse(200, {
          success: true,
          data: {
            reports: [{ id: 'rep-1', roadSegment: 'Main Road' }],
            count: 1,
          },
        });
      };

      const result = await apiClient.getTrafficReports({ lat: 25.17, lng: 86.09, radius: 25000 });
      assert.strictEqual(result.success, true);
      assert.ok(capturedUrl.includes('/api/v1/traffic/reports'));
      assert.ok(capturedUrl.includes('lat=25.17'));
      assert.ok(capturedUrl.includes('lng=86.09'));
    });
  });
});

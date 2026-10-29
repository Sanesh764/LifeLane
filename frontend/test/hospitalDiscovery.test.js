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

describe('Phase F2: Dynamic Nearby Hospital Discovery & Origin Selection', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('1. Geographic Hospital Query by Origin Coordinates', () => {
    it('requests nearby hospitals with Lakhisarai origin coordinates and 35km radius', async () => {
      let capturedUrl;

      global.fetch = async (url) => {
        capturedUrl = url;
        return mockResponse(200, {
          success: true,
          data: {
            hospitals: [
              {
                id: 'lakhisarai-sadar',
                name: 'Sadar Hospital Lakhisarai (District Hospital)',
                coordinates: [86.0945, 25.1764],
                distanceMeters: 450,
                distanceKm: 0.5,
                distanceType: 'STRAIGHT_LINE',
                distanceNote: 'Straight-line distance (aerial)',
              },
              {
                id: 'barhiya-hosp',
                name: 'Sub-Divisional Hospital Barhiya',
                coordinates: [86.0289, 25.2678],
                distanceMeters: 12400,
                distanceKm: 12.4,
                distanceType: 'STRAIGHT_LINE',
                distanceNote: 'Straight-line distance (aerial)',
              },
              {
                id: 'suryagarha-hosp',
                name: 'Referral Hospital Suryagarha',
                coordinates: [86.223, 25.215],
                distanceMeters: 14800,
                distanceKm: 14.8,
                distanceType: 'STRAIGHT_LINE',
                distanceNote: 'Straight-line distance (aerial)',
              },
            ],
            threeClosestHospitals: [
              {
                id: 'lakhisarai-sadar',
                name: 'Sadar Hospital Lakhisarai (District Hospital)',
                distanceKm: 0.5,
              },
              {
                id: 'barhiya-hosp',
                name: 'Sub-Divisional Hospital Barhiya',
                distanceKm: 12.4,
              },
              {
                id: 'suryagarha-hosp',
                name: 'Referral Hospital Suryagarha',
                distanceKm: 14.8,
              },
            ],
            hasAtLeastThree: true,
            count: 3,
            source: 'OPENSTREETMAP_OVERPASS',
          },
        });
      };

      const res = await apiClient.getNearbyHospitals(25.1764, 86.0945, 35000);

      assert.strictEqual(res.success, true);
      assert.ok(capturedUrl.includes('lat=25.1764'));
      assert.ok(capturedUrl.includes('lng=86.0945'));
      assert.ok(capturedUrl.includes('radius=35000'));

      const hospitals = res.data.hospitals;
      assert.strictEqual(hospitals.length, 3);
      assert.strictEqual(hospitals[0].id, 'lakhisarai-sadar');
      assert.strictEqual(hospitals[0].distanceType, 'STRAIGHT_LINE');

      // Verify that all results are local Lakhisarai facilities, not Patna
      for (const h of hospitals) {
        assert.ok(!h.name.toLowerCase().includes('patna'));
        assert.ok(!h.name.toLowerCase().includes('pmch'));
      }
    });

    it('indicates when fewer than 3 hospitals are available in search radius', async () => {
      global.fetch = async () =>
        mockResponse(200, {
          success: true,
          data: {
            hospitals: [
              {
                id: 'rural-clinic',
                name: 'Primary Health Center',
                coordinates: [86.5, 25.0],
                distanceMeters: 8000,
                distanceKm: 8.0,
                distanceType: 'STRAIGHT_LINE',
              },
            ],
            threeClosestHospitals: [
              {
                id: 'rural-clinic',
                name: 'Primary Health Center',
                distanceKm: 8.0,
              },
            ],
            hasAtLeastThree: false,
            count: 1,
          },
        });

      const res = await apiClient.getNearbyHospitals(25.0, 86.5, 10000);
      assert.strictEqual(res.success, true);
      assert.strictEqual(res.data.hasAtLeastThree, false);
      assert.strictEqual(res.data.hospitals.length, 1);
    });
  });

  describe('2. Trip Creation with Dynamic Destination & Origin', () => {
    it('sends the real selected hospital coordinates and Lakhisarai origin to trip creation endpoint', async () => {
      let capturedBody;
      let capturedHeaders;

      global.fetch = async (url, options) => {
        if (url.includes('/api/v1/trips')) {
          capturedBody = JSON.parse(options.body);
          capturedHeaders = options.headers;
          return mockResponse(201, {
            success: true,
            data: {
              trip: {
                id: 'trip-lakh-999',
                status: 'ACTIVE',
                origin: capturedBody.initialLocation,
                destination: capturedBody.destination,
              },
            },
          });
        }
        return mockResponse(404, {});
      };

      const lakhisaraiOrigin = [86.0945, 25.1764]; // [lng, lat]
      const chosenDestination = {
        label: 'Sadar Hospital Lakhisarai (District Hospital)',
        location: {
          type: 'Point',
          coordinates: [86.0945, 25.1764],
        },
      };

      const tripPayload = {
        destination: chosenDestination,
        initialLocation: {
          type: 'Point',
          coordinates: lakhisaraiOrigin,
        },
        locationAccuracyMeters: 12,
      };

      const res = await apiClient.createTrip(tripPayload, 'driver-test-jwt');

      assert.strictEqual(res.success, true);
      assert.strictEqual(res.data.trip.id, 'trip-lakh-999');
      assert.deepStrictEqual(capturedBody.initialLocation.coordinates, lakhisaraiOrigin);
      assert.strictEqual(
        capturedBody.destination.label,
        'Sadar Hospital Lakhisarai (District Hospital)'
      );
      assert.strictEqual(capturedHeaders.Authorization, 'Bearer driver-test-jwt');
    });
  });
});

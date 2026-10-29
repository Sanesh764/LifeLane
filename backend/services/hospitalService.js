import axios from 'axios';

// In-memory cache: key -> { timestamp, result }
const hospitalCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes cache

/**
 * Calculates straight-line Haversine distance in meters between two [lng, lat] points
 */
export const calculateDistanceMeters = (coord1, coord2) => {
  if (!coord1 || !coord2) return Infinity;
  const [lng1, lat1] = coord1;
  const [lng2, lat2] = coord2;

  const R = 6371000; // Earth's radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

/**
 * Formats distance in meters into human-readable label
 */
export const formatDistance = (meters) => {
  if (!Number.isFinite(meters)) return 'Unknown';
  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }
  return `${(meters / 1000).toFixed(1)} km`;
};

/**
 * Deduplicates hospital records by normalized name and proximity (within 350m)
 */
export function deduplicateHospitals(rawList) {
  const seenNames = new Set();
  const deduped = [];

  for (const item of rawList) {
    if (!item || !item.name) continue;

    // Normalize name: lowercase, strip common prefixes/suffixes
    const cleanName = item.name
      .toLowerCase()
      .replace(/[\(\)\[\],\.\-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    // Check proximity to already-added items (within 350 meters or matching clean name within 1km)
    const isNearbyDuplicate = deduped.some((existing) => {
      const dist = calculateDistanceMeters(existing.coordinates, item.coordinates);
      if (dist < 350) return true;
      if (
        dist < 1500 &&
        (existing.cleanName === cleanName ||
          existing.cleanName.includes(cleanName) ||
          cleanName.includes(existing.cleanName))
      ) {
        return true;
      }
      return false;
    });

    if (!seenNames.has(cleanName) && !isNearbyDuplicate) {
      seenNames.add(cleanName);
      deduped.push({
        ...item,
        cleanName,
      });
    }
  }

  // Remove temporary cleanName field
  return deduped.map(({ cleanName, ...rest }) => rest);
}

/**
 * Query live nearby hospitals from OpenStreetMap Nominatim with viewbox bounding box
 *
 * @param {number} lat - Driver origin latitude
 * @param {number} lng - Driver origin longitude
 * @param {number} radiusMeters - Search radius in meters
 */
async function queryNominatimHospitals(lat, lng, radiusMeters) {
  // Convert radius in meters to degree deltas
  const deltaLat = radiusMeters / 111320;
  const deltaLng = radiusMeters / (111320 * Math.max(Math.cos((lat * Math.PI) / 180), 0.1));

  const left = (lng - deltaLng).toFixed(5);
  const top = (lat + deltaLat).toFixed(5);
  const right = (lng + deltaLng).toFixed(5);
  const bottom = (lat - deltaLat).toFixed(5);

  const url = `https://nominatim.openstreetmap.org/search?format=json&q=hospital&viewbox=${left},${top},${right},${bottom}&bounded=1&limit=25`;

  const response = await axios.get(url, {
    headers: {
      'User-Agent': 'AmbuRoute-Emergency/1.0 (emergency-dispatch@amburoute.org)',
      Accept: 'application/json',
    },
    timeout: 5000,
  });

  if (!Array.isArray(response.data)) return [];

  const driverCoords = [lng, lat];
  const items = response.data
    .map((item) => {
      const hLat = Number(item.lat);
      const hLng = Number(item.lon);
      if (!Number.isFinite(hLat) || !Number.isFinite(hLng)) return null;

      const distanceMeters = calculateDistanceMeters(driverCoords, [hLng, hLat]);
      if (distanceMeters > radiusMeters) return null;

      const rawName = item.name || (item.display_name ? item.display_name.split(',')[0].trim() : 'Hospital');
      // Format clean readable name
      const name = rawName.length < 3 ? (item.display_name ? item.display_name.split(',').slice(0, 2).join(', ').trim() : 'Local Medical Facility') : rawName;

      return {
        id: `osm-${item.osm_type || 'node'}-${item.osm_id || item.place_id}`,
        name,
        label: name,
        shortName: name.split('(')[0].trim(),
        coordinates: [hLng, hLat],
        distanceMeters: Math.round(distanceMeters),
        distanceKm: Number((distanceMeters / 1000).toFixed(1)),
        distanceFormatted: formatDistance(distanceMeters),
        distanceType: 'STRAIGHT_LINE',
        distanceNote: 'Straight-line distance (aerial)',
        type: 'EMERGENCY_HOSPITAL',
        address: item.display_name,
        source: 'OPENSTREETMAP_NOMINATIM',
      };
    })
    .filter(Boolean);

  return items;
}

/**
 * Query live nearby hospitals from OpenStreetMap Overpass API (Secondary fallback)
 */
async function queryOverpassHospitals(lat, lng, radiusMeters) {
  const overpassQuery = `
    [out:json][timeout:5];
    (
      node["amenity"="hospital"](around:${radiusMeters},${lat},${lng});
      way["amenity"="hospital"](around:${radiusMeters},${lat},${lng});
      relation["amenity"="hospital"](around:${radiusMeters},${lat},${lng});
      node["healthcare"="hospital"](around:${radiusMeters},${lat},${lng});
      way["healthcare"="hospital"](around:${radiusMeters},${lat},${lng});
    );
    out center 25;
  `;

  const response = await axios.post(
    'https://overpass-api.de/api/interpreter',
    `data=${encodeURIComponent(overpassQuery)}`,
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'AmbuRoute-Emergency/1.0 (emergency-dispatch@amburoute.org)',
      },
      timeout: 5000,
    }
  );

  if (!response.data || !Array.isArray(response.data.elements)) return [];

  const driverCoords = [lng, lat];
  const items = response.data.elements
    .map((el) => {
      const hLat = el.lat || (el.center && el.center.lat);
      const hLng = el.lon || (el.center && el.center.lon);
      if (!hLat || !hLng) return null;

      const tags = el.tags || {};
      const name = tags.name || tags['name:en'] || tags['name:hi'] || 'Medical Center / Hospital';
      const distanceMeters = calculateDistanceMeters(driverCoords, [hLng, hLat]);
      if (distanceMeters > radiusMeters) return null;

      return {
        id: `osm-${el.type}-${el.id}`,
        name,
        label: name,
        shortName: tags['name:en'] || name.split('(')[0].trim(),
        coordinates: [hLng, hLat],
        distanceMeters: Math.round(distanceMeters),
        distanceKm: Number((distanceMeters / 1000).toFixed(1)),
        distanceFormatted: formatDistance(distanceMeters),
        distanceType: 'STRAIGHT_LINE',
        distanceNote: 'Straight-line distance (aerial)',
        type: tags.emergency === 'yes' ? 'EMERGENCY_HOSPITAL' : 'HOSPITAL',
        source: 'OPENSTREETMAP_OVERPASS',
      };
    })
    .filter(Boolean);

  return items;
}

/**
 * Fetch genuine, real-time nearby hospitals for the driver's origin coordinates.
 *
 * ZERO HARDCODED LOCATION RULE:
 * This service never falls back to Patna or any hardcoded hospital list.
 * If 0 hospitals exist within the requested radius, it returns count: 0 and an empty array.
 *
 * @param {number} lat - Driver origin latitude
 * @param {number} lng - Driver origin longitude
 * @param {number} radiusMeters - Search radius in meters (1000 - 50000, default 35000)
 */
export const fetchNearbyHospitals = async (lat, lng, radiusMeters = 35000) => {
  const driverCoords = [lng, lat];
  const cappedRadius = Math.min(Math.max(radiusMeters, 1000), 50000);
  const cacheKey = `${lat.toFixed(3)}:${lng.toFixed(3)}:${cappedRadius}`;

  // Check in-memory cache
  const cached = hospitalCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.result;
  }

  let hospitals = [];
  let source = 'OPENSTREETMAP_NOMINATIM';
  let attribution = 'Data © OpenStreetMap contributors, ODbL 1.0';

  // 1. Primary: OpenStreetMap Nominatim
  try {
    const rawNominatim = await queryNominatimHospitals(lat, lng, cappedRadius);
    if (rawNominatim.length > 0) {
      hospitals = rawNominatim;
      source = 'OPENSTREETMAP_NOMINATIM';
    }
  } catch (nominatimErr) {
    // Primary provider error - attempt secondary Overpass mirror
    try {
      const rawOverpass = await queryOverpassHospitals(lat, lng, cappedRadius);
      if (rawOverpass.length > 0) {
        hospitals = rawOverpass;
        source = 'OPENSTREETMAP_OVERPASS';
      }
    } catch (overpassErr) {
      // Both external live providers unreachable or network blocked
    }
  }

  // Sort strictly by ascending distance
  hospitals.sort((a, b) => a.distanceMeters - b.distanceMeters);

  // Deduplicate near duplicates
  const dedupedHospitals = deduplicateHospitals(hospitals);

  // Top 3 closest relevant results
  const threeClosestHospitals = dedupedHospitals.slice(0, 3);

  const result = {
    hospitals: dedupedHospitals.slice(0, 10),
    threeClosestHospitals,
    hasAtLeastThree: dedupedHospitals.length >= 3,
    count: dedupedHospitals.length,
    driverLocation: {
      type: 'Point',
      coordinates: driverCoords,
    },
    searchRadiusMeters: cappedRadius,
    distanceType: 'STRAIGHT_LINE',
    distanceNote: 'Straight-line distance (aerial)',
    source,
    attribution,
  };

  // Cache result for 5 minutes
  hospitalCache.set(cacheKey, { timestamp: Date.now(), result });
  return result;
};

// Export clearCache for testing purposes
export const clearHospitalCache = () => {
  hospitalCache.clear();
};

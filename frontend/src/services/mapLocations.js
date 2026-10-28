/**
 * AmbuRoute Centralized Patna Geographic Locations & Coordinates
 *
 * Source: OpenStreetMap Patna nodes & verified public transit coordinates.
 *
 * NOTE ON PRECISION:
 * Coordinates are approximate corridor centroids for demonstration and prototype targeting.
 * They represent recognized Patna arterial roadway intersections, expressway ramps,
 * and hospital emergency gates. They do NOT represent centimeter-accurate GPS surveying
 * or live routing provider telemetry.
 */

export const PATNA_MAP_CENTER = [25.6150, 85.1400]; // Patna central operations view
export const DEFAULT_MAP_ZOOM = 13;

export const PATNA_LOCATIONS = {
  // Hospital Trauma Centers
  pmch: {
    id: 'pmch',
    name: 'Patna Medical College and Hospital (PMCH), Ashok Rajpath',
    shortName: 'PMCH Emergency Trauma Center',
    category: 'hospital',
    coordinates: [25.6206, 85.1586],
    address: 'Ashok Rajpath, Patna University Campus, Patna, Bihar 800004',
    isApproximate: true,
  },
  igims: {
    id: 'igims',
    name: 'Indira Gandhi Institute of Medical Sciences (IGIMS), Patna',
    shortName: 'IGIMS Critical Care Block',
    category: 'hospital',
    coordinates: [25.6152, 85.0854],
    address: 'Bailey Road, Sheikhpura, Patna, Bihar 800014',
    isApproximate: true,
  },
  nmch: {
    id: 'nmch',
    name: 'Nalanda Medical College & Hospital (NMCH), Kankarbagh / Agamkuan',
    shortName: 'NMCH Agamkuan Emergency',
    category: 'hospital',
    coordinates: [25.5982, 85.1950],
    address: 'Agamkuan, Kankarbagh Road, Patna, Bihar 800007',
    isApproximate: true,
  },
  aiims: {
    id: 'aiims',
    name: 'AIIMS Patna, Phulwari Sharif',
    shortName: 'AIIMS Patna Trauma Center',
    category: 'hospital',
    coordinates: [25.5606, 85.0441],
    address: 'Khagaul, Phulwari Sharif, Patna, Bihar 801507',
    isApproximate: true,
  },

  // Key Patna Corridor Waypoints
  baileyRoad: {
    id: 'bailey-road',
    name: 'Bailey Road / Jawaharlal Nehru Marg',
    shortName: 'Bailey Road Corridor',
    category: 'corridor',
    coordinates: [25.6092, 85.1228],
    description: 'Major east-west arterial spine connecting western Patna to Dak Bungalow',
    isApproximate: true,
  },
  boringRoadTurnoff: {
    id: 'boring-road-turnoff',
    name: 'Boring Road Turnoff',
    shortName: 'Boring Road Junction',
    category: 'corridor',
    coordinates: [25.6160, 85.1130],
    description: 'Atal Path entry interchange near Boring Road roundabout',
    isApproximate: true,
  },
  dakBungalow: {
    id: 'dak-bungalow',
    name: 'Dak Bungalow — Fraser Road Crossing',
    shortName: 'Dak Bungalow Crossing',
    category: 'corridor',
    coordinates: [25.6080, 85.1378],
    description: 'High-density commercial junction connecting Fraser Road, Exhibition Road & Bailey Road',
    isApproximate: true,
  },
  gandhiMaidan: {
    id: 'gandhi-maidan',
    name: 'Gandhi Maidan South Corridor',
    shortName: 'Gandhi Maidan Transit Ring',
    category: 'corridor',
    coordinates: [25.6180, 85.1450],
    description: 'Major transit hub surrounding central historic Maidan towards Ashok Rajpath',
    isApproximate: true,
  },
  ashokRajpath: {
    id: 'ashok-rajpath',
    name: 'Ashok Rajpath East',
    shortName: 'Ashok Rajpath Corridor',
    category: 'corridor',
    coordinates: [25.6204, 85.1520],
    description: 'Dense historical arterial route running parallel to Ganga river leading to PMCH',
    isApproximate: true,
  },
  atalPath: {
    id: 'atal-path',
    name: 'Atal Path Express Corridor',
    shortName: 'Atal Path 6-Lane Expressway',
    category: 'bypass',
    coordinates: [25.6320, 85.1050],
    description: 'Grade-separated elevated 6-lane express corridor connecting R-Block to Digha',
    isApproximate: true,
  },
  jpGangaPath: {
    id: 'jp-ganga-path',
    name: 'JP Ganga Path (Marine Drive)',
    shortName: 'JP Ganga Path Expressway',
    category: 'bypass',
    coordinates: [25.6360, 85.1380],
    description: 'High-speed 4-lane riverfront marine expressway along the southern bank of Ganga',
    isApproximate: true,
  },
  pmchGangaRamp: {
    id: 'pmch-ganga-ramp',
    name: 'PMCH Dedicated Ganga Path Ramp',
    shortName: 'Ganga Path PMCH Ramp',
    category: 'bypass',
    coordinates: [25.6240, 85.1575],
    description: 'Dedicated direct elevated flyover ramp from Ganga Path directly into PMCH Trauma Center',
    isApproximate: true,
  },
  kankarbaghMainRoad: {
    id: 'kankarbagh-main-road',
    name: 'Kankarbagh Main Road',
    shortName: 'Kankarbagh Corridor',
    category: 'corridor',
    coordinates: [25.5960, 85.1510],
    description: 'Major southern residential and commercial arterial avenue',
    isApproximate: true,
  },
};

/**
 * Waypoint coordinate mapping helper
 * Resolves road names from mockData segments to [lat, lng]
 */
export function getCoordinatesForRoad(roadName) {
  if (!roadName) return PATNA_LOCATIONS.pmch.coordinates;
  const name = roadName.toLowerCase();

  if (name.includes('bailey')) return PATNA_LOCATIONS.baileyRoad.coordinates;
  if (name.includes('boring')) return PATNA_LOCATIONS.boringRoadTurnoff.coordinates;
  if (name.includes('dak bungalow') || name.includes('fraser')) return PATNA_LOCATIONS.dakBungalow.coordinates;
  if (name.includes('gandhi maidan')) return PATNA_LOCATIONS.gandhiMaidan.coordinates;
  if (name.includes('ashok rajpath') && !name.includes('pmch')) return PATNA_LOCATIONS.ashokRajpath.coordinates;
  if (name.includes('atal path')) return PATNA_LOCATIONS.atalPath.coordinates;
  if (name.includes('jp ganga path') || name.includes('marine drive')) return PATNA_LOCATIONS.jpGangaPath.coordinates;
  if (name.includes('ganga path ramp') || (name.includes('ramp') && name.includes('pmch'))) return PATNA_LOCATIONS.pmchGangaRamp.coordinates;
  if (name.includes('pmch')) return PATNA_LOCATIONS.pmch.coordinates;
  if (name.includes('igims')) return PATNA_LOCATIONS.igims.coordinates;
  if (name.includes('nmch')) return PATNA_LOCATIONS.nmch.coordinates;
  if (name.includes('aiims')) return PATNA_LOCATIONS.aiims.coordinates;
  if (name.includes('kankarbagh')) return PATNA_LOCATIONS.kankarbaghMainRoad.coordinates;

  return PATNA_LOCATIONS.dakBungalow.coordinates;
}

/**
 * Illustrative Route Path Coordinates (Prototype polyline sequences)
 */
export const PRIMARY_ROUTE_COORDINATES = [
  PATNA_LOCATIONS.baileyRoad.coordinates,
  PATNA_LOCATIONS.dakBungalow.coordinates,
  PATNA_LOCATIONS.gandhiMaidan.coordinates,
  PATNA_LOCATIONS.ashokRajpath.coordinates,
  PATNA_LOCATIONS.pmch.coordinates,
];

export const ALTERNATIVE_ROUTE_COORDINATES = [
  PATNA_LOCATIONS.baileyRoad.coordinates,
  PATNA_LOCATIONS.boringRoadTurnoff.coordinates,
  PATNA_LOCATIONS.atalPath.coordinates,
  PATNA_LOCATIONS.jpGangaPath.coordinates,
  PATNA_LOCATIONS.pmchGangaRamp.coordinates,
  PATNA_LOCATIONS.pmch.coordinates,
];

/**
 * Haversine formula to compute great-circle distance between two [lat, lng] points in meters.
 * Used for comparing device GPS coordinates to approximate Patna road corridor centroids.
 */
export function calculateDistanceMeters(coord1, coord2) {
  if (!coord1 || !coord2) return null;
  const [lat1, lon1] = coord1;
  const [lat2, lon2] = coord2;
  const R = 6371e3; // Earth radius in meters
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
  Circle,
  useMap,
} from 'react-leaflet';
import { useSimulation } from '../../context/useSimulation.js';
import { Badge } from '../common/Badge.jsx';
import {
  PATNA_MAP_CENTER,
  DEFAULT_MAP_ZOOM,
  PATNA_LOCATIONS,
  getCoordinatesForRoad,
  PRIMARY_ROUTE_COORDINATES,
  ALTERNATIVE_ROUTE_COORDINATES,
} from '../../services/mapLocations.js';

// Fix Leaflet default marker asset paths in Vite if standard markers are ever initialized
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: null,
  iconUrl: null,
  shadowUrl: null,
});

/**
 * Custom Leaflet divIcons matching AmbuRoute's Signal & Motion visual system
 */
const createAmbulanceIcon = (callSign, vehicleNumber) =>
  L.divIcon({
    className: 'leaflet-amb-icon-wrap',
    html: `
      <div class="custom-amb-beacon">
        <div class="amb-beacon-pulse"></div>
        <div class="amb-beacon-body">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M10 10h4" />
            <path d="M12 8v4" />
            <rect width="16" height="12" x="2" y="6" rx="2" />
            <circle cx="7" cy="18" r="2" />
            <circle cx="17" cy="18" r="2" />
          </svg>
        </div>
        <div class="amb-beacon-label">${vehicleNumber || callSign || 'AMB 108'}</div>
      </div>
    `,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
    popupAnchor: [0, -22],
  });

const createHospitalIcon = (shortName) =>
  L.divIcon({
    className: 'leaflet-hospital-icon-wrap',
    html: `
      <div class="custom-hospital-marker">
        <div class="hospital-marker-pin">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </div>
        <div class="hospital-marker-tag">${shortName || 'TRAUMA BASE'}</div>
      </div>
    `,
    iconSize: [42, 42],
    iconAnchor: [21, 38],
    popupAnchor: [0, -38],
  });

const createIncidentIcon = (reportType, isSelected) => {
  let bgColor = '#EF4444';
  let symbol = '!';
  let label = 'BLOCKED';

  if (reportType === 'TRAFFIC_HIGH') {
    bgColor = '#F59E0B';
    symbol = '▲';
    label = 'CONGESTED';
  } else if (reportType === 'CLEAR') {
    bgColor = '#10B981';
    symbol = '✓';
    label = 'CLEAR';
  } else if (reportType === 'CANNOT_ASSESS') {
    bgColor = '#64748B';
    symbol = '?';
    label = 'UNKNOWN';
  }

  return L.divIcon({
    className: 'leaflet-incident-icon-wrap',
    html: `
      <div class="custom-incident-marker ${isSelected ? 'is-selected' : ''}" style="background-color: ${bgColor};" title="${label}">
        <span class="incident-symbol">${symbol}</span>
      </div>
    `,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    popupAnchor: [0, -13],
  });
};

const createUserLocationIcon = () =>
  L.divIcon({
    className: 'leaflet-user-icon-wrap',
    html: `
      <div class="custom-user-marker">
        <div class="user-pulse-dot"></div>
        <div class="user-location-tag">YOU ARE HERE</div>
      </div>
    `,
    iconSize: [92, 26],
    iconAnchor: [46, 13],
    popupAnchor: [0, -13],
  });

const createGpsUserLocationIcon = (accuracy) =>
  L.divIcon({
    className: 'leaflet-gps-icon-wrap',
    html: `
      <div class="custom-gps-marker">
        <div class="gps-pulse-ring"></div>
        <div class="gps-dot">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M12 2v3m0 14v3M2 12h3m14 0h3" />
          </svg>
        </div>
        <div class="gps-tag">GPS ±${accuracy || 15}m</div>
      </div>
    `,
    iconSize: [96, 28],
    iconAnchor: [48, 14],
    popupAnchor: [0, -14],
  });

const createWaypointIcon = (label) =>
  L.divIcon({
    className: 'leaflet-wp-icon-wrap',
    html: `<div class="custom-waypoint-dot" title="${label}"></div>`,
    iconSize: [12, 12],
    iconAnchor: [6, 6],
  });

/**
 * Internal Map Controller for Programmatic Pan, Zoom, Recenter, and Viewport Resize
 */
function MapController({ center, zoom, shouldRecenter, onRecentered }) {
  const map = useMap();

  // Invalidate map size on window resize or initial render to prevent gray/unrendered tiles
  useEffect(() => {
    const handleResize = () => {
      map.invalidateSize();
    };

    window.addEventListener('resize', handleResize);
    // Timeout to ensure DOM container transitions/layouts have finished
    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 250);

    return () => {
      window.removeEventListener('resize', handleResize);
      clearTimeout(timer);
    };
  }, [map]);

  useEffect(() => {
    if (shouldRecenter && center) {
      map.setView(center, zoom || 14, { animate: true });
      if (onRecentered) onRecentered();
    }
  }, [center, zoom, shouldRecenter, map, onRecentered]);

  return null;
}

/**
 * Main SimulationMap with Real Leaflet & OpenStreetMap Tiles
 */
export function SimulationMap({ className = '', onSelectIncident }) {
  const {
    currentRoute,
    currentSegmentIdx,
    tripStatus,
    activeRecommendation,
    userCurrentRoad,
    userGpsLocation,
    advanceSegment,
    trafficReports,
    selectedIncident,
    setSelectedIncident,
    selectedVehicle,
    selectedDestination,
  } = useSimulation();

  const isTripActive = tripStatus === 'ACTIVE';

  // Tile status state (handles offline / sandbox tile availability gracefully)
  const [tileError, setTileError] = useState(false);
  const [shouldRecenter, setShouldRecenter] = useState(false);

  // Active ambulance segment coordinate
  const currentSeg = currentRoute.segments[currentSegmentIdx] || currentRoute.segments[0];
  const ambulanceCoordinates = useMemo(() => {
    return getCoordinatesForRoad(currentSeg.roadName);
  }, [currentSeg.roadName]);

  // Destination coordinates
  const destinationCoordinates = useMemo(() => {
    return getCoordinatesForRoad(selectedDestination.shortName || selectedDestination.name);
  }, [selectedDestination]);

  // User simulated road coordinates
  const userCoordinates = useMemo(() => {
    return getCoordinatesForRoad(userCurrentRoad);
  }, [userCurrentRoad]);

  // Recenter handler
  const handleRecenter = useCallback(() => {
    setShouldRecenter(true);
  }, []);

  // Incident selection handler
  const handleMarkerIncidentClick = useCallback(
    (report) => {
      setSelectedIncident(report);
      if (onSelectIncident) onSelectIncident(report);
    },
    [setSelectedIncident, onSelectIncident]
  );

  return (
    <div className={`simulation-map-container ${className}`}>
      {/* Map Header & Controls Ribbon */}
      <div className="simulation-map-header">
        <div className="simulation-map-title-group">
          <div className="simulation-map-dot-pulse" />
          <div>
            <div className="simulation-map-title">PATNA REAL GEOGRAPHIC CORRIDOR MAP</div>
            <div className="simulation-map-subtitle">
              LEAFLET · OPENSTREETMAP TILES · 500M PROXIMITY ENVELOPE
            </div>
          </div>
        </div>

        <div className="simulation-map-controls">
          {/* Recenter Action Button */}
          <button
            type="button"
            className="map-recenter-btn"
            onClick={handleRecenter}
            title="Recenter map on active ambulance position"
          >
            Recenter on Ambulance
          </button>

          <Badge variant={isTripActive ? 'critical' : 'neutral'} size="sm">
            {isTripActive
              ? `MISSION ACTIVE: SEGMENT ${currentSegmentIdx + 1}/${currentRoute.segments.length}`
              : 'FLEET STANDBY'}
          </Badge>

          {isTripActive && (
            <button
              type="button"
              className="map-stepper-btn"
              onClick={advanceSegment}
              title="Advance simulated ambulance to the next corridor waypoint"
            >
              Advance GPS Checkpoint &rarr;
            </button>
          )}
        </div>
      </div>

      {/* Offline / Tile Notice if network blocks tiles */}
      {tileError && (
        <div className="map-tile-notice" role="status">
          <span>* OpenStreetMap tiles require internet access. Basemap tiles are currently offline; corridor geometry, ambulance beacon, and incident markers remain fully active.</span>
        </div>
      )}

      {/* Leaflet MapContainer */}
      <div className="simulation-map-leaflet-wrapper">
        <MapContainer
          center={PATNA_MAP_CENTER}
          zoom={DEFAULT_MAP_ZOOM}
          scrollWheelZoom={true}
          className="leaflet-map-root"
          attributionControl={true}
        >
          {/* OpenStreetMap Tile Layer */}
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors'
            maxZoom={19}
            eventHandlers={{
              tileerror: () => setTileError(true),
            }}
          />

          {/* Programmatic View Controller */}
          <MapController
            center={ambulanceCoordinates}
            zoom={14}
            shouldRecenter={shouldRecenter}
            onRecentered={() => setShouldRecenter(false)}
          />

          {/* Primary Route Polyline (Illustrative prototype path between Patna corridor nodes) */}
          <Polyline
            positions={PRIMARY_ROUTE_COORDINATES}
            pathOptions={{
              color: currentRoute.id === 'route-primary' ? '#F59E0B' : 'rgba(148, 163, 184, 0.4)',
              weight: 5,
              opacity: 0.9,
              lineCap: 'round',
              lineJoin: 'round',
            }}
          />

          {/* Alternative Detour Polyline (via Atal Path & JP Ganga Path Expressway) */}
          <Polyline
            positions={ALTERNATIVE_ROUTE_COORDINATES}
            pathOptions={{
              color: activeRecommendation ? '#10B981' : 'rgba(148, 163, 184, 0.3)',
              weight: activeRecommendation ? 4 : 2,
              dashArray: activeRecommendation ? '8, 6' : '4, 4',
              opacity: 0.85,
            }}
          />

          {/* 500-Meter Proximity Alert Envelope around ambulance when active */}
          {isTripActive && (
            <Circle
              center={ambulanceCoordinates}
              radius={500}
              pathOptions={{
                color: '#EF4444',
                fillColor: '#EF4444',
                fillOpacity: 0.16,
                weight: 1.8,
                dashArray: '5, 5',
              }}
            >
              <Popup className="custom-leaflet-popup">
                <div className="popup-inner">
                  <div className="popup-header-tag text-red">500M PROXIMITY BUFFER</div>
                  <div className="popup-title">Active Alert Targeting Envelope</div>
                  <div className="popup-body">
                    Road users located on upcoming road segments within this 500m zone receive yielding notices.
                  </div>
                </div>
              </Popup>
            </Circle>
          )}

          {/* Key Patna Corridor Waypoints */}
          {Object.values(PATNA_LOCATIONS).map((loc) => {
            if (loc.category === 'hospital') return null; // rendered separately

            return (
              <Marker
                key={loc.id}
                position={loc.coordinates}
                icon={createWaypointIcon(loc.name)}
              >
                <Popup className="custom-leaflet-popup">
                  <div className="popup-inner">
                    <div className="popup-header-tag">PATNA CORRIDOR NODE</div>
                    <div className="popup-title">{loc.name}</div>
                    <div className="popup-body">{loc.description}</div>
                    <div className="popup-coords text-muted">
                      Approx: {loc.coordinates[0].toFixed(4)}° N, {loc.coordinates[1].toFixed(4)}° E
                    </div>
                  </div>
                </Popup>
              </Marker>
            );
          })}

          {/* Destination Hospital Marker */}
          <Marker
            position={destinationCoordinates}
            icon={createHospitalIcon(selectedDestination.shortName || selectedDestination.name)}
          >
            <Popup className="custom-leaflet-popup">
              <div className="popup-inner">
                <div className="popup-header-tag text-red">EMERGENCY DESTINATION</div>
                <div className="popup-title">{selectedDestination.name}</div>
                <div className="popup-body">
                  Target Trauma Center · Distance: {selectedDestination.distanceKm} km (~{selectedDestination.baseEtaMins} min base travel)
                </div>
              </div>
            </Popup>
          </Marker>

          {/* Detected Device GPS Location Marker & Accuracy Circle (When captured) */}
          {userGpsLocation?.status === 'SUCCESS' && userGpsLocation.lat && userGpsLocation.lng ? (
            <>
              <Circle
                center={[userGpsLocation.lat, userGpsLocation.lng]}
                radius={userGpsLocation.accuracy || 25}
                pathOptions={{
                  color: '#0F766E',
                  fillColor: '#0F766E',
                  fillOpacity: 0.12,
                  weight: 1.5,
                  dashArray: '4, 4',
                }}
              />
              <Marker
                position={[userGpsLocation.lat, userGpsLocation.lng]}
                icon={createGpsUserLocationIcon(userGpsLocation.accuracy)}
              >
                <Popup className="custom-leaflet-popup">
                  <div className="popup-inner">
                    <div className="popup-header-tag text-teal">DETECTED DEVICE GPS</div>
                    <div className="popup-title">
                      {userGpsLocation.lat.toFixed(5)}° N, {userGpsLocation.lng.toFixed(5)}° E
                    </div>
                    <div className="popup-body">
                      Accuracy: ±{userGpsLocation.accuracy}m<br />
                      Captured at {new Date(userGpsLocation.timestamp).toLocaleTimeString()}<br />
                      <span className="text-muted" style={{ fontSize: '0.74rem' }}>
                        Device Geolocation from browser API. Used for report proximity review.
                      </span>
                    </div>
                  </div>
                </Popup>
              </Marker>
            </>
          ) : (
            /* Participating Road User Simulated Location Marker (Fallback) */
            <Marker position={userCoordinates} icon={createUserLocationIcon()}>
              <Popup className="custom-leaflet-popup">
                <div className="popup-inner">
                  <div className="popup-header-tag text-amber">SIMULATED CITIZEN POSITION</div>
                  <div className="popup-title">{userCurrentRoad}</div>
                  <div className="popup-body">
                    Your device is registered for route-aware corridor alerts in this Patna sector.
                  </div>
                </div>
              </Popup>
            </Marker>
          )}

          {/* Traffic Hazard / Community Incident Markers */}
          {trafficReports.map((report) => {
            const coords = getCoordinatesForRoad(report.roadSegment);
            const isSelected = selectedIncident && selectedIncident.id === report.id;

            return (
              <Marker
                key={report.id}
                position={coords}
                icon={createIncidentIcon(report.reportType, isSelected)}
                eventHandlers={{
                  click: () => handleMarkerIncidentClick(report),
                }}
              >
                <Popup className="custom-leaflet-popup">
                  <div className="popup-inner">
                    <div className="popup-header-tag">
                      OBSERVATION: <span className="font-bold">{report.reportType}</span>
                    </div>
                    <div className="popup-title">{report.roadSegment}</div>
                    <div className="popup-body">{report.locationDescription}</div>
                    <div className="popup-meta-row">
                      <span>Source: {report.source}</span> · 
                      <span> {report.verifiedCount} confirmations</span>
                    </div>
                  </div>
                </Popup>
              </Marker>
            );
          })}

          {/* Active Ambulance Marker */}
          {isTripActive && (
            <Marker
              position={ambulanceCoordinates}
              icon={createAmbulanceIcon(selectedVehicle.callSign, selectedVehicle.vehicleNumber)}
              zIndexOffset={1000}
            >
              <Popup className="custom-leaflet-popup">
                <div className="popup-inner">
                  <div className="popup-header-tag text-red">ACTIVE EMERGENCY VEHICLE</div>
                  <div className="popup-title">{selectedVehicle.callSign}</div>
                  <div className="popup-body">
                    Vehicle: <strong>{selectedVehicle.vehicleNumber}</strong><br />
                    En Route to: <strong>{selectedDestination.shortName || selectedDestination.name}</strong><br />
                    Current Corridor: <strong>{currentSeg.roadName}</strong>
                  </div>
                </div>
              </Popup>
            </Marker>
          )}
        </MapContainer>
      </div>

      {/* Selected Incident Inspector Drawer Bar */}
      {selectedIncident && (
        <div className="simulation-map-incident-bar">
          <div className="incident-bar-text">
            <span className="incident-bar-road">[{selectedIncident.roadSegment}]</span>{' '}
            <span className="incident-bar-desc">{selectedIncident.locationDescription}</span>
          </div>
          <div className="incident-bar-meta">
            <Badge
              variant={
                selectedIncident.reportType === 'ROAD_BLOCKED'
                  ? 'critical'
                  : selectedIncident.reportType === 'TRAFFIC_HIGH'
                  ? 'warning'
                  : selectedIncident.reportType === 'CLEAR'
                  ? 'clear'
                  : 'neutral'
              }
              size="sm"
            >
              {selectedIncident.reportType}
            </Badge>
            <span className="incident-bar-freshness">{selectedIncident.verifiedCount} observations</span>
          </div>
        </div>
      )}

      {/* Map Legend & Prototype Note */}
      <div className="simulation-map-legend">
        <div className="legend-items-row">
          <div className="legend-item">
            <span className="legend-swatch legend-swatch--primary" />
            <span>Active Corridor (Bailey & Fraser Rd)</span>
          </div>
          <div className="legend-item">
            <span className="legend-swatch legend-swatch--alt" />
            <span>Bypass Corridor (Atal Path & Ganga Path)</span>
          </div>
          <div className="legend-item">
            <span className="legend-swatch legend-swatch--blocked" />
            <span>Reported Hazard</span>
          </div>
          <div className="legend-item">
            <span className="legend-swatch legend-swatch--destination" />
            <span>PMCH Trauma Base</span>
          </div>
          <div className="legend-item">
            <span className="legend-swatch legend-swatch--radius" />
            <span>500m Target Buffer</span>
          </div>
        </div>

        <div className="legend-attribution">
          OpenStreetMap Basemap Tiles · Patna Prototype Transit Network · Illustrative Route Geometry
        </div>
      </div>
    </div>
  );
}

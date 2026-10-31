import React, { useState, useEffect, memo } from 'react';
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
import {
  PRIMARY_ROUTE_COORDINATES,
  ALTERNATIVE_ROUTE_COORDINATES,
  PATNA_LOCATIONS,
} from '../../services/mapLocations.js';
import {
  RouteIcon,
  AlertTriangleIcon,
  SparklesIcon,
} from '../common/Icons.jsx';

// Fix Leaflet default marker asset paths in Vite
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: null,
  iconUrl: null,
  shadowUrl: null,
});

// Fixed coordinate constants outside component to guarantee stable references
const OVERVIEW_MAP_CENTER = [25.6200, 85.1320];
const OVERVIEW_MAP_ZOOM = 13;

// Custom icons for the overview map
const ambulanceOriginIcon = L.divIcon({
  className: 'overview-map-amb-icon',
  html: `
    <div class="overview-amb-beacon">
      <div class="beacon-pulse-ring"></div>
      <div class="beacon-body">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M10 10h4" />
          <path d="M12 8v4" />
          <rect width="16" height="12" x="2" y="6" rx="2" />
          <circle cx="7" cy="18" r="2" />
          <circle cx="17" cy="18" r="2" />
        </svg>
      </div>
      <div class="beacon-label">AMB 108 (ORIGIN)</div>
    </div>
  `,
  iconSize: [46, 46],
  iconAnchor: [23, 23],
  popupAnchor: [0, -22],
});

const hospitalDestIcon = L.divIcon({
  className: 'overview-map-hosp-icon',
  html: `
    <div class="overview-hosp-pin">
      <div class="hosp-pin-badge">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </div>
      <div class="hosp-pin-label">PMCH TRAUMA BASE</div>
    </div>
  `,
  iconSize: [44, 44],
  iconAnchor: [22, 38],
  popupAnchor: [0, -38],
});

const hazardMarkerIcon = (label, color = '#EF4444', iconText = '!') =>
  L.divIcon({
    className: 'overview-map-hazard-icon',
    html: `
      <div class="overview-hazard-badge" style="background-color: ${color};">
        <span>${iconText}</span>
      </div>
    `,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    popupAnchor: [0, -13],
  });

/**
 * MapInitController: Invalidate size safely once on mount after container layout finishes
 */
function MapInitController() {
  const map = useMap();
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        if (map && typeof map.invalidateSize === 'function') {
          map.invalidateSize();
        }
      } catch (err) {
        // Safe catch if unmounted during animation
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [map]);
  return null;
}

function OverviewRouteMapComponent() {
  const [selectedRoute, setSelectedRoute] = useState('recommended'); // 'recommended' | 'congested' | 'both'
  const [tileError, setTileError] = useState(false);

  return (
    <div className="overview-route-map-card">
      <div className="overview-route-map-toolbar">
        <div className="route-map-toolbar-left">
          <div className="live-status-dot" />
          <div>
            <h4 className="route-map-title">Patna Emergency Corridor: AI Alternative Comparison</h4>
            <p className="route-map-subtitle">
              Live Map: Bailey Road &rarr; PMCH Trauma Center (Leaflet & OpenStreetMap)
            </p>
          </div>
        </div>

        <div className="route-map-toolbar-right">
          <div className="route-toggle-group" role="tablist" aria-label="Route Selection">
            <button
              type="button"
              className={`route-toggle-btn ${selectedRoute === 'recommended' ? 'is-active-recommended' : ''}`}
              onClick={() => setSelectedRoute('recommended')}
            >
              <SparklesIcon size={14} className="text-mint" />
              <span>AI Detour (14 min)</span>
            </button>
            <button
              type="button"
              className={`route-toggle-btn ${selectedRoute === 'congested' ? 'is-active-congested' : ''}`}
              onClick={() => setSelectedRoute('congested')}
            >
              <AlertTriangleIcon size={14} className="text-red" />
              <span>Congested Route (26 min)</span>
            </button>
            <button
              type="button"
              className={`route-toggle-btn ${selectedRoute === 'both' ? 'is-active' : ''}`}
              onClick={() => setSelectedRoute('both')}
            >
              <RouteIcon size={14} />
              <span>Compare Both</span>
            </button>
          </div>
        </div>
      </div>

      {tileError && (
        <div className="overview-map-offline-banner">
          <span>* Basemap tiles are in offline fallback mode. Route polylines and incident markers remain interactive.</span>
        </div>
      )}

      <div className="overview-map-canvas-wrap">
        <MapContainer
          center={OVERVIEW_MAP_CENTER}
          zoom={OVERVIEW_MAP_ZOOM}
          scrollWheelZoom={false}
          className="overview-leaflet-container"
          attributionControl={true}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>'
            maxZoom={19}
            eventHandlers={{
              tileerror: () => setTileError(true),
            }}
          />
          <MapInitController />

          {/* AI Recommended Route Polyline (Emerald Green) */}
          {(selectedRoute === 'recommended' || selectedRoute === 'both') && (
            <Polyline
              positions={ALTERNATIVE_ROUTE_COORDINATES}
              pathOptions={{
                color: '#10B981',
                weight: 6,
                opacity: 0.95,
                lineCap: 'round',
                lineJoin: 'round',
              }}
            >
              <Popup>
                <div className="overview-popup-content">
                  <div className="popup-tag text-mint">AI RECOMMENDED DETOUR</div>
                  <strong>Via Atal Path 6-Lane & JP Ganga Marine Drive</strong>
                  <p>Distance: 6.8 km · ETA: 14 min · Free Flowing Corridor</p>
                  <p className="text-muted">Avoids central Dak Bungalow congestion (-8 min time saved).</p>
                </div>
              </Popup>
            </Polyline>
          )}

          {/* Congested Route Polyline (Critical Red with Dashed Pattern) */}
          {(selectedRoute === 'congested' || selectedRoute === 'both') && (
            <Polyline
              positions={PRIMARY_ROUTE_COORDINATES}
              pathOptions={{
                color: '#EF4444',
                weight: selectedRoute === 'both' ? 4 : 5,
                opacity: selectedRoute === 'both' ? 0.75 : 0.9,
                dashArray: '8, 6',
                lineCap: 'round',
              }}
            >
              <Popup>
                <div className="overview-popup-content">
                  <div className="popup-tag text-red">CONGESTED ARTERIAL ROUTE</div>
                  <strong>Via Bailey Road & Fraser Road Crossing</strong>
                  <p>Distance: 5.4 km · ETA: 26 min · Severe Bottleneck</p>
                  <p className="text-muted">3 community reports: Heavy commercial traffic & construction.</p>
                </div>
              </Popup>
            </Polyline>
          )}

          {/* Ambulance Origin Marker */}
          <Marker position={PATNA_LOCATIONS.baileyRoad.coordinates} icon={ambulanceOriginIcon}>
            <Popup>
              <div className="overview-popup-content">
                <div className="popup-tag text-red">AMBULANCE DISPATCH POINT</div>
                <strong>Emergency Vehicle 108</strong>
                <p>Location: Bailey Road Corridor Junction</p>
              </div>
            </Popup>
          </Marker>

          {/* 500m Safety Envelope Circle */}
          <Circle
            center={PATNA_LOCATIONS.baileyRoad.coordinates}
            radius={500}
            pathOptions={{
              color: '#EF4444',
              fillColor: '#EF4444',
              fillOpacity: 0.12,
              weight: 1.5,
              dashArray: '4, 4',
            }}
          />

          {/* Destination Hospital Marker */}
          <Marker position={PATNA_LOCATIONS.pmch.coordinates} icon={hospitalDestIcon}>
            <Popup>
              <div className="overview-popup-content">
                <div className="popup-tag text-red">PRIMARY DESTINATION</div>
                <strong>PMCH Emergency Trauma Center</strong>
                <p>Ashok Rajpath, Patna University Campus</p>
                <p className="text-mint font-semibold">Dedicated Ganga Path Elevated Ramp Access Available</p>
              </div>
            </Popup>
          </Marker>

          {/* Traffic Hazard 1: Dak Bungalow Crossing */}
          <Marker
            position={PATNA_LOCATIONS.dakBungalow.coordinates}
            icon={hazardMarkerIcon('Dak Bungalow Congestion', '#F59E0B', '▲')}
          >
            <Popup>
              <div className="overview-popup-content">
                <div className="popup-tag text-amber">COMMUNITY TRAFFIC REPORT</div>
                <strong>Dak Bungalow Crossing: High Congestion</strong>
                <p>Commercial traffic jam & slow transit. 3 citizen confirmations.</p>
              </div>
            </Popup>
          </Marker>

          {/* Traffic Hazard 2: Fraser Road Stoppage */}
          <Marker
            position={[25.6120, 85.1410]}
            icon={hazardMarkerIcon('Road Blockage', '#EF4444', '!')}
          >
            <Popup>
              <div className="overview-popup-content">
                <div className="popup-tag text-red">ROAD HAZARD DETECTED</div>
                <strong>Fraser Road: Stoppage & Construction</strong>
                <p>Estimated 12-minute delay. AI evaluated and flagged for avoidance.</p>
              </div>
            </Popup>
          </Marker>

          {/* Express Corridor Clear Observation: Atal Path */}
          <Marker
            position={PATNA_LOCATIONS.atalPath.coordinates}
            icon={hazardMarkerIcon('Expressway Clear', '#10B981', '✓')}
          >
            <Popup>
              <div className="overview-popup-content">
                <div className="popup-tag text-mint">EXPRESSWAY CLEAR</div>
                <strong>Atal Path 6-Lane Expressway</strong>
                <p>Free flowing transit · Speed advisory: 60-70 km/h safe passage.</p>
              </div>
            </Popup>
          </Marker>
        </MapContainer>

        {/* Floating Route Metric Badges on Map */}
        <div className="overview-map-overlay-card">
          <div className="overlay-metric-group">
            <div className="metric-badge-item">
              <span className="metric-dot metric-dot--mint" />
              <div className="metric-details">
                <span className="metric-name">AI Detour (Atal Path)</span>
                <span className="metric-stat text-mint">14 min · 6.8 km</span>
              </div>
            </div>
            <div className="metric-divider" />
            <div className="metric-badge-item">
              <span className="metric-dot metric-dot--red" />
              <div className="metric-details">
                <span className="metric-name">Bailey Rd (Congested)</span>
                <span className="metric-stat text-red">26 min · 5.4 km (+12m)</span>
              </div>
            </div>
          </div>
          <div className="overlay-time-saved">
            <SparklesIcon size={14} className="text-mint" />
            <span>AI Detour saves <strong>~8-12 minutes</strong> for patient care</span>
          </div>
        </div>
      </div>

      {/* Map Legend */}
      <div className="overview-route-map-legend">
        <div className="legend-chip">
          <span className="legend-line legend-line--mint" />
          <span>AI Detour (Expressway)</span>
        </div>
        <div className="legend-chip">
          <span className="legend-line legend-line--red" />
          <span>Congested Arterial Route</span>
        </div>
        <div className="legend-chip">
          <span className="legend-marker-dot legend-marker-dot--hazard" />
          <span>Traffic Hazard (Community Reported)</span>
        </div>
        <div className="legend-chip">
          <span className="legend-marker-dot legend-marker-dot--clear" />
          <span>Clear Road Observation</span>
        </div>
        <div className="legend-chip">
          <span className="legend-circle-outline" />
          <span>500m Safety Alert Buffer</span>
        </div>
      </div>
    </div>
  );
}

export const OverviewRouteMap = memo(OverviewRouteMapComponent);

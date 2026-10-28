import React from 'react';
import { useSimulation } from '../../context/useSimulation.js';
import { AmbulanceIcon, AlertTriangleIcon, CheckCircleIcon, OctagonAlertIcon, HelpCircleIcon } from '../common/Icons.jsx';
import { Badge } from '../common/Badge.jsx';

/**
 * SimulationMap: Geographic Route & Incident Management Map
 *
 * Grounded in Patna, Bihar corridor geography:
 * - Ganga Riverfront Expressway (JP Ganga Path / Marine Drive)
 * - Atal Path 6-Lane Elevated Express Corridor
 * - Central Arterial Corridor (Bailey Road / Fraser Road / Ashok Rajpath)
 * - PMCH Emergency Trauma Center Base
 *
 * Features:
 * - Interactive Zoom & Recenter controls (+, -, reset)
 * - Selectable Incident & Obstruction Markers
 * - 500m Targeted Proximity Alert Envelope
 * - Clean anti-collision waypoint labels
 * - Authentic attribution banner
 */
export function SimulationMap({ className = '', onSelectIncident }) {
  const {
    currentRoute,
    currentSegmentIdx,
    tripStatus,
    activeRecommendation,
    userCurrentRoad,
    advanceSegment,
    trafficReports,
    selectedIncident,
    setSelectedIncident,
    mapZoom,
    zoomIn,
    zoomOut,
    resetZoom,
  } = useSimulation();

  const isTripActive = tripStatus === 'ACTIVE';

  // Grounded Patna network nodes
  const waypoints = [
    {
      id: 'Bailey Road / Jawaharlal Nehru Marg',
      x: 110,
      y: 280,
      label: 'Bailey Road',
      sublabel: 'J.N. Marg Corridor',
      labelOffset: { x: 0, y: 34 },
    },
    {
      id: 'Dak Bungalow — Fraser Road Crossing',
      x: 300,
      y: 280,
      label: 'Dak Bungalow Crossing',
      sublabel: 'Fraser Road Intersection',
      labelOffset: { x: 0, y: 34 },
    },
    {
      id: 'Gandhi Maidan South Corridor',
      x: 490,
      y: 280,
      label: 'Gandhi Maidan',
      sublabel: 'South Transit Ring',
      labelOffset: { x: 0, y: 34 },
    },
    {
      id: 'Ashok Rajpath East',
      x: 650,
      y: 280,
      label: 'Ashok Rajpath',
      sublabel: 'East Corridor',
      labelOffset: { x: 0, y: 34 },
    },
    {
      id: 'PMCH Emergency Trauma Gate',
      x: 810,
      y: 280,
      label: 'PMCH Emergency Gate',
      sublabel: 'Trauma Center Base',
      isDestination: true,
      labelOffset: { x: -10, y: 36 },
    },
    // Bypass nodes (North Riverfront Network)
    {
      id: 'Boring Road Turnoff',
      x: 190,
      y: 280,
      label: 'Boring Rd Turnoff',
      sublabel: 'Atal Path Junction',
      labelOffset: { x: 0, y: -24 },
    },
    {
      id: 'Atal Path Express Corridor',
      x: 280,
      y: 110,
      label: 'Atal Path Expressway',
      sublabel: '6-Lane Elevated Corridor',
      labelOffset: { x: 0, y: -24 },
    },
    {
      id: 'JP Ganga Path (Marine Drive)',
      x: 550,
      y: 110,
      label: 'JP Ganga Path',
      sublabel: 'Riverfront Marine Drive',
      labelOffset: { x: 0, y: -24 },
    },
    {
      id: 'PMCH Dedicated Ganga Path Ramp',
      x: 780,
      y: 175,
      label: 'Ganga Path PMCH Ramp',
      sublabel: 'Direct Trauma Access',
      labelOffset: { x: 0, y: -24 },
    },
  ];

  // Active ambulance segment waypoint
  const currentSeg = currentRoute.segments[currentSegmentIdx] || currentRoute.segments[0];
  const activeNode = waypoints.find((w) => w.id === currentSeg.roadName) || waypoints[0];

  // Handle clicking an incident marker
  const handleMarkerClick = (report) => {
    if (report) {
      setSelectedIncident(report);
      if (onSelectIncident) onSelectIncident(report);
    }
  };

  // Base viewBox: 880x420; zoom transforms center around (440, 210)
  const viewBoxWidth = 880 / mapZoom;
  const viewBoxHeight = 420 / mapZoom;
  const viewBoxX = (880 - viewBoxWidth) / 2;
  const viewBoxY = (420 - viewBoxHeight) / 2;

  return (
    <div className={`simulation-map-container ${className}`}>
      {/* Operations Map Control Header */}
      <div className="simulation-map-header">
        <div className="simulation-map-title-group">
          <div className="simulation-map-dot-pulse" />
          <div>
            <div className="simulation-map-title">PATNA EMERGENCY DISPATCH MAP</div>
            <div className="simulation-map-subtitle">
              DEMO SIMULATION · 500M TARGETING BUFFER · SELECTABLE INCIDENTS
            </div>
          </div>
        </div>

        {/* Header Actions: Zoom, Step Checkpoint, Status */}
        <div className="simulation-map-controls">
          {/* Zoom Buttons */}
          <div className="map-zoom-group">
            <button
              type="button"
              className="map-tool-btn"
              onClick={zoomIn}
              title="Zoom In"
              aria-label="Zoom In"
            >
              +
            </button>
            <button
              type="button"
              className="map-tool-btn"
              onClick={zoomOut}
              title="Zoom Out"
              aria-label="Zoom Out"
            >
              &minus;
            </button>
            <button
              type="button"
              className="map-tool-btn map-tool-btn--reset"
              onClick={resetZoom}
              title="Reset Map View"
              aria-label="Reset Map View"
            >
              Recenter
            </button>
          </div>

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

      {/* SVG Map Canvas */}
      <div className="simulation-map-canvas-wrapper">
        <svg
          viewBox={`${viewBoxX} ${viewBoxY} ${viewBoxWidth} ${viewBoxHeight}`}
          className="simulation-map-svg"
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label="Interactive Patna Emergency Transit Map"
        >
          <defs>
            {/* Grid Pattern */}
            <pattern id="opGrid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(255, 255, 255, 0.03)" strokeWidth="1" />
            </pattern>

            {/* Riverfront Gradient */}
            <linearGradient id="gangaRiverGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#0B1A28" stopOpacity="0.8" />
              <stop offset="50%" stopColor="#0E2338" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#0B1A28" stopOpacity="0.8" />
            </linearGradient>

            {/* 500m Alert Buffer Radial Gradient */}
            <radialGradient id="alertRadiusGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#EF4444" stopOpacity="0.32" />
              <stop offset="60%" stopColor="#EF4444" stopOpacity="0.12" />
              <stop offset="100%" stopColor="#EF4444" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* Deep Navy/Graphite Base Map Surface */}
          <rect width="880" height="420" fill="#0A0C10" />
          <rect width="880" height="420" fill="url(#opGrid)" />

          {/* Ganga Riverfront Geographical Band (North Patna) */}
          <path
            d="M 0 50 Q 250 30, 500 45 T 880 35 L 880 130 Q 600 145, 300 135 L 0 140 Z"
            fill="url(#gangaRiverGrad)"
            opacity="0.65"
          />
          <text
            x="440"
            y="65"
            textAnchor="middle"
            fill="#2E4C6D"
            fontSize="11"
            fontFamily="var(--font-technical)"
            letterSpacing="0.2em"
            fontWeight="600"
          >
            GANGA RIVERFRONT CORRIDOR (NORTH PATNA)
          </text>

          {/* Alternative Detour: Atal Path -> JP Ganga Path Expressway (High Capacity Bypass) */}
          <path
            d="M 110 280 L 190 280 Q 220 280 250 200 L 280 110 L 550 110 Q 710 110 780 175 L 810 280"
            fill="none"
            stroke={activeRecommendation ? '#10B981' : 'rgba(255, 255, 255, 0.15)'}
            strokeWidth={activeRecommendation ? '4' : '2'}
            strokeDasharray={activeRecommendation ? '8 4' : '4 4'}
            strokeLinecap="round"
          />

          {/* Primary Arterial Route: Bailey Road -> Dak Bungalow -> Gandhi Maidan -> Ashok Rajpath -> PMCH */}
          <path
            d="M 110 280 L 300 280 L 490 280 L 650 280 L 810 280"
            fill="none"
            stroke={currentRoute.id === 'route-primary' ? '#F59E0B' : 'rgba(255, 255, 255, 0.2)'}
            strokeWidth="5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* 500-Meter Proximity Alert Envelope around ambulance */}
          {isTripActive && (
            <g transform={`translate(${activeNode.x}, ${activeNode.y})`}>
              <circle r="68" fill="url(#alertRadiusGlow)" />
              <circle
                r="68"
                fill="none"
                stroke="#EF4444"
                strokeWidth="1.5"
                strokeDasharray="4 3"
                opacity="0.85"
              />
              <rect x="-65" y="-84" width="130" height="18" rx="3" fill="#0C0E12" stroke="#EF4444" strokeWidth="1" />
              <text
                x="0"
                y="-71"
                textAnchor="middle"
                fill="#EF4444"
                fontSize="9"
                fontFamily="var(--font-technical)"
                fontWeight="700"
                letterSpacing="0.04em"
              >
                500M ALERT ENVELOPE
              </text>
            </g>
          )}

          {/* Waypoints & Labels with Clean Anti-Collision Styling */}
          {waypoints.map((wp) => {
            const isUserHere = wp.id.toLowerCase() === userCurrentRoad.toLowerCase();
            const relevantReports = trafficReports.filter((r) => r.roadSegment === wp.id);
            const blockedReport = relevantReports.find((r) => r.reportType === 'ROAD_BLOCKED');
            const highTrafficReport = relevantReports.find((r) => r.reportType === 'TRAFFIC_HIGH');
            const isIncidentSelected = selectedIncident && selectedIncident.roadSegment === wp.id;

            const isBlocked = Boolean(blockedReport);
            const isHeavy = Boolean(highTrafficReport);

            return (
              <g key={wp.id} transform={`translate(${wp.x}, ${wp.y})`}>
                {/* Node Marker Ring */}
                <circle
                  r={wp.isDestination ? '9' : '6'}
                  fill={
                    wp.isDestination
                      ? '#EF4444'
                      : isBlocked
                      ? '#EF4444'
                      : isHeavy
                      ? '#F59E0B'
                      : '#1C2230'
                  }
                  stroke={wp.isDestination ? '#FFFFFF' : '#94A3B8'}
                  strokeWidth={wp.isDestination ? '2.5' : '1.5'}
                />

                {/* Destination Cross Badge */}
                {wp.isDestination && (
                  <g transform="translate(0, -28)">
                    <rect x="-44" y="-14" width="88" height="20" rx="3" fill="#EF4444" stroke="#FFFFFF" strokeWidth="1" />
                    <text x="0" y="0" textAnchor="middle" fill="#FFFFFF" fontSize="10" fontWeight="700">
                      TRAUMA BASE
                    </text>
                  </g>
                )}

                {/* Non-overlapping Staggered Label Card */}
                <g transform={`translate(${wp.labelOffset.x}, ${wp.labelOffset.y})`}>
                  <rect
                    x="-68"
                    y="-12"
                    width="136"
                    height="24"
                    rx="4"
                    fill="#10141D"
                    stroke={isIncidentSelected ? '#F59E0B' : '#1E2738'}
                    strokeWidth={isIncidentSelected ? '1.5' : '1'}
                    opacity="0.95"
                  />
                  <text
                    x="0"
                    y="0"
                    textAnchor="middle"
                    fill="#F1F5F9"
                    fontSize="10"
                    fontFamily="var(--font-interface)"
                    fontWeight="600"
                  >
                    {wp.label}
                  </text>
                  <text
                    x="0"
                    y="9"
                    textAnchor="middle"
                    fill="#64748B"
                    fontSize="8"
                    fontFamily="var(--font-technical)"
                  >
                    {wp.sublabel}
                  </text>
                </g>

                {/* User Simulated Location Pin */}
                {isUserHere && (
                  <g transform="translate(0, -28)">
                    <rect x="-46" y="-14" width="92" height="18" rx="3" fill="#F59E0B" />
                    <text
                      x="0"
                      y="-2"
                      textAnchor="middle"
                      fill="#0C0E12"
                      fontSize="9"
                      fontFamily="var(--font-technical)"
                      fontWeight="800"
                      letterSpacing="0.04em"
                    >
                      YOU ARE HERE
                    </text>
                  </g>
                )}

                {/* Selectable Traffic Obstruction Warning Pill */}
                {relevantReports.length > 0 && (
                  <g
                    transform="translate(14, -14)"
                    style={{ cursor: 'pointer' }}
                    onClick={() => handleMarkerClick(relevantReports[0])}
                    title="Click to inspect community observation"
                  >
                    <rect
                      x="-9"
                      y="-9"
                      width="18"
                      height="18"
                      rx="3"
                      fill={isBlocked ? '#EF4444' : isHeavy ? '#F59E0B' : '#10B981'}
                      stroke={isIncidentSelected ? '#FFFFFF' : 'none'}
                      strokeWidth={isIncidentSelected ? '2' : '0'}
                    />
                    <text x="0" y="4" textAnchor="middle" fill="#FFFFFF" fontSize="10" fontWeight="bold">
                      {isBlocked ? '!' : isHeavy ? '▲' : '✓'}
                    </text>
                  </g>
                )}
              </g>
            );
          })}

          {/* Active Ambulance Position Beacon */}
          {isTripActive && (
            <g transform={`translate(${activeNode.x}, ${activeNode.y})`}>
              <circle r="18" fill="#0C0E12" stroke="#EF4444" strokeWidth="3" />
              <g transform="translate(-10, -10)">
                <AmbulanceIcon size={20} className="map-ambulance-icon" />
              </g>
            </g>
          )}
        </svg>
      </div>

      {/* Selected Incident Drawer / Callout (If an incident is selected) */}
      {selectedIncident && (
        <div className="simulation-map-incident-bar">
          <div className="incident-bar-icon">
            {selectedIncident.reportType === 'ROAD_BLOCKED' && <OctagonAlertIcon size={16} className="text-red" />}
            {selectedIncident.reportType === 'TRAFFIC_HIGH' && <AlertTriangleIcon size={16} className="text-amber" />}
            {selectedIncident.reportType === 'CLEAR' && <CheckCircleIcon size={16} className="text-mint" />}
            {selectedIncident.reportType === 'CANNOT_ASSESS' && <HelpCircleIcon size={16} className="text-muted" />}
          </div>
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

      {/* High-Contrast Operations Legend & GIS Attribution */}
      <div className="simulation-map-legend">
        <div className="legend-items-row">
          <div className="legend-item">
            <span className="legend-swatch legend-swatch--primary" />
            <span>Active Arterial (Bailey & Fraser Rd)</span>
          </div>
          <div className="legend-item">
            <span className="legend-swatch legend-swatch--alt" />
            <span>Expressway Detour (Atal Path & Ganga Path)</span>
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
          AmbuRoute Vector GIS Engine · Patna Emergency Transit Network · Illustrative Geometry
        </div>
      </div>
    </div>
  );
}

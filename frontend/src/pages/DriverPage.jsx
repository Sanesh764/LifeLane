import React from 'react';
import { useSimulation } from '../context/useSimulation.js';
import { TripControls } from '../components/driver/TripControls.jsx';
import { ActiveTripPanel } from '../components/driver/ActiveTripPanel.jsx';
import { RouteComparisonPanel } from '../components/driver/RouteComparisonPanel.jsx';
import { VoiceAssistanceBar } from '../components/driver/VoiceAssistanceBar.jsx';
import { SimulationMap } from '../components/map/SimulationMap.jsx';
import { TrafficFeed } from '../components/traffic/TrafficFeed.jsx';
import { Badge } from '../components/common/Badge.jsx';

/**
 * DriverPage: Professional Emergency Dispatch Console
 *
 * Implements a structured Three-Zone Operations Workspace:
 * - Zone 1 (Left Sidebar): Mission and Dispatch Controls, Destination, Driver Identity
 * - Zone 2 (Center Workspace): Dominant Geographic Corridor Map (55-60%) with Zoom Controls
 * - Zone 3 (Right Sidebar): Active Incident Intelligence, Next Corridor, Telemetry & Detour Decision Card
 */
export function DriverPage() {
  const {
    tripStatus,
    selectedVehicle,
    selectedDestination,
    activeRecommendation,
  } = useSimulation();

  const isTripActive = tripStatus === 'ACTIVE';

  return (
    <div className="dispatch-console-page">
      {/* 1. Top System Status Ribbon (Mission Status & Demo Indicator) */}
      <div className="dispatch-top-ribbon">
        <div className="ribbon-brand-block">
          <Badge variant="warning" size="sm">DEMO SIMULATION</Badge>
          <span className="ribbon-system-title">AMBUROUTE EMERGENCY COCKPIT</span>
          <span className="ribbon-divider">|</span>
          <span className="ribbon-sector">PATNA CENTRAL ARTERIAL SECTOR</span>
        </div>

        <div className="ribbon-status-block">
          <div className="ribbon-unit-badge">
            <span className="text-muted">UNIT:</span>
            <strong>{selectedVehicle.callSign}</strong>
            <span className="plate-pill">{selectedVehicle.vehicleNumber}</span>
          </div>
          <div className="ribbon-dest-badge">
            <span className="text-muted">DEST:</span>
            <strong>{selectedDestination.shortName || selectedDestination.name}</strong>
          </div>
          <Badge variant={isTripActive ? 'critical' : 'neutral'} pulse={isTripActive} size="md">
            {isTripActive ? 'TRIP ACTIVE' : 'STANDBY'}
          </Badge>
        </div>
      </div>

      {/* 2. Current Trip Info & Destination Summary (Prominent Mobile Card) */}
      <div className="dispatch-mobile-trip-summary">
        <div className="summary-dest-card">
          <div className="summary-dest-meta-tag">EMERGENCY DESTINATION · TARGET BASE</div>
          <div className="summary-dest-name">{selectedDestination.name}</div>
          <div className="summary-dest-sub">
            Trauma Center · Distance: {selectedDestination.distanceKm} km · Base Transit: ~{selectedDestination.baseEtaMins} min
          </div>
        </div>
        <div className="summary-vehicle-tag">
          <span>Assigned Unit: <strong>{selectedVehicle.callSign}</strong> ({selectedVehicle.vehicleNumber})</span>
        </div>
      </div>

      {/* Structured Three-Zone Workspace Layout */}
      <div className="dispatch-three-zone-grid">
        {/* ===================================================================
           ZONE 1 (Left on Desktop, Section 7 on Mobile): Mission & Dispatch Controls
           =================================================================== */}
        <aside className="dispatch-zone dispatch-zone--left" aria-label="Dispatch Controls">
          <TripControls />
        </aside>

        {/* ===================================================================
           ZONE 2 (Center on Desktop, Section 3 on Mobile): Geographic Route Map
           =================================================================== */}
        <main className="dispatch-zone dispatch-zone--center" aria-label="Geographic Route Navigation">
          {/* Hands-Free Voice Guidance Audio Notice */}
          <VoiceAssistanceBar />

          {/* Interactive Geographic Operations Map */}
          <div className="dispatch-map-container">
            <SimulationMap />
          </div>
        </main>

        {/* ===================================================================
           ZONE 3 (Right on Desktop, Sections 4, 5, 6 on Mobile): Active Intelligence
           =================================================================== */}
        <aside className="dispatch-zone dispatch-zone--right" aria-label="Route Intelligence & Incident Feed">
          {/* Mission Telemetry & Waypoint Progression (Section 4 on Mobile) */}
          <ActiveTripPanel />

          {/* Live Incident & Community Traffic Observations Feed (Section 5 on Mobile) */}
          <div className="dispatch-incident-panel">
            <div className="incident-panel-header">
              <div className="incident-panel-title">PATNA CORRIDOR OBSERVATIONS</div>
              <Badge variant="neutral" size="sm">CROWDSOURCED</Badge>
            </div>
            <TrafficFeed />
          </div>

          {/* Detour Decision Card (Section 6 on Mobile, when active) */}
          {activeRecommendation && (
            <div className="dispatch-sidebar-alert-slot">
              <RouteComparisonPanel />
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

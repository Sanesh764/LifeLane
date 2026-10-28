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
      {/* Top System Status Ribbon */}
      <div className="dispatch-top-ribbon">
        <div className="ribbon-brand-block">
          <Badge variant="warning" size="sm">DEMO SIMULATION</Badge>
          <span className="ribbon-system-title">AMBUROUTE EMERGENCY DISPATCH CONSOLE</span>
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

      {/* Structured Three-Zone Workspace Layout */}
      <div className="dispatch-three-zone-grid">
        {/* ===================================================================
           ZONE 1 (Left): Mission and Dispatch Controls
           =================================================================== */}
        <aside className="dispatch-zone dispatch-zone--left" aria-label="Dispatch Controls">
          <TripControls />
        </aside>

        {/* ===================================================================
           ZONE 2 (Center): Geographic Route Map
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
           ZONE 3 (Right): Active Incident & Route Intelligence
           =================================================================== */}
        <aside className="dispatch-zone dispatch-zone--right" aria-label="Route Intelligence & Incident Feed">
          {/* Conditional Detour Decision Card (Top priority in right sidebar when active) */}
          {activeRecommendation && (
            <div className="dispatch-sidebar-alert-slot">
              <RouteComparisonPanel />
            </div>
          )}

          {/* Mission Telemetry & Waypoint Progression */}
          <ActiveTripPanel />

          {/* Live Incident & Community Traffic Observations Feed */}
          <div className="dispatch-incident-panel">
            <div className="incident-panel-header">
              <div className="incident-panel-title">PATNA CORRIDOR OBSERVATIONS</div>
              <Badge variant="neutral" size="sm">CROWDSOURCED</Badge>
            </div>
            <TrafficFeed />
          </div>
        </aside>
      </div>
    </div>
  );
}

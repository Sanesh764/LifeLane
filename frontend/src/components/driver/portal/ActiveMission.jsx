import React, { useState } from 'react';
import { useSimulation } from '../../../context/useSimulation.js';
import { SimulationMap } from '../../map/SimulationMap.jsx';
import { TripControls } from '../TripControls.jsx';
import { ActiveTripPanel } from '../ActiveTripPanel.jsx';
import { RouteComparisonPanel } from '../RouteComparisonPanel.jsx';
import { VoiceAssistanceBar } from '../VoiceAssistanceBar.jsx';
import { TrafficFeed } from '../../traffic/TrafficFeed.jsx';
import { Card } from '../../common/Card.jsx';
import { Button } from '../../common/Button.jsx';
import { Badge } from '../../common/Badge.jsx';
import { Modal } from '../../common/Modal.jsx';
import {
  SirenIcon,
  RouteIcon,
  AlertTriangleIcon,
} from '../../common/Icons.jsx';

export function ActiveMission() {
  const {
    tripStatus,
    selectedVehicle,
    selectedDestination,
    activeRecommendation,
    endTrip,
    navigateToDriverSubTab,
  } = useSimulation();

  const isTripActive = tripStatus === 'ACTIVE';
  const [showEndConfirm, setShowEndConfirm] = useState(false);

  // If no trip is active, show helpful empty state
  if (!isTripActive) {
    return (
      <div className="active-mission-empty-page">
        <Card variant="surface" className="mission-empty-card">
          <div className="empty-card-icon-wrap">
            <RouteIcon size={36} className="text-muted" />
          </div>
          <h2 className="empty-card-title">No Emergency Mission Currently Active</h2>
          <p className="empty-card-desc">
            Ambulance unit <strong>{selectedVehicle.callSign}</strong> is in <strong>STANDBY</strong> state. To begin navigating with route-aware 500m alerts and live traffic intelligence, dispatch an emergency mission.
          </p>
          <div className="empty-card-actions">
            <Button
              variant="critical"
              size="lg"
              icon={SirenIcon}
              onClick={() => navigateToDriverSubTab('start')}
            >
              Start Emergency Mission
            </Button>
            <Button
              variant="outline"
              size="md"
              onClick={() => navigateToDriverSubTab('home')}
            >
              Return to Home Dashboard
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  const handleConfirmEnd = () => {
    endTrip();
    setShowEndConfirm(false);
  };

  return (
    <div className="active-mission-cockpit-page">
      {/* 1. Top Ribbon */}
      <div className="dispatch-top-ribbon">
        <div className="ribbon-brand-block">
          <Badge variant="critical" pulse size="sm">ACTIVE EMERGENCY</Badge>
          <span className="ribbon-system-title">AMBUROUTE COCKPIT</span>
          <span className="ribbon-divider">|</span>
          <span className="ribbon-sector">PATNA ARTERIAL CORRIDOR</span>
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
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowEndConfirm(true)}
            className="btn-ribbon-end"
          >
            End Mission
          </Button>
        </div>
      </div>

      {/* 2. Destination Alert Bar */}
      <div className="dispatch-mobile-trip-summary">
        <div className="summary-dest-card">
          <div className="summary-dest-meta-tag">TARGET MEDICAL BASE</div>
          <div className="summary-dest-name">{selectedDestination.name}</div>
          <div className="summary-dest-sub">
            Distance: {selectedDestination.distanceKm} km · Base ETA: ~{selectedDestination.baseEtaMins} mins · 500m Corridor Broadcast Active
          </div>
        </div>
      </div>

      {/* 3. Three-Zone Cockpit Layout */}
      <div className="dispatch-three-zone-grid">
        {/* Zone 1: Mission Controls */}
        <aside className="dispatch-zone dispatch-zone--left" aria-label="Dispatch Controls">
          <TripControls />
        </aside>

        {/* Zone 2: Leaflet Geographic Map */}
        <main className="dispatch-zone dispatch-zone--center" aria-label="Geographic Route Navigation">
          <VoiceAssistanceBar />
          <div className="dispatch-map-container">
            <SimulationMap />
          </div>
        </main>

        {/* Zone 3: Telemetry, Incident Feed & Detour Decision */}
        <aside className="dispatch-zone dispatch-zone--right" aria-label="Route Intelligence & Incident Feed">
          <ActiveTripPanel />

          <div className="dispatch-incident-panel">
            <div className="incident-panel-header">
              <div className="incident-panel-title">PATNA CORRIDOR OBSERVATIONS</div>
              <Badge variant="neutral" size="sm">CROWDSOURCED</Badge>
            </div>
            <TrafficFeed />
          </div>

          {activeRecommendation && (
            <div className="dispatch-sidebar-alert-slot">
              <RouteComparisonPanel />
            </div>
          )}
        </aside>
      </div>

      {/* End Trip Safe Confirmation Modal */}
      {showEndConfirm && (
        <Modal
          isOpen={showEndConfirm}
          onClose={() => setShowEndConfirm(false)}
          title="Conclude Emergency Mission?"
        >
          <div className="confirm-modal-body">
            <AlertTriangleIcon size={32} className="text-amber" />
            <p>
              Are you sure you want to end the emergency trip to <strong>{selectedDestination.shortName || selectedDestination.name}</strong>?
            </p>
            <p className="modal-subtext text-muted">
              Active route broadcasts to road users will be deactivated, and this trip will be recorded in your Trip History.
            </p>
            <div className="modal-actions-row">
              <Button variant="critical" onClick={handleConfirmEnd}>
                Yes, Conclude Mission
              </Button>
              <Button variant="outline" onClick={() => setShowEndConfirm(false)}>
                Cancel & Continue Driving
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

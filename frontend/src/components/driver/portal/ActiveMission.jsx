import React, { useState } from 'react';
import { useSimulation } from '../../../context/useSimulation.js';
import { SimulationMap } from '../../map/SimulationMap.jsx';
import { DriverNavigationHUD } from '../DriverNavigationHUD.jsx';
import { RouteComparisonPanel } from '../RouteComparisonPanel.jsx';
import { TrafficFeed } from '../../traffic/TrafficFeed.jsx';
import { Card } from '../../common/Card.jsx';
import { Button } from '../../common/Button.jsx';
import { Badge } from '../../common/Badge.jsx';
import { Modal } from '../../common/Modal.jsx';
import {
  SirenIcon,
  RouteIcon,
  AlertTriangleIcon,
  CompassIcon,
  PlayIcon,
  ChevronRightIcon,
  MapPinIcon,
} from '../../common/Icons.jsx';

/**
 * ActiveMission: Destination-Focused, Map-First Emergency Cockpit
 *
 * Implements two distinct modes:
 * - Standby Guard (when no trip is active, prompts starting a mission)
 * - Focused Mission Mode (~75-80% map priority with persistent navigation HUD,
 *   compact mission controls, voice guidance, and driver-confirmed rerouting)
 */
export function ActiveMission() {
  const {
    tripStatus,
    selectedVehicle,
    selectedDestination,
    currentRoute,
    currentSegmentIdx,
    advanceSegment,
    activeRecommendation,
    endTrip,
    navigateToDriverSubTab,
    isFocusedMissionMode,
    toggleFocusedMissionMode,
  } = useSimulation();

  const isTripActive = tripStatus === 'ACTIVE';
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [showSecondaryDrawer, setShowSecondaryDrawer] = useState(false);

  // If no trip is active, render the pre-mission Standby card
  if (!isTripActive) {
    return (
      <div className="active-mission-empty-page">
        <Card variant="surface" className="mission-empty-card">
          <div className="empty-card-icon-wrap">
            <RouteIcon size={36} className="text-muted" />
          </div>
          <div className="empty-card-status-badge">
            <Badge variant="clear" size="sm">UNIT STANDBY · READY</Badge>
          </div>
          <h2 className="empty-card-title">No Emergency Mission Currently Active</h2>
          <p className="empty-card-desc">
            Ambulance unit <strong>{selectedVehicle.callSign}</strong> ({selectedVehicle.vehicleNumber}) is in <strong>STANDBY</strong> state. Destination selection and dispatch parameters are configured before a mission starts.
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

  const currentSegment = currentRoute.segments[currentSegmentIdx] || currentRoute.segments[0];

  return (
    <div className={`active-mission-cockpit-page ${isFocusedMissionMode ? 'is-focused-layout' : 'is-expanded-layout'}`}>
      {/* 1. Compact Top Mission Bar */}
      <header className="mission-top-bar" aria-label="Active Mission Status Bar">
        <div className="mission-top-bar__left">
          <Badge variant="critical" pulse size="sm">ACTIVE EMERGENCY</Badge>
          <div className="mission-unit-tag">
            <span className="unit-label">UNIT:</span>
            <strong>{selectedVehicle.callSign}</strong>
            <span className="plate-badge">{selectedVehicle.vehicleNumber}</span>
          </div>
        </div>

        <div className="mission-top-bar__center">
          <div className="mission-target-chip" title={selectedDestination.name}>
            <MapPinIcon size={14} className="text-primary" />
            <span className="target-label">DESTINATION:</span>
            <strong className="target-name">{selectedDestination.shortName || selectedDestination.name}</strong>
          </div>
        </div>

        <div className="mission-top-bar__right">
          {/* Focused View Toggle */}
          <button
            type="button"
            className="mission-view-toggle-btn"
            onClick={toggleFocusedMissionMode}
            title={isFocusedMissionMode ? 'Expand side controls' : 'Switch to focused 80% map mode'}
          >
            {isFocusedMissionMode ? 'Exit Focused View' : 'Focused Map Mode (80%)'}
          </button>

          {/* Quick Drawer Toggle (when in focused mode) */}
          {isFocusedMissionMode && (
            <button
              type="button"
              className={`mission-drawer-toggle-btn ${showSecondaryDrawer ? 'is-open' : ''}`}
              onClick={() => setShowSecondaryDrawer((prev) => !prev)}
            >
              {showSecondaryDrawer ? 'Hide Intel ✕' : 'Corridor Intel ☰'}
            </button>
          )}

          {/* Prominent End Emergency Button */}
          <Button
            variant="critical"
            size="sm"
            onClick={() => setShowEndConfirm(true)}
            className="btn-mission-end"
          >
            End Emergency
          </Button>
        </div>
      </header>

      {/* 2. Main Mission Navigation Workspace */}
      <div className="mission-workspace-grid">
        {/* Map-First Primary Navigation Stage (~75-80% in Focused Mode) */}
        <main className="mission-map-stage" aria-label="Map-First Geographic Route Navigation">
          {/* Persistent Navigation Guidance HUD */}
          <DriverNavigationHUD />

          {/* Alternative Route Recommendation Banner (When driver review required) */}
          {activeRecommendation && (
            <div className="mission-detour-overlay">
              <RouteComparisonPanel />
            </div>
          )}

          {/* Primary Leaflet Map Container */}
          <div className="mission-leaflet-map-wrapper">
            <SimulationMap />
          </div>

          {/* Floating Mobile/Quick Stepper Control */}
          <div className="mission-floating-stepper-bar">
            <div className="stepper-waypoint-info">
              <CompassIcon size={14} className="text-primary" />
              <span>Checkpoint {currentSegmentIdx + 1} of {currentRoute.segments.length}: <strong>{currentSegment.roadName}</strong></span>
            </div>
            <Button
              variant="outline"
              size="sm"
              icon={PlayIcon}
              onClick={advanceSegment}
              className="btn-stepper-advance"
            >
              Advance Position (Demo)
            </Button>
          </div>
        </main>

        {/* Collapsible Secondary Intelligence & Observations Drawer */}
        {(!isFocusedMissionMode || showSecondaryDrawer) && (
          <aside className="mission-secondary-drawer" aria-label="Secondary Corridor Intelligence">
            <div className="drawer-header-row">
              <div className="drawer-title-block">
                <span className="drawer-title">Corridor Intelligence</span>
                <Badge variant="neutral" size="sm">Patna Sector</Badge>
              </div>
              {isFocusedMissionMode && (
                <button
                  type="button"
                  className="drawer-close-btn"
                  onClick={() => setShowSecondaryDrawer(false)}
                >
                  ✕
                </button>
              )}
            </div>

            {/* Checkpoint Stepper Panel */}
            <Card variant="surface" className="drawer-stepper-card">
              <div className="stepper-card-top">
                <span className="stepper-tag">SIMULATION POSITION STEPPER</span>
                <Badge variant="clear" size="xs">ACTIVE</Badge>
              </div>
              <p className="stepper-desc">
                Step through the Patna emergency route checkpoints to simulate GPS movement and trigger route-aware yield broadcasts.
              </p>
              <Button
                variant="primary"
                size="md"
                icon={PlayIcon}
                onClick={advanceSegment}
                fullWidth
              >
                Advance Ambulance Checkpoint
              </Button>
            </Card>

            {/* Route Corridor Progression Checklist */}
            <Card variant="surface" className="drawer-corridor-card">
              <div className="corridor-card-header">
                <span className="corridor-card-title">Route Checkpoints</span>
                <span className="corridor-card-dest">{selectedDestination.shortName || selectedDestination.name}</span>
              </div>
              <div className="corridor-card-list">
                {currentRoute.segments.map((seg, idx) => {
                  const isPassed = idx < currentSegmentIdx;
                  const isCurrent = idx === currentSegmentIdx;
                  return (
                    <div
                      key={seg.id}
                      className={`corridor-step-item ${isCurrent ? 'is-current' : ''} ${isPassed ? 'is-passed' : ''}`}
                    >
                      <div className="step-circle">
                        {isPassed ? '✓' : idx + 1}
                      </div>
                      <div className="step-content">
                        <div className="step-road">{seg.roadName}</div>
                        <div className="step-meta">
                          {isCurrent ? 'Current Position (Broadcasting 500m alerts)' : isPassed ? 'Checkpoint Passed' : 'Upcoming Segment'}
                        </div>
                      </div>
                      <ChevronRightIcon size={14} className="text-muted" />
                    </div>
                  );
                })}
              </div>
            </Card>

            {/* Patna Corridor Incident Stream */}
            <div className="drawer-incidents-section">
              <div className="drawer-incidents-header">
                <span className="drawer-incidents-title">Corridor Traffic Observations</span>
                <Badge variant="warning" size="xs">CROWDSOURCED</Badge>
              </div>
              <TrafficFeed />
            </div>
          </aside>
        )}
      </div>

      {/* 3. Conclude Mission Safe Confirmation Modal */}
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
              Active route broadcasts to road users will be deactivated, and this trip will be recorded in your Trip History. The unit will return to Standby mode.
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

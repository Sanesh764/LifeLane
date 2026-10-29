import React, { useState } from 'react';
import { useSimulation } from '../../context/useSimulation.js';
import { Button } from '../common/Button.jsx';
import { Card } from '../common/Card.jsx';
import { SirenIcon, ShieldCheckIcon, LogOutIcon } from '../common/Icons.jsx';
import { Badge } from '../common/Badge.jsx';
import { DEMO_DESTINATIONS, DEMO_VEHICLES } from '../../services/mockData.js';
import { Modal } from '../common/Modal.jsx';

/**
 * TripControls: Left Zone Mission & Dispatch Controls
 *
 * Provides:
 * - Driver session identity & logout
 * - Destination & vehicle selectors
 * - Large primary Start/End emergency mission controls
 * - Unmistakable STANDBY indicator when inactive
 */
export function TripControls() {
  const {
    tripStatus,
    startTrip,
    endTrip,
    selectedVehicle,
    setSelectedVehicle,
    selectedDestination,
    setSelectedDestination,
    currentUser,
    logout,
  } = useSimulation();

  const [isEndModalOpen, setIsEndModalOpen] = useState(false);
  const isTripActive = tripStatus === 'ACTIVE';

  return (
    <Card variant="surface" className="dispatch-controls-card">
      {/* Driver Identity & Session Header */}
      <div className="dispatch-driver-card">
        <div className="driver-header-top">
          <div className="driver-avatar-icon">
            <ShieldCheckIcon size={18} className="text-mint" />
          </div>
          <div className="driver-session-meta">
            <div className="driver-session-tag">AUTHORIZED OPERATOR</div>
            <div className="driver-full-name">{currentUser ? currentUser.driverName : 'Authorized Driver'}</div>
          </div>
          <Button
            variant="outline"
            size="sm"
            icon={LogOutIcon}
            onClick={logout}
            disabled={isTripActive}
            title={isTripActive ? 'End active mission before logging out' : 'Log out driver session'}
            className="btn-driver-logout"
          >
            Logout
          </Button>
        </div>

        <div className="driver-unit-meta">
          <span>{currentUser ? currentUser.callSign : 'AmbuRoute Emergency 108'}</span>
          <span className="plate-tag">{currentUser ? currentUser.vehicleNumber : 'BR-01-EA-108'}</span>
        </div>
      </div>

      {/* Mission Configuration Form */}
      <div className="dispatch-config-form">
        {/* Destination Hospital Selection */}
        <div className="form-group">
          <label className="form-label" htmlFor="dest-select">
            Hospital Destination
          </label>
          <select
            id="dest-select"
            className="form-select form-select--ops"
            value={selectedDestination?.id || ''}
            onChange={(e) => {
              const d = DEMO_DESTINATIONS.find((item) => item.id === e.target.value);
              if (d) setSelectedDestination(d);
            }}
            disabled={isTripActive}
          >
            {!selectedDestination && (
              <option value="" disabled>Select Target Hospital on Start Emergency</option>
            )}
            {selectedDestination && !DEMO_DESTINATIONS.some((d) => d.id === selectedDestination.id) && (
              <option value={selectedDestination.id}>
                {selectedDestination.shortName || selectedDestination.name} ({selectedDestination.distanceKm || 'Discovered'} km)
              </option>
            )}
            {DEMO_DESTINATIONS.map((d) => (
              <option key={d.id} value={d.id}>
                {d.shortName || d.name} ({d.distanceKm} km · ~{d.baseEtaMins} min) [Demo]
              </option>
            ))}
          </select>
        </div>

        {/* Emergency Vehicle Selection */}
        <div className="form-group">
          <label className="form-label" htmlFor="veh-select">
            Assigned Vehicle Unit
          </label>
          <select
            id="veh-select"
            className="form-select form-select--ops"
            value={selectedVehicle.id}
            onChange={(e) => {
              const v = DEMO_VEHICLES.find((item) => item.id === e.target.value);
              if (v) setSelectedVehicle(v);
            }}
            disabled={isTripActive}
          >
            {DEMO_VEHICLES.map((v) => (
              <option key={v.id} value={v.id}>
                {v.callSign} ({v.vehicleNumber})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Main Start / End Mission Action Area */}
      <div className="dispatch-action-block">
        {!isTripActive ? (
          <div className="dispatch-standby-box">
            <div className="standby-status-row">
              <Badge variant="neutral" size="sm">STATUS: STANDBY</Badge>
              <span className="standby-desc">Awaiting emergency dispatch</span>
            </div>
            <Button
              variant="critical"
              size="lg"
              icon={SirenIcon}
              fullWidth
              onClick={startTrip}
              className="btn-start-dispatch"
            >
              START EMERGENCY MISSION
            </Button>
          </div>
        ) : (
          <div className="dispatch-active-box">
            <div className="active-mission-indicator">
              <div className="pulse-siren-dot" />
              <span>MISSION IN PROGRESS · BROADCASTING</span>
            </div>
            <Button
              variant="outline"
              size="lg"
              fullWidth
              onClick={() => setIsEndModalOpen(true)}
              className="btn-end-dispatch"
            >
              END EMERGENCY MISSION
            </Button>
          </div>
        )}
      </div>

      {/* Safety Notice */}
      <div className="dispatch-footer-notice">
        <span>* 500m route-aware corridor broadcasting activates on mission start.</span>
      </div>

      {/* Confirmation Modal to End Trip */}
      <Modal
        isOpen={isEndModalOpen}
        onClose={() => setIsEndModalOpen(false)}
        title="Confirm Emergency Mission Termination"
        confirmText="End Active Mission"
        cancelText="Cancel"
        isDestructive
        onConfirm={endTrip}
      >
        <p>
          Ending this emergency mission will immediately disable location broadcasting and expire all active road-user notifications.
        </p>
      </Modal>
    </Card>
  );
}

import React from 'react';
import { useSimulation } from '../../../context/useSimulation.js';
import { Card } from '../../common/Card.jsx';
import { Button } from '../../common/Button.jsx';
import { Badge } from '../../common/Badge.jsx';
import {
  ShieldCheckIcon,
  Volume2Icon,
  VolumeXIcon,
  RefreshCwIcon,
  AmbulanceIcon,
} from '../../common/Icons.jsx';

export function DriverSettings() {
  const {
    currentUser,
    selectedVehicle,
    isMuted,
    setIsMuted,
    resetSimulation,
    driverSettings,
    setDriverSettings,
  } = useSimulation();

  const handleVoiceRateChange = (e) => {
    const val = parseFloat(e.target.value);
    setDriverSettings((prev) => ({ ...prev, voiceRate: val }));
  };

  const handleResetDemo = () => {
    resetSimulation();
  };

  return (
    <div className="driver-settings-page">
      <div className="page-header-row">
        <div>
          <div className="ops-badge-row">
            <Badge variant="neutral" size="sm">DRIVER CONSOLE</Badge>
            <Badge variant="warning" size="sm">SYSTEM CONFIGURATION</Badge>
          </div>
          <h1 className="page-title">Unit & Console Settings</h1>
          <p className="page-subtitle">
            Manage audio guidance preferences, driver credentials, vehicle assignment, and demonstration reset controls.
          </p>
        </div>
      </div>

      <div className="settings-cards-grid">
        {/* 1. Driver Profile & Fleet Assignment */}
        <Card variant="surface" className="settings-section-card">
          <div className="settings-card-header">
            <ShieldCheckIcon size={20} className="text-mint" />
            <h2 className="settings-card-title">Driver Profile & Credentials</h2>
          </div>
          <div className="settings-card-body">
            <div className="settings-field-row">
              <span className="field-label">Operator Name:</span>
              <span className="field-val"><strong>{currentUser?.driverName || 'Amitabh Sen'}</strong></span>
            </div>
            <div className="settings-field-row">
              <span className="field-label">Institutional Driver ID:</span>
              <span className="field-val text-technical">{currentUser?.driverId || 'BR-DRV-10842'}</span>
            </div>
            <div className="settings-field-row">
              <span className="field-label">Authenticated Account:</span>
              <span className="field-val">{currentUser?.email || 'N/A'}</span>
            </div>
            <div className="settings-field-row">
              <span className="field-label">Authorization Role:</span>
              <Badge variant="clear" size="sm">VERIFIED AMBULANCE DISPATCHER</Badge>
            </div>
          </div>
        </Card>

        {/* 2. Emergency Vehicle Assignment */}
        <Card variant="surface" className="settings-section-card">
          <div className="settings-card-header">
            <AmbulanceIcon size={20} className="text-primary" />
            <h2 className="settings-card-title">Vehicle & Dispatch Fleet Assignment</h2>
          </div>
          <div className="settings-card-body">
            <div className="settings-field-row">
              <span className="field-label">Unit Call Sign:</span>
              <span className="field-val"><strong>{selectedVehicle.callSign}</strong></span>
            </div>
            <div className="settings-field-row">
              <span className="field-label">Official Registration Plate:</span>
              <span className="field-val text-technical">{selectedVehicle.vehicleNumber}</span>
            </div>
            <div className="settings-field-row">
              <span className="field-label">Operational Sector:</span>
              <span className="field-val">{driverSettings?.pilotSector || 'Patna Central Arterial Sector'}</span>
            </div>
            <div className="settings-field-row">
              <span className="field-label">Vehicle Capability:</span>
              <Badge variant="neutral" size="sm">ADVANCED LIFE SUPPORT (ALS)</Badge>
            </div>
          </div>
        </Card>

        {/* 3. Hands-Free Voice Route Guidance Settings */}
        <Card variant="surface" className="settings-section-card">
          <div className="settings-card-header">
            {isMuted ? (
              <VolumeXIcon size={20} className="text-amber" />
            ) : (
              <Volume2Icon size={20} className="text-mint" />
            )}
            <h2 className="settings-card-title">Hands-Free Voice Route Guidance</h2>
          </div>
          <div className="settings-card-body">
            <div className="settings-toggle-row">
              <div className="toggle-text">
                <span className="toggle-label">Voice Route Assistance Audio</span>
                <span className="toggle-sub text-muted">
                  Spoken recommendations for obstructions and alternative routes
                </span>
              </div>
              <button
                type="button"
                className={`toggle-switch ${!isMuted ? 'is-checked' : ''}`}
                onClick={() => setIsMuted(!isMuted)}
                aria-label="Toggle voice guidance"
              >
                <span className="toggle-handle" />
              </button>
            </div>

            <div className="settings-slider-row">
              <label htmlFor="voice-rate-slider" className="slider-label">
                <span>Speech Rate: {driverSettings?.voiceRate || 1.0}x</span>
              </label>
              <input
                id="voice-rate-slider"
                type="range"
                min="0.75"
                max="1.5"
                step="0.25"
                value={driverSettings?.voiceRate || 1.0}
                onChange={handleVoiceRateChange}
                className="settings-range-slider"
              />
            </div>

            <p className="settings-note text-muted">
              Voice recommendations are synthesized using the Web Speech API and follow strict safety constraints: recommendations never trigger rerouting without driver confirmation.
            </p>
          </div>
        </Card>

        {/* 4. Demonstration State Controls */}
        <Card variant="surface" className="settings-section-card">
          <div className="settings-card-header">
            <RefreshCwIcon size={20} className="text-primary" />
            <h2 className="settings-card-title">Prototype Simulation Reset</h2>
          </div>
          <div className="settings-card-body">
            <p className="reset-desc text-muted">
              Restores the Patna pilot simulation to initial defaults: clears active trips, resets waypoint GPS checkpoints, and restores initial road reports.
            </p>
            <div className="reset-action-row">
              <Button
                variant="outline"
                size="md"
                icon={RefreshCwIcon}
                onClick={handleResetDemo}
                className="btn-reset-demo"
              >
                Reset Simulation Defaults
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

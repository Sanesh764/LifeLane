import React, { useState } from 'react';
import { useSimulation } from '../../../context/useSimulation.js';
import { DEMO_DESTINATIONS, DEMO_VEHICLES } from '../../../services/mockData.js';
import { Card } from '../../common/Card.jsx';
import { Button } from '../../common/Button.jsx';
import { Badge } from '../../common/Badge.jsx';
import {
  SirenIcon,
  ShieldCheckIcon,
  AmbulanceIcon,
  MapPinIcon,
  AlertTriangleIcon,
  CheckCircle2Icon,
  RouteIcon,
} from '../../common/Icons.jsx';

export function StartEmergency() {
  const {
    currentUser,
    selectedVehicle,
    setSelectedVehicle,
    selectedDestination,
    setSelectedDestination,
    tripStatus,
    startTrip,
    navigateToDriverSubTab,
  } = useSimulation();

  const isTripActive = tripStatus === 'ACTIVE';

  const [destinationId, setDestinationId] = useState(selectedDestination.id);
  const [vehicleId, setVehicleId] = useState(selectedVehicle.id);
  const [isStarting, setIsStarting] = useState(false);
  const [formError, setFormError] = useState('');

  const currentChosenDest = DEMO_DESTINATIONS.find((d) => d.id === destinationId) || DEMO_DESTINATIONS[0];
  const currentChosenVeh = DEMO_VEHICLES.find((v) => v.id === vehicleId) || DEMO_VEHICLES[0];

  const handleStartSubmit = (e) => {
    e.preventDefault();
    setFormError('');

    if (isTripActive) {
      setFormError('An emergency trip is already active. Please resume the ongoing mission or conclude it first.');
      return;
    }

    if (!destinationId) {
      setFormError('Please select a destination medical center.');
      return;
    }

    // Save selected destination and vehicle
    setSelectedDestination(currentChosenDest);
    setSelectedVehicle(currentChosenVeh);

    setIsStarting(true);
    setTimeout(() => {
      startTrip();
      setIsStarting(false);
    }, 250);
  };

  return (
    <div className="start-emergency-page">
      <div className="page-header-row">
        <div>
          <div className="ops-badge-row">
            <Badge variant="warning" size="sm">DEMO SIMULATION</Badge>
            <Badge variant="critical" size="sm">STEP-BY-STEP DISPATCH</Badge>
          </div>
          <h1 className="page-title">Start Emergency Mission</h1>
          <p className="page-subtitle">
            Configure vehicle assignment and destination medical base. Once confirmed, corridor-aware broadcast activates within a 500m radius of the ambulance.
          </p>
        </div>
      </div>

      {/* Duplicate Trip Active Guard */}
      {isTripActive && (
        <Card variant="surface" className="active-guard-card">
          <div className="guard-card-body">
            <AlertTriangleIcon size={24} className="text-amber" />
            <div className="guard-card-text">
              <h3 className="guard-title">Active Emergency Trip Already Running</h3>
              <p className="guard-desc">
                Unit <strong>{selectedVehicle.callSign}</strong> is currently en route to <strong>{selectedDestination.name}</strong>. AmbuRoute prevents starting duplicate simultaneous trips in the same unit.
              </p>
            </div>
            <Button
              variant="critical"
              size="md"
              icon={RouteIcon}
              onClick={() => navigateToDriverSubTab('active')}
            >
              Resume Active Mission
            </Button>
          </div>
        </Card>
      )}

      {formError && (
        <div className="report-error-banner" role="alert">
          <AlertTriangleIcon size={18} className="text-red" />
          <span>{formError}</span>
        </div>
      )}

      {/* Guided 5-Step Form */}
      <form onSubmit={handleStartSubmit} className="start-emergency-form">
        <div className="dispatch-form-grid">
          {/* Step 1: Authorized Driver Identity */}
          <Card variant="surface" className="dispatch-step-card">
            <div className="step-card-header">
              <span className="step-card-num">STEP 1</span>
              <h3 className="step-card-title">Authorized Driver Verification</h3>
            </div>
            <div className="step-card-content">
              <div className="driver-verified-box">
                <div className="driver-verified-icon">
                  <ShieldCheckIcon size={22} className="text-mint" />
                </div>
                <div className="driver-verified-details">
                  <div className="verified-name">{currentUser?.driverName || 'Amitabh Sen'}</div>
                  <div className="verified-meta text-muted">
                    License ID: <strong>{currentUser?.driverId || 'BR-DRV-10842'}</strong> · Institutional Emergency Fleet
                  </div>
                  <div className="verified-email text-muted">{currentUser?.email || 'driver@amburoute.demo'}</div>
                </div>
                <Badge variant="clear" size="sm">VERIFIED ACTIVE</Badge>
              </div>
              <p className="step-field-hint">
                Driver identity is bound to this emergency session. All subsequent detour confirmations will be attributed to this credential.
              </p>
            </div>
          </Card>

          {/* Step 2: Assigned Ambulance / Unit */}
          <Card variant="surface" className="dispatch-step-card">
            <div className="step-card-header">
              <span className="step-card-num">STEP 2</span>
              <h3 className="step-card-title">Ambulance Unit Assignment</h3>
            </div>
            <div className="step-card-content">
              <div className="form-group">
                <label className="form-label" htmlFor="vehicle-select">
                  <AmbulanceIcon size={16} />
                  <span>Select Emergency Vehicle</span>
                </label>
                <select
                  id="vehicle-select"
                  className="form-select"
                  value={vehicleId}
                  onChange={(e) => setVehicleId(e.target.value)}
                  disabled={isTripActive}
                >
                  {DEMO_VEHICLES.map((veh) => (
                    <option key={veh.id} value={veh.id}>
                      {veh.callSign} — ({veh.vehicleNumber})
                    </option>
                  ))}
                </select>
              </div>
              <div className="vehicle-specs-pill text-muted">
                Assigned Plate: <strong>{currentChosenVeh.vehicleNumber}</strong> · Advanced Life Support (ALS)
              </div>
            </div>
          </Card>

          {/* Step 3: Destination Hospital Selection */}
          <Card variant="surface" className="dispatch-step-card">
            <div className="step-card-header">
              <span className="step-card-num">STEP 3</span>
              <h3 className="step-card-title">Destination Medical Center</h3>
            </div>
            <div className="step-card-content">
              <div className="form-group">
                <label className="form-label" htmlFor="dest-select">
                  <MapPinIcon size={16} />
                  <span>Select Target Hospital Base (Patna)</span>
                </label>
                <select
                  id="dest-select"
                  className="form-select form-select--dest"
                  value={destinationId}
                  onChange={(e) => setDestinationId(e.target.value)}
                  disabled={isTripActive}
                >
                  {DEMO_DESTINATIONS.map((dest) => (
                    <option key={dest.id} value={dest.id}>
                      {dest.name} (~{dest.distanceKm} km · {dest.baseEtaMins} min)
                    </option>
                  ))}
                </select>
              </div>
              <div className="hospital-preview-box">
                <div className="hospital-preview-name">{currentChosenDest.shortName}</div>
                <div className="hospital-preview-meta text-muted">
                  City: {currentChosenDest.city} · Approximate Arterial Transit: <strong>~{currentChosenDest.baseEtaMins} minutes</strong>
                </div>
              </div>
            </div>
          </Card>

          {/* Step 4: Trip Summary & Routing Review */}
          <Card variant="surface" className="dispatch-step-card">
            <div className="step-card-header">
              <span className="step-card-num">STEP 4</span>
              <h3 className="step-card-title">Corridor & Telemetry Review</h3>
            </div>
            <div className="step-card-content">
              <div className="trip-review-grid">
                <div className="review-stat-item">
                  <span className="review-stat-label">Corridor Distance:</span>
                  <span className="review-stat-val">~{currentChosenDest.distanceKm} km</span>
                </div>
                <div className="review-stat-item">
                  <span className="review-stat-label">Estimated Transit:</span>
                  <span className="review-stat-val text-mint">~{currentChosenDest.baseEtaMins} mins</span>
                </div>
                <div className="review-stat-item">
                  <span className="review-stat-label">Target Broadcast:</span>
                  <span className="review-stat-val">500m Ahead</span>
                </div>
                <div className="review-stat-item">
                  <span className="review-stat-label">Initial Route:</span>
                  <span className="review-stat-val">Bailey Rd & Fraser Rd</span>
                </div>
              </div>

              <div className="demo-disclaimer-box">
                <CheckCircle2Icon size={16} className="text-mint" />
                <span>
                  <strong>Prototype Demonstration:</strong> Simulates GPS checkpoints along Patna corridors. No live municipal emergency siren will be dispatched.
                </span>
              </div>
            </div>
          </Card>
        </div>

        {/* Step 5: Start Confirmation Action */}
        <div className="start-actions-row">
          <Button
            type="submit"
            variant="critical"
            size="lg"
            icon={SirenIcon}
            loading={isStarting}
            disabled={isTripActive}
            className="btn-dispatch-confirm"
          >
            CONFIRM & START EMERGENCY MISSION
          </Button>
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={() => navigateToDriverSubTab('home')}
          >
            Cancel & Return Home
          </Button>
        </div>
      </form>
    </div>
  );
}

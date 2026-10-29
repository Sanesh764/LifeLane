import React from 'react';
import { useSimulation } from '../../context/useSimulation.js';
import { Card } from '../common/Card.jsx';
import { Badge } from '../common/Badge.jsx';
import { SirenIcon, AlertTriangleIcon, CheckCircleIcon } from '../common/Icons.jsx';

/**
 * AmbulanceAlertCard: Automotive-Inspired High-Visibility Emergency Warning HUD
 *
 * Inspired by automotive heads-up collision / emergency vehicle warning systems (Reference #4):
 * - High-visibility emergency red & signal amber banner
 * - Immediate road corridor, travel direction, and demo ETA
 * - Three high-contrast safe yielding action directives (Slow down safely, Pull over left, Keep corridor open)
 * - Clear DEMO SIMULATION notice
 */
export function AmbulanceAlertCard() {
  const {
    activeAlertForUser,
    subscriptionPermission,
    userCurrentRoad,
    tripStatus,
  } = useSimulation();

  // If permission is denied
  if (subscriptionPermission === 'DENIED') {
    return (
      <Card variant="ivory" className="alert-card-denied">
        <div className="alert-denied-box">
          <AlertTriangleIcon size={32} className="text-amber" />
          <div className="alert-denied-content">
            <h3 className="alert-denied-title">Push Notifications Denied</h3>
            <p className="alert-denied-desc">
              Your browser notification permission is disabled. AmbuRoute cannot alert you when an approaching ambulance targets your 500m roadway. Grant permission in the controls below to enable alerts.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  // If no alert is active for user's road
  if (!activeAlertForUser) {
    return (
      <Card variant="ivory" className="alert-card-idle">
        <div className="alert-idle-box">
          <div className="alert-idle-icon-wrap">
            <CheckCircleIcon size={28} className="text-mint" />
          </div>
          <div className="alert-idle-content">
            <div className="alert-idle-tag">PROXIMITY RADAR ARMED</div>
            <h3 className="alert-idle-title">No Approaching Ambulance in Your Sector</h3>
            <p className="alert-idle-desc">
              {tripStatus === 'ACTIVE'
                ? `An emergency mission is active, but outside your 2–5 km proximity envelope${userCurrentRoad ? ` (${userCurrentRoad})` : ''}.`
                : `Ambulance fleet is on standby. When an active emergency mission approaches within 2–5 km of ${userCurrentRoad || 'your location'}, you will receive an instant high-visibility yield alert.`}
            </p>
          </div>
        </div>
      </Card>
    );
  }

  // Active approaching ambulance warning! (Automotive-inspired HUD)
  return (
    <div className="automotive-alert-hud" role="alert" aria-live="assertive">
      {/* High-Visibility Emergency Header */}
      <div className="hud-emergency-banner">
        <div className="hud-siren-beacon">
          <SirenIcon size={32} className="hud-beacon-icon" />
        </div>
        <div className="hud-header-text">
          <div className="hud-topline">
            <Badge variant="critical" pulse size="md">
              HIGH-PRIORITY CORRIDOR CLEARANCE
            </Badge>
            <Badge variant="warning" size="sm">
              DEMO SIMULATION
            </Badge>
          </div>
          <h2 className="hud-title">EMERGENCY VEHICLE APPROACHING</h2>
        </div>
      </div>

      {/* Critical Telemetry Panels */}
      <div className="hud-telemetry-grid">
        <div className="hud-telemetry-tile">
          <div className="hud-tile-label">TARGET ROADWAY</div>
          <div className="hud-tile-value">{activeAlertForUser.roadName}</div>
          <div className="hud-tile-sub">500-Meter Alert Envelope</div>
        </div>

        <div className="hud-telemetry-tile hud-telemetry-tile--eta">
          <div className="hud-tile-label">ESTIMATED ETA</div>
          <div className="hud-tile-value text-red">~{activeAlertForUser.estimatedArrivalMinutes} MIN</div>
          <div className="hud-tile-sub">Demo Travel Time Value</div>
        </div>

        <div className="hud-telemetry-tile">
          <div className="hud-tile-label">APPROACH DIRECTION</div>
          <div className="hud-tile-value">{activeAlertForUser.direction}</div>
          <div className="hud-tile-sub">{activeAlertForUser.ambulanceCallSign} ({activeAlertForUser.vehicleNumber})</div>
        </div>
      </div>

      {/* Safe Yielding Action Directives (Automotive Style) */}
      <div className="hud-yielding-directives">
        <div className="directives-header">
          <AlertTriangleIcon size={18} className="text-amber" />
          <span>MANDATORY EMERGENCY YIELDING INSTRUCTIONS</span>
        </div>

        <div className="directives-steps-row">
          <div className="directive-step">
            <span className="step-num">1</span>
            <div className="step-text">
              <strong>Check Mirrors & Slow Down</strong>
              <span>Signal your intention early. Do not brake violently.</span>
            </div>
          </div>

          <div className="directive-step">
            <span className="step-num">2</span>
            <div className="step-text">
              <strong>Safely Pull Over to Left</strong>
              <span>Move smoothly to the left shoulder or curb of the roadway.</span>
            </div>
          </div>

          <div className="directive-step">
            <span className="step-num">3</span>
            <div className="step-text">
              <strong>Keep Center Lane Clear</strong>
              <span>Remain stationary until the emergency vehicle passes completely.</span>
            </div>
          </div>
        </div>
      </div>

      <div className="hud-footer-disclaimer">
        * Prototype demonstration: In real-world operation, alerts are delivered via Web Push notifications only to opted-in users within 500m of the active corridor.
      </div>
    </div>
  );
}

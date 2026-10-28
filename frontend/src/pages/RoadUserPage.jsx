import React from 'react';
import { useSimulation } from '../context/useSimulation.js';
import { SubscriptionBanner } from '../components/roaduser/SubscriptionBanner.jsx';
import { AmbulanceAlertCard } from '../components/roaduser/AmbulanceAlertCard.jsx';
import { SafeYieldNotice } from '../components/roaduser/SafeYieldNotice.jsx';
import { SimulationMap } from '../components/map/SimulationMap.jsx';
import { Badge } from '../components/common/Badge.jsx';

/**
 * RoadUserPage: Mobile-First Road User Transit Alerts Interface
 *
 * Dedicated to participating drivers, riders, and pedestrians in Patna.
 * Clearly displays approaching vehicle status, safe yield instructions,
 * and 500m proximity targeting.
 */
export function RoadUserPage() {
  const { userCurrentRoad, tripStatus } = useSimulation();
  const isTripActive = tripStatus === 'ACTIVE';

  return (
    <div className="road-user-page">
      {/* Page Header */}
      <div className="page-header-row">
        <div>
          <div className="page-tag-row">
            <Badge variant="warning" size="sm">DEMO SIMULATION</Badge>
            <Badge variant={isTripActive ? 'critical' : 'neutral'} size="sm">
              {isTripActive ? 'PATNA EMERGENCY DISPATCH ACTIVE' : 'CORRIDOR QUIET'}
            </Badge>
          </div>
          <h1 className="page-main-heading">Road User Transit Alerts</h1>
          <p className="page-subheading">
            Receive timely, route-aware notifications when an emergency vehicle approaches your 500m sector.
          </p>
        </div>

        <div className="user-location-chip" title="Simulated Location">
          <span className="location-chip-label">YOUR LOCATION:</span>
          <span className="location-chip-value">{userCurrentRoad}</span>
        </div>
      </div>

      {/* Primary Alert Banner / Idle State */}
      <div className="road-user-alert-section">
        <AmbulanceAlertCard />
      </div>

      {/* Subscription Permission & Location Simulator */}
      <div className="road-user-sub-section">
        <SubscriptionBanner />
      </div>

      {/* Contextual Corridor Map */}
      <div className="road-user-map-section">
        <SimulationMap />
      </div>

      {/* Safe Yielding Protocol Guidance */}
      <div className="road-user-guide-section">
        <SafeYieldNotice />
      </div>
    </div>
  );
}

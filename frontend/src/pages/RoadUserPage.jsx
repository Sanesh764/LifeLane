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
  const { userCurrentRoad, userGpsLocation, tripStatus } = useSimulation();
  const isTripActive = tripStatus === 'ACTIVE';

  const hasLocation = Boolean(userCurrentRoad || (userGpsLocation?.lat && userGpsLocation?.lng));
  const locationDisplay = userCurrentRoad || (userGpsLocation?.lat ? `${userGpsLocation.lat.toFixed(5)}°N, ${userGpsLocation.lng.toFixed(5)}°E` : 'Location Not Shared');

  return (
    <div className="road-user-page">
      {/* Page Header */}
      <div className="page-header-row">
        <div>
          <div className="page-tag-row">
            <Badge variant={hasLocation ? 'clear' : 'warning'} size="sm">
              {hasLocation ? 'PROXIMITY ARMED' : 'LOCATION REQUIRED'}
            </Badge>
            <Badge variant={isTripActive ? 'critical' : 'neutral'} size="sm">
              {isTripActive ? 'EMERGENCY MISSION ACTIVE' : 'FLEET STANDBY'}
            </Badge>
          </div>
          <h1 className="page-main-heading">Road User Transit Alerts</h1>
          <p className="page-subheading">
            Receive timely, route-aware notifications when an emergency vehicle approaches your 2–5 km radius.
          </p>
        </div>

        <div
          className="user-location-chip"
          title={hasLocation ? 'Verified User Location' : 'Please enable location sharing below'}
        >
          <span className="location-chip-label">YOUR LOCATION:</span>
          <span className="location-chip-value" style={{ color: hasLocation ? '#0F766E' : '#94a3b8' }}>
            {locationDisplay}
          </span>
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

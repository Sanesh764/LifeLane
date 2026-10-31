import React, { useState } from 'react';
import { useSimulation } from '../../context/useSimulation.js';
import { SirenIcon, ArrowRightIcon, XIcon } from '../common/Icons.jsx';

/**
 * EmergencyBanner: Real-Time Global Active Mission Alert
 *
 * Visually connects active missions between the Driver Cockpit and Public Viewers.
 * Appears dynamically when an emergency ambulance trip is in progress.
 */
export function EmergencyBanner() {
  const {
    tripStatus,
    activeTrip,
    setActiveTab,
    setDriverSubTab,
    isDriverAuthenticated,
  } = useSimulation();

  const [isDismissed, setIsDismissed] = useState(false);
  const isTripActive = tripStatus === 'ACTIVE' || activeTrip?.status === 'ACTIVE';

  if (!isTripActive || isDismissed) {
    return null;
  }

  const destinationName =
    activeTrip?.destinationHospital?.name ||
    'PMCH Emergency Trauma Center';

  const handleOpenActiveMission = () => {
    if (isDriverAuthenticated) {
      setActiveTab('driver');
      setDriverSubTab('active');
      window.location.hash = 'driver/active';
    } else {
      setActiveTab('public');
      window.location.hash = 'public';
    }
  };

  return (
    <aside className="global-emergency-banner" role="alert" aria-live="assertive">
      <div className="emergency-banner-inner">
        <div className="emergency-banner-left">
          <span className="emergency-beacon-pulse" />
          <SirenIcon size={16} className="text-white" />
          <span className="emergency-banner-tag">ACTIVE MISSION</span>
          <span className="emergency-banner-message">
            Ambulance 108 en route to <strong>{destinationName}</strong>
          </span>
        </div>

        <div className="emergency-banner-actions">
          <button
            type="button"
            className="emergency-banner-cta-btn"
            onClick={handleOpenActiveMission}
          >
            <span>{isDriverAuthenticated ? 'Open Cockpit' : 'Track on Live Map'}</span>
            <ArrowRightIcon size={14} />
          </button>

          <button
            type="button"
            className="emergency-banner-close-btn"
            onClick={() => setIsDismissed(true)}
            aria-label="Dismiss banner"
            title="Dismiss banner"
          >
            <XIcon size={16} />
          </button>
        </div>
      </div>
    </aside>
  );
}

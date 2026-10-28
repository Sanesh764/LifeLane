import React from 'react';
import { useSimulation } from '../context/useSimulation.js';
import { DriverSidebar } from '../components/driver/DriverSidebar.jsx';
import { DriverHome } from '../components/driver/portal/DriverHome.jsx';
import { StartEmergency } from '../components/driver/portal/StartEmergency.jsx';
import { ActiveMission } from '../components/driver/portal/ActiveMission.jsx';
import { TripHistory } from '../components/driver/portal/TripHistory.jsx';
import { DriverTraffic } from '../components/driver/portal/DriverTraffic.jsx';
import { DriverNotifications } from '../components/driver/portal/DriverNotifications.jsx';
import { DriverSettings } from '../components/driver/portal/DriverSettings.jsx';

/**
 * DriverPage: Complete Driver Portal Layout
 *
 * Implements a persistent left sidebar on desktop (>= 900px)
 * and an accessible mobile sub-navigation strip (< 900px),
 * rendering dedicated views for:
 * 1. Home Dashboard
 * 2. Start Emergency Flow
 * 3. Active Mission Cockpit (with Leaflet Map)
 * 4. Trip History
 * 5. Traffic Reports
 * 6. Notifications
 * 7. Unit Settings
 */
export function DriverPage() {
  const { driverSubTab, navigateToDriverSubTab, tripStatus } = useSimulation();

  const isTripActive = tripStatus === 'ACTIVE';

  const subTabs = [
    { id: 'home', label: 'Home' },
    { id: 'start', label: 'Start Emergency' },
    { id: 'active', label: isTripActive ? 'Active Mission ●' : 'Active Mission' },
    { id: 'history', label: 'Trip History' },
    { id: 'traffic', label: 'Traffic Reports' },
    { id: 'notifications', label: 'Notifications' },
    { id: 'settings', label: 'Settings' },
  ];

  const handleMobileSubTab = (id) => {
    navigateToDriverSubTab(id);
  };

  return (
    <div className="driver-portal-layout">
      {/* Persistent Left Sidebar on Desktop (>= 900px) */}
      <DriverSidebar />

      {/* Main Content Area */}
      <div className="driver-portal-main">
        {/* Mobile Horizontal Sub-Navigation Strip (< 900px) */}
        <div className="driver-mobile-subnav-strip" aria-label="Driver Mobile Navigation">
          {subTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`mobile-subnav-pill ${driverSubTab === tab.id ? 'is-active' : ''}`}
              onClick={() => handleMobileSubTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Dynamic Sub-Page Content */}
        <div className="driver-portal-view-container">
          {driverSubTab === 'home' && <DriverHome />}
          {driverSubTab === 'start' && <StartEmergency />}
          {driverSubTab === 'active' && <ActiveMission />}
          {driverSubTab === 'history' && <TripHistory />}
          {driverSubTab === 'traffic' && <DriverTraffic />}
          {driverSubTab === 'notifications' && <DriverNotifications />}
          {driverSubTab === 'settings' && <DriverSettings />}
        </div>
      </div>
    </div>
  );
}

import React from 'react';
import { useSimulation } from '../../context/useSimulation.js';
import {
  HomeIcon,
  SirenIcon,
  RouteIcon,
  HistoryIcon,
  FileTextIcon,
  BellIcon,
  SettingsIcon,
  ShieldCheckIcon,
  LogOutIcon,
} from '../common/Icons.jsx';
import { Badge } from '../common/Badge.jsx';

export function DriverSidebar() {
  const {
    driverSubTab,
    navigateToDriverSubTab,
    tripStatus,
    selectedVehicle,
    currentUser,
    logout,
    tripHistory,
    trafficReports,
    isFocusedMissionMode,
    toggleFocusedMissionMode,
  } = useSimulation();

  const isTripActive = tripStatus === 'ACTIVE';
  const isCollapsed = isTripActive && isFocusedMissionMode && driverSubTab === 'active';

  const navItems = [
    {
      id: 'home',
      label: 'Home',
      icon: HomeIcon,
      badge: null,
    },
    {
      id: 'start',
      label: 'Start Emergency',
      icon: SirenIcon,
      badge: isTripActive ? 'IN PROGRESS' : 'NEW',
      badgeVariant: isTripActive ? 'warning' : 'clear',
    },
    {
      id: 'active',
      label: 'Active Mission',
      icon: RouteIcon,
      badge: isTripActive ? 'LIVE' : null,
      badgeVariant: 'critical',
      pulse: isTripActive,
    },
    {
      id: 'history',
      label: 'Trip History',
      icon: HistoryIcon,
      badge: tripHistory ? String(tripHistory.length) : '0',
      badgeVariant: 'neutral',
    },
    {
      id: 'traffic',
      label: 'Traffic Reports',
      icon: FileTextIcon,
      badge: trafficReports ? String(trafficReports.length) : null,
      badgeVariant: 'warning',
    },
    {
      id: 'notifications',
      label: 'Notifications',
      icon: BellIcon,
      badge: null,
    },
    {
      id: 'settings',
      label: 'Settings',
      icon: SettingsIcon,
      badge: null,
    },
  ];

  const handleNav = (id) => {
    navigateToDriverSubTab(id);
  };

  return (
    <aside
      className={`driver-portal-sidebar ${isCollapsed ? 'is-collapsed-rail' : ''}`}
      aria-label="Driver Portal Navigation"
    >
      {/* Unit Status & Operational Ribbon */}
      <div className="driver-sidebar-header">
        <div className="sidebar-unit-title-row">
          <span className="sidebar-unit-label">EMERGENCY DISPATCH</span>
          <Badge
            variant={isTripActive ? 'critical' : 'clear'}
            size="sm"
            pulse={isTripActive}
          >
            {isTripActive ? 'MISSION ACTIVE' : 'STANDBY'}
          </Badge>
        </div>

        <div className="sidebar-unit-card">
          <div className="sidebar-unit-callsign">{selectedVehicle.callSign}</div>
          <div className="sidebar-unit-plate">
            <span className="plate-tag">PATNA 108</span>
            <span className="plate-num">{selectedVehicle.vehicleNumber}</span>
          </div>
        </div>
      </div>

      {/* Primary Navigation Menu */}
      <nav className="driver-sidebar-nav" aria-label="Portal Views">
        <ul className="driver-sidebar-list">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = driverSubTab === item.id;
            return (
              <li key={item.id} className="driver-sidebar-item">
                <button
                  type="button"
                  className={`driver-nav-link ${isActive ? 'is-active' : ''}`}
                  onClick={() => handleNav(item.id)}
                  aria-current={isActive ? 'page' : undefined}
                  title={item.label}
                >
                  <span className="driver-nav-icon-wrap">
                    <Icon size={18} />
                  </span>
                  <span className="driver-nav-label">{item.label}</span>
                  {item.badge && (
                    <span className="driver-nav-badge-wrap">
                      <Badge
                        variant={item.badgeVariant || 'neutral'}
                        size="sm"
                        pulse={item.pulse}
                      >
                        {item.badge}
                      </Badge>
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Driver Identity & Session Logout Footer */}
      <div className="driver-sidebar-footer">
        {isTripActive && (
          <button
            type="button"
            className="sidebar-collapse-toggle-btn"
            onClick={toggleFocusedMissionMode}
            title={isCollapsed ? 'Expand sidebar menu' : 'Collapse sidebar into compact rail'}
          >
            <span>{isCollapsed ? '⇥' : '⇤ Minimize Sidebar'}</span>
          </button>
        )}

        <div className="driver-profile-block">
          <div className="driver-avatar-circle">
            <ShieldCheckIcon size={16} className="text-mint" />
          </div>
          <div className="driver-meta">
            <div className="driver-name-text">
              {currentUser?.driverName || 'Officer Amitabh Sen'}
            </div>
            <div className="driver-badge-sub">
              {currentUser?.driverId || 'BR-DRV-10842'} · Pilot Driver
            </div>
          </div>
        </div>

        <button
          type="button"
          className="driver-logout-btn"
          onClick={logout}
          title="Sign out of Driver Portal"
          aria-label="Sign out of Driver Portal"
        >
          <LogOutIcon size={16} />
          <span>Logout</span>
        </button>
      </div>
    </aside>
  );
}

import React from 'react';
import { useSimulation } from '../../context/useSimulation.js';
import { SirenIcon, Volume2Icon, VolumeXIcon, RefreshCwIcon, ShieldCheckIcon, LogOutIcon } from '../common/Icons.jsx';

/**
 * Header: Clean, Uncluttered Operations Navigation
 *
 * Provides distinct views for:
 * - Public Overview (landing experience)
 * - Driver Operations Cockpit (authenticated control room)
 * - Road User Alerts (mobile-first citizen experience)
 * - Report Traffic (one-tap observations)
 */
export function Header() {
  const {
    activeTab,
    setActiveTab,
    tripStatus,
    isMuted,
    setIsMuted,
    resetSimulation,
    currentUser,
    isAuthenticated,
    logout,
  } = useSimulation();

  const isTripActive = tripStatus === 'ACTIVE';

  const handleDriverNavClick = () => {
    if (isAuthenticated) {
      setActiveTab('driver');
      window.location.hash = 'driver';
    } else {
      setActiveTab('login');
      window.location.hash = 'login';
    }
  };

  return (
    <header className="app-header">
      <div className="app-header__container">
        {/* Brand Identity */}
        <div
          className="app-header__brand"
          onClick={() => {
            setActiveTab('overview');
            window.location.hash = 'overview';
          }}
          title="Return to AmbuRoute Overview"
        >
          <div className={`brand-mark ${isTripActive ? 'brand-mark--emergency' : ''}`}>
            <SirenIcon size={22} className="brand-mark__icon" />
          </div>
          <div className="brand-text-block">
            <div className="brand-title">AmbuRoute</div>
            <div className="brand-subtitle">Emergency Operations · Patna Pilot</div>
          </div>
        </div>

        {/* Navigation Links */}
        <nav className="app-nav" aria-label="Main Navigation">
          <button
            type="button"
            className={`app-nav__item ${activeTab === 'overview' ? 'is-active' : ''}`}
            onClick={() => {
              setActiveTab('overview');
              window.location.hash = 'overview';
            }}
          >
            Overview
          </button>
          <button
            type="button"
            className={`app-nav__item ${activeTab === 'driver' || activeTab === 'login' ? 'is-active' : ''}`}
            onClick={handleDriverNavClick}
          >
            Driver Cockpit
          </button>
          <button
            type="button"
            className={`app-nav__item ${activeTab === 'alerts' ? 'is-active' : ''}`}
            onClick={() => {
              setActiveTab('alerts');
              window.location.hash = 'alerts';
            }}
          >
            Road User Alerts
          </button>
          <button
            type="button"
            className={`app-nav__item ${activeTab === 'report' ? 'is-active' : ''}`}
            onClick={() => {
              setActiveTab('report');
              window.location.hash = 'report';
            }}
          >
            Report Traffic
          </button>
        </nav>

        {/* Global Operational Controls & Authentication */}
        <div className="app-header__actions">
          {isAuthenticated ? (
            <div className="header-driver-profile">
              <div
                className="driver-profile-pill"
                title={`Logged in: ${currentUser.driverName} (${currentUser.vehicleNumber})`}
              >
                <ShieldCheckIcon size={14} className="text-mint" />
                <span className="driver-name">{currentUser.driverName}</span>
                <span className="driver-badge-num">{currentUser.vehicleNumber}</span>
              </div>
              <button
                type="button"
                className="action-icon-btn action-icon-btn--logout"
                onClick={logout}
                title="Log out driver session"
                aria-label="Log out driver session"
              >
                <LogOutIcon size={16} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="header-login-btn"
              onClick={() => {
                setActiveTab('login');
                window.location.hash = 'login';
              }}
              title="Driver Login"
            >
              <ShieldCheckIcon size={14} />
              <span>Driver Login</span>
            </button>
          )}

          <div className="header-icon-toggles">
            <button
              type="button"
              className={`action-icon-btn ${isMuted ? 'action-icon-btn--muted' : ''}`}
              onClick={() => setIsMuted(!isMuted)}
              title={isMuted ? 'Unmute voice route assistance' : 'Mute voice route assistance'}
              aria-label={isMuted ? 'Unmute voice route assistance' : 'Mute voice route assistance'}
            >
              {isMuted ? <VolumeXIcon size={16} /> : <Volume2Icon size={16} />}
            </button>
            <button
              type="button"
              className="action-icon-btn"
              onClick={resetSimulation}
              title="Reset demonstration state"
              aria-label="Reset demonstration state"
            >
              <RefreshCwIcon size={16} />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}

import React, { useState, useEffect } from 'react';
import { useSimulation } from '../../context/useSimulation.js';
import {
  AmbulanceIcon,
  Volume2Icon,
  VolumeXIcon,
  RefreshCwIcon,
  ShieldCheckIcon,
  LogOutIcon,
  MenuIcon,
  XIcon,
} from '../common/Icons.jsx';

/**
 * Header: Clean, Uncluttered Operations Navigation
 *
 * Provides distinct views for:
 * - Public Overview (landing experience)
 * - Driver Operations Cockpit (authenticated control room)
 * - Road User Alerts (mobile-first citizen experience)
 * - Report Traffic (one-tap observations)
 *
 * Mobile Responsiveness:
 * - Responsive hamburger drawer menu on screens < 900px
 * - Accessible toggle, outside-click and escape key dismissal
 * - Smooth state transitions without horizontal overflow
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

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const isTripActive = tripStatus === 'ACTIVE';

  // Close mobile menu on Escape key press
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isMobileMenuOpen) {
        setIsMobileMenuOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isMobileMenuOpen]);

  // Prevent background scroll when mobile drawer is open
  useEffect(() => {
    if (isMobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isMobileMenuOpen]);

  const handleNavClick = (tab) => {
    setActiveTab(tab);
    window.location.hash = tab;
    setIsMobileMenuOpen(false);
  };

  const handleDriverNavClick = () => {
    if (isAuthenticated) {
      handleNavClick('driver/home');
    } else {
      handleNavClick('login');
    }
  };

  return (
    <header className="app-header">
      <div className="app-header__container">
        {/* Brand Identity */}
        <div
          className="app-header__brand"
          onClick={() => handleNavClick('overview')}
          title="Return to AmbuRoute Overview"
        >
          <div className={`brand-mark ${isTripActive ? 'brand-mark--emergency' : ''}`}>
            <AmbulanceIcon size={22} className="brand-mark__icon" />
          </div>
          <div className="brand-text-block">
            <div className="brand-title">AmbuRoute</div>
            <div className="brand-subtitle">Emergency Operations · Live Transit</div>
          </div>
        </div>

        {/* Desktop Navigation Links (>= 900px) */}
        <nav className="app-nav app-nav--desktop" aria-label="Main Desktop Navigation">
          <button
            type="button"
            className={`app-nav__item ${activeTab === 'overview' ? 'is-active' : ''}`}
            onClick={() => handleNavClick('overview')}
          >
            Overview
          </button>
          <button
            type="button"
            className={`app-nav__item ${activeTab === 'driver' || activeTab === 'login' ? 'is-active' : ''}`}
            onClick={handleDriverNavClick}
          >
            Driver Portal
          </button>
          <button
            type="button"
            className={`app-nav__item ${activeTab === 'alerts' ? 'is-active' : ''}`}
            onClick={() => handleNavClick('alerts')}
          >
            Road User Alerts
          </button>
          <button
            type="button"
            className={`app-nav__item ${activeTab === 'report' ? 'is-active' : ''}`}
            onClick={() => handleNavClick('report')}
          >
            Report Traffic
          </button>
        </nav>

        {/* Global Operational Controls & Authentication */}
        <div className="app-header__actions">
          {/* Desktop Driver Auth Button / Pill */}
          <div className="header-auth-desktop">
            {isAuthenticated ? (
              <div className="header-driver-profile">
                <div
                  className="driver-profile-pill"
                  title={`Logged in: ${currentUser?.driverName || 'Driver'} (${currentUser?.vehicleNumber || ''})`}
                >
                  <ShieldCheckIcon size={14} className="text-mint" />
                  <span className="driver-name">{currentUser?.driverName || 'Driver'}</span>
                  <span className="driver-badge-num">{currentUser?.vehicleNumber || ''}</span>
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
                onClick={() => handleNavClick('login')}
                title="Driver Login"
              >
                <ShieldCheckIcon size={14} />
                <span>Driver Login</span>
              </button>
            )}
          </div>

          {/* Quick Voice Assistance & Demo Reset Toggles */}
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

          {/* Mobile Menu Hamburger Toggle (< 900px) */}
          <button
            type="button"
            className="mobile-menu-toggle-btn"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            aria-label={isMobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={isMobileMenuOpen}
            aria-controls="mobile-navigation-drawer"
          >
            {isMobileMenuOpen ? <XIcon size={22} /> : <MenuIcon size={22} />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer Backdrop */}
      {isMobileMenuOpen && (
        <div
          className="mobile-nav-backdrop"
          onClick={() => setIsMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Mobile Navigation Drawer */}
      <div
        id="mobile-navigation-drawer"
        className={`mobile-nav-drawer ${isMobileMenuOpen ? 'is-open' : ''}`}
        role="dialog"
        aria-label="Mobile Navigation Menu"
        aria-modal={isMobileMenuOpen}
      >
        <div className="mobile-drawer-header">
          <div className="mobile-drawer-title">Navigation & Ops</div>
          <button
            type="button"
            className="mobile-drawer-close"
            onClick={() => setIsMobileMenuOpen(false)}
            aria-label="Close menu"
          >
            <XIcon size={20} />
          </button>
        </div>

        <nav className="mobile-drawer-nav">
          <button
            type="button"
            className={`mobile-nav-item ${activeTab === 'overview' ? 'is-active' : ''}`}
            onClick={() => handleNavClick('overview')}
          >
            <span>Overview</span>
            {activeTab === 'overview' && <span className="active-dot" />}
          </button>
          <button
            type="button"
            className={`mobile-nav-item ${activeTab === 'driver' || activeTab === 'login' ? 'is-active' : ''}`}
            onClick={handleDriverNavClick}
          >
            <span>Driver Portal</span>
            {(activeTab === 'driver' || activeTab === 'login') && <span className="active-dot" />}
          </button>
          <button
            type="button"
            className={`mobile-nav-item ${activeTab === 'alerts' ? 'is-active' : ''}`}
            onClick={() => handleNavClick('alerts')}
          >
            <span>Road User Alerts</span>
            {activeTab === 'alerts' && <span className="active-dot" />}
          </button>
          <button
            type="button"
            className={`mobile-nav-item ${activeTab === 'report' ? 'is-active' : ''}`}
            onClick={() => handleNavClick('report')}
          >
            <span>Report Traffic</span>
            {activeTab === 'report' && <span className="active-dot" />}
          </button>
        </nav>

        {/* Mobile Authentication & Driver Session Status */}
        <div className="mobile-drawer-footer">
          {isAuthenticated ? (
            <div className="mobile-driver-auth-card">
              <div className="mobile-driver-meta">
                <ShieldCheckIcon size={16} className="text-mint" />
                <div className="mobile-driver-info">
                  <div className="mobile-driver-name">{currentUser?.driverName || 'Driver'}</div>
                  <div className="mobile-driver-badge">
                    {currentUser?.callSign || ''} · {currentUser?.vehicleNumber || ''}
                  </div>
                </div>
              </div>
              <button
                type="button"
                className="mobile-logout-btn"
                onClick={() => {
                  logout();
                  setIsMobileMenuOpen(false);
                }}
              >
                <LogOutIcon size={16} />
                <span>Log Out</span>
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="mobile-login-btn"
              onClick={() => handleNavClick('login')}
            >
              <ShieldCheckIcon size={16} />
              <span>Driver Login</span>
            </button>
          )}

          {isTripActive && (
            <div className="mobile-drawer-mission-badge">
              <span className="pulsing-red-dot" />
              <span>AMBULANCE MISSION ACTIVE</span>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

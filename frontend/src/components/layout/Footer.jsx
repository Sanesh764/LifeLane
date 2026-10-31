import React from 'react';
import { useSimulation } from '../../context/useSimulation.js';
import {
  AmbulanceIcon,
  ShieldCheckIcon,
  RouteIcon,
  BellIcon,
  SparklesIcon,
  AlertTriangleIcon,
  RadioIcon,
  CheckCircle2Icon,
} from '../common/Icons.jsx';

/**
 * Modernized 4-Column Healthcare Technology Footer
 *
 * Provides organized navigation, portal shortcuts, safety compliance notices,
 * and system transparency for judges and road users.
 */
export function Footer() {
  const {
    setActiveTab,
    setDriverSubTab,
    isDriverAuthenticated,
  } = useSimulation();

  const handleNavClick = (tab, subTab = null, sectionId = null) => {
    setActiveTab(tab);
    if (subTab) {
      setDriverSubTab(subTab);
      window.location.hash = `${tab}/${subTab}`;
    } else {
      window.location.hash = tab;
    }

    if (sectionId && tab === 'overview') {
      setTimeout(() => {
        const el = document.getElementById(sectionId);
        if (el) el.scrollIntoView({ behavior: 'smooth' });
      }, 50);
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  return (
    <footer className="app-footer">
      <div className="app-footer__container">
        {/* 4-Column Modern Layout */}
        <div className="modern-footer-grid">
          {/* Column 1: Brand & Core Mission */}
          <div className="footer-col footer-col--brand">
            <div
              className="footer-brand-title"
              onClick={() => handleNavClick('overview')}
              style={{ cursor: 'pointer' }}
            >
              <div className="brand-mark brand-mark--sm">
                <AmbulanceIcon size={18} />
              </div>
              <span className="footer-brand-name">AmbuRoute</span>
            </div>

            <p className="footer-brand-desc">
              Community-powered ambulance transit assistance. Combining route-aware 500-metre corridor yield notifications with corroborated traffic intelligence to protect the golden hour.
            </p>

            <div className="footer-tech-chips">
              <span className="footer-tech-chip">OpenStreetMap Tiles</span>
              <span className="footer-tech-chip">W3C Web Push</span>
              <span className="footer-tech-chip">Meta Muse Spark AI</span>
            </div>
          </div>

          {/* Column 2: Platform Tour & Architecture */}
          <div className="footer-col">
            <h4 className="footer-heading">Product Overview</h4>
            <ul className="footer-links-list">
              <li>
                <button
                  type="button"
                  className="footer-link-btn"
                  onClick={() => handleNavClick('overview', null, 'how-it-works')}
                >
                  How AmbuRoute Works
                </button>
              </li>
              <li>
                <button
                  type="button"
                  className="footer-link-btn"
                  onClick={() => handleNavClick('overview', null, 'ai-routing')}
                >
                  AI Route Optimization
                </button>
              </li>
              <li>
                <button
                  type="button"
                  className="footer-link-btn"
                  onClick={() => handleNavClick('overview', null, 'features')}
                >
                  All 8 Implemented Features
                </button>
              </li>
              <li>
                <button
                  type="button"
                  className="footer-link-btn"
                  onClick={() => handleNavClick('overview', null, 'notifications')}
                >
                  Emergency Alert Pipeline
                </button>
              </li>
              <li>
                <button
                  type="button"
                  className="footer-link-btn"
                  onClick={() => handleNavClick('overview', null, 'impact')}
                >
                  Mission & Impact Pillars
                </button>
              </li>
            </ul>
          </div>

          {/* Column 3: Live Portals & Access */}
          <div className="footer-col">
            <h4 className="footer-heading">Platform Portals</h4>
            <ul className="footer-links-list">
              <li>
                <button
                  type="button"
                  className="footer-link-btn"
                  onClick={() => handleNavClick('public')}
                >
                  <RouteIcon size={14} className="text-mint" />
                  <span>Public Transit Feed</span>
                </button>
              </li>
              <li>
                <button
                  type="button"
                  className="footer-link-btn"
                  onClick={() => handleNavClick(isDriverAuthenticated ? 'driver' : 'login', isDriverAuthenticated ? 'home' : 'driver')}
                >
                  <ShieldCheckIcon size={14} className="text-teal" />
                  <span>Ambulance Driver Cockpit</span>
                </button>
              </li>
              <li>
                <button
                  type="button"
                  className="footer-link-btn"
                  onClick={() => handleNavClick('alerts')}
                >
                  <BellIcon size={14} className="text-amber" />
                  <span>Corridor Yield Alerts</span>
                </button>
              </li>
              <li>
                <button
                  type="button"
                  className="footer-link-btn"
                  onClick={() => handleNavClick('report')}
                >
                  <AlertTriangleIcon size={14} className="text-red" />
                  <span>Report Road Condition</span>
                </button>
              </li>
              <li>
                <button
                  type="button"
                  className="footer-link-btn"
                  onClick={() => handleNavClick('login')}
                >
                  <span>Sign In / Citizen Registration</span>
                </button>
              </li>
            </ul>
          </div>

          {/* Column 4: Safety & Privacy Commitments */}
          <div className="footer-col footer-col--safety">
            <h4 className="footer-heading">Safety & Governance</h4>
            <div className="footer-safety-card">
              <div className="safety-item">
                <CheckCircle2Icon size={15} className="text-mint" />
                <span><strong>Driver Authority:</strong> AI supplies traffic suggestions; licensed human drivers retain sole detour confirmation authority.</span>
              </div>
              <div className="safety-item">
                <ShieldCheckIcon size={15} className="text-teal" />
                <span><strong>Privacy-First:</strong> No background location tracking. Push subscriptions use standard anonymized W3C tokens.</span>
              </div>
              <div className="safety-status-item">
                <span className="status-live-dot" />
                <span>All Core Services Operational</span>
              </div>
            </div>
          </div>
        </div>

        {/* Clean Bottom Copyright Bar */}
        <div className="app-footer__bottom">
          <span>AmbuRoute © 2026. Community-Powered Ambulance Assistance Platform.</span>
          <div className="footer-bottom-meta">
            <span>Patna Pilot Corridor</span>
            <span>·</span>
            <span>Hackathon MVP Edition</span>
          </div>
        </div>
      </div>
    </footer>
  );
}

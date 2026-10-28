import React from 'react';
import { ShieldCheckIcon, RadioIcon } from '../common/Icons.jsx';

export function Footer() {
  return (
    <footer className="app-footer">
      <div className="app-footer__container">
        <div className="app-footer__row">
          <div className="app-footer__col">
            <div className="footer-title">
              <ShieldCheckIcon size={18} />
              <span>AmbuRoute Platform</span>
            </div>
            <p className="footer-text">
              Dual-feature emergency transit assistance for India. Combines 500-metre route-aware ambulance alerts with community traffic reporting and driver-confirmed alternative routing.
            </p>
          </div>

          <div className="app-footer__col app-footer__col--meta">
            <div className="footer-meta-item">
              <RadioIcon size={16} />
              <span><strong>Prototype Alert Radius:</strong> Configurable 500m default along active travel path.</span>
            </div>
            <div className="footer-meta-item">
              <span><strong>Safety Notice:</strong> Simulated demonstration data. Driver retains sole authority over route confirmation.</span>
            </div>
          </div>
        </div>

        <div className="app-footer__bottom">
          <span>AmbuRoute © 2026. Designed with Signal & Motion principles.</span>
          <span>Space Grotesk · IBM Plex Sans · IBM Plex Mono</span>
        </div>
      </div>
    </footer>
  );
}

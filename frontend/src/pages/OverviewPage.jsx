import React from 'react';
import { useSimulation } from '../context/useSimulation.js';
import { Button } from '../components/common/Button.jsx';
import { Badge } from '../components/common/Badge.jsx';
import { Card } from '../components/common/Card.jsx';
import {
  SirenIcon,
  BellIcon,
  RouteIcon,
  ArrowRightIcon,
  ShieldCheckIcon,
  RadioIcon,
  CheckCircle2Icon,
  AlertTriangleIcon,
  Volume2Icon,
  MapPinIcon,
  CheckCircleIcon,
  OctagonAlertIcon,
  HelpCircleIcon,
} from '../components/common/Icons.jsx';

/**
 * OverviewPage: Welcoming, Professional Public Landing Interface
 *
 * Distinct from the dark control-room operations screen.
 * Uses warm ivory surfaces (#FAF8F5, #FFFFFF), graphite text, signal amber accents,
 * with honest DEMO SIMULATION indicators and no fabricated claims.
 */
export function OverviewPage() {
  const {
    setActiveTab,
    tripStatus,
    startTrip,
    isAuthenticated,
  } = useSimulation();

  const isTripActive = tripStatus === 'ACTIVE';

  const handleStartAmbulanceClick = () => {
    if (isTripActive) {
      setActiveTab('driver');
      window.location.hash = 'driver';
      return;
    }

    if (isAuthenticated) {
      startTrip();
      setActiveTab('driver');
      window.location.hash = 'driver';
    } else {
      // Directs to login with context, sets pendingAction = 'START_AMBULANCE'
      startTrip();
    }
  };

  const handleScrollToHowItWorks = () => {
    const el = document.getElementById('how-it-works-section');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="public-homepage">
      {/* ---------------------------------------------------------------------
         Hero Section
         --------------------------------------------------------------------- */}
      <section className="home-hero">
        <div className="home-hero__header">
          <div className="home-hero__badge-row">
            <Badge variant="warning" size="sm">DEMO SIMULATION · PATNA PILOT</Badge>
            {isTripActive && (
              <Badge variant="critical" pulse size="sm">SIMULATED TRIP IN PROGRESS</Badge>
            )}
          </div>

          <h1 className="home-hero__title">
            Route-Aware Ambulance Alerts & Community Transit Intelligence
          </h1>

          <p className="home-hero__description">
            AmbuRoute helps ambulances navigate congested Indian roadways by notifying participating road users within a 500-metre corridor ahead to yield safely, while validating crowd observations to provide driver-confirmed route assistance.
          </p>

          <div className="home-hero__actions">
            {!isTripActive ? (
              <Button
                variant="critical"
                size="lg"
                icon={SirenIcon}
                onClick={handleStartAmbulanceClick}
                className="btn-hero-primary"
              >
                Start Ambulance
              </Button>
            ) : (
              <Button
                variant="critical"
                size="lg"
                icon={RouteIcon}
                pulse
                onClick={() => {
                  setActiveTab('driver');
                  window.location.hash = 'driver';
                }}
                className="btn-hero-primary"
              >
                Ambulance Active · Open Cockpit
              </Button>
            )}

            <Button
              variant="outline"
              size="lg"
              onClick={handleScrollToHowItWorks}
              className="btn-hero-secondary"
            >
              How It Works &darr;
            </Button>
          </div>
        </div>

        {/* Visual Workflow Preview (Realistic Flow Diagram, Not a Fake BI Dashboard) */}
        <div className="home-hero__workflow-preview">
          <div className="workflow-preview-card">
            <div className="preview-step">
              <div className="preview-step-icon preview-step-icon--dispatch">
                <SirenIcon size={22} className="text-red" />
              </div>
              <div className="preview-step-content">
                <div className="preview-step-tag">STEP 1</div>
                <div className="preview-step-name">Authorized Dispatch</div>
                <div className="preview-step-desc">Driver begins mission to PMCH Trauma Base</div>
              </div>
            </div>

            <div className="preview-arrow">&rarr;</div>

            <div className="preview-step">
              <div className="preview-step-icon preview-step-icon--alert">
                <BellIcon size={22} className="text-amber" />
              </div>
              <div className="preview-step-content">
                <div className="preview-step-tag">STEP 2</div>
                <div className="preview-step-name">500m Corridor Alert</div>
                <div className="preview-step-desc">Nearby road users receive timely yield notice</div>
              </div>
            </div>

            <div className="preview-arrow">&rarr;</div>

            <div className="preview-step">
              <div className="preview-step-icon preview-step-icon--detour">
                <RouteIcon size={22} className="text-mint" />
              </div>
              <div className="preview-step-content">
                <div className="preview-step-tag">STEP 3</div>
                <div className="preview-step-name">Driver Confirmed Detour</div>
                <div className="preview-step-desc">Bypass congestion via Atal Path & Marine Drive</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------------
         Feature B: Public Homepage Quick Action: Report a Road Condition
         --------------------------------------------------------------------- */}
      <section className="home-quick-report-section" aria-label="Quick Road Condition Reporting">
        <div className="quick-report-banner">
          <div className="quick-report-content">
            <div className="quick-report-badge-row">
              <Badge variant="warning" size="sm">CITIZEN TRANSIT INTELLIGENCE</Badge>
              <Badge variant="neutral" size="sm">PATNA CORRIDOR</Badge>
            </div>

            <h2 className="quick-report-title">Report a Road Condition</h2>

            <p className="quick-report-desc">
              Notice traffic congestion or a blocked road in Patna? Share a road-condition observation to help improve ambulance route awareness.
            </p>

            <div className="quick-report-categories">
              <span className="category-pill category-pill--clear">
                <CheckCircleIcon size={14} className="text-mint" />
                <span>Clear Flowing</span>
              </span>
              <span className="category-pill category-pill--heavy">
                <AlertTriangleIcon size={14} className="text-amber" />
                <span>Heavy Traffic</span>
              </span>
              <span className="category-pill category-pill--blocked">
                <OctagonAlertIcon size={14} className="text-red" />
                <span>Road Blocked</span>
              </span>
              <span className="category-pill category-pill--assess">
                <HelpCircleIcon size={14} />
                <span>Cannot Assess</span>
              </span>
            </div>

            <div className="quick-report-actions">
              <Button
                variant="primary"
                size="md"
                icon={AlertTriangleIcon}
                onClick={() => {
                  setActiveTab('report');
                  window.location.hash = 'report';
                }}
                className="btn-quick-report"
              >
                Report Traffic
              </Button>

              <Button
                variant="outline"
                size="md"
                icon={BellIcon}
                onClick={() => {
                  setActiveTab('alerts');
                  window.location.hash = 'alerts';
                }}
                className="btn-quick-alerts"
              >
                Enable Ambulance Alerts
              </Button>
            </div>
          </div>

          <div className="quick-report-side-card">
            <div className="side-card-header">
              <span className="side-card-tag">PUBLIC PARTICIPATION</span>
              <span className="side-card-status">NO LOGIN REQUIRED</span>
            </div>
            <div className="side-card-body">
              <div className="side-card-stat">
                <strong>4 Supported Categories</strong>
                <span>One-tap submissions for instant routing awareness</span>
              </div>
              <div className="side-card-stat">
                <strong>Direction & Freshness Checks</strong>
                <span>Stale & unverified entries are filtered automatically</span>
              </div>
            </div>
            <div className="side-card-footer">
              Ambulance drivers review verified observations before confirming detours.
            </div>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------------
         Two Core MVP Features
         --------------------------------------------------------------------- */}
      <section className="home-features-section">
        <div className="section-title-wrap">
          <h2 className="section-heading">Two Core MVP Capabilities</h2>
          <p className="section-subheading">
            Focused strictly on emergency corridor clearance and driver-in-the-loop navigation assistance.
          </p>
        </div>

        <div className="home-features-grid">
          {/* Feature 1 */}
          <Card variant="ivory" className="home-feature-card">
            <div className="feature-icon-badge">
              <SirenIcon size={26} className="text-red" />
            </div>
            <div className="feature-card-content">
              <div className="feature-meta-tag">FEATURE 1</div>
              <h3 className="feature-card-title">Route-Aware Ambulance Alerts</h3>
              <p className="feature-card-text">
                When an emergency trip begins, the system targets opted-in web/PWA subscribers situated along the ambulance’s upcoming path (500-metre envelope). Devices receive timely alerts containing the road name, direction, and clear instructions to pull over safely.
              </p>
              <div className="feature-pill-list">
                <span className="feature-pill">500m Target Envelope</span>
                <span className="feature-pill">Direction-Aware Filtering</span>
                <span className="feature-pill">Opt-In Subscriptions Only</span>
              </div>
              <Button
                variant="outline"
                size="sm"
                icon={ArrowRightIcon}
                iconPosition="right"
                onClick={() => {
                  setActiveTab('alerts');
                  window.location.hash = 'alerts';
                }}
              >
                Inspect Road User Alert Screen
              </Button>
            </div>
          </Card>

          {/* Feature 2 */}
          <Card variant="ivory" className="home-feature-card">
            <div className="feature-icon-badge">
              <RouteIcon size={26} className="text-amber" />
            </div>
            <div className="feature-card-content">
              <div className="feature-meta-tag">FEATURE 2</div>
              <h3 className="feature-card-title">Community Traffic & Voice Route Assistance</h3>
              <p className="feature-card-text">
                Participating road users submit one-tap observations (<code>CLEAR</code>, <code>TRAFFIC_HIGH</code>, <code>ROAD_BLOCKED</code>, <code>CANNOT_ASSESS</code>). AmbuRoute compares suitable routes and delivers a voice recommendation. The driver confirms or rejects the detour.
              </p>
              <div className="feature-pill-list">
                <span className="feature-pill">One-Tap Reporting</span>
                <span className="feature-pill">Voice Recommendation</span>
                <span className="feature-pill">Driver Confirmation Required</span>
              </div>
              <Button
                variant="outline"
                size="sm"
                icon={ArrowRightIcon}
                iconPosition="right"
                onClick={() => {
                  setActiveTab('report');
                  window.location.hash = 'report';
                }}
              >
                Inspect Traffic Reporting Screen
              </Button>
            </div>
          </Card>
        </div>
      </section>

      {/* ---------------------------------------------------------------------
         How It Works: 7-Step Sequence
         --------------------------------------------------------------------- */}
      <section id="how-it-works-section" className="home-how-it-works-section">
        <div className="section-title-wrap">
          <div className="section-badge-row">
            <Badge variant="warning" size="sm">OPERATIONAL WORKFLOW</Badge>
          </div>
          <h2 className="section-heading">How AmbuRoute Works</h2>
          <p className="section-subheading">
            A cooperative end-to-end flow designed for clarity, safety, and driver control.
          </p>
        </div>

        <div className="workflow-steps-list">
          {/* Step 1 */}
          <div className="workflow-step-item">
            <div className="step-badge">01</div>
            <div className="step-body-card">
              <div className="step-body-header">
                <ShieldCheckIcon size={18} className="text-amber" />
                <h3 className="step-body-title">Authorized Driver Login</h3>
              </div>
              <p className="step-body-desc">
                An authorized emergency vehicle operator logs in with verified credentials to gain access to mission controls.
              </p>
            </div>
          </div>

          {/* Step 2 */}
          <div className="workflow-step-item">
            <div className="step-badge">02</div>
            <div className="step-body-card">
              <div className="step-body-header">
                <MapPinIcon size={18} className="text-red" />
                <h3 className="step-body-title">Simulated Emergency Trip Dispatch</h3>
              </div>
              <p className="step-body-desc">
                The driver starts a trip and selects a designated medical base, such as Patna Medical College & Hospital (PMCH).
              </p>
            </div>
          </div>

          {/* Step 3 */}
          <div className="workflow-step-item">
            <div className="step-badge">03</div>
            <div className="step-body-card">
              <div className="step-body-header">
                <RadioIcon size={18} className="text-amber" />
                <h3 className="step-body-title">Corridor Display & Trip Status</h3>
              </div>
              <p className="step-body-desc">
                The cockpit displays the primary arterial route (Bailey Road to Fraser Road) and tracks progress along corridor waypoints.
              </p>
            </div>
          </div>

          {/* Step 4 */}
          <div className="workflow-step-item">
            <div className="step-badge">04</div>
            <div className="step-body-card">
              <div className="step-body-header">
                <BellIcon size={18} className="text-red" />
                <h3 className="step-body-title">Approaching Ambulance Alert for Road Users</h3>
              </div>
              <p className="step-body-desc">
                Participating road users subscribed within a 500-metre envelope ahead receive clear notifications to pull over to the left.
              </p>
            </div>
          </div>

          {/* Step 5 */}
          <div className="workflow-step-item">
            <div className="step-badge">05</div>
            <div className="step-body-card">
              <div className="step-body-header">
                <AlertTriangleIcon size={18} className="text-amber" />
                <h3 className="step-body-title">Community Traffic Observations</h3>
              </div>
              <p className="step-body-desc">
                Road users report real-time observations regarding road conditions (e.g., fallen cables or blockage at Dak Bungalow crossing).
              </p>
            </div>
          </div>

          {/* Step 6 */}
          <div className="workflow-step-item">
            <div className="step-badge">06</div>
            <div className="step-body-card">
              <div className="step-body-header">
                <Volume2Icon size={18} className="text-mint" />
                <h3 className="step-body-title">Traffic-Aware Route Evaluation & Voice Assistance</h3>
              </div>
              <p className="step-body-desc">
                When blockage is identified, the backend evaluates alternatives (such as Atal Path & JP Ganga Path) and delivers a short voice recommendation.
              </p>
            </div>
          </div>

          {/* Step 7 */}
          <div className="workflow-step-item">
            <div className="step-badge">07</div>
            <div className="step-body-card">
              <div className="step-body-header">
                <CheckCircle2Icon size={18} className="text-mint" />
                <h3 className="step-body-title">Driver Confirmation</h3>
              </div>
              <p className="step-body-desc">
                The driver reviews the detour and confirms or rejects it. The system never reroutes silently without driver approval.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------------
         Architecture Boundary: Simulated vs Live Backend Services
         --------------------------------------------------------------------- */}
      <section className="home-architecture-section">
        <div className="architecture-notice-card">
          <div className="architecture-notice-header">
            <Badge variant="neutral" size="sm">PROTOTYPE TRANSPARENCY</Badge>
            <h3 className="architecture-notice-title">Prototype Architecture Boundary</h3>
            <p className="architecture-notice-sub">
              To ensure honest evaluation, AmbuRoute clearly delineates between frontend demonstration features and backend infrastructure requirements.
            </p>
          </div>

          <div className="architecture-columns-grid">
            <div className="arch-col arch-col--simulated">
              <div className="arch-col-tag text-amber">Simulated in this MVP Frontend</div>
              <ul className="arch-col-list">
                <li>Demonstration driver session for UI access control (driver@amburoute.demo).</li>
                <li>Waypoint progression stepped manually or automatically along Patna routes.</li>
                <li>Simulated browser notification permission and alert triggers within 500m.</li>
                <li>Curated Patna traffic observations demonstrating blockage evaluation.</li>
              </ul>
            </div>

            <div className="arch-col arch-col--backend">
              <div className="arch-col-tag text-mint">Connected in Backend Integrations</div>
              <ul className="arch-col-list">
                <li>Live routing service integration (OSRM / Google Maps / MapmyIndia) for real ETAs.</li>
                <li>WebSocket & Geohash clustering for sub-second ambulance location broadcasts.</li>
                <li>Web Push API (VAPID) delivery to mobile devices across telecom networks.</li>
                <li>Cryptographic session tokens and institutional driver vetting.</li>
              </ul>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

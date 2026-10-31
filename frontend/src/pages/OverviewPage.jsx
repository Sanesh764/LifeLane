import React, { useState, useEffect } from 'react';
import './OverviewPage.css';
import { useSimulation } from '../context/useSimulation.js';
import { OverviewRouteMap } from '../components/map/OverviewRouteMap.jsx';
import { ErrorBoundary } from '../components/common/ErrorBoundary.jsx';
import {
  SirenIcon,
  AmbulanceIcon,
  RouteIcon,
  BellIcon,
  AlertTriangleIcon,
  CheckCircle2Icon,
  OctagonAlertIcon,
  HelpCircleIcon,
  Volume2Icon,
  MapPinIcon,
  ShieldCheckIcon,
  SparklesIcon,
  RadioIcon,
  ChevronRightIcon,
  ArrowRightIcon,
  ClockIcon,
  ZapIcon,
  ActivityIcon,
  UsersIcon,
  HospitalIcon,
  NavigationIcon,
  CheckIcon,
  ArrowUpIcon,
} from '../components/common/Icons.jsx';

/**
 * OverviewPage: Modern, Feature-Rich Public Overview & Product Tour
 *
 * Designed for hackathon judges, citizens, ambulance drivers, and hospital coordinators.
 * Explains the dual-engine architecture:
 * 1. Routing Engine + Meta Muse Spark AI Detour Assistance
 * 2. Route-Aware 500m Push Corridor Notifications + Real-Time Community Intel
 */
export function OverviewPage() {
  const {
    setActiveTab,
    setDriverSubTab,
    tripStatus,
    startTrip,
    isAuthenticated,
    isDriverAuthenticated,
  } = useSimulation();

  const isTripActive = tripStatus === 'ACTIVE';
  const [activeSection, setActiveSection] = useState('hero');
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [copiedSection, setCopiedSection] = useState(null);

  // Smooth scroll helper for in-page section links
  const scrollToSection = (id) => {
    setActiveSection(id);
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  // Track active scroll section
  useEffect(() => {
    let ticking = false;

    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          const shouldShow = window.scrollY > 400;
          setShowBackToTop((prev) => (prev !== shouldShow ? shouldShow : prev));

          const sections = [
            'hero',
            'how-it-works',
            'ai-routing',
            'features',
            'notifications',
            'community',
            'stakeholders',
            'impact',
          ];
          const scrollPos = window.scrollY + 160;

          for (let i = sections.length - 1; i >= 0; i--) {
            const el = document.getElementById(sections[i]);
            if (el && el.offsetTop <= scrollPos) {
              const nextSection = sections[i];
              setActiveSection((prev) => (prev !== nextSection ? nextSection : prev));
              break;
            }
          }
          ticking = false;
        });
        ticking = true;
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleStartMissionOrCockpit = () => {
    if (isTripActive) {
      setActiveTab('driver');
      setDriverSubTab('active');
      window.location.hash = 'driver/active';
      return;
    }

    if (isDriverAuthenticated) {
      setActiveTab('driver');
      setDriverSubTab('start');
      window.location.hash = 'driver/start';
    } else {
      setActiveTab('login');
      window.location.hash = 'login/driver';
    }
  };

  const handleCopySectionLink = (sectionId) => {
    const url = `${window.location.origin}/#${sectionId}`;
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(url).then(() => {
        setCopiedSection(sectionId);
        setTimeout(() => setCopiedSection(null), 2000);
      }).catch(() => {});
    }
  };

  const handleNavigate = (tab, subTab = null) => {
    setActiveTab(tab);
    if (subTab) {
      setDriverSubTab(subTab);
      window.location.hash = `${tab}/${subTab}`;
    } else {
      window.location.hash = tab;
    }
  };

  return (
    <div className="overview-page-root">
      {/* ---------------------------------------------------------------------
         Sticky In-Page Anchor Sub-Nav
         --------------------------------------------------------------------- */}
      <nav className="overview-subnav" aria-label="Page section navigation">
        <div className="overview-subnav-links">
          <button
            type="button"
            className={`overview-subnav-link ${activeSection === 'hero' ? 'is-active' : ''}`}
            onClick={() => scrollToSection('hero')}
          >
            Overview
          </button>
          <button
            type="button"
            className={`overview-subnav-link ${activeSection === 'how-it-works' ? 'is-active' : ''}`}
            onClick={() => scrollToSection('how-it-works')}
          >
            How It Works
          </button>
          <button
            type="button"
            className={`overview-subnav-link ${activeSection === 'ai-routing' ? 'is-active' : ''}`}
            onClick={() => scrollToSection('ai-routing')}
          >
            AI Route Engine
          </button>
          <button
            type="button"
            className={`overview-subnav-link ${activeSection === 'features' ? 'is-active' : ''}`}
            onClick={() => scrollToSection('features')}
          >
            All 8 Features
          </button>
          <button
            type="button"
            className={`overview-subnav-link ${activeSection === 'notifications' ? 'is-active' : ''}`}
            onClick={() => scrollToSection('notifications')}
          >
            Emergency Alerts
          </button>
          <button
            type="button"
            className={`overview-subnav-link ${activeSection === 'community' ? 'is-active' : ''}`}
            onClick={() => scrollToSection('community')}
          >
            Community Intel
          </button>
          <button
            type="button"
            className={`overview-subnav-link ${activeSection === 'stakeholders' ? 'is-active' : ''}`}
            onClick={() => scrollToSection('stakeholders')}
          >
            Drivers & Hospitals
          </button>
          <button
            type="button"
            className={`overview-subnav-link ${activeSection === 'impact' ? 'is-active' : ''}`}
            onClick={() => scrollToSection('impact')}
          >
            Impact
          </button>
        </div>

        <div className="overview-subnav-actions">
          <button
            type="button"
            className="hero-btn-primary"
            style={{ padding: '0.45rem 1rem', fontSize: '0.84rem' }}
            onClick={() => handleNavigate('public')}
          >
            <span>Live Network</span>
            <ArrowRightIcon size={14} />
          </button>
        </div>
      </nav>

      {/* ---------------------------------------------------------------------
         1. HERO SECTION
         --------------------------------------------------------------------- */}
      <section id="hero" className="overview-hero">
        <div className="overview-hero-content">
          <div className="hero-pill-row">
            <span className="hero-badge-platform">
              <AmbulanceIcon size={14} />
              <span>AMBUROUTE · EMERGENCY TRANSIT PLATFORM</span>
            </span>
            <span className="hero-badge-ai">
              <SparklesIcon size={14} />
              <span>META MUSE SPARK AI + ROUTING ENGINE</span>
            </span>
            {isTripActive && (
              <span className="floating-card-tag floating-card-tag--red" style={{ background: '#FEE2E2', padding: '0.3rem 0.75rem', borderRadius: '999px' }}>
                <span className="live-status-dot" style={{ backgroundColor: '#EF4444' }} />
                <span>ACTIVE SIMULATED MISSION</span>
              </span>
            )}
          </div>

          <h1 className="overview-hero-title">
            Intelligent Ambulance Routing for{' '}
            <span className="overview-hero-title-highlight">Safer Communities</span>
          </h1>

          <p className="overview-hero-subtitle">
            AI-powered route optimization, real-time traffic intelligence and instant community alerts to help ambulances reach patients faster.
          </p>

          <div className="overview-hero-actions">
            <button
              type="button"
              className="hero-btn-primary"
              onClick={() => scrollToSection('how-it-works')}
            >
              <span>Explore How It Works</span>
              <ChevronRightIcon size={16} />
            </button>

            <button
              type="button"
              className="hero-btn-secondary"
              onClick={() => scrollToSection('features')}
            >
              <span>Explore Features</span>
            </button>

            <button
              type="button"
              className="hero-btn-outline"
              onClick={() => handleNavigate('public')}
            >
              <span>Get Started</span>
            </button>

            <button
              type="button"
              className="hero-btn-outline"
              onClick={() => handleNavigate('login')}
            >
              <ShieldCheckIcon size={16} />
              <span>Sign In</span>
            </button>
          </div>
        </div>

        {/* Hero Visual Board with 3 Floating Cards */}
        <div className="overview-hero-visual">
          <div className="hero-visual-board">
            <div className="hero-visual-bg-decor" />

            {/* Floating Card 1: Emergency Alert */}
            <div className="hero-floating-card hero-floating-card--alert">
              <div className="floating-card-header">
                <span className="floating-card-tag floating-card-tag--red">
                  <SirenIcon size={14} />
                  <span>EMERGENCY VEHICLE APPROACHING</span>
                </span>
                <span className="floating-card-time">500m Corridor</span>
              </div>
              <h3 className="floating-card-title">Ambulance 108 Approaching</h3>
              <p className="floating-card-desc">
                En route to PMCH Trauma Center via Bailey Road. Please pull over to the left and yield safe passage.
              </p>
              <div className="floating-card-badge-row">
                <span className="hero-badge-ai" style={{ fontSize: '0.7rem', padding: '0.15rem 0.5rem' }}>
                  Web Push Alert · Sound & Vibration
                </span>
              </div>
            </div>

            {/* Floating Card 2: AI Suggested Route */}
            <div className="hero-floating-card hero-floating-card--route">
              <div className="floating-card-header">
                <span className="floating-card-tag floating-card-tag--green">
                  <SparklesIcon size={14} />
                  <span>AI DETOUR RECOMMENDED</span>
                </span>
                <span className="floating-card-time text-mint font-semibold">-8 min faster</span>
              </div>
              <h3 className="floating-card-title">Atal Path 6-Lane Expressway</h3>
              <p className="floating-card-desc">
                Bypasses heavy commercial congestion at Dak Bungalow crossing. Distance: 6.8 km · ETA: 14 min.
              </p>
              <div className="floating-card-badge-row">
                <span className="hero-badge-ai" style={{ fontSize: '0.7rem', padding: '0.15rem 0.5rem' }}>
                  Meta Muse Spark AI · Driver Confirmed
                </span>
              </div>
            </div>

            {/* Floating Card 3: Live Traffic Update */}
            <div className="hero-floating-card hero-floating-card--traffic">
              <div className="floating-card-header">
                <span className="floating-card-tag floating-card-tag--amber">
                  <AlertTriangleIcon size={14} />
                  <span>REAL-TIME TRAFFIC OBSERVATION</span>
                </span>
                <span className="floating-card-time">2 min ago</span>
              </div>
              <h3 className="floating-card-title">Dak Bungalow: High Congestion</h3>
              <p className="floating-card-desc">
                3 verified citizen reports. Intersection crawling due to construction work.
              </p>
              <div className="floating-card-badge-row">
                <span className="hero-badge-platform" style={{ fontSize: '0.7rem', padding: '0.15rem 0.5rem' }}>
                  Citizen Intelligence · Corroborated
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Hero Feature Strip */}
      <div className="hero-feature-strip">
        <div className="strip-item">
          <div className="strip-item-icon strip-item-icon--green">
            <ClockIcon size={20} />
          </div>
          <div className="strip-item-text">
            <span className="strip-item-label">Faster Emergency Response</span>
            <span className="strip-item-sub">Protecting the critical golden hour</span>
          </div>
        </div>

        <div className="strip-item">
          <div className="strip-item-icon strip-item-icon--blue">
            <SparklesIcon size={20} />
          </div>
          <div className="strip-item-text">
            <span className="strip-item-label">AI Traffic Intelligence</span>
            <span className="strip-item-sub">Corroborated road observations</span>
          </div>
        </div>

        <div className="strip-item">
          <div className="strip-item-icon strip-item-icon--amber">
            <BellIcon size={20} />
          </div>
          <div className="strip-item-text">
            <span className="strip-item-label">Instant Push Notifications</span>
            <span className="strip-item-sub">Direct yield notices to upcoming traffic</span>
          </div>
        </div>

        <div className="strip-item">
          <div className="strip-item-icon strip-item-icon--teal">
            <UsersIcon size={20} />
          </div>
          <div className="strip-item-text">
            <span className="strip-item-label">Safer Communities</span>
            <span className="strip-item-sub">Cooperative life-saving transit</span>
          </div>
        </div>
      </div>

      {/* ---------------------------------------------------------------------
         2. HOW IT WORKS (5-STEP WORKFLOW)
         --------------------------------------------------------------------- */}
      <section id="how-it-works" className="how-it-works-workflow">
        <div className="overview-section-header">
          <span className="section-kicker-pill">5-Step Coordinated Flow</span>
          <h2 className="overview-section-title">How AmbuRoute Works</h2>
          <p className="overview-section-sub">
            From emergency dispatch to safe hospital arrival, AmbuRoute bridges drivers, AI routing, and citizens in an integrated cooperative workflow.
          </p>
        </div>

        <div className="workflow-step-grid">
          {/* Step 1 */}
          <div className="workflow-card">
            <span className="workflow-card-step-num">STEP 01</span>
            <div className="workflow-card-icon-wrap" style={{ background: '#FEE2E2', color: '#DC2626' }}>
              <SirenIcon size={24} />
            </div>
            <h3 className="workflow-card-title">Emergency Mission Created</h3>
            <p className="workflow-card-desc">
              An authorized ambulance driver starts an emergency mission and selects the destination hospital (e.g. PMCH Trauma Base).
            </p>
            <div className="workflow-card-notice">
              Authenticated & verified drivers only (/api/v1/trips)
            </div>
          </div>

          {/* Step 2 */}
          <div className="workflow-card">
            <span className="workflow-card-step-num">STEP 02</span>
            <div className="workflow-card-icon-wrap" style={{ background: '#ECFDF5', color: '#16865B' }}>
              <SparklesIcon size={24} />
            </div>
            <h3 className="workflow-card-title">AI Finds the Best Route</h3>
            <p className="workflow-card-desc">
              The routing system evaluates road distance, available traffic intelligence and reported road incidents to help identify a suitable route.
            </p>
            <div className="workflow-card-notice">
              Meta Muse Spark AI with Groq & deterministic fallback
            </div>
          </div>

          {/* Step 3 */}
          <div className="workflow-card">
            <span className="workflow-card-step-num">STEP 03</span>
            <div className="workflow-card-icon-wrap" style={{ background: '#FEF3C7', color: '#D97706' }}>
              <BellIcon size={24} />
            </div>
            <h3 className="workflow-card-title">Community Gets Notified</h3>
            <p className="workflow-card-desc">
              Registered users with active notification subscriptions receive emergency alerts according to the configured notification mode.
            </p>
            <div className="workflow-card-notice">
              Global notification mode active for demo; proximity mode ready
            </div>
          </div>

          {/* Step 4 */}
          <div className="workflow-card">
            <span className="workflow-card-step-num">STEP 04</span>
            <div className="workflow-card-icon-wrap" style={{ background: '#E0F2FE', color: '#0284C7' }}>
              <Volume2Icon size={24} />
            </div>
            <h3 className="workflow-card-title">Live Navigation & Voice Assistance</h3>
            <p className="workflow-card-desc">
              The driver follows the route, receives traffic updates and can ask the voice assistant hands-free questions about destinations and incidents.
            </p>
            <div className="workflow-card-notice">
              Groq Whisper transcription + hands-free voice engine
            </div>
          </div>

          {/* Step 5 */}
          <div className="workflow-card">
            <span className="workflow-card-step-num">STEP 05</span>
            <div className="workflow-card-icon-wrap" style={{ background: '#CCFBF1', color: '#0F766E' }}>
              <HospitalIcon size={24} />
            </div>
            <h3 className="workflow-card-title">Hospital Arrival</h3>
            <p className="workflow-card-desc">
              The ambulance reaches the selected hospital and completes the emergency mission safely, recording telemetry for post-mission audit.
            </p>
            <div className="workflow-card-notice">
              Direct emergency ramp access & trip telemetry logging
            </div>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------------
         3. AI ROUTE OPTIMIZATION SECTION (VERY IMPORTANT)
         --------------------------------------------------------------------- */}
      <section id="ai-routing" className="ai-routing-section-container">
        <div className="overview-section-header">
          <span className="section-kicker-pill">Intelligent Route Reassessment</span>
          <h2 className="overview-section-title">AI Route Optimization & Hazard Avoidance</h2>
          <p className="overview-section-sub">
            The AI analyzes available traffic information, road reports, route distance and road conditions to help identify a suitable route. When conditions change, the system can support route reassessment.
          </p>
        </div>

        {/* Embedded Interactive Route Map */}
        <ErrorBoundary fallback={
          <div className="overview-route-map-card" style={{ padding: '2.5rem', textAlign: 'center', background: '#ffffff', borderRadius: '16px', border: '1px solid #DCE7DF' }}>
            <h4 style={{ fontFamily: 'var(--font-display)', color: '#0F291E', margin: '0 0 0.5rem 0' }}>
              Patna Emergency Corridor: AI Alternative Detour
            </h4>
            <p style={{ color: '#63756B', margin: 0 }}>
              AI Detour via Atal Path Expressway (14 min · 6.8 km) saves ~8-12 minutes compared to congested Bailey Road (26 min · 5.4 km).
            </p>
          </div>
        }>
          <OverviewRouteMap />
        </ErrorBoundary>

        {/* Side-by-Side Detailed Route Comparison */}
        <div className="ai-comparison-grid">
          {/* Card 1: AI Recommended Detour */}
          <div className="ai-comparison-card ai-comparison-card--recommended">
            <div className="comparison-header">
              <span className="hero-badge-ai">AI RECOMMENDED DETOUR</span>
              <span className="text-mint font-semibold" style={{ fontSize: '0.84rem' }}>
                Estimated 8-12 min time saved
              </span>
            </div>

            <h3 className="comparison-title">Atal Path & JP Ganga Path Expressway</h3>

            <div className="comparison-stat-bar">
              <div className="comparison-stat-item">
                <span className="comparison-stat-val text-mint">14 min</span>
                <span className="comparison-stat-lbl">ESTIMATED DURATION</span>
              </div>
              <div className="comparison-stat-item">
                <span className="comparison-stat-val">6.8 km</span>
                <span className="comparison-stat-lbl">TOTAL DISTANCE</span>
              </div>
              <div className="comparison-stat-item">
                <span className="comparison-stat-val text-mint">FREE FLOW</span>
                <span className="comparison-stat-lbl">CORRIDOR STATUS</span>
              </div>
            </div>

            <ul className="comparison-points-list">
              <li className="comparison-point">
                <CheckIcon size={16} className="text-mint" />
                <span>6-lane grade-separated express corridor with minimal intersections.</span>
              </li>
              <li className="comparison-point">
                <CheckIcon size={16} className="text-mint" />
                <span>Direct elevated flyover ramp from Ganga Path into PMCH Trauma Center.</span>
              </li>
              <li className="comparison-point">
                <CheckIcon size={16} className="text-mint" />
                <span>Zero reported traffic obstructions along the express riverfront.</span>
              </li>
            </ul>
          </div>

          {/* Card 2: Congested Direct Route */}
          <div className="ai-comparison-card ai-comparison-card--congested">
            <div className="comparison-header">
              <span className="floating-card-tag floating-card-tag--red" style={{ background: '#FEE2E2', padding: '0.2rem 0.6rem', borderRadius: '999px' }}>
                CONGESTED PRIMARY ARTERIAL
              </span>
              <span className="text-red font-semibold" style={{ fontSize: '0.84rem' }}>
                Severe Delay Warning
              </span>
            </div>

            <h3 className="comparison-title">Bailey Road via Fraser Road & Dak Bungalow</h3>

            <div className="comparison-stat-bar">
              <div className="comparison-stat-item">
                <span className="comparison-stat-val text-red">26 min</span>
                <span className="comparison-stat-lbl">ESTIMATED DURATION</span>
              </div>
              <div className="comparison-stat-item">
                <span className="comparison-stat-val">5.4 km</span>
                <span className="comparison-stat-lbl">TOTAL DISTANCE</span>
              </div>
              <div className="comparison-stat-item">
                <span className="comparison-stat-val text-red">HIGH DELAY</span>
                <span className="comparison-stat-lbl">CORRIDOR STATUS</span>
              </div>
            </div>

            <ul className="comparison-points-list">
              <li className="comparison-point">
                <AlertTriangleIcon size={16} className="text-red" />
                <span>High commercial density at Dak Bungalow intersection (3 reports).</span>
              </li>
              <li className="comparison-point">
                <AlertTriangleIcon size={16} className="text-red" />
                <span>Stoppage & construction reported at Fraser Road crossing.</span>
              </li>
              <li className="comparison-point">
                <AlertTriangleIcon size={16} className="text-red" />
                <span>Higher risk of emergency vehicle immobilization during peak transit hours.</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Technical Honesty Distinction Callout */}
        <div className="ai-architecture-callout">
          <div className="callout-icon">
            <ShieldCheckIcon size={24} />
          </div>
          <div className="callout-content">
            <h4 className="callout-title">Engine Distinction: Routing Engine vs. AI Traffic Intelligence</h4>
            <p className="callout-text">
              <strong>Transparent System Design:</strong> In AmbuRoute, standard routing engines (OSRM / OpenStreetMap) calculate geometric graph distances and baseline travel times. The AI layer (Meta Muse Spark with Groq fallback) analyzes community-reported incident descriptions, corroborates credibility, and synthesizes natural-language voice advisories.
              <strong> The licensed driver always retains sole confirmation authority</strong> before any route change takes place.
            </p>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------------
         4. COMPLETE FEATURE SHOWCASE (ALL 8 IMPLEMENTED FEATURES)
         --------------------------------------------------------------------- */}
      <section id="features" className="feature-showcase-section">
        <div className="overview-section-header">
          <span className="section-kicker-pill">Comprehensive Platform Capabilities</span>
          <h2 className="overview-section-title">Complete Feature Showcase</h2>
          <p className="overview-section-sub">
            Every feature below is actively implemented, verified with comprehensive tests, and available within the platform.
          </p>
        </div>

        <div className="feature-showcase-grid">
          {/* Feature 1 */}
          <div className="feature-showcase-card">
            <div className="feature-card-media">
              <img
                src="/assets/screenshots/active_mission.png"
                alt="Smart Route Optimization in AmbuRoute"
                className="feature-card-screenshot"
                loading="lazy"
              />
              <span className="feature-card-badge-overlay">FEATURE 01</span>
            </div>
            <div className="feature-card-body">
              <div className="feature-card-header">
                <div className="feature-icon-box feature-icon-box--green">
                  <RouteIcon size={18} />
                </div>
                <h3 className="feature-card-title">Smart Route Optimization</h3>
              </div>
              <p className="feature-card-desc">
                Find suitable ambulance routes using distance, available road information and traffic intelligence to avoid choked arteries.
              </p>
              <button
                type="button"
                className="feature-card-action-btn"
                onClick={() => scrollToSection('ai-routing')}
              >
                <span>Inspect Route Map</span>
                <ChevronRightIcon size={14} />
              </button>
            </div>
          </div>

          {/* Feature 2 */}
          <div className="feature-showcase-card">
            <div className="feature-card-media">
              <img
                src="/assets/screenshots/active_mission.png"
                alt="Real-Time Traffic Intelligence"
                className="feature-card-screenshot"
                loading="lazy"
              />
              <span className="feature-card-badge-overlay">FEATURE 02</span>
            </div>
            <div className="feature-card-body">
              <div className="feature-card-header">
                <div className="feature-icon-box feature-icon-box--amber">
                  <ActivityIcon size={18} />
                </div>
                <h3 className="feature-card-title">Real-Time Traffic Intelligence</h3>
              </div>
              <p className="feature-card-desc">
                Incident clustering, freshness decay filtering, duplicate detection, and Meta Muse Spark AI traffic condition summaries.
              </p>
              <button
                type="button"
                className="feature-card-action-btn"
                onClick={() => handleNavigate('public')}
              >
                <span>View Traffic Network</span>
                <ChevronRightIcon size={14} />
              </button>
            </div>
          </div>

          {/* Feature 3 */}
          <div className="feature-showcase-card">
            <div className="feature-card-media">
              <img
                src="/assets/screenshots/public_dashboard.png"
                alt="Community Road Reporting"
                className="feature-card-screenshot"
                loading="lazy"
              />
              <span className="feature-card-badge-overlay">FEATURE 03</span>
            </div>
            <div className="feature-card-body">
              <div className="feature-card-header">
                <div className="feature-icon-box feature-icon-box--teal">
                  <UsersIcon size={18} />
                </div>
                <h3 className="feature-card-title">Community Road Reporting</h3>
              </div>
              <p className="feature-card-desc">
                Registered and anonymous users submit one-tap road reports (CLEAR, HEAVY, BLOCKED) with coordinates to help ambulances.
              </p>
              <button
                type="button"
                className="feature-card-action-btn"
                onClick={() => handleNavigate('report')}
              >
                <span>Report Road Condition</span>
                <ChevronRightIcon size={14} />
              </button>
            </div>
          </div>

          {/* Feature 4 */}
          <div className="feature-showcase-card">
            <div className="feature-card-media">
              <img
                src="/assets/screenshots/notification_received.png"
                alt="Instant Emergency Push Notifications"
                className="feature-card-screenshot"
                loading="lazy"
              />
              <span className="feature-card-badge-overlay">FEATURE 04</span>
            </div>
            <div className="feature-card-body">
              <div className="feature-card-header">
                <div className="feature-icon-box feature-icon-box--red">
                  <BellIcon size={18} />
                </div>
                <h3 className="feature-card-title">Instant Push Notifications</h3>
              </div>
              <p className="feature-card-desc">
                W3C Web Push & VAPID cryptography delivering timely yield notifications to subscribed browser devices along upcoming paths.
              </p>
              <button
                type="button"
                className="feature-card-action-btn"
                onClick={() => handleNavigate('alerts')}
              >
                <span>Enable Alerts</span>
                <ChevronRightIcon size={14} />
              </button>
            </div>
          </div>

          {/* Feature 5 */}
          <div className="feature-showcase-card">
            <div className="feature-card-media">
              <img
                src="/assets/screenshots/voice_assistant.png"
                alt="AI Voice Assistant in Cockpit"
                className="feature-card-screenshot"
                loading="lazy"
              />
              <span className="feature-card-badge-overlay">FEATURE 05</span>
            </div>
            <div className="feature-card-body">
              <div className="feature-card-header">
                <div className="feature-icon-box feature-icon-box--blue">
                  <Volume2Icon size={18} />
                </div>
                <h3 className="feature-card-title">AI Voice Assistant</h3>
              </div>
              <p className="feature-card-desc">
                Drivers query destination, active status, and traffic conditions hands-free using Groq Whisper speech-to-text.
              </p>
              <button
                type="button"
                className="feature-card-action-btn"
                onClick={() => handleNavigate(isDriverAuthenticated ? 'driver' : 'login', isDriverAuthenticated ? 'active' : null)}
              >
                <span>Driver Cockpit</span>
                <ChevronRightIcon size={14} />
              </button>
            </div>
          </div>

          {/* Feature 6 */}
          <div className="feature-showcase-card">
            <div className="feature-card-media">
              <img
                src="/assets/screenshots/driver_dashboard.png"
                alt="Nearby Hospital Discovery"
                className="feature-card-screenshot"
                loading="lazy"
              />
              <span className="feature-card-badge-overlay">FEATURE 06</span>
            </div>
            <div className="feature-card-body">
              <div className="feature-card-header">
                <div className="feature-icon-box feature-icon-box--teal">
                  <HospitalIcon size={18} />
                </div>
                <h3 className="feature-card-title">Nearby Hospital Discovery</h3>
              </div>
              <p className="feature-card-desc">
                Dynamically discover trauma centers within a 35 km radius based on current vehicle GPS coordinates and distance ranking.
              </p>
              <button
                type="button"
                className="feature-card-action-btn"
                onClick={() => handleNavigate(isDriverAuthenticated ? 'driver' : 'login', isDriverAuthenticated ? 'start' : null)}
              >
                <span>Discover Hospitals</span>
                <ChevronRightIcon size={14} />
              </button>
            </div>
          </div>

          {/* Feature 7 */}
          <div className="feature-showcase-card">
            <div className="feature-card-media">
              <img
                src="/assets/screenshots/driver_dashboard.png"
                alt="Driver Dashboard & Mission Center"
                className="feature-card-screenshot"
                loading="lazy"
              />
              <span className="feature-card-badge-overlay">FEATURE 07</span>
            </div>
            <div className="feature-card-body">
              <div className="feature-card-header">
                <div className="feature-icon-box feature-icon-box--green">
                  <ShieldCheckIcon size={18} />
                </div>
                <h3 className="feature-card-title">Driver Dashboard</h3>
              </div>
              <p className="feature-card-desc">
                Full mission lifecycle management, assigned vehicle details, trip logs, profile verification, and emergency controls.
              </p>
              <button
                type="button"
                className="feature-card-action-btn"
                onClick={() => handleNavigate(isDriverAuthenticated ? 'driver' : 'login', isDriverAuthenticated ? 'home' : null)}
              >
                <span>Driver Portal</span>
                <ChevronRightIcon size={14} />
              </button>
            </div>
          </div>

          {/* Feature 8 */}
          <div className="feature-showcase-card">
            <div className="feature-card-media">
              <img
                src="/assets/screenshots/active_mission.png"
                alt="Live Mission Monitoring"
                className="feature-card-screenshot"
                loading="lazy"
              />
              <span className="feature-card-badge-overlay">FEATURE 08</span>
            </div>
            <div className="feature-card-body">
              <div className="feature-card-header">
                <div className="feature-icon-box feature-icon-box--red">
                  <NavigationIcon size={18} />
                </div>
                <h3 className="feature-card-title">Live Mission Monitoring</h3>
              </div>
              <p className="feature-card-desc">
                Display ambulance location, destination hospital, polyline geometry, and relevant road incidents in synchronized real time.
              </p>
              <button
                type="button"
                className="feature-card-action-btn"
                onClick={() => handleNavigate('public')}
              >
                <span>Live Dashboard</span>
                <ChevronRightIcon size={14} />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------------
         5. DEDICATED NOTIFICATION WORKFLOW SECTION
         --------------------------------------------------------------------- */}
      <section id="notifications" className="notifications-workflow-section">
        <div className="overview-section-header">
          <span className="section-kicker-pill">Direct Emergency Yielding</span>
          <h2 className="overview-section-title">Emergency Notification Pipeline</h2>
          <p className="overview-section-sub">
            How AmbuRoute alerts opted-in citizens to safely yield before the ambulance arrives.
          </p>
        </div>

        <div className="notifications-section-grid">
          {/* Left: 4-Step Pipeline Explanation */}
          <div className="notifications-pipeline-card">
            <div className="notif-pipe-step">
              <div className="notif-pipe-icon text-red">
                <SirenIcon size={20} />
              </div>
              <div className="notif-pipe-content">
                <div className="notif-pipe-title">1. Driver Dispatches Emergency Mission</div>
                <div className="notif-pipe-desc">
                  When an ambulance departs, the backend registers the corridor waypoints and activates notification targeting.
                </div>
              </div>
            </div>

            <div className="notif-pipe-step">
              <div className="notif-pipe-icon text-amber">
                <ZapIcon size={20} />
              </div>
              <div className="notif-pipe-content">
                <div className="notif-pipe-title">2. Backend Dispatches Web Push via VAPID</div>
                <div className="notif-pipe-desc">
                  The backend encrypts notification payloads with VAPID keys and dispatches alerts through standard browser push services.
                </div>
              </div>
            </div>

            <div className="notif-pipe-step">
              <div className="notif-pipe-icon text-teal">
                <BellIcon size={20} />
              </div>
              <div className="notif-pipe-content">
                <div className="notif-pipe-title">3. Subscribed Devices Receive Emergency Alert</div>
                <div className="notif-pipe-desc">
                  Subscribed devices trigger a high-priority banner with audible cues, even when the browser tab is minimized.
                </div>
              </div>
            </div>

            <div className="notif-pipe-step">
              <div className="notif-pipe-icon text-mint">
                <CheckCircle2Icon size={20} />
              </div>
              <div className="notif-pipe-content">
                <div className="notif-pipe-title">4. Citizens Pull Over Safely</div>
                <div className="notif-pipe-desc">
                  Road users receive immediate instructions: "Ambulance 108 Approaching · Please pull over to the left and yield safe passage."
                </div>
              </div>
            </div>

            <div className="workflow-card-notice" style={{ marginTop: '0.5rem' }}>
              <strong>Browser Permission Required:</strong> Web notifications operate strictly via standard W3C Web Push with explicit user consent. The system does not assume arbitrary phones can be reached without an active subscription.
            </div>
          </div>

          {/* Right: Realistic Push Notification Preview */}
          <div className="notification-phone-frame">
            <div className="phone-mockup-header">
              <span className="phone-mockup-label">Simulated Device Lockscreen</span>
              <span className="hero-badge-platform" style={{ fontSize: '0.7rem' }}>W3C Web Push</span>
            </div>

            <div className="simulated-push-banner">
              <div className="push-header-row">
                <div className="push-app-id">
                  <span className="push-badge-pulse" />
                  <span>AMBUROUTE EMERGENCY TRANSIT</span>
                </div>
                <span className="text-muted" style={{ fontSize: '0.74rem' }}>Just now</span>
              </div>

              <div className="push-content-block">
                <h4 className="push-headline">🚨 EMERGENCY VEHICLE APPROACHING</h4>
                <p className="push-text">
                  Ambulance 108 is en route to PMCH Trauma Base along the Bailey Road corridor. Please pull over to the left and yield safe passage.
                </p>
              </div>

              <div className="push-action-btn-row">
                <button
                  type="button"
                  className="push-primary-btn"
                  onClick={() => handleNavigate('alerts')}
                >
                  View Corridor Alert
                </button>
                <button
                  type="button"
                  className="push-secondary-btn"
                  onClick={() => handleNavigate('public')}
                >
                  Live Map
                </button>
              </div>
            </div>

            <div className="text-muted" style={{ fontSize: '0.8rem', textAlign: 'center', lineHeight: '1.45' }}>
              Demonstrated across desktop and mobile browsers. Supports vibration, sound, and corridor links.
            </div>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------------
         6. COMMUNITY CONTRIBUTION SECTION
         --------------------------------------------------------------------- */}
      <section id="community" className="community-contribution-section">
        <div className="overview-section-header">
          <span className="section-kicker-pill">Citizen Road Intelligence</span>
          <h2 className="overview-section-title">Community-Powered Traffic Reporting</h2>
          <p className="overview-section-sub">
            Road users contribute real-time observations to help ambulances bypass dangerous blockades and gridlocked intersections.
          </p>
        </div>

        <div className="community-section-grid">
          <div className="community-card-left">
            <div className="community-steps-list">
              <div className="community-step-item">
                <div className="comm-step-number">1</div>
                <div className="comm-step-text">
                  <strong>Create a Free Citizen Account:</strong> Sign up with your name and email to submit authenticated reports, or report anonymously with device rate-limiting.
                </div>
              </div>
              <div className="community-step-item">
                <div className="comm-step-number">2</div>
                <div className="comm-step-text">
                  <strong>One-Tap Condition Selection:</strong> Choose from 4 standardized report types to provide instant, unambiguous road condition data.
                </div>
              </div>
              <div className="community-step-item">
                <div className="comm-step-number">3</div>
                <div className="comm-step-text">
                  <strong>Freshness & Distance Verification:</strong> Backend clustering validates timestamps, GPS proximity, and independent corroborations.
                </div>
              </div>
              <div className="community-step-item">
                <div className="comm-step-number">4</div>
                <div className="comm-step-text">
                  <strong>AI Synthesis:</strong> Meta Muse Spark evaluates verified reports to generate voice detour suggestions for approaching drivers.
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.8rem', marginTop: '0.5rem' }}>
              <button
                type="button"
                className="hero-btn-primary"
                onClick={() => handleNavigate('report')}
              >
                <AlertTriangleIcon size={16} />
                <span>Submit a Road Observation</span>
              </button>

              <button
                type="button"
                className="hero-btn-secondary"
                onClick={() => handleNavigate('public')}
              >
                <span>View Public Traffic Feed</span>
              </button>
            </div>
          </div>

          {/* Interactive Report Card Preview */}
          <div className="report-preview-interactive-card">
            <div className="report-preview-header">
              <span className="report-preview-title">Supported Report Types</span>
              <span className="hero-badge-platform">One-Tap Submission</span>
            </div>

            <div className="report-types-pill-grid">
              <div className="report-type-badge report-type-badge--clear">
                <CheckCircle2Icon size={16} />
                <span>CLEAR: Flowing</span>
              </div>
              <div className="report-type-badge report-type-badge--heavy">
                <AlertTriangleIcon size={16} />
                <span>TRAFFIC_HIGH: Congestion</span>
              </div>
              <div className="report-type-badge report-type-badge--blocked">
                <OctagonAlertIcon size={16} />
                <span>ROAD_BLOCKED: Closure</span>
              </div>
              <div className="report-type-badge report-type-badge--assess">
                <HelpCircleIcon size={16} />
                <span>CANNOT_ASSESS: Unclear</span>
              </div>
            </div>

            <p className="text-muted" style={{ fontSize: '0.82rem', margin: 0, lineHeight: '1.45' }}>
              Every submission records road name, description, and optional GPS coordinates. Reports older than 30 minutes are automatically marked as stale.
            </p>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------------
         7. DRIVER & HOSPITAL VALUE SECTIONS
         --------------------------------------------------------------------- */}
      <section id="stakeholders" className="stakeholders-section">
        <div className="overview-section-header">
          <span className="section-kicker-pill">Designed for First Responders</span>
          <h2 className="overview-section-title">Built for Drivers and Trauma Centers</h2>
          <p className="overview-section-sub">
            Purpose-built workflows focused on ergonomics, driver safety, and emergency hospital discovery.
          </p>
        </div>

        <div className="stakeholder-grid">
          {/* Ambulance Drivers */}
          <div className="stakeholder-card stakeholder-card--driver">
            <div className="stakeholder-header">
              <div className="stakeholder-icon stakeholder-icon--green">
                <AmbulanceIcon size={24} />
              </div>
              <div>
                <h3 className="stakeholder-title">For Ambulance Drivers</h3>
                <span className="text-muted" style={{ fontSize: '0.84rem' }}>Cockpit & Voice Assistance</span>
              </div>
            </div>

            <ul className="stakeholder-list">
              <li className="stakeholder-list-item">
                <CheckIcon size={16} className="text-mint" />
                <span><strong>Hands-Free Voice Assistant:</strong> Groq Whisper voice recognition allows querying destinations and incidents without taking hands off the wheel.</span>
              </li>
              <li className="stakeholder-list-item">
                <CheckIcon size={16} className="text-mint" />
                <span><strong>Driver-in-the-Loop Authority:</strong> AI recommendations provide clear reasoning, but drivers always confirm detour decisions.</span>
              </li>
              <li className="stakeholder-list-item">
                <CheckIcon size={16} className="text-mint" />
                <span><strong>Dynamic Nearby Hospital Discovery:</strong> Instantly discover trauma centers within 35 km with real-time distance sorting.</span>
              </li>
              <li className="stakeholder-list-item">
                <CheckIcon size={16} className="text-mint" />
                <span><strong>Trip Telemetry & History:</strong> Log total response duration, distance covered, and route milestones.</span>
              </li>
            </ul>

            <button
              type="button"
              className="hero-btn-primary"
              style={{ marginTop: 'auto' }}
              onClick={() => handleNavigate(isDriverAuthenticated ? 'driver' : 'login', isDriverAuthenticated ? 'home' : 'driver')}
            >
              <span>{isDriverAuthenticated ? 'Open Driver Cockpit' : 'Sign In as Driver'}</span>
              <ArrowRightIcon size={16} />
            </button>
          </div>

          {/* Hospitals */}
          <div className="stakeholder-card stakeholder-card--hospital">
            <div className="stakeholder-header">
              <div className="stakeholder-icon stakeholder-icon--teal">
                <HospitalIcon size={24} />
              </div>
              <div>
                <h3 className="stakeholder-title">For Emergency Hospitals</h3>
                <span className="text-muted" style={{ fontSize: '0.84rem' }}>Destination Readiness</span>
              </div>
            </div>

            <ul className="stakeholder-list">
              <li className="stakeholder-list-item">
                <CheckIcon size={16} className="text-mint" />
                <span><strong>Standardized Destination Discovery:</strong> Drivers select registered trauma centers (e.g. PMCH, IGIMS, NMCH, AIIMS) with verified gate coordinates.</span>
              </li>
              <li className="stakeholder-list-item">
                <CheckIcon size={16} className="text-mint" />
                <span><strong>Direct Emergency Ramp Routing:</strong> Incorporates specialized infrastructure like the PMCH dedicated elevated flyover ramp from Ganga Path.</span>
              </li>
              <li className="stakeholder-list-item">
                <CheckIcon size={16} className="text-mint" />
                <span><strong>Reliable Arrival Forecasting:</strong> Real-time traffic intelligence prevents ambulances from getting stranded 500 meters from trauma center gates.</span>
              </li>
              <li className="stakeholder-list-item">
                <CheckIcon size={16} className="text-mint" />
                <span><strong>Honest Integration Scope:</strong> AmbuRoute operates as the arterial transit bridge; no invasive internal hospital hospital-side software required.</span>
              </li>
            </ul>

            <button
              type="button"
              className="hero-btn-secondary"
              style={{ marginTop: 'auto' }}
              onClick={() => handleNavigate('public')}
            >
              <span>View Public Network Feed</span>
              <ArrowRightIcon size={16} />
            </button>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------------
         8. IMPACT SECTION
         --------------------------------------------------------------------- */}
      <section id="impact" className="impact-section-box">
        <div className="overview-section-header" style={{ marginBottom: '1rem' }}>
          <span className="section-kicker-pill">Measurable Mission</span>
          <h2 className="overview-section-title">Saving Critical Time in Transit</h2>
          <p className="overview-section-sub">
            Emergency transit efficiency depends on seconds. AmbuRoute focuses on eliminating avoidable bottlenecks.
          </p>
        </div>

        <div className="impact-pillars-grid">
          <div className="impact-pillar-card">
            <h4 className="impact-pillar-title">Golden Hour Protection</h4>
            <p className="impact-pillar-desc">
              Bypassing predictable congestion spots can save 8 to 15 vital minutes for acute trauma, cardiac arrest, and stroke patients.
            </p>
          </div>

          <div className="impact-pillar-card">
            <h4 className="impact-pillar-title">Driver-in-the-Loop AI</h4>
            <p className="impact-pillar-desc">
              AI evaluates crowd reports and expressway viability, while the experienced human driver retains final routing authority.
            </p>
          </div>

          <div className="impact-pillar-card">
            <h4 className="impact-pillar-title">Community Cooperative Action</h4>
            <p className="impact-pillar-desc">
              Road users take an active, life-saving role by receiving corridor yield alerts and submitting verified road conditions.
            </p>
          </div>

          <div className="impact-pillar-card">
            <h4 className="impact-pillar-title">Privacy-Preserving Architecture</h4>
            <p className="impact-pillar-desc">
              No continuous background surveillance or device tracking. Push subscriptions rely on standard anonymized endpoints.
            </p>
          </div>

          <div className="impact-pillar-card">
            <h4 className="impact-pillar-title">Resilient Fallbacks</h4>
            <p className="impact-pillar-desc">
              Multi-tiered AI architecture gracefully falls back from Meta Muse Spark to Groq and deterministic logic during network drops.
            </p>
          </div>

          <div className="impact-pillar-card">
            <h4 className="impact-pillar-title">Open Geospatial Standards</h4>
            <p className="impact-pillar-desc">
              Built on OpenStreetMap and Leaflet to enable rapid deployment across diverse cities without proprietary vendor lock-in.
            </p>
          </div>
        </div>

        <div className="impact-closing-banner">
          <h3 className="impact-closing-headline">
            Making Emergency Response Smarter, Safer and More Connected.
          </h3>
          <p className="impact-closing-sub">
            Experience the complete platform today. Explore the live transit network, test community reporting, or inspect the driver cockpit.
          </p>
          <div style={{ display: 'flex', gap: '0.85rem', flexWrap: 'wrap', justifyContent: 'center' }}>
            <button
              type="button"
              className="hero-btn-primary"
              onClick={() => handleNavigate('public')}
            >
              <span>Explore Public Network</span>
              <ArrowRightIcon size={16} />
            </button>
            <button
              type="button"
              className="hero-btn-secondary"
              onClick={() => handleNavigate('login')}
            >
              <span>Sign In / Register</span>
            </button>
            <button
              type="button"
              className="hero-btn-outline"
              onClick={() => handleNavigate('alerts')}
            >
              <span>Enable Alerts</span>
            </button>
          </div>
        </div>
      </section>

      {/* Floating Back to Top Quick Navigation */}
      {showBackToTop && (
        <button
          type="button"
          className="overview-back-to-top-btn"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          aria-label="Back to top"
          title="Scroll back to top"
        >
          <ArrowUpIcon size={16} />
          <span>Top</span>
        </button>
      )}
    </div>
  );
}

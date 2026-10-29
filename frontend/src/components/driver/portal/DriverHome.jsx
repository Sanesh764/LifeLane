import React from 'react';
import { useSimulation } from '../../../context/useSimulation.js';
import { Card } from '../../common/Card.jsx';
import { Button } from '../../common/Button.jsx';
import { Badge } from '../../common/Badge.jsx';
import {
  SirenIcon,
  RouteIcon,
  MapPinIcon,
  AlertTriangleIcon,
  HistoryIcon,
  BellIcon,
  SettingsIcon,
  FileTextIcon,
  CheckCircle2Icon,
  ArrowRightIcon,
} from '../../common/Icons.jsx';

export function DriverHome() {
  const {
    currentUser,
    selectedVehicle,
    selectedDestination,
    tripStatus,
    navigateToDriverSubTab,
    endTrip,
    tripHistory,
    trafficReports,
  } = useSimulation();

  const isTripActive = tripStatus === 'ACTIVE';
  const recentTrips = (tripHistory || []).slice(0, 3);
  const recentAlerts = (trafficReports || []).slice(0, 3);

  return (
    <div className="driver-home-dashboard">
      {/* 1. Welcome & Status Banner */}
      <section className="driver-home-hero" aria-label="Operational Greeting">
        <div className="driver-home-hero__content">
          <div className="hero-status-pill-row">
            <Badge
              variant={isTripActive ? 'critical' : 'clear'}
              size="md"
              pulse={isTripActive}
            >
              {isTripActive ? 'MISSION IN PROGRESS' : 'UNIT ON STANDBY · READY'}
            </Badge>
            <Badge variant="neutral" size="sm">PATNA CENTRAL ARTERIAL SECTOR</Badge>
            <Badge variant="warning" size="sm">DEMO SIMULATION</Badge>
          </div>

          <h1 className="driver-home-hero__title">
            Welcome, {currentUser?.driverName || 'Officer Amitabh Sen'}
          </h1>

          <p className="driver-home-hero__subtitle">
            Unit <strong>{selectedVehicle.callSign}</strong> ({selectedVehicle.vehicleNumber}) is assigned to your session. Monitor emergency corridors and review traffic observations across Patna.
          </p>
        </div>

        {/* Primary Mission Action CTA */}
        <div className="driver-home-hero__cta">
          {!isTripActive ? (
            <Button
              variant="critical"
              size="lg"
              icon={SirenIcon}
              onClick={() => navigateToDriverSubTab('start')}
              className="btn-hero-start"
            >
              Start Emergency Mission
            </Button>
          ) : (
            <div className="active-mission-cta-group">
              <Button
                variant="critical"
                size="lg"
                icon={RouteIcon}
                pulse
                onClick={() => navigateToDriverSubTab('active')}
                className="btn-hero-resume"
              >
                Resume Active Mission
              </Button>
              <Button
                variant="outline"
                size="md"
                onClick={endTrip}
                className="btn-conclude-trip"
              >
                Conclude Trip
              </Button>
            </div>
          )}
        </div>
      </section>

      {/* 2. Operational Overview 3-Card Summary Strip */}
      <section className="driver-overview-grid" aria-label="Operational Summary">
        {/* Card 1: Unit & Equipment Status */}
        <Card variant="surface" className="overview-summary-card">
          <div className="summary-card-header">
            <div className="summary-card-icon-wrap text-mint">
              <CheckCircle2Icon size={20} />
            </div>
            <span className="summary-card-tag">ASSIGNED UNIT</span>
          </div>
          <div className="summary-card-title">{selectedVehicle.callSign}</div>
          <div className="summary-card-metric">{selectedVehicle.vehicleNumber}</div>
          <div className="summary-card-footer text-muted">
            Status: {isTripActive ? 'En route on arterial corridor' : 'Stationary at standby staging post'}
          </div>
        </Card>

        {/* Card 2: Mission Destination Status */}
        <Card variant="surface" className="overview-summary-card">
          <div className="summary-card-header">
            <div className="summary-card-icon-wrap text-red">
              <MapPinIcon size={20} />
            </div>
            <span className="summary-card-tag">
              {isTripActive ? 'ACTIVE TARGET BASE' : 'MISSION DESTINATION'}
            </span>
          </div>
          <div className="summary-card-title">
            {selectedDestination ? (selectedDestination.shortName || selectedDestination.name) : 'No Destination Assigned'}
          </div>
          <div className="summary-card-metric">
            {selectedDestination
              ? `~${selectedDestination.distanceKm} km · ${selectedDestination.baseEtaMins || 15} min base ETA`
              : 'Awaiting emergency dispatch'}
          </div>
          <div className="summary-card-footer text-muted">
            {isTripActive ? 'Live corridor broadcast active' : 'Select origin & hospital on Start Emergency'}
          </div>
        </Card>

        {/* Card 3: Traffic Observations Count */}
        <Card variant="surface" className="overview-summary-card">
          <div className="summary-card-header">
            <div className="summary-card-icon-wrap text-amber">
              <AlertTriangleIcon size={20} />
            </div>
            <span className="summary-card-tag">CORRIDOR OBSERVATIONS</span>
          </div>
          <div className="summary-card-title">
            {trafficReports?.length || 0} Corridor Hazard Reports
          </div>
          <div className="summary-card-metric">
            {trafficReports?.filter((r) => r.reportType === 'ROAD_BLOCKED').length || 0} Blockages Reported
          </div>
          <div className="summary-card-footer">
            <button
              type="button"
              className="card-text-link"
              onClick={() => navigateToDriverSubTab('traffic')}
            >
              Inspect Observation Stream &rarr;
            </button>
          </div>
        </Card>
      </section>

      {/* 3. Two-Column Dashboard Activity Grid */}
      <div className="driver-dashboard-dual-grid">
        {/* Left Column: Recent Trips Activity */}
        <section className="dashboard-section" aria-label="Recent Missions">
          <div className="dashboard-section-header">
            <div className="dashboard-section-title-wrap">
              <HistoryIcon size={18} className="text-primary" />
              <h2 className="dashboard-section-title">Recent Vehicle Missions</h2>
            </div>
            <Button
              variant="outline"
              size="sm"
              icon={ArrowRightIcon}
              iconPosition="right"
              onClick={() => navigateToDriverSubTab('history')}
            >
              All Trips ({tripHistory?.length || 0})
            </Button>
          </div>

          <div className="recent-trips-list">
            {recentTrips.length === 0 ? (
              <Card variant="surface" className="empty-state-card">
                <p className="empty-state-text">No completed missions recorded in this session.</p>
              </Card>
            ) : (
              recentTrips.map((trip) => (
                <Card key={trip.id} variant="surface" className="trip-summary-item">
                  <div className="trip-item-top">
                    <span className="trip-id-badge">{trip.id}</span>
                    <Badge variant="clear" size="sm">COMPLETED</Badge>
                  </div>
                  <div className="trip-destination-name">{trip.shortDestination}</div>
                  <div className="trip-meta-row text-muted">
                    <span>{trip.durationMins} mins</span>
                    <span>·</span>
                    <span>{trip.distanceKm} km</span>
                    <span>·</span>
                    <span>{trip.routeTaken}</span>
                  </div>
                </Card>
              ))
            )}
          </div>
        </section>

        {/* Right Column: Recent Traffic Alerts & Shortcuts */}
        <section className="dashboard-section" aria-label="Corridor Intelligence & Shortcuts">
          <div className="dashboard-section-header">
            <div className="dashboard-section-title-wrap">
              <FileTextIcon size={18} className="text-amber" />
              <h2 className="dashboard-section-title">Corridor Traffic Observations</h2>
            </div>
            <Button
              variant="outline"
              size="sm"
              icon={ArrowRightIcon}
              iconPosition="right"
              onClick={() => navigateToDriverSubTab('traffic')}
            >
              View Feed
            </Button>
          </div>

          <div className="recent-alerts-list">
            {recentAlerts.map((report) => (
              <Card key={report.id} variant="surface" className="alert-summary-item">
                <div className="alert-item-header">
                  <Badge
                    variant={
                      report.reportType === 'ROAD_BLOCKED'
                        ? 'critical'
                        : report.reportType === 'TRAFFIC_HIGH'
                        ? 'warning'
                        : 'clear'
                    }
                    size="sm"
                  >
                    {report.reportType}
                  </Badge>
                  <span className="alert-item-road">{report.roadSegment}</span>
                </div>
                <p className="alert-item-desc">{report.locationDescription}</p>
              </Card>
            ))}
          </div>

          {/* Quick Portal Shortcuts */}
          <div className="portal-shortcuts-card">
            <div className="shortcuts-title">Portal Shortcuts</div>
            <div className="shortcuts-grid">
              <button
                type="button"
                className="shortcut-tile"
                onClick={() => navigateToDriverSubTab('notifications')}
              >
                <BellIcon size={18} />
                <span>Notifications</span>
              </button>
              <button
                type="button"
                className="shortcut-tile"
                onClick={() => navigateToDriverSubTab('settings')}
              >
                <SettingsIcon size={18} />
                <span>Unit Settings</span>
              </button>
              <button
                type="button"
                className="shortcut-tile"
                onClick={() => {
                  window.location.hash = 'report';
                }}
              >
                <FileTextIcon size={18} />
                <span>Submit Report</span>
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

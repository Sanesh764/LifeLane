import React from 'react';
import { useSimulation } from '../context/useSimulation.js';
import { TrafficReportForm } from '../components/traffic/TrafficReportForm.jsx';
import { TrafficFeed } from '../components/traffic/TrafficFeed.jsx';
import { SimulationMap } from '../components/map/SimulationMap.jsx';
import { ErrorBoundary } from '../components/common/ErrorBoundary.jsx';
import { Badge } from '../components/common/Badge.jsx';
import { Card } from '../components/common/Card.jsx';
import { AlertTriangleIcon, OctagonAlertIcon, CheckCircleIcon } from '../components/common/Icons.jsx';

/**
 * TrafficReportPage: Map-Focused Traffic Incident Management Interface
 *
 * Inspired by professional incident-management software (Reference #3):
 * - Interactive geographic route map with selectable road hazards
 * - Selected Incident Inspector panel
 * - Filterable traffic report stream (Clear, Congested, Blocked, Cannot Assess)
 * - Safe, touch-friendly reporting controls
 */
export function TrafficReportPage() {
  const { selectedIncident, trafficReports } = useSimulation();

  const blockedCount = trafficReports.filter((r) => r.reportType === 'ROAD_BLOCKED').length;
  const highTrafficCount = trafficReports.filter((r) => r.reportType === 'TRAFFIC_HIGH').length;
  const clearCount = trafficReports.filter((r) => r.reportType === 'CLEAR').length;

  return (
    <div className="incident-management-page">
      {/* Top Incident Operations Header */}
      <div className="incident-ops-header">
        <div>
          <div className="ops-badge-row">
            <Badge variant="warning" size="sm">LIVE COMMUNITY OBSERVATIONS</Badge>
            <Badge variant="neutral" size="sm">INCIDENT MANAGEMENT</Badge>
          </div>
          <h1 className="incident-ops-title">Community Traffic Intelligence & Road Hazards</h1>
          <p className="incident-ops-sub">
            Citizen observations are evaluated for freshness and independent agreement to guide emergency ambulance routing.
          </p>
        </div>

        {/* Operational Incident Counts */}
        <div className="incident-counts-strip">
          <div className="count-pill count-pill--blocked">
            <OctagonAlertIcon size={14} className="text-red" />
            <span>{blockedCount} BLOCKED</span>
          </div>
          <div className="count-pill count-pill--heavy">
            <AlertTriangleIcon size={14} className="text-amber" />
            <span>{highTrafficCount} CONGESTED</span>
          </div>
          <div className="count-pill count-pill--clear">
            <CheckCircleIcon size={14} className="text-mint" />
            <span>{clearCount} CLEAR</span>
          </div>
        </div>
      </div>

      {/* Main Two-Column Incident Operations Grid */}
      <div className="incident-ops-grid">
        {/* Left Column: Geographic Map with Selectable Hazards */}
        <section className="incident-map-col" aria-label="Incident Map Overview">
          <div className="incident-map-wrapper">
            <ErrorBoundary>
              <SimulationMap />
            </ErrorBoundary>
          </div>

          {/* Selected Incident Inspector Card */}
          {selectedIncident && (
            <Card variant="surface" className="incident-inspector-card">
              <div className="inspector-header">
                <div className="inspector-badge-wrap">
                  <Badge
                    variant={
                      selectedIncident.reportType === 'ROAD_BLOCKED'
                        ? 'critical'
                        : selectedIncident.reportType === 'TRAFFIC_HIGH'
                        ? 'warning'
                        : selectedIncident.reportType === 'CLEAR'
                        ? 'clear'
                        : 'neutral'
                    }
                    size="md"
                  >
                    {selectedIncident.reportType}
                  </Badge>
                  <Badge
                    variant={
                      (selectedIncident.locationStatus || 'LOCATION UNVERIFIED') === 'LOCATION MATCHED'
                        ? 'clear'
                        : 'warning'
                    }
                    size="sm"
                  >
                    {selectedIncident.locationStatus || 'LOCATION UNVERIFIED'}
                  </Badge>
                  <Badge
                    variant={
                      (selectedIncident.corroborationStatus || (selectedIncident.verifiedCount > 1 ? 'CORROBORATED' : 'UNVERIFIED REPORT')) === 'CORROBORATED'
                        ? 'warning'
                        : 'neutral'
                    }
                    size="sm"
                  >
                    {selectedIncident.corroborationStatus || (selectedIncident.verifiedCount > 1 ? 'CORROBORATED' : 'UNVERIFIED REPORT')}
                  </Badge>
                  {selectedIncident.isDemo ? (
                    <Badge variant="neutral" size="sm">DEMO BASELINE</Badge>
                  ) : (
                    <Badge variant="clear" size="sm">LIVE REPORT</Badge>
                  )}
                </div>
                <div className="inspector-title-row">
                  <span className="inspector-road-name">{selectedIncident.roadSegment}</span>
                  <span className="inspector-source-tag">Source: {selectedIncident.source}</span>
                </div>
              </div>

              <div className="inspector-description-text">
                {selectedIncident.locationDescription}
              </div>

              <div className="inspector-meta-row">
                <div className="meta-item">
                  <span className="meta-label">Freshness:</span>
                  <span className="meta-val">
                    {selectedIncident.freshness === 'JUST_NOW'
                      ? 'Just now'
                      : selectedIncident.freshness === 'FRESH'
                      ? 'Fresh (<10m ago)'
                      : 'Stale observation (>20m)'}
                  </span>
                </div>
                <div className="meta-item">
                  <span className="meta-label">Location Check:</span>
                  <span className="meta-val">
                    {selectedIncident.locationStatus === 'LOCATION MATCHED'
                      ? 'Matched with corridor geometry'
                      : 'Unverified device coordinates'}
                  </span>
                </div>
                <div className="meta-item">
                  <span className="meta-label">Independent Reports:</span>
                  <span className="meta-val">{selectedIncident.verifiedCount} confirming observations</span>
                </div>
                <div className="meta-item">
                  <span className="meta-label">Routing Impact:</span>
                  <span className="meta-val text-amber">
                    {selectedIncident.reportType === 'ROAD_BLOCKED' && (selectedIncident.verifiedCount > 1 || selectedIncident.locationStatus === 'LOCATION MATCHED')
                      ? 'Atal Path detour candidate (requires driver review)'
                      : 'Monitored; unverified single report does not alter route'}
                  </span>
                </div>
              </div>
            </Card>
          )}
        </section>

        {/* Right Column: Reporting Form and Incident Stream */}
        <aside className="incident-sidebar-col" aria-label="Incident Reporting and Feed">
          {/* One-Tap Condition Reporting Form */}
          <TrafficReportForm />

          {/* Filterable Incident Stream */}
          <div className="feed-container-card">
            <div className="feed-container-header">
              <h3 className="feed-container-title">Active Traffic Incident Stream</h3>
              <Badge variant="clear" size="sm">Real-Time</Badge>
            </div>
            <TrafficFeed />
          </div>
        </aside>
      </div>
    </div>
  );
}

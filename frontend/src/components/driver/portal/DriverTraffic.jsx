import React, { useState } from 'react';
import { useSimulation } from '../../../context/useSimulation.js';
import { Card } from '../../common/Card.jsx';
import { Button } from '../../common/Button.jsx';
import { Badge } from '../../common/Badge.jsx';
import {
  FileTextIcon,
  MapPinIcon,
  ShieldCheckIcon,
} from '../../common/Icons.jsx';

export function DriverTraffic() {
  const { trafficReports, selectedIncident, setSelectedIncident } = useSimulation();
  const [filterType, setFilterType] = useState('ALL');

  const filteredReports = (trafficReports || []).filter((r) => {
    if (filterType === 'ALL') return true;
    return r.reportType === filterType;
  });

  return (
    <div className="driver-traffic-page">
      <div className="page-header-row">
        <div>
          <div className="ops-badge-row">
            <Badge variant="warning" size="sm">CROWDSOURCED INTELLIGENCE</Badge>
            <Badge variant="neutral" size="sm">PATNA SECTOR</Badge>
          </div>
          <h1 className="page-title">Corridor Traffic Observations</h1>
          <p className="page-subtitle">
            Citizen road observations submitted along Patna routes. Public reports provide preliminary awareness and require verification before altering official transit routes.
          </p>
        </div>

        <Button
          variant="outline"
          size="md"
          icon={FileTextIcon}
          onClick={() => {
            window.location.hash = 'report';
          }}
        >
          Open Public Submission Form &rarr;
        </Button>
      </div>

      {/* Filter Tabs */}
      <div className="traffic-filter-bar">
        <button
          type="button"
          className={`filter-tab-btn ${filterType === 'ALL' ? 'is-active' : ''}`}
          onClick={() => setFilterType('ALL')}
        >
          All ({trafficReports?.length || 0})
        </button>
        <button
          type="button"
          className={`filter-tab-btn ${filterType === 'ROAD_BLOCKED' ? 'is-active' : ''}`}
          onClick={() => setFilterType('ROAD_BLOCKED')}
        >
          Blocked ({trafficReports?.filter((r) => r.reportType === 'ROAD_BLOCKED').length || 0})
        </button>
        <button
          type="button"
          className={`filter-tab-btn ${filterType === 'TRAFFIC_HIGH' ? 'is-active' : ''}`}
          onClick={() => setFilterType('TRAFFIC_HIGH')}
        >
          Congested ({trafficReports?.filter((r) => r.reportType === 'TRAFFIC_HIGH').length || 0})
        </button>
        <button
          type="button"
          className={`filter-tab-btn ${filterType === 'CLEAR' ? 'is-active' : ''}`}
          onClick={() => setFilterType('CLEAR')}
        >
          Clear ({trafficReports?.filter((r) => r.reportType === 'CLEAR').length || 0})
        </button>
        <button
          type="button"
          className={`filter-tab-btn ${filterType === 'CANNOT_ASSESS' ? 'is-active' : ''}`}
          onClick={() => setFilterType('CANNOT_ASSESS')}
        >
          Cannot Assess
        </button>
      </div>

      <div className="driver-traffic-dual-layout">
        {/* Reports List */}
        <div className="traffic-reports-stream">
          {filteredReports.map((report) => {
            const isSelected = selectedIncident?.id === report.id;
            return (
              <Card
                key={report.id}
                variant="surface"
                className={`traffic-observation-card ${isSelected ? 'is-selected' : ''}`}
                onClick={() => setSelectedIncident(report)}
              >
                <div className="observation-card-header">
                  <Badge
                    variant={
                      report.reportType === 'ROAD_BLOCKED'
                        ? 'critical'
                        : report.reportType === 'TRAFFIC_HIGH'
                        ? 'warning'
                        : report.reportType === 'CLEAR'
                        ? 'clear'
                        : 'neutral'
                    }
                    size="sm"
                  >
                    {report.reportType}
                  </Badge>
                  <span className="observation-source text-muted">
                    {report.source} · {report.freshness === 'JUST_NOW' ? 'Just Now' : report.freshness === 'FRESH' ? '<10m ago' : 'Stale (>20m)'}
                  </span>
                </div>

                <div className="observation-road-name">
                  <MapPinIcon size={14} className="text-primary" />
                  <strong>{report.roadSegment}</strong>
                </div>

                <p className="observation-description">{report.locationDescription}</p>

                <div className="observation-footer-row text-muted">
                  <span>{report.verifiedCount} independent citizen confirmations</span>
                  <button
                    type="button"
                    className="select-link"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedIncident(report);
                    }}
                  >
                    Inspect details &rarr;
                  </button>
                </div>
              </Card>
            );
          })}
        </div>

        {/* Selected Incident Inspector Sidebar */}
        <aside className="traffic-details-sidebar" aria-label="Selected Hazard Details">
          {selectedIncident ? (
            <Card variant="surface" className="selected-hazard-inspector">
              <div className="inspector-top-tag">
                <span className="tag-label">SELECTED OBSERVATION DETAILS</span>
                <Badge
                  variant={
                    selectedIncident.reportType === 'ROAD_BLOCKED'
                      ? 'critical'
                      : selectedIncident.reportType === 'TRAFFIC_HIGH'
                      ? 'warning'
                      : 'clear'
                  }
                  size="sm"
                >
                  {selectedIncident.reportType}
                </Badge>
              </div>

              <h2 className="inspector-road-heading">{selectedIncident.roadSegment}</h2>
              <p className="inspector-desc-box">{selectedIncident.locationDescription}</p>

              <div className="inspector-metrics-list">
                <div className="inspector-metric-row">
                  <span className="metric-label">Reporting Source:</span>
                  <span className="metric-value">{selectedIncident.source}</span>
                </div>
                <div className="inspector-metric-row">
                  <span className="metric-label">Freshness Evaluation:</span>
                  <span className="metric-value">
                    {selectedIncident.freshness === 'JUST_NOW'
                      ? 'Active (< 5 mins)'
                      : selectedIncident.freshness === 'FRESH'
                      ? 'Fresh (5-15 mins)'
                      : 'Stale (> 20 mins)'}
                  </span>
                </div>
                <div className="inspector-metric-row">
                  <span className="metric-label">Independent Agreement:</span>
                  <span className="metric-value">{selectedIncident.verifiedCount} observations</span>
                </div>
                <div className="inspector-metric-row">
                  <span className="metric-label">Routing Impact:</span>
                  <span className="metric-value text-amber">
                    {selectedIncident.reportType === 'ROAD_BLOCKED'
                      ? 'Atal Path Detour Evaluated'
                      : 'Monitored on active corridor'}
                  </span>
                </div>
              </div>

              <div className="driver-protocol-note">
                <ShieldCheckIcon size={16} className="text-mint" />
                <span>
                  <strong>Driver Discretion Rule:</strong> A single crowdsourced report does not force an automatic reroute. The backend calculates detours only when independent agreement and ETA metrics support it.
                </span>
              </div>
            </Card>
          ) : (
            <Card variant="surface" className="empty-inspector-card text-muted">
              <p>Select any corridor observation to view freshness and routing impact details.</p>
            </Card>
          )}
        </aside>
      </div>
    </div>
  );
}

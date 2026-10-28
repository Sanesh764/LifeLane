import React, { useState } from 'react';
import { useSimulation } from '../../context/useSimulation.js';
import { Card } from '../common/Card.jsx';
import { Badge } from '../common/Badge.jsx';
import { CheckCircleIcon, AlertTriangleIcon, OctagonAlertIcon, HelpCircleIcon } from '../common/Icons.jsx';

/**
 * TrafficFeed: Incident Management Observations Feed
 *
 * Supports filtering across all 4 categories:
 * - ALL
 * - ROAD_BLOCKED
 * - TRAFFIC_HIGH
 * - CLEAR
 * - CANNOT_ASSESS
 *
 * Allows clicking an incident to inspect details and cross-highlight on the map.
 */
export function TrafficFeed({ onSelectReport }) {
  const { trafficReports, selectedIncident, setSelectedIncident } = useSimulation();
  const [filterType, setFilterType] = useState('ALL');

  const filteredReports = trafficReports.filter((r) => {
    if (filterType === 'ALL') return true;
    return r.reportType === filterType;
  });

  const handleReportClick = (report) => {
    setSelectedIncident(report);
    if (onSelectReport) onSelectReport(report);
  };

  return (
    <Card variant="surface" className="traffic-feed-widget">
      {/* Feed Filter Chips */}
      <div className="traffic-feed-filters-row">
        {['ALL', 'ROAD_BLOCKED', 'TRAFFIC_HIGH', 'CLEAR', 'CANNOT_ASSESS'].map((type) => (
          <button
            key={type}
            type="button"
            className={`feed-filter-btn ${filterType === type ? 'is-active' : ''}`}
            onClick={() => setFilterType(type)}
          >
            {type === 'ALL'
              ? 'All'
              : type === 'ROAD_BLOCKED'
              ? 'Blocked'
              : type === 'TRAFFIC_HIGH'
              ? 'Congested'
              : type === 'CLEAR'
              ? 'Clear'
              : 'Unknown'}
          </button>
        ))}
      </div>

      {/* Incident List */}
      <div className="traffic-feed-scroll">
        {filteredReports.length === 0 ? (
          <div className="empty-feed-state">
            <p>No community reports match the {filterType} filter.</p>
          </div>
        ) : (
          filteredReports.map((report) => {
            const isSelected = selectedIncident && selectedIncident.id === report.id;

            let badgeVariant = 'neutral';
            let Icon = HelpCircleIcon;
            let iconClass = 'text-muted';

            if (report.reportType === 'CLEAR') {
              badgeVariant = 'clear';
              Icon = CheckCircleIcon;
              iconClass = 'text-mint';
            } else if (report.reportType === 'TRAFFIC_HIGH') {
              badgeVariant = 'warning';
              Icon = AlertTriangleIcon;
              iconClass = 'text-amber';
            } else if (report.reportType === 'ROAD_BLOCKED') {
              badgeVariant = 'critical';
              Icon = OctagonAlertIcon;
              iconClass = 'text-red';
            } else if (report.reportType === 'CANNOT_ASSESS') {
              badgeVariant = 'neutral';
              Icon = HelpCircleIcon;
              iconClass = 'text-muted';
            }

            return (
              <div
                key={report.id}
                className={`feed-incident-item ${isSelected ? 'is-selected' : ''}`}
                onClick={() => handleReportClick(report)}
                title="Click to view details on map"
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') handleReportClick(report);
                }}
              >
                <div className="feed-item-icon-box">
                  <Icon size={16} className={iconClass} />
                </div>

                <div className="feed-item-content">
                  <div className="feed-item-topline">
                    <span className="feed-road-title">{report.roadSegment}</span>
                    <Badge variant={badgeVariant} size="sm">
                      {report.reportType}
                    </Badge>
                  </div>

                  <div className="feed-item-description">{report.locationDescription}</div>

                  <div className="feed-item-footer">
                    <span className="feed-source-tag">{report.source}</span>
                    <span>·</span>
                    <span className="feed-time-tag">
                      {report.freshness === 'JUST_NOW'
                        ? 'Just now'
                        : report.freshness === 'FRESH'
                        ? 'Fresh (<10m)'
                        : 'Stale (>20m)'}
                    </span>
                    <span>·</span>
                    <span className="feed-verified-badge">
                      {report.verifiedCount} {report.verifiedCount === 1 ? 'report' : 'agreements'}
                    </span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </Card>
  );
}

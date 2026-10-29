import React from 'react';
import { useSimulation } from '../../context/useSimulation.js';
import { Card } from '../common/Card.jsx';
import { Badge } from '../common/Badge.jsx';
import { CompassIcon, CheckCircleIcon, ArrowRightIcon } from '../common/Icons.jsx';

/**
 * ActiveTripPanel: Zone 3 Active Telemetry & Corridor Progression
 *
 * Displays:
 * - Real-time corridor position (Current Waypoint & Next Road)
 * - Honest demo telemetry (ETA, Distance, Simulated Speed)
 * - Upcoming route corridor checklist with hazard status
 */
export function ActiveTripPanel() {
  const {
    selectedDestination,
    tripStatus,
    currentRoute,
    currentSegmentIdx,
    currentSpeedKmh,
  } = useSimulation();

  const isTripActive = tripStatus === 'ACTIVE';
  const currentSegment = currentRoute.segments[currentSegmentIdx] || currentRoute.segments[0];
  const nextSegment = currentRoute.segments[currentSegmentIdx + 1];

  return (
    <Card variant="surface" className="telemetry-panel-card">
      {/* Telemetry Metric Strip */}
      <div className="telemetry-metrics-grid">
        <div className="telemetry-cell">
          <div className="telemetry-label">ESTIMATED ETA</div>
          <div className="telemetry-val text-amber">
            {isTripActive ? `${currentRoute.currentEtaMins} MIN` : '--'}
          </div>
          <div className="telemetry-sub">DEMO VALUE</div>
        </div>

        <div className="telemetry-cell">
          <div className="telemetry-label">ROUTE DISTANCE</div>
          <div className="telemetry-val">
            {isTripActive ? `${currentRoute.totalDistanceKm} KM` : '--'}
          </div>
          <div className="telemetry-sub">DEMO GEOMETRY</div>
        </div>

        <div className="telemetry-cell">
          <div className="telemetry-label">TRANSIT SPEED</div>
          <div className="telemetry-val">
            {isTripActive ? `${currentSpeedKmh} KM/H` : '0 KM/H'}
          </div>
          <div className="telemetry-sub">SIMULATED</div>
        </div>
      </div>

      {/* Corridor Waypoint Progression Block */}
      <div className="telemetry-waypoint-block">
        <div className="waypoint-current-row">
          <div className="waypoint-icon">
            <CompassIcon size={18} className="text-amber" />
          </div>
          <div className="waypoint-info">
            <div className="waypoint-tag">CURRENT CORRIDOR WAYPOINT</div>
            <div className="waypoint-name">
              {isTripActive ? currentSegment.roadName : 'Unit at Depot / Inactive'}
            </div>
            <div className="waypoint-target">
              Base: {selectedDestination?.shortName || selectedDestination?.name || 'Awaiting Mission Dispatch'}
            </div>
          </div>
        </div>

        {isTripActive && nextSegment && (
          <div className="waypoint-next-row">
            <div className="waypoint-next-tag">
              <span>APPROACHING NEXT</span>
              <ArrowRightIcon size={12} />
            </div>
            <div className="waypoint-next-name">{nextSegment.roadName}</div>
          </div>
        )}
      </div>

      {/* Upcoming Corridor Checklist */}
      <div className="corridor-checklist">
        <div className="corridor-checklist-header">
          <span>UPCOMING ROUTE CORRIDORS (PATNA)</span>
          <Badge variant="neutral" size="sm">500m Targeting</Badge>
        </div>

        <div className="corridor-checklist-items">
          {currentRoute.segments.map((seg, idx) => {
            const isPassed = idx < currentSegmentIdx;
            const isCurrent = idx === currentSegmentIdx;

            return (
              <div
                key={seg.id}
                className={`corridor-item-row ${isCurrent ? 'is-current' : ''} ${
                  isPassed ? 'is-passed' : ''
                }`}
              >
                <div className="corridor-item-status">
                  {isPassed ? (
                    <CheckCircleIcon size={14} className="text-mint" />
                  ) : isCurrent ? (
                    <span className="corridor-now-dot" />
                  ) : (
                    <span className="corridor-pending-dot" />
                  )}
                </div>

                <div className="corridor-item-details">
                  <div className="corridor-item-name">
                    <span>{seg.roadName}</span>
                    {isCurrent && <span className="now-badge">NOW</span>}
                  </div>
                  <div className="corridor-item-meta">
                    {seg.distanceMeters}m · ~{Math.round(seg.etaSeconds / 60)} min demo travel
                  </div>
                </div>

                <div className="corridor-item-badge">
                  {seg.status === 'ROAD_BLOCKED' && (
                    <Badge variant="critical" size="sm">BLOCKED</Badge>
                  )}
                  {seg.status === 'TRAFFIC_HIGH' && (
                    <Badge variant="warning" size="sm">SLOW</Badge>
                  )}
                  {seg.status === 'CLEAR' && (
                    <Badge variant="clear" size="sm">CLEAR</Badge>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}

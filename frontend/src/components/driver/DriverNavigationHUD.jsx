import React from 'react';
import { useSimulation } from '../../context/useSimulation.js';
import { calculateDistanceMeters } from '../../services/mapLocations.js';
import { Badge } from '../common/Badge.jsx';
import {
  CompassIcon,
  ArrowRightIcon,
  MapPinIcon,
  Volume2Icon,
  VolumeXIcon,
  AlertTriangleIcon,
  CheckCircleIcon,
  RadioIcon,
} from '../common/Icons.jsx';

/**
 * DriverNavigationHUD: Compact, Persistent Automotive-Grade Navigation Guidance Area
 *
 * Provides immediate situational awareness for the ambulance driver:
 * 1. Current corridor / waypoint.
 * 2. Next road / upcoming turn.
 * 3. Target medical destination.
 * 4. Remaining distance and ETA.
 * 5. Latest corridor traffic hazard alert.
 * 6. Verbal voice-guidance status & quick replay controls.
 */
export function DriverNavigationHUD() {
  const {
    activeTrip,
    isTestModeLocation,
    driverLiveGps,
    driverLiveRoadName,
    lastServerUpdate,
    currentRoute,
    currentSegmentIdx,
    selectedDestination,
    currentSpeedKmh,
    trafficReports,
    trafficClusters,
    isSpeaking,
    isMuted,
    setIsMuted,
    latestVoiceGuidance,
    triggerVoiceGuidance,
  } = useSimulation();

  const currentSegment = currentRoute.segments[currentSegmentIdx] || currentRoute.segments[0];
  const nextSegment = currentRoute.segments[currentSegmentIdx + 1];
  const currentRoadDisplay = driverLiveRoadName || currentSegment.roadName;

  // Calculate live remaining straight-line distance if live mission, else sum segment distances
  let remainingKm = '0.0';
  if (currentRoute?.isLive && driverLiveGps?.lat && driverLiveGps?.lng && selectedDestination?.coordinates) {
    const destCoords = [selectedDestination.coordinates[1], selectedDestination.coordinates[0]];
    const distM = calculateDistanceMeters([driverLiveGps.lat, driverLiveGps.lng], destCoords);
    remainingKm = distM ? (distM / 1000).toFixed(1) : currentRoute.totalDistanceKm || '0.0';
  } else {
    const remainingMeters = currentRoute.segments
      .slice(currentSegmentIdx)
      .reduce((sum, seg) => sum + (seg.distanceMeters || 1000), 0);
    remainingKm = (remainingMeters / 1000).toFixed(1);
  }

  // Find relevant traffic reports for upcoming route segments
  const upcomingRoadNames = currentRoute.segments
    .slice(currentSegmentIdx)
    .map((s) => s.roadName.toLowerCase());

  const upcomingHazard = (trafficReports || []).find((r) =>
    upcomingRoadNames.some((road) => r.roadSegment.toLowerCase().includes(road) || road.includes(r.roadSegment.toLowerCase()))
  );

  return (
    <div className="driver-navigation-hud" role="region" aria-label="Active Navigation Guidance">
      {/* Block 1: Next Direction & Current Waypoint */}
      <div className="hud-maneuver-block">
        <div className="hud-turn-icon-wrap" aria-hidden="true">
          <ArrowRightIcon size={26} className="text-primary" />
        </div>
        <div className="hud-maneuver-text">
          <div className="hud-waypoint-meta">
            <CompassIcon size={12} className="text-muted" />
            <span>CURRENT: <strong>{currentRoadDisplay}</strong></span>
          </div>
          <div className="hud-next-road-title">
            {nextSegment ? nextSegment.roadName : `Approaching ${selectedDestination?.shortName || selectedDestination?.name || 'Trauma Center'}`}
          </div>
          <div className="hud-maneuver-hint">
            {nextSegment ? 'Continue along emergency transit corridor' : 'Direct emergency transit corridor'}
          </div>
        </div>
      </div>

      {/* Block 2: Destination, Remaining Distance & ETA */}
      <div className="hud-telemetry-block">
        <div className="hud-dest-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '4px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <MapPinIcon size={14} className="text-teal" />
            <strong className="hud-dest-name">{selectedDestination?.shortName || selectedDestination?.name || 'Trauma Center'}</strong>
          </div>
          {activeTrip && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Badge variant="clear" size="xs">
                TRIP #{String(activeTrip.id || activeTrip._id).substring(0, 8).toUpperCase()}
              </Badge>
              {lastServerUpdate.status === 'SYNCING' && (
                <Badge variant="warning" size="xs">SYNCING GPS...</Badge>
              )}
              {lastServerUpdate.status === 'SYNCED' && (
                <Badge variant="clear" size="xs">GPS SYNCED</Badge>
              )}
              {isTestModeLocation && (
                <Badge variant="warning" size="xs">[TEST MODE]</Badge>
              )}
            </div>
          )}
        </div>

        <div className="hud-metrics-strip">
          <div className="hud-metric">
            <span className="hud-metric-lbl">REMAINING</span>
            <span className="hud-metric-val">{remainingKm} km</span>
          </div>
          <div className="hud-metric">
            <span className="hud-metric-lbl">EST. ETA</span>
            <span className="hud-metric-val text-amber">~{currentRoute.currentEtaMins} min</span>
            {!currentRoute?.isLive && <span className="hud-demo-badge">DEMO</span>}
          </div>
          <div className="hud-metric hud-metric--speed">
            <span className="hud-metric-lbl">SPEED</span>
            <span className="hud-metric-val">{currentSpeedKmh} km/h</span>
          </div>
        </div>
      </div>

      {/* Block 3: Latest Corridor Alert & Voice Guidance */}
      <div className="hud-voice-alert-block">
        {/* Latest Traffic Hazard Alert */}
        <div className="hud-hazard-strip">
          {upcomingHazard ? (
            <div className={`hud-hazard-pill hud-hazard-pill--${upcomingHazard.reportType === 'ROAD_BLOCKED' ? 'critical' : 'warning'}`}>
              <AlertTriangleIcon size={13} />
              <span className="hud-hazard-text">
                <strong>{upcomingHazard.reportType === 'ROAD_BLOCKED' ? 'Blockage' : 'Congestion'}:</strong>{' '}
                {upcomingHazard.roadSegment} ({upcomingHazard.locationStatus || 'Unverified'})
              </span>
            </div>
          ) : (
            <div className="hud-hazard-pill hud-hazard-pill--clear">
              <CheckCircleIcon size={13} className="text-mint" />
              <span className="hud-hazard-text">Corridor clear · 500m alerts active</span>
            </div>
          )}
        </div>

        {/* Voice Guidance Status Bar */}
        <div className="hud-voice-row">
          <div className="hud-voice-status">
            <div className={`hud-voice-indicator ${isSpeaking ? 'is-speaking' : ''}`}>
              <RadioIcon size={14} />
            </div>
            <div className="hud-voice-snippet" title={latestVoiceGuidance}>
              <span className="hud-voice-tag">
                {isSpeaking ? 'SPEAKING' : 'VOICE ASSISTANT'}
              </span>
              <span className="hud-voice-quote">"{latestVoiceGuidance}"</span>
            </div>
          </div>

          <div className="hud-voice-controls">
            <button
              type="button"
              className="hud-voice-replay-btn"
              onClick={() => triggerVoiceGuidance(latestVoiceGuidance)}
              disabled={isMuted}
              title="Replay spoken route assistance"
            >
              <Volume2Icon size={14} />
              <span>Replay</span>
            </button>

            <button
              type="button"
              className={`hud-voice-mute-btn ${isMuted ? 'is-muted' : ''}`}
              onClick={() => setIsMuted(!isMuted)}
              title={isMuted ? 'Unmute voice' : 'Mute voice'}
              aria-label={isMuted ? 'Unmute voice assistance' : 'Mute voice assistance'}
            >
              {isMuted ? <VolumeXIcon size={15} /> : <Volume2Icon size={15} />}
            </button>
          </div>
        </div>

        <div className="hud-speech-disclaimer">
          <Badge variant="neutral" size="xs">
            {currentRoute?.isLive ? 'AUDIO ROUTE ASSISTANCE' : 'BROWSER SPEECH SYNTHESIS · DEMO'}
          </Badge>
        </div>
      </div>
    </div>
  );
}

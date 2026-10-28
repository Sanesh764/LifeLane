import React, { useState, useMemo } from 'react';
import { useSimulation } from '../../context/useSimulation.js';
import { Card } from '../common/Card.jsx';
import { Button } from '../common/Button.jsx';
import { Badge } from '../common/Badge.jsx';
import { TrafficReportButton } from './TrafficReportButton.jsx';
import {
  AlertTriangleIcon,
  MapPinIcon,
  CheckCircleIcon,
  CrosshairIcon,
  RefreshCwIcon,
  InfoIcon,
  ShieldCheckIcon,
} from '../common/Icons.jsx';
import { getCoordinatesForRoad, calculateDistanceMeters } from '../../services/mapLocations.js';

export function TrafficReportForm() {
  const {
    submitTrafficReport,
    userCurrentRoad,
    userGpsLocation,
    requestUserLocation,
    clearUserLocation,
    trafficReports,
  } = useSimulation();

  const [selectedType, setSelectedType] = useState('TRAFFIC_HIGH');
  const [selectedSegment, setSelectedSegment] = useState(userCurrentRoad);
  const [description, setDescription] = useState('');
  const [hasConfirmedReview, setHasConfirmedReview] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [lastSubmitted, setLastSubmitted] = useState(null);

  const roadOptions = [
    'Bailey Road / Jawaharlal Nehru Marg',
    'Dak Bungalow — Fraser Road Crossing',
    'Gandhi Maidan South Corridor',
    'Ashok Rajpath East',
    'PMCH Emergency Trauma Gate',
    'Boring Road Turnoff',
    'Atal Path Express Corridor',
    'JP Ganga Path (Marine Drive)',
    'Kankarbagh Main Road',
  ];

  // Coordinates of the currently selected road centroid
  const roadCoordinates = useMemo(() => {
    return getCoordinatesForRoad(selectedSegment);
  }, [selectedSegment]);

  // Frontend geometric proximity comparison between detected GPS and selected corridor
  const proximityResult = useMemo(() => {
    if (
      !userGpsLocation ||
      userGpsLocation.status !== 'SUCCESS' ||
      userGpsLocation.lat === null ||
      userGpsLocation.lng === null
    ) {
      return {
        status: 'LOCATION UNVERIFIED',
        distanceMeters: null,
        isMatch: false,
        explanation: 'No device GPS captured. Selected road is unverified against physical device location.',
      };
    }

    const distance = calculateDistanceMeters(
      [userGpsLocation.lat, userGpsLocation.lng],
      roadCoordinates
    );

    // If device is within 1500m of the Patna road centroid, consider it an approximate frontend match
    if (distance !== null && distance <= 1500) {
      return {
        status: 'LOCATION MATCHED',
        distanceMeters: distance,
        isMatch: true,
        explanation: `Device GPS is ~${distance}m from selected corridor centroid (±${userGpsLocation.accuracy}m confidence). Approximate frontend proximity match.`,
      };
    }

    return {
      status: 'LOCATION UNVERIFIED',
      distanceMeters: distance,
      isMatch: false,
      explanation: `Device GPS is ~${(distance / 1000).toFixed(1)}km from selected corridor centroid. Physical location does not match selected road.`,
    };
  }, [userGpsLocation, roadCoordinates]);

  // Check existing reports in simulation feed for corroboration
  const existingReportsOnRoad = useMemo(() => {
    return (trafficReports || []).filter(
      (r) => r.roadSegment.toLowerCase() === selectedSegment.toLowerCase()
    );
  }, [trafficReports, selectedSegment]);

  const corroborationStatus = existingReportsOnRoad.length > 0 ? 'CORROBORATED' : 'UNVERIFIED REPORT';

  const isGpsLocating = userGpsLocation?.status === 'LOCATING';
  const hasGpsSuccess = userGpsLocation?.status === 'SUCCESS' && userGpsLocation?.lat !== null;
  const hasGpsError =
    userGpsLocation?.status === 'DENIED' ||
    userGpsLocation?.status === 'UNAVAILABLE' ||
    userGpsLocation?.status === 'TIMEOUT' ||
    userGpsLocation?.status === 'UNSUPPORTED';

  const handleSubmit = (e) => {
    e.preventDefault();
    setErrorMessage('');

    if (!selectedSegment) {
      setErrorMessage('Please select an observed road segment in Patna.');
      return;
    }
    if (!selectedType) {
      setErrorMessage('Please select an observed road condition.');
      return;
    }
    if (!hasConfirmedReview) {
      setErrorMessage('Please review and check the confirmation box before submitting your report.');
      return;
    }

    setIsSubmitting(true);
    setTimeout(() => {
      const locationMeta = {
        locationStatus: proximityResult.status,
        coordinates: hasGpsSuccess ? [userGpsLocation.lat, userGpsLocation.lng] : null,
        accuracy: hasGpsSuccess ? userGpsLocation.accuracy : null,
        locationCapturedAt: hasGpsSuccess ? userGpsLocation.timestamp : null,
        isDemo: true,
      };

      submitTrafficReport(selectedType, selectedSegment, description, locationMeta);

      setLastSubmitted({
        type: selectedType,
        road: selectedSegment,
        locationStatus: proximityResult.status,
        hasGps: hasGpsSuccess,
      });

      setDescription('');
      setHasConfirmedReview(false);
      setIsSubmitting(false);
    }, 350);
  };

  return (
    <Card variant="surface" className="traffic-form-card" id="traffic-report-form">
      <div className="traffic-form-header">
        <div>
          <div className="form-category-tag-row">
            <Badge variant="neutral" size="sm">PATNA PUBLIC CORRIDOR</Badge>
            <Badge variant="clear" size="sm">LOCATION-AWARE UI</Badge>
          </div>
          <h2 className="traffic-form-title">One-Tap Road Condition Report</h2>
          <p className="traffic-form-desc">
            Citizen observations provide preliminary awareness for emergency ambulance routing. Capture your location, review the report, and submit.
          </p>
        </div>
        <div className="safety-warning-pill">
          <AlertTriangleIcon size={16} />
          <span>Never report while driving. Only report when safely stopped or as a passenger.</span>
        </div>
      </div>

      {lastSubmitted && (
        <div className="report-success-banner" role="status">
          <CheckCircleIcon size={18} className="text-mint" />
          <div className="report-success-text">
            <strong>Observation recorded in demo feed:</strong> {lastSubmitted.type} near {lastSubmitted.road}.
            <div className="success-meta-row">
              <Badge
                variant={lastSubmitted.locationStatus === 'LOCATION MATCHED' ? 'clear' : 'warning'}
                size="sm"
              >
                {lastSubmitted.locationStatus}
              </Badge>
              <Badge variant="neutral" size="sm">DEMO DATA</Badge>
            </div>
            <span className="report-success-disclaimer">
              Stored in local session demo feed. Unverified observations require corroboration and will not independently trigger emergency ambulance rerouting.
            </span>
          </div>
        </div>
      )}

      {errorMessage && (
        <div className="report-error-banner" role="alert">
          <AlertTriangleIcon size={16} className="text-red" />
          <span>{errorMessage}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="traffic-reporting-form-body">
        {/* Step 1: Device Geolocation Capture */}
        <div className="form-group location-capture-group">
          <div className="group-label-row">
            <label className="form-label mb-0" htmlFor="gps-capture-btn">
              <CrosshairIcon size={16} className="text-primary" />
              <span>Device Location Verification</span>
            </label>
            <span className="group-hint-text">Optional device GPS check</span>
          </div>

          <div className="location-action-box">
            {!hasGpsSuccess && (
              <Button
                id="gps-capture-btn"
                type="button"
                variant="outline"
                size="md"
                icon={CrosshairIcon}
                loading={isGpsLocating}
                onClick={requestUserLocation}
                className="gps-request-button"
              >
                {isGpsLocating ? 'Detecting Device GPS...' : 'Use My Current Location'}
              </Button>
            )}

            {/* GPS Success State */}
            {hasGpsSuccess && (
              <div className="gps-success-card">
                <div className="gps-card-topline">
                  <div className="gps-badge-row">
                    <span className="gps-live-dot" />
                    <strong className="gps-title">GPS Detected via Browser API</strong>
                    <Badge variant={proximityResult.isMatch ? 'clear' : 'warning'} size="sm">
                      {proximityResult.status}
                    </Badge>
                  </div>
                  <div className="gps-actions-mini">
                    <button
                      type="button"
                      className="gps-refresh-btn"
                      onClick={requestUserLocation}
                      title="Re-query device location"
                    >
                      <RefreshCwIcon size={13} />
                      <span>Re-check</span>
                    </button>
                    <button
                      type="button"
                      className="gps-clear-btn"
                      onClick={clearUserLocation}
                      title="Clear captured GPS coordinates"
                    >
                      Clear
                    </button>
                  </div>
                </div>

                <div className="gps-metrics-strip">
                  <div className="gps-metric-item">
                    <span className="metric-lbl">Coordinates:</span>
                    <strong className="metric-val">
                      {userGpsLocation.lat.toFixed(5)}° N, {userGpsLocation.lng.toFixed(5)}° E
                    </strong>
                  </div>
                  <div className="gps-metric-item">
                    <span className="metric-lbl">Accuracy:</span>
                    <strong className="metric-val">±{userGpsLocation.accuracy}m</strong>
                  </div>
                  <div className="gps-metric-item">
                    <span className="metric-lbl">Captured:</span>
                    <strong className="metric-val">
                      {new Date(userGpsLocation.timestamp).toLocaleTimeString()}
                    </strong>
                  </div>
                </div>

                <p className="gps-explanation-note">{proximityResult.explanation}</p>
              </div>
            )}

            {/* GPS Fallback / Denied / Error State */}
            {hasGpsError && (
              <div className="gps-fallback-card">
                <div className="fallback-header">
                  <InfoIcon size={16} className="text-amber" />
                  <strong>Manual Selection Active (Location Unverified)</strong>
                </div>
                <p className="fallback-message">{userGpsLocation.errorMessage}</p>
                <div className="fallback-footer">
                  <span className="fallback-badge-note">
                    <Badge variant="neutral" size="sm">LOCATION UNVERIFIED</Badge>
                  </span>
                  <button
                    type="button"
                    className="retry-location-link"
                    onClick={requestUserLocation}
                  >
                    Retry location request &rarr;
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Step 2: Road Segment Selection */}
        <div className="form-group">
          <label className="form-label" htmlFor="road-select">
            <MapPinIcon size={16} />
            <span>Observed Road Segment (Patna Network)</span>
          </label>
          <select
            id="road-select"
            className="form-select"
            value={selectedSegment}
            onChange={(e) => {
              setSelectedSegment(e.target.value);
              setErrorMessage('');
            }}
          >
            {roadOptions.map((road) => (
              <option key={road} value={road}>
                {road}
              </option>
            ))}
          </select>
          <span className="form-input-help">
            Select the corridor where the obstruction or traffic was observed. If GPS permission was declined, manual selection remains active.
          </span>
        </div>

        {/* Step 3: Condition Observation (All 4 categories preserved) */}
        <div className="form-group">
          <label className="form-label">Condition Observation (Choose One)</label>
          <div className="traffic-buttons-grid">
            <TrafficReportButton
              type="CLEAR"
              isSelected={selectedType === 'CLEAR'}
              onClick={() => {
                setSelectedType('CLEAR');
                setErrorMessage('');
              }}
            />
            <TrafficReportButton
              type="TRAFFIC_HIGH"
              isSelected={selectedType === 'TRAFFIC_HIGH'}
              onClick={() => {
                setSelectedType('TRAFFIC_HIGH');
                setErrorMessage('');
              }}
            />
            <TrafficReportButton
              type="ROAD_BLOCKED"
              isSelected={selectedType === 'ROAD_BLOCKED'}
              onClick={() => {
                setSelectedType('ROAD_BLOCKED');
                setErrorMessage('');
              }}
            />
            <TrafficReportButton
              type="CANNOT_ASSESS"
              isSelected={selectedType === 'CANNOT_ASSESS'}
              onClick={() => {
                setSelectedType('CANNOT_ASSESS');
                setErrorMessage('');
              }}
            />
          </div>
        </div>

        {/* Optional Context Field */}
        <div className="form-group">
          <label className="form-label" htmlFor="landmark-input">
            Optional Landmark or Cause Description
          </label>
          <input
            id="landmark-input"
            type="text"
            className="form-input"
            placeholder="e.g. Fallen branch or stalled vehicle near divider"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={140}
          />
        </div>

        {/* Step 4: Report Review & Verification Step Before Submission */}
        <div className="report-review-box">
          <div className="review-box-header">
            <div className="review-header-title-block">
              <ShieldCheckIcon size={17} className="text-primary" />
              <span className="review-box-title">Pre-Submission Report Review</span>
            </div>
            <div className="review-header-badges">
              <Badge
                variant={proximityResult.status === 'LOCATION MATCHED' ? 'clear' : 'warning'}
                size="sm"
              >
                {proximityResult.status}
              </Badge>
              <Badge variant="neutral" size="sm">DEMO DATA</Badge>
            </div>
          </div>

          <div className="review-summary-grid">
            <div className="review-cell">
              <span className="review-cell-label">Observed Road:</span>
              <strong className="review-cell-value">{selectedSegment}</strong>
            </div>

            <div className="review-cell">
              <span className="review-cell-label">Report Category:</span>
              <strong className="review-cell-value">{selectedType}</strong>
            </div>

            <div className="review-cell">
              <span className="review-cell-label">Device Coordinates:</span>
              <span className="review-cell-value">
                {hasGpsSuccess
                  ? `${userGpsLocation.lat.toFixed(5)}° N, ${userGpsLocation.lng.toFixed(5)}° E`
                  : 'Not Captured (Manual Entry)'}
              </span>
            </div>

            <div className="review-cell">
              <span className="review-cell-label">GPS Accuracy:</span>
              <span className="review-cell-value">
                {hasGpsSuccess ? `±${userGpsLocation.accuracy}m` : 'N/A (Unverified)'}
              </span>
            </div>

            <div className="review-cell">
              <span className="review-cell-label">Capture Timestamp:</span>
              <span className="review-cell-value">
                {hasGpsSuccess
                  ? new Date(userGpsLocation.timestamp).toLocaleTimeString()
                  : 'Immediate Submission'}
              </span>
            </div>

            <div className="review-cell">
              <span className="review-cell-label">Preliminary Corroboration:</span>
              <span className="review-cell-value">
                <Badge
                  variant={corroborationStatus === 'CORROBORATED' ? 'warning' : 'neutral'}
                  size="sm"
                >
                  {corroborationStatus}
                </Badge>
                {existingReportsOnRoad.length > 0 && (
                  <span className="corroboration-count">
                    ({existingReportsOnRoad.length} prior observations)
                  </span>
                )}
              </span>
            </div>
          </div>

          <div className="review-truthfulness-disclaimer">
            <InfoIcon size={14} className="text-muted" />
            <span>
              <strong>Note on Verification:</strong> Authoritative location verification is not implemented because backend database and geospatial queries are prohibited in this phase. Unverified reports provide preliminary driver awareness only and cannot alter ambulance routes without independent confirmation.
            </span>
          </div>

          {/* User Confirmation Checkbox */}
          <label className="review-confirmation-row" htmlFor="confirm-review-chk">
            <input
              id="confirm-review-chk"
              type="checkbox"
              className="review-checkbox"
              checked={hasConfirmedReview}
              onChange={(e) => {
                setHasConfirmedReview(e.target.checked);
                setErrorMessage('');
              }}
            />
            <span className="review-checkbox-text">
              I have reviewed this report, confirm the observed road condition, and am reporting safely while not operating a moving vehicle.
            </span>
          </label>
        </div>

        {/* Submission Action */}
        <div className="traffic-form-actions">
          <Button
            type="submit"
            variant="primary"
            size="lg"
            loading={isSubmitting}
            disabled={!hasConfirmedReview || isSubmitting}
            fullWidth
          >
            {hasConfirmedReview
              ? 'CONFIRM & SUBMIT ROAD OBSERVATION'
              : 'REVIEW & CONFIRM ABOVE TO SUBMIT'}
          </Button>
        </div>
      </form>
    </Card>
  );
}

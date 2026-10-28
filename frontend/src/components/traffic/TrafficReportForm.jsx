import React, { useState } from 'react';
import { useSimulation } from '../../context/useSimulation.js';
import { Card } from '../common/Card.jsx';
import { Button } from '../common/Button.jsx';
import { TrafficReportButton } from './TrafficReportButton.jsx';
import { AlertTriangleIcon, MapPinIcon, CheckCircleIcon } from '../common/Icons.jsx';

export function TrafficReportForm() {
  const { submitTrafficReport, userCurrentRoad } = useSimulation();

  const [selectedType, setSelectedType] = useState('TRAFFIC_HIGH');
  const [selectedSegment, setSelectedSegment] = useState(userCurrentRoad);
  const [description, setDescription] = useState('');
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

  const handleSubmit = (e) => {
    e.preventDefault();
    setErrorMessage('');

    if (!selectedSegment) {
      setErrorMessage('Please select a valid road segment in Patna.');
      return;
    }
    if (!selectedType) {
      setErrorMessage('Please select an observed road condition.');
      return;
    }

    setIsSubmitting(true);
    setTimeout(() => {
      submitTrafficReport(selectedType, selectedSegment, description);
      setLastSubmitted({
        type: selectedType,
        road: selectedSegment,
      });
      setDescription('');
      setIsSubmitting(false);
    }, 350);
  };

  return (
    <Card variant="surface" className="traffic-form-card" id="traffic-report-form">
      <div className="traffic-form-header">
        <div>
          <h2 className="traffic-form-title">One-Tap Road Condition Report</h2>
          <p className="traffic-form-desc">
            Citizen observations are evaluated for freshness and independent agreement to guide ambulance routing. Public entry — no login required.
          </p>
        </div>
        <div className="safety-warning-pill">
          <AlertTriangleIcon size={16} />
          <span>Never submit reports while driving. Only report when safely stopped or as a passenger.</span>
        </div>
      </div>

      {lastSubmitted && (
        <div className="report-success-banner" role="status">
          <CheckCircleIcon size={18} className="text-mint" />
          <div className="report-success-text">
            <strong>Observation recorded in demo feed:</strong> {lastSubmitted.type} near {lastSubmitted.road}.
            <span className="report-success-disclaimer">
              Recorded in local simulation feed. While real dispatch integrations are unavailable, this will not dispatch municipal authorities.
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

      <form onSubmit={handleSubmit}>
        {/* Road Segment Selection */}
        <div className="form-group">
          <label className="form-label" htmlFor="road-select">
            <MapPinIcon size={16} />
            <span>Observed Road Segment (Patna)</span>
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
        </div>

        {/* 4 Supported Report Type Buttons */}
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
          <label className="form-label" htmlFor="landmark-input">Optional Landmark or Cause Description</label>
          <input
            id="landmark-input"
            type="text"
            className="form-input"
            placeholder="e.g. Broken down container lorry blocking left 2 lanes"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={140}
          />
        </div>

        <div className="traffic-form-actions">
          <Button
            type="submit"
            variant="primary"
            size="lg"
            loading={isSubmitting}
            fullWidth
          >
            SUBMIT VERIFIED ROAD REPORT
          </Button>
        </div>
      </form>
    </Card>
  );
}

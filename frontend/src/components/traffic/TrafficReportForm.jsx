import React, { useState } from 'react';
import { useSimulation } from '../../context/useSimulation.js';
import { Card } from '../common/Card.jsx';
import { Button } from '../common/Button.jsx';
import { TrafficReportButton } from './TrafficReportButton.jsx';
import { AlertTriangleIcon, MapPinIcon } from '../common/Icons.jsx';

export function TrafficReportForm() {
  const { submitTrafficReport, userCurrentRoad } = useSimulation();

  const [selectedType, setSelectedType] = useState('TRAFFIC_HIGH');
  const [selectedSegment, setSelectedSegment] = useState(userCurrentRoad);
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

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
    if (!selectedType) return;

    setIsSubmitting(true);
    setTimeout(() => {
      submitTrafficReport(selectedType, selectedSegment, description);
      setDescription('');
      setIsSubmitting(false);
    }, 350);
  };

  return (
    <Card variant="ivory" className="traffic-form-card">
      <div className="traffic-form-header">
        <div>
          <h2 className="traffic-form-title">One-Tap Road Condition Report</h2>
          <p className="traffic-form-desc">
            Citizen observations are evaluated for freshness and independent agreement to guide ambulance routing.
          </p>
        </div>
        <div className="safety-warning-pill">
          <AlertTriangleIcon size={16} />
          <span>Never submit reports while driving. Only report when safely stopped or as a passenger.</span>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        {/* Road Segment Selection */}
        <div className="form-group">
          <label className="form-label">
            <MapPinIcon size={16} />
            <span>Observed Road Segment</span>
          </label>
          <select
            className="form-select"
            value={selectedSegment}
            onChange={(e) => setSelectedSegment(e.target.value)}
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
              onClick={() => setSelectedType('CLEAR')}
            />
            <TrafficReportButton
              type="TRAFFIC_HIGH"
              isSelected={selectedType === 'TRAFFIC_HIGH'}
              onClick={() => setSelectedType('TRAFFIC_HIGH')}
            />
            <TrafficReportButton
              type="ROAD_BLOCKED"
              isSelected={selectedType === 'ROAD_BLOCKED'}
              onClick={() => setSelectedType('ROAD_BLOCKED')}
            />
            <TrafficReportButton
              type="CANNOT_ASSESS"
              isSelected={selectedType === 'CANNOT_ASSESS'}
              onClick={() => setSelectedType('CANNOT_ASSESS')}
            />
          </div>
        </div>

        {/* Optional Context Field */}
        <div className="form-group">
          <label className="form-label">Optional Landmark or Cause Description</label>
          <input
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

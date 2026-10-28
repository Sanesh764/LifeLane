import React, { useState } from 'react';
import { useSimulation } from '../../../context/useSimulation.js';
import { Card } from '../../common/Card.jsx';
import { Button } from '../../common/Button.jsx';
import { Badge } from '../../common/Badge.jsx';
import { Modal } from '../../common/Modal.jsx';
import {
  HistoryIcon,
  MapPinIcon,
  RouteIcon,
} from '../../common/Icons.jsx';

export function TripHistory() {
  const { tripHistory, navigateToDriverSubTab } = useSimulation();
  const [selectedTrip, setSelectedTrip] = useState(null);

  const trips = tripHistory || [];

  return (
    <div className="trip-history-page">
      <div className="page-header-row">
        <div>
          <div className="ops-badge-row">
            <Badge variant="neutral" size="sm">PATNA EMERGENCY FLEET</Badge>
            <Badge variant="warning" size="sm">DEMO SESSION LOGS</Badge>
          </div>
          <h1 className="page-title">Vehicle Trip History</h1>
          <p className="page-subtitle">
            Historical demonstration logs for Unit <strong>Patna Emergency 108 — Alpha</strong>. Completed missions persist in local demo memory during your session.
          </p>
        </div>
      </div>

      {trips.length === 0 ? (
        <Card variant="surface" className="empty-state-card">
          <HistoryIcon size={32} className="text-muted" />
          <h3 className="empty-title">No Mission Records Found</h3>
          <p className="empty-desc text-muted">
            Once emergency trips are completed in this browser session, their route, duration, and telemetry will appear here.
          </p>
          <Button
            variant="primary"
            size="md"
            onClick={() => navigateToDriverSubTab('start')}
          >
            Start First Demonstration Trip
          </Button>
        </Card>
      ) : (
        <div className="history-content-container">
          {/* Desktop Table View (>= 768px) */}
          <div className="history-table-wrapper">
            <table className="history-table" aria-label="Trip History Table">
              <thead>
                <tr>
                  <th>Trip ID</th>
                  <th>Destination Base</th>
                  <th>Date & Time</th>
                  <th>Duration</th>
                  <th>Distance</th>
                  <th>Route / Detour</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {trips.map((trip) => (
                  <tr key={trip.id}>
                    <td>
                      <span className="trip-table-id">{trip.id}</span>
                    </td>
                    <td>
                      <div className="table-dest-cell">
                        <MapPinIcon size={14} className="text-red" />
                        <strong>{trip.shortDestination || trip.destination}</strong>
                      </div>
                    </td>
                    <td className="text-muted text-technical">
                      {new Date(trip.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })},{' '}
                      {new Date(trip.startTime).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                    </td>
                    <td>{trip.durationMins} mins</td>
                    <td>{trip.distanceKm} km</td>
                    <td>
                      <span className="route-tag">
                        {trip.detourAccepted ? 'Atal Path Detour' : 'Direct Arterial'}
                      </span>
                    </td>
                    <td>
                      <Badge variant="clear" size="sm">COMPLETED</Badge>
                    </td>
                    <td>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedTrip(trip)}
                      >
                        Inspect
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Responsive Cards (< 768px) */}
          <div className="history-cards-list">
            {trips.map((trip) => (
              <Card key={trip.id} variant="surface" className="history-mobile-card">
                <div className="mobile-card-top">
                  <span className="trip-table-id">{trip.id}</span>
                  <Badge variant="clear" size="sm">COMPLETED</Badge>
                </div>
                <div className="mobile-card-dest">
                  <MapPinIcon size={16} className="text-red" />
                  <strong>{trip.shortDestination || trip.destination}</strong>
                </div>
                <div className="mobile-card-stats-grid">
                  <div className="stat-cell">
                    <span className="stat-cell-label">Duration:</span>
                    <span className="stat-cell-val">{trip.durationMins} mins</span>
                  </div>
                  <div className="stat-cell">
                    <span className="stat-cell-label">Distance:</span>
                    <span className="stat-cell-val">{trip.distanceKm} km</span>
                  </div>
                  <div className="stat-cell">
                    <span className="stat-cell-label">Corridor:</span>
                    <span className="stat-cell-val">
                      {trip.detourAccepted ? 'Detour Taken' : 'Direct'}
                    </span>
                  </div>
                  <div className="stat-cell">
                    <span className="stat-cell-label">Timestamp:</span>
                    <span className="stat-cell-val">
                      {new Date(trip.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
                <div className="mobile-card-footer">
                  <Button
                    variant="outline"
                    size="sm"
                    fullWidth
                    onClick={() => setSelectedTrip(trip)}
                  >
                    Inspect Mission Record
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Inspect Trip Record Modal */}
      {selectedTrip && (
        <Modal
          isOpen={Boolean(selectedTrip)}
          onClose={() => setSelectedTrip(null)}
          title={`Mission Record: ${selectedTrip.id}`}
        >
          <div className="trip-modal-content">
            <div className="modal-meta-strip">
              <Badge variant="clear" size="sm">STATUS: {selectedTrip.status}</Badge>
              <Badge variant="neutral" size="sm">{selectedTrip.vehicleNumber}</Badge>
              <span className="text-muted text-technical">{selectedTrip.id}</span>
            </div>

            <div className="modal-dest-block">
              <div className="modal-dest-title">{selectedTrip.destination}</div>
              <p className="modal-outcome text-muted">{selectedTrip.outcome}</p>
            </div>

            <div className="modal-metrics-grid">
              <div className="modal-metric-card">
                <span className="metric-card-label">Transit Duration</span>
                <span className="metric-card-val">{selectedTrip.durationMins} minutes</span>
              </div>
              <div className="modal-metric-card">
                <span className="metric-card-label">Corridor Distance</span>
                <span className="metric-card-val">{selectedTrip.distanceKm} km</span>
              </div>
              <div className="modal-metric-card">
                <span className="metric-card-label">Corridor Broadcasts</span>
                <span className="metric-card-val">{selectedTrip.alertsDelivered} devices</span>
              </div>
              <div className="modal-metric-card">
                <span className="metric-card-label">Detour Evaluation</span>
                <span className="metric-card-val text-mint">
                  {selectedTrip.detourAccepted ? 'Detour Confirmed' : 'Direct Route'}
                </span>
              </div>
            </div>

            <div className="modal-route-box">
              <RouteIcon size={16} className="text-primary" />
              <span><strong>Path Taken:</strong> {selectedTrip.routeTaken}</span>
            </div>

            <div className="modal-footer-actions">
              <Button variant="primary" onClick={() => setSelectedTrip(null)}>
                Close Record
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

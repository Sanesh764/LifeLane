import React, { useState } from 'react';
import { useSimulation } from '../../context/useSimulation.js';
import { Card } from '../common/Card.jsx';
import { Button } from '../common/Button.jsx';
import { Badge } from '../common/Badge.jsx';
import { AlertTriangleIcon, CheckCircleIcon, ArrowRightIcon } from '../common/Icons.jsx';
import { Modal } from '../common/Modal.jsx';

/**
 * RouteComparisonPanel: Alternative Detour Recommendation & Review Card
 *
 * Requirements:
 * - Appears prominently when an alternative route recommendation exists.
 * - Explicit driver review controls (Accept / Reject).
 * - Never reroutes automatically without manual driver approval.
 * - Shows a small, useful status state when current route is optimal.
 */
export function RouteComparisonPanel() {
  const {
    currentRoute,
    activeRecommendation,
    recommendationDecision,
    acceptRecommendation,
    rejectRecommendation,
    tripStatus,
  } = useSimulation();

  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const isTripActive = tripStatus === 'ACTIVE';

  if (!isTripActive) {
    return null;
  }

  // If already accepted, display a compact status banner
  if (recommendationDecision === 'ACCEPTED' && !activeRecommendation) {
    return (
      <div className="route-accepted-pill" role="status">
        <CheckCircleIcon size={16} className="text-mint" />
        <span className="route-accepted-label">
          <strong>Detour Active:</strong> Rerouted via Atal Path & JP Ganga Path Expressway.
        </span>
        <Badge variant="clear" size="sm">CONFIRMED</Badge>
      </div>
    );
  }

  // If no recommendation is active, show a compact, useful optimal status notice
  if (!activeRecommendation) {
    return (
      <div className="route-optimal-pill">
        <CheckCircleIcon size={14} className="text-mint" />
        <span className="route-optimal-text">
          Current arterial corridor optimal · Continuous crowd monitoring active
        </span>
        <Badge variant="neutral" size="sm">OPTIMAL</Badge>
      </div>
    );
  }

  // Active alternative route recommendation awaiting driver decision!
  return (
    <Card variant="graphite" className="route-decision-card">
      <div className="decision-card-header">
        <div className="decision-header-left">
          <div className="decision-alert-icon">
            <AlertTriangleIcon size={18} className="text-amber" />
          </div>
          <div>
            <div className="decision-tag">DETOUR RECOMMENDATION</div>
            <h4 className="decision-title">Alternative Route Available</h4>
          </div>
        </div>
        <Badge variant="warning" pulse size="sm">
          REVIEW REQUIRED
        </Badge>
      </div>

      {/* Cause of recommendation */}
      <div className="decision-cause-box">
        <div className="cause-icon">
          <AlertTriangleIcon size={14} className="text-red" />
        </div>
        <div className="cause-text">
          {activeRecommendation.recommendationReason ||
            'Blockage reported at Dak Bungalow — Fraser Road. Atal Path riverfront expressway bypass available.'}
        </div>
      </div>

      {/* Route Comparison Stats */}
      <div className="decision-routes-grid">
        {/* Current Path */}
        <div className="decision-route-box is-compromised">
          <div className="route-box-tag">CURRENT PATH</div>
          <div className="route-box-name">{currentRoute.name}</div>
          <div className="route-box-eta">
            <span className="eta-number">{currentRoute.currentEtaMins}</span>
            <span className="eta-unit">MIN (DEMO)</span>
          </div>
          <div className="route-box-status text-red">Fraser Road blocked</div>
        </div>

        {/* Proposed Detour */}
        <div className="decision-route-box is-candidate">
          <div className="route-box-tag text-mint">PROPOSED DETOUR</div>
          <div className="route-box-name">{activeRecommendation.name}</div>
          <div className="route-box-eta text-mint">
            <span className="eta-number">{activeRecommendation.currentEtaMins}</span>
            <span className="eta-unit">MIN (DEMO)</span>
          </div>
          <div className="route-box-status text-mint">
            EST. SAVING: ~{activeRecommendation.timeSavingMins} MIN
          </div>
        </div>
      </div>

      {/* Driver Confirmation Actions */}
      <div className="decision-actions-row">
        <Button
          variant="outline"
          size="sm"
          onClick={rejectRecommendation}
          className="btn-dismiss-detour"
        >
          Dismiss (Keep Route)
        </Button>
        <Button
          variant="primary"
          size="sm"
          icon={ArrowRightIcon}
          iconPosition="right"
          onClick={() => setConfirmModalOpen(true)}
          className="btn-accept-detour"
        >
          Accept Detour
        </Button>
      </div>

      <div className="decision-safety-note">
        * Rerouting requires manual driver confirmation. Zero automatic changes.
      </div>

      {/* Confirmation Modal */}
      <Modal
        isOpen={confirmModalOpen}
        onClose={() => setConfirmModalOpen(false)}
        title="Confirm Emergency Route Alteration"
        confirmText="Confirm Route Change"
        cancelText="Cancel"
        onConfirm={() => {
          acceptRecommendation();
          setConfirmModalOpen(false);
        }}
      >
        <p>
          You are confirming a route alteration to <strong>{activeRecommendation.name}</strong>.
        </p>
        <p style={{ marginTop: '8px', fontSize: '0.85rem', color: 'var(--color-ink-600)' }}>
          Vehicle navigation will immediately update to the Atal Path riverfront corridor, and road users along the new path will be targeted for clearance notifications.
        </p>
      </Modal>
    </Card>
  );
}

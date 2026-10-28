import React from 'react';
import { CheckCircleIcon, AlertTriangleIcon, OctagonAlertIcon, HelpCircleIcon } from '../common/Icons.jsx';

export function TrafficReportButton({ type, isSelected, onClick, disabled = false }) {
  const configs = {
    CLEAR: {
      label: 'Clear & Flowing',
      desc: 'Traffic moving normally without bottleneck',
      icon: CheckCircleIcon,
      className: 'traffic-btn--clear',
    },
    TRAFFIC_HIGH: {
      label: 'Heavy Traffic',
      desc: 'Slow crawl or heavy stop-and-go congestion',
      icon: AlertTriangleIcon,
      className: 'traffic-btn--warning',
    },
    ROAD_BLOCKED: {
      label: 'Road Blocked',
      desc: 'Accident, fallen tree, or total lane blockage',
      icon: OctagonAlertIcon,
      className: 'traffic-btn--critical',
    },
    CANNOT_ASSESS: {
      label: 'Cannot Assess',
      desc: 'Low visibility or condition uncertain',
      icon: HelpCircleIcon,
      className: 'traffic-btn--neutral',
    },
  };

  const config = configs[type] || configs.CANNOT_ASSESS;
  const Icon = config.icon;

  return (
    <button
      type="button"
      className={`traffic-report-btn ${config.className} ${isSelected ? 'is-selected' : ''}`}
      onClick={onClick}
      disabled={disabled}
    >
      <div className="traffic-btn-icon">
        <Icon size={24} />
      </div>
      <div className="traffic-btn-text">
        <div className="traffic-btn-title">{config.label}</div>
        <div className="traffic-btn-sub">{config.desc}</div>
      </div>
      <div className="traffic-btn-badge">
        <code>{type}</code>
      </div>
    </button>
  );
}

import React, { useState } from 'react';
import { useSimulation } from '../../../context/useSimulation.js';
import { Card } from '../../common/Card.jsx';
import { Button } from '../../common/Button.jsx';
import { Badge } from '../../common/Badge.jsx';
import {
  BellIcon,
  BellOffIcon,
  CheckCircle2Icon,
  AlertTriangleIcon,
  RadioIcon,
} from '../../common/Icons.jsx';

export function DriverNotifications() {
  const { addToast } = useSimulation();

  const [isSupported] = useState(() => typeof window !== 'undefined' && 'Notification' in window);
  const [browserPermission, setBrowserPermission] = useState(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      return Notification.permission;
    }
    return 'default';
  });
  const [alertsEnabled, setAlertsEnabled] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);

  const handleRequestPermission = async () => {
    if (!isSupported) {
      addToast('Unsupported Browser', 'Web Notifications API is not supported in this browser environment.', 'warning');
      return;
    }

    try {
      const permission = await Notification.requestPermission();
      setBrowserPermission(permission);
      if (permission === 'granted') {
        addToast('Notifications Enabled', 'Browser notifications permission granted for AmbuRoute alerts.', 'success');
      } else if (permission === 'denied') {
        addToast('Notifications Blocked', 'Permission was denied. You can update this in your browser site settings.', 'warning');
      }
    } catch {
      addToast('Permission Request Failed', 'Could not query notification permission.', 'neutral');
    }
  };

  const demoAlertLog = [
    {
      id: 'notif-1',
      title: 'Corridor Yield Broadcast Dispatched',
      message: 'Approaching Bailey Road intersection. 500m target alert broadcast to 34 subscribed road users.',
      time: '3 minutes ago',
      type: 'BROADCAST',
    },
    {
      id: 'notif-2',
      title: 'Road Blockage Observation Detected',
      message: 'Dak Bungalow Crossing obstruction received. Detour recommendation computed via Atal Path.',
      time: '7 minutes ago',
      type: 'INTELLIGENCE',
    },
    {
      id: 'notif-3',
      title: 'Emergency Trip Initiated',
      message: 'Patna Emergency 108 — Alpha en route to PMCH Trauma Base.',
      time: '12 minutes ago',
      type: 'DISPATCH',
    },
  ];

  return (
    <div className="driver-notifications-page">
      <div className="page-header-row">
        <div>
          <div className="ops-badge-row">
            <Badge variant="neutral" size="sm">SYSTEM SERVICES</Badge>
            <Badge variant="warning" size="sm">BROWSER INTEGRATION</Badge>
          </div>
          <h1 className="page-title">Notifications & Corridor Broadcasts</h1>
          <p className="page-subtitle">
            Configure system alert preferences and review device push permissions. Real browser notification APIs are queried directly.
          </p>
        </div>
      </div>

      <div className="notifications-layout-grid">
        {/* Left Column: Device & Permission Settings */}
        <div className="notif-controls-col">
          {/* Permission Status Card */}
          <Card variant="surface" className="notif-status-card">
            <div className="notif-card-header">
              <div className="notif-icon-wrap">
                {browserPermission === 'granted' ? (
                  <BellIcon size={24} className="text-mint" />
                ) : (
                  <BellOffIcon size={24} className="text-amber" />
                )}
              </div>
              <div>
                <h2 className="notif-card-title">Browser Notification Permission</h2>
                <div className="notif-permission-badge-row">
                  <Badge
                    variant={
                      browserPermission === 'granted'
                        ? 'clear'
                        : browserPermission === 'denied'
                        ? 'critical'
                        : 'warning'
                    }
                    size="sm"
                  >
                    STATUS: {browserPermission.toUpperCase()}
                  </Badge>
                  {!isSupported && (
                    <Badge variant="critical" size="sm">API UNSUPPORTED</Badge>
                  )}
                </div>
              </div>
            </div>

            <div className="notif-card-body">
              {browserPermission === 'granted' ? (
                <div className="permission-state-box permission-state-box--granted">
                  <CheckCircle2Icon size={18} className="text-mint" />
                  <span>Your browser has authorized AmbuRoute to display timely operational notifications.</span>
                </div>
              ) : browserPermission === 'denied' ? (
                <div className="permission-state-box permission-state-box--denied">
                  <AlertTriangleIcon size={18} className="text-red" />
                  <span>Browser notifications are blocked. To receive alerts, allow notifications in your browser's site settings.</span>
                </div>
              ) : (
                <div className="permission-state-box permission-state-box--prompt">
                  <AlertTriangleIcon size={18} className="text-amber" />
                  <span>Notifications are not yet enabled for this domain. Request permission to enable instant corridor alerts.</span>
                </div>
              )}

              {browserPermission !== 'granted' && isSupported && (
                <Button
                  variant="primary"
                  size="md"
                  icon={BellIcon}
                  onClick={handleRequestPermission}
                  className="btn-enable-notif"
                >
                  Request Browser Permission
                </Button>
              )}
            </div>
          </Card>

          {/* Preferences Card */}
          <Card variant="surface" className="notif-prefs-card">
            <h3 className="prefs-title">Alert Delivery Preferences</h3>
            <div className="prefs-list">
              <div className="pref-row">
                <div className="pref-info">
                  <span className="pref-name">Corridor Yield Alerts</span>
                  <span className="pref-sub text-muted">Notify road users in 500m vehicle approach zone</span>
                </div>
                <button
                  type="button"
                  className={`toggle-switch ${alertsEnabled ? 'is-checked' : ''}`}
                  onClick={() => setAlertsEnabled(!alertsEnabled)}
                  aria-label="Toggle corridor alerts"
                >
                  <span className="toggle-handle" />
                </button>
              </div>

              <div className="pref-row">
                <div className="pref-info">
                  <span className="pref-name">Audible Emergency Chimes</span>
                  <span className="pref-sub text-muted">Play alert beacon tone during active emergency</span>
                </div>
                <button
                  type="button"
                  className={`toggle-switch ${soundEnabled ? 'is-checked' : ''}`}
                  onClick={() => setSoundEnabled(!soundEnabled)}
                  aria-label="Toggle audible alert sound"
                >
                  <span className="toggle-handle" />
                </button>
              </div>

              <div className="pref-row">
                <div className="pref-info">
                  <span className="pref-name">Notification Corridor Envelope</span>
                  <span className="pref-sub text-muted">Target geographic radius for upcoming road users</span>
                </div>
                <Badge variant="clear" size="sm">500 METRES (FIXED)</Badge>
              </div>
            </div>
          </Card>

          {/* Architecture Transparency Note */}
          <div className="notif-disclaimer-card">
            <RadioIcon size={18} className="text-primary" />
            <div className="disclaimer-text">
              <strong>Push Delivery Architecture:</strong> Standard Web Push VAPID keys, service worker push subscriptions, 30s location heartbeats, and proximity targeting are fully implemented. When an emergency trip starts, the backend push engine dispatches urgent notifications to all consented devices within 2–5 km.
            </div>
          </div>
        </div>

        {/* Right Column: Simulated Alert Stream */}
        <div className="notif-logs-col">
          <Card variant="surface" className="notif-logs-card">
            <div className="logs-card-header">
              <h2 className="logs-title">Simulated Alert Dispatch Stream</h2>
              <Badge variant="neutral" size="sm">LOCAL DEMO LOG</Badge>
            </div>
            <div className="logs-card-list">
              {demoAlertLog.map((log) => (
                <div key={log.id} className="log-item">
                  <div className="log-item-top">
                    <Badge variant="neutral" size="sm">{log.type}</Badge>
                    <span className="log-time text-muted">{log.time}</span>
                  </div>
                  <div className="log-item-title">{log.title}</div>
                  <p className="log-item-msg text-muted">{log.message}</p>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

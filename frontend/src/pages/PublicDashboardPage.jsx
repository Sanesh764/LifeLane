import React, { useState, useEffect, useCallback } from 'react';
import { useSimulation } from '../context/useSimulation.js';
import { pushService } from '../services/pushService.js';
import { apiClient } from '../services/api.js';
import { authService } from '../services/authService.js';
import { Card } from '../components/common/Card.jsx';
import { Button } from '../components/common/Button.jsx';
import { Badge } from '../components/common/Badge.jsx';
import { SimulationMap } from '../components/map/SimulationMap.jsx';
import {
  BellIcon,
  SirenIcon,
  CheckCircleIcon,
  AlertTriangleIcon,
  ShieldCheckIcon,
  RadioIcon,
  RefreshCwIcon,
  SendIcon,
} from '../components/common/Icons.jsx';

/**
 * PublicDashboardPage: Citizen Transit Intelligence & Emergency Alert Hub
 *
 * Designed for ordinary public citizens (PUBLIC_USER / ROAD_USER).
 * Fully integrated with real backend authentication, Web Push subscriptions,
 * traffic reporting, and live emergency mission alerts.
 */
export function PublicDashboardPage() {
  const {
    currentUser,
    tripStatus,
    activeTrip,
    trafficReports,
    submitTrafficReport,
    userCurrentRoad,
    userGpsLocation,
    addToast,
    setActiveTab,
  } = useSimulation();

  // Publicly polled active emergency mission state
  const [publicMission, setPublicMission] = useState(null);
  const isMissionActive = Boolean(publicMission || tripStatus === 'ACTIVE');
  const currentMission = publicMission || activeTrip;

  // Poll real backend for active emergency mission every 3 seconds
  useEffect(() => {
    let isMounted = true;
    const fetchActiveMission = async () => {
      try {
        const res = await apiClient.getPublicActiveTrip();
        if (isMounted && res.success && res.data) {
          if (res.data.active && res.data.trip) {
            setPublicMission(res.data.trip);
          } else {
            setPublicMission(null);
          }
        }
      } catch (err) {
        console.warn('[PublicDashboard] Failed to check active mission:', err);
      }
    };

    fetchActiveMission();
    const interval = setInterval(fetchActiveMission, 3000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  // Notification Subscription State
  const [browserPermission, setBrowserPermission] = useState(() => pushService.getPermission());
  const [subStatus, setSubStatus] = useState('CHECKING'); // 'ACTIVE' | 'DISABLED' | 'UNSUBSCRIBED' | 'CHECKING'
  const [userSubscriptions, setUserSubscriptions] = useState([]);
  const [isSubscribing, setIsSubscribing] = useState(false);
  const [isTestingPush, setIsTestingPush] = useState(false);

  // Road Report Form State
  const [reportType, setReportType] = useState('TRAFFIC_HIGH');
  const [roadSegment, setRoadSegment] = useState(userCurrentRoad || 'Boring Road, Patna');
  const [description, setDescription] = useState('');
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);

  // Sync user's subscriptions from real backend API
  const refreshSubscriptions = useCallback(async () => {
    const token = authService.getToken();
    if (!token) {
      setSubStatus('UNSUBSCRIBED');
      return;
    }

    try {
      const res = await apiClient.getMySubscriptions(token);
      if (res.success && res.data) {
        setUserSubscriptions(res.data.subscriptions || []);
        if (res.data.hasActive) {
          setSubStatus('ACTIVE');
        } else if (res.data.subscriptions?.length > 0) {
          setSubStatus('DISABLED');
        } else {
          setSubStatus('UNSUBSCRIBED');
        }
      }
    } catch (err) {
      console.warn('[PublicDashboard] Failed to fetch subscriptions:', err);
    }
  }, []);

  useEffect(() => {
    setBrowserPermission(pushService.getPermission());
    refreshSubscriptions();
  }, [refreshSubscriptions]);

  // Update road segment input when user location changes
  useEffect(() => {
    if (userCurrentRoad) {
      setRoadSegment(userCurrentRoad);
    }
  }, [userCurrentRoad]);

  // Handle Enable Notifications (Subscribe to Web Push)
  const handleEnableNotifications = async () => {
    setIsSubscribing(true);
    try {
      const result = await pushService.subscribeToAlerts();
      setBrowserPermission(pushService.getPermission());

      if (result.success) {
        setSubStatus('ACTIVE');
        addToast(
          'Emergency Alerts Enabled',
          'This browser will now receive high-priority desktop push notifications when an ambulance dispatches.',
          'success'
        );
        await refreshSubscriptions();
      } else {
        const errorMsg = result.error?.message || 'Failed to enable notifications.';
        addToast('Permission Notice', errorMsg, 'warning');
      }
    } catch (err) {
      addToast('Error', err.message || 'Notification subscription failed', 'critical');
    } finally {
      setIsSubscribing(false);
    }
  };

  // Handle Disable Notifications
  const handleDisableNotifications = async () => {
    setIsSubscribing(true);
    try {
      await pushService.disableAlerts();
      setSubStatus('DISABLED');
      addToast('Alerts Paused', 'Push notifications have been disabled for this device.', 'info');
      await refreshSubscriptions();
    } catch (err) {
      addToast('Error', 'Failed to disable notifications', 'critical');
    } finally {
      setIsSubscribing(false);
    }
  };

  // Handle Instant Test Notification
  const handleSendTestNotification = async () => {
    const endpointHash = pushService.getStoredEndpointHash();
    if (!endpointHash) {
      addToast('Enable Alerts First', 'Please subscribe to notifications before sending a test alert.', 'warning');
      return;
    }

    setIsTestingPush(true);
    try {
      const res = await apiClient.sendTestNotification({ endpointHash });
      if (res.success) {
        addToast('Test Push Dispatched', 'Check your OS desktop/notification drawer for the incoming alert.', 'success');
      } else {
        addToast('Test Failed', res.error?.message || 'Could not dispatch test push.', 'critical');
      }
    } catch {
      addToast('Error', 'Network error sending test push.', 'critical');
    } finally {
      setIsTestingPush(false);
    }
  };

  // Handle Submit Road Report
  const handleSubmitReport = async (e) => {
    e.preventDefault();
    if (!roadSegment.trim()) {
      addToast('Required Field', 'Please specify the road segment or landmark.', 'warning');
      return;
    }

    setIsSubmittingReport(true);
    try {
      const meta = userGpsLocation?.lat ? { coordinates: [userGpsLocation.lng, userGpsLocation.lat] } : null;
      await submitTrafficReport(reportType, roadSegment.trim(), description.trim() || undefined, meta);
      setDescription('');
      addToast('Report Submitted', 'Your road condition report has been recorded and verified by the network.', 'success');
    } catch (err) {
      addToast('Report Error', err.message || 'Failed to submit report.', 'critical');
    } finally {
      setIsSubmittingReport(false);
    }
  };

  return (
    <div className="public-dashboard-page">
      {/* 1. Welcome Section & Identity Banner */}
      <div className="public-header-row">
        <div className="public-header-left">
          <div className="public-tag-row">
            <Badge variant="clear" size="sm">
              <ShieldCheckIcon size={12} className="text-mint" />
              <span>CITIZEN NETWORK</span>
            </Badge>
            <Badge variant={subStatus === 'ACTIVE' ? 'clear' : 'warning'} size="sm">
              {subStatus === 'ACTIVE' ? '🔔 PUSH ALERTS ACTIVE' : '🔕 NOTIFICATIONS OFF'}
            </Badge>
            <Badge variant={isMissionActive ? 'critical' : 'neutral'} size="sm">
              {isMissionActive ? '🚨 EMERGENCY ACTIVE' : 'FLEET STANDBY'}
            </Badge>
          </div>
          <h1 className="page-main-heading">
            Welcome, {currentUser?.name || 'Citizen Responder'}
          </h1>
          <p className="page-subheading">
            Connected to AmbuRoute Public Emergency Transit Network. Monitor live ambulance corridors and submit real-time road conditions.
          </p>
        </div>

        <div className="public-stat-chips">
          <div className="stat-chip">
            <span className="stat-chip__label">REGISTERED DEVICES</span>
            <span className="stat-chip__value">{userSubscriptions.length || (subStatus === 'ACTIVE' ? 1 : 0)}</span>
          </div>
          <div className="stat-chip">
            <span className="stat-chip__label">COMMUNITY REPORTS</span>
            <span className="stat-chip__value">{trafficReports.length}</span>
          </div>
        </div>
      </div>

      {/* 2. Top Grid: Emergency Mission Alert & Notification Subscription Management */}
      <div className="public-top-grid">
        {/* Active Emergency Corridor Alert */}
        <Card variant={isMissionActive ? 'critical' : 'surface'} className="public-alert-card">
          <div className="public-card-head">
            <div className={`public-alert-icon-wrap ${isMissionActive ? 'pulse-alert' : ''}`}>
              <SirenIcon size={24} className={isMissionActive ? 'text-red' : 'text-primary'} />
            </div>
            <div>
              <div className="badge-wrap">
                <Badge variant={isMissionActive ? 'critical' : 'neutral'} size="sm">
                  {isMissionActive ? 'LIVE EMERGENCY MISSION IN PROGRESS' : 'STANDBY MODE'}
                </Badge>
              </div>
              <h2 className="public-card-title">
                {isMissionActive ? 'Ambulance Approaching Corridor' : 'No Active Emergency Missions'}
              </h2>
            </div>
          </div>

          {isMissionActive ? (
            <div className="public-active-mission-body">
              <div className="mission-alert-callout">
                <p className="give-way-headline">🚨 PLEASE CLEAR THE CORRIDOR · YIELD TO LEFT</p>
                <p className="give-way-subtext">
                  An authorized emergency vehicle is en route. Slow down, pull safely toward the left shoulder, and maintain an open passage.
                </p>
              </div>
              <div className="mission-details-grid">
                <div className="mission-detail-item">
                  <span className="detail-label">AMBULANCE CALLSIGN</span>
                  <span className="detail-value text-red">
                    {currentMission?.ambulanceCallsign || currentMission?.assignedUnit?.callSign || 'Patna Emergency Unit 108'}
                  </span>
                </div>
                <div className="mission-detail-item">
                  <span className="detail-label">DESTINATION FACILITY</span>
                  <span className="detail-value">
                    {currentMission?.destinationHospital || currentMission?.destination?.label || 'Emergency Hospital'}
                  </span>
                </div>
                <div className="mission-detail-item">
                  <span className="detail-label">TRANSIT STATUS</span>
                  <span className="detail-value text-mint">HIGH PRIORITY DISPATCH</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="public-idle-mission-body">
              <p className="text-secondary">
                The community emergency corridor is currently clear. When an ambulance starts an emergency run, an instant Web Push notification will be delivered to your device.
              </p>
            </div>
          )}
        </Card>

        {/* Web Push Subscription Management Card */}
        <Card variant="surface" className="public-sub-card">
          <div className="public-card-head">
            <div className="public-sub-icon-wrap">
              <BellIcon size={22} className="text-primary" />
            </div>
            <div>
              <div className="badge-wrap">
                <Badge variant={subStatus === 'ACTIVE' ? 'clear' : 'warning'} size="sm">
                  {subStatus === 'ACTIVE' ? 'DEVICE CONNECTED' : 'NOT SUBSCRIBED'}
                </Badge>
              </div>
              <h2 className="public-card-title">Global Web Push Notifications</h2>
            </div>
          </div>

          <div className="sub-management-body">
            <p className="sub-description">
              Receive native operating-system alerts the moment an ambulance driver initiates an emergency mission—even when AmbuRoute is running in the background.
            </p>

            <div className="sub-status-box">
              <div className="status-row">
                <span className="status-label">Browser Permission:</span>
                <span className={`status-pill ${browserPermission === 'granted' ? 'pill-success' : 'pill-warning'}`}>
                  {browserPermission.toUpperCase()}
                </span>
              </div>
              <div className="status-row">
                <span className="status-label">Backend Status:</span>
                <span className={`status-pill ${subStatus === 'ACTIVE' ? 'pill-success' : 'pill-muted'}`}>
                  {subStatus}
                </span>
              </div>
            </div>

            <div className="sub-actions-row">
              {subStatus !== 'ACTIVE' ? (
                <Button
                  variant="primary"
                  size="md"
                  icon={BellIcon}
                  onClick={handleEnableNotifications}
                  disabled={isSubscribing}
                >
                  {isSubscribing ? 'Enabling...' : 'Enable Emergency Push Alerts'}
                </Button>
              ) : (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDisableNotifications}
                    disabled={isSubscribing}
                  >
                    Pause Alerts
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    icon={RadioIcon}
                    onClick={handleSendTestNotification}
                    disabled={isTestingPush}
                  >
                    {isTestingPush ? 'Dispatching...' : 'Send Test Alert'}
                  </Button>
                </>
              )}
            </div>
          </div>
        </Card>
      </div>

      {/* 3. Mid Grid: Submit Road Report & Live Simulation Map */}
      <div className="public-middle-grid">
        {/* Road Report Submission Form */}
        <Card variant="surface" className="public-report-card">
          <div className="public-card-head">
            <div className="public-report-icon-wrap">
              <AlertTriangleIcon size={22} className="text-primary" />
            </div>
            <div>
              <div className="badge-wrap">
                <Badge variant="clear" size="sm">COMMUNITY SENSORS</Badge>
              </div>
              <h2 className="public-card-title">Submit Road Condition Report</h2>
              <p className="text-secondary text-sm">
                Help drivers navigate around obstacles by submitting verified road condition observations.
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmitReport} className="public-report-form" noValidate>
            <div className="form-group">
              <label className="form-label" htmlFor="report-type-select">
                Incident Category
              </label>
              <select
                id="report-type-select"
                className="form-select"
                value={reportType}
                onChange={(e) => setReportType(e.target.value)}
                disabled={isSubmittingReport}
              >
                <option value="TRAFFIC_HIGH">Heavy Traffic / Congestion</option>
                <option value="ROAD_BLOCKED">Complete Road Blockage</option>
                <option value="ACCIDENT">Traffic Collision / Accident</option>
                <option value="HAZARD">Hazard / Construction</option>
                <option value="CLEAR">Corridor All Clear</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="report-road-segment">
                Road Segment or Landmark
              </label>
              <input
                id="report-road-segment"
                type="text"
                className="form-input"
                placeholder="e.g. Boring Road, Bailey Road, Patna"
                value={roadSegment}
                onChange={(e) => setRoadSegment(e.target.value)}
                disabled={isSubmittingReport}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="report-description">
                Observation Details (Optional)
              </label>
              <textarea
                id="report-description"
                className="form-textarea"
                rows={3}
                placeholder="Describe current road conditions, lane blockages, or traffic flow speed..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={isSubmittingReport}
              />
            </div>

            <div className="form-actions-row">
              <Button
                type="submit"
                variant="primary"
                size="md"
                icon={SendIcon}
                disabled={isSubmittingReport}
              >
                {isSubmittingReport ? 'Submitting...' : 'Transmit Report'}
              </Button>
            </div>
          </form>
        </Card>

        {/* Live Corridor Map */}
        <Card variant="surface" className="public-map-card">
          <div className="public-card-head">
            <div>
              <div className="badge-wrap">
                <Badge variant="clear" size="sm">LIVE GIS RADAR</Badge>
              </div>
              <h2 className="public-card-title">Live Corridor Situational Map</h2>
            </div>
          </div>
          <div className="public-map-wrapper">
            <SimulationMap />
          </div>
        </Card>
      </div>

      {/* 4. Bottom Section: Recent Community Reports Feed & Device History */}
      <div className="public-bottom-grid">
        {/* Recent Traffic Reports Feed */}
        <Card variant="surface" className="public-feed-card">
          <div className="public-card-head">
            <div>
              <div className="badge-wrap">
                <Badge variant="neutral" size="sm">REAL-TIME INTELLIGENCE</Badge>
              </div>
              <h2 className="public-card-title">Recent Community Road Reports</h2>
            </div>
            <button
              type="button"
              className="refresh-btn"
              onClick={refreshSubscriptions}
              title="Refresh feed"
            >
              <RefreshCwIcon size={16} />
            </button>
          </div>

          <div className="reports-list">
            {trafficReports.slice(0, 5).map((report) => (
              <div key={report.id || report._id} className="report-list-item">
                <div className="report-badge-col">
                  <Badge
                    variant={
                      report.type === 'ROAD_BLOCKED' || report.type === 'ACCIDENT'
                        ? 'critical'
                        : report.type === 'TRAFFIC_HIGH'
                        ? 'warning'
                        : 'clear'
                    }
                    size="sm"
                  >
                    {report.type?.replace(/_/g, ' ') || 'INCIDENT'}
                  </Badge>
                </div>
                <div className="report-content-col">
                  <div className="report-road-title">{report.roadSegment}</div>
                  <div className="report-desc-text">
                    {report.description || 'Verified road condition report submitted by citizen sensor.'}
                  </div>
                </div>
                <div className="report-time-col">
                  <span className="text-muted text-xs">
                    {report.timestamp ? new Date(report.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Recent'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Subscribed Devices & History */}
        <Card variant="surface" className="public-history-card">
          <div className="public-card-head">
            <div>
              <div className="badge-wrap">
                <Badge variant="clear" size="sm">CONNECTED HARDWARE</Badge>
              </div>
              <h2 className="public-card-title">Your Notification Devices</h2>
            </div>
          </div>

          <div className="devices-list">
            {userSubscriptions.length > 0 ? (
              userSubscriptions.map((sub, idx) => (
                <div key={sub.id || idx} className="device-item">
                  <div className="device-icon-wrap">
                    <RadioIcon size={18} className="text-primary" />
                  </div>
                  <div className="device-info">
                    <div className="device-name">
                      Device #{idx + 1} ({sub.deviceType || 'desktop'})
                    </div>
                    <div className="device-hash text-xs text-muted">
                      Hash: {sub.endpointHash ? sub.endpointHash.substring(0, 16) + '...' : 'Browser Endpoint'}
                    </div>
                  </div>
                  <Badge variant={sub.status === 'ACTIVE' ? 'clear' : 'neutral'} size="sm">
                    {sub.status || 'ACTIVE'}
                  </Badge>
                </div>
              ))
            ) : (
              <div className="no-devices-box">
                <p className="text-secondary text-sm">
                  {subStatus === 'ACTIVE'
                    ? 'Active browser subscription connected locally.'
                    : 'No push devices currently registered. Click "Enable Emergency Push Alerts" above to connect this device.'}
                </p>
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

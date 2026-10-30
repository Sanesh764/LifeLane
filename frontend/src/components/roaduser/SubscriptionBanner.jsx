import React, { useState, useEffect, useCallback } from 'react';
import { useSimulation } from '../../context/useSimulation.js';
import { pushService } from '../../services/pushService.js';
import { apiClient } from '../../services/api.js';
import { Card } from '../common/Card.jsx';
import { Badge } from '../common/Badge.jsx';
import { Button } from '../common/Button.jsx';
import {
  BellIcon,
  BellOffIcon,
  MapPinIcon,
  ShieldCheckIcon,
  CompassIcon,
  RefreshCwIcon,
  CheckCircleIcon,
  AlertTriangleIcon,
} from '../common/Icons.jsx';

export function SubscriptionBanner() {
  const {
    activeTrip,
    driverLiveGps,
    subscriptionPermission,
    setSubscriptionPermission,
    isSubscribed,
    setIsSubscribed,
    userCurrentRoad,
    setUserCurrentRoad,
    userGpsLocation,
    setUserGpsLocation,
    addToast,
  } = useSimulation();

  // Real Web Push & Geolocation States
  const [isPushSupported, setIsPushSupported] = useState(false);
  const [browserNotificationPerm, setBrowserNotificationPerm] = useState('default');
  const [activeEndpointHash, setActiveEndpointHash] = useState(null);
  const [isSubscribingPush, setIsSubscribingPush] = useState(false);
  const [isTestingPush, setIsTestingPush] = useState(false);

  // Consented Location Sharing
  const [isLocationConsented, setIsLocationConsented] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [roadUserGps, setRoadUserGps] = useState({
    lat: null,
    lng: null,
    accuracy: null,
    lastSentAt: null,
  });

  // Check browser push support on mount and resume heartbeat if consented
  useEffect(() => {
    const supported = pushService.isSupported();
    setIsPushSupported(supported);
    if (supported) {
      const currentPerm = pushService.getPermission();
      setBrowserNotificationPerm(currentPerm);
      const storedHash = pushService.getStoredEndpointHash();
      if (storedHash) {
        setActiveEndpointHash(storedHash);
      }

      // If browser permission is already granted, verify/sync subscription with backend
      if (currentPerm === 'granted') {
        pushService.syncSubscription().then((liveHash) => {
          if (liveHash) {
            setActiveEndpointHash(liveHash);
            setIsSubscribed(true);
            setSubscriptionPermission('GRANTED');
          }
        });
      }

      const consented = pushService.getStoredLocationConsent();
      setIsLocationConsented(consented);
      if (consented && storedHash) {
        handleEnableLocationSharing();
      }
    }
  }, []);

  // Compute reference location for dynamic proximity test fixtures
  const testBaseCoords = React.useMemo(() => {
    if (driverLiveGps?.lat && driverLiveGps?.lng) {
      return { lat: driverLiveGps.lat, lng: driverLiveGps.lng, label: 'Live Ambulance' };
    }
    if (activeTrip?.currentLocation?.coordinates) {
      return {
        lat: activeTrip.currentLocation.coordinates[1],
        lng: activeTrip.currentLocation.coordinates[0],
        label: 'Active Ambulance',
      };
    }
    if (userGpsLocation?.lat && userGpsLocation?.lng) {
      return { lat: userGpsLocation.lat, lng: userGpsLocation.lng, label: 'Device GPS' };
    }
    return { lat: 24.999, lng: 86.123, label: 'Regional Corridor' };
  }, [driverLiveGps?.lat, driverLiveGps?.lng, activeTrip, userGpsLocation?.lat, userGpsLocation?.lng]);

  // Handle Real Web Push Subscription
  const handleRealPushSubscribe = async () => {
    setIsSubscribingPush(true);
    try {
      const res = await pushService.subscribeToAlerts();
      const currentPerm = pushService.getPermission();
      setBrowserNotificationPerm(currentPerm);

      if (res.success) {
        const hash = res.data?.endpointHash || 'Registered';
        setActiveEndpointHash(hash);
        setSubscriptionPermission('GRANTED');
        setIsSubscribed(true);
        addToast(
          'Push Notifications Registered',
          'This browser is now registered for live emergency ambulance alerts.',
          'success'
        );
      } else {
        if (currentPerm === 'denied') {
          setSubscriptionPermission('DENIED');
        }
        addToast(
          'Push Registration Notice',
          res.error?.message || 'Could not register push notifications.',
          res.error?.code === 'PERMISSION_DENIED' ? 'warning' : 'info'
        );
      }
    } catch (err) {
      addToast('Push Error', err.message || 'Push registration failed.', 'warning');
    } finally {
      setIsSubscribingPush(false);
    }
  };

  // Check and sync latest browser notification permission
  const handleRefreshPermission = () => {
    const currentPerm = pushService.getPermission();
    setBrowserNotificationPerm(currentPerm);
    if (currentPerm === 'granted') {
      setSubscriptionPermission('GRANTED');
      addToast('Permission Allowed', 'Browser notification permission is granted. Click Subscribe to complete registration.', 'success');
    } else if (currentPerm === 'denied') {
      setSubscriptionPermission('DENIED');
      addToast('Permission Blocked', 'Notifications are blocked in site settings. Click the lock/tune icon in your address bar to Allow.', 'warning');
    } else {
      addToast('Permission Not Granted', 'Notifications are in Ask/Default state. Click the lock/tune icon in your address bar to Allow.', 'info');
    }
  };

  // Handle Real Push Unsubscribe
  const handleRealPushUnsubscribe = async () => {
    try {
      await pushService.unsubscribeAll();
      setActiveEndpointHash(null);
      setIsLocationConsented(false);
      setRoadUserGps({ lat: null, lng: null, accuracy: null, lastSentAt: null });
      if (setUserGpsLocation) {
        setUserGpsLocation({ lat: null, lng: null, accuracy: null, timestamp: null, status: 'IDLE' });
      }
      setUserCurrentRoad('');
      setIsSubscribed(false);
      addToast('Unsubscribed', 'Web Push alerts and location heartbeats have been stopped.', 'info');
    } catch (err) {
      addToast('Unsubscribe Error', err.message || 'Could not unsubscribe.', 'neutral');
    }
  };

  // Handle Dispatching a Test Notification to Verify Service Worker & OS Alerts
  const handleSendTestPush = async () => {
    setIsTestingPush(true);
    try {
      const res = await pushService.sendTestNotification();
      if (res.success) {
        addToast(
          'Test Alert Dispatched',
          'Web Push alert sent to browser push service! Look for the OS desktop notification.',
          'success'
        );
      } else {
        addToast('Test Alert Error', res.error?.message || 'Could not send test push alert.', 'warning');
      }
    } catch (err) {
      addToast('Test Alert Error', err.message || 'Test push delivery failed.', 'warning');
    } finally {
      setIsTestingPush(false);
    }
  };

  // Handle Location Sharing Consent & Real Hardware Geolocation
  const handleEnableLocationSharing = async () => {
    setIsLocating(true);
    try {
      const res = await pushService.enableLocationSharing((pos) => {
        setRoadUserGps({
          lat: pos.lat,
          lng: pos.lng,
          accuracy: pos.accuracy,
          lastSentAt: pos.capturedAt,
        });

        if (setUserGpsLocation) {
          setUserGpsLocation({
            status: 'SUCCESS',
            lat: pos.lat,
            lng: pos.lng,
            accuracy: pos.accuracy,
            timestamp: pos.capturedAt ? new Date(pos.capturedAt).toISOString() : new Date().toISOString(),
          });
        }

        // Dynamically reverse geocode into real road name or address
        apiClient.reverseGeocode(pos.lat, pos.lng).then((road) => {
          const roadStr = typeof road === 'string' ? road : (road?.displayName || road?.road || '');
          if (roadStr) {
            setUserCurrentRoad(roadStr);
          } else {
            setUserCurrentRoad(`Coordinates: ${pos.lat.toFixed(4)}°N, ${pos.lng.toFixed(4)}°E`);
          }
        }).catch(() => {
          setUserCurrentRoad(`Coordinates: ${pos.lat.toFixed(4)}°N, ${pos.lng.toFixed(4)}°E`);
        });
      });

      if (res.success) {
        setIsLocationConsented(true);
        addToast(
          'Location Sharing Consented',
          `Real GPS coordinates shared (±${res.data?.accuracy}m). Heartbeat active for 2–5 km targeting.`,
          'success'
        );
      } else {
        addToast('Location Error', res.error?.message || 'Could not share location.', 'warning');
      }
    } catch (err) {
      addToast('Location Error', err.message || 'Location sharing failed.', 'warning');
    } finally {
      setIsLocating(false);
    }
  };

  const handleDisableLocationSharing = () => {
    pushService.disableLocationSharing();
    setIsLocationConsented(false);
    setRoadUserGps({ lat: null, lng: null, accuracy: null, lastSentAt: null });
    if (setUserGpsLocation) {
      setUserGpsLocation({ lat: null, lng: null, accuracy: null, timestamp: null, status: 'IDLE' });
    }
    setUserCurrentRoad('');
    addToast('Location Sharing Disabled', 'Targeted proximity location tracking revoked.', 'info');
  };

  // Test mode helper: Send diagnostic coordinates for reproducible proximity testing
  const handleApplyDiagnosticCoords = async (lat, lng, label) => {
    const endpointHash = activeEndpointHash || pushService.getStoredEndpointHash();
    if (!endpointHash) {
      addToast('Push Required', 'Please subscribe to Web Push before configuring test coordinates.', 'warning');
      return;
    }

    const accuracy = 20;
    const now = new Date();

    const hbRes = await apiClient.sendLocationHeartbeat({
      endpointHash,
      coordinates: [lng, lat],
      accuracyMeters: accuracy,
      capturedAt: now.toISOString(),
      locationConsent: true,
    });

    if (hbRes.success) {
      setIsLocationConsented(true);
      setRoadUserGps({ lat, lng, accuracy, lastSentAt: now });
      if (setUserGpsLocation) {
        setUserGpsLocation({ status: 'SUCCESS', lat, lng, accuracy, timestamp: now.toISOString() });
      }
      setUserCurrentRoad(`[TEST FIXTURE] ${label}`);
      addToast('Test Location Set', `Heartbeat sent with diagnostic coordinates (${label}).`, 'info');
    } else {
      addToast('Diagnostic Error', hbRes.error?.message || 'Failed to send test heartbeat.', 'warning');
    }
  };

  return (
    <Card variant="ivory" className="subscription-card">
      <div className="sub-header">
        <div className="sub-title-group">
          <div className="sub-icon-wrap">
            <BellIcon size={22} className="text-amber" />
          </div>
          <div>
            <h3 className="sub-title">Real Web Push & Proximity Alert Subscription</h3>
            <p className="sub-desc">
              Opt in to receive real browser Web Push alerts when an approaching emergency ambulance enters your 2–5 km radius.
            </p>
          </div>
        </div>

        <div>
          <Badge
            variant={activeEndpointHash ? 'clear' : 'warning'}
            size="md"
          >
            {activeEndpointHash ? 'WEB PUSH SUBSCRIBED' : 'WEB PUSH INACTIVE'}
          </Badge>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', marginTop: '16px' }}>
        {/* Step A: Real Browser Web Push Subscription */}
        <div style={{ background: '#fff', padding: '14px', borderRadius: '8px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontWeight: 600, fontSize: '0.9rem', color: '#0f172a' }}>1. Browser Push Subscription</span>
              <Badge
                variant={browserNotificationPerm === 'granted' ? 'clear' : browserNotificationPerm === 'denied' ? 'critical' : 'warning'}
                size="xs"
              >
                {browserNotificationPerm.toUpperCase()}
              </Badge>
            </div>

            <p style={{ fontSize: '0.82rem', color: '#64748b', margin: '4px 0 10px 0' }}>
              Subscribes this browser to the backend Web Push dispatch engine using standard VAPID key exchange. Works even when this tab is closed.
            </p>

            {browserNotificationPerm !== 'granted' && (
              <div
                style={{
                  background: browserNotificationPerm === 'denied' ? '#fef2f2' : '#fffbeb',
                  border: `1px solid ${browserNotificationPerm === 'denied' ? '#fecaca' : '#fde68a'}`,
                  borderRadius: '6px',
                  padding: '10px',
                  fontSize: '0.78rem',
                  color: browserNotificationPerm === 'denied' ? '#991b1b' : '#92400e',
                  marginBottom: '12px',
                  lineHeight: '1.45',
                }}
              >
                <div style={{ fontWeight: 600, marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>{browserNotificationPerm === 'denied' ? '🔒 Notifications Blocked in Browser' : '🔔 Enable Notifications in Browser:'}</span>
                </div>
                <div>1. Click the <strong>🔒 Lock</strong> or <strong>🎛️ Site Settings</strong> icon in your address bar (next to <code>localhost:5173</code>).</div>
                <div>2. Set <strong>Notifications</strong> to <strong>Allow</strong>.</div>
                <div>3. Click <strong>Subscribe to Live Web Push</strong> or <strong>Verify Permission</strong> below.</div>
              </div>
            )}
          </div>

          {activeEndpointHash ? (
            <div>
              <div style={{ fontSize: '0.8rem', background: '#f8fafc', padding: '8px', borderRadius: '4px', marginBottom: '10px', wordBreak: 'break-all' }}>
                <strong>Endpoint Hash:</strong> #{activeEndpointHash.substring(0, 16)}...
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  icon={BellIcon}
                  onClick={handleSendTestPush}
                  loading={isTestingPush}
                >
                  Send Test Alert
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  icon={BellOffIcon}
                  onClick={handleRealPushUnsubscribe}
                >
                  Unsubscribe
                </Button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
              <Button
                type="button"
                variant="primary"
                size="sm"
                icon={BellIcon}
                onClick={handleRealPushSubscribe}
                loading={isSubscribingPush}
                disabled={!isPushSupported}
              >
                {isPushSupported ? 'Subscribe to Live Web Push' : 'Push Unsupported in Browser'}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleRefreshPermission}
                title="Check if browser permission was updated"
              >
                Verify Permission
              </Button>
            </div>
          )}
        </div>

        {/* Step B: Consented Proximity Location Sharing */}
        <div style={{ background: '#fff', padding: '14px', borderRadius: '8px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontWeight: 600, fontSize: '0.9rem', color: '#0f172a' }}>2. Proximity Location Sharing</span>
              <Badge variant={isLocationConsented ? 'clear' : 'warning'} size="xs">
                {isLocationConsented ? 'CONSENTED (30s HEARTBEAT)' : 'NOT CONSENTED'}
              </Badge>
            </div>

            <p style={{ fontSize: '0.82rem', color: '#64748b', margin: '4px 0 12px 0' }}>
              Separate opt-in consent for 2–5 km proximity matching. Backend requires location freshness ≤90s and accuracy ≤200m.
            </p>
          </div>

          {isLocationConsented ? (
            <div>
              <div style={{ fontSize: '0.8rem', background: '#f0fdf4', padding: '8px', borderRadius: '4px', marginBottom: '10px', color: '#166534' }}>
                <div><strong>Live Fix:</strong> {roadUserGps.lat?.toFixed(5)}°N, {roadUserGps.lng?.toFixed(5)}°E (±{roadUserGps.accuracy}m)</div>
                <div><strong>Heartbeat:</strong> {roadUserGps.lastSentAt ? new Date(roadUserGps.lastSentAt).toLocaleTimeString() : 'Fresh (<90s)'}</div>
                {userCurrentRoad && <div style={{ marginTop: '4px', fontWeight: 600 }}>📍 {userCurrentRoad}</div>}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleDisableLocationSharing}
              >
                Revoke Location Sharing
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              variant={activeEndpointHash ? 'primary' : 'outline'}
              size="sm"
              icon={CompassIcon}
              onClick={handleEnableLocationSharing}
              loading={isLocating}
              disabled={!activeEndpointHash}
            >
              {activeEndpointHash ? 'Share Location for 2–5km Alerts' : 'Enable Push First (Step 1)'}
            </Button>
          )}
        </div>

        {/* Step C: Location Mode & Proximity Diagnostics */}
        <div style={{ background: '#fff', padding: '14px', borderRadius: '8px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontWeight: 600, fontSize: '0.9rem', color: '#0f172a' }}>3. Location Verification</span>
              <Badge variant={userGpsLocation?.status === 'SUCCESS' ? 'clear' : 'neutral'} size="xs">
                {userGpsLocation?.status === 'SUCCESS' ? 'REAL GPS ACTIVE' : 'AWAITING GPS'}
              </Badge>
            </div>

            <p style={{ fontSize: '0.82rem', color: '#64748b', margin: '4px 0 8px 0' }}>
              Proximity matching requires real coordinates. For simulated distance testing without moving, you may apply a diagnostic test sector.
            </p>
          </div>

          <div>
            <div style={{ fontSize: '0.78rem', color: '#475569', marginBottom: '8px' }}>
              <strong>Current Sector:</strong> {userCurrentRoad || 'Location unverified'}
            </div>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn-sm btn-outline"
                style={{ fontSize: '0.74rem', padding: '4px 8px' }}
                onClick={() =>
                  handleApplyDiagnosticCoords(
                    Number((testBaseCoords.lat + 0.012).toFixed(6)),
                    Number((testBaseCoords.lng + 0.010).toFixed(6)),
                    `${testBaseCoords.label} Sector (1.8 km)`
                  )
                }
                disabled={!activeEndpointHash}
                title="Simulate location within 2-5 km alert zone"
              >
                🧪 Near Zone (1.8 km)
              </button>
              <button
                type="button"
                className="btn btn-sm btn-outline"
                style={{ fontSize: '0.74rem', padding: '4px 8px' }}
                onClick={() =>
                  handleApplyDiagnosticCoords(
                    Number((testBaseCoords.lat + 0.025).toFixed(6)),
                    Number((testBaseCoords.lng + 0.020).toFixed(6)),
                    `${testBaseCoords.label} Sector (3.8 km)`
                  )
                }
                disabled={!activeEndpointHash}
                title="Simulate location within outer alert zone"
              >
                🧪 Outer Zone (3.8 km)
              </button>
              <button
                type="button"
                className="btn btn-sm btn-outline"
                style={{ fontSize: '0.74rem', padding: '4px 8px' }}
                onClick={() =>
                  handleApplyDiagnosticCoords(
                    Number((testBaseCoords.lat + 0.150).toFixed(6)),
                    Number((testBaseCoords.lng + 0.150).toFixed(6)),
                    'Out of Range Corridor (22 km)'
                  )
                }
                disabled={!activeEndpointHash}
                title="Simulate location far outside 5 km radius (ineligible)"
              >
                🧪 Out of Range (22 km)
              </button>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}

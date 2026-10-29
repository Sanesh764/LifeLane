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

  // Check browser push support on mount
  useEffect(() => {
    const supported = pushService.isSupported();
    setIsPushSupported(supported);
    if (supported) {
      setBrowserNotificationPerm(pushService.getPermission());
      const storedHash = pushService.getStoredEndpointHash();
      if (storedHash) {
        setActiveEndpointHash(storedHash);
      }
      setIsLocationConsented(pushService.getStoredLocationConsent());
    }
  }, []);

  // Handle Real Web Push Subscription
  const handleRealPushSubscribe = async () => {
    setIsSubscribingPush(true);
    try {
      const res = await pushService.subscribeToAlerts();
      if (res.success) {
        const hash = res.data?.endpointHash || 'Registered';
        setActiveEndpointHash(hash);
        setBrowserNotificationPerm('granted');
        setSubscriptionPermission('GRANTED');
        setIsSubscribed(true);
        addToast(
          'Push Notifications Registered',
          'This browser is now registered for live emergency ambulance alerts.',
          'success'
        );
      } else {
        addToast('Push Registration Error', res.error?.message || 'Could not register push notifications.', 'warning');
      }
    } catch (err) {
      addToast('Push Error', err.message || 'Push registration failed.', 'warning');
    } finally {
      setIsSubscribingPush(false);
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
              <Badge variant={browserNotificationPerm === 'granted' ? 'clear' : 'neutral'} size="xs">
                {browserNotificationPerm.toUpperCase()}
              </Badge>
            </div>

            <p style={{ fontSize: '0.82rem', color: '#64748b', margin: '4px 0 12px 0' }}>
              Subscribes this browser to the backend Web Push dispatch engine using standard VAPID key exchange. Works even when this tab is closed.
            </p>
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
                onClick={() => handleApplyDiagnosticCoords(25.612, 85.145, 'Patna Junction Sector (2.1 km)')}
                disabled={!activeEndpointHash}
                title="Simulate location within 2-5 km alert zone"
              >
                🧪 Near Zone (2.1 km)
              </button>
              <button
                type="button"
                className="btn btn-sm btn-outline"
                style={{ fontSize: '0.74rem', padding: '4px 8px' }}
                onClick={() => handleApplyDiagnosticCoords(25.620, 85.120, 'Atal Path Sector (4.2 km)')}
                disabled={!activeEndpointHash}
                title="Simulate location within outer alert zone"
              >
                🧪 Outer Zone (4.2 km)
              </button>
              <button
                type="button"
                className="btn btn-sm btn-outline"
                style={{ fontSize: '0.74rem', padding: '4px 8px' }}
                onClick={() => handleApplyDiagnosticCoords(25.750, 85.300, 'Hajipur Highway (18.5 km)')}
                disabled={!activeEndpointHash}
                title="Simulate location far outside 5 km radius (ineligible)"
              >
                🧪 Out of Range (18.5 km)
              </button>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}

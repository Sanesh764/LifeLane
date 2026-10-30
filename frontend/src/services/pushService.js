/**
 * AmbuRoute Browser Web Push & Road-User Subscription Service
 * Conforms to Phase G (Push Subscription) & Phase H (Separate Location Consent).
 */

import { apiClient } from './api.js';

const STORAGE_ENDPOINT_HASH = 'amburoute_endpoint_hash';
const STORAGE_LOCATION_CONSENT = 'amburoute_location_consent';

let heartbeatTimer = null;
let inFlightRegistrationPromise = null;

async function deduplicatedRegister(payload) {
  if (inFlightRegistrationPromise) {
    return inFlightRegistrationPromise;
  }
  inFlightRegistrationPromise = apiClient.registerSubscription(payload).finally(() => {
    inFlightRegistrationPromise = null;
  });
  return inFlightRegistrationPromise;
}

/**
 * Converts VAPID base64url public key to Uint8Array required by PushManager
 */
export function urlBase64ToUint8Array(base64String) {
  if (!base64String || typeof base64String !== 'string') {
    throw new Error('Valid VAPID public key string is required');
  }
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const decodeBase64 =
    typeof window !== 'undefined' && typeof window.atob === 'function'
      ? window.atob.bind(window)
      : typeof globalThis.atob === 'function'
      ? globalThis.atob.bind(globalThis)
      : (b64) => Buffer.from(b64, 'base64').toString('binary');
  const rawData = decodeBase64(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export const pushService = {
  /**
   * Check browser capability for Push Notifications and Service Workers
   */
  isSupported() {
    return (
      typeof window !== 'undefined' &&
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      'Notification' in window
    );
  },

  /**
   * Check browser Geolocation API support
   */
  isLocationSupported() {
    return typeof window !== 'undefined' && 'geolocation' in navigator;
  },

  /**
   * Get current browser notification permission
   */
  getPermission() {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      return Notification.permission;
    }
    return 'default';
  },

  getStoredEndpointHash() {
    try {
      return localStorage.getItem(STORAGE_ENDPOINT_HASH);
    } catch {
      return null;
    }
  },

  getStoredLocationConsent() {
    try {
      return localStorage.getItem(STORAGE_LOCATION_CONSENT) === 'true';
    } catch {
      return false;
    }
  },

  /**
   * Register or get active service worker
   */
  async getServiceWorkerRegistration() {
    if (!this.isSupported()) {
      throw new Error('Service Worker is not supported in this browser environment.');
    }
    await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    return navigator.serviceWorker.ready;
  },

  /**
   * Synchronize active browser push subscription with backend
   * Ensures MongoDB always has a valid, active subscription record on mount
   */
  async syncSubscription() {
    if (!this.isSupported() || this.getPermission() !== 'granted') return null;
    try {
      const reg = await this.getServiceWorkerRegistration();
      const existingSub = await reg?.pushManager?.getSubscription();
      if (!existingSub) return null;

      const subJson = existingSub.toJSON();
      const deviceType = /Mobi|Android/i.test(navigator.userAgent) ? 'mobile' : 'desktop';
      const regRes = await deduplicatedRegister({
        endpoint: existingSub.endpoint,
        keys: subJson.keys,
        notificationConsent: true,
        locationConsent: this.getStoredLocationConsent(),
        deviceType,
      });

      if (regRes.success && regRes.data?.subscription?.endpointHash) {
        const hash = regRes.data.subscription.endpointHash;
        try {
          localStorage.setItem(STORAGE_ENDPOINT_HASH, hash);
        } catch {
          // Ignore
        }
        return hash;
      }
    } catch (e) {
      console.warn('[pushService] Sync subscription notice:', e);
    }
    return this.getStoredEndpointHash();
  },

  /**
   * Phase G: Enable Ambulance Alerts (Subscribe to Web Push)
   * Requests permission, fetches VAPID key, creates browser subscription, and registers with backend.
   */
  async subscribeToAlerts() {
    if (!this.isSupported()) {
      return {
        success: false,
        error: { code: 'UNSUPPORTED', message: 'Web Push is not supported on this browser.' },
      };
    }

    try {
      let permission = this.getPermission();
      if (permission !== 'granted') {
        try {
          const permResult = Notification.requestPermission();
          if (permResult && typeof permResult.then === 'function') {
            permission = await permResult;
          } else {
            permission = await new Promise((resolve) => Notification.requestPermission(resolve));
          }
        } catch {
          permission = this.getPermission();
        }
      }

      const finalPermission = permission || this.getPermission();
      if (finalPermission !== 'granted') {
        const isDenied = finalPermission === 'denied';
        return {
          success: false,
          error: {
            code: isDenied ? 'PERMISSION_DENIED' : 'PERMISSION_DISMISSED',
            message: isDenied
              ? 'Notification permission is blocked by your browser site settings. Click the lock/tune icon in your address bar (next to localhost:5173), change Notifications to "Allow", and try again.'
              : 'Notification permission prompt was dismissed or muted by your browser. To enable alerts: click the lock/settings icon in your address bar (next to the URL), change Notifications to "Allow", and click Subscribe again.',
          },
        };
      }

      // Fetch VAPID key from backend
      const vapidRes = await apiClient.getVapidPublicKey();
      if (!vapidRes.success || !vapidRes.data?.publicKey) {
        return {
          success: false,
          error: {
            code: 'VAPID_FETCH_FAILED',
            message: vapidRes.error?.message || 'Failed to retrieve VAPID public key from backend.',
          },
        };
      }

      const vapidPublicKey = vapidRes.data.publicKey;
      const applicationServerKey = urlBase64ToUint8Array(vapidPublicKey);

      const reg = await this.getServiceWorkerRegistration();

      // Check existing subscription first, or create fresh subscription
      let subscription = null;
      try {
        subscription = await reg.pushManager.getSubscription();
      } catch (getErr) {
        console.warn('[pushService] getSubscription notice:', getErr);
      }

      if (!subscription) {
        subscription = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey,
        });
      }

      const subJson = subscription.toJSON();
      const deviceType = /Mobi|Android/i.test(navigator.userAgent) ? 'mobile' : 'desktop';

      // Register with backend (deduplicated against any simultaneous syncSubscription call)
      const regRes = await deduplicatedRegister({
        endpoint: subscription.endpoint,
        keys: subJson.keys,
        notificationConsent: true,
        locationConsent: this.getStoredLocationConsent(),
        deviceType,
      });

      if (!regRes.success) {
        return {
          success: false,
          error: regRes.error,
        };
      }

      const endpointHash = regRes.data?.subscription?.endpointHash;
      if (endpointHash) {
        try {
          localStorage.setItem(STORAGE_ENDPOINT_HASH, endpointHash);
        } catch {
          // Ignore local storage error
        }
      }

      return {
        success: true,
        data: {
          subscription: regRes.data.subscription,
          endpointHash,
        },
      };
    } catch (err) {
      return {
        success: false,
        error: { code: 'SUBSCRIPTION_ERROR', message: err.message },
      };
    }
  },

  /**
   * Phase H: Enable Consented Location Sharing
   * Captures GPS location, sends heartbeat to backend, and starts 30s background keepalive.
   */
  async enableLocationSharing(onPositionChange) {
    if (!this.isLocationSupported()) {
      return {
        success: false,
        error: { code: 'UNSUPPORTED', message: 'Geolocation is not supported in this browser.' },
      };
    }

    let endpointHash = this.getStoredEndpointHash();
    if (!endpointHash) {
      // Attempt auto-recovery from active browser PushManager subscription
      try {
        const reg = await this.getServiceWorkerRegistration();
        const existingSub = await reg?.pushManager?.getSubscription();
        if (existingSub) {
          const subJson = existingSub.toJSON();
          const deviceType = /Mobi|Android/i.test(navigator.userAgent) ? 'mobile' : 'desktop';
          const regRes = await apiClient.registerSubscription({
            endpoint: existingSub.endpoint,
            keys: subJson.keys,
            notificationConsent: true,
            locationConsent: true,
            deviceType,
          });
          if (regRes.success && regRes.data?.subscription?.endpointHash) {
            endpointHash = regRes.data.subscription.endpointHash;
            localStorage.setItem(STORAGE_ENDPOINT_HASH, endpointHash);
          }
        }
      } catch {
        // Recovery failed, proceed to error check
      }
    }

    if (!endpointHash) {
      return {
        success: false,
        error: {
          code: 'SUBSCRIPTION_REQUIRED',
          message: 'Please enable ambulance push alerts before sharing your location for nearby targeting.',
        },
      };
    }

    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          const accuracy = Math.round(pos.coords.accuracy);

          // Update backend location with explicit locationConsent
          const hbRes = await apiClient.sendLocationHeartbeat({
            endpointHash,
            coordinates: [lng, lat],
            accuracyMeters: accuracy,
            capturedAt: new Date(pos.timestamp).toISOString(),
            locationConsent: true,
          });

          if (!hbRes.success) {
            resolve({
              success: false,
              error: hbRes.error,
            });
            return;
          }

          try {
            localStorage.setItem(STORAGE_LOCATION_CONSENT, 'true');
          } catch {
            // Ignore
          }

          if (onPositionChange) {
            onPositionChange({
              lat,
              lng,
              accuracy,
              capturedAt: new Date(pos.timestamp),
            });
          }

          // Start continuous 30-second heartbeat to satisfy the 90-second backend freshness window
          this.startHeartbeatInterval(endpointHash, onPositionChange);

          resolve({
            success: true,
            data: {
              coordinates: [lng, lat],
              accuracy,
              lastLocationCapturedAt: hbRes.data?.lastLocationCapturedAt,
            },
          });
        },
        (err) => {
          resolve({
            success: false,
            error: {
              code: 'LOCATION_ERROR',
              message: err.message || 'Could not retrieve device location.',
            },
          });
        },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 }
      );
    });
  },

  /**
   * Starts periodic location heartbeat every 30 seconds
   */
  startHeartbeatInterval(endpointHash, onPositionChange) {
    this.stopHeartbeatInterval();

    heartbeatTimer = setInterval(() => {
      if (!navigator.geolocation) return;

      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          const accuracy = Math.round(pos.coords.accuracy);

          await apiClient.sendLocationHeartbeat({
            endpointHash,
            coordinates: [lng, lat],
            accuracyMeters: accuracy,
            capturedAt: new Date(pos.timestamp).toISOString(),
            locationConsent: true,
          });

          if (onPositionChange) {
            onPositionChange({
              lat,
              lng,
              accuracy,
              capturedAt: new Date(pos.timestamp),
            });
          }
        },
        () => {},
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 20000 }
      );
    }, 30000);
  },

  /**
   * Stop periodic location heartbeat
   */
  stopHeartbeatInterval() {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  },

  /**
   * Phase H: Disable Consented Location Sharing
   */
  async disableLocationSharing() {
    this.stopHeartbeatInterval();
    try {
      localStorage.setItem(STORAGE_LOCATION_CONSENT, 'false');
    } catch {
      // Ignore
    }

    const endpointHash = this.getStoredEndpointHash();
    if (endpointHash) {
      await apiClient.unsubscribe({ endpointHash });
    }

    return { success: true };
  },

  /**
   * Unsubscribe from all alerts and remove local subscription
   */
  async unsubscribeAll() {
    this.stopHeartbeatInterval();

    const endpointHash = this.getStoredEndpointHash();
    if (endpointHash) {
      await apiClient.unsubscribe({ endpointHash });
    }

    try {
      localStorage.removeItem(STORAGE_ENDPOINT_HASH);
      localStorage.removeItem(STORAGE_LOCATION_CONSENT);
    } catch {
      // Ignore
    }

    if (this.isSupported()) {
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await sub.unsubscribe();
        }
      } catch {
        // Ignore
      }
    }

    return { success: true };
  },

  /**
   * Dispatch an explicit test push notification
   */
  async sendTestNotification() {
    let endpointHash = this.getStoredEndpointHash();
    if (!endpointHash) {
      try {
        const reg = await this.getServiceWorkerRegistration();
        const existingSub = await reg?.pushManager?.getSubscription();
        if (existingSub) {
          const subJson = existingSub.toJSON();
          const deviceType = /Mobi|Android/i.test(navigator.userAgent) ? 'mobile' : 'desktop';
          const regRes = await apiClient.registerSubscription({
            endpoint: existingSub.endpoint,
            keys: subJson.keys,
            notificationConsent: true,
            locationConsent: true,
            deviceType,
          });
          if (regRes.success && regRes.data?.subscription?.endpointHash) {
            endpointHash = regRes.data.subscription.endpointHash;
            localStorage.setItem(STORAGE_ENDPOINT_HASH, endpointHash);
          }
        }
      } catch {
        // Recovery failed
      }
    }

    if (!endpointHash) {
      return {
        success: false,
        error: { code: 'SUBSCRIPTION_REQUIRED', message: 'Please subscribe to Web Push first before testing notifications.' },
      };
    }

    return apiClient.sendTestNotification({ endpointHash });
  },
};

if (typeof window !== 'undefined') {
  window.pushService = pushService;
}

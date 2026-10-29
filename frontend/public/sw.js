/**
 * AmbuRoute Emergency Push Notification Service Worker
 * Conforms to Phase I and backend alertTemplates.js payload contract.
 */

/* eslint-disable no-restricted-globals */

self.addEventListener('install', (event) => {
  // Activate worker immediately
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let payload = {};

  if (event.data) {
    try {
      payload = event.data.json();
    } catch {
      payload = {
        title: '🚨 AMBULANCE APPROACHING',
        body: event.data.text(),
      };
    }
  }

  const title = payload.title || '🚨 EMERGENCY AMBULANCE ALERT';
  const data = payload.data || {};
  const tripId = data.tripId || 'active';
  const tag = payload.tag || `ambulance-alert-${tripId}`;

  const notificationOptions = {
    body: payload.body || 'An emergency ambulance is active nearby. Please stay alert and prepare to give way safely.',
    icon: payload.icon || '/icons/alert-icon-192.png',
    badge: payload.badge || '/icons/alert-badge-72.png',
    tag,
    renotify: Boolean(payload.renotify),
    requireInteraction: Boolean(payload.requireInteraction),
    silent: Boolean(payload.silent),
    data: {
      ...data,
      receivedAt: new Date().toISOString(),
    },
  };

  event.waitUntil(self.registration.showNotification(title, notificationOptions));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = new URL('/#alerts', self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Focus existing AmbuRoute window if open
      for (const client of clientList) {
        if (client.url && 'focus' in client) {
          return client.focus();
        }
      }
      // Otherwise open new window
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});

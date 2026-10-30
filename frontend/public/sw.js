/**
 * AmbuRoute Emergency Push Notification Service Worker
 * Conforms to Phase I and backend alertTemplates.js payload contract.
 * Delivers native Windows/Chrome desktop notifications with action handling.
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
  const processPushEvent = async () => {
    let payload = {};

    if (event.data) {
      try {
        payload = event.data.json();
      } catch {
        try {
          payload = { body: event.data.text() };
        } catch {
          payload = {};
        }
      }
    }

    const title = payload.title || '🚑 AmbuRoute — Demo Ambulance Alert';
    const data = payload.data || {};
    const tripId = data.tripId || 'active';
    const tag = payload.tag || `amburoute-alert-${tripId}`;

    // Discard stale emergency notifications older than 30 minutes
    const msgTimestamp = data.timestamp || data.receivedAt;
    if (msgTimestamp) {
      const msgTime = new Date(msgTimestamp).getTime();
      if (!isNaN(msgTime) && Date.now() - msgTime > 30 * 60 * 1000) {
        console.log('[AmbuRoute SW] Discarding stale emergency alert older than 30 minutes:', msgTimestamp);
        return;
      }
    }

    // Resolve absolute origin URLs for icons so native Windows engine renders them cleanly
    let iconUrl = '/icons/alert-icon-192.png';
    let badgeUrl = '/icons/alert-badge-72.png';
    try {
      iconUrl = new URL(payload.icon || '/icons/alert-icon-192.png', self.location.origin).href;
      badgeUrl = new URL(payload.badge || '/icons/alert-badge-72.png', self.location.origin).href;
    } catch {
      // Fallback
    }

    const clientsList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    console.log(`[AmbuRoute SW] Background Push received! Open AmbuRoute tabs count: ${clientsList.length}`);

    const notificationOptions = {
      body: payload.body || 'An ambulance mission has just started. This is a hackathon demonstration notification.',
      icon: iconUrl,
      badge: badgeUrl,
      tag,
      renotify: payload.renotify !== undefined ? Boolean(payload.renotify) : true,
      requireInteraction: payload.requireInteraction !== undefined ? Boolean(payload.requireInteraction) : true,
      silent: Boolean(payload.silent),
      data: {
        ...data,
        url: data.url || '/#alerts',
        receivedAt: new Date().toISOString(),
      },
    };

    try {
      await self.registration.showNotification(title, notificationOptions);
      console.log('[AmbuRoute SW] Native showNotification() completed successfully for:', title);
    } catch (showErr) {
      console.warn('[AmbuRoute SW] showNotification() error with rich options, falling back to minimal:', showErr);
      await self.registration.showNotification(title, {
        body: payload.body || 'An emergency ambulance alert has been received.',
        tag,
      });
    }
  };

  event.waitUntil(processPushEvent());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const data = event.notification.data || {};
  const targetPath = data.url || '/#alerts';
  const targetUrl = new URL(targetPath, self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Focus existing AmbuRoute window if open
      for (const client of clientList) {
        if (client.url && client.url.startsWith(self.location.origin)) {
          if ('focus' in client) {
            client.focus();
          }
          if ('navigate' in client && !client.url.includes(targetPath)) {
            return client.navigate(targetUrl);
          }
          return;
        }
      }
      // Otherwise open new window
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});

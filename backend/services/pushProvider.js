import webpush from 'web-push';
import { env } from '../config/env.js';

/**
 * Real WebPush Provider using web-push library
 */
export class WebPushProvider {
  constructor(options = {}) {
    this.subject = options.subject || env.VAPID.subject;
    this.publicKey = options.publicKey || env.VAPID.publicKey;
    this.privateKey = options.privateKey || env.VAPID.privateKey;

    if (this.subject && this.publicKey && this.privateKey) {
      try {
        webpush.setVapidDetails(this.subject, this.publicKey, this.privateKey);
      } catch (err) {
        if (env.NODE_ENV !== 'test') {
          console.warn('[WebPushProvider Warning] Failed to set VAPID details:', err.message);
        }
      }
    }
  }

  async sendNotification(subscription, payload, options = {}) {
    const pushSubscription = {
      endpoint: subscription.endpoint,
      keys: {
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
      },
    };

    const payloadString = typeof payload === 'string' ? payload : JSON.stringify(payload);

    // RFC 8030 Section 5.4: Topic MUST be max 32 characters and base64url safe
    let safeTopic = options.topic;
    if (typeof safeTopic === 'string') {
      safeTopic = safeTopic.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 32);
    }

    try {
      const response = await webpush.sendNotification(
        pushSubscription,
        payloadString,
        {
          TTL: options.TTL || env.ALERTS?.pushTtlSeconds || 1800,
          urgency: options.urgency || 'high',
          ...(safeTopic ? { topic: safeTopic } : {}),
          ...options,
          ...(safeTopic ? { topic: safeTopic } : {}),
        }
      );

      return {
        success: true,
        statusCode: response.statusCode || 201,
        headers: response.headers,
      };
    } catch (err) {
      const statusCode = err.statusCode || (err.code ? 500 : 500);
      const isExpired = statusCode === 410 || statusCode === 404;
      const error = new Error(err.message || 'Push delivery failed');
      error.statusCode = statusCode;
      error.isExpired = isExpired;
      error.headers = err.headers;
      error.endpoint = subscription.endpoint;
      throw error;
    }
  }
}

/**
 * In-memory Mock Push Provider for testing and offline development
 */
export class MockPushProvider {
  constructor() {
    this.sentNotifications = [];
    this.failNextPredicate = null;
  }

  async sendNotification(subscription, payload, options = {}) {
    if (this.failNextPredicate) {
      const predicate = this.failNextPredicate;
      this.failNextPredicate = null;
      const failure = predicate(subscription, payload);
      if (failure) {
        const error = new Error(failure.message || 'Simulated push error');
        error.statusCode = failure.statusCode || 500;
        error.isExpired = failure.statusCode === 410 || failure.statusCode === 404;
        throw error;
      }
    }

    const record = {
      subscription: {
        endpoint: subscription.endpoint,
        endpointHash: subscription.endpointHash,
      },
      payload: typeof payload === 'string' ? JSON.parse(payload) : payload,
      options,
      sentAt: new Date(),
    };

    this.sentNotifications.push(record);

    return {
      success: true,
      statusCode: 201,
      mock: true,
    };
  }

  getSentNotifications() {
    return [...this.sentNotifications];
  }

  clear() {
    this.sentNotifications = [];
    this.failNextPredicate = null;
  }

  setFailNext(predicateOrError) {
    if (typeof predicateOrError === 'function') {
      this.failNextPredicate = predicateOrError;
    } else {
      this.failNextPredicate = () => predicateOrError;
    }
  }
}

// In test environment, default to MockPushProvider to prevent uncontrolled network push
let activeProvider = env.NODE_ENV === 'test' ? new MockPushProvider() : new WebPushProvider();

export const getPushProvider = () => activeProvider;

export const setPushProvider = (provider) => {
  activeProvider = provider;
  return activeProvider;
};

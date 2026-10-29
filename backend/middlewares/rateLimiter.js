/**
 * In-Memory Rate Limiter for Login and Sensitive Endpoints
 * Tracks failed attempts or request frequency to prevent abuse.
 */

class RateLimiter {
  constructor(options = {}) {
    this.windowMs = options.windowMs || 15 * 60 * 1000;
    this.maxAttempts = options.maxAttempts || 5;
    this.keyGenerator = options.keyGenerator || null;
    this.countAllRequests = Boolean(options.countAllRequests);
    this.hits = new Map();

    // Periodic cleanup of expired records every 5 minutes
    this.cleanupInterval = setInterval(() => this.cleanup(), 5 * 60 * 1000);
    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }
  }

  cleanup() {
    const now = Date.now();
    for (const [key, record] of this.hits.entries()) {
      if (now > record.resetTime) {
        this.hits.delete(key);
      }
    }
  }

  getKey(req) {
    if (this.keyGenerator) {
      return this.keyGenerator(req);
    }
    const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    const email = req.body && typeof req.body.email === 'string'
      ? req.body.email.trim().toLowerCase()
      : '';
    return `${ip}:${email}`;
  }

  middleware() {
    return (req, res, next) => {
      const key = this.getKey(req);
      const now = Date.now();
      const record = this.hits.get(key);

      if (record && now < record.resetTime) {
        if (record.count >= this.maxAttempts) {
          const retryAfterSeconds = Math.max(1, Math.ceil((record.resetTime - now) / 1000));
          res.setHeader('Retry-After', retryAfterSeconds);
          return res.status(429).json({
            error: {
              code: 'RATE_LIMIT_EXCEEDED',
              message: `Rate limit exceeded. Please retry after ${retryAfterSeconds} seconds.`,
            },
          });
        }
      }

      if (this.countAllRequests) {
        if (!record || now > record.resetTime) {
          this.hits.set(key, { count: 1, resetTime: now + this.windowMs });
        } else {
          record.count += 1;
        }
      }

      // Attach increment and reset helpers to request
      req.rateLimiter = {
        recordFailure: () => {
          const currentNow = Date.now();
          const rec = this.hits.get(key);
          if (!rec || currentNow > rec.resetTime) {
            this.hits.set(key, { count: 1, resetTime: currentNow + this.windowMs });
          } else {
            rec.count += 1;
          }
        },
        recordSuccess: () => {
          this.hits.delete(key);
        },
      };

      next();
    };
  }

  reset() {
    this.hits.clear();
  }
}

export const loginRateLimiter = new RateLimiter({
  windowMs: 15 * 60 * 1000,
  maxAttempts: 5,
});

export const locationUpdateRateLimiter = new RateLimiter({
  windowMs: 10 * 1000, // 10-second window
  maxAttempts: 30, // Max 30 updates per 10s (3/sec)
  countAllRequests: true,
  keyGenerator: (req) => {
    const driverId = req.user ? req.user._id.toString() : 'anon';
    const tripId = req.params?.id || 'unknown';
    return `location:${driverId}:${tripId}`;
  },
});

export const subscriberLocationRateLimiter = new RateLimiter({
  windowMs: 10 * 1000,
  maxAttempts: 20, // Max 2 updates per second
  countAllRequests: true,
  keyGenerator: (req) => {
    return req.headers['x-endpoint-hash'] || req.body?.endpointHash || req.ip;
  },
});


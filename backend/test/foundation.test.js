import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { app } from '../server.js';
import { loginRateLimiter } from '../middlewares/rateLimiter.js';

describe('Phase B1: Foundation & Infrastructure Checks', () => {
  let server;
  let baseUrl;

  before(async () => {
    await new Promise((resolve) => {
      server = app.listen(0, () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  it('GET /health returns 200 OK with service identifier and timestamp', async () => {
    const res = await fetch(`${baseUrl}/health`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.status, 'ok');
    assert.equal(data.service, 'amburoute-backend');
    assert.ok(data.timestamp);
  });

  it('GET /api/v1/health returns 200 OK versioned health check', async () => {
    const res = await fetch(`${baseUrl}/api/v1/health`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.status, 'ok');
  });

  it('GET /ready returns accurate readiness status according to DB connectivity', async () => {
    const res = await fetch(`${baseUrl}/ready`);
    // Status should be 200 (connected) or 503 (disconnected)
    assert.ok(res.status === 200 || res.status === 503);
    const data = await res.json();
    assert.ok(data.status === 'ready' || data.status === 'not_ready');
    assert.ok(data.database === 'connected' || data.database === 'disconnected');
  });

  it('Unknown routes return 404 with standardized error format conforming to docs/API.md', async () => {
    const res = await fetch(`${baseUrl}/api/v1/nonexistent-route`);
    assert.equal(res.status, 404);
    const body = await res.json();
    assert.ok(body.error);
    assert.equal(body.error.code, 'NOT_FOUND');
    assert.match(body.error.message, /Resource not found/);
  });

  it('OPTIONS preflight returns 200 with required CORS headers', async () => {
    const res = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'OPTIONS',
    });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('access-control-allow-origin'), '*');
    assert.ok(res.headers.get('access-control-allow-methods').includes('POST'));
    assert.ok(res.headers.get('access-control-allow-headers').includes('Authorization'));
  });

  it('Rate limiter blocks excessive failed login attempts with HTTP 429 and Retry-After', async () => {
    loginRateLimiter.reset();

    // Send 5 failed login attempts with invalid input (triggers 400 and records failure)
    for (let i = 0; i < 5; i++) {
      const res = await fetch(`${baseUrl}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'brute@amburoute.test', password: '' }),
      });
      assert.ok(res.status === 400 || res.status === 429);
    }

    // 6th attempt must be rejected with 429 RATE_LIMIT_EXCEEDED
    const blockedRes = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'brute@amburoute.test', password: '' }),
    });

    assert.equal(blockedRes.status, 429);
    assert.ok(blockedRes.headers.get('retry-after'));
    const body = await blockedRes.json();
    assert.equal(body.error.code, 'RATE_LIMIT_EXCEEDED');

    // Clean up rate limiter
    loginRateLimiter.reset();
  });
});

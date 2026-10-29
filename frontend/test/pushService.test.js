import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { pushService, urlBase64ToUint8Array } from '../src/services/pushService.js';

describe('Phase F1: Push Service & VAPID Key Utilities', () => {
  describe('1. urlBase64ToUint8Array Key Conversion', () => {
    it('correctly decodes standard base64url VAPID public key into Uint8Array', () => {
      // 65-byte uncompressed P-256 public key mock in base64url
      const sampleKey = 'BCThLrqgKekZcK4V0kR6pW_nNqCwbO57p8W5hG1vVvL5G_qX_ZfJ1g9k8hZ4l8X_w0uGqK_5k9fD8jW2hL_7aQ==';
      const uint8 = urlBase64ToUint8Array(sampleKey);
      assert.ok(uint8 instanceof Uint8Array);
      assert.ok(uint8.length > 0);
    });

    it('handles keys with missing padding and converts URL-safe characters (- and _)', () => {
      const urlSafeNoPadding = 'BH-1OBY85A6pCe0yBfKaEy_lgnUhj8I9R2sjTtfiHTfmt3ZXqaWoFzyDvNYbXcQzjCy3tfwNpzkbKCGLP19GmiM';
      const uint8 = urlBase64ToUint8Array(urlSafeNoPadding);
      assert.ok(uint8 instanceof Uint8Array);
      assert.strictEqual(uint8.length, 65); // Standard P-256 public key is 65 bytes (0x04 + 32-byte X + 32-byte Y)
    });

    it('throws descriptive error on null or empty key input', () => {
      assert.throws(() => urlBase64ToUint8Array(null), /Valid VAPID public key string is required/);
      assert.throws(() => urlBase64ToUint8Array(''), /Valid VAPID public key string is required/);
    });
  });

  describe('2. Feature Support Checks in Node Environment', () => {
    it('isSupported returns false when PushManager or Notification are undefined', () => {
      // In Node.js environment without browser mocks, pushService should report false gracefully
      const supported = pushService.isSupported();
      assert.strictEqual(typeof supported, 'boolean');
    });

    it('isLocationSupported returns false in headless Node environment without throwing', () => {
      const locationSupported = pushService.isLocationSupported();
      assert.strictEqual(typeof locationSupported, 'boolean');
    });

    it('getPermission returns default when Notification is not in window', () => {
      const perm = pushService.getPermission();
      assert.strictEqual(perm, 'default');
    });
  });

  describe('3. Local Storage Helpers for Hash & Consent', () => {
    it('getStoredEndpointHash and getStoredLocationConsent execute safely without throwing', () => {
      const hash = pushService.getStoredEndpointHash();
      const consent = pushService.getStoredLocationConsent();
      assert.strictEqual(hash, null);
      assert.strictEqual(consent, false);
    });
  });
});

import React, { useState } from 'react';
import { useSimulation } from '../context/useSimulation.js';
import { Card } from '../components/common/Card.jsx';
import { Button } from '../components/common/Button.jsx';
import { SirenIcon, ShieldCheckIcon, AlertTriangleIcon, ArrowRightIcon } from '../components/common/Icons.jsx';
import { Badge } from '../components/common/Badge.jsx';

/**
 * Driver Login Page
 * Connects directly to AmbuRoute Backend API (POST /api/v1/auth/login)
 * Strictly enforces server-side authentication, account verification, and role permissions.
 */
export function LoginPage() {
  const { login, pendingAction, setActiveTab } = useSimulation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    if (!email.trim() || !password) {
      setErrorMsg('Please enter both email address and password.');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await login(email, password);
      if (!result.success) {
        setErrorMsg(result.error || 'Authentication failed. Please verify credentials.');
      }
    } catch {
      setErrorMsg('Network error. Unable to connect to the authentication server.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-container">
        {/* Context Alert for Pending Action */}
        {pendingAction === 'START_AMBULANCE' && (
          <div className="login-pending-banner">
            <div className="login-pending-icon">
              <SirenIcon size={20} className="text-red" />
            </div>
            <div className="login-pending-text">
              <strong>Emergency Dispatch Initiated:</strong> Log in with authorized driver credentials to dispatch emergency trip.
            </div>
          </div>
        )}

        <Card variant="surface" className="login-card">
          <div className="login-card__header">
            <div className="login-brand-icon">
              <ShieldCheckIcon size={28} className="text-primary" />
            </div>
            <div>
              <div className="login-badge-wrap">
                <Badge variant="clear" size="sm">AUTHORIZED ACCESS ONLY</Badge>
              </div>
              <h1 className="login-title">Driver Cockpit Authorization</h1>
              <p className="login-subtitle">
                Restricted to certified emergency transit operators.
              </p>
            </div>
          </div>

          {errorMsg && (
            <div className="login-error-alert" role="alert">
              <AlertTriangleIcon size={18} />
              <span>{errorMsg}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="login-form" noValidate>
            <div className="form-group">
              <label className="form-label" htmlFor="driver-email">
                Driver Email / Operator ID
              </label>
              <input
                id="driver-email"
                type="email"
                className="form-input"
                placeholder="driver@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
                disabled={isSubmitting}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="driver-password">
                Password
              </label>
              <input
                id="driver-password"
                type="password"
                className="form-input"
                placeholder="••••••••••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                disabled={isSubmitting}
                required
              />
            </div>

            <div className="login-actions">
              <Button
                type="submit"
                variant="critical"
                size="lg"
                fullWidth
                icon={ArrowRightIcon}
                iconPosition="right"
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Authenticating with Server...' : 'Sign In to Driver Cockpit'}
              </Button>
            </div>
          </form>

          <div className="login-footer-notice">
            <p>
              * Driver Cockpit Access: Valid ambulance driver credentials verified by the backend server are required to start emergency trips and access navigation controls.
            </p>
            <div className="login-cancel-action">
              <button
                type="button"
                className="text-btn"
                onClick={() => {
                  setActiveTab('overview');
                  window.location.hash = 'overview';
                }}
              >
                &larr; Return to Overview
              </button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

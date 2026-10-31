import React, { useState, useEffect } from 'react';
import { useSimulation } from '../context/useSimulation.js';
import { Card } from '../components/common/Card.jsx';
import { Button } from '../components/common/Button.jsx';
import {
  SirenIcon,
  ShieldCheckIcon,
  AlertTriangleIcon,
  ArrowRightIcon,
  CheckCircleIcon,
  RadioIcon,
} from '../components/common/Icons.jsx';
import { Badge } from '../components/common/Badge.jsx';

/**
 * LoginPage: Unified Role-Aware Authentication Gateway
 *
 * Supports:
 * 1. Public Citizen Login (PUBLIC_USER) -> Routes to /#public
 * 2. Public Citizen Registration (Auto PUBLIC_USER, status: active) -> Routes to /#public
 * 3. Verified Ambulance Driver Authorization (AMBULANCE_DRIVER) -> Routes to /#driver/home
 */
export function LoginPage() {
  const { login, register, pendingAction, setActiveTab } = useSimulation();

  // 'public_login' | 'public_register' | 'driver_login'
  const [authMode, setAuthMode] = useState(() =>
    pendingAction === 'START_AMBULANCE' ? 'driver_login' : 'public_login'
  );

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (pendingAction === 'START_AMBULANCE') {
      setAuthMode('driver_login');
    }
  }, [pendingAction]);

  const switchMode = (mode) => {
    setAuthMode(mode);
    setErrorMsg('');
    setSuccessMsg('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (authMode === 'public_register') {
      if (!name.trim()) {
        setErrorMsg('Please enter your full name.');
        return;
      }
      if (!email.trim() || !password) {
        setErrorMsg('Please enter both email address and password.');
        return;
      }
      if (password.length < 8) {
        setErrorMsg('Password must be at least 8 characters long.');
        return;
      }

      setIsSubmitting(true);
      try {
        const result = await register(name.trim(), email.trim(), password);
        if (!result.success) {
          setErrorMsg(result.error || 'Registration failed. Please try again.');
        }
      } catch {
        setErrorMsg('Network error. Unable to connect to registration server.');
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    // Login for both public user and driver
    if (!email.trim() || !password) {
      setErrorMsg('Please enter both email address and password.');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await login(email.trim(), password);
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
        {/* Context Alert for Pending Driver Action */}
        {pendingAction === 'START_AMBULANCE' && (
          <div className="login-pending-banner">
            <div className="login-pending-icon">
              <SirenIcon size={20} className="text-red" />
            </div>
            <div className="login-pending-text">
              <strong>Emergency Dispatch Initiated:</strong> Authorized driver credentials required to start active emergency corridor transit.
            </div>
          </div>
        )}

        <Card variant="surface" className="login-card">
          {/* Role Navigation Switcher Tabs */}
          <div className="login-tab-bar" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={authMode === 'public_login'}
              className={`login-tab-btn ${authMode === 'public_login' ? 'is-active' : ''}`}
              onClick={() => switchMode('public_login')}
            >
              Public Sign In
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={authMode === 'public_register'}
              className={`login-tab-btn ${authMode === 'public_register' ? 'is-active' : ''}`}
              onClick={() => switchMode('public_register')}
            >
              New Citizen Register
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={authMode === 'driver_login'}
              className={`login-tab-btn ${authMode === 'driver_login' ? 'is-active is-driver-tab' : ''}`}
              onClick={() => switchMode('driver_login')}
            >
              Driver Cockpit
            </button>
          </div>

          <div className="login-card__header">
            <div className="login-brand-icon">
              {authMode === 'driver_login' ? (
                <ShieldCheckIcon size={28} className="text-primary" />
              ) : (
                <RadioIcon size={28} className="text-primary" />
              )}
            </div>
            <div>
              <div className="login-badge-wrap">
                <Badge
                  variant={authMode === 'driver_login' ? 'critical' : 'clear'}
                  size="sm"
                >
                  {authMode === 'driver_login'
                    ? 'VERIFIED DRIVERS ONLY'
                    : authMode === 'public_register'
                    ? 'JOIN COMMUNITY NETWORK'
                    : 'CITIZEN ACCESS'}
                </Badge>
              </div>
              <h1 className="login-title">
                {authMode === 'driver_login'
                  ? 'Ambulance Driver Cockpit'
                  : authMode === 'public_register'
                  ? 'Create Citizen Account'
                  : 'Public Network Sign In'}
              </h1>
              <p className="login-subtitle">
                {authMode === 'driver_login'
                  ? 'Restricted to certified emergency transit operators.'
                  : authMode === 'public_register'
                  ? 'Receive live corridor alerts and contribute road observations.'
                  : 'Access your community dashboard, notifications, and road reports.'}
              </p>
            </div>
          </div>

          {errorMsg && (
            <div className="login-error-alert" role="alert">
              <AlertTriangleIcon size={18} />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="login-success-alert" role="status">
              <CheckCircleIcon size={18} />
              <span>{successMsg}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="login-form" noValidate>
            {authMode === 'public_register' && (
              <div className="form-group">
                <label className="form-label" htmlFor="user-name">
                  Full Name
                </label>
                <input
                  id="user-name"
                  type="text"
                  className="form-input"
                  placeholder="e.g. Jane Citizen"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                  disabled={isSubmitting}
                  required
                />
              </div>
            )}

            <div className="form-group">
              <label className="form-label" htmlFor="login-email">
                {authMode === 'driver_login' ? 'Driver Email / Operator ID' : 'Email Address'}
              </label>
              <input
                id="login-email"
                type="email"
                className="form-input"
                placeholder={authMode === 'driver_login' ? 'driver@example.com' : 'citizen@example.com'}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                disabled={isSubmitting}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="login-password">
                Password {authMode === 'public_register' && <span className="text-muted">(Min. 8 characters)</span>}
              </label>
              <input
                id="login-password"
                type="password"
                className="form-input"
                placeholder="••••••••••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={authMode === 'public_register' ? 'new-password' : 'current-password'}
                disabled={isSubmitting}
                required
              />
            </div>

            <div className="login-actions">
              <Button
                type="submit"
                variant={authMode === 'driver_login' ? 'critical' : 'primary'}
                size="lg"
                fullWidth
                icon={ArrowRightIcon}
                iconPosition="right"
                disabled={isSubmitting}
              >
                {isSubmitting
                  ? 'Connecting to Server...'
                  : authMode === 'public_register'
                  ? 'Create Citizen Account'
                  : authMode === 'driver_login'
                  ? 'Sign In to Driver Cockpit'
                  : 'Sign In to Public Network'}
              </Button>
            </div>
          </form>

          <div className="login-footer-notice">
            <p>
              {authMode === 'driver_login'
                ? '* Driver Cockpit Access: Valid ambulance driver credentials verified by hospital authorities are required to start emergency trips.'
                : '* Public Citizen Network: Registered public users receive global ambulance dispatch alerts and submit verified road traffic observations.'}
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

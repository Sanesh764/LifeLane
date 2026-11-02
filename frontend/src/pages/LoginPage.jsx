import React, { useState, useEffect, useCallback } from 'react';
import { useSimulation } from '../context/useSimulation.js';
import { API_BASE_URL } from '../services/api.js';
import { Card } from '../components/common/Card.jsx';
import { Button } from '../components/common/Button.jsx';
import {
  SirenIcon,
  ShieldCheckIcon,
  AlertTriangleIcon,
  ArrowRightIcon,
  CheckCircleIcon,
  RadioIcon,
  GoogleIcon,
} from '../components/common/Icons.jsx';
import { Badge } from '../components/common/Badge.jsx';

/**
 * LoginPage: Unified Role-Aware Authentication Gateway
 *
 * Supports:
 * 1. Public Citizen Login (PUBLIC_USER) -> Routes to /#public
 * 2. Public Citizen Registration (Auto PUBLIC_USER, status: active) -> Routes to /#public
 * 3. Verified Ambulance Driver Authorization (AMBULANCE_DRIVER) -> Routes to /#driver/home
 * 4. Google Sign-In & Sign-Up (Exclusively for PUBLIC_USER citizen accounts)
 */
export function LoginPage() {
  const { login, register, getGoogleAuthUrl, pendingAction, setActiveTab, setDriverSubTab } = useSimulation();

  // 'public_login' | 'public_register' | 'driver_login'
  const [authMode, setAuthMode] = useState(() => {
    if (pendingAction === 'START_AMBULANCE') return 'driver_login';
    if (typeof window !== 'undefined') {
      const hash = window.location.hash.toLowerCase();
      if (hash.includes('driver')) return 'driver_login';
      if (hash.includes('register') || hash.includes('signup')) return 'public_register';
    }
    return 'public_login';
  });

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  // Check URL query parameters for redirect errors (e.g. from cancelled or denied Google OAuth)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const fullHash = window.location.hash || '';
        const queryIndex = fullHash.indexOf('?');
        const searchStr = queryIndex !== -1 ? fullHash.slice(queryIndex) : window.location.search;
        if (searchStr) {
          const params = new URLSearchParams(searchStr);
          const err = params.get('error');
          const code = params.get('code');
          if (err) {
            if (code === 'GOOGLE_AUTH_ROLE_RESTRICTED') {
              setErrorMsg('Google Sign-In is restricted to public citizens. Verified ambulance drivers must use Driver Cockpit credentials.');
            } else if (code === 'GOOGLE_AUTH_CANCELLED') {
              setErrorMsg('Google sign-in was cancelled.');
            } else {
              setErrorMsg(err);
            }
            // Clean URL query string safely using replaceState
            const cleanHash = fullHash.split('?')[0] || '#login';
            window.history.replaceState(null, '', window.location.pathname + cleanHash);
          }
        }
      } catch (parseErr) {
        console.warn('[LoginPage] Error parsing URL parameters:', parseErr);
      }
    }
  }, []);

  useEffect(() => {
    if (pendingAction === 'START_AMBULANCE') {
      setAuthMode('driver_login');
    } else if (typeof window !== 'undefined') {
      const hash = window.location.hash.toLowerCase();
      if (hash.includes('driver')) {
        setAuthMode('driver_login');
      } else if (hash.includes('register') || hash.includes('signup')) {
        setAuthMode('public_register');
      }
    }
  }, [pendingAction]);

  const switchMode = (mode) => {
    setAuthMode(mode);
    setErrorMsg('');
    setSuccessMsg('');
  };

  const handleGoogleSignIn = useCallback(async () => {
    if (isGoogleLoading || isSubmitting) return;

    setIsGoogleLoading(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const targetOrigin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173';
      const result = await getGoogleAuthUrl(targetOrigin);

      if (result.success && result.url) {
        // Full page redirect to Google consent screen
        window.location.href = result.url;
      } else {
        // Direct top-level navigation fallback (immune to third-party cookie restrictions)
        window.location.href = `${API_BASE_URL}/auth/google?redirectUrl=${encodeURIComponent(targetOrigin)}`;
      }
    } catch (err) {
      console.warn('[LoginPage] Fetching Google auth URL failed, falling back to top-level navigation:', err);
      const targetOrigin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173';
      window.location.href = `${API_BASE_URL}/auth/google?redirectUrl=${encodeURIComponent(targetOrigin)}`;
    }
  }, [isGoogleLoading, isSubmitting, getGoogleAuthUrl]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (authMode === 'public_register') {
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
        const derivedName = name.trim() || email.trim().split('@')[0];
        const result = await register(derivedName, email.trim(), password);
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
      const isPublic = authMode === 'public_login';
      const result = await login(email.trim(), password, { allowPublic: isPublic });
      if (result.success) {
        if (!isPublic) {
          setActiveTab('driver');
          setDriverSubTab('home');
          window.location.hash = 'driver/home';
        } else {
          setActiveTab('public');
          window.location.hash = 'public';
        }
      } else {
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
                disabled={isSubmitting || isGoogleLoading}
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

            {/* Google Authentication (Strictly for Public Citizen Accounts) */}
            {authMode !== 'driver_login' && (
              <>
                <div className="login-divider">
                  <span>{authMode === 'public_register' ? 'or sign up with' : 'or continue with'}</span>
                </div>

                <div className="google-auth-wrap">
                  <button
                    type="button"
                    className="btn-google-auth"
                    onClick={handleGoogleSignIn}
                    disabled={isSubmitting || isGoogleLoading}
                    aria-label={authMode === 'public_register' ? 'Sign up with Google' : 'Continue with Google'}
                  >
                    {isGoogleLoading ? (
                      <span className="google-btn-spinner" aria-hidden="true" />
                    ) : (
                      <GoogleIcon size={18} />
                    )}
                    <span>
                      {isGoogleLoading
                        ? 'Connecting to Google...'
                        : authMode === 'public_register'
                        ? 'Sign up with Google'
                        : 'Continue with Google'}
                    </span>
                  </button>
                </div>
              </>
            )}

            <div className="login-mode-switch" style={{ marginTop: '1rem', textAlign: 'center', fontSize: '0.875rem' }}>
              {authMode === 'public_login' && (
                <p style={{ margin: 0 }}>
                  Don't have an account yet?{' '}
                  <button
                    type="button"
                    onClick={() => switchMode('public_register')}
                    style={{ background: 'none', border: 'none', color: '#dc2626', fontWeight: 600, cursor: 'pointer', textDecoration: 'underline' }}
                  >
                    Sign Up / Register Here
                  </button>
                </p>
              )}
              {authMode === 'public_register' && (
                <p style={{ margin: 0 }}>
                  Already have an account?{' '}
                  <button
                    type="button"
                    onClick={() => switchMode('public_login')}
                    style={{ background: 'none', border: 'none', color: '#dc2626', fontWeight: 600, cursor: 'pointer', textDecoration: 'underline' }}
                  >
                    Sign In to Existing Account
                  </button>
                </p>
              )}
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

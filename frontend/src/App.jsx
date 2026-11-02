import React, { useEffect, useState, useRef } from 'react';
import './App.css';
import { SimulationProvider } from './context/SimulationContext.jsx';
import { useSimulation } from './context/useSimulation.js';
import { authService } from './services/authService.js';
import { Header } from './components/layout/Header.jsx';
import { Footer } from './components/layout/Footer.jsx';
import { EmergencyBanner } from './components/layout/EmergencyBanner.jsx';
import { OverviewPage } from './pages/OverviewPage.jsx';
import { PublicDashboardPage } from './pages/PublicDashboardPage.jsx';
import { DriverPage } from './pages/DriverPage.jsx';
import { LoginPage } from './pages/LoginPage.jsx';
import { RoadUserPage } from './pages/RoadUserPage.jsx';
import { TrafficReportPage } from './pages/TrafficReportPage.jsx';
import { ToastContainer } from './components/common/Toast.jsx';
import { ErrorBoundary } from './components/common/ErrorBoundary.jsx';
import { Button } from './components/common/Button.jsx';
import { AlertTriangleIcon } from './components/common/Icons.jsx';

function AppContent() {
  const {
    activeTab,
    setActiveTab,
    setDriverSubTab,
    isAuthenticated,
    isDriverAuthenticated,
    isAuthLoading,
    toasts,
    dismissToast,
    exchangeOAuthTicket,
  } = useSimulation();

  const [oauthStatus, setOauthStatus] = useState(null); // null | 'processing' | 'error'
  const [oauthError, setOauthError] = useState('');
  const hasExchangedRef = useRef(false);

  // Automatically transition away from login view once driver is authenticated
  useEffect(() => {
    if (activeTab === 'login' && isDriverAuthenticated) {
      setActiveTab('driver');
      setDriverSubTab('home');
      window.location.hash = 'driver/home';
    }
  }, [activeTab, isDriverAuthenticated, setActiveTab, setDriverSubTab]);

  // Listen to hash changes for robust browser navigation & direct links
  useEffect(() => {
    async function handleHashChange() {
      const rawHash = (window.location.hash || '').replace('#', '');
      const hashPath = rawHash.split('?')[0].toLowerCase();
      const parts = hashPath.split('/');
      const mainTab = parts[0];
      const subTab = parts[1];

      // Handle Google OAuth Callback (#oauth_callback?ticket=XYZ)
      if (mainTab === 'oauth_callback') {
        const queryIndex = rawHash.indexOf('?');
        const queryPart = queryIndex !== -1 ? rawHash.slice(queryIndex + 1) : '';
        const params = new URLSearchParams(queryPart);
        const ticket = params.get('ticket');

        if (ticket && !hasExchangedRef.current) {
          hasExchangedRef.current = true;
          setOauthStatus('processing');
          // Immediately scrub the ticket from the browser address bar for security
          window.history.replaceState(null, '', window.location.pathname + '#oauth_callback');

          try {
            const result = await exchangeOAuthTicket(ticket);
            if (result.success) {
              setOauthStatus(null);
              setOauthError('');
              // Successful exchange routes to public dashboard
              setActiveTab('public');
              window.location.hash = 'public';
            } else {
              setOauthStatus('error');
              setOauthError(result.error || 'Google authentication was not completed.');
            }
          } catch (err) {
            setOauthStatus('error');
            setOauthError('An unexpected network error occurred while verifying your Google session.');
          }
          return;
        }

        // If no ticket is present and not currently processing/error, route back to login
        if (!ticket && oauthStatus !== 'processing' && oauthStatus !== 'error') {
          setActiveTab('login');
          window.location.hash = 'login';
          return;
        }
        return;
      }

      if (mainTab === 'driver') {
        // While checking backend session, avoid prematurely redirecting to login
        if (isAuthLoading) {
          setActiveTab('driver');
          return;
        }

        // Check both React state and synchronously stored session to avoid 1-tick state race condition
        const isDriver = isDriverAuthenticated || authService.getCurrentUser()?.authorized;
        if (!isDriver) {
          setActiveTab('login');
          window.location.hash = 'login/driver';
        } else {
          setActiveTab('driver');
          const validSubTabs = ['home', 'start', 'active', 'history', 'traffic', 'notifications', 'settings'];
          if (subTab && validSubTabs.includes(subTab)) {
            setDriverSubTab(subTab);
          } else {
            setDriverSubTab('home');
            window.location.hash = 'driver/home';
          }
        }
      } else if (mainTab === 'public' || mainTab === 'dashboard') {
        setActiveTab('public');
      } else if (['overview', 'alerts', 'report', 'login', 'register', 'signup'].includes(mainTab)) {
        setActiveTab(mainTab === 'register' || mainTab === 'signup' ? 'login' : mainTab);
      }
    }

    if (window.location.hash) {
      handleHashChange();
    } else {
      window.location.hash = 'overview';
    }

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [setActiveTab, setDriverSubTab, isAuthenticated, isDriverAuthenticated, isAuthLoading, exchangeOAuthTicket, oauthStatus]);

  return (
    <div className="app-shell">
      <EmergencyBanner />
      <Header />
      <main className="app-main">
        <div className="app-main__container">
          <ErrorBoundary>
            {oauthStatus === 'processing' && (
              <div className="oauth-callback-container" role="status" aria-live="polite">
                <div className="oauth-callback-card">
                  <div className="oauth-callback-spinner" />
                  <h2 className="oauth-callback-title">Completing Google Sign-In</h2>
                  <p className="oauth-callback-text">
                    Verifying single-use ticket and establishing secure citizen session...
                  </p>
                </div>
              </div>
            )}
            {oauthStatus === 'error' && (
              <div className="oauth-callback-container" role="alert">
                <div className="oauth-callback-card is-error">
                  <div className="oauth-callback-error-icon">
                    <AlertTriangleIcon size={32} />
                  </div>
                  <h2 className="oauth-callback-title">Google Authentication Failed</h2>
                  <p className="oauth-callback-text">{oauthError || 'Google authentication could not be completed.'}</p>
                  <Button
                    variant="primary"
                    size="md"
                    onClick={() => {
                      setOauthStatus(null);
                      setOauthError('');
                      hasExchangedRef.current = false;
                      setActiveTab('login');
                      window.location.hash = 'login';
                    }}
                  >
                    Return to Citizen Sign In
                  </Button>
                </div>
              </div>
            )}
            {oauthStatus === null && (
              <>
                {activeTab === 'overview' && <OverviewPage />}
                {activeTab === 'public' && <PublicDashboardPage />}
                {activeTab === 'driver' && (
                  isAuthLoading ? (
                    <div className="auth-loading-container" role="status" aria-live="polite">
                      <div className="auth-loading-spinner" />
                      <p className="auth-loading-text">Verifying driver authorization...</p>
                    </div>
                  ) : isDriverAuthenticated ? (
                    <DriverPage />
                  ) : (
                    <LoginPage />
                  )
                )}
                {activeTab === 'login' && <LoginPage />}
                {activeTab === 'alerts' && <RoadUserPage />}
                {activeTab === 'report' && <TrafficReportPage />}
              </>
            )}
          </ErrorBoundary>
        </div>
      </main>
      <Footer />
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}

export default function App() {
  return (
    <SimulationProvider>
      <AppContent />
    </SimulationProvider>
  );
}

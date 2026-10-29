import React, { useEffect } from 'react';
import './App.css';
import { SimulationProvider } from './context/SimulationContext.jsx';
import { useSimulation } from './context/useSimulation.js';
import { Header } from './components/layout/Header.jsx';
import { Footer } from './components/layout/Footer.jsx';
import { OverviewPage } from './pages/OverviewPage.jsx';
import { DriverPage } from './pages/DriverPage.jsx';
import { LoginPage } from './pages/LoginPage.jsx';
import { RoadUserPage } from './pages/RoadUserPage.jsx';
import { TrafficReportPage } from './pages/TrafficReportPage.jsx';
import { ToastContainer } from './components/common/Toast.jsx';
import { ErrorBoundary } from './components/common/ErrorBoundary.jsx';

function AppContent() {
  const {
    activeTab,
    setActiveTab,
    setDriverSubTab,
    isAuthenticated,
    isAuthLoading,
    toasts,
    dismissToast,
  } = useSimulation();

  // Listen to hash changes for robust browser navigation & direct links
  useEffect(() => {
    function handleHashChange() {
      const fullHash = window.location.hash.replace('#', '').toLowerCase();
      const parts = fullHash.split('/');
      const mainTab = parts[0];
      const subTab = parts[1];

      if (mainTab === 'driver') {
        // While checking backend session, avoid prematurely redirecting to login
        if (isAuthLoading) {
          setActiveTab('driver');
          return;
        }

        if (!isAuthenticated) {
          setActiveTab('login');
          window.location.hash = 'login';
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
      } else if (['overview', 'alerts', 'report', 'login'].includes(mainTab)) {
        setActiveTab(mainTab);
      }
    }

    if (window.location.hash) {
      handleHashChange();
    } else {
      window.location.hash = 'overview';
    }

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [setActiveTab, setDriverSubTab, isAuthenticated, isAuthLoading]);

  return (
    <div className="app-shell">
      <Header />
      <main className="app-main">
        <div className="app-main__container">
          <ErrorBoundary>
            {activeTab === 'overview' && <OverviewPage />}
            {activeTab === 'driver' && (
              isAuthLoading ? (
                <div className="auth-loading-container" role="status" aria-live="polite">
                  <div className="auth-loading-spinner" />
                  <p className="auth-loading-text">Verifying driver authorization...</p>
                </div>
              ) : isAuthenticated ? (
                <DriverPage />
              ) : (
                <LoginPage />
              )
            )}
            {activeTab === 'login' && <LoginPage />}
            {activeTab === 'alerts' && <RoadUserPage />}
            {activeTab === 'report' && <TrafficReportPage />}
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

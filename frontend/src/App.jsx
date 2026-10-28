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

function AppContent() {
  const { activeTab, setActiveTab, isAuthenticated, toasts, dismissToast } = useSimulation();

  // Listen to hash changes for robust browser navigation & direct links
  useEffect(() => {
    function handleHashChange() {
      const hash = window.location.hash.replace('#', '').toLowerCase();
      if (['overview', 'driver', 'alerts', 'report', 'login'].includes(hash)) {
        if (hash === 'driver' && !isAuthenticated) {
          setActiveTab('login');
          window.location.hash = 'login';
        } else {
          setActiveTab(hash);
        }
      }
    }

    if (window.location.hash) {
      handleHashChange();
    } else {
      window.location.hash = 'overview';
    }

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [setActiveTab, isAuthenticated]);

  return (
    <div className="app-shell">
      <Header />
      <main className="app-main">
        <div className="app-main__container">
          {activeTab === 'overview' && <OverviewPage />}
          {activeTab === 'driver' && (isAuthenticated ? <DriverPage /> : <LoginPage />)}
          {activeTab === 'login' && <LoginPage />}
          {activeTab === 'alerts' && <RoadUserPage />}
          {activeTab === 'report' && <TrafficReportPage />}
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

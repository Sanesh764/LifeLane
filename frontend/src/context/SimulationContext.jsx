import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  DEMO_DESTINATIONS,
  DEMO_VEHICLES,
  INITIAL_ROUTE,
  ALTERNATIVE_ROUTE,
  INITIAL_TRAFFIC_REPORTS,
} from '../services/mockData.js';
import { voiceService } from '../services/voiceService.js';
import { authService } from '../services/authService.js';
import { SimulationContext } from './simulationContextInstance.js';

export function SimulationProvider({ children }) {
  // Navigation / Active View
  const [activeTab, setActiveTab] = useState('overview'); // 'overview', 'driver', 'alerts', 'report', 'login'
  const [pendingAction, setPendingAction] = useState(null); // 'START_AMBULANCE' | null

  // Authentication State
  const [currentUser, setCurrentUser] = useState(() => authService.getCurrentUser());
  const isAuthenticated = Boolean(currentUser && currentUser.authorized);

  // Driver & Trip State
  const [selectedVehicle, setSelectedVehicle] = useState(DEMO_VEHICLES[0]);
  const [selectedDestination, setSelectedDestination] = useState(DEMO_DESTINATIONS[0]);
  const [tripStatus, setTripStatus] = useState('IDLE'); // 'IDLE', 'ACTIVE', 'COMPLETED'
  const [tripStartTime, setTripStartTime] = useState(null);
  const [currentRoute, setCurrentRoute] = useState(INITIAL_ROUTE);
  const [currentSegmentIdx, setCurrentSegmentIdx] = useState(0);
  const currentSpeedKmh = 48;

  // Recommendations
  const [activeRecommendation, setActiveRecommendation] = useState(null);
  const [recommendationDecision, setRecommendationDecision] = useState(null); // 'ACCEPTED' | 'REJECTED' | null

  // Traffic Intelligence & Incident Selection
  const [trafficReports, setTrafficReports] = useState(INITIAL_TRAFFIC_REPORTS);
  const [selectedIncident, setSelectedIncident] = useState(() => INITIAL_TRAFFIC_REPORTS[0] || null);

  // Map Controls State
  const [mapZoom, setMapZoom] = useState(1);
  const zoomIn = useCallback(() => setMapZoom((prev) => Math.min(prev + 0.25, 2)), []);
  const zoomOut = useCallback(() => setMapZoom((prev) => Math.max(prev - 0.25, 0.75)), []);
  const resetZoom = useCallback(() => setMapZoom(1), []);

  // Road User State (Simulating this participating road user in Patna)
  const [subscriptionPermission, setSubscriptionPermission] = useState('GRANTED'); // 'GRANTED', 'PROMPT', 'DENIED'
  const [isSubscribed, setIsSubscribed] = useState(true);
  const [userCurrentRoad, setUserCurrentRoad] = useState('Bailey Road / Jawaharlal Nehru Marg');

  // Audio / Voice Route Assistance
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  // Feedback Toasts
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((title, message, type = 'info') => {
    const id = Date.now() + Math.random().toString(36).substring(2, 6);
    setToasts((prev) => [...prev, { id, title, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Sync mute state to VoiceService
  useEffect(() => {
    voiceService.setMuted(isMuted);
  }, [isMuted]);

  // Voice Guidance Trigger
  const triggerVoiceGuidance = useCallback((text) => {
    if (isMuted) return;
    setIsSpeaking(true);
    voiceService.speakRecommendation(
      text,
      () => setIsSpeaking(true),
      () => setIsSpeaking(false)
    );
  }, [isMuted]);

  // Handle Starting Emergency Trip
  const startTrip = useCallback(() => {
    if (!authService.isAuthenticated()) {
      addToast(
        'Driver Login Required',
        'Only an authorized ambulance driver can start emergency transit missions.',
        'warning'
      );
      setPendingAction('START_AMBULANCE');
      setActiveTab('login');
      window.location.hash = 'login';
      return false;
    }

    if (tripStatus === 'ACTIVE') {
      addToast('Mission Already Active', 'An emergency mission is already running in this vehicle.', 'info');
      return true;
    }

    setTripStatus('ACTIVE');
    setTripStartTime(new Date());
    setCurrentSegmentIdx(0);
    setCurrentRoute(INITIAL_ROUTE);
    setRecommendationDecision(null);
    setActiveRecommendation(null);
    addToast(
      'Emergency Mission Dispatched',
      `En route to ${selectedDestination.name}. Route-aware broadcast active for Patna corridors (500m radius).`,
      'success'
    );

    triggerVoiceGuidance(`Emergency trip started to ${selectedDestination.shortName || selectedDestination.name}. Monitoring Patna traffic on route.`);
    return true;
  }, [tripStatus, selectedDestination, addToast, triggerVoiceGuidance]);

  // Handle Ending Emergency Trip
  const endTrip = useCallback(() => {
    setTripStatus('COMPLETED');
    voiceService.stop();
    setIsSpeaking(false);
    addToast('Emergency Mission Concluded', 'Trip ended. Active road-user alerts deactivated.', 'info');
  }, [addToast]);

  // Handle Driver Login
  const login = useCallback((email, password) => {
    const result = authService.login(email, password);
    if (result.success) {
      setCurrentUser(result.user);
      addToast('Driver Authenticated', `Welcome back, ${result.user.driverName}. Demo session established.`, 'success');

      // Check if there was a pending start action
      if (pendingAction === 'START_AMBULANCE') {
        setPendingAction(null);
        setTimeout(() => {
          startTrip();
          setActiveTab('driver');
          window.location.hash = 'driver';
        }, 150);
      } else {
        setActiveTab('driver');
        window.location.hash = 'driver';
      }
      return { success: true };
    }
    return { success: false, error: result.error };
  }, [pendingAction, addToast, startTrip]);

  // Handle Driver Logout
  const logout = useCallback(() => {
    if (tripStatus === 'ACTIVE') {
      endTrip();
    }
    authService.logout();
    setCurrentUser(null);
    setPendingAction(null);
    addToast('Logged Out', 'Driver credentials cleared. Direct dashboard access restricted.', 'info');
    setActiveTab('overview');
    window.location.hash = 'overview';
  }, [tripStatus, endTrip, addToast]);

  // Handle Advancing Ambulance Position (Demo Stepper)
  const advanceSegment = useCallback(() => {
    if (tripStatus !== 'ACTIVE') return;

    if (currentSegmentIdx < currentRoute.segments.length - 1) {
      const nextIdx = currentSegmentIdx + 1;
      setCurrentSegmentIdx(nextIdx);
      const nextRoad = currentRoute.segments[nextIdx].roadName;
      addToast('GPS Checkpoint Passed', `Ambulance approaching ${nextRoad}.`, 'info');

      // Trigger alternative recommendation when reaching Dak Bungalow crossing
      if (nextIdx === 1 && currentRoute.id === INITIAL_ROUTE.id && !recommendationDecision) {
        setActiveRecommendation(ALTERNATIVE_ROUTE);
        addToast('Route Recommendation Generated', 'Obstruction on Fraser Road. Reroute via Atal Path available.', 'warning');
        triggerVoiceGuidance('Obstruction reported ahead on Fraser Road. An alternative via Atal Path and JP Ganga Path is available and estimated to save 6 minutes. Please review and confirm.');
      }
    } else {
      endTrip();
    }
  }, [tripStatus, currentSegmentIdx, currentRoute, recommendationDecision, addToast, triggerVoiceGuidance, endTrip]);

  // Driver Confirmation: Accept Alternative Route
  const acceptRecommendation = useCallback(() => {
    if (!activeRecommendation) return;
    setRecommendationDecision('ACCEPTED');
    setCurrentRoute(activeRecommendation);
    setCurrentSegmentIdx(0); // Transition to alternative route
    setActiveRecommendation(null);
    addToast('Alternative Route Confirmed', 'Route recalculated via Atal Path & JP Ganga Path. ETA improved by 6 minutes.', 'success');
    triggerVoiceGuidance('Route changed to JP Ganga Path bypass. Navigation updated.');
  }, [activeRecommendation, addToast, triggerVoiceGuidance]);

  // Driver Confirmation: Reject Alternative Route
  const rejectRecommendation = useCallback(() => {
    setRecommendationDecision('REJECTED');
    setActiveRecommendation(null);
    addToast('Recommendation Dismissed', 'Retaining primary arterial route via Bailey Road as instructed by driver.', 'neutral');
    triggerVoiceGuidance('Alternative dismissed. Continuing on current route.');
  }, [addToast, triggerVoiceGuidance]);

  // Submit Traffic Report
  const submitTrafficReport = useCallback((reportType, roadSegment, description) => {
    const newReport = {
      id: `rep-${Date.now()}`,
      reportType,
      roadSegment: roadSegment || userCurrentRoad,
      locationDescription: description || `Reported near ${roadSegment || userCurrentRoad}, Patna`,
      timestamp: new Date().toISOString(),
      freshness: 'JUST_NOW',
      verifiedCount: 1,
      source: 'Participating Citizen (Patna)',
      status: 'ACTIVE',
    };

    setTrafficReports((prev) => [newReport, ...prev]);
    addToast('Observation Recorded', `Your traffic report for ${newReport.roadSegment} has been submitted for ambulance routing.`, 'success');

    // If report is ROAD_BLOCKED or TRAFFIC_HIGH and relevant to ambulance route, evaluate recommendation
    if (tripStatus === 'ACTIVE' && (reportType === 'ROAD_BLOCKED' || reportType === 'TRAFFIC_HIGH')) {
      if (!recommendationDecision && currentRoute.id === INITIAL_ROUTE.id) {
        setActiveRecommendation(ALTERNATIVE_ROUTE);
        triggerVoiceGuidance('New traffic observation received for your upcoming Patna route. An alternative is ready for review.');
      }
    }
  }, [userCurrentRoad, tripStatus, currentRoute, recommendationDecision, addToast, triggerVoiceGuidance]);

  // Determine if this road user should receive an active ambulance alert
  // Route-Aware Condition:
  // 1. Trip is ACTIVE
  // 2. Road user is SUBSCRIBED and permission is GRANTED
  // 3. User's location is on one of the ambulance's UPCOMING segments (within 500m zone)
  const activeAlertForUser = useMemo(() => {
    if (tripStatus !== 'ACTIVE' || !isSubscribed || subscriptionPermission !== 'GRANTED') {
      return null;
    }

    const upcomingSegments = currentRoute.segments.slice(currentSegmentIdx);
    const matchedSegment = upcomingSegments.find(
      (seg) => seg.roadName.toLowerCase() === userCurrentRoad.toLowerCase()
    );

    if (!matchedSegment) {
      return null;
    }

    // Calculate approximate ETA to this road segment
    const segmentEtaMins = Math.max(1, Math.round(matchedSegment.etaSeconds / 60));

    return {
      active: true,
      ambulanceCallSign: selectedVehicle.callSign,
      vehicleNumber: selectedVehicle.vehicleNumber,
      roadName: matchedSegment.roadName,
      direction: `Eastbound toward ${selectedDestination.shortName || selectedDestination.name}`,
      estimatedArrivalMinutes: segmentEtaMins,
      distanceMeters: matchedSegment.distanceMeters,
      yieldInstruction: 'Safely pull over to the left edge of the roadway. Keep the center lane open for emergency passage. Do not brake abruptly.',
      radiusMeters: 500,
    };
  }, [tripStatus, isSubscribed, subscriptionPermission, currentRoute, currentSegmentIdx, userCurrentRoad, selectedVehicle, selectedDestination]);

  // Reset demo simulation state
  const resetSimulation = useCallback(() => {
    voiceService.stop();
    setTripStatus('IDLE');
    setTripStartTime(null);
    setCurrentRoute(INITIAL_ROUTE);
    setCurrentSegmentIdx(0);
    setActiveRecommendation(null);
    setRecommendationDecision(null);
    setTrafficReports(INITIAL_TRAFFIC_REPORTS);
    setSelectedIncident(INITIAL_TRAFFIC_REPORTS[0] || null);
    setMapZoom(1);
    addToast('Simulation Reset', 'Patna route, trip, and community states restored to initial demo defaults.', 'info');
  }, [addToast]);

  const value = {
    activeTab,
    setActiveTab,
    pendingAction,
    setPendingAction,
    // Authentication
    currentUser,
    isAuthenticated,
    login,
    logout,
    // Driver & Trip
    selectedVehicle,
    setSelectedVehicle,
    selectedDestination,
    setSelectedDestination,
    tripStatus,
    tripStartTime,
    currentRoute,
    currentSegmentIdx,
    currentSpeedKmh,
    startTrip,
    endTrip,
    advanceSegment,
    // Recommendations
    activeRecommendation,
    recommendationDecision,
    acceptRecommendation,
    rejectRecommendation,
    // Traffic & Incident Selection
    trafficReports,
    submitTrafficReport,
    selectedIncident,
    setSelectedIncident,
    // Map Controls
    mapZoom,
    zoomIn,
    zoomOut,
    resetZoom,
    // Road User
    subscriptionPermission,
    setSubscriptionPermission,
    isSubscribed,
    setIsSubscribed,
    userCurrentRoad,
    setUserCurrentRoad,
    activeAlertForUser,
    // Voice & Toasts
    isMuted,
    setIsMuted,
    isSpeaking,
    triggerVoiceGuidance,
    toasts,
    addToast,
    dismissToast,
    resetSimulation,
  };

  return <SimulationContext.Provider value={value}>{children}</SimulationContext.Provider>;
}

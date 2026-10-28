import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  DEMO_DESTINATIONS,
  DEMO_VEHICLES,
  INITIAL_ROUTE,
  ALTERNATIVE_ROUTE,
  INITIAL_TRAFFIC_REPORTS,
  DEMO_TRIP_HISTORY,
} from '../services/mockData.js';
import { voiceService } from '../services/voiceService.js';
import { authService } from '../services/authService.js';
import { SimulationContext } from './simulationContextInstance.js';

export function SimulationProvider({ children }) {
  // Navigation / Active View
  const [activeTab, setActiveTab] = useState('overview'); // 'overview', 'driver', 'alerts', 'report', 'login'
  const [driverSubTab, setDriverSubTab] = useState('home'); // 'home', 'start', 'active', 'history', 'traffic', 'notifications', 'settings'
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

  // Driver Trip History & Settings
  const [tripHistory, setTripHistory] = useState(DEMO_TRIP_HISTORY);
  const [driverSettings, setDriverSettings] = useState({
    voiceVolume: 1.0,
    voiceRate: 1.0,
    sirenSoundEnabled: true,
    autoAlertNotifications: true,
    pilotSector: 'Patna Central Arterial Sector',
  });

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

  // Focused Mission Navigation Mode State (Active mission prioritizes ~80% map)
  const [isFocusedMissionMode, setIsFocusedMissionMode] = useState(true);
  const toggleFocusedMissionMode = useCallback(() => {
    setIsFocusedMissionMode((prev) => !prev);
  }, []);

  // Device Geolocation State (Captured on explicit user interaction)
  const [userGpsLocation, setUserGpsLocation] = useState({
    lat: null,
    lng: null,
    accuracy: null, // in meters
    timestamp: null,
    status: 'IDLE', // 'IDLE' | 'LOCATING' | 'SUCCESS' | 'DENIED' | 'UNAVAILABLE' | 'TIMEOUT' | 'UNSUPPORTED'
    errorMessage: null,
  });

  // Audio / Voice Route Assistance
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [latestVoiceGuidance, setLatestVoiceGuidance] = useState(
    'AmbuRoute navigation engine on standby. Ready for emergency dispatch.'
  );

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

  // Voice Guidance Trigger (Deterministic verbal dispatch assistance with uncertainty preservation)
  const triggerVoiceGuidance = useCallback((text) => {
    setLatestVoiceGuidance(text);
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
      setDriverSubTab('active');
      window.location.hash = 'driver/active';
      return true;
    }

    setTripStatus('ACTIVE');
    setTripStartTime(new Date());
    setCurrentSegmentIdx(0);
    setCurrentRoute(INITIAL_ROUTE);
    setRecommendationDecision(null);
    setActiveRecommendation(null);
    setIsFocusedMissionMode(true);
    setDriverSubTab('active');
    setActiveTab('driver');
    window.location.hash = 'driver/active';

    addToast(
      'Emergency Mission Dispatched',
      `En route to ${selectedDestination.name}. Route-aware broadcast active for Patna corridors (500m radius).`,
      'success'
    );

    triggerVoiceGuidance(
      `Emergency mission started to ${selectedDestination.shortName || selectedDestination.name}. Proceed along ${INITIAL_ROUTE.segments[0].roadName}.`
    );
    return true;
  }, [tripStatus, selectedDestination, addToast, triggerVoiceGuidance]);

  // Handle Ending Emergency Trip (Safe return to Standby Home dashboard)
  const endTrip = useCallback(() => {
    if (tripStatus === 'ACTIVE') {
      const durationMins = tripStartTime
        ? Math.max(1, Math.round((Date.now() - new Date(tripStartTime).getTime()) / 60000))
        : 14;
      const completedRecord = {
        id: `TRIP-PAT-108-${Math.floor(410 + Math.random() * 50)}`,
        startTime: tripStartTime ? new Date(tripStartTime).toISOString() : new Date(Date.now() - durationMins * 60000).toISOString(),
        endTime: new Date().toISOString(),
        destination: selectedDestination.name,
        shortDestination: selectedDestination.shortName || selectedDestination.name,
        vehicleNumber: selectedVehicle.vehicleNumber,
        callSign: selectedVehicle.callSign,
        driverName: currentUser?.driverName || 'Amitabh Sen',
        status: 'COMPLETED',
        distanceKm: selectedDestination.distanceKm || 6.0,
        durationMins,
        routeTaken: currentRoute.name,
        detourAccepted: recommendationDecision === 'ACCEPTED',
        alertsDelivered: 35,
        outcome: `Patient safely delivered to ${selectedDestination.shortName || selectedDestination.name}`,
      };
      setTripHistory((prev) => [completedRecord, ...prev]);
    }
    setTripStatus('IDLE');
    setTripStartTime(null);
    setActiveRecommendation(null);
    setRecommendationDecision(null);
    setCurrentRoute(INITIAL_ROUTE);
    setCurrentSegmentIdx(0);
    setIsFocusedMissionMode(true);
    voiceService.stop();
    setIsSpeaking(false);
    setDriverSubTab('home');
    window.location.hash = 'driver/home';
    triggerVoiceGuidance('Emergency mission concluded. Unit returned to standby.');
    addToast('Emergency Mission Concluded', 'Trip ended. Unit returned to Standby dashboard.', 'info');
  }, [tripStatus, tripStartTime, selectedDestination, selectedVehicle, currentUser, currentRoute, recommendationDecision, triggerVoiceGuidance, addToast]);

  // Handle Driver Login
  const login = useCallback((email, password) => {
    const result = authService.login(email, password);
    if (result.success) {
      setCurrentUser(result.user);
      addToast('Driver Authenticated', `Welcome back, ${result.user.driverName}. Demo session established.`, 'success');

      // Check if there was a pending start action
      if (pendingAction === 'START_AMBULANCE') {
        setPendingAction(null);
        setActiveTab('driver');
        setDriverSubTab('start');
        window.location.hash = 'driver/start';
      } else {
        setActiveTab('driver');
        setDriverSubTab('home');
        window.location.hash = 'driver/home';
      }
      return { success: true };
    }
    return { success: false, error: result.error };
  }, [pendingAction, addToast]);

  // Handle Driver Logout
  const logout = useCallback(() => {
    if (tripStatus === 'ACTIVE') {
      endTrip();
    }
    authService.logout();
    setCurrentUser(null);
    setPendingAction(null);
    setDriverSubTab('home');
    addToast('Logged Out', 'Driver credentials cleared. Direct dashboard access restricted.', 'info');
    setActiveTab('overview');
    window.location.hash = 'overview';
  }, [tripStatus, endTrip, addToast]);

  const navigateToDriverSubTab = useCallback((subTab) => {
    setDriverSubTab(subTab);
    setActiveTab('driver');
    window.location.hash = `driver/${subTab}`;
  }, []);

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
        triggerVoiceGuidance(
          'A road blockage has been reported near Dak Bungalow Crossing. The report is not yet confirmed. An alternative via Atal Path riverfront bypass is available. Please review and confirm.'
        );
      } else {
        triggerVoiceGuidance(
          `Approaching ${nextRoad}. Destination: ${selectedDestination.shortName || selectedDestination.name}.`
        );
      }
    } else {
      endTrip();
    }
  }, [tripStatus, currentSegmentIdx, currentRoute, recommendationDecision, selectedDestination, addToast, triggerVoiceGuidance, endTrip]);

  // Driver Confirmation: Accept Alternative Route
  const acceptRecommendation = useCallback(() => {
    if (!activeRecommendation) return;
    setRecommendationDecision('ACCEPTED');
    setCurrentRoute(activeRecommendation);
    setCurrentSegmentIdx(0); // Transition to alternative route
    setActiveRecommendation(null);
    addToast('Alternative Route Confirmed', 'Route recalculated via Atal Path & JP Ganga Path. ETA improved by 6 minutes.', 'success');
    triggerVoiceGuidance('Alternative route confirmed by driver. Route updated via Atal Path and JP Ganga Path bypass.');
  }, [activeRecommendation, addToast, triggerVoiceGuidance]);

  // Driver Confirmation: Reject Alternative Route
  const rejectRecommendation = useCallback(() => {
    setRecommendationDecision('REJECTED');
    setActiveRecommendation(null);
    addToast('Recommendation Dismissed', 'Retaining primary arterial route via Bailey Road as instructed by driver.', 'neutral');
    triggerVoiceGuidance('Alternative dismissed. Continuing on primary arterial corridor via Bailey Road as instructed.');
  }, [addToast, triggerVoiceGuidance]);

  // Explicit User Action: Request Geolocation via Browser API
  const requestUserLocation = useCallback(() => {
    if (typeof window === 'undefined' || !navigator.geolocation) {
      setUserGpsLocation({
        lat: null,
        lng: null,
        accuracy: null,
        timestamp: null,
        status: 'UNSUPPORTED',
        errorMessage: 'Geolocation is not supported by your current browser environment.',
      });
      addToast('Location Not Supported', 'Browser Geolocation is not supported in this environment.', 'neutral');
      return;
    }

    setUserGpsLocation((prev) => ({
      ...prev,
      status: 'LOCATING',
      errorMessage: null,
    }));

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = Number(position.coords.latitude.toFixed(6));
        const lng = Number(position.coords.longitude.toFixed(6));
        const accuracy = Math.round(position.coords.accuracy);
        const timestamp = new Date(position.timestamp || Date.now()).toISOString();

        setUserGpsLocation({
          lat,
          lng,
          accuracy,
          timestamp,
          status: 'SUCCESS',
          errorMessage: null,
        });
        addToast('GPS Location Detected', `Accuracy ±${accuracy}m captured. You can review your report location.`, 'info');
      },
      (error) => {
        let status = 'UNAVAILABLE';
        let msg = 'Unable to retrieve device location. Manual selection remains active.';

        if (error.code === 1) { // PERMISSION_DENIED
          status = 'DENIED';
          msg = 'Location permission was denied. You can still report traffic by selecting a road manually.';
        } else if (error.code === 2) { // POSITION_UNAVAILABLE
          status = 'UNAVAILABLE';
          msg = 'Location services are unavailable or disabled on this device. Manual selection remains active.';
        } else if (error.code === 3) { // TIMEOUT
          status = 'TIMEOUT';
          msg = 'Device location request timed out. You may retry or select a road manually.';
        }

        setUserGpsLocation({
          lat: null,
          lng: null,
          accuracy: null,
          timestamp: null,
          status,
          errorMessage: msg,
        });
        addToast('Location Unavailable', msg, 'neutral');
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 30000,
      }
    );
  }, [addToast]);

  const clearUserLocation = useCallback(() => {
    setUserGpsLocation({
      lat: null,
      lng: null,
      accuracy: null,
      timestamp: null,
      status: 'IDLE',
      errorMessage: null,
    });
  }, []);

  // Submit Traffic Report with Optional Frontend Location Metadata
  const submitTrafficReport = useCallback((reportType, roadSegment, description, locationMeta = null) => {
    const targetRoad = roadSegment || userCurrentRoad;
    
    // Check if other reports in current feed match this road segment
    const matchingReports = trafficReports.filter(
      (r) => r.roadSegment.toLowerCase() === targetRoad.toLowerCase()
    );

    const isCorroborated = matchingReports.length > 0;
    const locationStatus = locationMeta?.locationStatus || 'LOCATION UNVERIFIED';

    const newReport = {
      id: `rep-${Date.now()}`,
      reportType,
      roadSegment: targetRoad,
      locationDescription: description || `Reported near ${targetRoad}, Patna`,
      timestamp: new Date().toISOString(),
      freshness: 'JUST_NOW',
      verifiedCount: isCorroborated ? matchingReports.length + 1 : 1,
      source: 'Participating Citizen (Patna)',
      status: 'ACTIVE',
      isDemo: true,
      locationStatus,
      coordinates: locationMeta?.coordinates || null,
      gpsAccuracy: locationMeta?.accuracy || null,
      locationCapturedAt: locationMeta?.locationCapturedAt || null,
      corroborationStatus: isCorroborated ? 'CORROBORATED' : 'UNVERIFIED REPORT',
    };

    setTrafficReports((prev) => [newReport, ...prev]);
    setSelectedIncident(newReport);
    addToast(
      'Observation Recorded',
      `Your report for ${newReport.roadSegment} has been submitted (${locationStatus}).`,
      'success'
    );

    // If report is ROAD_BLOCKED or TRAFFIC_HIGH and relevant to ambulance route, evaluate recommendation
    if (tripStatus === 'ACTIVE' && (reportType === 'ROAD_BLOCKED' || reportType === 'TRAFFIC_HIGH')) {
      if (!recommendationDecision && currentRoute.id === INITIAL_ROUTE.id) {
        setActiveRecommendation(ALTERNATIVE_ROUTE);
        triggerVoiceGuidance('New traffic observation received for your upcoming Patna route. An alternative is ready for review.');
      }
    }
  }, [userCurrentRoad, trafficReports, tripStatus, currentRoute, recommendationDecision, addToast, triggerVoiceGuidance]);

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
    driverSubTab,
    setDriverSubTab,
    navigateToDriverSubTab,
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
    isFocusedMissionMode,
    setIsFocusedMissionMode,
    toggleFocusedMissionMode,
    latestVoiceGuidance,
    // Trip History & Driver Settings
    tripHistory,
    setTripHistory,
    driverSettings,
    setDriverSettings,
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
    userGpsLocation,
    requestUserLocation,
    clearUserLocation,
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

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
import { apiClient } from '../services/api.js';
import { SimulationContext } from './simulationContextInstance.js';

export function SimulationProvider({ children }) {
  // Navigation / Active View
  const [activeTab, setActiveTab] = useState('overview'); // 'overview', 'driver', 'alerts', 'report', 'login'
  const [driverSubTab, setDriverSubTab] = useState('home'); // 'home', 'start', 'active', 'history', 'traffic', 'notifications', 'settings'
  const [pendingAction, setPendingAction] = useState(null); // 'START_AMBULANCE' | null

  // Authentication State
  const [currentUser, setCurrentUser] = useState(() => authService.getCurrentUser());
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const isAuthenticated = Boolean(currentUser && currentUser.authorized);

  // Active Real Backend Trip State
  const [activeTrip, setActiveTrip] = useState(null);
  const [isTestModeLocation, setIsTestModeLocation] = useState(false);
  const [driverLiveGps, setDriverLiveGps] = useState({
    lat: null,
    lng: null,
    accuracy: null,
    heading: null,
    speed: null,
    capturedAt: null,
    status: 'IDLE', // 'IDLE' | 'ACTIVE' | 'ERROR' | 'OFFLINE'
    error: null,
  });
  const [lastServerUpdate, setLastServerUpdate] = useState({
    timestamp: null,
    status: 'IDLE', // 'IDLE' | 'SYNCING' | 'SYNCED' | 'ERROR'
  });

  const driverWatchIdRef = useRef(null);
  const lastSentTimestampRef = useRef(0);

  // Stop continuous driver GPS watcher
  const stopDriverLocationWatcher = useCallback(() => {
    if (driverWatchIdRef.current !== null) {
      if (typeof navigator !== 'undefined' && 'geolocation' in navigator) {
        navigator.geolocation.clearWatch(driverWatchIdRef.current);
      }
      driverWatchIdRef.current = null;
    }
    setDriverLiveGps((prev) => ({ ...prev, status: 'IDLE' }));
  }, []);

  // Start continuous driver GPS watcher
  const startDriverLocationWatcher = useCallback(
    (tripId) => {
      stopDriverLocationWatcher();
      if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
        setDriverLiveGps((prev) => ({ ...prev, status: 'UNSUPPORTED' }));
        return;
      }

      try {
        const watchId = navigator.geolocation.watchPosition(
          async (pos) => {
            const lat = pos.coords.latitude;
            const lng = pos.coords.longitude;
            const accuracy = Math.round(pos.coords.accuracy || 10);
            const now = Date.now();

            setDriverLiveGps({
              lat,
              lng,
              accuracy,
              heading: pos.coords.heading || null,
              speed: pos.coords.speed || null,
              capturedAt: new Date(pos.timestamp || now),
              status: 'ACTIVE',
              error: null,
            });

            // Throttle: max 1 update every 3 seconds to protect backend rate limiter
            if (now - lastSentTimestampRef.current < 3000) return;
            lastSentTimestampRef.current = now;

            setLastServerUpdate({ timestamp: new Date(), status: 'SYNCING' });
            const token = authService.getToken();
            if (!token || !tripId) return;

            const res = await apiClient.updateTripLocation(
              tripId,
              {
                coordinates: [lng, lat],
                accuracyMeters: accuracy,
                headingDegrees:
                  Number.isFinite(pos.coords.heading) &&
                  pos.coords.heading >= 0 &&
                  pos.coords.heading <= 360
                    ? Math.round(pos.coords.heading)
                    : null,
                speedMetersPerSecond:
                  Number.isFinite(pos.coords.speed) && pos.coords.speed >= 0
                    ? pos.coords.speed
                    : null,
                capturedAt: new Date(pos.timestamp || now).toISOString(),
              },
              token
            );

            if (res.success) {
              setLastServerUpdate({ timestamp: new Date(), status: 'SYNCED' });
            } else {
              setLastServerUpdate({ timestamp: new Date(), status: 'ERROR' });
            }
          },
          (err) => {
            setDriverLiveGps((prev) => ({
              ...prev,
              status: 'ERROR',
              error: err.message || 'GPS location error',
            }));
          },
          { enableHighAccuracy: true, timeout: 8000, maximumAge: 2000 }
        );

        driverWatchIdRef.current = watchId;
      } catch (watchErr) {
        console.warn('[SimulationContext] Watcher start error:', watchErr);
      }
    },
    [stopDriverLocationWatcher]
  );

  // Clean up watcher on unmount
  useEffect(() => {
    return () => {
      stopDriverLocationWatcher();
    };
  }, [stopDriverLocationWatcher]);

  // Verify session with the real backend on initial application mount and restore active trip
  useEffect(() => {
    let isMounted = true;
    async function checkSession() {
      setIsAuthLoading(true);
      try {
        const verifiedUser = await authService.verifySession();
        if (isMounted) {
          setCurrentUser(verifiedUser);
          if (verifiedUser && verifiedUser.authorized) {
            const token = authService.getToken();
            if (token) {
              const tripRes = await apiClient.getActiveTrip(token);
              if (isMounted && tripRes.success && tripRes.data?.trip) {
                const trip = tripRes.data.trip;
                setActiveTrip(trip);
                setTripStatus('ACTIVE');
                setTripStartTime(new Date(trip.startedAt || Date.now()));
                if (trip.destination?.label) {
                  setSelectedDestination((prev) => ({
                    ...prev,
                    name: trip.destination.label,
                    shortName: trip.destination.label.split('(')[0].trim(),
                    coordinates: trip.destination.location?.coordinates || prev.coordinates,
                  }));
                }
                startDriverLocationWatcher(trip.id || trip._id);
              }
            }
          }
        }
      } catch (err) {
        console.warn('[SimulationContext] Session check error:', err);
        if (isMounted) {
          setCurrentUser(null);
        }
      } finally {
        if (isMounted) {
          setIsAuthLoading(false);
        }
      }
    }
    checkSession();
    return () => {
      isMounted = false;
    };
  }, [startDriverLocationWatcher]);

  // Driver & Trip State
  const [selectedVehicle, setSelectedVehicle] = useState(DEMO_VEHICLES[0]);
  const [selectedDestination, setSelectedDestination] = useState(null);
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
    pilotSector: 'Active Regional Corridor',
  });

  // Recommendations
  const [activeRecommendation, setActiveRecommendation] = useState(null);
  const [recommendationDecision, setRecommendationDecision] = useState(null); // 'ACCEPTED' | 'REJECTED' | null

  // Traffic Intelligence & Incident Selection
  const [trafficReports, setTrafficReports] = useState(INITIAL_TRAFFIC_REPORTS);
  const [selectedIncident, setSelectedIncident] = useState(() => INITIAL_TRAFFIC_REPORTS[0] || null);

  // Load real-time community traffic reports from backend
  useEffect(() => {
    let isMounted = true;
    async function loadReports() {
      try {
        const res = await apiClient.getTrafficReports();
        if (isMounted && res.success && Array.isArray(res.data?.reports) && res.data.reports.length > 0) {
          setTrafficReports((prev) => {
            const existingIds = new Set(res.data.reports.map((r) => r.id));
            const filteredPrev = prev.filter((p) => !existingIds.has(p.id));
            return [...res.data.reports, ...filteredPrev];
          });
          setSelectedIncident(res.data.reports[0]);
        }
      } catch (err) {
        console.warn('[SimulationContext] Failed to load backend traffic reports:', err);
      }
    }
    loadReports();
    return () => {
      isMounted = false;
    };
  }, []);

  // Map Controls State
  const [mapZoom, setMapZoom] = useState(1);
  const zoomIn = useCallback(() => setMapZoom((prev) => Math.min(prev + 0.25, 2)), []);
  const zoomOut = useCallback(() => setMapZoom((prev) => Math.max(prev - 0.25, 0.75)), []);
  const resetZoom = useCallback(() => setMapZoom(1), []);

  // Road User State (Real location resolved dynamically from device GPS or explicitly selected test sector)
  const [subscriptionPermission, setSubscriptionPermission] = useState('GRANTED'); // 'GRANTED', 'PROMPT', 'DENIED'
  const [isSubscribed, setIsSubscribed] = useState(true);
  const [userCurrentRoad, setUserCurrentRoad] = useState('');

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
  const startTrip = useCallback(
    async (tripConfig = null) => {
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

      // Determine origin and destination
      const dest = tripConfig?.destination || (selectedDestination ? {
        label: selectedDestination.name,
        coordinates: selectedDestination.coordinates,
      } : {
        label: 'Emergency Medical Center',
        coordinates: [85.1588, 25.608],
      });

      const originCoords =
        tripConfig?.origin ||
        (driverLiveGps.lat && driverLiveGps.lng
          ? [driverLiveGps.lng, driverLiveGps.lat]
          : [85.1376, 25.5941]);
      const accuracy =
        tripConfig?.accuracyMeters || (driverLiveGps.accuracy ? Math.round(driverLiveGps.accuracy) : 15);
      const isTest = Boolean(tripConfig?.isTestMode);
      setIsTestModeLocation(isTest);

      const token = authService.getToken();
      let backendTrip = null;

      if (token) {
        try {
          const createRes = await apiClient.createTrip(
            {
              destination: {
                label: dest.label || dest.name || 'Emergency Destination',
                location: {
                  type: 'Point',
                  coordinates: dest.coordinates || [85.1588, 25.608],
                },
              },
              initialLocation: {
                type: 'Point',
                coordinates: originCoords,
              },
              locationAccuracyMeters: accuracy,
            },
            token
          );

          if (createRes.success && createRes.data?.trip) {
            backendTrip = createRes.data.trip;
            setActiveTrip(backendTrip);
            startDriverLocationWatcher(backendTrip.id || backendTrip._id);
          } else if (createRes.error?.code === 'ACTIVE_TRIP_EXISTS') {
            const activeRes = await apiClient.getActiveTrip(token);
            if (activeRes.success && activeRes.data?.trip) {
              backendTrip = activeRes.data.trip;
              setActiveTrip(backendTrip);
              startDriverLocationWatcher(backendTrip.id || backendTrip._id);
            }
          } else {
            console.warn('[SimulationContext] Backend trip creation note:', createRes.error);
            addToast(
              'Backend Notice',
              createRes.error?.message || 'Trip started in local mode (backend sync pending).',
              'warning'
            );
          }
        } catch (err) {
          console.warn('[SimulationContext] Create trip exception:', err);
        }
      }

      if (tripConfig?.destination) {
        setSelectedDestination({
          id: tripConfig.destination.id || 'chosen-dest',
          name: tripConfig.destination.label || tripConfig.destination.name,
          shortName:
            tripConfig.destination.shortName ||
            (tripConfig.destination.label || tripConfig.destination.name || '').split('(')[0].trim(),
          coordinates: dest.coordinates,
          distanceKm: tripConfig.destination.distanceKm || 0,
        });
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

      const destLabel = dest.label || dest.name || selectedDestination?.name || 'Emergency Medical Center';
      addToast(
        'Emergency Mission Dispatched',
        `En route to ${destLabel}. Alert broadcast active${backendTrip ? ' (Backend Synced)' : ''}.`,
        'success'
      );

      triggerVoiceGuidance(
        `Emergency mission started to ${destLabel}. Proceed along ${INITIAL_ROUTE.segments[0].roadName}.`
      );
      return true;
    },
    [tripStatus, selectedDestination, driverLiveGps, startDriverLocationWatcher, addToast, triggerVoiceGuidance]
  );

  // Handle Ending Emergency Trip (Safe return to Standby Home dashboard)
  const endTrip = useCallback(
    async (reason = 'PATIENT_DELIVERED') => {
      if (tripStatus === 'ACTIVE' || activeTrip) {
        stopDriverLocationWatcher();

        const token = authService.getToken();
        if (token && activeTrip) {
          try {
            await apiClient.endTrip(activeTrip.id || activeTrip._id, reason, token);
          } catch (endErr) {
            console.warn('[SimulationContext] End trip API error:', endErr);
          }
        }
        setActiveTrip(null);

        const durationMins = tripStartTime
          ? Math.max(1, Math.round((Date.now() - new Date(tripStartTime).getTime()) / 60000))
          : 14;
        const completedRecord = {
          id:
            activeTrip?.id || activeTrip?._id
              ? `TRIP-${(activeTrip.id || activeTrip._id).substring(0, 8).toUpperCase()}`
              : `TRIP-PAT-108-${Math.floor(410 + Math.random() * 50)}`,
          startTime: tripStartTime
            ? new Date(tripStartTime).toISOString()
            : new Date(Date.now() - durationMins * 60000).toISOString(),
          endTime: new Date().toISOString(),
          destination: selectedDestination?.name || 'Emergency Medical Base',
          shortDestination: selectedDestination?.shortName || selectedDestination?.name || 'Emergency Medical Base',
          vehicleNumber: selectedVehicle.vehicleNumber,
          callSign: selectedVehicle.callSign,
          driverName: currentUser?.driverName || 'Amitabh Sen',
          status: 'COMPLETED',
          distanceKm: selectedDestination?.distanceKm || 6.0,
          durationMins,
          routeTaken: currentRoute.name,
          detourAccepted: recommendationDecision === 'ACCEPTED',
          alertsDelivered: 35,
          outcome: selectedDestination
            ? `Patient safely delivered to ${selectedDestination.shortName || selectedDestination.name}`
            : 'Emergency mission completed safely',
        };
        setTripHistory((prev) => [completedRecord, ...prev]);
      }
      setTripStatus('IDLE');
      setTripStartTime(null);
      setSelectedDestination(null);
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
    },
    [
      tripStatus,
      activeTrip,
      tripStartTime,
      selectedDestination,
      selectedVehicle,
      currentUser,
      currentRoute,
      recommendationDecision,
      stopDriverLocationWatcher,
      triggerVoiceGuidance,
      addToast,
    ]
  );

  // Handle Driver Login via Real Backend
  const login = useCallback(async (email, password) => {
    const result = await authService.login(email, password);
    if (result.success) {
      setCurrentUser(result.user);
      addToast(
        'Driver Authenticated',
        `Welcome back, ${result.user.driverName}. Verified backend session active.`,
        'success'
      );

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

  // Handle Driver Logout via Real Backend
  const logout = useCallback(async () => {
    if (tripStatus === 'ACTIVE') {
      endTrip();
    }
    await authService.logout();
    setCurrentUser(null);
    setPendingAction(null);
    setDriverSubTab('home');
    addToast('Logged Out', 'Driver session concluded and credentials revoked.', 'info');
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
          `Approaching ${nextRoad}. Destination: ${selectedDestination?.shortName || selectedDestination?.name || 'Assigned Center'}.`
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

        // Dynamically reverse geocode user coordinates into real road/area name
        apiClient.reverseGeocode(lat, lng).then((resolvedRoad) => {
          const roadStr = typeof resolvedRoad === 'string' ? resolvedRoad : (resolvedRoad?.displayName || resolvedRoad?.road || '');
          if (roadStr) {
            setUserCurrentRoad(roadStr);
          } else {
            setUserCurrentRoad(`Coordinates: ${lat.toFixed(4)}°N, ${lng.toFixed(4)}°E`);
          }
        }).catch(() => {
          setUserCurrentRoad(`Coordinates: ${lat.toFixed(4)}°N, ${lng.toFixed(4)}°E`);
        });
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
    setUserCurrentRoad('');
  }, []);

  // Submit Traffic Report with Backend Persistence & Real-Time Sync
  const submitTrafficReport = useCallback(
    async (reportType, roadSegment, description, locationMeta = null) => {
      const targetRoad = roadSegment || userCurrentRoad;
      const locationStatus = locationMeta?.locationStatus || 'LOCATION_MATCHED';

      // 1. Submit to Backend API
      let backendReport = null;
      try {
        const payload = {
          reportType,
          roadSegment: targetRoad,
          locationDescription: description || `Reported near ${targetRoad}`,
          coordinates:
            locationMeta?.coordinates ||
            (userGpsLocation?.lat ? [userGpsLocation.lng, userGpsLocation.lat] : null),
          accuracyMeters: locationMeta?.accuracy || userGpsLocation?.accuracy || 15,
          locationStatus,
          source: 'Participating Road User',
        };
        const res = await apiClient.createTrafficReport(payload);
        if (res.success && res.data?.report) {
          backendReport = res.data.report;
        }
      } catch (err) {
        console.warn('[SimulationContext] Create traffic report API error:', err);
      }

      // Check if other reports in current feed match this road segment
      const matchingReports = trafficReports.filter(
        (r) => r.roadSegment.toLowerCase() === targetRoad.toLowerCase()
      );
      const isCorroborated = matchingReports.length > 0;

      const reportToAdd = backendReport || {
        id: `rep-${Date.now()}`,
        reportType,
        roadSegment: targetRoad,
        locationDescription: description || `Reported near ${targetRoad}`,
        timestamp: new Date().toISOString(),
        freshness: 'JUST_NOW',
        verifiedCount: isCorroborated ? matchingReports.length + 1 : 1,
        source: 'Participating Road User',
        status: 'ACTIVE',
        isDemo: false,
        locationStatus,
        coordinates:
          locationMeta?.coordinates ||
          (userGpsLocation?.lat ? [userGpsLocation.lat, userGpsLocation.lng] : null),
        gpsAccuracy: locationMeta?.accuracy || userGpsLocation?.accuracy || null,
        locationCapturedAt: locationMeta?.locationCapturedAt || new Date().toISOString(),
        corroborationStatus: isCorroborated ? 'CORROBORATED' : 'UNVERIFIED REPORT',
      };

      setTrafficReports((prev) => [reportToAdd, ...prev.filter((r) => r.id !== reportToAdd.id)]);
      setSelectedIncident(reportToAdd);
      addToast(
        'Observation Recorded',
        `Your real-time report for ${reportToAdd.roadSegment} has been submitted (${locationStatus}).`,
        'success'
      );

      // If report is ROAD_BLOCKED or TRAFFIC_HIGH and relevant to ambulance route, evaluate recommendation
      if (tripStatus === 'ACTIVE' && (reportType === 'ROAD_BLOCKED' || reportType === 'TRAFFIC_HIGH')) {
        if (!recommendationDecision && currentRoute.id === INITIAL_ROUTE.id) {
          setActiveRecommendation(ALTERNATIVE_ROUTE);
          triggerVoiceGuidance(`New traffic observation received near ${targetRoad}. Detour review recommended.`);
        }
      }
      return reportToAdd;
    },
    [userCurrentRoad, trafficReports, tripStatus, userGpsLocation, currentRoute, recommendationDecision, addToast, triggerVoiceGuidance]
  );

  // Determine if this road user should receive an active ambulance alert
  // Route-Aware Condition:
  // 1. Trip is ACTIVE
  // 2. Road user is SUBSCRIBED and permission is GRANTED
  // 3. User's location is on one of the ambulance's UPCOMING segments (within 500m zone)
  const activeAlertForUser = useMemo(() => {
    if (tripStatus !== 'ACTIVE' || !isSubscribed || subscriptionPermission !== 'GRANTED') {
      return null;
    }

    const userRoadStr = typeof userCurrentRoad === 'string' ? userCurrentRoad : (userCurrentRoad?.displayName || userCurrentRoad?.road || '');
    if (!userRoadStr) return null;

    const upcomingSegments = currentRoute.segments.slice(currentSegmentIdx);
    const matchedSegment = upcomingSegments.find(
      (seg) => seg.roadName.toLowerCase() === userRoadStr.toLowerCase()
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
      direction: `Eastbound toward ${selectedDestination?.shortName || selectedDestination?.name || 'Assigned Trauma Center'}`,
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
    setSelectedDestination(null);
    setCurrentRoute(INITIAL_ROUTE);
    setCurrentSegmentIdx(0);
    setActiveRecommendation(null);
    setRecommendationDecision(null);
    setTrafficReports(INITIAL_TRAFFIC_REPORTS);
    setSelectedIncident(INITIAL_TRAFFIC_REPORTS[0] || null);
    setMapZoom(1);
    addToast('Simulation Reset', 'Route, trip, and community states reset to initial defaults.', 'info');
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
    isAuthLoading,
    login,
    logout,
    // Driver & Trip
    activeTrip,
    isTestModeLocation,
    driverLiveGps,
    lastServerUpdate,
    startDriverLocationWatcher,
    stopDriverLocationWatcher,
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
    setUserGpsLocation,
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

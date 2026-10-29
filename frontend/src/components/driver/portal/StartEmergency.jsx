import React, { useState, useEffect, useCallback, useMemo } from 'react';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import { useSimulation } from '../../../context/useSimulation.js';
import { DEMO_VEHICLES } from '../../../services/mockData.js';
import { apiClient } from '../../../services/api.js';
import { Card } from '../../common/Card.jsx';
import { Button } from '../../common/Button.jsx';
import { Badge } from '../../common/Badge.jsx';
import {
  SirenIcon,
  ShieldCheckIcon,
  AmbulanceIcon,
  MapPinIcon,
  AlertTriangleIcon,
  CheckCircle2Icon,
  RouteIcon,
  CompassIcon,
  RefreshCwIcon,
  CheckCircleIcon,
} from '../../common/Icons.jsx';

// Preset Geographic Test Locations for Option B (Non-Patna locations for realistic regional testing)
const PRESET_TEST_ORIGINS = [
  {
    id: 'lakhisarai-center',
    name: 'Lakhisarai District Center (Bihar)',
    lat: 25.1764,
    lng: 86.0945,
    label: 'Lakhisarai District Center [Manual Test Origin]',
  },
  {
    id: 'delhi-aiims',
    name: 'New Delhi AIIMS Medical Hub (Delhi NCR)',
    lat: 28.5672,
    lng: 77.2100,
    label: 'New Delhi AIIMS Corridor [Manual Test Origin]',
  },
  {
    id: 'bangalore-central',
    name: 'Bengaluru Central Emergency Corridor (Karnataka)',
    lat: 12.9716,
    lng: 77.5946,
    label: 'Bengaluru Central [Manual Test Origin]',
  },
  {
    id: 'begusarai-hub',
    name: 'Begusarai Town Station Hub (Bihar)',
    lat: 25.4182,
    lng: 86.1328,
    label: 'Begusarai Station Hub [Manual Test Origin]',
  },
  {
    id: 'munger-hq',
    name: 'Munger District HQ (Bihar)',
    lat: 25.3752,
    lng: 86.4744,
    label: 'Munger District HQ [Manual Test Origin]',
  },
  {
    id: 'patna-demo',
    name: 'Patna Central Arterial Corridor [Demo Sector]',
    lat: 25.5941,
    lng: 85.1376,
    label: 'Patna Central [Demo Sector]',
  },
];

// Custom Leaflet Icons matching AmbuRoute design tokens
const createOriginMarkerIcon = (isGps) =>
  L.divIcon({
    className: 'leaflet-origin-marker-wrap',
    html: `
      <div style="background: ${isGps ? '#0284c7' : '#d97706'}; color: #ffffff; border-radius: 50%; width: 34px; height: 34px; display: flex; align-items: center; justify-content: center; box-shadow: 0 0 0 4px ${isGps ? 'rgba(2, 132, 199, 0.28)' : 'rgba(217, 119, 6, 0.28)'}; font-size: 16px; border: 2px solid #ffffff;">
        🚑
      </div>
    `,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    popupAnchor: [0, -17],
  });

const createHospMarkerIcon = (isSelected, rank = 1) =>
  L.divIcon({
    className: 'leaflet-hosp-marker-wrap',
    html: `
      <div style="background: ${isSelected ? '#10b981' : '#dc2626'}; color: #ffffff; border-radius: 6px; padding: 4px 8px; font-weight: 800; font-size: 11px; white-space: nowrap; box-shadow: 0 2px 8px rgba(0,0,0,0.3); display: flex; align-items: center; gap: 4px; border: 2px solid #ffffff; cursor: pointer;">
        <span>🏥 #${rank}</span>
      </div>
    `,
    iconSize: [58, 26],
    iconAnchor: [29, 13],
    popupAnchor: [0, -15],
  });

// Leaflet map center updater
function MapCenterUpdater({ center }) {
  const map = useMap();
  useEffect(() => {
    if (center && Number.isFinite(center[0]) && Number.isFinite(center[1])) {
      map.setView(center, Math.max(map.getZoom(), 11), { animate: true });
    }
  }, [center, map]);
  return null;
}

// Map click listener for Option B (Select Location on Map)
function MapClickListener({ onMapClick, enabled }) {
  useMapEvents({
    click(e) {
      if (enabled && onMapClick) {
        onMapClick(Number(e.latlng.lat.toFixed(6)), Number(e.latlng.lng.toFixed(6)));
      }
    },
  });
  return null;
}

export function StartEmergency() {
  const {
    currentUser,
    selectedVehicle,
    setSelectedVehicle,
    tripStatus,
    startTrip,
    driverLiveGps,
    navigateToDriverSubTab,
  } = useSimulation();

  const isTripActive = tripStatus === 'ACTIVE';

  // Step 2 Origin Selection Mode: 'GPS' (Option A) vs 'MANUAL' (Option B)
  const [originMode, setOriginMode] = useState('GPS');

  // Option A: Live Device GPS State
  const [driverGps, setDriverGps] = useState({
    lat: null,
    lng: null,
    accuracy: null,
    timestamp: null,
    status: 'IDLE', // 'IDLE' | 'LOCATING' | 'ACQUIRED' | 'ERROR' | 'UNSUPPORTED'
    error: null,
  });

  // Option B: Manual / Map Origin State (Defaulting to Lakhisarai for realistic regional test verification)
  const [manualOrigin, setManualOrigin] = useState(PRESET_TEST_ORIGINS[0]);
  const [customLatInput, setCustomLatInput] = useState('');
  const [customLngInput, setCustomLngInput] = useState('');

  // Selected Vehicle State
  const [vehicleId, setVehicleId] = useState(selectedVehicle.id);
  const currentChosenVeh = DEMO_VEHICLES.find((v) => v.id === vehicleId) || DEMO_VEHICLES[0];

  // Dynamic Hospitals State
  const [discoveredHospitals, setDiscoveredHospitals] = useState([]);
  const [selectedHospital, setSelectedHospital] = useState(null);
  const [hospitalsLoading, setHospitalsLoading] = useState(false);
  const [hospitalsError, setHospitalsError] = useState(null);
  const [hospitalsSource, setHospitalsSource] = useState('');
  const [hospitalsAttribution, setHospitalsAttribution] = useState('');
  const [searchRadius, setSearchRadius] = useState(35000); // 35 km default radius

  // Form Submission & Validation State
  const [isStarting, setIsStarting] = useState(false);
  const [formError, setFormError] = useState('');

  // Current Active Origin Coordinates based on selected mode
  const activeOrigin = useMemo(() => {
    if (originMode === 'GPS') {
      if (driverGps.lat && driverGps.lng) {
        return {
          lat: driverGps.lat,
          lng: driverGps.lng,
          accuracy: driverGps.accuracy,
          isGps: true,
          label: 'Live Device GPS Fix',
        };
      }
      return null;
    }
    return {
      lat: manualOrigin.lat,
      lng: manualOrigin.lng,
      accuracy: 20,
      isGps: false,
      label: manualOrigin.label || `${manualOrigin.lat.toFixed(4)}°N, ${manualOrigin.lng.toFixed(4)}°E`,
    };
  }, [originMode, driverGps, manualOrigin]);

  // Request Device Location (Option A)
  const captureDeviceLocation = useCallback(() => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      setDriverGps({
        lat: null,
        lng: null,
        accuracy: null,
        timestamp: null,
        status: 'UNSUPPORTED',
        error: 'Browser Geolocation is not supported in this environment.',
      });
      return;
    }

    setDriverGps((prev) => ({ ...prev, status: 'LOCATING', error: null }));

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(6));
        const lng = Number(pos.coords.longitude.toFixed(6));
        const accuracy = Math.round(pos.coords.accuracy || 10);
        const timestamp = new Date(pos.timestamp || Date.now());

        setDriverGps({
          lat,
          lng,
          accuracy,
          timestamp,
          status: 'ACQUIRED',
          error: null,
        });
      },
      (err) => {
        let msg = 'Unable to acquire device location.';
        if (err.code === 1) msg = 'Location permission denied by user or browser.';
        else if (err.code === 2) msg = 'Location position unavailable from device.';
        else if (err.code === 3) msg = 'Location request timed out.';
        setDriverGps((prev) => ({
          ...prev,
          status: 'ERROR',
          error: msg,
        }));
      },
      { enableHighAccuracy: true, timeout: 9000, maximumAge: 0 }
    );
  }, []);

  // Automatically attempt live device GPS capture on mount when in GPS mode
  useEffect(() => {
    if (originMode === 'GPS' && driverGps.status === 'IDLE') {
      if (driverLiveGps?.lat && driverLiveGps?.lng) {
        setDriverGps({
          lat: driverLiveGps.lat,
          lng: driverLiveGps.lng,
          accuracy: driverLiveGps.accuracy || 15,
          timestamp: new Date(),
          status: 'ACQUIRED',
          error: null,
        });
      } else {
        captureDeviceLocation();
      }
    }
  }, [originMode, driverGps.status, driverLiveGps, captureDeviceLocation]);

  // Handle map click to set manual location (Option B)
  const handleMapClick = useCallback((lat, lng) => {
    setManualOrigin({
      id: 'custom-click',
      name: `Selected Map Point (${lat.toFixed(4)}°N, ${lng.toFixed(4)}°E)`,
      lat,
      lng,
      label: `Map Point (${lat.toFixed(4)}°N, ${lng.toFixed(4)}°E) [Manual]`,
    });
    setCustomLatInput(lat.toString());
    setCustomLngInput(lng.toString());
  }, []);

  // Apply custom coordinate input
  const applyCustomCoordinates = (e) => {
    e.preventDefault();
    const lat = Number(customLatInput);
    const lng = Number(customLngInput);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
      setFormError('Please enter a valid latitude between -90 and 90.');
      return;
    }
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
      setFormError('Please enter a valid longitude between -180 and 180.');
      return;
    }
    setFormError('');
    handleMapClick(lat, lng);
  };

  // Fetch real nearby hospitals whenever active origin changes
  useEffect(() => {
    if (!activeOrigin) {
      setDiscoveredHospitals([]);
      setSelectedHospital(null);
      return;
    }

    let isMounted = true;
    const { lat, lng } = activeOrigin;

    async function loadNearbyHospitals() {
      setHospitalsLoading(true);
      setHospitalsError(null);
      try {
        const res = await apiClient.getNearbyHospitals(lat, lng, searchRadius);
        if (!isMounted) return;

        if (res.success && res.data) {
          const threeClosest = res.data.threeClosestHospitals || [];
          const allHospitals = res.data.hospitals || [];
          const list = threeClosest.length > 0 ? threeClosest : allHospitals.slice(0, 3);

          setDiscoveredHospitals(list);
          setHospitalsSource(res.data.source || 'OpenStreetMap / Overpass');
          setHospitalsAttribution(res.data.attribution || '');

          // Automatically select closest hospital as initial recommended destination
          if (list.length > 0) {
            setSelectedHospital(list[0]);
          } else {
            setSelectedHospital(null);
          }
        } else {
          setDiscoveredHospitals([]);
          setSelectedHospital(null);
          setHospitalsError(res.error?.message || 'Could not discover nearby hospitals.');
        }
      } catch (err) {
        if (isMounted) {
          setDiscoveredHospitals([]);
          setSelectedHospital(null);
          setHospitalsError(err.message || 'Hospital search service network error.');
        }
      } finally {
        if (isMounted) {
          setHospitalsLoading(false);
        }
      }
    }

    loadNearbyHospitals();
    return () => {
      isMounted = false;
    };
  }, [activeOrigin, searchRadius]);

  // Handle Emergency Trip Creation
  const handleStartSubmit = async (e) => {
    e.preventDefault();
    setFormError('');

    if (isTripActive) {
      setFormError('An emergency trip is already active. Please resume the ongoing mission or conclude it first.');
      return;
    }

    if (!activeOrigin) {
      setFormError('Please capture your live GPS location or select a manual origin before starting.');
      return;
    }

    if (hospitalsLoading) {
      setFormError('Nearby hospital search is still in progress. Please wait for results.');
      return;
    }

    if (!selectedHospital) {
      setFormError('Please select a destination medical center from the discovered nearby hospitals.');
      return;
    }

    setIsStarting(true);
    try {
      setSelectedVehicle(currentChosenVeh);

      await startTrip({
        origin: [activeOrigin.lng, activeOrigin.lat],
        destination: {
          id: selectedHospital.id,
          label: selectedHospital.name,
          name: selectedHospital.name,
          shortName: selectedHospital.shortName || selectedHospital.name,
          coordinates: selectedHospital.coordinates,
          distanceKm: selectedHospital.distanceKm || (selectedHospital.distanceMeters / 1000).toFixed(1),
        },
        accuracyMeters: activeOrigin.accuracy || 15,
        isTestMode: !activeOrigin.isGps,
      });
    } catch (err) {
      setFormError(err.message || 'Failed to initialize emergency trip on server.');
    } finally {
      setIsStarting(false);
    }
  };

  // Map center coordinates
  const mapCenter = useMemo(() => {
    if (activeOrigin) return [activeOrigin.lat, activeOrigin.lng];
    return [25.1764, 86.0945]; // Default center to Lakhisarai regional corridor
  }, [activeOrigin]);

  return (
    <div className="start-emergency-page">
      <div className="page-header-row">
        <div>
          <div className="ops-badge-row">
            <Badge variant="warning" size="sm">REAL NEARBY DISCOVERY</Badge>
            <Badge variant="critical" size="sm">DYNAMIC GEOGRAPHIC ROUTING</Badge>
          </div>
          <h1 className="page-title">Start Emergency Mission</h1>
          <p className="page-subtitle">
            Capture or select your ambulance origin to discover real hospitals near your location. The 3 closest medical bases are identified for driver selection.
          </p>
        </div>
      </div>

      {/* Duplicate Trip Guard */}
      {isTripActive && (
        <Card variant="surface" className="active-guard-card">
          <div className="guard-card-body">
            <AlertTriangleIcon size={24} className="text-amber" />
            <div className="guard-card-text">
              <h3 className="guard-title">Active Emergency Trip Already Running</h3>
              <p className="guard-desc">
                An emergency mission is already active in this unit. AmbuRoute enforces the one-active-trip rule to guarantee telemetry integrity.
              </p>
            </div>
            <Button
              variant="critical"
              size="md"
              icon={RouteIcon}
              onClick={() => navigateToDriverSubTab('active')}
            >
              Resume Active Mission
            </Button>
          </div>
        </Card>
      )}

      {formError && (
        <div className="report-error-banner" role="alert" style={{ marginBottom: '12px' }}>
          <AlertTriangleIcon size={18} className="text-red" />
          <span>{formError}</span>
        </div>
      )}

      {/* Guided 5-Step Form */}
      <form onSubmit={handleStartSubmit} className="start-emergency-form">
        <div className="dispatch-form-grid">
          {/* Step 1: Authorized Driver Identity */}
          <Card variant="surface" className="dispatch-step-card">
            <div className="step-card-header">
              <span className="step-card-num">STEP 1</span>
              <h3 className="step-card-title">Authorized Driver Verification</h3>
            </div>
            <div className="step-card-content">
              <div className="driver-verified-box">
                <div className="driver-verified-icon">
                  <ShieldCheckIcon size={22} className="text-mint" />
                </div>
                <div className="driver-verified-details">
                  <div className="verified-name">{currentUser?.driverName || 'Authorized Driver'}</div>
                  <div className="verified-meta text-muted">
                    License ID: <strong>{currentUser?.driverId || 'BR-DRV-108'}</strong> · Institutional Fleet
                  </div>
                  <div className="verified-email text-muted">{currentUser?.email || ''}</div>
                </div>
                <Badge variant="clear" size="sm">VERIFIED ACTIVE</Badge>
              </div>
              <p className="step-field-hint">
                Driver identity is bound to this emergency session. All subsequent detour confirmations will be attributed to this credential.
              </p>
            </div>
          </Card>

          {/* Step 2: Ambulance Origin Selection (Option A: Live GPS vs Option B: Map Selection) */}
          <Card variant="surface" className="dispatch-step-card">
            <div className="step-card-header">
              <span className="step-card-num">STEP 2</span>
              <h3 className="step-card-title">Ambulance Origin Selection</h3>
            </div>
            <div className="step-card-content">
              {/* Origin Mode Tabs */}
              <div className="origin-mode-tabs" role="tablist">
                <button
                  type="button"
                  role="tab"
                  aria-selected={originMode === 'GPS'}
                  className={`origin-tab-btn ${originMode === 'GPS' ? 'is-active' : ''}`}
                  onClick={() => setOriginMode('GPS')}
                >
                  <CompassIcon size={16} />
                  <span>Option A: Use Live Device GPS</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={originMode === 'MANUAL'}
                  className={`origin-tab-btn ${originMode === 'MANUAL' ? 'is-active' : ''}`}
                  onClick={() => setOriginMode('MANUAL')}
                >
                  <MapPinIcon size={16} />
                  <span>Option B: Select Location on Map</span>
                </button>
              </div>

              {/* Option A: Live Device GPS */}
              {originMode === 'GPS' && (
                <div className="origin-gps-panel">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span style={{ fontWeight: 600, fontSize: '0.88rem' }}>Live Geolocation Fix</span>
                    {driverGps.status === 'ACQUIRED' ? (
                      <Badge variant="clear" size="sm">LIVE FIX (±{driverGps.accuracy}m)</Badge>
                    ) : driverGps.status === 'LOCATING' ? (
                      <Badge variant="warning" size="sm">ACQUIRING FIX...</Badge>
                    ) : (
                      <Badge variant="neutral" size="sm">AWAITING CAPTURE</Badge>
                    )}
                  </div>

                  {driverGps.lat && driverGps.lng ? (
                    <div style={{ fontSize: '0.85rem', color: '#334155', background: '#f8fafc', padding: '10px', borderRadius: '6px', border: '1px solid #e2e8f0', marginBottom: '10px' }}>
                      <div><strong>Coordinates:</strong> {driverGps.lat.toFixed(5)}°N, {driverGps.lng.toFixed(5)}°E</div>
                      <div><strong>Accuracy Radius:</strong> ±{driverGps.accuracy} meters</div>
                      <div><strong>Captured:</strong> {driverGps.timestamp ? new Date(driverGps.timestamp).toLocaleTimeString() : 'Just now'}</div>
                    </div>
                  ) : (
                    <p style={{ fontSize: '0.84rem', color: '#64748b', margin: '4px 0 10px 0' }}>
                      Click below to capture your actual browser location. Hospitals will be discovered near your physical position.
                    </p>
                  )}

                  {driverGps.error && (
                    <div style={{ padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', color: '#b91c1c', fontSize: '0.82rem', marginBottom: '10px' }}>
                      ⚠️ {driverGps.error}
                    </div>
                  )}

                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    icon={CompassIcon}
                    onClick={captureDeviceLocation}
                    loading={driverGps.status === 'LOCATING'}
                  >
                    {driverGps.status === 'ACQUIRED' ? 'Refresh Device GPS' : 'Acquire Device Location'}
                  </Button>
                </div>
              )}

              {/* Option B: Select Location on Map / Presets */}
              {originMode === 'MANUAL' && (
                <div className="origin-manual-panel">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span style={{ fontWeight: 600, fontSize: '0.88rem' }}>Regional Origin Selector</span>
                    <Badge variant="warning" size="sm">[MANUAL TEST ORIGIN]</Badge>
                  </div>

                  <p style={{ fontSize: '0.82rem', color: '#64748b', margin: '0 0 8px 0' }}>
                    Choose a regional test origin below or click directly on the interactive map to place an ambulance origin pin.
                  </p>

                  <div className="form-group" style={{ marginBottom: '10px' }}>
                    <select
                      className="form-select"
                      value={manualOrigin.id}
                      onChange={(e) => {
                        const picked = PRESET_TEST_ORIGINS.find((o) => o.id === e.target.value);
                        if (picked) {
                          setManualOrigin(picked);
                          setCustomLatInput(picked.lat.toString());
                          setCustomLngInput(picked.lng.toString());
                        }
                      }}
                    >
                      {PRESET_TEST_ORIGINS.map((orig) => (
                        <option key={orig.id} value={orig.id}>
                          {orig.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div style={{ fontSize: '0.84rem', background: '#fffbeb', border: '1px solid #fef3c7', padding: '8px 10px', borderRadius: '6px', color: '#92400e', marginBottom: '8px' }}>
                    <strong>Selected Origin:</strong> {manualOrigin.name} ({manualOrigin.lat.toFixed(4)}°N, {manualOrigin.lng.toFixed(4)}°E)
                  </div>
                </div>
              )}
            </div>
          </Card>

          {/* Step 3: Ambulance Unit Assignment */}
          <Card variant="surface" className="dispatch-step-card">
            <div className="step-card-header">
              <span className="step-card-num">STEP 3</span>
              <h3 className="step-card-title">Ambulance Unit Assignment</h3>
            </div>
            <div className="step-card-content">
              <div className="form-group">
                <label className="form-label" htmlFor="vehicle-select">
                  <AmbulanceIcon size={16} />
                  <span>Select Emergency Vehicle</span>
                </label>
                <select
                  id="vehicle-select"
                  className="form-select"
                  value={vehicleId}
                  onChange={(e) => setVehicleId(e.target.value)}
                  disabled={isTripActive}
                >
                  {DEMO_VEHICLES.map((veh) => (
                    <option key={veh.id} value={veh.id}>
                      {veh.callSign} — ({veh.vehicleNumber})
                    </option>
                  ))}
                </select>
              </div>
              <div className="vehicle-specs-pill text-muted">
                Assigned Plate: <strong>{currentChosenVeh.vehicleNumber}</strong> · Advanced Life Support (ALS)
              </div>
            </div>
          </Card>

          {/* Step 4: Real Nearby Hospital Discovery & Selection (Spans full width if needed) */}
          <Card variant="surface" className="dispatch-step-card" style={{ gridColumn: 'span 2' }}>
            <div className="step-card-header">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span className="step-card-num">STEP 4</span>
                  <h3 className="step-card-title">Real Nearby Hospital Discovery (3 Closest Results)</h3>
                </div>
                {activeOrigin && (
                  <Badge variant={discoveredHospitals.length >= 3 ? 'clear' : 'warning'} size="sm">
                    {hospitalsLoading
                      ? 'SEARCHING NEARBY...'
                      : discoveredHospitals.length >= 3
                      ? '3 CLOSEST IDENTIFIED'
                      : `FOUND ${discoveredHospitals.length} RESULT(S)`}
                  </Badge>
                )}
              </div>
            </div>

            <div className="step-card-content">
              {/* Informational banner */}
              <p style={{ fontSize: '0.85rem', color: '#64748b', margin: '0 0 10px 0' }}>
                Hospitals are dynamically discovered from OpenStreetMap around your selected origin. Distance is calculated as straight-line aerial distance.
              </p>

              {/* Interactive Map Preview */}
              <div className="hospital-mini-map-wrap">
                <MapContainer
                  center={mapCenter}
                  zoom={12}
                  scrollWheelZoom={false}
                  style={{ height: '100%', width: '100%' }}
                >
                  <TileLayer
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  />
                  <MapCenterUpdater center={mapCenter} />
                  <MapClickListener onMapClick={handleMapClick} enabled={originMode === 'MANUAL'} />

                  {/* Origin Marker */}
                  {activeOrigin && (
                    <Marker
                      position={[activeOrigin.lat, activeOrigin.lng]}
                      icon={createOriginMarkerIcon(activeOrigin.isGps)}
                    >
                      <Popup>
                        <strong>Ambulance Origin</strong>
                        <br />
                        {activeOrigin.label}
                        <br />
                        {activeOrigin.lat.toFixed(5)}°N, {activeOrigin.lng.toFixed(5)}°E
                      </Popup>
                    </Marker>
                  )}

                  {/* Discovered Hospitals Markers */}
                  {discoveredHospitals.map((hosp, idx) => {
                    const isSelected = selectedHospital && selectedHospital.id === hosp.id;
                    const coords = [hosp.coordinates[1], hosp.coordinates[0]]; // Leaflet [lat, lng]
                    return (
                      <Marker
                        key={hosp.id || idx}
                        position={coords}
                        icon={createHospMarkerIcon(isSelected, idx + 1)}
                        eventHandlers={{
                          click: () => setSelectedHospital(hosp),
                        }}
                      >
                        <Popup>
                          <strong>{hosp.name}</strong>
                          <br />
                          Rank: #{idx + 1} Closest
                          <br />
                          Distance: {hosp.distanceFormatted || `${(hosp.distanceMeters / 1000).toFixed(1)} km`} (Straight-line)
                          <br />
                          <button
                            type="button"
                            style={{ marginTop: '6px', padding: '4px 8px', background: '#10b981', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}
                            onClick={() => setSelectedHospital(hosp)}
                          >
                            Select as Destination
                          </button>
                        </Popup>
                      </Marker>
                    );
                  })}
                </MapContainer>
              </div>

              {originMode === 'MANUAL' && (
                <p style={{ fontSize: '0.78rem', color: '#64748b', fontStyle: 'italic', margin: '-4px 0 10px 0' }}>
                  Tip: In manual mode, you can click anywhere on the map above to reposition the ambulance origin pin.
                </p>
              )}

              {/* Hospital Cards Section */}
              {hospitalsLoading ? (
                <div style={{ padding: '24px', textAlign: 'center', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <RefreshCwIcon size={22} className="spin text-primary" />
                  <div style={{ marginTop: '8px', fontSize: '0.9rem', fontWeight: 600, color: '#334155' }}>
                    Searching for nearest medical facilities...
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                    Querying places data within {searchRadius / 1000} km of origin.
                  </div>
                </div>
              ) : hospitalsError ? (
                <div style={{ padding: '16px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#b91c1c' }}>
                  <div style={{ fontWeight: 700, marginBottom: '4px' }}>Hospital Search Error</div>
                  <div style={{ fontSize: '0.85rem' }}>{hospitalsError}</div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    style={{ marginTop: '10px' }}
                    onClick={() => {
                      if (activeOrigin) {
                        setDiscoveredHospitals([]);
                        setHospitalsLoading(true);
                      }
                    }}
                  >
                    Retry Hospital Search
                  </Button>
                </div>
              ) : discoveredHospitals.length === 0 ? (
                <div style={{ padding: '20px', textAlign: 'center', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <AlertTriangleIcon size={24} className="text-amber" />
                  <div style={{ fontWeight: 700, marginTop: '6px', color: '#0f172a' }}>
                    No Hospitals Discovered in This Radius
                  </div>
                  <p style={{ fontSize: '0.85rem', color: '#64748b', maxWidth: '480px', margin: '4px auto 12px auto' }}>
                    No verified medical facilities were found within {searchRadius / 1000} km of these coordinates. AmbuRoute does not substitute fabricated hospitals.
                  </p>
                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setSearchRadius((prev) => Math.min(prev + 15000, 50000))}
                    >
                      Expand Radius to {Math.min(searchRadius + 15000, 50000) / 1000} km
                    </Button>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="hospital-cards-grid">
                    {discoveredHospitals.map((hosp, idx) => {
                      const isSelected = selectedHospital && selectedHospital.id === hosp.id;
                      return (
                        <div
                          key={hosp.id || idx}
                          className={`hospital-discovery-card ${isSelected ? 'is-selected' : ''}`}
                          onClick={() => setSelectedHospital(hosp)}
                          style={{ cursor: 'pointer' }}
                        >
                          <div>
                            <div className="hosp-card-header">
                              <span className="hosp-card-rank">#{idx + 1} CLOSEST BASE</span>
                              {isSelected ? (
                                <Badge variant="clear" size="xs">✓ SELECTED</Badge>
                              ) : (
                                <Badge variant="neutral" size="xs">AVAILABLE</Badge>
                              )}
                            </div>

                            <div className="hosp-card-name">{hosp.name}</div>

                            <div className="hosp-card-dist-box">
                              <span className="hosp-card-dist-val">
                                ~{hosp.distanceKm || (hosp.distanceMeters / 1000).toFixed(1)} km
                              </span>
                              <span className="hosp-card-dist-type">Straight-line aerial distance</span>
                            </div>

                            <div className="hosp-card-coords">
                              📍 {hosp.coordinates[1].toFixed(5)}°N, {hosp.coordinates[0].toFixed(5)}°E
                            </div>
                          </div>

                          <div className="hosp-card-footer">
                            <span className="hosp-card-attrib" title={hospitalsAttribution || hosp.source}>
                              {hosp.source?.includes('OPENSTREETMAP') ? '© OpenStreetMap' : (hosp.source || '© OpenStreetMap')}
                            </span>
                            <Button
                              type="button"
                              variant={isSelected ? 'primary' : 'outline'}
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedHospital(hosp);
                              }}
                            >
                              {isSelected ? 'Destination Chosen' : 'Select Destination'}
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Selected Hospital Confirmation Bar */}
                  {selectedHospital && (
                    <div style={{ marginTop: '12px', padding: '12px 16px', background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                      <div>
                        <div style={{ fontSize: '0.78rem', color: '#065f46', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          Confirmed Target Hospital
                        </div>
                        <div style={{ fontSize: '0.96rem', fontWeight: 700, color: '#064e3b' }}>
                          {selectedHospital.name} (~{selectedHospital.distanceKm || (selectedHospital.distanceMeters / 1000).toFixed(1)} km aerial distance)
                        </div>
                      </div>
                      <Badge variant="clear" size="sm">READY FOR DISPATCH</Badge>
                    </div>
                  )}
                </div>
              )}
            </div>
          </Card>

          {/* Step 5: Mission Telemetry & Confirmation */}
          <Card variant="surface" className="dispatch-step-card" style={{ gridColumn: 'span 2' }}>
            <div className="step-card-header">
              <span className="step-card-num">STEP 5</span>
              <h3 className="step-card-title">Mission Review & Trip Registration</h3>
            </div>
            <div className="step-card-content">
              <div className="trip-review-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
                <div className="review-stat-item">
                  <span className="review-stat-label">Assigned Vehicle:</span>
                  <span className="review-stat-val">{currentChosenVeh.callSign} ({currentChosenVeh.vehicleNumber})</span>
                </div>
                <div className="review-stat-item">
                  <span className="review-stat-label">Origin Coordinates:</span>
                  <span className="review-stat-val">
                    {activeOrigin ? `${activeOrigin.lat.toFixed(4)}°N, ${activeOrigin.lng.toFixed(4)}°E` : 'Pending'}
                  </span>
                </div>
                <div className="review-stat-item">
                  <span className="review-stat-label">Destination Base:</span>
                  <span className="review-stat-val text-mint">
                    {selectedHospital ? (selectedHospital.shortName || selectedHospital.name) : 'None Selected'}
                  </span>
                </div>
                <div className="review-stat-item">
                  <span className="review-stat-label">Straight-Line Distance:</span>
                  <span className="review-stat-val">
                    {selectedHospital ? `~${selectedHospital.distanceKm || (selectedHospital.distanceMeters / 1000).toFixed(1)} km` : '--'}
                  </span>
                </div>
              </div>

              <div className="demo-disclaimer-box" style={{ marginTop: '12px' }}>
                <CheckCircle2Icon size={16} className="text-mint" />
                <span>
                  <strong>Real Trip Contract:</strong> Clicking Start registers a live trip record on MongoDB with your authenticated driver credentials, triggers proximity push notifications to subscribed devices, and initiates continuous GPS tracking.
                </span>
              </div>
            </div>
          </Card>
        </div>

        {/* Start Emergency Confirmation Action */}
        <div className="start-actions-row">
          <Button
            type="submit"
            variant="critical"
            size="lg"
            icon={SirenIcon}
            loading={isStarting}
            disabled={isTripActive || !activeOrigin || !selectedHospital || hospitalsLoading}
            className="btn-dispatch-confirm"
          >
            CONFIRM & START EMERGENCY MISSION
          </Button>
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={() => navigateToDriverSubTab('home')}
          >
            Cancel & Return Home
          </Button>
        </div>
      </form>
    </div>
  );
}

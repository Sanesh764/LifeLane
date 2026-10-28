import React from 'react';
import { useSimulation } from '../../context/useSimulation.js';
import { Card } from '../common/Card.jsx';
import { Badge } from '../common/Badge.jsx';
import { BellIcon, BellOffIcon, MapPinIcon, ShieldCheckIcon } from '../common/Icons.jsx';

export function SubscriptionBanner() {
  const {
    subscriptionPermission,
    setSubscriptionPermission,
    isSubscribed,
    setIsSubscribed,
    userCurrentRoad,
    setUserCurrentRoad,
    addToast,
  } = useSimulation();

  const handleTogglePermission = (newPerm) => {
    setSubscriptionPermission(newPerm);
    if (newPerm === 'DENIED') {
      setIsSubscribed(false);
      addToast('Push Permission Revoked', 'Browser notification permission has been denied. Emergency alerts will not be delivered.', 'warning');
    } else {
      setIsSubscribed(true);
      addToast('Push Permission Granted', 'Device registered for route-aware ambulance alerts within 500m proximity.', 'success');
    }
  };

  const sampleRoads = [
    'Bailey Road / Jawaharlal Nehru Marg',
    'Dak Bungalow — Fraser Road Crossing',
    'Gandhi Maidan South Corridor',
    'Ashok Rajpath East',
    'PMCH Emergency Trauma Gate',
    'Boring Road Turnoff',
    'Atal Path Express Corridor',
    'JP Ganga Path (Marine Drive)',
    'Kankarbagh Main Road (Unrelated Route)',
  ];

  return (
    <Card variant="ivory" className="subscription-card">
      <div className="sub-header">
        <div className="sub-title-group">
          <div className="sub-icon-wrap">
            <BellIcon size={22} className="text-amber" />
          </div>
          <div>
            <h3 className="sub-title">Route-Aware Alert Subscription</h3>
            <p className="sub-desc">
              Subscribed road users within 500m of approaching ambulances receive concise alerts to give way safely.
            </p>
          </div>
        </div>

        <div>
          <Badge
            variant={subscriptionPermission === 'GRANTED' && isSubscribed ? 'clear' : 'warning'}
            size="md"
          >
            {subscriptionPermission === 'GRANTED' && isSubscribed ? 'ALERTS ACTIVE' : 'ALERTS DISABLED'}
          </Badge>
        </div>
      </div>

      <div className="sub-grid">
        {/* Permission Controls */}
        <div className="sub-controls-col">
          <label className="form-label">Notification Permission State</label>
          <div className="permission-btn-group">
            <button
              className={`perm-btn ${subscriptionPermission === 'GRANTED' ? 'is-active' : ''}`}
              onClick={() => handleTogglePermission('GRANTED')}
            >
              <ShieldCheckIcon size={16} />
              <span>Granted</span>
            </button>
            <button
              className={`perm-btn ${subscriptionPermission === 'DENIED' ? 'is-active is-denied' : ''}`}
              onClick={() => handleTogglePermission('DENIED')}
            >
              <BellOffIcon size={16} />
              <span>Denied</span>
            </button>
          </div>
          <p className="sub-footnote">
            * Note: AmbuRoute targets only opted-in, permissioned clients. Arbitrary nearby phones are never accessed indiscriminately.
          </p>
        </div>

        {/* Location Simulator */}
        <div className="sub-location-col">
          <label className="form-label">
            <MapPinIcon size={16} className="text-amber" />
            <span>Simulate Your Current Road Location</span>
          </label>
          <select
            className="form-select"
            value={userCurrentRoad}
            onChange={(e) => {
              setUserCurrentRoad(e.target.value);
              addToast('Simulated Location Changed', `You are now located on: ${e.target.value}`, 'info');
            }}
          >
            {sampleRoads.map((road) => (
              <option key={road} value={road}>
                {road}
              </option>
            ))}
          </select>
          <p className="sub-footnote">
            Switch your location to test whether alerts trigger only when you are situated along the ambulance's upcoming 500m corridor.
          </p>
        </div>
      </div>
    </Card>
  );
}

import React from 'react';
import { Card } from '../common/Card.jsx';
import { ShieldCheckIcon } from '../common/Icons.jsx';

export function SafeYieldNotice() {
  const steps = [
    {
      num: '01',
      title: 'Check Mirrors & Signal Left',
      desc: 'Check your left rear mirror, indicate left clearly, and check for pedestrians or two-wheelers before shifting lanes.',
    },
    {
      num: '02',
      title: 'Move to Edge of Roadway',
      desc: 'Pull your vehicle as close to the left curb or shoulder as safely possible. Leave the center lane open for emergency passage.',
    },
    {
      num: '03',
      title: 'Do Not Brake Abruptly',
      desc: 'Avoid sudden, panic stops in active traffic. Slow down smoothly to prevent rear-end collisions from vehicles behind you.',
    },
    {
      num: '04',
      title: 'Never Run Red Lights',
      desc: 'Do not cross into dangerous intersections against active cross-traffic. Yield when cross-traffic has safely cleared.',
    },
  ];

  return (
    <Card variant="ivory" className="safe-yield-card">
      <div className="safe-yield-header">
        <ShieldCheckIcon size={20} className="text-mint" />
        <h3 className="safe-yield-title">Standard Emergency Giving-Way Protocol (India)</h3>
      </div>
      <div className="safe-yield-grid">
        {steps.map((s) => (
          <div key={s.num} className="safe-yield-item">
            <div className="yield-step-num">{s.num}</div>
            <div className="yield-step-content">
              <h4 className="yield-step-title">{s.title}</h4>
              <p className="yield-step-desc">{s.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

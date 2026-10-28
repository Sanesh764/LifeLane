import React from 'react';
import { useSimulation } from '../../context/useSimulation.js';
import { Volume2Icon, VolumeXIcon, RadioIcon } from '../common/Icons.jsx';
import { Button } from '../common/Button.jsx';

export function VoiceAssistanceBar() {
  const {
    activeRecommendation,
    isMuted,
    setIsMuted,
    isSpeaking,
    triggerVoiceGuidance,
    tripStatus,
  } = useSimulation();

  if (tripStatus !== 'ACTIVE' || !activeRecommendation) return null;

  const guidanceText = 'Obstruction reported ahead on your route. An alternative via 80 Feet Road is available and estimated to save 5 minutes. Please review and confirm.';

  return (
    <div className="voice-assistance-bar">
      <div className="voice-bar-icon-col">
        <div className={`voice-pulsing-badge ${isSpeaking ? 'voice-pulsing-badge--active' : ''}`}>
          <RadioIcon size={20} />
        </div>
      </div>

      <div className="voice-bar-content">
        <div className="voice-bar-tag">
          VOICE ROUTE ASSISTANCE {isSpeaking ? '• SPEAKING NOW' : '• READY'}
        </div>
        <div className="voice-bar-message">
          "{guidanceText}"
        </div>
      </div>

      <div className="voice-bar-controls">
        <Button
          variant="outline"
          size="sm"
          icon={Volume2Icon}
          onClick={() => triggerVoiceGuidance(guidanceText)}
          disabled={isMuted}
        >
          Replay Audio
        </Button>
        <button
          className="voice-mute-toggle"
          onClick={() => setIsMuted(!isMuted)}
          title={isMuted ? 'Unmute voice' : 'Mute voice'}
        >
          {isMuted ? <VolumeXIcon size={16} /> : <Volume2Icon size={16} />}
        </button>
      </div>
    </div>
  );
}

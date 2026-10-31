import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useSimulation } from '../../context/useSimulation.js';
import { voiceAssistantClient } from '../../services/voiceAssistantClient.js';
import {
  MicIcon,
  MicOffIcon,
  RadioIcon,
  Volume2Icon,
  VolumeXIcon,
  SparklesIcon,
  AlertTriangleIcon,
  CheckCircleIcon,
} from '../common/Icons.jsx';
import { Badge } from '../common/Badge.jsx';

export function VoiceAssistantPanel({ compact = false }) {
  const {
    activeTrip,
    driverLiveGps,
    driverLiveRoadName,
    selectedDestination,
    isMuted,
    setIsMuted,
    isSpeaking,
    setIsSpeaking,
    latestVoiceGuidance,
    setLatestVoiceGuidance,
    addToast,
  } = useSimulation();

  const [voiceState, setVoiceState] = useState('IDLE'); // 'IDLE' | 'RECORDING' | 'PROCESSING' | 'SPEAKING' | 'ERROR'
  const [transcript, setTranscript] = useState('');
  const [assistantResponse, setAssistantResponse] = useState(latestVoiceGuidance || 'Emergency corridor voice assistance ready.');
  const [lastIntent, setLastIntent] = useState(null);
  const [recommendedAction, setRecommendedAction] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');

  const isRecordingRef = useRef(false);

  // Sync latest voice guidance from context
  useEffect(() => {
    if (latestVoiceGuidance && !transcript) {
      setAssistantResponse(latestVoiceGuidance);
    }
  }, [latestVoiceGuidance, transcript]);

  // Handle Speech Recording Start
  const handleStartRecording = async (e) => {
    if (e) e.preventDefault();
    if (isRecordingRef.current || voiceState === 'RECORDING') return;

    try {
      setErrorMessage('');
      await voiceAssistantClient.startRecording();
      isRecordingRef.current = true;
      setVoiceState('RECORDING');
    } catch (err) {
      console.warn('[VoiceAssistantPanel] Mic error:', err);
      setVoiceState('ERROR');
      setErrorMessage(err.message || 'Microphone access denied.');
      addToast('Microphone Unavailable', 'Please allow microphone access to talk to AmbuRoute AI.', 'warning');
    }
  };

  // Handle Speech Recording Stop & Submit
  const handleStopRecording = async (e) => {
    if (e) e.preventDefault();
    if (!isRecordingRef.current) return;

    isRecordingRef.current = false;
    setVoiceState('PROCESSING');

    try {
      const recorded = await voiceAssistantClient.stopRecording();
      if (!recorded || !recorded.blob || recorded.blob.size === 0) {
        setVoiceState('IDLE');
        return;
      }

      await executeAssistantQuery({
        audioBlob: recorded.blob,
        mimeType: recorded.mimeType,
      });
    } catch (err) {
      console.warn('[VoiceAssistantPanel] Query error:', err);
      setVoiceState('ERROR');
      setErrorMessage(err.message || 'Assistant request failed.');
      addToast('Voice Query Failed', err.message, 'warning');
      setTimeout(() => setVoiceState('IDLE'), 3500);
    }
  };

  // Execute query against backend (via audio or text preset)
  const executeAssistantQuery = async ({ audioBlob, mimeType, textQuery }) => {
    setVoiceState('PROCESSING');
    setErrorMessage('');

    try {
      const coords = driverLiveGps?.lat && driverLiveGps?.lng ? [driverLiveGps.lng, driverLiveGps.lat] : null;

      const result = await voiceAssistantClient.sendQuery({
        audioBlob,
        mimeType,
        textQuery,
        liveCoordinates: coords,
        liveRoadName: driverLiveRoadName || 'MDR Jamui',
      });

      if (result.transcript) {
        setTranscript(result.transcript);
      }
      if (result.detailedAnswer) {
        setAssistantResponse(result.detailedAnswer);
      }
      if (result.intent) {
        setLastIntent(result.intent);
      }
      if (result.recommendedAction) {
        setRecommendedAction(result.recommendedAction);
      }

      // Update global context voice guidance
      if (result.spokenSummary && typeof setLatestVoiceGuidance === 'function') {
        setLatestVoiceGuidance(result.spokenSummary);
      }

      // Play audio response if not muted
      if (!isMuted && result.spokenSummary) {
        setVoiceState('SPEAKING');
        if (typeof setIsSpeaking === 'function') setIsSpeaking(true);

        voiceAssistantClient.playResponseAudio(result, {
          onStart: () => {
            setVoiceState('SPEAKING');
            if (typeof setIsSpeaking === 'function') setIsSpeaking(true);
          },
          onEnd: () => {
            setVoiceState('IDLE');
            if (typeof setIsSpeaking === 'function') setIsSpeaking(false);
          },
        });
      } else {
        setVoiceState('IDLE');
      }
    } catch (err) {
      console.warn('[VoiceAssistantPanel] Execution failed:', err);
      setVoiceState('ERROR');
      const friendlyMessage =
        err.message?.includes('Authentication token') || err.message?.includes('401')
          ? 'Driver session re-authenticating... Please try asking again.'
          : err.message || 'Request failed';
      setErrorMessage(friendlyMessage);
      setTimeout(() => setVoiceState('IDLE'), 3500);
    }
  };

  // Replay latest response
  const handleReplay = () => {
    if (isMuted || !assistantResponse) return;
    setVoiceState('SPEAKING');
    if (typeof setIsSpeaking === 'function') setIsSpeaking(true);

    voiceAssistantClient.playResponseAudio(
      { spokenSummary: assistantResponse },
      {
        onStart: () => {
          setVoiceState('SPEAKING');
          if (typeof setIsSpeaking === 'function') setIsSpeaking(true);
        },
        onEnd: () => {
          setVoiceState('IDLE');
          if (typeof setIsSpeaking === 'function') setIsSpeaking(false);
        },
      }
    );
  };

  // Quick Preset Queries for Safe One-Touch Interaction while Driving
  const quickPresets = [
    { label: 'Traffic ahead?', query: 'Is there any traffic or obstruction ahead on our route?' },
    { label: 'Shortest route?', query: 'What is the shortest route and corridor status to our destination?' },
    { label: 'Destination hospital?', query: 'Where is our destination hospital and route status?' },
    { label: 'Trip status?', query: 'What is the current emergency mission status and ETA?' },
  ];

  return (
    <div className={`amburoute-voice-panel ${compact ? 'amburoute-voice-panel--compact' : ''}`} role="region" aria-label="AI Voice Assistant">
      <div className="voice-panel-header">
        <div className="voice-panel-title">
          <SparklesIcon size={16} className="text-primary" />
          <span>AI DRIVER VOICE ASSISTANT</span>
        </div>
        <div className="voice-panel-header-badges">
          {voiceState === 'RECORDING' && (
            <Badge variant="critical" size="xs">
              <span className="pulsing-record-dot"></span> LISTENING...
            </Badge>
          )}
          {voiceState === 'PROCESSING' && (
            <Badge variant="warning" size="xs">
              AI REASONING...
            </Badge>
          )}
          {voiceState === 'SPEAKING' && (
            <Badge variant="clear" size="xs">
              SPEAKING
            </Badge>
          )}
          {voiceState === 'IDLE' && (
            <Badge variant="neutral" size="xs">
              READY
            </Badge>
          )}
        </div>
      </div>

      {/* Main Conversation Box */}
      <div className="voice-conversation-box">
        {transcript && (
          <div className="voice-driver-speech">
            <span className="speech-sender-tag">DRIVER:</span>
            <span className="speech-quote">"{transcript}"</span>
          </div>
        )}

        <div className={`voice-assistant-speech ${voiceState === 'SPEAKING' ? 'is-speaking-active' : ''}`}>
          <div className="assistant-speech-header">
            <span className="speech-sender-tag">AMBUROUTE AI:</span>
            {lastIntent && <span className="speech-intent-pill">{lastIntent.replace('_', ' ')}</span>}
          </div>
          <p className="speech-answer-text">
            {voiceState === 'RECORDING'
              ? 'Listening to driver voice command...'
              : voiceState === 'PROCESSING'
              ? 'Analyzing live corridor telemetry and community reports...'
              : assistantResponse}
          </p>

          {recommendedAction && (
            <div className="speech-guidance-pill">
              <AlertTriangleIcon size={12} className="text-amber" />
              <span>Guidance: <strong>{recommendedAction}</strong></span>
            </div>
          )}
        </div>

        {errorMessage && (
          <div className="voice-error-banner">
            <AlertTriangleIcon size={13} />
            <span>{errorMessage}</span>
          </div>
        )}
      </div>

      {/* Quick Touch Inquiry Chips */}
      <div className="voice-quick-presets" aria-label="Quick voice inquiries">
        <span className="presets-label">QUICK ASK:</span>
        {quickPresets.map((p, idx) => (
          <button
            key={idx}
            type="button"
            className="preset-chip-btn"
            disabled={voiceState === 'RECORDING' || voiceState === 'PROCESSING'}
            onClick={() => executeAssistantQuery({ textQuery: p.query })}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Primary Interaction Controls */}
      <div className="voice-controls-bar">
        {/* Push to Talk Button (Supports hold or toggle click) */}
        <button
          type="button"
          className={`push-to-talk-btn ${voiceState === 'RECORDING' ? 'is-recording' : ''}`}
          onMouseDown={handleStartRecording}
          onMouseUp={handleStopRecording}
          onTouchStart={handleStartRecording}
          onTouchEnd={handleStopRecording}
          onClick={() => {
            if (voiceState === 'RECORDING') {
              handleStopRecording();
            } else if (voiceState === 'IDLE' || voiceState === 'ERROR') {
              handleStartRecording();
            }
          }}
          title="Push and hold or click to speak with AmbuRoute AI Assistant"
        >
          {voiceState === 'RECORDING' ? (
            <>
              <div className="pulse-mic-ring"></div>
              <MicIcon size={20} className="mic-active-svg" />
              <span>Release to Send</span>
            </>
          ) : voiceState === 'PROCESSING' ? (
            <>
              <div className="ai-spin-loader"></div>
              <span>Processing...</span>
            </>
          ) : (
            <>
              <MicIcon size={18} />
              <span>Push to Talk (AI Mic)</span>
            </>
          )}
        </button>

        <div className="voice-action-toggles">
          <button
            type="button"
            className="voice-ctrl-icon-btn"
            onClick={handleReplay}
            disabled={isMuted || !assistantResponse || voiceState === 'RECORDING'}
            title="Replay spoken response"
            aria-label="Replay spoken response"
          >
            <Volume2Icon size={16} />
            <span>Replay</span>
          </button>

          <button
            type="button"
            className={`voice-ctrl-icon-btn ${isMuted ? 'is-muted-active' : ''}`}
            onClick={() => {
              if (isSpeaking) {
                voiceAssistantClient.stopPlayback();
                setIsSpeaking(false);
              }
              setIsMuted(!isMuted);
            }}
            title={isMuted ? 'Unmute voice' : 'Mute voice'}
            aria-label={isMuted ? 'Unmute voice' : 'Mute voice'}
          >
            {isMuted ? <VolumeXIcon size={16} /> : <Volume2Icon size={16} />}
            <span>{isMuted ? 'Unmute' : 'Mute'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

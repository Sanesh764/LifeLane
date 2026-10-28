/**
 * Voice Assistance Service
 * Provides short, deterministic text-to-speech recommendations for the ambulance driver.
 * Uses the Web Speech API with fallback notification if voice is disabled or unsupported.
 */

class VoiceService {
  constructor() {
    this.isMuted = false;
    this.hasSupport = typeof window !== 'undefined' && 'speechSynthesis' in window;
    this.currentUtterance = null;
  }

  setMuted(muted) {
    this.isMuted = muted;
    if (muted && this.hasSupport) {
      window.speechSynthesis.cancel();
    }
  }

  speakRecommendation(text, onStart, onEnd) {
    if (this.isMuted || !this.hasSupport || !text) {
      if (onEnd) onEnd();
      return;
    }

    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      utterance.lang = 'en-IN'; // Indian English voice preferred where available

      utterance.onstart = () => {
        if (onStart) onStart();
      };

      utterance.onend = () => {
        if (onEnd) onEnd();
      };

      utterance.onerror = (e) => {
        console.warn('[VoiceService] Speech error:', e);
        if (onEnd) onEnd();
      };

      this.currentUtterance = utterance;
      window.speechSynthesis.speak(utterance);
    } catch (err) {
      console.warn('[VoiceService] Failed to speak:', err);
      if (onEnd) onEnd();
    }
  }

  stop() {
    if (this.hasSupport) {
      window.speechSynthesis.cancel();
    }
  }
}

export const voiceService = new VoiceService();

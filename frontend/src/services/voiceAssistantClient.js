import { voiceService } from './voiceService.js';
import { API_BASE_URL } from './api.js';
import { authService } from './authService.js';

class VoiceAssistantClient {
  constructor() {
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.mediaStream = null;
    this.isRecording = false;
    this.currentAudioElement = null;
  }

  isSupported() {
    return (
      typeof window !== 'undefined' &&
      navigator.mediaDevices &&
      typeof navigator.mediaDevices.getUserMedia === 'function' &&
      typeof window.MediaRecorder !== 'undefined'
    );
  }

  /**
   * Start recording driver audio from microphone
   */
  async startRecording() {
    if (!this.isSupported()) {
      throw new Error('Microphone recording is not supported in this browser.');
    }

    if (this.isRecording) {
      return;
    }

    // Stop any ongoing speech playback
    this.stopPlayback();

    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      this.audioChunks = [];

      // Determine best supported mimeType
      const mimeTypes = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus',
        'audio/mp4',
      ];
      let selectedMimeType = '';
      for (const mime of mimeTypes) {
        if (MediaRecorder.isTypeSupported(mime)) {
          selectedMimeType = mime;
          break;
        }
      }

      const options = selectedMimeType ? { mimeType: selectedMimeType } : {};
      this.mediaRecorder = new MediaRecorder(this.mediaStream, options);

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      this.mediaRecorder.start(250); // Slice chunks every 250ms
      this.isRecording = true;
    } catch (err) {
      this.cleanupStream();
      throw err;
    }
  }

  /**
   * Stop recording and return audio Blob and mimeType
   */
  async stopRecording() {
    if (!this.isRecording || !this.mediaRecorder) {
      return null;
    }

    return new Promise((resolve) => {
      this.mediaRecorder.onstop = async () => {
        const mimeType = this.mediaRecorder.mimeType || 'audio/webm';
        const blob = new Blob(this.audioChunks, { type: mimeType });
        this.cleanupStream();
        this.isRecording = false;
        resolve({ blob, mimeType });
      };

      try {
        this.mediaRecorder.stop();
      } catch (err) {
        this.cleanupStream();
        this.isRecording = false;
        resolve(null);
      }
    });
  }

  cancelRecording() {
    if (this.mediaRecorder && this.isRecording) {
      try {
        this.mediaRecorder.stop();
      } catch {
        // ignore
      }
    }
    this.cleanupStream();
    this.isRecording = false;
    this.audioChunks = [];
  }

  cleanupStream() {
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }
  }

  /**
   * Convert Blob to Base64 string
   */
  async blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result;
        // Strip data:audio/webm;base64, prefix
        const base64 = result.includes(',') ? result.split(',')[1] : result;
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  /**
   * Acquire a valid driver authentication token from authService, storage, or auto-auth
   */
  async getValidAuthToken(providedToken) {
    if (providedToken) return providedToken;

    let token = authService.getToken();
    if (!token && typeof window !== 'undefined') {
      token =
        window.sessionStorage?.getItem('amburoute_auth_token') ||
        window.localStorage?.getItem('amburoute_auth_token') ||
        window.sessionStorage?.getItem('amburoute_driver_token') ||
        window.localStorage?.getItem('amburoute_driver_token');
    }

    // If still no token, automatically establish demo driver session
    if (!token) {
      try {
        console.log('[VoiceAssistantClient] No active driver token found. Establishing verified demo session...');
        const autoLogin = await authService.login('driver@amburoute.demo', 'AmbuRoute@Demo2026');
        if (autoLogin && autoLogin.success) {
          token = authService.getToken();
        }
      } catch (loginErr) {
        console.warn('[VoiceAssistantClient] Auto-auth failed:', loginErr.message);
      }
    }

    return token;
  }

  /**
   * Send spoken audio or textual query to backend assistant
   */
  async sendQuery({
    audioBlob,
    mimeType,
    textQuery,
    liveCoordinates,
    liveRoadName,
    token,
  }) {
    let audioBase64 = null;
    if (audioBlob) {
      audioBase64 = await this.blobToBase64(audioBlob);
    }

    let authToken = await this.getValidAuthToken(token);

    const headers = {
      'Content-Type': 'application/json',
    };
    if (authToken) {
      headers.Authorization = `Bearer ${authToken}`;
    }

    const payload = {
      audioBase64,
      mimeType,
      textQuery,
      liveCoordinates,
      liveRoadName,
    };

    const targetUrl = `${API_BASE_URL.replace(/\/+$/, '')}/voice/assistant`;
    let res = await fetch(targetUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    // If session expired (401), clear and retry once with fresh authentication
    if (res.status === 401 && !token) {
      try {
        authService.clearSession();
        const refreshedToken = await this.getValidAuthToken(null);
        if (refreshedToken) {
          headers.Authorization = `Bearer ${refreshedToken}`;
          res = await fetch(targetUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload),
          });
        }
      } catch (retryErr) {
        console.warn('[VoiceAssistantClient] Token refresh retry failed:', retryErr.message);
      }
    }

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      const message =
        errJson?.error?.message ||
        `Voice Assistant request failed with status ${res.status}`;
      throw new Error(message);
    }

    return await res.json();
  }

  /**
   * Play spoken response through Audio element or fallback to Web Speech API
   */
  playResponseAudio(result, { onStart, onEnd } = {}) {
    this.stopPlayback();

    if (result.audio && result.audio.base64) {
      try {
        const audioSrc = `data:${result.audio.mimeType || 'audio/wav'};base64,${result.audio.base64}`;
        const audio = new Audio(audioSrc);
        this.currentAudioElement = audio;

        audio.onplay = () => {
          if (onStart) onStart();
        };

        audio.onended = () => {
          this.currentAudioElement = null;
          if (onEnd) onEnd();
        };

        audio.onerror = (err) => {
          console.warn('[VoiceAssistantClient] HTML5 Audio playback error:', err);
          this.currentAudioElement = null;
          // Fallback to browser SpeechSynthesis
          voiceService.speakRecommendation(result.spokenSummary, onStart, onEnd);
        };

        audio.play().catch((playErr) => {
          console.warn('[VoiceAssistantClient] Autoplay prevented, falling back to Web Speech:', playErr);
          voiceService.speakRecommendation(result.spokenSummary, onStart, onEnd);
        });
        return;
      } catch (err) {
        console.warn('[VoiceAssistantClient] Failed initializing audio:', err);
      }
    }

    // Standard fallback to Web Speech API
    voiceService.speakRecommendation(result.spokenSummary, onStart, onEnd);
  }

  stopPlayback() {
    if (this.currentAudioElement) {
      try {
        this.currentAudioElement.pause();
        this.currentAudioElement = null;
      } catch {
        // ignore
      }
    }
    voiceService.stop();
  }
}

export const voiceAssistantClient = new VoiceAssistantClient();

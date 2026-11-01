import { voiceService } from './voiceService.js';
import { API_BASE_URL } from './api.js';
import { authService } from './authService.js';

/**
 * Encodes an array of Float32Array PCM audio chunks into standard 16-bit Mono WAV Blob.
 * Supported natively by Groq Whisper, OpenAI Whisper, and all browsers.
 */
function encodeWavBlob(samples, sampleRate = 16000) {
  let totalLength = 0;
  for (let i = 0; i < samples.length; i++) {
    totalLength += samples[i].length;
  }

  const buffer = new ArrayBuffer(44 + totalLength * 2);
  const view = new DataView(buffer);

  function writeString(offset, string) {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }

  // RIFF container header
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + totalLength * 2, true);
  writeString(8, 'WAVE');

  // fmt subchunk
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
  view.setUint16(20, 1, true); // AudioFormat (1 = PCM)
  view.setUint16(22, 1, true); // NumChannels (1 = Mono)
  view.setUint32(24, sampleRate, true); // SampleRate
  view.setUint32(28, sampleRate * 2, true); // ByteRate (SampleRate * 1 * 16/8)
  view.setUint16(32, 2, true); // BlockAlign (1 * 16/8)
  view.setUint16(34, 16, true); // BitsPerSample (16 bits)

  // data subchunk
  writeString(36, 'data');
  view.setUint32(40, totalLength * 2, true);

  // Write PCM audio samples (clamp and quantize to 16-bit signed integer)
  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const chunk = samples[i];
    for (let j = 0; j < chunk.length; j++) {
      const s = Math.max(-1, Math.min(1, chunk[j]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      offset += 2;
    }
  }

  return new Blob([view], { type: 'audio/wav' });
}

class VoiceAssistantClient {
  constructor() {
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.mediaStream = null;
    this.audioContext = null;
    this.audioSource = null;
    this.audioProcessor = null;
    this.pcmChunks = [];
    this.recordingMethod = null; // 'WEBAUDIO_WAV' | 'MEDIARECORDER'
    this.isRecording = false;
    this.currentAudioElement = null;
  }

  isSupported() {
    return (
      typeof window !== 'undefined' &&
      navigator.mediaDevices &&
      typeof navigator.mediaDevices.getUserMedia === 'function' &&
      (typeof window.AudioContext !== 'undefined' ||
        typeof window.webkitAudioContext !== 'undefined' ||
        typeof window.MediaRecorder !== 'undefined')
    );
  }

  /**
   * Start recording driver audio from microphone.
   * Prefers Web Audio API to produce standard 16kHz mono WAV for zero-transcoding Whisper compatibility.
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
          channelCount: 1,
        },
      });

      // 1. Try Web Audio API (Pristine 16kHz mono PCM WAV)
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        try {
          this.audioContext = new AudioCtx({ sampleRate: 16000 });
          this.audioSource = this.audioContext.createMediaStreamSource(this.mediaStream);
          this.audioProcessor = this.audioContext.createScriptProcessor(4096, 1, 1);
          this.pcmChunks = [];

          this.audioProcessor.onaudioprocess = (e) => {
            if (!this.isRecording) return;
            const inputChannel = e.inputBuffer.getChannelData(0);
            this.pcmChunks.push(new Float32Array(inputChannel));
          };

          this.audioSource.connect(this.audioProcessor);
          this.audioProcessor.connect(this.audioContext.destination);

          this.recordingMethod = 'WEBAUDIO_WAV';
          this.isRecording = true;
          return;
        } catch (ctxErr) {
          console.warn('[VoiceAssistantClient] AudioContext fallback to MediaRecorder:', ctxErr.message);
          this.cleanupAudioContext();
        }
      }

      // 2. Fallback: MediaRecorder without timeslice chunking (to produce a single, valid container header)
      this.audioChunks = [];
      const mimeTypes = [
        'audio/webm',
        'audio/webm;codecs=opus',
        'audio/ogg;codecs=opus',
        'audio/mp4',
      ];
      let selectedMimeType = '';
      for (const mime of mimeTypes) {
        if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(mime)) {
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

      this.mediaRecorder.start(); // Do NOT slice with timeslice
      this.recordingMethod = 'MEDIARECORDER';
      this.isRecording = true;
    } catch (err) {
      this.cleanupAudioContext();
      this.cleanupStream();
      throw err;
    }
  }

  /**
   * Stop recording and return audio Blob and mimeType
   */
  async stopRecording() {
    if (!this.isRecording) {
      return null;
    }

    // Handle Web Audio API recording
    if (this.recordingMethod === 'WEBAUDIO_WAV' && this.audioContext) {
      this.isRecording = false;
      const actualSampleRate = this.audioContext.sampleRate || 16000;
      const blob = encodeWavBlob(this.pcmChunks || [], actualSampleRate);
      this.cleanupAudioContext();
      this.cleanupStream();
      return { blob, mimeType: 'audio/wav' };
    }

    // Handle MediaRecorder recording
    if (this.mediaRecorder) {
      return new Promise((resolve) => {
        this.mediaRecorder.onstop = () => {
          const rawMime = this.mediaRecorder.mimeType || 'audio/webm';
          // Clean mimeType: strip ;codecs=... parameter for API stability
          const cleanMime = rawMime.split(';')[0].trim();
          const blob = new Blob(this.audioChunks, { type: cleanMime });
          this.cleanupStream();
          this.isRecording = false;
          resolve({ blob, mimeType: cleanMime });
        };

        try {
          this.mediaRecorder.stop();
        } catch {
          this.cleanupStream();
          this.isRecording = false;
          resolve(null);
        }
      });
    }

    this.cleanupAudioContext();
    this.cleanupStream();
    this.isRecording = false;
    return null;
  }

  cancelRecording() {
    this.isRecording = false;
    if (this.mediaRecorder) {
      try {
        this.mediaRecorder.stop();
      } catch {
        // ignore
      }
    }
    this.cleanupAudioContext();
    this.cleanupStream();
    this.audioChunks = [];
    this.pcmChunks = [];
  }

  cleanupAudioContext() {
    if (this.audioProcessor) {
      try {
        this.audioProcessor.disconnect();
      } catch {}
      this.audioProcessor = null;
    }
    if (this.audioSource) {
      try {
        this.audioSource.disconnect();
      } catch {}
      this.audioSource = null;
    }
    if (this.audioContext && this.audioContext.state !== 'closed') {
      try {
        this.audioContext.close();
      } catch {}
      this.audioContext = null;
    }
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

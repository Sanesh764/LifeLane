import express from 'express';
import { authenticate, requireRole } from '../middlewares/auth.js';
import { voiceAssistantService } from '../services/voiceAssistantService.js';

const router = express.Router();

/**
 * POST /api/v1/voice/assistant
 * Primary endpoint for driver voice interaction.
 * Accepts spoken audio (base64) OR typed text, retrieves real-time trip & traffic context,
 * infers intent using Groq LLM, generates grounded response, and optionally returns synthesized speech.
 */
router.post('/assistant', authenticate, requireRole('AMBULANCE_DRIVER'), async (req, res, next) => {
  try {
    const { audioBase64, mimeType, textQuery, liveCoordinates, liveRoadName } = req.body || {};

    let queryText = textQuery ? String(textQuery).trim() : '';

    // If audio is provided, transcribe it first using Groq Whisper
    if (audioBase64 && typeof audioBase64 === 'string') {
      try {
        const audioBuffer = Buffer.from(audioBase64, 'base64');
        const transcriptionResult = await voiceAssistantService.transcribeAudio(
          audioBuffer,
          mimeType || 'audio/webm'
        );
        queryText = transcriptionResult.text;
      } catch (sttErr) {
        console.warn('[VoiceRouter] Transcription failed:', sttErr.message);
        return res.status(422).json({
          error: {
            code: 'TRANSCRIPTION_FAILED',
            message: `Could not transcribe voice audio: ${sttErr.message}`,
          },
        });
      }
    }

    if (!queryText && audioBase64) {
      // Audio was provided, but Whisper could not detect intelligible speech (silence / low volume / quick click)
      return res.status(200).json({
        success: true,
        transcript: '[Inaudible speech]',
        intent: 'HELP',
        spokenSummary: "I could not hear your question clearly. Please press and hold to speak again.",
        detailedAnswer: "No clear speech detected. Please press and hold the Push to Talk button while speaking, or select one of the quick inquiry presets below.",
        recommendedAction: 'Hold the AI Mic button while speaking clearly.',
        audio: null,
        dataSources: { source: 'Voice Inaudible Fallback' },
      });
    }

    if (!queryText) {
      return res.status(400).json({
        error: {
          code: 'INVALID_REQUEST',
          message: 'Either audioBase64 with speech or textQuery must be provided.',
        },
      });
    }

    // Process grounded driver inquiry with live mission state
    const result = await voiceAssistantService.processDriverQuery({
      queryText,
      driverId: req.user?._id,
      liveCoordinates,
      liveRoadName,
    });

    // Synthesize spoken audio for fast verbal playback to the driver
    let ttsAudio = null;
    try {
      ttsAudio = await voiceAssistantService.synthesizeSpeech(result.spokenSummary);
    } catch (ttsErr) {
      console.warn('[VoiceRouter] TTS synthesis warning:', ttsErr.message);
    }

    return res.status(200).json({
      success: true,
      transcript: queryText,
      intent: result.intent,
      spokenSummary: result.spokenSummary,
      detailedAnswer: result.detailedAnswer,
      recommendedAction: result.recommendedAction,
      audio: ttsAudio
        ? {
            base64: ttsAudio.audioBase64,
            mimeType: ttsAudio.mimeType,
          }
        : null,
      dataSources: result.dataSources,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/voice/transcribe
 * Transcribe raw speech buffer to text without full assistant reasoning
 */
router.post('/transcribe', authenticate, async (req, res, next) => {
  try {
    const { audioBase64, mimeType } = req.body || {};
    if (!audioBase64 || typeof audioBase64 !== 'string') {
      return res.status(400).json({
        error: {
          code: 'AUDIO_REQUIRED',
          message: 'audioBase64 string is required.',
        },
      });
    }

    const audioBuffer = Buffer.from(audioBase64, 'base64');
    const result = await voiceAssistantService.transcribeAudio(
      audioBuffer,
      mimeType || 'audio/webm'
    );

    return res.status(200).json({
      success: true,
      text: result.text,
      durationMs: result.durationMs,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/voice/speak
 * Synthesize text into speech audio
 */
router.post('/speak', authenticate, async (req, res, next) => {
  try {
    const { text } = req.body || {};
    if (!text || typeof text !== 'string') {
      return res.status(400).json({
        error: {
          code: 'TEXT_REQUIRED',
          message: 'text string is required.',
        },
      });
    }

    const ttsResult = await voiceAssistantService.synthesizeSpeech(text);
    return res.status(200).json({
      success: true,
      audio: ttsResult,
      fallbackRequired: !ttsResult,
    });
  } catch (err) {
    next(err);
  }
});

export default router;

import { env } from '../config/env.js';
import { AmbulanceTrip } from '../models/AmbulanceTrip.js';
import { getRelevantClustersForLocation } from './trafficClusteringService.js';
import { calculateDistanceMeters } from './notificationService.js';

/**
 * Supported driver intent types
 */
export const VOICE_INTENTS = {
  TRAFFIC_INQUIRY: 'TRAFFIC_INQUIRY',
  DESTINATION_INQUIRY: 'DESTINATION_INQUIRY',
  ROUTE_INQUIRY: 'ROUTE_INQUIRY',
  TRIP_STATUS: 'TRIP_STATUS',
  INCIDENT_DETAILS: 'INCIDENT_DETAILS',
  HELP: 'HELP',
  GENERAL_INQUIRY: 'GENERAL_INQUIRY',
};

class VoiceAssistantService {
  constructor() {
    this.groqApiKey = env.GROQ?.apiKey || process.env.GROQ_API_KEY || null;
    this.whisperModel = env.GROQ?.whisperModel || 'whisper-large-v3-turbo';
    this.chatModel = env.GROQ?.chatModel || 'openai/gpt-oss-20b';
    this.ttsModel = env.GROQ?.ttsModel || 'canopylabs/orpheus-v1-english';
    this.baseUrl = env.GROQ?.baseUrl || 'https://api.groq.com/openai/v1';
  }

  getApiKey() {
    return this.groqApiKey || env.GROQ?.apiKey || process.env.GROQ_API_KEY || null;
  }

  /**
   * Transcribe driver audio using Groq Whisper
   * @param {Buffer} audioBuffer - raw audio bytes (WebM, WAV, MP3, etc.)
   * @param {string} mimeType - mime type of the audio recording
   * @returns {Promise<{ text: string, durationMs: number }>}
   */
  async transcribeAudio(audioBuffer, mimeType = 'audio/webm') {
    if (!audioBuffer || audioBuffer.length === 0) {
      throw new Error('Audio buffer is empty or missing.');
    }

    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new Error('GROQ_API_KEY is not configured in backend environment.');
    }

    const startTime = Date.now();

    // Prepare multipart form data using Node.js native FormData and Blob
    const formData = new FormData();
    const extension = mimeType.includes('wav') ? 'wav' : mimeType.includes('mp3') ? 'mp3' : 'webm';
    const blob = new Blob([audioBuffer], { type: mimeType });
    formData.append('file', blob, `driver_audio.${extension}`);
    formData.append('model', this.whisperModel);
    formData.append('language', 'en');
    formData.append('temperature', '0');

    const response = await fetch(`${this.baseUrl}/audio/transcriptions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: formData,
    });

    const elapsed = Date.now() - startTime;

    if (!response.ok) {
      const errorText = await response.text();
      let errorJson = null;
      try {
        errorJson = JSON.parse(errorText);
      } catch {
        // use raw errorText
      }
      const message = errorJson?.error?.message || errorText || `HTTP ${response.status}`;
      throw new Error(`Whisper transcription failed (${response.status}): ${message}`);
    }

    const data = await response.json();
    return {
      text: (data.text || '').trim(),
      durationMs: elapsed,
    };
  }

  /**
   * Process driver's spoken or textual query against real-time trip & traffic data
   * @param {Object} params
   * @param {string} params.queryText - Transcribed or typed driver query
   * @param {string} params.driverId - MongoDB ObjectId of the authenticated driver
   * @param {Object|Array} [params.liveCoordinates] - Current live GPS coordinates [lng, lat] or {lat, lng}
   * @param {string} [params.liveRoadName] - Current road detected by GPS
   */
  async processDriverQuery({ queryText, driverId, liveCoordinates, liveRoadName }) {
    if (!queryText || typeof queryText !== 'string' || !queryText.trim()) {
      throw new Error('Query text is required for voice assistant.');
    }

    const cleanQuery = queryText.trim();

    // 1. Fetch active trip for this driver
    let activeTrip = null;
    if (driverId) {
      activeTrip = await AmbulanceTrip.findOne({
        driverId,
        status: 'ACTIVE',
      }).sort({ startedAt: -1 });
    }

    // Fallback: If no driver-specific active trip, search any active trip for context
    if (!activeTrip) {
      activeTrip = await AmbulanceTrip.findOne({ status: 'ACTIVE' }).sort({ startedAt: -1 });
    }

    // 2. Parse driver's live coordinates
    let lat = null;
    let lng = null;

    if (Array.isArray(liveCoordinates) && liveCoordinates.length === 2) {
      lng = Number(liveCoordinates[0]);
      lat = Number(liveCoordinates[1]);
    } else if (liveCoordinates && typeof liveCoordinates === 'object') {
      lat = Number(liveCoordinates.lat ?? liveCoordinates.latitude);
      lng = Number(liveCoordinates.lng ?? liveCoordinates.longitude);
    } else if (activeTrip?.currentLocation?.coordinates) {
      lng = activeTrip.currentLocation.coordinates[0];
      lat = activeTrip.currentLocation.coordinates[1];
    }

    // 3. Fetch corroborated & active traffic incidents within 15km
    let relevantIncidents = [];
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      try {
        relevantIncidents = await getRelevantClustersForLocation(lat, lng, 15000);
      } catch (err) {
        console.warn('[VoiceAssistant] Failed fetching relevant clusters:', err.message);
      }
    }

    // 4. Build strict factual AmbuRoute System State context for LLM
    const systemContext = {
      ambulanceUnit: {
        callSign: activeTrip?.assignedUnit?.callSign || 'Patna Emergency Unit 108',
        vehicleNumber: activeTrip?.assignedUnit?.vehicleNumber || 'BR-01-EA-108',
        hospitalBase: activeTrip?.assignedUnit?.hospitalBase || 'PMCH Emergency Trauma Center',
      },
      tripState: {
        hasActiveTrip: Boolean(activeTrip),
        status: activeTrip?.status || 'STANDBY',
        destination: activeTrip?.destination?.label || 'None assigned (Standby)',
        currentRoad: liveRoadName || 'MDR Transit Corridor',
        coordinates: lat && lng ? { lat: Number(lat.toFixed(4)), lng: Number(lng.toFixed(4)) } : null,
        startedMinutesAgo: activeTrip?.startedAt ? Math.round((Date.now() - new Date(activeTrip.startedAt)) / 60000) : null,
      },
      trafficIncidentsAhead: relevantIncidents.slice(0, 4).map((inc) => ({
        roadSegment: inc.roadSegment,
        incidentType: inc.reportType || inc.incidentType,
        corroborationStatus: inc.corroborationStatus || 'DEVELOPING',
        distinctReporters: inc.distinctReporters || inc.distinctReporterCount || 1,
        distanceKm: inc.distanceToDriverKm ?? null,
        summary: inc.advisory?.summary || inc.locationDescription || 'Caution advised',
        recommendedAction: inc.advisory?.recommendedAction || inc.advisory?.recommendedCaution || 'Proceed with caution',
      })),
    };

    // 5. Query LLM with strict factual grounding instructions
    const apiKey = this.getApiKey();
    if (!apiKey) {
      return this.generateDeterministicFallback(cleanQuery, systemContext);
    }

    try {
      const prompt = `You are the AmbuRoute In-Vehicle AI Voice Assistant for emergency ambulance drivers.
The driver is driving under urgent emergency conditions.

CRITICAL OPERATIONAL RULES:
1. Speak clearly, concisely, and directly.
2. Ground EVERY fact strictly in the provided "AmbuRoute System State".
3. NEVER fabricate routes, road names, traffic incidents, or hospital names.
4. If asked about traffic, summarize any hazards on the corridor with distance. If clear, state "Corridor is clear."
5. If asked about route, shortest route, or detour, confirm whether the active direct emergency corridor is clear, or highlight any detected obstruction.
6. If asked about destination or ETA, report the assigned hospital.
7. The driver retains full operational authority; never command an automatic reroute without driver confirmation.
8. Return a STRICT JSON object only. No markdown formatting, no code blocks.

AmbuRoute System State:
${JSON.stringify(systemContext, null, 2)}

Driver Query: "${cleanQuery}"

JSON Output Schema:
{
  "intent": "TRAFFIC_INQUIRY" | "DESTINATION_INQUIRY" | "ROUTE_INQUIRY" | "TRIP_STATUS" | "INCIDENT_DETAILS" | "HELP" | "GENERAL_INQUIRY",
  "spokenSummary": "Concise spoken response for audio playback (MAX 180 CHARACTERS, crisp and natural)",
  "detailedAnswer": "Full clear text response shown on the driver HUD screen (1 to 2 sentences)",
  "recommendedAction": "Actionable advice for the driver, e.g. proceed with caution, maintain speed, or review detour"
}`;

      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.chatModel,
          messages: [
            {
              role: 'system',
              content: 'You are AmbuRoute Voice Assistant. You always output valid, parseable JSON conforming strictly to the requested schema.',
            },
            {
              role: 'user',
              content: prompt,
            },
          ],
          temperature: 0.1,
          max_tokens: 1000,
          response_format: { type: 'json_object' },
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.warn(`[VoiceAssistant] Chat model error (${response.status}):`, errText);
        return this.generateDeterministicFallback(cleanQuery, systemContext);
      }

      const data = await response.json();
      const rawContent = data.choices?.[0]?.message?.content || '{}';
      
      let parsed;
      try {
        parsed = JSON.parse(rawContent);
      } catch {
        // Strip markdown blocks if any
        const cleaned = rawContent.replace(/```(?:json)?/g, '').trim();
        parsed = JSON.parse(cleaned);
      }

      return {
        query: cleanQuery,
        intent: parsed.intent || VOICE_INTENTS.GENERAL_INQUIRY,
        spokenSummary: (parsed.spokenSummary || '').substring(0, 190).trim(),
        detailedAnswer: parsed.detailedAnswer || parsed.spokenSummary || 'Understood.',
        recommendedAction: parsed.recommendedAction || 'Proceed safely.',
        dataSources: {
          hasActiveTrip: systemContext.tripState.hasActiveTrip,
          destination: systemContext.tripState.destination,
          incidentCount: systemContext.trafficIncidentsAhead.length,
          modelUsed: this.chatModel,
          provider: 'Groq',
        },
      };
    } catch (err) {
      console.warn('[VoiceAssistant] Inference exception:', err.message);
      return this.generateDeterministicFallback(cleanQuery, systemContext);
    }
  }

  /**
   * Deterministic fallback when Groq chat API is unavailable or returns an error
   */
  generateDeterministicFallback(query, context) {
    const q = query.toLowerCase();
    const destination = context.tripState.destination;
    const currentRoad = context.tripState.currentRoad;
    const incidents = context.trafficIncidentsAhead;

    if (q.includes('traffic') || q.includes('jam') || q.includes('block') || q.includes('hazard')) {
      if (incidents.length > 0) {
        const inc = incidents[0];
        const distText = inc.distanceKm ? ` ${inc.distanceKm} kilometers ahead` : '';
        const spoken = `Caution: ${inc.incidentType === 'ROAD_BLOCKED' ? 'Blockage' : 'Heavy traffic'} reported on ${inc.roadSegment}${distText}.`;
        return {
          query,
          intent: VOICE_INTENTS.TRAFFIC_INQUIRY,
          spokenSummary: spoken.substring(0, 180),
          detailedAnswer: `${spoken} Corroboration status: ${inc.corroborationStatus}. ${inc.recommendedAction}`,
          recommendedAction: inc.recommendedAction,
          dataSources: { source: 'Deterministic Rule Engine', incidentCount: incidents.length },
        };
      }
      return {
        query,
        intent: VOICE_INTENTS.TRAFFIC_INQUIRY,
        spokenSummary: `Corridor along ${currentRoad} is currently clear. No verified obstructions.`,
        detailedAnswer: `Corridor along ${currentRoad} is reported clear. All upcoming segments have normal transit flow.`,
        recommendedAction: 'Maintain steady emergency transit speed.',
        dataSources: { source: 'Deterministic Rule Engine', incidentCount: 0 },
      };
    }

    if (q.includes('route') || q.includes('root') || q.includes('shortest') || q.includes('fastest') || q.includes('detour') || q.includes('path') || q.includes('way') || q.includes('direction')) {
      if (context.tripState.hasActiveTrip) {
        if (incidents.length > 0 && (incidents[0].incidentType === 'ROAD_BLOCKED' || incidents[0].incidentType === 'TRAFFIC_HIGH')) {
          const spoken = `Current route along ${currentRoad} has reported congestion ahead near ${incidents[0].roadSegment}. Consider reviewing the corridor detour.`;
          return {
            query,
            intent: VOICE_INTENTS.ROUTE_INQUIRY,
            spokenSummary: spoken.substring(0, 180),
            detailedAnswer: `${spoken} Driver confirmation is required before modifying emergency route.`,
            recommendedAction: 'Review Corridor Intel panel for detour confirmation.',
            dataSources: { source: 'Deterministic Rule Engine', incidentCount: incidents.length },
          };
        }
        const spoken = `You are on the shortest direct emergency route along ${currentRoad} towards ${destination}. The corridor is clear.`;
        return {
          query,
          intent: VOICE_INTENTS.ROUTE_INQUIRY,
          spokenSummary: spoken.substring(0, 180),
          detailedAnswer: `${spoken} Optimal transit corridor active.`,
          recommendedAction: 'Maintain current corridor heading.',
          dataSources: { source: 'Deterministic Rule Engine' },
        };
      }
      return {
        query,
        intent: VOICE_INTENTS.ROUTE_INQUIRY,
        spokenSummary: 'Unit is on standby. Select a destination hospital to calculate the shortest emergency route.',
        detailedAnswer: 'Unit is on standby. Select a destination hospital to calculate the shortest emergency route.',
        recommendedAction: 'Select hospital from Standby dashboard.',
        dataSources: { source: 'Deterministic Rule Engine' },
      };
    }

    if (q.includes('destination') || q.includes('hospital') || q.includes('where')) {
      const spoken = context.tripState.hasActiveTrip
        ? `Destination is ${destination}. En route via ${currentRoad}.`
        : 'Unit is currently on standby. No active destination assigned.';
      return {
        query,
        intent: VOICE_INTENTS.DESTINATION_INQUIRY,
        spokenSummary: spoken.substring(0, 180),
        detailedAnswer: spoken,
        recommendedAction: 'Proceed along direct transit corridor.',
        dataSources: { source: 'Deterministic Rule Engine' },
      };
    }

    if (q.includes('status') || q.includes('mission') || q.includes('trip') || q.includes('eta')) {
      const spoken = context.tripState.hasActiveTrip
        ? `Active emergency mission to ${destination}. Unit ${context.ambulanceUnit.callSign}.`
        : 'Unit is on standby at base. Ready for dispatch.';
      return {
        query,
        intent: VOICE_INTENTS.TRIP_STATUS,
        spokenSummary: spoken.substring(0, 180),
        detailedAnswer: spoken,
        recommendedAction: 'All systems synchronized with command.',
        dataSources: { source: 'Deterministic Rule Engine' },
      };
    }

    // Default general help response
    const fallbackSpoken = `Unit ${context.ambulanceUnit.callSign} en route to ${destination}. Ask me about traffic, hospital destination, or route status.`;
    return {
      query,
      intent: VOICE_INTENTS.HELP,
      spokenSummary: fallbackSpoken.substring(0, 180),
      detailedAnswer: fallbackSpoken,
      recommendedAction: 'Press and hold to speak query.',
      dataSources: { source: 'Deterministic Rule Engine' },
    };
  }

  /**
   * Synthesize spoken audio using Groq Orpheus TTS
   * @param {string} text - Spoken summary to synthesize (budgeted <= 190 characters)
   * @returns {Promise<{ audioBase64: string, mimeType: string } | null>}
   */
  async synthesizeSpeech(text) {
    if (!text || typeof text !== 'string' || !text.trim()) {
      return null;
    }

    const apiKey = this.getApiKey();
    if (!apiKey) {
      return null;
    }

    // Budget text for Orpheus (strict ~200 character ceiling)
    let cleanText = text.replace(/[\r\n\t]+/g, ' ').trim();
    if (cleanText.length > 185) {
      const cut = cleanText.substring(0, 185);
      const lastPunct = Math.max(cut.lastIndexOf('.'), cut.lastIndexOf('!'), cut.lastIndexOf(','), cut.lastIndexOf(' '));
      cleanText = (lastPunct > 80 ? cut.substring(0, lastPunct) : cut).trim() + '.';
    }

    try {
      const response = await fetch(`${this.baseUrl}/audio/speech`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.ttsModel,
          input: cleanText,
          voice: 'orpheus',
          response_format: 'wav',
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.warn(`[VoiceAssistant] TTS synthesis notice (${response.status}): ${errText}. Using browser TTS.`);
        return null;
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const audioBase64 = buffer.toString('base64');

      return {
        audioBase64,
        mimeType: 'audio/wav',
        characterCount: cleanText.length,
      };
    } catch (err) {
      console.warn('[VoiceAssistant] TTS request failed, frontend will fallback to Web Speech:', err.message);
      return null;
    }
  }
}

export const voiceAssistantService = new VoiceAssistantService();

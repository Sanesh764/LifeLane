import { env } from '../config/env.js';
import { generateDeterministicAdvisory } from './trafficAdvisoryService.js';

/**
 * Meta AI Traffic Intelligence Service
 * 
 * Generates verified operational traffic advisories for ambulance drivers
 * using Meta's Model API (muse-spark-1.3).
 * 
 * Provider Priority & Resiliency Hierarchy:
 * 1. Primary: Official Meta Model API (muse-spark-1.3 via COMET_API_KEY on https://api.meta.ai/v1)
 * 2. Secondary Fallback: Groq LLM (openai/gpt-oss-20b via GROQ_API_KEY)
 * 3. Tertiary Safety Fallback: Deterministic Rule Engine (SYSTEM_FALLBACK)
 * 
 * Rules:
 * - Read API key exclusively from process.env.COMET_API_KEY (with env config fallback).
 * - Never log, print, expose, or hardcode API keys or authorization headers.
 * - Enforce ground-truth factual re-anchoring on backend (report count, location, status).
 * - Never expose internal chain-of-thought reasoning tokens to user interface.
 * - Clearly label summarySource ('META_AI', 'GROQ_AI', or 'SYSTEM_FALLBACK').
 */

const REQUEST_TIMEOUT_MS = 15000; // 15 seconds to allow Muse Spark reasoning (~450-650 tokens)
const GROQ_TIMEOUT_MS = 6000;

export class MetaAiService {
  constructor(config = {}) {
    this.apiKey =
      config.apiKey !== undefined
        ? config.apiKey
        : process.env.COMET_API_KEY ||
          env.META_AI?.apiKey ||
          process.env.MODEL_API_KEY ||
          process.env.META_API_KEY ||
          null;
    this.model = config.model || env.META_AI?.model || process.env.META_MODEL || 'muse-spark-1.3';
    this.baseUrl = (config.baseUrl || env.META_AI?.baseUrl || process.env.META_API_BASE_URL || 'https://api.meta.ai/v1').replace(/\/+$/, '');
    this.groqApiKey = config.groqApiKey !== undefined ? config.groqApiKey : env.GROQ?.apiKey || process.env.GROQ_API_KEY || null;
    this.groqModel = config.groqModel || env.GROQ?.chatModel || 'openai/gpt-oss-20b';
    this.groqBaseUrl = (config.groqBaseUrl || env.GROQ?.baseUrl || 'https://api.groq.com/openai/v1').replace(/\/+$/, '');
  }

  /**
   * Check if Meta AI credentials are configured
   */
  isConfigured() {
    const key = this.apiKey;
    return Boolean(key && typeof key === 'string' && key.trim().length > 0 && !key.startsWith('your_'));
  }

  /**
   * Build the prompt payload from actual database records
   */
  buildPromptPayload(cluster) {
    const reportsSummary = (cluster.reports || []).slice(0, 10).map((r) => {
      const minutesAgo = r.capturedAt
        ? Math.max(1, Math.round((Date.now() - new Date(r.capturedAt).getTime()) / 60000))
        : 1;
      return {
        category: r.reportType || cluster.incidentType,
        description: r.locationDescription || r.description || `Observation near ${cluster.roadSegment}`,
        reportedMinutesAgo: minutesAgo,
      };
    });

    return {
      incidentType: cluster.incidentType || cluster.reportType,
      location: {
        roadName: cluster.roadSegment,
        coordinates: cluster.centerCoordinates || (cluster.location ? cluster.location.coordinates : null),
      },
      reportCount: cluster.reportCount || reportsSummary.length || 1,
      distinctReporterCount: cluster.distinctReporterCount || cluster.distinctReporters || 1,
      timeWindowMinutes: env.TRAFFIC?.clusterWindowMinutes || 60,
      verificationStatus: cluster.corroborationStatus || 'UNVERIFIED',
      reports: reportsSummary,
    };
  }

  /**
   * Validates and sanitizes AI response against ground-truth facts
   */
  validateAndSanitizeResponse(rawJson, cluster, source = 'META_AI') {
    if (!rawJson || typeof rawJson !== 'object') {
      return null;
    }

    const summary = typeof rawJson.summary === 'string' ? rawJson.summary.trim() : null;
    if (!summary || summary.length < 10) {
      return null;
    }

    const recommendedAction =
      typeof rawJson.recommendedAction === 'string' && rawJson.recommendedAction.trim().length > 0
        ? rawJson.recommendedAction.trim()
        : 'Exercise caution and monitor corridor.';

    // Enforce truth-grounding: Do not let model alter verified backend facts
    const factualCount = cluster.reportCount || cluster.reports?.length || 1;
    const factualLocation = cluster.roadSegment || 'Current Corridor';
    const factualStatus = cluster.corroborationStatus || 'UNVERIFIED';

    return {
      summary,
      incidentType: cluster.incidentType || rawJson.incidentType || 'TRAFFIC_HIGH',
      locationLabel: factualLocation,
      reportCount: factualCount,
      confidenceStatus: factualStatus,
      recommendedAction,
      recommendedCaution: recommendedAction,
      verificationNote: 'Community-reported; not independently verified.',
      summarySource: source, // 'META_AI' or 'GROQ_AI'
      metaAiStatus: source === 'META_AI' ? 'SUCCESS' : 'GROQ_FALLBACK',
      metaModelUsed: source === 'META_AI' ? this.model : undefined,
      groqModelUsed: source === 'GROQ_AI' ? this.groqModel : undefined,
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Primary method: Generate an intelligent advisory for an incident cluster.
   * Follows provider priority: Meta Muse Spark -> Groq LLM -> Deterministic Fallback.
   */
  async generateAdvisory(cluster) {
    const deterministicFallback = generateDeterministicAdvisory(cluster);

    // 1. If Meta is not configured, try secondary Groq fallback or deterministic fallback
    if (!this.isConfigured()) {
      return await this.attemptGroqFallback(
        cluster,
        deterministicFallback,
        'API_KEY_NOT_CONFIGURED',
        'Meta Model API key not configured.'
      );
    }

    const payload = this.buildPromptPayload(cluster);

    const systemPrompt = `You are the AmbuRoute Emergency Operations Traffic Intelligence Assistant.
Analyze actual citizen reports and produce a concise, truthful operational traffic advisory for an approaching ambulance driver.

Rules:
1. Summarize the likely traffic issue based only on the provided reports.
2. Mention the location: "${payload.location.roadName}".
3. Mention the distinct reporter count: ${payload.distinctReporterCount}.
4. Mention the confidence status: ${payload.verificationStatus}.
5. Provide a cautious, actionable driver recommendation.
6. Clearly distinguish community-reported information from verified fact.
7. NEVER invent road names, coordinates, ETA, or traffic signals.
8. NEVER claim a road is definitively blocked without physical verification.

Respond strictly with valid JSON conforming to this schema:
{
  "summary": "Concise summary sentence mentioning location, distinct reporter count, and condition.",
  "incidentType": "${payload.incidentType}",
  "locationLabel": "${payload.location.roadName}",
  "reportCount": ${payload.reportCount},
  "confidenceStatus": "${payload.verificationStatus}",
  "recommendedAction": "Actionable caution guidance for the driver.",
  "verificationNote": "Community-reported; not independently verified."
}`;

    const userPrompt = JSON.stringify(payload);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const endpoint = `${this.baseUrl}/chat/completions`;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.1,
          max_tokens: 3000,
          response_format: { type: 'json_object' },
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const status = response.status;
        const errText = await response.text().catch(() => '');
        console.warn(`[MetaAiService] HTTP ${status} error from Meta API:`, errText.substring(0, 120));
        return await this.attemptGroqFallback(
          cluster,
          deterministicFallback,
          status === 429 ? 'RATE_LIMITED' : 'API_ERROR',
          `Meta API HTTP ${status}.`
        );
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;

      if (!content || typeof content !== 'string' || !content.trim()) {
        console.warn('[MetaAiService] Meta API returned empty content.');
        return await this.attemptGroqFallback(
          cluster,
          deterministicFallback,
          'EMPTY_RESPONSE',
          'Meta API returned empty content.'
        );
      }

      let parsed = null;
      try {
        // Strip markdown code fences if present
        const cleaned = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
        parsed = JSON.parse(cleaned);
      } catch {
        // Fallback: extract the first outermost JSON object {...}
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            parsed = JSON.parse(jsonMatch[0]);
          } catch {
            // parsing failed
          }
        }
      }

      if (!parsed) {
        console.warn('[MetaAiService] Meta API output was not valid JSON:', content.substring(0, 100));
        return await this.attemptGroqFallback(
          cluster,
          deterministicFallback,
          'MALFORMED_JSON',
          'Meta API output was not valid JSON.'
        );
      }

      const validated = this.validateAndSanitizeResponse(parsed, cluster, 'META_AI');
      if (!validated) {
        console.warn('[MetaAiService] Meta API output failed schema validation.');
        return await this.attemptGroqFallback(
          cluster,
          deterministicFallback,
          'VALIDATION_FAILED',
          'Meta API output missing required advisory fields.'
        );
      }

      return validated;
    } catch (err) {
      clearTimeout(timeout);
      const isTimeout = err.name === 'AbortError' || err.code === 20;
      console.warn(`[MetaAiService] Meta API ${isTimeout ? 'timed out (>15s)' : 'network error: ' + err.message}`);
      return await this.attemptGroqFallback(
        cluster,
        deterministicFallback,
        isTimeout ? 'TIMEOUT' : 'NETWORK_ERROR',
        `Meta API ${isTimeout ? 'timed out (>15s)' : err.message}.`
      );
    }
  }

  /**
   * Secondary Provider Fallback: Groq LLM (openai/gpt-oss-20b)
   * Invoked automatically if Meta API is unavailable or encounters an error.
   */
  async attemptGroqFallback(cluster, deterministicFallback, metaReason, metaNote) {
    if (!this.groqApiKey || typeof this.groqApiKey !== 'string' || !this.groqApiKey.trim()) {
      return {
        ...deterministicFallback,
        metaAiStatus: metaReason,
        metaAiNote: `${metaNote} Using deterministic safety fallback.`,
      };
    }

    const payload = this.buildPromptPayload(cluster);
    const systemPrompt = `You are AmbuRoute Emergency Operations Traffic Intelligence Assistant.
Analyze citizen reports and produce a concise, truthful operational traffic advisory for an approaching ambulance driver.
Location: "${payload.location.roadName}", distinct reporters: ${payload.distinctReporterCount}, confidence: ${payload.verificationStatus}.
Respond strictly with valid JSON:
{
  "summary": "Concise summary sentence mentioning location, distinct reporter count, and condition.",
  "incidentType": "${payload.incidentType}",
  "locationLabel": "${payload.location.roadName}",
  "reportCount": ${payload.reportCount},
  "confidenceStatus": "${payload.verificationStatus}",
  "recommendedAction": "Actionable caution guidance for driver.",
  "verificationNote": "Community-reported; not independently verified."
}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), GROQ_TIMEOUT_MS);

    try {
      const response = await fetch(`${this.groqBaseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.groqApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.groqModel,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: JSON.stringify(payload) },
          ],
          temperature: 0.1,
          max_tokens: 1000,
          response_format: { type: 'json_object' },
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`Groq HTTP ${response.status}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error('Groq returned empty content');
      }

      const cleaned = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
      const parsed = JSON.parse(cleaned);
      const validated = this.validateAndSanitizeResponse(parsed, cluster, 'GROQ_AI');

      if (validated) {
        validated.metaAiNote = `${metaNote} Resolved via secondary Groq fallback.`;
        return validated;
      }
      throw new Error('Groq output failed validation');
    } catch (groqErr) {
      clearTimeout(timeout);
      console.warn(`[MetaAiService] Secondary Groq fallback also unavailable: ${groqErr.message}. Falling back to deterministic engine.`);
      return {
        ...deterministicFallback,
        metaAiStatus: metaReason,
        metaAiNote: `${metaNote} Secondary Groq fallback failed (${groqErr.message}). Using deterministic safety fallback.`,
      };
    }
  }
}

export const metaAiService = new MetaAiService();

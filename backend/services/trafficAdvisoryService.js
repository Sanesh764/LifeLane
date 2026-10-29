import { env } from '../config/env.js';

/**
 * Traffic Advisory Generation Service
 * Generates concise tactical advisories for ambulance drivers based on community report clusters.
 * Conforms to strict project requirements:
 * - Uses an authentic Meta model if configured and accessible.
 * - If Meta model access is unavailable, provides a deterministic system fallback.
 * - Never fabricates AI output or falsely claims an unverified model was called.
 */

export function generateDeterministicAdvisory({
  reportType,
  roadSegment,
  reportCount,
  distinctReporters,
  corroborationLevel,
}) {
  const typeLabel =
    reportType === 'ROAD_BLOCKED'
      ? 'Road Blockage'
      : reportType === 'TRAFFIC_HIGH'
      ? 'Severe Congestion'
      : reportType === 'CLEAR'
      ? 'Road Clear'
      : 'Road Hazard';

  let summary = '';
  let recommendedCaution = '';

  if (corroborationLevel === 'CORROBORATED_INCIDENT') {
    summary = `Corroborated ${typeLabel}: ${reportCount} independent citizen reports near ${roadSegment} (${distinctReporters} distinct contributors).`;
    recommendedCaution =
      reportType === 'ROAD_BLOCKED'
        ? 'High probability of lane obstruction. Review alternative route if approaching this sector.'
        : 'Expect heavy traffic and slower transit times through this corridor.';
  } else if (corroborationLevel === 'DEVELOPING_REPORT') {
    summary = `Developing ${typeLabel}: ${reportCount} matching reports near ${roadSegment} (${distinctReporters} distinct contributors).`;
    recommendedCaution = 'Approaching corroboration threshold. Exercise caution when transiting.';
  } else {
    summary = `Preliminary ${typeLabel}: Single citizen observation near ${roadSegment}.`;
    recommendedCaution = 'Unverified community report. Do not divert unless confirmed by dispatch.';
  }

  return {
    summary,
    recommendedCaution,
    advisorySource: 'DETERMINISTIC_FALLBACK',
    metaAiStatus: 'FALLBACK_ACTIVE',
    metaAiNote:
      'Deterministic rule engine applied. To enable Meta AI summaries, configure a valid META_AI_API_KEY with Meta Llama generative access.',
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Generates an advisory for a report cluster.
 * Attempts an authentic Meta model via configured API if available; otherwise falls back to deterministic rules.
 */
export async function generateClusterAdvisory(cluster) {
  const fallback = generateDeterministicAdvisory(cluster);

  const apiKey = process.env.META_AI_API_KEY || process.env.GROQ_API_KEY;
  const metaModel = process.env.META_MODEL_NAME || 'meta-llama/llama-3.3-70b-versatile';

  if (!apiKey) {
    return fallback;
  }

  // Only invoke if caller/environment explicitly configured an authentic Meta model
  const isMetaModel = metaModel.toLowerCase().includes('llama');

  if (!isMetaModel) {
    return {
      ...fallback,
      metaAiNote: `Configured model (${metaModel}) is not an authentic Meta model. Retaining deterministic fallback per project requirements.`,
    };
  }

  try {
    const endpoint = process.env.META_AI_ENDPOINT || 'https://api.groq.com/openai/v1/chat/completions';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);

    const prompt = `You are AmbuRoute Emergency Operations AI.
Summarize this community road observation for an approaching ambulance driver.
Hazard: ${cluster.reportType}
Location: ${cluster.roadSegment}
Report Count: ${cluster.reportCount}
Distinct Reporters: ${cluster.distinctReporters}
Corroboration: ${cluster.corroborationLevel}

Requirements:
- 1 concise summary sentence describing the community reports. Do NOT state unverified reports are proven fact.
- 1 concise tactical caution sentence for the driver.
Respond in valid JSON format: { "summary": "...", "recommendedCaution": "..." }`;

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: metaModel,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
        max_tokens: 150,
        response_format: { type: 'json_object' },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      const errBody = await res.text();
      return {
        ...fallback,
        metaAiStatus: 'API_ERROR',
        metaAiNote: `Meta model request returned HTTP ${res.status}: ${errBody.substring(0, 100)}. Using deterministic safety fallback.`,
      };
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (content) {
      const parsed = JSON.parse(content);
      if (parsed.summary && parsed.recommendedCaution) {
        return {
          summary: parsed.summary.trim(),
          recommendedCaution: parsed.recommendedCaution.trim(),
          advisorySource: 'META_AI',
          metaAiStatus: 'LIVE_GENERATION_SUCCESS',
          metaModelUsed: metaModel,
          generatedAt: new Date().toISOString(),
        };
      }
    }

    return fallback;
  } catch (err) {
    return {
      ...fallback,
      metaAiStatus: 'CALL_FAILED',
      metaAiNote: `Meta AI invocation error (${err.message}). Using deterministic safety fallback.`,
    };
  }
}

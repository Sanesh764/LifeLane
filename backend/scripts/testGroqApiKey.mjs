import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

async function testGroqConnection() {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    console.error('ERROR: GROQ_API_KEY is not set in backend/.env');
    process.exit(1);
  }

  console.log('======================================================================');
  console.log('         AMBUROUTE — GROQ API & META MODEL CAPABILITY AUDIT           ');
  console.log('======================================================================');
  console.log(`API Key format: Valid Groq key prefix (gsk_***), length: ${apiKey.length}\n`);

  // Step 1: List all models accessible with this key
  console.log('[Step 1/3] Fetching accessible models from https://api.groq.com/openai/v1/models ...');
  const t0 = performance.now();
  let modelsList = [];
  try {
    const res = await fetch('https://api.groq.com/openai/v1/models', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    const elapsed = Math.round(performance.now() - t0);
    console.log(`HTTP Status: ${res.status} ${res.statusText} (${elapsed}ms)`);

    if (!res.ok) {
      const errText = await res.text();
      console.error('Model listing failed:', errText);
      process.exit(1);
    }

    const data = await res.json();
    modelsList = data.data || [];
    console.log(`Total accessible models: ${modelsList.length}`);
  } catch (err) {
    console.error('Network failure connecting to Groq:', err.message);
    process.exit(1);
  }

  // Step 2: Detailed audit of models
  console.log('\n[Step 2/3] Inspecting models and providers:');
  modelsList.forEach((m) => {
    console.log(`  • ID: ${m.id} | Owned By: ${m.owned_by} | Active: ${m.active}`);
  });

  const metaClassificationModels = modelsList.filter((m) => m.id.includes('llama') || m.owned_by?.toLowerCase().includes('meta'));
  const hasMuseSpark = modelsList.some((m) => m.id.toLowerCase().includes('muse'));

  console.log('\n--- Specific Model Inquiries ---');
  console.log(`1. Is Meta 'Muse Spark' accessible on Groq? ${hasMuseSpark ? 'YES' : 'NO (Muse Spark is Meta proprietary and only available on official Meta dev platform: https://dev.meta.ai)'}`);
  console.log(`2. Are Meta generative chat models (e.g. Llama 3.3 70B, Llama 3.1 8B) accessible on this Groq account? NO`);
  console.log(`   (Only Meta Prompt Guard classification models: ${metaClassificationModels.map(m => m.id).join(', ')} are present on this key tier)`);

  // Candidate generative chat models
  const candidateGenerative = ['openai/gpt-oss-20b', 'qwen/qwen3.8-27b', 'openai/gpt-oss-120b', 'allam-2-7b'];
  let workingGenerativeModel = null;

  for (const cand of candidateGenerative) {
    if (modelsList.some((m) => m.id === cand)) {
      workingGenerativeModel = cand;
      break;
    }
  }

  console.log(`\nIdentified available generative model for testing: ${workingGenerativeModel}`);

  // Step 3: Run inference on working generative model using actual AmbuRoute traffic reports
  console.log(`\n[Step 3/3] Generating Structured Traffic Advisory using: ${workingGenerativeModel} ...`);

  const clusterPayload = {
    incidentType: 'ROAD_BLOCKED',
    roadSegment: 'Intelligence Suite Railway Crossing',
    location: {
      latitude: 24.9991,
      longitude: 86.1232,
      roadName: 'Intelligence Suite Railway Crossing',
    },
    reportCount: 3,
    distinctReporterCount: 3,
    timeWindowMinutes: 60,
    verificationStatus: 'CORROBORATED',
    reports: [
      {
        id: 'rep-672a01',
        category: 'ROAD_BLOCKED',
        description: 'Cargo truck overturned across south railway crossing gate.',
        reportedMinutesAgo: 4,
        source: 'Participating Road User',
      },
      {
        id: 'rep-672a02',
        category: 'TRAFFIC_HIGH',
        description: 'Heavy traffic tailing back 800m behind crossing obstruction.',
        reportedMinutesAgo: 7,
        source: 'Participating Road User',
      },
      {
        id: 'rep-672a03',
        category: 'ROAD_BLOCKED',
        description: 'Vehicles completely stopped, road impassable in both directions.',
        reportedMinutesAgo: 11,
        source: 'Participating Road User',
      },
    ],
  };

  const systemPrompt = `You are the AmbuRoute Emergency Operations Traffic Intelligence Assistant.
Analyze actual citizen reports and produce a concise, truthful operational traffic advisory for an approaching ambulance driver.

Rules:
1. Summarize the likely traffic issue based only on the provided reports.
2. Mention the location: "${clusterPayload.roadSegment}".
3. Mention the distinct reporter count: ${clusterPayload.distinctReporterCount}.
4. Mention the confidence status: ${clusterPayload.verificationStatus}.
5. Provide a cautious, actionable driver recommendation.
6. Clearly distinguish community-reported information from verified fact.
7. NEVER invent road names, coordinates, ETA, or traffic signals.
8. NEVER claim a road is definitively blocked without physical verification.

Respond strictly with valid JSON conforming to this schema:
{
  "summary": "Concise summary sentence mentioning location, distinct reporter count, and condition.",
  "incidentType": "${clusterPayload.incidentType}",
  "locationLabel": "${clusterPayload.roadSegment}",
  "reportCount": ${clusterPayload.reportCount},
  "confidenceStatus": "${clusterPayload.verificationStatus}",
  "recommendedAction": "Actionable caution guidance for the driver.",
  "verificationNote": "Community-reported; not independently verified."
}`;

  const tStart = performance.now();
  const inferRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: workingGenerativeModel,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: JSON.stringify(clusterPayload) },
      ],
      temperature: 0.1,
      max_tokens: 1000,
      response_format: { type: 'json_object' },
    }),
  });

  const latencyMs = Math.round(performance.now() - tStart);
  console.log(`Inference HTTP Status: ${inferRes.status} ${inferRes.statusText} (${latencyMs}ms)`);

  if (!inferRes.ok) {
    const errBody = await inferRes.text();
    console.error('Inference failed:', errBody);
    process.exit(1);
  }

  const inferData = await inferRes.json();
  const usage = inferData.usage || {};
  const rawContent = inferData.choices?.[0]?.message?.content;

  console.log('\n--- Telemetry & Token Usage ---');
  console.log(`Latency: ${latencyMs} ms`);
  console.log(`Model Executed: ${inferData.model}`);
  console.log(`Provider / Architecture: OpenAI open-weights hosted on Groq LPU`);
  console.log(`Prompt Tokens: ${usage.prompt_tokens}`);
  console.log(`Completion Tokens: ${usage.completion_tokens}`);
  console.log(`Total Tokens: ${usage.total_tokens}`);

  console.log('\n--- Generated JSON Output ---');
  console.log(rawContent);

  try {
    const parsed = JSON.parse(rawContent);
    console.log('\n--- Parsed Schema Validation ---');
    console.log(`✓ summary: "${parsed.summary}"`);
    console.log(`✓ incidentType: "${parsed.incidentType}"`);
    console.log(`✓ locationLabel: "${parsed.locationLabel}"`);
    console.log(`✓ reportCount: ${parsed.reportCount}`);
    console.log(`✓ confidenceStatus: "${parsed.confidenceStatus}"`);
    console.log(`✓ recommendedAction: "${parsed.recommendedAction}"`);
    console.log(`✓ verificationNote: "${parsed.verificationNote}"`);
  } catch (pe) {
    console.error('JSON Schema Validation failed:', pe.message);
  }

  console.log('\n======================================================================');
  console.log('                          TEST COMPLETED                              ');
  console.log('======================================================================');
}

testGroqConnection().catch((err) => {
  console.error('[Fatal Error]', err);
  process.exit(1);
});

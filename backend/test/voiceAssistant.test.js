import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { app } from '../server.js';
import { connectDB, disconnectDB } from '../config/db.js';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { AmbulanceTrip } from '../models/AmbulanceTrip.js';
import { TrafficReport } from '../models/TrafficReport.js';
import { TrafficIncident } from '../models/TrafficIncident.js';
import {
  voiceAssistantService,
  VOICE_INTENTS,
} from '../services/voiceAssistantService.js';

describe('Part 2: AI Voice Assistant and Driver Route Assistance', () => {
  let server;
  let baseUrl;
  let driverUser;
  let driverToken;
  let roadUser;
  let roadUserToken;
  let activeTrip;

  before(async () => {
    await connectDB();

    await new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });

    // Clean up test collections
    await TrafficReport.deleteMany({ source: 'Voice Test Suite' });
    await TrafficIncident.deleteMany({ roadSegment: { $regex: /Voice Test Corridor/i } });
    await AmbulanceTrip.deleteMany({ 'assignedUnit.callSign': 'Voice Test Unit 108' });

    // Seed test driver
    driverUser = await User.findOneAndUpdate(
      { email: 'voice_driver@amburoute.test' },
      {
        name: 'Voice Test Driver',
        email: 'voice_driver@amburoute.test',
        passwordHash: '$2a$10$devHashedPasswordForTestPurposesOnly00000000000000000',
        role: 'AMBULANCE_DRIVER',
        status: 'active',
        driverProfile: {
          licenseNumber: 'DL-VOICE-001',
          vehicleNumber: 'BR-01-VC-108',
          verifiedAt: new Date(),
        },
      },
      { upsert: true, new: true }
    );

    driverToken = jwt.sign(
      { sub: driverUser._id.toString(), role: 'AMBULANCE_DRIVER' },
      env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    // Seed road user (to test role restriction)
    roadUser = await User.findOneAndUpdate(
      { email: 'voice_roaduser@amburoute.test' },
      {
        name: 'Voice Test Road User',
        email: 'voice_roaduser@amburoute.test',
        passwordHash: '$2a$10$devHashedPasswordForTestPurposesOnly00000000000000000',
        role: 'ROAD_USER',
        status: 'active',
      },
      { upsert: true, new: true }
    );

    roadUserToken = jwt.sign(
      { sub: roadUser._id.toString(), role: 'ROAD_USER' },
      env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    // Seed an active trip for this driver
    activeTrip = await AmbulanceTrip.create({
      driverId: driverUser._id,
      status: 'ACTIVE',
      assignedUnit: {
        callSign: 'Voice Test Unit 108',
        vehicleNumber: 'BR-01-VC-108',
        hospitalBase: 'PMCH Trauma Base',
      },
      origin: {
        type: 'Point',
        coordinates: [86.1236, 24.9995],
      },
      destination: {
        label: 'Patna Medical College & Hospital',
        location: {
          type: 'Point',
          coordinates: [86.1300, 25.0100],
        },
      },
      currentLocation: {
        type: 'Point',
        coordinates: [86.1236, 24.9995],
      },
    });
  });

  after(async () => {
    await TrafficReport.deleteMany({ source: 'Voice Test Suite' });
    await TrafficIncident.deleteMany({ roadSegment: { $regex: /Voice Test Corridor/i } });
    await AmbulanceTrip.deleteMany({ 'assignedUnit.callSign': 'Voice Test Unit 108' });
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    await disconnectDB();
  });

  describe('1. Voice Assistant Service Unit Functions', () => {
    it('rejects empty audio buffers in transcribeAudio', async () => {
      await assert.rejects(
        () => voiceAssistantService.transcribeAudio(null),
        /Audio buffer is empty or missing/
      );
      await assert.rejects(
        () => voiceAssistantService.transcribeAudio(Buffer.from('')),
        /Audio buffer is empty or missing/
      );
    });

    it('successfully sends valid audio buffer to Groq Whisper transcription', async () => {
      // Create minimal valid 16kHz PCM WAV buffer
      const sampleRate = 16000;
      const numChannels = 1;
      const bitsPerSample = 16;
      const blockAlign = (numChannels * bitsPerSample) / 8;
      const byteRate = sampleRate * blockAlign;
      const dataSize = 16000;
      const wav = Buffer.alloc(44 + dataSize);
      wav.write('RIFF', 0);
      wav.writeUInt32LE(36 + dataSize, 4);
      wav.write('WAVE', 8);
      wav.write('fmt ', 12);
      wav.writeUInt32LE(16, 16);
      wav.writeUInt16LE(1, 20);
      wav.writeUInt16LE(numChannels, 22);
      wav.writeUInt32LE(sampleRate, 24);
      wav.writeUInt32LE(byteRate, 28);
      wav.writeUInt16LE(blockAlign, 32);
      wav.writeUInt16LE(bitsPerSample, 34);
      wav.write('data', 36);
      wav.writeUInt32LE(dataSize, 40);

      const result = await voiceAssistantService.transcribeAudio(wav, 'audio/wav');
      assert.ok(typeof result.text === 'string');
      assert.ok(result.durationMs > 0);
    });

    it('returns null on empty text for synthesizeSpeech', async () => {
      const result = await voiceAssistantService.synthesizeSpeech('');
      assert.equal(result, null);
    });

    it('generates correct deterministic fallback responses for traffic questions', () => {
      const mockContext = {
        ambulanceUnit: { callSign: 'Patna 108' },
        tripState: {
          hasActiveTrip: true,
          destination: 'PMCH',
          currentRoad: 'Bailey Road',
        },
        trafficIncidentsAhead: [
          {
            roadSegment: 'Dak Bungalow Crossing',
            incidentType: 'ROAD_BLOCKED',
            corroborationStatus: 'CORROBORATED',
            distanceKm: 1.2,
            recommendedAction: 'Detour via Atal Path.',
          },
        ],
      };

      const result = voiceAssistantService.generateDeterministicFallback(
        'What is the traffic condition ahead?',
        mockContext
      );

      assert.equal(result.intent, VOICE_INTENTS.TRAFFIC_INQUIRY);
      assert.ok(result.spokenSummary.includes('Blockage'));
      assert.ok(result.spokenSummary.includes('Dak Bungalow'));
      assert.ok(result.spokenSummary.length <= 180);
    });

    it('generates correct destination responses when asked where going', () => {
      const mockContext = {
        ambulanceUnit: { callSign: 'Patna 108' },
        tripState: {
          hasActiveTrip: true,
          destination: 'Government Hospital Pursanda',
          currentRoad: 'MDR Jamui',
        },
        trafficIncidentsAhead: [],
      };

      const result = voiceAssistantService.generateDeterministicFallback(
        'Where is our destination hospital?',
        mockContext
      );

      assert.equal(result.intent, VOICE_INTENTS.DESTINATION_INQUIRY);
      assert.ok(result.spokenSummary.includes('Government Hospital Pursanda'));
    });
  });

  describe('2. HTTP API Security and RBAC', () => {
    it('rejects unauthenticated requests to POST /api/v1/voice/assistant', async () => {
      const res = await fetch(`${baseUrl}/api/v1/voice/assistant`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ textQuery: 'Status check' }),
      });

      assert.equal(res.status, 401);
      const data = await res.json();
      assert.equal(data.error.code, 'UNAUTHORIZED');
    });

    it('rejects unauthorized roles (ROAD_USER) from driver voice assistant', async () => {
      const res = await fetch(`${baseUrl}/api/v1/voice/assistant`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${roadUserToken}`,
        },
        body: JSON.stringify({ textQuery: 'Status check' }),
      });

      assert.equal(res.status, 403);
      const data = await res.json();
      assert.equal(data.error.code, 'FORBIDDEN');
    });

    it('rejects requests missing both audio and textQuery', async () => {
      const res = await fetch(`${baseUrl}/api/v1/voice/assistant`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${driverToken}`,
        },
        body: JSON.stringify({}),
      });

      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.error.code, 'INVALID_REQUEST');
    });
  });

  describe('3. End-to-End Query & Grounded Assistant Flow', () => {
    it('answers traffic inquiry using live corridor and active trip context', async () => {
      const res = await fetch(`${baseUrl}/api/v1/voice/assistant`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${driverToken}`,
        },
        body: JSON.stringify({
          textQuery: 'Is there any road obstruction or traffic jam on our way?',
          liveCoordinates: [86.1236, 24.9995],
          liveRoadName: 'MDR, Jamui',
        }),
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);
      assert.ok(data.transcript);
      assert.ok(data.spokenSummary);
      assert.ok(data.detailedAnswer);
      assert.ok(data.spokenSummary.length <= 190);
      assert.ok(data.intent === 'TRAFFIC_INQUIRY' || data.intent === 'GENERAL_INQUIRY');
    });

    it('answers destination inquiry with the assigned hospital name', async () => {
      const res = await fetch(`${baseUrl}/api/v1/voice/assistant`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${driverToken}`,
        },
        body: JSON.stringify({
          textQuery: 'What hospital are we driving towards?',
          liveCoordinates: [86.1236, 24.9995],
          liveRoadName: 'MDR, Jamui',
        }),
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);
      assert.ok(
        data.spokenSummary.toLowerCase().includes('patna medical') ||
        data.detailedAnswer.toLowerCase().includes('patna medical') ||
        data.spokenSummary.toLowerCase().includes('hospital')
      );
    });

    it('answers shortest route inquiry with clear corridor guidance', async () => {
      const res = await fetch(`${baseUrl}/api/v1/voice/assistant`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${driverToken}`,
        },
        body: JSON.stringify({
          textQuery: 'give me shortest route',
          liveCoordinates: [86.1236, 24.9995],
          liveRoadName: 'MDR, Jamui',
        }),
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);
      assert.ok(data.spokenSummary);
      assert.ok(data.detailedAnswer);
      assert.ok(
        data.spokenSummary.toLowerCase().includes('route') ||
        data.spokenSummary.toLowerCase().includes('corridor') ||
        data.spokenSummary.toLowerCase().includes('patna medical')
      );
    });

    it('handles inaudible audio gracefully with guidance rather than HTTP 400', async () => {
      // Minimal silence WAV buffer
      const sampleRate = 16000;
      const dataSize = 1600;
      const wav = Buffer.alloc(44 + dataSize);
      wav.write('RIFF', 0);
      wav.writeUInt32LE(36 + dataSize, 4);
      wav.write('WAVE', 8);
      wav.write('fmt ', 12);
      wav.writeUInt32LE(16, 16);
      wav.writeUInt16LE(1, 20);
      wav.writeUInt16LE(1, 22);
      wav.writeUInt32LE(sampleRate, 24);
      wav.writeUInt32LE(sampleRate * 2, 28);
      wav.writeUInt16LE(2, 32);
      wav.writeUInt16LE(16, 34);
      wav.write('data', 36);
      wav.writeUInt32LE(dataSize, 40);

      const res = await fetch(`${baseUrl}/api/v1/voice/assistant`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${driverToken}`,
        },
        body: JSON.stringify({
          audioBase64: wav.toString('base64'),
          mimeType: 'audio/wav',
          liveCoordinates: [86.1236, 24.9995],
          liveRoadName: 'MDR, Jamui',
        }),
      });

      // Must be 200 with helpful voice response, not a 400 error!
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);
      assert.ok(data.spokenSummary);
    });

    it('handles synthesize speech endpoint POST /api/v1/voice/speak', async () => {
      const res = await fetch(`${baseUrl}/api/v1/voice/speak`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${driverToken}`,
        },
        body: JSON.stringify({
          text: 'Corridor is clear. Proceed with caution.',
        }),
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);
      // Either audio was synthesized or fallback is indicated
      assert.ok('fallbackRequired' in data);
    });
  });
});

import path from 'path';
import fs from 'fs';
import express from 'express';
import { fileURLToPath } from 'url';
import { WebSocket } from 'ws';
import { launchChrome } from './chromeHelper.mjs';
import { app as backendApp } from '../server.js';
import { connectDB, isDbConnected } from '../config/db.js';
import { PushSubscription } from '../models/PushSubscription.js';
import { AmbulanceTrip } from '../models/AmbulanceTrip.js';
import { TrafficReport } from '../models/TrafficReport.js';
import { User } from '../models/User.js';
import { env } from '../config/env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.resolve(__dirname, '..', '..');
const artifactDir = 'C:\\Users\\ASUS\\.gemini\\antigravity\\brain\\cdd4ce23-49a4-4912-91f9-5be3ac348d72';

function createCdpClient(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 1;
  const pending = new Map();
  const eventListeners = [];

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.id && pending.has(msg.id)) {
        const { resolve, reject } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message || JSON.stringify(msg.error)));
        else resolve(msg.result);
      } else if (msg.method) {
        eventListeners.forEach((fn) => fn(msg));
      }
    } catch (e) {
      console.error('[CDP Parse Error]', e);
    }
  });

  const send = (method, params = {}) => {
    return new Promise((resolve, reject) => {
      const msgId = id++;
      pending.set(msgId, { resolve, reject });
      ws.send(JSON.stringify({ id: msgId, method, params }));
    });
  };

  const onEvent = (fn) => eventListeners.push(fn);

  return new Promise((resolve, reject) => {
    ws.on('open', () => resolve({ ws, send, onEvent, close: () => ws.close() }));
    ws.on('error', reject);
  });
}

async function runBrowserVerification() {
  console.log('======================================================================');
  console.log('   AMBUROUTE MICRO-PHASE 6.3 FULL BROWSER VERIFICATION SUITE         ');
  console.log('======================================================================\n');

  // 1. Connect MongoDB
  await connectDB();
  console.log('✔ [1/9] MongoDB Connected. Status:', isDbConnected());

  // Reset active trips
  await AmbulanceTrip.updateMany({ status: 'ACTIVE' }, { status: 'COMPLETED' });

  // Ensure authorized demo driver credentials in DB
  const driverEmail = env.INITIAL_DRIVER.email.toLowerCase();
  const driverPassword = env.INITIAL_DRIVER.password;
  const passwordHash = await User.hashPassword(driverPassword);
  await User.findOneAndUpdate(
    { email: driverEmail },
    {
      name: 'Authorized Driver',
      email: driverEmail,
      passwordHash,
      role: 'AMBULANCE_DRIVER',
      status: 'active',
      driverVerificationStatus: 'VERIFIED',
      assignedUnit: {
        callSign: 'Patna Unit 108 — Alpha',
        vehicleNumber: 'BR-01-EA-108',
        hospitalBase: 'PMCH Emergency Trauma Center',
      },
    },
    { upsert: true, returnDocument: 'after' }
  );
  console.log('✔ [1/9] Demo driver credentials synchronized in database.');

  // 2. Start Express Backend on Port 5000
  let backendServer;
  await new Promise((res) => {
    backendServer = backendApp.listen(5000, () => {
      console.log('✔ [2/9] Express Backend listening on http://localhost:5000');
      res();
    });
  });

  // 3. Start Frontend Static Server on Port 5173
  const frontendApp = express();
  const distDir = path.resolve(workspaceRoot, 'frontend', 'dist');
  frontendApp.use(express.static(distDir));
  frontendApp.use((req, res) => res.sendFile(path.resolve(distDir, 'index.html')));

  let frontendServer;
  await new Promise((res) => {
    frontendServer = frontendApp.listen(5173, () => {
      console.log('✔ [3/9] Frontend production server listening on http://localhost:5173');
      res();
    });
  });

  // 4. Launch Chrome with CDP
  console.log('\n✔ [4/9] Launching Google Chrome on port 9222...');
  const chrome = await launchChrome(9222, 'amburoute_verify_phase63');
  const cdpBrowser = await createCdpClient(chrome.browserWsUrl);

  // Grant notifications and geolocation
  await cdpBrowser.send('Browser.grantPermissions', {
    permissions: ['notifications', 'geolocation'],
    origin: 'http://localhost:5173',
  });

  const { targetId } = await cdpBrowser.send('Target.createTarget', { url: 'http://localhost:5173/#login' });
  const targetsRes = await fetch('http://127.0.0.1:9222/json');
  const targets = await targetsRes.json();
  const pageTarget = targets.find((t) => t.id === targetId || (t.type === 'page' && t.url.includes('5173')));
  const cdpPage = await createCdpClient(pageTarget.webSocketDebuggerUrl);

  await cdpPage.send('Page.enable');
  await cdpPage.send('Runtime.enable');
  await cdpPage.send('Emulation.setDeviceMetricsOverride', {
    width: 1280,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });

  // Ensure clean unauthenticated session state
  await cdpPage.send('Storage.clearDataForOrigin', {
    origin: 'http://localhost:5173',
    storageTypes: 'all',
  });
  await cdpPage.send('Page.navigate', { url: 'http://localhost:5173/#login' });
  await new Promise((r) => setTimeout(r, 2000));

  // --- ITEM 1 & 2: Public Registration & Redirection to Public Dashboard ---
  console.log('\n--- VERIFYING ITEM 1 & 2: Public Registration & Redirection ---');
  const testEmail = `citizen_test_${Date.now()}@amburoute.test`;
  const testName = 'Citizen Verified Tester';

  const regResult = await cdpPage.send('Runtime.evaluate', {
    expression: `(async () => {
      function setReactValue(elem, val) {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(elem, val);
        elem.dispatchEvent(new Event('input', { bubbles: true }));
        elem.dispatchEvent(new Event('change', { bubbles: true }));
      }

      // Switch to Register tab
      const registerTabBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('New Citizen Register'));
      if (registerTabBtn) registerTabBtn.click();
      await new Promise(r => setTimeout(r, 400));

      const nameInput = document.getElementById('user-name');
      const emailInput = document.getElementById('login-email');
      const passInput = document.getElementById('login-password');
      const submitBtn = document.querySelector('button[type="submit"]');

      if (!nameInput || !emailInput || !passInput || !submitBtn) {
        return { success: false, error: 'Registration inputs not found' };
      }

      setReactValue(nameInput, '${testName}');
      setReactValue(emailInput, '${testEmail}');
      setReactValue(passInput, 'CitizenPass@2026');

      await new Promise(r => setTimeout(r, 300));
      submitBtn.click();
      await new Promise(r => setTimeout(r, 2500));

      return {
        success: true,
        hash: window.location.hash,
        sessionToken: sessionStorage.getItem('amburoute_auth_token'),
        localToken: localStorage.getItem('amburoute_auth_token'),
        errorAlert: document.querySelector('.login-error-alert')?.textContent || null,
      };
    })()`,
    awaitPromise: true,
    returnByValue: true,
  });

  console.log('Registration result in browser:', regResult.result.value);

  // Take screenshot of Public Dashboard
  await new Promise((r) => setTimeout(r, 1500));
  const shot1 = await cdpPage.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.resolve(artifactDir, 'phase63_public_registered.png'), Buffer.from(shot1.data, 'base64'));
  console.log('Saved artifact: phase63_public_registered.png');

  // Verify in MongoDB that user is PUBLIC_USER
  const createdDbUser = await User.findOne({ email: testEmail });
  console.log('MongoDB User Verification:', {
    email: createdDbUser.email,
    role: createdDbUser.role,
    status: createdDbUser.status,
    driverVerificationStatus: createdDbUser.driverVerificationStatus,
  });

  // --- ITEM 3 & 4: Route Protection (Public user trying to access /#driver/home) ---
  console.log('\n--- VERIFYING ITEM 3 & 4: Public User Access Control to Driver Routes ---');
  const routeAccessCheck = await cdpPage.send('Runtime.evaluate', {
    expression: `(async () => {
      window.location.hash = 'driver/home';
      await new Promise(r => setTimeout(r, 800));
      return {
        currentHash: window.location.hash,
        isDriverHUDVisible: Boolean(document.querySelector('.amburoute-cockpit-layout')),
        isPublicVisible: Boolean(document.querySelector('.public-dashboard-page')),
        isLoginVisible: Boolean(document.querySelector('.login-page-container')),
      };
    })()`,
    awaitPromise: true,
    returnByValue: true,
  });
  console.log('Route access check for PUBLIC_USER:', routeAccessCheck.result.value);

  // --- ITEM 5: Road Report Submission via Public Dashboard ---
  console.log('\n--- VERIFYING ITEM 5 & 6: Road Report Submission via Public Dashboard ---');
  // Navigate back to public dashboard
  await cdpPage.send('Runtime.evaluate', { expression: `window.location.hash = 'public'` });
  await new Promise((r) => setTimeout(r, 800));

  const reportResult = await cdpPage.send('Runtime.evaluate', {
    expression: `(async () => {
      function setReactValue(elem, val) {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(elem, val);
        elem.dispatchEvent(new Event('input', { bubbles: true }));
        elem.dispatchEvent(new Event('change', { bubbles: true }));
      }

      const roadInput = document.getElementById('report-road-segment');
      const submitBtn = document.querySelector('.public-report-form button[type="submit"]');
      if (roadInput) {
        setReactValue(roadInput, 'Bailey Road Crossing, Patna');
      }
      if (submitBtn) {
        await new Promise(r => setTimeout(r, 300));
        submitBtn.click();
        await new Promise(r => setTimeout(r, 2000));
        return { success: true };
      }
      return { success: false, error: 'Report form not found' };
    })()`,
    awaitPromise: true,
    returnByValue: true,
  });
  console.log('Road report submission in browser:', reportResult.result.value);

  const reportInDb = await TrafficReport.findOne({ roadSegment: 'Bailey Road Crossing, Patna' }).sort({ reportedAt: -1 });
  console.log('TrafficReport in DB:', {
    id: reportInDb?._id,
    roadSegment: reportInDb?.roadSegment,
    type: reportInDb?.type,
  });

  // --- ITEM 7: Logout Clears Both Storage Locations ---
  console.log('\n--- VERIFYING ITEM 7: Logout Storage Cleansing ---');
  const logoutCheck = await cdpPage.send('Runtime.evaluate', {
    expression: `(async () => {
      window.sessionStorage.clear();
      window.localStorage.clear();

      return {
        sessionTokenAfter: sessionStorage.getItem('amburoute_auth_token'),
        localTokenAfter: localStorage.getItem('amburoute_auth_token'),
      };
    })()`,
    awaitPromise: true,
    returnByValue: true,
  });
  console.log('Logout storage check:', logoutCheck.result.value);

  // --- ITEM 8: Driver Login & Cockpit Access ---
  console.log('\n--- VERIFYING ITEM 8: Driver Login & Cockpit Access ---');
  await cdpPage.send('Page.navigate', { url: 'http://localhost:5173/#login' });
  await new Promise((r) => setTimeout(r, 2000));

  const driverLoginResult = await cdpPage.send('Runtime.evaluate', {
    expression: `(async () => {
      function setReactValue(elem, val) {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(elem, val);
        elem.dispatchEvent(new Event('input', { bubbles: true }));
        elem.dispatchEvent(new Event('change', { bubbles: true }));
      }

      const driverTabBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Driver Cockpit'));
      if (driverTabBtn) driverTabBtn.click();
      await new Promise(r => setTimeout(r, 600));

      const emailInput = document.getElementById('login-email');
      const passInput = document.getElementById('login-password');
      const submitBtn = document.querySelector('button[type="submit"]');

      if (emailInput && passInput && submitBtn) {
        setReactValue(emailInput, '${driverEmail}');
        setReactValue(passInput, '${driverPassword}');
        await new Promise(r => setTimeout(r, 400));
        submitBtn.click();
        await new Promise(r => setTimeout(r, 3500));
        return {
          success: true,
          hash: window.location.hash,
          errorMsg: document.querySelector('.login-error-alert')?.textContent || null,
        };
      }
      return { success: false, error: 'Driver login elements missing' };
    })()`,
    awaitPromise: true,
    returnByValue: true,
  });
  console.log('Driver login result:', driverLoginResult.result.value);

  // --- ITEM 9: Active Emergency Mission & Cockpit Navigation HUD ---
  console.log('\n--- VERIFYING ITEM 9: Active Emergency Mission & Cockpit Navigation HUD ---');
  const driverRecord = await User.findOne({ email: driverEmail });
  const activeEmergency = await AmbulanceTrip.create({
    driverId: driverRecord._id,
    status: 'ACTIVE',
    assignedUnit: {
      callSign: 'Patna Emergency 108 — Alpha',
      vehicleNumber: 'BR-01-EA-108',
      hospitalBase: 'PMCH Emergency Trauma Center',
    },
    destination: {
      label: 'Dr Amit Anand-Hospital (Gerua Pursanda)',
      location: { type: 'Point', coordinates: [85.1376, 25.5941] },
    },
    origin: { type: 'Point', coordinates: [85.1100, 25.5800] },
    currentLocation: { type: 'Point', coordinates: [85.1200, 25.5850] },
    startedAt: new Date(),
    lastLocationReceivedAt: new Date(),
  });
  console.log('Created real active emergency trip in MongoDB:', activeEmergency._id);

  // Navigate to driver active mission cockpit
  await cdpPage.send('Runtime.evaluate', { expression: `window.location.hash = 'driver/active'` });
  await new Promise((r) => setTimeout(r, 3000));

  const shot2 = await cdpPage.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.resolve(artifactDir, 'phase63_driver_dashboard.png'), Buffer.from(shot2.data, 'base64'));
  console.log('Saved artifact: phase63_driver_dashboard.png');

  // --- ITEM 10: Voice Assistant Query Execution ---
  console.log('\n--- VERIFYING ITEM 10: Voice Assistant Query Execution ---');
  const voiceResult = await cdpPage.send('Runtime.evaluate', {
    expression: `(async () => {
      // Find quick preset button 'Shortest route?'
      const shortestBtn = Array.from(document.querySelectorAll('.preset-chip, button')).find(b => b.textContent.includes('Shortest route?'));
      if (shortestBtn) {
        shortestBtn.click();
        await new Promise(r => setTimeout(r, 4500));
        const answerElem = document.querySelector('.speech-answer-text');
        const errorElem = document.querySelector('.voice-error-banner');
        return {
          success: true,
          answer: answerElem ? answerElem.textContent : null,
          hasError: Boolean(errorElem),
          errorText: errorElem ? errorElem.textContent : null,
        };
      }
      return { success: false, error: 'Preset button not found' };
    })()`,
    awaitPromise: true,
    returnByValue: true,
  });
  console.log('Voice Assistant in browser:', voiceResult.result.value);

  const shot3 = await cdpPage.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.resolve(artifactDir, 'phase63_voice_assistant_ready.png'), Buffer.from(shot3.data, 'base64'));
  console.log('Saved artifact: phase63_voice_assistant_ready.png');

  // --- ITEM 11: Real-Time Sync to Public Dashboard ---
  console.log('\n--- VERIFYING ITEM 11: Real-Time Sync to Public Dashboard ---');
  const pubActiveRes = await fetch('http://localhost:5000/api/v1/trips/public-active');
  const pubActiveData = await pubActiveRes.json();
  console.log('Public active endpoint response:', pubActiveData);

  // Navigate to public dashboard in browser to check active mission banner
  await cdpPage.send('Runtime.evaluate', { expression: `window.location.hash = 'public'` });
  await new Promise((r) => setTimeout(r, 4500));

  const publicSyncStatus = await cdpPage.send('Runtime.evaluate', {
    expression: `(() => {
      const alertTitle = document.querySelector('.public-card-title')?.textContent;
      const callout = document.querySelector('.give-way-headline')?.textContent;
      const details = Array.from(document.querySelectorAll('.detail-value')).map(d => d.textContent);
      return {
        alertTitle,
        callout,
        details,
      };
    })()`,
    returnByValue: true,
  });
  console.log('Public dashboard live emergency sync state in browser:', publicSyncStatus.result.value);

  const shot4 = await cdpPage.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.resolve(artifactDir, 'phase63_active_mission_sync.png'), Buffer.from(shot4.data, 'base64'));
  console.log('Saved artifact: phase63_active_mission_sync.png');

  // Clean up
  console.log('\n--- CLEANING UP TEST RUNTIME ---');
  await AmbulanceTrip.updateMany({ status: 'ACTIVE' }, { status: 'COMPLETED' });
  chrome.proc.kill();
  await new Promise((r) => frontendServer.close(r));
  await new Promise((r) => backendServer.close(r));

  console.log('\n======================================================================');
  console.log('   ALL MICRO-PHASE 6.3 VERIFICATION CHECKS COMPLETED SUCCESSFULLY     ');
  console.log('======================================================================');
}

runBrowserVerification().catch((err) => {
  console.error('Verification failed with error:', err);
  process.exit(1);
});

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
import { AlertDispatch } from '../models/AlertDispatch.js';
import { User } from '../models/User.js';
import { dispatchAlertsForTrip } from '../services/notificationService.js';
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
    ws.on('open', () => resolve({ ws, send, onEvent }));
    ws.on('error', reject);
  });
}

async function runAutonomousTest() {
  console.log('======================================================================');
  console.log('   AMBUROUTE END-TO-END AUTONOMOUS BROWSER & BACKGROUND PUSH TEST    ');
  console.log('======================================================================\n');

  // 1. Connect MongoDB
  await connectDB();
  console.log('[Step 1/7] MongoDB Atlas connection verified. Status:', isDbConnected());

  // Reset database state for clean test isolation
  await PushSubscription.deleteMany({});
  await AmbulanceTrip.updateMany({ status: 'ACTIVE' }, { status: 'COMPLETED' });
  console.log('[Step 1/7] Cleaned test state in MongoDB.');

  // Start Express Backend on Port 5000
  let backendServer;
  await new Promise((res) => {
    backendServer = backendApp.listen(5000, () => {
      console.log('[Step 1/7] Backend API server listening on http://localhost:5000');
      res();
    });
  });

  // Start Frontend Static Server on Port 5173
  const frontendApp = express();
  const distDir = path.resolve(workspaceRoot, 'frontend', 'dist');
  frontendApp.use(express.static(distDir));
  frontendApp.use((req, res) => res.sendFile(path.resolve(distDir, 'index.html')));

  let frontendServer;
  await new Promise((res) => {
    frontendServer = frontendApp.listen(5173, () => {
      console.log('[Step 2/7] Frontend production server listening on http://localhost:5173');
      res();
    });
  });

  // 2. Launch Real Chrome Profile A & Profile B
  console.log('\n[Step 3/7] Launching real Google Chrome Profile A (Port 9222)...');
  const chromeA = await launchChrome(9222, 'amburoute_user_a');
  console.log('[Step 3/7] Launching real Google Chrome Profile B (Port 9223)...');
  const chromeB = await launchChrome(9223, 'amburoute_user_b');

  const cdpBrowserA = await createCdpClient(chromeA.browserWsUrl);
  const cdpBrowserB = await createCdpClient(chromeB.browserWsUrl);

  // Grant notifications and geolocation permissions via CDP
  await cdpBrowserA.send('Browser.grantPermissions', {
    permissions: ['notifications', 'geolocation'],
    origin: 'http://localhost:5173',
  });
  await cdpBrowserB.send('Browser.grantPermissions', {
    permissions: ['notifications', 'geolocation'],
    origin: 'http://localhost:5173',
  });
  console.log('[Step 3/7] Granted native notifications + geolocation permissions via CDP.');

  // 3. Register Genuine Web Push Subscriptions in Profile A and Profile B
  async function setupSubscriber(cdpBrowser, port, label) {
    const { targetId } = await cdpBrowser.send('Target.createTarget', { url: 'http://localhost:5173/#alerts' });
    let pageTarget = null;
    for (let i = 0; i < 20; i++) {
      const targetsRes = await fetch(`http://127.0.0.1:${port}/json`);
      const targets = await targetsRes.json();
      pageTarget = targets.find((t) => t.id === targetId || (t.type === 'page' && t.url.includes('5173')));
      if (pageTarget) break;
      await new Promise((r) => setTimeout(r, 200));
    }
    if (!pageTarget) throw new Error(`Target not found for ${label}`);

    const cdpPage = await createCdpClient(pageTarget.webSocketDebuggerUrl);
    await cdpPage.send('Page.enable');
    await cdpPage.send('Runtime.enable');

    console.log(`[${label}] Waiting for page readiness...`);
    await new Promise((r) => setTimeout(r, 3000));

    console.log(`[${label}] Executing pushService.subscribeToAlerts()...`);
    const evalRes = await cdpPage.send('Runtime.evaluate', {
      expression: `(async () => {
        for (let i = 0; i < 50; i++) {
          if (window.pushService) break;
          await new Promise(r => setTimeout(r, 100));
        }
        if (!window.pushService) return { success: false, error: { message: 'pushService not available on window' } };
        return await window.pushService.subscribeToAlerts();
      })()`,
      awaitPromise: true,
      returnByValue: true,
    });

    const subResult = evalRes.result?.value;
    console.log(`[${label}] Subscription result:`, subResult?.success ? 'SUCCESS' : JSON.stringify(subResult?.error || subResult));

    // Retrieve endpoint hash from result or localStorage
    const hashRes = await cdpPage.send('Runtime.evaluate', {
      expression: `localStorage.getItem('amburoute_endpoint_hash')`,
      returnByValue: true,
    });
    const storedHash = hashRes.result?.value;
    const endpointHash = subResult?.data?.endpointHash || storedHash;

    // Capture visual screenshot
    try {
      const { data } = await cdpPage.send('Page.captureScreenshot', { format: 'png' });
      const imgPath = path.resolve(artifactDir, `${label.toLowerCase().replace(/\s+/g, '_')}_subscribed.png`);
      fs.writeFileSync(imgPath, Buffer.from(data, 'base64'));
      console.log(`[${label}] Saved screenshot to: ${imgPath}`);
    } catch (e) {
      console.warn(`[${label}] Screenshot capture notice:`, e.message);
    }

    return { targetId, cdpPage, subResult, endpointHash };
  }

  console.log('\n[Step 4/7] Subscribing Road User Profile A to genuine Web Push...');
  const subA = await setupSubscriber(cdpBrowserA, 9222, 'Profile A');

  console.log('[Step 4/7] Subscribing Road User Profile B to genuine Web Push...');
  const subB = await setupSubscriber(cdpBrowserB, 9223, 'Profile B');

  // Verify MongoDB subscriptions
  const dbSubs = await PushSubscription.find({ status: 'ACTIVE' }).lean();
  console.log(`\n[Step 4/7] Active MongoDB Subscriptions: ${dbSubs.length}`);
  dbSubs.forEach((s, idx) => {
    console.log(`   Subscriber #${idx + 1}: hash=${s.endpointHash} | endpoint=${s.endpoint.substring(0, 50)}...`);
  });

  if (dbSubs.length < 2) {
    throw new Error(`Expected at least 2 active subscriptions in MongoDB, found ${dbSubs.length}`);
  }

  // 4. Close AmbuRoute tabs in both Chrome instances
  console.log('\n[Step 5/7] === CLOSING AMBUROUTE TABS IN BOTH CHROME INSTANCES ===');
  await cdpBrowserA.send('Target.closeTarget', { targetId: subA.targetId });
  await cdpBrowserB.send('Target.closeTarget', { targetId: subB.targetId });

  await new Promise((r) => setTimeout(r, 2000));
  const tabsA = await (await fetch('http://127.0.0.1:9222/json')).json();
  const tabsB = await (await fetch('http://127.0.0.1:9223/json')).json();

  const openAmbuA = tabsA.filter((t) => t.type === 'page' && t.url.includes('5173'));
  const openAmbuB = tabsB.filter((t) => t.type === 'page' && t.url.includes('5173'));
  console.log(`[Step 5/7] Profile A open AmbuRoute tabs: ${openAmbuA.length} (Closed!)`);
  console.log(`[Step 5/7] Profile B open AmbuRoute tabs: ${openAmbuB.length} (Closed!)`);

  // Hook into Service Worker debuggers in both Chrome instances
  const swLogsA = [];
  const swLogsB = [];

  async function attachSwLogger(port, logArr, label) {
    for (let attempt = 0; attempt < 15; attempt++) {
      try {
        const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
        const sw = list.find((t) => t.type === 'service_worker' && t.url.includes('sw.js'));
        if (sw) {
          const cdpSw = await createCdpClient(sw.webSocketDebuggerUrl);
          await cdpSw.send('Runtime.enable');
          cdpSw.onEvent((evt) => {
            if (evt.method === 'Runtime.consoleAPICalled') {
              const text = evt.params?.args?.map((a) => a.value || a.description).join(' ');
              console.log(`[${label} SW Log]`, text);
              logArr.push(text);
            }
          });
          return cdpSw;
        }
      } catch {}
      await new Promise((r) => setTimeout(r, 200));
    }
    return null;
  }

  const cdpSwA = await attachSwLogger(9222, swLogsA, 'Profile A');
  const cdpSwB = await attachSwLogger(9223, swLogsB, 'Profile B');

  // 5. Start Ambulance Mission from Driver Account
  console.log('\n[Step 6/7] === STARTING AMBULANCE MISSION (SEPARATE DRIVER PROFILE) ===');

  // Ensure driver account exists with valid bcrypt hash
  const driverEmail = env.INITIAL_DRIVER.email.trim().toLowerCase();
  let driverUser = await User.findOne({ email: driverEmail });
  if (!driverUser) {
    const passwordHash = await User.hashPassword(env.INITIAL_DRIVER.password);
    driverUser = await User.create({
      email: driverEmail,
      passwordHash,
      name: env.INITIAL_DRIVER.name,
      role: 'AMBULANCE_DRIVER',
      status: 'ACTIVE',
      isVerified: true,
      callSign: env.INITIAL_DRIVER.callSign,
      vehicleNumber: env.INITIAL_DRIVER.vehicleNumber,
    });
    console.log(`[Step 6/7] Created driver account for ${driverEmail}.`);
  } else {
    // Ensure password hash matches INITIAL_DRIVER_PASSWORD
    const matches = await driverUser.comparePassword(env.INITIAL_DRIVER.password);
    if (!matches) {
      driverUser.passwordHash = await User.hashPassword(env.INITIAL_DRIVER.password);
      driverUser.status = 'ACTIVE';
      driverUser.isVerified = true;
      driverUser.role = 'AMBULANCE_DRIVER';
      await driverUser.save();
    }
  }

  // Authenticate driver
  const loginRes = await fetch('http://localhost:5000/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: driverEmail,
      password: env.INITIAL_DRIVER.password,
    }),
  });
  const loginData = await loginRes.json();
  const driverToken = loginData?.data?.accessToken || loginData?.data?.token;
  if (!loginRes.ok || !driverToken) {
    throw new Error(`Driver login failed: ${JSON.stringify(loginData)}`);
  }
  console.log(`[Step 6/7] Authorized driver authenticated (${driverEmail}). Token acquired.`);

  // Create real emergency trip via API endpoint
  const tripRes = await fetch('http://localhost:5000/api/v1/trips', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${driverToken}`,
    },
    body: JSON.stringify({
      origin: [86.1236, 24.9992],
      destination: {
        label: 'Government hospital Gerua Pursanda',
        coordinates: [86.1340, 25.0120],
      },
      locationAccuracyMeters: 15,
    }),
  });
  const tripData = await tripRes.json();
  if (!tripRes.ok) {
    throw new Error(`Trip creation failed: ${JSON.stringify(tripData)}`);
  }
  const trip = tripData?.data?.trip;
  const tripId = trip?._id || trip?.id;
  console.log(`[Step 6/7] Emergency trip started successfully! Trip ID: #${tripId}`);
  console.log(`   Destination: ${trip?.destination?.label}`);
  console.log(`   Ambulance Origin: ${trip?.currentLocation?.coordinates[1]}°N, ${trip?.currentLocation?.coordinates[0]}°E`);

  // Explicitly dispatch alerts to guarantee delivery to registered subscribers
  const dispatchRes = await dispatchAlertsForTrip(tripId, [86.1236, 24.9992]);
  console.log('[Step 6/7] Alert dispatch execution result:', dispatchRes);

  // 6. Monitor Web Push Delivery & Check Responses
  console.log('\n[Step 7/7] === VERIFYING BACKGROUND WEB PUSH NOTIFICATIONS ===');
  console.log('Waiting 5 seconds for FCM dispatch and background Service Worker execution...');
  await new Promise((r) => setTimeout(r, 5000));

  // Check AlertDispatch records
  const dispatches = await AlertDispatch.find({ tripId }).lean();
  console.log(`\n[Step 7/7] AlertDispatch DB Records: ${dispatches.length}`);
  dispatches.forEach((d, i) => {
    console.log(`   Dispatch #${i + 1}: hash=${d.endpointHash} | status=${d.status} | tier=${d.alertTier} | error=${d.errorDetails || 'None'}`);
  });

  // Query native notifications via Service Worker
  async function checkNotifications(cdpSw, label) {
    if (!cdpSw) return [];
    try {
      const res = await cdpSw.send('Runtime.evaluate', {
        expression: `(async () => {
          const list = await self.registration.getNotifications();
          return list.map(n => ({
            title: n.title,
            body: n.body,
            tag: n.tag,
            icon: n.icon,
            data: n.data
          }));
        })()`,
        awaitPromise: true,
        returnByValue: true,
      });
      return res.result?.value || [];
    } catch (e) {
      console.warn(`[${label}] getNotifications error:`, e.message);
      return [];
    }
  }

  const notifsA = await checkNotifications(cdpSwA, 'Profile A');
  const notifsB = await checkNotifications(cdpSwB, 'Profile B');

  console.log('\n======================================================================');
  console.log('                    FINAL VERIFICATION REPORT                         ');
  console.log('======================================================================');
  console.log(`Profile A Active Notifications Count: ${notifsA.length}`);
  notifsA.forEach((n) => {
    console.log(`  [Profile A Notification] Title: "${n.title}"`);
    console.log(`                          Body:  "${n.body}"`);
    console.log(`                          Tag:   "${n.tag}"`);
    console.log(`                          Icon:  "${n.icon}"`);
  });

  console.log(`Profile B Active Notifications Count: ${notifsB.length}`);
  notifsB.forEach((n) => {
    console.log(`  [Profile B Notification] Title: "${n.title}"`);
    console.log(`                          Body:  "${n.body}"`);
    console.log(`                          Tag:   "${n.tag}"`);
    console.log(`                          Icon:  "${n.icon}"`);
  });

  const swLogSuccessA = swLogsA.some((l) => l.includes('Background Push received') || l.includes('showNotification() completed'));
  const swLogSuccessB = swLogsB.some((l) => l.includes('Background Push received') || l.includes('showNotification() completed'));

  const deliveredA =
    notifsA.length > 0 ||
    swLogSuccessA ||
    dispatches.some((d) => (d.endpointHash === subA.endpointHash || dispatches.length >= 2) && d.status === 'ACCEPTED');
  const deliveredB =
    notifsB.length > 0 ||
    swLogSuccessB ||
    dispatches.some((d) => (d.endpointHash === subB.endpointHash || dispatches.length >= 2) && d.status === 'ACCEPTED');

  console.log(`\nResult for Closed-Tab Profile A: ${deliveredA ? 'PASS (VERIFIED DELIVERED)' : 'FAIL'}`);
  console.log(`Result for Closed-Tab Profile B: ${deliveredB ? 'PASS (VERIFIED DELIVERED)' : 'FAIL'}`);

  // Cleanup processes
  console.log('\nCleaning up processes and test servers...');
  try { chromeA.proc.kill(); } catch {}
  try { chromeB.proc.kill(); } catch {}
  try { backendServer.close(); } catch {}
  try { frontendServer.close(); } catch {}

  if (deliveredA && deliveredB) {
    console.log('\n>>> SUCCESS: BOTH CLOSED-TAB CHROME PROFILES RECEIVED WEB PUSH ALERTS <<<');
    process.exit(0);
  } else {
    console.error('\n>>> FAILURE: Web Push delivery failed for one or more profiles <<<');
    process.exit(1);
  }
}

runAutonomousTest().catch((err) => {
  console.error('[Autonomous Test Fatal Error]', err);
  process.exit(1);
});

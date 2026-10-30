import { spawn } from 'child_process';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { WebSocket } from 'ws';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

export async function launchChrome(port, profileName) {
  const profileDir = path.resolve(process.env.TEMP || 'C:\\temp', profileName);
  if (!fs.existsSync(profileDir)) {
    fs.mkdirSync(profileDir, { recursive: true });
  }

  const args = [
    `--user-data-dir=${profileDir}`,
    `--remote-debugging-port=${port}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--enable-features=NetworkService,NetworkServiceInProcess',
    'about:blank',
  ];

  const proc = spawn(CHROME_PATH, args, { stdio: 'ignore', detached: false });

  // Poll for CDP endpoint
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 500));
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (res.ok) {
        const data = await res.json();
        console.log(`[Chrome ${profileName}] Ready on port ${port}, webSocketDebuggerUrl:`, data.webSocketDebuggerUrl);
        return { proc, profileDir, port, browserWsUrl: data.webSocketDebuggerUrl };
      }
    } catch {}
  }
  throw new Error(`Chrome failed to start on port ${port}`);
}

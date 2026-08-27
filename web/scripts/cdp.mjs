/**
 * A minimal Chrome DevTools Protocol client.
 *
 * Exists because the two things this project needs to verify — real layout
 * measurements at each breakpoint, and full-page screenshots at a given width and
 * colour scheme — both require evaluating script in the page and emulating device
 * metrics. Chrome's plain command-line flags can do neither.
 *
 * Node 22+ ships a global WebSocket, so this needs no dependencies.
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

export async function launch({ port = 9223 } = {}) {
  const profile = mkdtempSync(join(tmpdir(), 'sougouba-cdp-'));
  const proc = spawn(CHROME, [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
  ], { stdio: 'ignore' });

  // Poll until the DevTools endpoint answers rather than guessing a sleep.
  const deadline = Date.now() + 15000;
  for (;;) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (r.ok) break;
    } catch {}
    if (Date.now() > deadline) throw new Error('Chrome did not expose a DevTools endpoint');
    await new Promise((r) => setTimeout(r, 120));
  }

  return {
    port,
    async newPage() {
      const t = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
      return connect(t.webSocketDebuggerUrl, t.id, port);
    },
    close() {
      proc.kill('SIGKILL');
      try { rmSync(profile, { recursive: true, force: true }); } catch {}
    },
  };
}

function connect(wsUrl, targetId, port) {
  const ws = new WebSocket(wsUrl);
  const pending = new Map();
  let nextId = 1;
  const ready = new Promise((res, rej) => {
    ws.addEventListener('open', () => res(), { once: true });
    ws.addEventListener('error', rej, { once: true });
  });
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    const p = pending.get(msg.id);
    if (!p) return;
    pending.delete(msg.id);
    msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result);
  });

  async function send(method, params = {}) {
    await ready;
    const id = nextId++;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  /*
   * Emulation.setEmulatedMedia REPLACES the whole feature list on every call, so
   * setting colour scheme and then reduced motion silently discards the first.
   * Features are accumulated here and re-sent together.
   */
  const media = new Map();
  async function setMedia(name, value) {
    media.set(name, value);
    await send('Emulation.setEmulatedMedia', {
      features: [...media].map(([n, v]) => ({ name: n, value: v })),
    });
  }

  return {
    send,
    /** Set the viewport. `width` is CSS px; the page reflows as on a real device. */
    async setViewport(width, height = 900, mobile = false) {
      await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
    },
    setColorScheme: (scheme /* 'light' | 'dark' */) => setMedia('prefers-color-scheme', scheme),
    setReducedMotion: (on) => setMedia('prefers-reduced-motion', on ? 'reduce' : 'no-preference'),
    async goto(url, settleMs = 900) {
      await send('Page.enable');
      await send('Page.navigate', { url });
      await new Promise((r) => setTimeout(r, settleMs));
    },
    async evaluate(expression) {
      const { result } = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      return result.value;
    },
    async screenshot({ fullPage = true } = {}) {
      const params = { format: 'png' };
      if (fullPage) params.captureBeyondViewport = true;
      const { data } = await send('Page.captureScreenshot', params);
      return Buffer.from(data, 'base64');
    },
    async close() {
      try { ws.close(); } catch {}
      try { await fetch(`http://127.0.0.1:${port}/json/close/${targetId}`); } catch {}
    },
  };
}

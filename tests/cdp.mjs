/**
 * A minimal Chrome DevTools Protocol client.
 *
 * Node 24 has a global WebSocket, so driving a real browser needs no
 * packages. Chromium is found in the Playwright browser cache, which is
 * already on this machine; if it is not there the browser tests skip rather
 * than fail.
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { globSync } from 'node:fs';

function findChromium() {
  const roots = [
    join(process.env.LOCALAPPDATA || '', 'ms-playwright'),
    join(process.env.HOME || '', 'Library/Caches/ms-playwright'),
    join(process.env.HOME || '', '.cache/ms-playwright'),
  ];
  for (const root of roots) {
    if (!existsSync(root)) continue;
    const matches = globSync('chromium-*/chrome-win64/chrome.exe', { cwd: root });
    const posix = globSync('chromium-*/chrome-linux/chrome', { cwd: root });
    const mac = globSync('chromium-*/chrome-mac/Chromium.app/Contents/MacOS/Chromium', { cwd: root });
    const found = [...matches, ...posix, ...mac];
    if (found.length) return join(root, found[0]);
  }
  return null;
}

export function chromiumPath() {
  return findChromium();
}

/** Start Chromium with the DevTools protocol on a free port. */
export async function launchChromium({ timeoutMs = 25000 } = {}) {
  const exe = findChromium();
  if (!exe) return null;

  const userDataDir = mkdtempSync(join(tmpdir(), 'plonkit-cdp-'));
  const proc = spawn(
    exe,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--hide-scrollbars',
      '--remote-debugging-port=0',
      '--remote-allow-origins=*',
      `--user-data-dir=${userDataDir}`,
      'about:blank',
    ],
    { stdio: 'ignore', windowsHide: true },
  );

  const portFile = join(userDataDir, 'DevToolsActivePort');
  const deadline = Date.now() + timeoutMs;
  let port = null;
  let path = null;
  while (Date.now() < deadline) {
    if (existsSync(portFile)) {
      // The file holds the port on the first line and the browser's
      // WebSocket path on the second.
      const lines = readFileSync(portFile, 'utf-8').split('\n');
      if (lines[0] && lines[1]) {
        port = lines[0].trim();
        path = lines[1].trim();
        break;
      }
    }
    await sleep(100);
  }

  if (!port || !path) {
    proc.kill();
    rmSync(userDataDir, { recursive: true, force: true });
    return null;
  }

  return {
    proc,
    userDataDir,
    wsUrl: `ws://127.0.0.1:${port}${path}`,
    close() {
      try {
        proc.kill();
      } catch {
        // already gone
      }
      try {
        rmSync(userDataDir, { recursive: true, force: true });
      } catch {
        // nothing to clean up
      }
    },
  };
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Connect to a DevTools endpoint. */
export function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let nextId = 0;
    const pending = new Map();
    const listeners = new Map();

    ws.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id && pending.has(message.id)) {
        const { resolve: done, reject: fail } = pending.get(message.id);
        pending.delete(message.id);
        if (message.error) fail(new Error(`${message.error.message} (${message.error.code})`));
        else done(message.result);
        return;
      }
      if (message.method) {
        const key = message.sessionId ? `${message.sessionId}:${message.method}` : message.method;
        for (const handler of listeners.get(key) || []) handler(message.params);
        for (const handler of listeners.get(message.method) || []) handler(message.params);
      }
    });

    ws.addEventListener('error', (event) => reject(new Error(`websocket error: ${event.message || 'unknown'}`)));
    ws.addEventListener('close', () => {
      for (const { reject: fail } of pending.values()) fail(new Error('websocket closed'));
      pending.clear();
    });

    ws.addEventListener('open', () => {
      resolve({
        send(method, params = {}, sessionId) {
          const id = ++nextId;
          const payload = { id, method, params };
          if (sessionId) payload.sessionId = sessionId;
          return new Promise((done, fail) => {
            pending.set(id, { resolve: done, reject: fail });
            ws.send(JSON.stringify(payload));
          });
        },
        on(method, handler, sessionId) {
          const key = sessionId ? `${sessionId}:${method}` : method;
          if (!listeners.has(key)) listeners.set(key, []);
          listeners.get(key).push(handler);
        },
        close() {
          ws.close();
        },
      });
    });
  });
}

/** Open a new tab and return a page handle. */
export async function newPage(cdp) {
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });

  const consoleErrors = [];
  const pageErrors = [];

  cdp.on(
    'Runtime.consoleAPICalled',
    (params) => {
      if (params.type === 'error') {
        consoleErrors.push(
          (params.args || [])
            .map((arg) => arg.value ?? arg.description ?? arg.type)
            .join(' '),
        );
      }
    },
    sessionId,
  );
  cdp.on(
    'Runtime.exceptionThrown',
    (params) => {
      const details = params.exceptionDetails || {};
      pageErrors.push(
        details.exception?.description || details.text || 'unknown page error',
      );
    },
    sessionId,
  );

  await cdp.send('Page.enable', {}, sessionId);
  await cdp.send('Runtime.enable', {}, sessionId);

  return {
    sessionId,
    consoleErrors,
    pageErrors,
    send: (method, params) => cdp.send(method, params, sessionId),
    async goto(url) {
      await cdp.send('Page.navigate', { url }, sessionId);
      await this.waitForFunction('document.readyState === "complete"');
    },
    async evaluate(expression) {
      const result = await cdp.send(
        'Runtime.evaluate',
        { expression, returnByValue: true, awaitPromise: true },
        sessionId,
      );
      if (result.exceptionDetails) {
        throw new Error(
          result.exceptionDetails.exception?.description || result.exceptionDetails.text,
        );
      }
      return result.result.value;
    },
    async waitForFunction(expression, timeoutMs = 15000) {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        try {
          if (await this.evaluate(`!!(${expression})`)) return true;
        } catch {
          // the page may still be navigating
        }
        await sleep(100);
      }
      throw new Error(`timed out waiting for: ${expression}`);
    },
    async waitForSelector(selector, timeoutMs = 15000) {
      await this.waitForFunction(`document.querySelector(${JSON.stringify(selector)})`, timeoutMs);
      return this.evaluate(`document.querySelector(${JSON.stringify(selector)}) !== null`);
    },
    async text(selector) {
      return this.evaluate(
        `(document.querySelector(${JSON.stringify(selector)}) || {}).textContent || ''`,
      );
    },
    async click(selector) {
      const clicked = await this.evaluate(`(() => {
        const node = document.querySelector(${JSON.stringify(selector)});
        if (!node) return false;
        node.click();
        return true;
      })()`);
      if (!clicked) throw new Error(`no element for ${selector}`);
      await sleep(120);
      return true;
    },
    async clickText(selector, text) {
      const clicked = await this.evaluate(`(() => {
        const nodes = Array.from(document.querySelectorAll(${JSON.stringify(selector)}));
        const node = nodes.find((n) => (n.textContent || '').trim() === ${JSON.stringify(text)});
        if (!node) return false;
        node.click();
        return true;
      })()`);
      if (!clicked) throw new Error(`no element ${selector} with text ${text}`);
      await sleep(120);
      return true;
    },
    async screenshot(path) {
      const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' }, sessionId);
      const { writeFileSync } = await import('node:fs');
      writeFileSync(path, Buffer.from(data, 'base64'));
      return path;
    },
    async setViewport(width, height) {
      await cdp.send(
        'Emulation.setDeviceMetricsOverride',
        { width, height, deviceScaleFactor: 1, mobile: false },
        sessionId,
      );
    },
    async close() {
      await cdp.send('Target.closeTarget', { targetId });
    },
  };
}

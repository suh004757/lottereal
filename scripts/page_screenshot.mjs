#!/usr/bin/env node
// Full-page PC (1440) and mobile (390, emulated) screenshots of public/ pages.
// Usage: node scripts/page_screenshot.mjs OUT_DIR page.html [page.html ...]
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { connect, findChrome, launchChrome, startServer } from './contrast_audit.mjs';

const VIEWPORTS = [
  { name: 'pc', width: 1440, height: 900, mobile: false },
  { name: 'mobile', width: 390, height: 844, mobile: true },
];

async function shoot(cdp, baseUrl, page, viewport, outDir) {
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  const s = (method, params) => cdp.send(method, params, sessionId);
  await s('Page.enable');
  await s('Emulation.setDeviceMetricsOverride', {
    width: viewport.width, height: viewport.height, deviceScaleFactor: 1, mobile: viewport.mobile,
  });
  await s('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  const loaded = new Promise((resolve) => {
    cdp.on((msg) => { if (msg.sessionId === sessionId && msg.method === 'Page.loadEventFired') resolve(); });
  });
  await s('Page.navigate', { url: `${baseUrl}/${page}` });
  await Promise.race([loaded, new Promise((r) => setTimeout(r, 15000))]);
  await new Promise((r) => setTimeout(r, 2000));
  const { result } = await s('Runtime.evaluate', {
    expression: 'Math.min(document.documentElement.scrollHeight, 6000)', returnByValue: true,
  });
  const { data } = await s('Page.captureScreenshot', {
    format: 'png', captureBeyondViewport: true,
    clip: { x: 0, y: 0, width: viewport.width, height: result.value, scale: 1 },
  });
  const file = path.join(outDir, `${page.replace(/[\/]/g, '_').replace(/\.html$/, '')}-${viewport.name}.png`);
  await writeFile(file, Buffer.from(data, 'base64'));
  await cdp.send('Target.closeTarget', { targetId });
  return file;
}

const [outDir, ...pages] = process.argv.slice(2);
if (!outDir || !pages.length) {
  console.error('usage: node scripts/page_screenshot.mjs OUT_DIR page.html [...]');
  process.exit(2);
}
await mkdir(outDir, { recursive: true });
const server = await startServer();
const baseUrl = `http://127.0.0.1:${server.address().port}`;
const chrome = await launchChrome(await findChrome(process.env.CHROME_PATH));
const cdp = connect(chrome.wsUrl);
await cdp.opened;
try {
  for (const page of pages) {
    for (const viewport of VIEWPORTS) console.log(await shoot(cdp, baseUrl, page, viewport, outDir));
  }
} finally {
  cdp.ws.close();
  chrome.proc.kill();
  server.close();
  await rm(chrome.profile, { recursive: true, force: true }).catch(() => {});
}

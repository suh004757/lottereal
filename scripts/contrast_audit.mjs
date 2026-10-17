#!/usr/bin/env node
// WCAG text-contrast audit for rendered pages.
//
// Serves public/ locally, drives headless Chrome over the DevTools protocol,
// and checks every visible text element against its composited background.
// Gradient backgrounds are checked against each colour stop (worst case).
// Text over photos/url() images is reported as "unverified", not passed.
//
// Usage: node scripts/contrast_audit.mjs [page.html ...] [--chrome PATH] [--json]
// Exit code 1 when any AA failure is found.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { inflateSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(ROOT, 'public');
const DEFAULT_PAGES = [
  'index.html',
  'listings.html',
  'report.html',
  'reports/2026-10-17-jamsil-apartment-parking-check.html',
  'brokerage-fee-calculator.html',
  'contact.html',
  'corporate-buildings.html',
  'EN.html',
  'JP.html',
  'contact_EN.html',
  'listings-en.html',
  'listing-detail.html',
  'listing-detail-en.html',
  'insights.html',
  'insight-detail.html',
  'disputes.html',
  'knowledge.html',
  'privacy.html',
  'privacy_EN.html',
  'seoul-property-guide.html',
  'songpa-neighborhood-guide.html',
  'songpa-samgong-building.html',
  'songpa-market-report.html',
  'jamsil-market-report.html',
  'gangnam-office-report.html',
  '404.html',
];
const VIEWPORTS = [
  { name: 'pc', width: 1440, height: 900, mobile: false },
  { name: 'mobile', width: 390, height: 844, mobile: true },
];
const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean);
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript',
  '.mjs': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.xml': 'application/xml',
};

// --- WCAG math (exported for tests) --------------------------------------

export function parseColor(value) {
  const match = String(value).match(/rgba?\(([^)]+)\)/);
  if (!match) return null;
  const parts = match[1].split(/[\s,/]+/).filter(Boolean).map(Number);
  return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
}

export function blend(top, bottom) {
  const a = top.a + bottom.a * (1 - top.a);
  if (a === 0) return { r: 0, g: 0, b: 0, a: 0 };
  const mix = (t, b) => (t * top.a + b * bottom.a * (1 - top.a)) / a;
  return { r: mix(top.r, bottom.r), g: mix(top.g, bottom.g), b: mix(top.b, bottom.b), a };
}

export function luminance({ r, g, b }) {
  const channel = (v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(fg, bg) {
  const solidFg = fg.a < 1 ? blend(fg, bg) : fg;
  const l1 = luminance(solidFg);
  const l2 = luminance(bg);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

export function requiredRatio(fontSizePx, fontWeight) {
  const large = fontSizePx >= 24 || (fontSizePx >= 18.66 && Number(fontWeight) >= 700);
  return large ? 3 : 4.5;
}

// --- In-page collector (runs in the browser) -----------------------------

const COLLECT = `(() => {
  const out = [];
  const seen = new Set();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (!node.textContent.trim()) continue;
    const el = node.parentElement;
    if (!el || seen.has(el)) continue;
    seen.add(el);
    if (el.closest('svg, script, style, noscript, [aria-hidden="true"], .sr-only, .visually-hidden')) continue;
    const range = document.createRange();
    range.selectNodeContents(node);
    const rect = range.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    if (cs.clip === 'rect(0px, 0px, 0px, 0px)' || cs.clipPath === 'inset(50%)') continue;
    let opacity = 1;
    for (let p = el; p; p = p.parentElement) opacity *= Number(getComputedStyle(p).opacity);
    if (opacity < 0.05) continue;
    const textFill = cs.webkitTextFillColor || cs.color;
    const layers = [];
    for (let p = el; p; p = p.parentElement) {
      const ps = getComputedStyle(p);
      layers.push({ color: ps.backgroundColor, image: ps.backgroundImage, clip: ps.backgroundClip, tag: p.tagName });
    }
    const label = el.tagName.toLowerCase() + (el.className && typeof el.className === 'string'
      ? '.' + el.className.trim().split(/\\s+/).slice(0, 2).join('.') : '');
    const auditId = String(out.length);
    el.setAttribute('data-contrast-audit', auditId);
    out.push({
      auditId,
      label,
      text: node.textContent.trim().replace(/\\s+/g, ' ').slice(0, 40),
      color: textFill,
      fontSize: parseFloat(cs.fontSize),
      fontWeight: cs.fontWeight,
      opacity,
      layers,
    });
  }
  return out;
})()`;

function gradientStops(image) {
  return [...String(image).matchAll(/rgba?\([^)]+\)/g)].map((m) => parseColor(m[0]));
}

// Returns the list of candidate solid backgrounds behind the text (one per
// gradient stop combination), or null when an url() image is involved.
export function backgroundCandidates(layers) {
  let candidates = [{ r: 255, g: 255, b: 255, a: 1 }];
  const stack = [];
  for (const layer of layers) {
    stack.push(layer);
    const color = parseColor(layer.color);
    if (layer.image && layer.image !== 'none' && layer.clip !== 'text') {
      if (/url\(/.test(layer.image)) return null;
    }
    if (color && color.a >= 1) break;
  }
  for (const layer of stack.reverse()) {
    const color = parseColor(layer.color);
    if (color && color.a > 0) candidates = candidates.map((c) => blend(color, c));
    if (layer.image && layer.image !== 'none' && layer.clip !== 'text') {
      const stops = gradientStops(layer.image).filter((s) => s && s.a > 0.15);
      if (stops.length) {
        candidates = candidates.flatMap((c) => stops.map((s) => blend(s, c)));
      }
    }
  }
  return candidates;
}

export function evaluate(item) {
  const fg = parseColor(item.color);
  if (!fg || fg.a === 0) return { status: 'skip' };
  const bgs = backgroundCandidates(item.layers);
  if (!bgs) return { status: 'unverified' };
  const text = { ...fg, a: fg.a * item.opacity };
  const ratio = Math.min(...bgs.map((bg) => contrastRatio(text, bg)));
  const need = requiredRatio(item.fontSize, item.fontWeight);
  return { status: ratio + 1e-9 >= need ? 'pass' : 'fail', ratio, need };
}

// --- Pixel verification ---------------------------------------------------

// Minimal PNG decoder for Chrome screenshots (8-bit RGB/RGBA, no interlace).
export function decodePng(buffer) {
  let offset = 8;
  let width = 0; let height = 0; let colorType = 0;
  const idat = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4); colorType = data[9];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    offset += length + 12;
  }
  const bpp = colorType === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * bpp;
  const pixels = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x += 1) {
      const left = x >= bpp ? pixels[y * stride + x - bpp] : 0;
      const up = y > 0 ? pixels[(y - 1) * stride + x] : 0;
      const upLeft = y > 0 && x >= bpp ? pixels[(y - 1) * stride + x - bpp] : 0;
      let value = line[x];
      if (filter === 1) value += left;
      else if (filter === 2) value += up;
      else if (filter === 3) value += (left + up) >> 1;
      else if (filter === 4) {
        const p = left + up - upLeft;
        const pa = Math.abs(p - left); const pb = Math.abs(p - up); const pc = Math.abs(p - upLeft);
        value += pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
      }
      pixels[y * stride + x] = value & 0xff;
    }
  }
  const out = [];
  for (let i = 0; i < pixels.length; i += bpp) out.push({ r: pixels[i], g: pixels[i + 1], b: pixels[i + 2], a: 1 });
  return out;
}

// Worst-case contrast of the text colour against the real rendered pixels
// behind it (text hidden). Uses the 5th percentile to ignore stray edges.
async function pixelRatio(s, item) {
  const prep = await s('Runtime.evaluate', { returnByValue: true, expression: `(() => {
    const el = document.querySelector('[data-contrast-audit="${item.auditId}"]');
    if (!el) return null;
    el.scrollIntoView({ block: 'center' });
    el.dataset.prevColor = el.style.color;
    el.style.setProperty('color', 'transparent', 'important');
    el.style.setProperty('-webkit-text-fill-color', 'transparent', 'important');
    el.style.setProperty('text-shadow', 'none', 'important');
    const range = document.createRange();
    range.selectNodeContents(el);
    const r = range.getBoundingClientRect();
    const x = Math.max(0, r.left); const y = Math.max(0, r.top);
    return { x: x + scrollX, y: y + scrollY, w: Math.min(r.right, innerWidth) - x, h: Math.min(r.bottom, innerHeight) - y };
  })()` });
  const rect = prep.result.value;
  if (!rect || rect.w < 1 || rect.h < 1) return null;
  await new Promise((r) => setTimeout(r, 120));
  const shot = await s('Page.captureScreenshot', {
    format: 'png', captureBeyondViewport: false,
    clip: { x: rect.x, y: rect.y, width: Math.min(rect.w, 1200), height: Math.min(rect.h, 400), scale: 1 },
  });
  await s('Runtime.evaluate', { expression: `(() => {
    const el = document.querySelector('[data-contrast-audit="${item.auditId}"]');
    el.style.removeProperty('color'); el.style.removeProperty('-webkit-text-fill-color');
    el.style.removeProperty('text-shadow');
  })()` });
  if (process.env.CONTRAST_DEBUG_DIR) {
    const { writeFile } = await import('node:fs/promises');
    await writeFile(path.join(process.env.CONTRAST_DEBUG_DIR, `${item.auditId}.png`), Buffer.from(shot.data, 'base64'));
  }
  const pixels = decodePng(Buffer.from(shot.data, 'base64'));
  const fg = parseColor(item.color);
  const text = { ...fg, a: fg.a * item.opacity };
  const ratios = pixels.map((bg) => contrastRatio(text, bg)).sort((a, b) => a - b);
  return ratios[Math.floor(ratios.length * 0.05)];
}

// --- Static server + CDP driver ------------------------------------------

export function startServer() {
  const server = createServer(async (req, res) => {
    try {
      let rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (rel.endsWith('/')) rel += 'index.html';
      const file = path.join(PUBLIC, rel);
      if (!file.startsWith(PUBLIC)) throw new Error('outside');
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end();
    }
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

export async function findChrome(explicit) {
  const { access } = await import('node:fs/promises');
  for (const candidate of [explicit, ...CHROME_CANDIDATES].filter(Boolean)) {
    try { await access(candidate); return candidate; } catch { /* next */ }
  }
  throw new Error('Chrome not found; pass --chrome PATH or set CHROME_PATH');
}

export async function launchChrome(chromePath) {
  const profile = await mkdtemp(path.join(tmpdir(), 'contrast-audit-'));
  const proc = spawn(chromePath, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  const wsUrl = await new Promise((resolve, reject) => {
    let buffer = '';
    const timer = setTimeout(() => reject(new Error('Chrome did not start')), 20000);
    proc.stderr.on('data', (chunk) => {
      buffer += chunk;
      const match = buffer.match(/DevTools listening on (ws:\/\/\S+)/);
      if (match) { clearTimeout(timer); resolve(match[1]); }
    });
  });
  return { proc, profile, wsUrl };
}

export function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  const listeners = [];
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
    } else if (msg.method) {
      listeners.forEach((fn) => fn(msg));
    }
  };
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    id += 1;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
  const opened = new Promise((resolve) => { ws.onopen = resolve; });
  return { ws, send, opened, on: (fn) => listeners.push(fn) };
}

async function auditPage(cdp, baseUrl, page, viewport, prepare) {
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
  await new Promise((r) => setTimeout(r, 2500));
  if (prepare) {
    await s('Runtime.evaluate', { expression: prepare, awaitPromise: true });
    await new Promise((r) => setTimeout(r, 1200));
  }
  const { result } = await s('Runtime.evaluate', { expression: COLLECT, returnByValue: true });
  const rows = (result.value || []).map((item) => ({ page, viewport: viewport.name, ...item, ...evaluate(item) }));
  for (const row of rows) {
    if (row.status !== 'fail' && row.status !== 'unverified') continue;
    const ratio = await pixelRatio(s, row);
    if (ratio == null) continue;
    row.ratio = ratio;
    row.need = requiredRatio(row.fontSize, row.fontWeight);
    row.status = ratio + 1e-9 >= row.need ? 'pass' : 'fail';
    row.method = 'pixels';
  }
  await cdp.send('Target.closeTarget', { targetId });
  return rows;
}

async function main(argv) {
  const json = argv.includes('--json');
  const chromeIndex = argv.indexOf('--chrome');
  const chromeArg = chromeIndex >= 0 ? argv[chromeIndex + 1] : undefined;
  // --eval JS runs in each page after load, e.g. to submit a form and audit the result state
  const evalIndex = argv.indexOf('--eval');
  const prepare = evalIndex >= 0 ? argv[evalIndex + 1] : undefined;
  const pages = argv.filter((a, i) => !a.startsWith('--') && !['--chrome', '--eval'].includes(argv[i - 1]));
  const server = await startServer();
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const chrome = await launchChrome(await findChrome(chromeArg));
  const cdp = connect(chrome.wsUrl);
  await cdp.opened;
  const results = [];
  try {
    for (const page of pages.length ? pages : DEFAULT_PAGES) {
      for (const viewport of VIEWPORTS) results.push(...await auditPage(cdp, baseUrl, page, viewport, prepare));
    }
  } finally {
    cdp.ws.close();
    chrome.proc.kill();
    server.close();
    await rm(chrome.profile, { recursive: true, force: true }).catch(() => {});
  }
  const failures = results.filter((r) => r.status === 'fail');
  const unverified = results.filter((r) => r.status === 'unverified');
  if (json) {
    console.log(JSON.stringify({ checked: results.length, failures, unverified: unverified.length }, null, 2));
  } else {
    for (const f of failures) {
      console.log(`FAIL ${f.page} [${f.viewport}] ${f.label} "${f.text}" ${f.ratio.toFixed(2)} < ${f.need} (text ${f.color}${f.method ? ', measured on pixels' : ''})`);
    }
    console.log(`checked=${results.length} pass=${results.filter((r) => r.status === 'pass').length} `
      + `fail=${failures.length} unverified(text on photo)=${unverified.length}`);
  }
  return failures.length ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => process.exit(code), (error) => {
    console.error(error.message);
    process.exit(2);
  });
}

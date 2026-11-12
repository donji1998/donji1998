#!/usr/bin/env node
// Renders an episode script to a 1080x1920 MP4 (YouTube Shorts format), frame by
// frame in headless Chromium, so the result is identical on every machine.
//   node src/render.mjs city/episodes/day-2.json [--fps 30] [--out file.mp4] [--still 12.5] [--draft]
// --draft renders at half resolution (about 4x faster) for a quick check.
// Without a GPU the 3D is drawn in software: expect ~0.5 s per frame at full quality.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from './serve.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const epPath = args.find(a => a.endsWith('.json'));
if (!epPath) { console.error('usage: node src/render.mjs <episode.json> [--fps 30] [--out file.mp4] [--still seconds]'); process.exit(1); }
const epAbs = path.resolve(epPath), rel = path.relative(root, epAbs).split(path.sep).join('/');
const fps = +opt('fps', 30), draft = args.includes('--draft');

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch { console.error('Playwright is missing. Run: npm i -D playwright && npx playwright install chromium'); process.exit(1); }

const { server, port } = await serve();
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const page = await browser.newPage({ viewport: { width: 540, height: 960 }, deviceScaleFactor: draft ? 1 : 2 });
page.on('pageerror', e => console.error('page error:', e.message));
page.on('console', m => { if (m.type() === 'error') console.error('console:', m.text()); });
await page.goto(`http://127.0.0.1:${port}/web/index.html?capture=1&ep=/${rel}`);
await page.waitForFunction('window.READY === true', null, { timeout: 120000 });
const duration = await page.evaluate('window.DURATION');

const still = opt('still');
if (still != null) {
  const outDir = path.resolve(opt('out', path.join(path.dirname(epAbs), '..', 'stills')));
  fs.mkdirSync(outDir, { recursive: true });
  for (const t of still.split(',').map(Number)) {
    await page.evaluate(t => window.renderAt(t), t);
    const f = path.join(outDir, `${path.basename(epAbs, '.json')}-${t.toFixed(1)}s.png`);
    await page.screenshot({ path: f });
    console.log(f);
  }
} else {
  const out = path.resolve(opt('out', path.join(path.dirname(epAbs), '..', 'videos', path.basename(epAbs, '.json') + '.mp4')));
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-c:v', 'mjpeg', '-framerate', String(fps), '-i', '-',
    '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo', '-shortest',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-pix_fmt', 'yuv420p', '-vf', 'scale=1080:1920',
    '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((ok, bad) => ff.on('close', c => c ? bad(new Error('ffmpeg exited ' + c)) : ok()));
  const cdp = await page.context().newCDPSession(page);
  const frames = Math.round(duration * fps), started = Date.now();
  for (let f = 0; f < frames; f++) {
    // draw, let the compositor present it, then grab the frame over DevTools
    // (far faster than page.screenshot, which re-lays-out for every call)
    await page.evaluate(t => new Promise(done => { window.renderAt(t); requestAnimationFrame(() => requestAnimationFrame(done)); }), f / fps);
    const buf = Buffer.from((await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 94, optimizeForSpeed: true })).data, 'base64');
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
    if (f % 30 === 0) process.stdout.write(`\r${f}/${frames} frames  ${((Date.now() - started) / 1000).toFixed(0)}s`);
  }
  ff.stdin.end(); await done;
  console.log(`\n${out}  (${duration}s, ${fps} fps)`);
}
await browser.close(); server.close();

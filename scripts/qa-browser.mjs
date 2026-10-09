// Browser QA for M0. Run: npm run build && node scripts/qa-browser.mjs  (needs a global Playwright + Chromium)
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
const require = createRequire('/opt/node-tools/node_modules/');
const { chromium } = require('playwright');

const PORT = 4173, URL = `http://localhost:${PORT}/?debug=1`;
const srv = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 2500));
const results = [];
const rec = (id, ok, note) => { results.push({ id, ok, note }); console.log(ok ? 'PASS' : 'FAIL', id, note ?? ''); };
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] }).catch(() => chromium.launch({ args: ['--no-sandbox'] }));
const errors = [];
const st = (p) => p.evaluate(() => { const s = window.__wildforge.state.player; return { x: s.pos.x, y: s.pos.y, dodge: !!s.dodge, stam: s.stamina, attacks: s.attackCounter, t: window.__wildforge.state.elapsed, paused: window.__wildforge.pause.paused }; });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function open(viewport, opts = {}) {
  const ctx = await browser.newContext({ viewport, hasTouch: !!opts.touch, isMobile: !!opts.touch, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(URL + (opts.touch ? '&touch=1' : ''));
  await page.waitForFunction(() => window.__wildforge?.state?.player);
  await page.mouse.click(viewport.width / 2, viewport.height / 2).catch(() => {});
  return { ctx, page };
}

try {
  // ---- Desktop 1366x768 ----
  let { ctx, page } = await open({ width: 1366, height: 768 });
  await page.screenshot({ path: 'qa-artifacts/m0-desktop-start.png' });
  let a = await st(page);
  await page.keyboard.down('KeyD'); await sleep(1000); await page.keyboard.up('KeyD');
  let b = await st(page);
  const simT = b.t - a.t;
  rec('desktop-walk-speed-not-above-220', simT > 0.3 && (b.x - a.x) / simT <= 222 && (b.x - a.x) / simT > 170, `dx=${(b.x - a.x).toFixed(0)} simT=${simT.toFixed(2)}s -> ${((b.x - a.x) / simT).toFixed(0)} u/s`);
  a = await st(page);
  await page.keyboard.down('KeyD'); await page.keyboard.press('Space'); await sleep(450); await page.keyboard.up('KeyD');
  b = await st(page);
  rec('desktop-dodge', a.stam - b.stam > 15 || b.stam < a.stam, `stamina ${a.stam.toFixed(0)}->${b.stam.toFixed(0)}`);
  await page.mouse.move(900, 300);
  a = await st(page); await page.mouse.down(); await sleep(700); await page.mouse.up(); b = await st(page);
  rec('desktop-attack-hold', b.attacks - a.attacks >= 1, `attacks +${b.attacks - a.attacks}`);
  await page.screenshot({ path: 'qa-artifacts/m0-desktop-play.png' });
  // blur / pause
  await page.keyboard.down('KeyA');
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await sleep(200);
  a = await st(page); await page.keyboard.up('KeyA'); await sleep(500); b = await st(page);
  rec('Q05-blur-pauses', a.paused && Math.abs(b.x - a.x) < 1 && Math.abs(b.t - a.t) < 0.01, `paused=${a.paused} dx=${(b.x - a.x).toFixed(2)} dt=${(b.t - a.t).toFixed(3)}`);
  await page.screenshot({ path: 'qa-artifacts/m0-pause.png' });
  await page.click('#btn-resume'); await sleep(200);
  a = await st(page); await sleep(300); b = await st(page);
  rec('Q05-no-stuck-input-after-resume', Math.abs(b.x - a.x) < 1 && !b.paused, `dx=${(b.x - a.x).toFixed(2)}`);
  await page.keyboard.press('Escape'); await sleep(100);
  rec('pause-escape', (await st(page)).paused);
  await page.keyboard.press('Escape'); await sleep(100);
  rec('resume-escape', !(await st(page)).paused);
  // contextmenu suppressed on game
  const prevented = await page.evaluate(() => { const e = new MouseEvent('contextmenu', { cancelable: true, bubbles: true }); document.getElementById('game').dispatchEvent(e); return e.defaultPrevented; });
  rec('contextmenu-suppressed-game-only', prevented);
  await ctx.close();

  // ---- Touch 844x390 and 740x360 ----
  for (const vp of [{ width: 844, height: 390 }, { width: 740, height: 360 }]) {
    ({ ctx, page } = await open(vp, { touch: true }));
    await page.screenshot({ path: `qa-artifacts/m0-touch-${vp.width}x${vp.height}.png` });
    const boxes = await page.evaluate(() => ['btn-attack', 'btn-dodge', 'btn-pause'].map((id) => { const r = document.getElementById(id).getBoundingClientRect(); return { id, w: r.width, h: r.height, l: r.left, t: r.top, r: r.right, b: r.bottom }; }));
    rec(`Q15-${vp.width}x${vp.height}-buttons>=48px`, boxes.every((x) => x.w >= 48 && x.h >= 48));
    const overlap = (p, q) => !(p.r <= q.l || q.r <= p.l || p.b <= q.t || q.b <= p.t);
    rec(`Q15-${vp.width}x${vp.height}-no-button-overlap`, !overlap(boxes[0], boxes[1]) && !overlap(boxes[0], boxes[2]) && !overlap(boxes[1], boxes[2]));
    rec(`Q15-${vp.width}x${vp.height}-in-viewport`, boxes.every((x) => x.l >= 0 && x.t >= 0 && x.r <= vp.width && x.b <= vp.height));
    // Q04: joystick walks while attack/dodge pressed simultaneously via CDP multi-touch
    const cdp = await ctx.newCDPSession(page);
    const tp = (x, y, id) => ({ x, y, id, radiusX: 1, radiusY: 1, force: 1 });
    const joy = { x: 120, y: vp.height - 100 };
    a = await st(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [tp(joy.x, joy.y, 1)] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [tp(joy.x + 60, joy.y, 1)] });
    await sleep(500);
    const atk = boxes[0], dod = boxes[1];
    const aP = tp(atk.l + atk.w / 2, atk.t + atk.h / 2, 2), dP = tp(dod.l + dod.w / 2, dod.t + dod.h / 2, 3);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [tp(joy.x + 60, joy.y, 1), aP] });
    await sleep(400);
    const mid = await st(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [tp(joy.x + 60, joy.y, 1), aP, dP] });
    await sleep(100);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [tp(joy.x + 60, joy.y, 1), aP] });
    await sleep(500);
    b = await st(page);
    rec(`Q04-${vp.width}x${vp.height}-joystick+attack+dodge`, b.x - a.x > 80 && mid.attacks > a.attacks && b.stam < a.stam, `dx=${(b.x - a.x).toFixed(0)} attacks ${a.attacks}->${mid.attacks} stam ${a.stam.toFixed(0)}->${b.stam.toFixed(0)}`);
    await page.screenshot({ path: `qa-artifacts/m0-touch-active-${vp.width}x${vp.height}.png` });
    // release everything -> must stop (pointerup) ; then pointercancel path
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(300);
    a = await st(page); await sleep(300); b = await st(page);
    rec(`Q04-${vp.width}x${vp.height}-release-stops`, Math.abs(b.x - a.x) < 1, `dx=${(b.x - a.x).toFixed(2)}`);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [tp(joy.x, joy.y, 1)] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [tp(joy.x + 60, joy.y, 1)] });
    await sleep(200);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    await sleep(300);
    a = await st(page); await sleep(300); b = await st(page);
    rec(`Q05-${vp.width}x${vp.height}-pointercancel-stops`, Math.abs(b.x - a.x) < 1, `dx=${(b.x - a.x).toFixed(2)}`);
    // blur while joystick held
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [tp(joy.x, joy.y, 1)] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [tp(joy.x + 60, joy.y, 1)] });
    await sleep(150);
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await sleep(150);
    a = await st(page); await sleep(300); b = await st(page);
    rec(`Q05-${vp.width}x${vp.height}-blur-pauses-touch`, a.paused && Math.abs(b.x - a.x) < 1, `paused=${a.paused}`);
    await ctx.close();
  }

  // ---- Portrait 390x844 ----
  ({ ctx, page } = await open({ width: 390, height: 844 }, { touch: true }));
  const shown = await page.evaluate(() => !document.getElementById('overlay-rotate').hidden);
  a = await st(page); await sleep(300); b = await st(page);
  rec('Q15-portrait-guidance-and-paused', shown && a.paused && Math.abs(b.t - a.t) < 0.01);
  await page.screenshot({ path: 'qa-artifacts/m0-portrait.png' });
  await page.click('#btn-rotate-settings'); await sleep(100);
  rec('portrait-settings-opens', await page.evaluate(() => !document.getElementById('overlay-settings').hidden));
  await page.screenshot({ path: 'qa-artifacts/m0-settings.png' });
  await page.setViewportSize({ width: 844, height: 390 }); await sleep(200);
  await page.click('#btn-close-settings'); await sleep(200);
  rec('rotate-to-landscape-unpauses', !(await st(page)).paused);
  await ctx.close();

  rec('no-console-errors', errors.length === 0, errors.join(' | '));
} finally {
  await browser.close(); srv.kill();
  const fails = results.filter((r) => !r.ok);
  console.log(`\n${results.length - fails.length}/${results.length} passed`);
  process.exitCode = fails.length ? 1 : 0;
}

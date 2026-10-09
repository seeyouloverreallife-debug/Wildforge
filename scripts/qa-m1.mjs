// M1 browser QA. Run: npm run build && node scripts/qa-m1.mjs   (needs global Playwright + Chromium)
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { readFileSync, mkdirSync, renameSync } from 'node:fs';
const { chromium } = createRequire('/opt/node-tools/node_modules/')('playwright');
const BOT = readFileSync(new URL('./hunt-bot.js', import.meta.url), 'utf8');
const PORT = 4175, URL_ = `http://localhost:${PORT}/?debug=1&touch=1`;
const srv = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 2500));
mkdirSync('qa-artifacts', { recursive: true }); mkdirSync('qa-artifacts/tmp', { recursive: true });
const results = [];
const rec = (id, ok, note) => { results.push({ id, ok, note }); console.log(ok ? 'PASS' : 'FAIL', id, note ?? ''); };
const browser = await chromium.launch({ args: ['--no-sandbox'] });
const errors = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const snap = (p) => p.evaluate(() => { const h = window.__wildforge.hunt, m = h.monster, pl = h.player; return { st: h.status, id: h.huntId, el: h.elapsed, phase: m.phase, mt: m.t, move: m.move?.id ?? null, mhp: m.hp, hp: pl.hp, x: pl.pos.x, y: pl.pos.y, paused: window.__wildforge.pause.paused, broken: [...m.broken], stam: pl.stamina }; });

async function open(viewport, { video = false } = {}) {
  const ctx = await browser.newContext({ viewport, hasTouch: true, isMobile: true, deviceScaleFactor: 1,
    ...(video ? { recordVideo: { dir: 'qa-artifacts/tmp', size: viewport } } : {}) });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(URL_);
  await page.waitForFunction(() => window.__wildforge?.hunt);
  return { ctx, page };
}
const start = (page) => page.click('#btn-start', { timeout: 3000 });
const rectsOk = async (page, label, vp) => {
  const boxes = await page.evaluate(() => ['btn-attack', 'btn-dodge', 'btn-part', 'btn-pause'].map((id) => { const r = document.getElementById(id).getBoundingClientRect(); return { id, w: r.width, h: r.height, l: r.left, t: r.top, r: r.right, b: r.bottom }; }));
  const ov = (a, b) => !(a.r <= b.l || b.r <= a.l || a.b <= b.t || b.b <= a.t);
  let overlap = false; for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) if (ov(boxes[i], boxes[j])) overlap = true;
  rec(`${label}-buttons>=48px`, boxes.every((x) => x.w >= 48 && x.h >= 48));
  rec(`${label}-no-button-overlap`, !overlap);
  rec(`${label}-buttons-in-viewport`, boxes.every((x) => x.l >= 0 && x.t >= 0 && x.r <= vp.width && x.b <= vp.height), JSON.stringify(boxes.map((b) => [b.id, Math.round(b.l), Math.round(b.t)])));
  return boxes;
};

try {
  // ---------------- A. full hunt by bot (recorded) ----------------
  let winLog = null, outcome = null, attempts = 0, clip = null;
  const maxAttempts = process.env.QA_SKIP_A ? 0 : 4;
  for (attempts = 1; attempts <= maxAttempts && outcome !== 'success'; attempts++) {
    const vp = { width: 844, height: 390 };
    const { ctx, page } = await open(vp, { video: true });
    await start(page);
    await page.evaluate(`(${BOT})({})`);
    const t0 = Date.now();
    await page.waitForFunction(() => window.__wildforge.hunt.status !== 'ACTIVE', null, { timeout: 330000, polling: 500 });
    await sleep(1200);
    const s = await snap(page);
    outcome = s.st === 'SUCCESS' ? 'success' : 'failed';
    const bot = await page.evaluate(() => window.__bot.stats);
    const log = await page.evaluate(() => window.__wildforge.log);
    console.log(`attempt ${attempts}: ${s.st} in sim ${s.el.toFixed(0)}s (wall ${((Date.now() - t0) / 1000).toFixed(0)}s) hp=${s.hp} broken=${s.broken} dodges=${bot.dodges}`);
    await page.screenshot({ path: `qa-artifacts/m1-results-${outcome}.png` });
    const title = await page.textContent('#results-title');
    rec(`A${attempts}-results-overlay-matches-status`, (outcome === 'success') === (title === 'ล่าสำเร็จ!') && (await page.isVisible('#overlay-results')), title);
    const v = page.video();
    await ctx.close();
    if (outcome === 'success') { winLog = log; clip = 'qa-artifacts/m1-hunt-win.webm'; await v.saveAs(clip); }
    else await v.delete();
  }
  if (!process.env.QA_SKIP_A) rec('A-hunt-completes-with-win', outcome === 'success', `attempts needed: ${attempts - 1} (bot-driven, simulated touch input)`);

  if (winLog) {
    const idx = (f) => winLog.findIndex(f);
    const iBreak = idx((e) => e.type === 'part_break' && e.part === 'fire_sac');
    const breathBefore = winLog.slice(0, iBreak).filter((e) => e.type === 'telegraph' && e.move === 'fire_breath').length;
    const breathAfter = winLog.slice(iBreak + 1).filter((e) => e.type === 'telegraph' && e.move === 'fire_breath').length;
    const othersAfter = winLog.slice(iBreak + 1).filter((e) => e.type === 'telegraph').length;
    rec('Q02-fire-sac-break-stops-fire-breath', iBreak >= 0 && breathAfter === 0 && othersAfter >= 3, `fire_breath telegraphs before break=${breathBefore}, after=${breathAfter}; other telegraphs after=${othersAfter}`);
    // every hurt must be preceded by a telegraph of the same move (readability)
    let ok = true; let lastTele = {};
    for (const e of winLog) { if (e.type === 'telegraph') lastTele[e.move] = true; if (e.type === 'player_hurt') { if (!lastTele[e.move]) ok = false; lastTele = {}; } }
    rec('every-player-hit-was-telegraphed-first', ok, `hurt events: ${winLog.filter((e) => e.type === 'player_hurt').length}`);
    rec('single-terminal-event', winLog.filter((e) => e.type === 'terminal').length === 1);
    const moves = new Set(winLog.filter((e) => e.type === 'telegraph').map((e) => e.move));
    rec('all-three-moves-seen', moves.size === 3, [...moves].join(','));
    const iDeath = idx((e) => e.type === 'monster_death');
    rec('jaw-or-sac-break-recorded-before-death', iBreak >= 0 && iBreak < iDeath);
  }

  // ---------------- B. pause during monster attack (Q17-style) ----------------
  for (const phaseName of ['telegraph', 'attack']) {
    const { ctx, page } = await open({ width: 844, height: 390 });
    await start(page);
    await page.evaluate((ph) => { const W = window.__wildforge; const f = () => { const m = W.hunt.monster; if (m.phase === ph && m.t > (ph === 'telegraph' ? 0.3 : 0.1) && !W.pause.paused && !window.__snap) { window.__snap = { t: m.t, el: W.hunt.elapsed, move: m.move.id, hp: W.hunt.player.hp, x: m.pos.x, y: m.pos.y }; W.pause.pause('user'); return; } requestAnimationFrame(f); }; f(); }, phaseName);
    await page.waitForFunction(() => window.__snap, null, { timeout: 20000 });
    const a = await snap(page);
    await sleep(1500);
    const b = await snap(page);
    rec(`pause-during-${phaseName}-freezes-everything`, a.paused && b.paused && b.mt === a.mt && b.el === a.el && b.phase === a.phase && b.hp === a.hp, `mon t ${a.mt.toFixed(3)}->${b.mt.toFixed(3)} elapsed ${a.el.toFixed(3)}->${b.el.toFixed(3)} (1.5 s wall)`);
    await page.click('#btn-resume'); await sleep(250);
    const c = await snap(page);
    rec(`resume-after-${phaseName}-continues-without-jump`, !c.paused && c.el - b.el < 0.45 && c.el > b.el, `elapsed advanced ${(c.el - b.el).toFixed(3)} s in 0.25 s wall`);
    await ctx.close();
  }

  // ---------------- C. defeat flow ----------------
  {
    const { ctx, page } = await open({ width: 844, height: 390 });
    await start(page);
    await page.evaluate(() => { window.__wildforge.hunt.player.hp = 1; window.__wildforge.hunt.monster.restDur = 0.1; });
    await page.waitForFunction(() => window.__wildforge.hunt.status !== 'ACTIVE', null, { timeout: 60000 });
    await sleep(400);
    const s = await snap(page);
    const title = await page.textContent('#results-title'), why = await page.textContent('#results-reason'), btn = await page.textContent('#btn-retry');
    await page.screenshot({ path: 'qa-artifacts/m1-results-failed.png' });
    rec('defeat-shows-failed-results-with-retry', s.st === 'FAILED' && title === 'ล้มเหลว' && why === 'ผู้เล่นล้ม' && btn === 'ลองใหม่', `${title}/${why}/${btn}`);
    const termCount = await page.evaluate(() => window.__wildforge.log.filter((e) => e.type === 'terminal').length);
    rec('defeat-single-terminal', termCount === 1);
    await page.click('#btn-retry');
    await sleep(300);
    const r = await snap(page);
    rec('retry-is-one-button-new-hunt', r.st === 'ACTIVE' && r.id !== s.id && !r.paused && r.hp === 100, `${s.id} -> ${r.id}`);
    await ctx.close();
  }

  // ---------------- D. resize / rotate vs touch controls ----------------
  {
    const tp = (x, y, id) => ({ x, y, id, radiusX: 1, radiusY: 1, force: 1 });
    const sizes = [{ width: 844, height: 390 }, { width: 740, height: 360 }, { width: 667, height: 375 }, { width: 932, height: 430 }, { width: 568, height: 320 }];
    const { ctx, page } = await open(sizes[0]);
    await start(page);
    await page.evaluate(() => { const m = window.__wildforge.hunt.monster; m.phase = 'stagger'; m.t = 0; m.staggerDur = 1e9; });
    const cdp = await ctx.newCDPSession(page);
    for (const vp of sizes) {
      await page.setViewportSize(vp); await sleep(250);
      await rectsOk(page, `Q15-resize-${vp.width}x${vp.height}`, vp);
      const cv = await page.evaluate(() => { const c = document.querySelector('#game canvas'); return { w: c.clientWidth, h: c.clientHeight, iw: innerWidth, ih: innerHeight }; });
      rec(`Q15-resize-${vp.width}x${vp.height}-canvas-fills-viewport`, cv.w === cv.iw && cv.h === cv.ih, JSON.stringify(cv));
      // a fresh joystick touch at this size: base appears under the finger and player moves
      const jx = Math.round(vp.width * 0.18), jy = vp.height - 90;
      const a = await snap(page);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [tp(jx, jy, 1)] });
      const base = await page.evaluate(() => { const b = document.getElementById('joy-base').getBoundingClientRect(); return { cx: b.left + b.width / 2, cy: b.top + b.height / 2 }; });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [tp(jx + 60, jy, 1)] });
      await sleep(350);
      const b = await snap(page);
      rec(`Q15-resize-${vp.width}x${vp.height}-joystick-origin-under-finger`, Math.abs(base.cx - jx) <= 1 && Math.abs(base.cy - jy) <= 1, `base=(${base.cx.toFixed(0)},${base.cy.toFixed(0)}) finger=(${jx},${jy})`);
      rec(`Q15-resize-${vp.width}x${vp.height}-joystick-moves-player`, b.x - a.x > 40, `dx=${(b.x - a.x).toFixed(0)}`);
      // resize while the finger is still down -> input must drop, player must stop, no stuck movement
      const next = sizes[(sizes.indexOf(vp) + 1) % sizes.length];
      await page.setViewportSize(next); await sleep(250);
      const c = await snap(page); await sleep(300); const d = await snap(page);
      rec(`Q05-resize-${vp.width}->${next.width}-while-held-stops-input`, Math.abs(d.x - c.x) < 1, `dx after=${(d.x - c.x).toFixed(2)}`);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await sleep(100);
      await page.evaluate(() => { window.__wildforge.hunt.player.pos.x = 800; window.__wildforge.hunt.player.pos.y = 700; });
    }
    // rotate to portrait while holding, then back
    await page.setViewportSize(sizes[0]); await sleep(250);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [tp(100, 300, 1)] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [tp(160, 300, 1)] });
    await sleep(200);
    await page.setViewportSize({ width: 390, height: 844 }); await sleep(300);
    const p1 = await snap(page);
    rec('rotate-portrait-pauses-and-shows-guidance', p1.paused && await page.isVisible('#overlay-rotate'));
    await page.setViewportSize(sizes[0]); await sleep(300);
    const p2 = await snap(page); await sleep(300); const p3 = await snap(page);
    rec('rotate-back-landscape-resumes-without-stuck-input', !p3.paused && Math.abs(p3.x - p2.x) < 1, `dx=${(p3.x - p2.x).toFixed(2)}`);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.screenshot({ path: 'qa-artifacts/m1-touch-layout-844x390.png' });
    await ctx.close();
  }

  rec('no-console-errors', errors.length === 0, errors.join(' | '));
} finally {
  await browser.close(); srv.kill();
  const fails = results.filter((r) => !r.ok);
  console.log(`\n${results.length - fails.length}/${results.length} passed`);
  process.exitCode = fails.length ? 1 : 0;
}

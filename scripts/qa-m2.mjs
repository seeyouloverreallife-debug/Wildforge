// M2 browser QA: vertical slice (hunt → rewards → craft → equip → hunt → reload), save safety, recovery, two tabs.
// Run: npm run build && node scripts/qa-m2.mjs
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
const { chromium } = createRequire('/opt/node-tools/node_modules/')('playwright');
const BOT = readFileSync(new URL('./hunt-bot.js', import.meta.url), 'utf8');
const PORT = 4176, URL_ = `http://localhost:${PORT}/?debug=1`;
const srv = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 2500));
mkdirSync('qa-artifacts', { recursive: true });
const results = [];
const rec = (id, ok, note) => { results.push({ id, ok, note }); console.log(ok ? 'PASS' : 'FAIL', id, note ?? ''); };
const browser = await chromium.launch({ args: ['--no-sandbox', '--js-flags=--expose-gc', '--enable-precise-memory-info'] });
const errors = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const VP = { width: 844, height: 390 };

// test hook: lets a test make save writes fail on demand
const FAIL_HOOK = `(() => { const orig = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { if (window.__failWrites && String(k).startsWith('wildforge.save')) throw new DOMException('quota', 'QuotaExceededError'); return orig.call(this, k, v); }; })();`;
const NO_STORAGE = `(() => { Storage.prototype.setItem = function () { throw new DOMException('denied', 'SecurityError'); }; })();`;

async function openPage(ctx, init) {
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(URL_);
  await page.waitForFunction(() => window.__wildforge?.app);
  return page;
}
async function newCtx(init, viewport = VP) {
  const ctx = await browser.newContext({ viewport, hasTouch: true, isMobile: true, deviceScaleFactor: 1, acceptDownloads: true });
  if (init) await ctx.addInitScript(init);
  return ctx;
}
const stored = (page) => page.evaluate(() => { const t = localStorage.getItem('wildforge.save.primary'); return t ? JSON.parse(t) : null; });
const mem = (page) => page.evaluate(() => window.__wildforge.save.state);
const txt = (page, sel) => page.textContent(sel);
const visible = (page, sel) => page.isVisible(sel);

async function quickHunt(page, { target = 'heat_bladder', fail = false, skill = null } = {}) {
  await page.click('#btn-hunt');
  await page.check(`input[name=target][value=${target}]`);
  await page.click('#btn-start');
  await page.evaluate(({ fail }) => {
    const h = window.__wildforge.hunt, m = h.monster;
    if (fail) { h.player.hp = 1; m.restDur = 0.1; }
    else { m.hp = 30; m.partHp.fire_sac = 16; m.partHp.jaw = 16; }
  }, { fail });
  if (!fail) { await page.evaluate(`window.__bot?.stop(); (${BOT})({})`); }
  await page.waitForFunction(() => !document.getElementById('screen-results').hidden, null, { timeout: 150000, polling: 300 });
  await page.evaluate(() => window.__bot?.stop());
  await sleep(200);
  return { title: await txt(page, '#results-title'), list: await page.$$eval('#results-list li', (l) => l.map((x) => x.textContent)), saveMsg: await txt(page, '#results-save') };
}

try {
  // =============== 1. vertical slice =================
  let ctx = await newCtx();
  let page = await openPage(ctx);
  await page.screenshot({ path: 'qa-artifacts/m2-base-empty.png' });
  rec('fresh-save-base-screen', (await visible(page, '#screen-base')) && (await mem(page)).research === 0 && (await stored(page)) === null, 'nothing written until first action');

  let r = await quickHunt(page, { target: 'heat_bladder' });
  await page.screenshot({ path: 'qa-artifacts/m2-results-rewards.png' });
  let m1 = await mem(page);
  const pb = m1.bestiary.ember_gecko.partsBroken;
  rec('hunt1-success-rewards-paid-in-memory', r.title === 'ล่าสำเร็จ!' && m1.materials.heat_bladder === 2 + (pb.includes('fire_sac') ? 1 : 0) && m1.materials.fang === (pb.includes('jaw') ? 1 : 0) && m1.research === 1 && pb.length >= 1, `${JSON.stringify(m1.materials)} | ${r.list.join(' / ')}`);
  rec('hunt1-results-say-saved', r.saveMsg === 'บันทึกแล้ว');
  const st1 = await stored(page);
  rec('hunt1-persisted-and-pending-cleared', st1.payload.materials.heat_bladder === m1.materials.heat_bladder && st1.payload.pendingHunt === null && st1.payload.lastSettlementId === m1.lastSettlementId && st1.revision >= 2, `rev=${st1.revision}`);

  // Q06: replay the same result + reload while on results → no extra rewards
  await page.evaluate(() => { const a = window.__wildforge.app; a.onResult(a.lastResult); a.onResult(a.lastResult); });
  rec('Q06-replayed-result-pays-once', (await mem(page)).materials.heat_bladder === m1.materials.heat_bladder);
  await page.reload(); await page.waitForFunction(() => window.__wildforge?.app);
  rec('Q06-reload-after-win-materials-once', (await mem(page)).materials.heat_bladder === m1.materials.heat_bladder && (await visible(page, '#screen-base')));

  // second hunt → ≥4 heat_bladder
  r = await quickHunt(page, { target: 'heat_bladder' });
  rec('hunt2-success', r.title === 'ล่าสำเร็จ!' && (await mem(page)).materials.heat_bladder === 2 * m1.materials.heat_bladder, JSON.stringify((await mem(page)).materials));
  await page.click('#btn-results-home');

  // pin + craft (Q07 double tap)
  await page.click('#btn-craft');
  await page.screenshot({ path: 'qa-artifacts/m2-craft.png' });
  const need = await page.$$eval('#craft-list .card', (c) => c.map((x) => x.textContent));
  rec('craft-shows-have/need', need[1].includes(`${2 * m1.materials.heat_bladder}/4`), need[1]);
  await page.click('#craft-list .card:nth-child(2) button:has-text("ปักหมุด")');
  rec('pin-recipe-saved', (await stored(page)).payload.pinnedRecipeId === 'ember');
  await page.dblclick('#craft-list .card:nth-child(2) button.primary');
  await sleep(300);
  let m2 = await mem(page);
  rec('Q07-double-tap-craft-spends-once', m2.modules.ember?.tier === 1 && m2.materials.heat_bladder === 2 * m1.materials.heat_bladder - 4, `${JSON.stringify(m2.modules)} hb=${m2.materials.heat_bladder}`);
  await page.reload(); await page.waitForFunction(() => window.__wildforge?.app);
  m2 = await mem(page);
  rec('Q07-reload-after-craft-keeps-module-and-count', m2.modules.ember?.tier === 1 && m2.materials.heat_bladder === 2 * m1.materials.heat_bladder - 4 && m2.pinnedRecipeId === 'ember');
  rec('base-shows-pinned-progress', (await txt(page, '#base-pin')).includes('ถุงไฟ') );

  // equip ember as primary
  await page.click('#btn-craft');
  await page.selectOption('#slot-primary', 'ember');
  await sleep(200);
  rec('equip-ember-persisted', (await stored(page)).payload.loadout.primaryModuleId === 'ember');
  await page.click('#btn-craft-back');
  await page.reload(); await page.waitForFunction(() => window.__wildforge?.app);

  // hunt with ember: skill works, cost/cooldown match UI (Q11)
  await page.click('#btn-hunt');
  const prep = await txt(page, '#prep-loadout');
  rec('prep-shows-ember-skill-cost-cd', prep.includes('ถุงไฟ') && prep.includes('ใช้แรง 30') && prep.includes('10.0'), prep.replace(/\s+/g, ' '));
  await page.screenshot({ path: 'qa-artifacts/m2-prep.png' });
  await page.click('#btn-start');
  await page.evaluate(() => { const h = window.__wildforge.hunt; h.monster.phase = 'stagger'; h.monster.t = 0; h.monster.staggerDur = 1e9; h.monster.pos = { x: 800, y: 330 }; });
  const s0 = await page.evaluate(() => { const p = window.__wildforge.hunt.player; return { stam: p.stamina, x: p.pos.x, y: p.pos.y }; });
  await page.keyboard.press('KeyL'); await sleep(500);
  const s1 = await page.evaluate(() => { const h = window.__wildforge.hunt; return { zone: h.zone && { r: h.zone.r }, cd: h.player.skillCooldown, stam: h.player.stamina, hud: document.getElementById('skill-cd').textContent, btn: document.getElementById('btn-skill-label').textContent }; });
  await page.screenshot({ path: 'qa-artifacts/m2-ember-zone.png' });
  rec('Q11-ember-skill-places-zone-cost30-cd10', !!s1.zone && s1.zone.r === 85 && s0.stam - s1.stam > 28 && s1.cd > 9 && s1.cd <= 10, JSON.stringify(s1));
  rec('Q11-HUD-cooldown-matches-state', Math.abs(parseFloat(s1.hud) - s1.cd) < 0.4 && Math.abs(parseFloat(s1.btn) - s1.cd) < 0.4, `hud=${s1.hud} btn=${s1.btn} state=${s1.cd.toFixed(2)}`);
  await page.keyboard.press('KeyL'); await sleep(250);
  const s2 = await page.evaluate(() => window.__wildforge.hunt.player.stamina);
  rec('skill-blocked-during-cooldown', s2 >= s1.stam - 1, `stamina ${s1.stam.toFixed(0)}→${s2.toFixed(0)}`);
  await page.click('#btn-pause'); await page.click('#btn-home'); await sleep(200);
  const stAfter = await stored(page);
  rec('abandon-from-pause-pays-nothing-and-clears-pending', stAfter.payload.pendingHunt === null && stAfter.payload.materials.heat_bladder === 2 * m1.materials.heat_bladder - 4, JSON.stringify(stAfter.payload.materials));

  // two fang hunts → craft fang, then test fang skill + passive combos
  for (let i = 0; i < 2; i++) { r = await quickHunt(page, { target: 'fang' }); await page.click('#btn-results-home'); }
  m2 = await mem(page);
  rec('fang-material-from-target-and-jaw-bonus', m2.materials.fang >= 4, `fang=${m2.materials.fang}`);
  await page.click('#btn-craft');
  await page.click('#craft-list .card:nth-child(1) button.primary'); await sleep(200);
  await page.selectOption('#slot-primary', 'fang'); await sleep(100);
  await page.selectOption('#slot-secondary', 'ember'); await sleep(100);
  const lo = (await stored(page)).payload.loadout;
  rec('swap-modules-fang-primary-ember-secondary', lo.primaryModuleId === 'fang' && lo.secondaryModuleId === 'ember');
  await page.selectOption('#slot-secondary', 'fang'); await sleep(100); // duplicate must be rejected
  rec('duplicate-module-two-slots-rejected', (await stored(page)).payload.loadout.secondaryModuleId !== 'fang' && (await txt(page, '#craft-msg')).includes('สองช่อง'), await txt(page, '#craft-msg'));
  await page.click('#btn-craft-back');
  await page.click('#btn-hunt'); await page.click('#btn-start');
  await page.evaluate(() => { const h = window.__wildforge.hunt; h.monster.phase = 'stagger'; h.monster.t = 0; h.monster.staggerDur = 1e9; h.monster.pos = { x: 800, y: 330 }; });
  await page.evaluate(() => { const h = window.__wildforge.hunt; h.player.pos = { x: 800, y: 420 }; });
  await page.keyboard.press('KeyL'); await sleep(450);
  const f1 = await page.evaluate(() => { const h = window.__wildforge.hunt; return { bleed: !!h.dot, cd: h.player.skillCooldown, hp: h.monster.hp, hud: document.getElementById('skill-name').textContent }; });
  rec('Q11-fang-skill-bleeds-and-passive-cooldown-0.94', f1.bleed && Math.abs(f1.cd - 5.64) < 0.4, JSON.stringify(f1));
  await page.screenshot({ path: 'qa-artifacts/m2-fang-bleed.png' });
  await page.click('#btn-pause'); await page.click('#btn-home');
  await ctx.close();

  // =============== 2. failure pays nothing =================
  ctx = await newCtx(); page = await openPage(ctx);
  r = await quickHunt(page, { fail: true });
  const mf = await mem(page);
  await page.screenshot({ path: 'qa-artifacts/m2-results-failed.png' });
  rec('defeat-pays-nothing-keeps-observations', r.title === 'ล้มเหลว' && Object.values(mf.materials).every((n) => n === 0) && mf.research === 0 && mf.bestiary.ember_gecko.movesSeen.length >= 1 && mf.bestiary.ember_gecko.clears === 0, JSON.stringify(mf.bestiary));
  await ctx.close();

  // =============== 3. settlement write failure → retry pays once =================
  ctx = await newCtx(FAIL_HOOK); page = await openPage(ctx);
  await page.click('#btn-hunt'); await page.click('#btn-start');
  await page.evaluate(() => { const m = window.__wildforge.hunt.monster; m.hp = 30; m.partHp.fire_sac = 16; m.partHp.jaw = 16; window.__failWrites = true; });
  await page.evaluate(`(${BOT})({})`);
  await page.waitForFunction(() => !document.getElementById('screen-results').hidden, null, { timeout: 150000, polling: 300 });
  await sleep(300);
  const ms = await page.textContent('#results-save');
  const before = await mem(page);
  rec('Q12-save-failure-shows-error-not-success', ms.includes('บันทึกไม่สำเร็จ') && !ms.startsWith('บันทึกแล้ว') && await visible(page, '#btn-save-retry'), ms);
  rec('save-failure-rewards-not-in-inventory', before.materials.heat_bladder === 0 && before.pendingHunt !== null, JSON.stringify(before.materials));
  await page.screenshot({ path: 'qa-artifacts/m2-save-failed.png' });
  await page.click('#btn-save-retry'); await sleep(200);
  rec('retry-while-still-failing-no-double', (await mem(page)).materials.heat_bladder === 0);
  await page.evaluate(() => { window.__failWrites = false; });
  await page.click('#btn-save-retry'); await sleep(200);
  const after = await mem(page);
  rec('retry-after-recovery-pays-exactly-once', after.materials.heat_bladder === 3 && (await txt(page, '#results-save')) === 'บันทึกแล้ว', JSON.stringify(after.materials));
  await page.evaluate(() => { const a = window.__wildforge.app; a.onResult(a.lastResult); });
  rec('retry-then-replay-still-once', (await mem(page)).materials.heat_bladder === 3);
  await page.reload(); await page.waitForFunction(() => window.__wildforge?.app);
  rec('reload-after-retry-once', (await mem(page)).materials.heat_bladder === 3);
  await ctx.close();

  // =============== 4. closed mid-hunt → abandoned on reopen =================
  ctx = await newCtx(); page = await openPage(ctx);
  await page.evaluate(() => { const s = window.__wildforge.save; const n = JSON.parse(JSON.stringify(s.state)); n.materials.fang = 3; s.commit(n); });
  await page.click('#btn-hunt'); await page.click('#btn-start'); await sleep(500);
  const pend = (await stored(page)).payload.pendingHunt;
  rec('pendingHunt-persisted-before-entering-hunt', !!pend && pend.targetMaterialId === 'heat_bladder');
  await page.reload(); await page.waitForFunction(() => window.__wildforge?.app);
  await sleep(300);
  const dlg = await visible(page, '#overlay-dialog') ? await txt(page, '#dialog-panel') : '';
  const sa = await stored(page);
  rec('reopen-after-mid-hunt-close-abandoned-no-loss', dlg.includes('ปิดกลางคัน') && sa.payload.pendingHunt === null && sa.payload.materials.fang === 3 && sa.payload.lastSettlementId === pend.huntId, dlg.slice(0, 60));
  await ctx.close();

  // =============== 5. recovery / corrupt / import-export (Q12) =================
  ctx = await newCtx(); page = await openPage(ctx);
  await page.evaluate(() => { const s = window.__wildforge.save; for (const f of [3, 5]) { const n = JSON.parse(JSON.stringify(s.state)); n.materials.fang = f; s.commit(n); } });
  const goodBackup = await page.evaluate(() => localStorage.getItem('wildforge.save.backup'));
  await page.evaluate(() => localStorage.setItem('wildforge.save.primary', '{"broken":'));
  await page.reload(); await page.waitForFunction(() => window.__wildforge?.app); await sleep(300);
  rec('Q12-corrupt-primary-offers-backup-recovery', (await txt(page, '#dialog-panel')).includes('กู้เซฟจาก backup'));
  rec('recovery-does-not-overwrite-until-confirmed', (await page.evaluate(() => localStorage.getItem('wildforge.save.primary'))) === '{"broken":');
  await page.screenshot({ path: 'qa-artifacts/m2-recovery.png' });
  await page.click('#dialog-panel button.primary'); await sleep(300);
  rec('recovery-confirmed-restores-backup-data', (await mem(page)).materials.fang === 3 && (await stored(page)).payload.materials.fang === 3 && await visible(page, '#screen-base'));

  // both corrupt
  await page.evaluate(() => { localStorage.setItem('wildforge.save.primary', 'xx'); localStorage.setItem('wildforge.save.backup', 'yy'); });
  await page.reload(); await page.waitForFunction(() => window.__wildforge?.app); await sleep(300);
  rec('Q12-both-corrupt-no-silent-reset', (await txt(page, '#dialog-panel')).includes('เซฟเสียหาย') && (await page.evaluate(() => localStorage.getItem('wildforge.save.primary'))) === 'xx');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#dialog-panel button:has-text("ส่งออกข้อมูลดิบ")')]);
  const rawPath = '/tmp/claude-0/raw-export.json'; await dl.saveAs(rawPath);
  rec('corrupt-raw-export-contains-original-bytes', readFileSync(rawPath, 'utf8').includes('xx'));
  // import a bad file then a good one
  await page.click('#dialog-panel button:has-text("นำเข้าเซฟจากไฟล์")');
  await page.fill('#import-text', 'not json');
  rec('import-invalid-json-rejected-with-reason', (await txt(page, '#import-preview')).includes('นำเข้าไม่ได้') && await page.isDisabled('#btn-import-apply'));
  const goodEnv = JSON.parse(goodBackup);
  const unknown = JSON.parse(JSON.stringify(goodEnv)); unknown.payload.materials.gold = 5;
  await page.fill('#import-text', JSON.stringify(unknown));
  rec('import-unknown-id-rejected', (await txt(page, '#import-preview')).includes('วัสดุที่ไม่รู้จัก') && await page.isDisabled('#btn-import-apply'), await txt(page, '#import-preview'));
  const fut = JSON.parse(JSON.stringify(goodEnv)); fut.schemaVersion = 7;
  await page.fill('#import-text', JSON.stringify(fut));
  rec('import-future-schema-rejected', (await txt(page, '#import-preview')).includes('รุ่นใหม่กว่า'));
  const tampered = JSON.parse(JSON.stringify(goodEnv)); tampered.payload.materials.fang = 99;
  await page.fill('#import-text', JSON.stringify(tampered));
  rec('import-checksum-mismatch-rejected', (await txt(page, '#import-preview')).includes('checksum'));
  rec('rejected-imports-wrote-nothing', (await page.evaluate(() => localStorage.getItem('wildforge.save.primary'))) === 'xx');
  await page.fill('#import-text', goodBackup);
  const pv = await txt(page, '#import-preview');
  rec('import-valid-shows-preview-before-commit', pv.includes('ตัวอย่างข้อมูล') && !(await page.isDisabled('#btn-import-apply')) && (await page.evaluate(() => localStorage.getItem('wildforge.save.primary'))) === 'xx', pv.replace(/\s+/g, ' ').slice(0, 90));
  await page.screenshot({ path: 'qa-artifacts/m2-import-preview.png' });
  await page.click('#btn-import-apply'); await sleep(300);
  rec('import-replaces-save', (await mem(page)).materials.fang === goodEnv.payload.materials.fang && (await stored(page)).payload.materials.fang === goodEnv.payload.materials.fang && await visible(page, '#screen-base'));
  // export then re-import equality
  await page.click('#btn-save-tools');
  const [dl2] = await Promise.all([page.waitForEvent('download'), page.click('#dialog-panel button:has-text("ส่งออกเซฟ")')]);
  await dl2.saveAs('/tmp/claude-0/export.json');
  const ex = JSON.parse(readFileSync('/tmp/claude-0/export.json', 'utf8'));
  rec('export-is-versioned-envelope-with-checksum', ex.format === 'wildforge-save' && ex.schemaVersion === 1 && typeof ex.checksum === 'string' && ex.payload.materials.fang === goodEnv.payload.materials.fang);
  await ctx.close();

  // storage unavailable
  ctx = await newCtx(NO_STORAGE); page = await openPage(ctx);
  rec('Q12-storage-unavailable-banner-shown', (await visible(page, '#save-banner')) && (await txt(page, '#save-banner')).includes('ยังไม่บันทึก'), await txt(page, '#save-banner'));
  r = await quickHunt(page, { target: 'heat_bladder' });
  rec('storage-unavailable-still-playable-no-fake-saved', r.title === 'ล่าสำเร็จ!' && !r.saveMsg.startsWith('บันทึกแล้ว') && r.saveMsg.includes('ยังไม่ได้บันทึกถาวร'), r.saveMsg);
  await page.click('#btn-results-home'); await page.click('#btn-save-tools');
  const [dl3] = await Promise.all([page.waitForEvent('download'), page.click('#dialog-panel button:has-text("ส่งออกเซฟ")')]);
  await dl3.saveAs('/tmp/claude-0/export-volatile.json');
  rec('storage-unavailable-export-works', JSON.parse(readFileSync('/tmp/claude-0/export-volatile.json', 'utf8')).payload.materials.heat_bladder === 3);
  await ctx.close();

  // =============== 6. two tabs (Q13) =================
  ctx = await newCtx(); const A = await openPage(ctx); const B = await openPage(ctx);
  await A.evaluate(() => { const s = window.__wildforge.save; const n = JSON.parse(JSON.stringify(s.state)); n.materials.fang = 6; s.commit(n); });
  await sleep(400);
  rec('Q13-other-tab-notified-and-locked', (await visible(B, '#overlay-dialog')) && (await txt(B, '#dialog-panel')).includes('หลายแท็บ') && await B.evaluate(() => window.__wildforge.save.conflict));
  await B.screenshot({ path: 'qa-artifacts/m2-two-tabs.png' });
  const wr = await B.evaluate(() => { const s = window.__wildforge.save; const n = JSON.parse(JSON.stringify(s.state)); n.materials.fang = 1; return s.commit(n); });
  rec('Q13-stale-tab-write-refused-nothing-overwritten', wr.ok === false && (await stored(A)).payload.materials.fang === 6, JSON.stringify(wr));
  await B.click('#dialog-panel button:has-text("โหลดใหม่")'); await B.waitForFunction(() => window.__wildforge?.app); await sleep(200);
  rec('Q13-reload-shows-latest', (await mem(B)).materials.fang === 6);
  await ctx.close();

  // =============== 7. Q14 leak check over 10 hunts =================
  ctx = await newCtx(); page = await openPage(ctx);
  const heap = []; const kids = [];
  for (let i = 0; i < 10; i++) {
    const q = await quickHunt(page, { target: i % 2 ? 'fang' : 'heat_bladder' });
    if (q.title !== 'ล่าสำเร็จ!') { i--; await page.click('#btn-retry'); await page.evaluate(() => window.__bot?.stop()); continue; }
    await page.click('#btn-results-home'); await sleep(200);
    const mm = await page.evaluate(() => { gc(); gc(); return { heap: performance.memory.usedJSHeapSize, kids: window.__wildforge.scene.children.length, fx: window.__wildforge.scene.fx.length, ghosts: window.__wildforge.scene.ghosts.length }; });
    heap.push(mm.heap); kids.push(mm.kids);
  }
  const growthPerHunt = (heap[9] - heap[2]) / 7 / 1024;
  rec('Q14-10-hunts-scene-children-stable', new Set(kids).size === 1, `children per hunt: ${kids.join(',')}`);
  rec('Q14-10-hunts-heap-no-clear-growth', growthPerHunt < 300, `heap MB: ${heap.map((h) => (h / 1048576).toFixed(1)).join(', ')} | ~${growthPerHunt.toFixed(0)} KB/hunt after hunt 3`);
  await ctx.close();

  // =============== 8. layout of screens & skill button =================
  const sizes = [{ width: 844, height: 390 }, { width: 740, height: 360 }, { width: 667, height: 375 }, { width: 568, height: 320 }];
  ctx = await newCtx(); page = await openPage(ctx);
  for (const vp of sizes) {
    await page.setViewportSize(vp); await sleep(250);
    const fits = {};
    for (const [scr, open] of [['base', null], ['prep', '#btn-hunt'], ['craft', '#btn-prep-craft']]) {
      if (open) await page.click(open);
      await sleep(100);
      const o = await page.evaluate((id) => { const sc = document.getElementById('screen-' + id); const p = sc.querySelector('.panel'); const r = p.getBoundingClientRect(); const bs = [...sc.querySelectorAll('button')].map((b) => b.getBoundingClientRect()); return { scrollable: sc.scrollHeight > sc.clientHeight, w: r.width, vw: innerWidth, minBtn: Math.min(...bs.map((b) => b.height)), allInX: bs.every((b) => b.left >= 0 && b.right <= innerWidth) }; }, scr);
      fits[scr] = o;
      if (vp.width === 740) await page.screenshot({ path: `qa-artifacts/m2-screen-${scr}-740x360.png` });
    }
    rec(`layout-${vp.width}x${vp.height}-screens-usable`, Object.values(fits).every((o) => o.w <= o.vw && o.minBtn >= 44 && o.allInX), JSON.stringify(Object.fromEntries(Object.entries(fits).map(([k, o]) => [k, { sc: o.scrollable, mb: Math.round(o.minBtn) }]))));
    await page.click('#btn-craft-back');
  }
  // HUD buttons incl. skill
  await page.setViewportSize(VP); await page.click('#btn-hunt'); await page.click('#btn-start');
  for (const vp of sizes) {
    await page.setViewportSize(vp); await sleep(250);
    const bx = await page.evaluate(() => ['btn-attack', 'btn-dodge', 'btn-part', 'btn-skill', 'btn-pause'].map((id) => { const r = document.getElementById(id).getBoundingClientRect(); return { id, w: r.width, h: r.height, l: r.left, t: r.top, r: r.right, b: r.bottom }; }));
    const ov = (a, b) => !(a.r <= b.l || b.r <= a.l || a.b <= b.t || b.b <= a.t);
    let o = false; for (let i = 0; i < bx.length; i++) for (let j = i + 1; j < bx.length; j++) if (ov(bx[i], bx[j])) o = true;
    rec(`Q15-${vp.width}x${vp.height}-5-buttons-ok`, !o && bx.every((x) => x.w >= 48 && x.h >= 48 && x.l >= 0 && x.t >= 0 && x.r <= vp.width && x.b <= vp.height));
  }
  await page.setViewportSize(VP); await sleep(300);
  await page.screenshot({ path: 'qa-artifacts/m2-hunt-hud-844x390.png' });
  await ctx.close();

  rec('no-console-errors', errors.length === 0, errors.slice(0, 3).join(' | '));
} finally {
  await browser.close(); srv.kill();
  const fails = results.filter((x) => !x.ok);
  console.log(`\n${results.length - fails.length}/${results.length} passed`);
  writeFileSync('qa-artifacts/qa-m2-results.json', JSON.stringify(results, null, 1));
  process.exitCode = fails.length ? 1 : 0;
}

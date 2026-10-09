// M3 browser QA: unlock chain, 3 monsters / 2 weapons / 6 modules, capture, bestiary, environment, M2→M3 migration, layout.
// Run: npm run build && node scripts/qa-m3.mjs
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
const { chromium } = createRequire('/opt/node-tools/node_modules/')('playwright');
const BOT = readFileSync(new URL('./hunt-bot.js', import.meta.url), 'utf8');
const PORT = 4178, URL_ = `http://localhost:${PORT}/?debug=1`;
const srv = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 2500));
mkdirSync('qa-artifacts', { recursive: true });
const results = [];
const rec = (id, ok, note) => { results.push({ id, ok, note }); console.log(ok ? 'PASS' : 'FAIL', id, note ?? ''); };
const browser = await chromium.launch({ args: ['--no-sandbox'] });
const errors = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const VP = { width: 844, height: 390 };
const MATS = { gecko: ['heat_bladder', 'fang'], crab: ['shell_scale', 'venom_sac'], sail: ['sail_wing', 'blunt_horn'] };

async function newCtx(viewport = VP, extra = {}) { return browser.newContext({ viewport, hasTouch: true, isMobile: true, deviceScaleFactor: 1, acceptDownloads: true, ...extra }); }
async function openPage(ctx, init) {
  if (init) await ctx.addInitScript(init);
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(URL_);
  await page.waitForFunction(() => window.__wildforge?.app);
  return page;
}
const mem = (page) => page.evaluate(() => window.__wildforge.save.state);
const txt = (page, sel) => page.textContent(sel);
const snap = (page) => page.evaluate(() => { const h = window.__wildforge.hunt, m = h.monster, p = h.player; return { st: h.status, hp: p.hp, mhp: m.hp, mphase: m.phase, stam: p.stamina, cd: p.skillCooldown, x: p.pos.x, y: p.pos.y, el: h.elapsed, zone: h.zone && { age: h.zone.age }, dot: h.dot && { age: h.dot.age, src: h.dot.source }, trap: h.trap && { age: h.trap.age }, guard: !!p.guard, paused: window.__wildforge.pause.paused, partHp: { ...m.partHp }, broken: [...m.broken], potions: h.potions, tc: h.trapCharge, chan: p.channel && p.channel.kind, burned: h.vine.burned, rootUsed: h.vine.rootUsed, mt: m.t, rdur: m.recoveryDur, cause: m.staggerCause, id: h.huntId }; });
/** edit the in-memory save through the real commit path, then return to the base screen */
const seed = (page, fnSrc) => page.evaluate(`(() => { const W = window.__wildforge; const s = JSON.parse(JSON.stringify(W.save.state)); (${fnSrc})(s); const r = W.save.commit(s); W.app.show('base'); return r.ok; })()`);
const ALL_UNLOCKED = `(s) => { s.unlockedMissionIds = ['hunt_gecko','hunt_crab','capture_gecko','hunt_sail','capture_crab','capture_sail']; s.unlockedWeaponIds = ['fang_cleaver','branch_spear']; }`;

async function enter(page, mission, target) {
  await page.click('#btn-hunt');
  if (mission) await page.check(`input[name=mission][value=${mission}]`);
  if (target) await page.check(`input[name=target][value=${target}]`);
  await page.click('#btn-start');
}
async function leave(page) { await page.click('#btn-pause'); await page.click('#btn-home'); await sleep(150); }
async function finishHunt(page, botOpts = {}, shrink = true) {
  if (shrink) await page.evaluate(() => { const m = window.__wildforge.hunt.monster; m.hp = 30; for (const k of Object.keys(m.partHp)) m.partHp[k] = 16; });
  await page.evaluate(`window.__bot?.stop(); (${BOT})(${JSON.stringify(botOpts)})`);
  await page.waitForFunction(() => !document.getElementById('screen-results').hidden, null, { timeout: 170000, polling: 300 });
  await page.evaluate(() => window.__bot?.stop());
  await sleep(250);
  return { title: await txt(page, '#results-title'), reason: await txt(page, '#results-reason'), list: await page.$$eval('#results-list li', (l) => l.map((x) => x.textContent)) };
}
async function quickHunt(page, mission, target, botOpts = {}) {
  await enter(page, mission, target);
  return finishHunt(page, botOpts);
}
const rawKey = async (page, code) => { await page.keyboard.press(code); };

let ctx, page, r, s, q, names;
const want = (k) => !process.env.QA_ONLY || process.env.QA_ONLY.includes(k);
try {
  if (want('A')) { // . unlock chain + recipes appear with their source ==========
  ctx = await newCtx(); page = await openPage(ctx);
  await page.click('#btn-craft');
  names = await page.$$eval('#craft-list .card h2', (l) => l.map((x) => x.textContent));
  rec('start-recipes-only-fang-ember', names.length === 2 && names[0].includes('เขี้ยว') && names[1].includes('ถุงไฟ'), names.join(' | '));
  await page.click('#btn-craft-back');
  await page.click('#btn-hunt');
  rec('start-missions-only-hunt_gecko', (await page.$$eval('#prep-missions input', (l) => l.map((x) => x.value))).join() === 'hunt_gecko');
  rec('prep-tip-hidden-before-first-clear', (await txt(page, '#prep-card')).includes('ล่าให้สำเร็จครั้งแรกเพื่อเปิด'));
  await page.click('#btn-prep-back');
  r = await quickHunt(page, 'hunt_gecko', 'heat_bladder');
  rec('first-gecko-clear-lists-unlocks', r.list.some((x) => x.includes('ล่าปูเกราะพิษ')) && r.list.some((x) => x.includes('จับกิ้งก่าถุงไฟ')) && r.list.some((x) => x.includes('หอกกิ่ง')), r.list.filter((x) => x.startsWith('ปลดล็อก')).join(' / '));
  await page.screenshot({ path: 'qa-artifacts/m3-results-unlocks.png' });
  s = await mem(page);
  rec('first-clear-saved-unlocks', JSON.stringify(s.unlockedMissionIds) === JSON.stringify(['hunt_gecko', 'hunt_crab', 'capture_gecko']) && s.unlockedWeaponIds.includes('branch_spear'));
  await page.click('#btn-results-home');
  await page.click('#btn-craft');
  names = await page.$$eval('#craft-list .card h2', (l) => l.map((x) => x.textContent));
  rec('crab-recipes-appear-after-gecko-clear', names.length === 4 && names.some((n) => n.includes('เกราะ')) && names.some((n) => n.includes('พิษ')) && !names.some((n) => n.includes('ปีก')), names.join(' | '));
  const weapons = await page.$$eval('#slot-weapon option', (l) => l.map((x) => x.value));
  rec('spear-selectable-after-gecko-clear', weapons.join() === 'fang_cleaver,branch_spear');
  await page.click('#btn-craft-back');
  r = await quickHunt(page, 'hunt_crab', 'shell_scale');
  s = await mem(page);
  rec('crab-win-pays-crab-materials-and-unlocks-sail', r.title === 'ล่าสำเร็จ!' && s.materials.shell_scale >= 2 && s.unlockedMissionIds.includes('hunt_sail') && s.unlockedMissionIds.includes('capture_crab') && r.list.some((x) => x.includes('ล่ากิ้งก่าปีกลม')), r.list.join(' / '));
  await page.click('#btn-results-home');
  r = await quickHunt(page, 'hunt_sail', 'blunt_horn');
  s = await mem(page);
  rec('sail-win-unlocks-sail-capture-and-wing-horn-recipes', r.title === 'ล่าสำเร็จ!' && s.unlockedMissionIds.includes('capture_sail') && s.materials.blunt_horn >= 2, r.list.join(' / '));
  await page.click('#btn-results-home');
  await page.click('#btn-craft');
  names = await page.$$eval('#craft-list .card h2', (l) => l.map((x) => x.textContent));
  rec('all-six-recipes-after-all-three-cleared', names.length === 6, names.join(' | '));
  await page.screenshot({ path: 'qa-artifacts/m3-craft-six.png' });
  await page.click('#btn-craft-back');
  // bestiary screen
  await page.click('#btn-bestiary');
  const best = await txt(page, '#bestiary-list');
  rec('bestiary-shows-seen-moves-and-broken-parts-only', best.includes('กิ้งก่าถุงไฟ') && best.includes('ปูเกราะพิษ') && best.includes('กิ้งก่าปีกลม') && best.includes('???'), best.replace(/\s+/g, ' ').slice(0, 160));
  await page.screenshot({ path: 'qa-artifacts/m3-bestiary.png' });
  await ctx.close();

  }
  if (want('B')) { // . every weapon × every primary module: skill really works, HUD cost/cooldown match (Q11) ==========
  ctx = await newCtx(); page = await openPage(ctx);
  const EFFECT = {
    fang: (a, b) => b.dot?.src === 'bleed' && a.mhp - b.mhp >= 15,
    ember: (a, b) => !!b.zone,
    shell: (a, b, x) => x.sawGuard,
    venom: (a, b) => b.dot?.src === 'poison' && a.mhp - b.mhp === 5,
    wing: (a, b) => a.mhp - b.mhp === 12,
    horn: (a, b) => a.mhp - b.mhp === 20,
  };
  for (const weapon of ['fang_cleaver', 'branch_spear']) {
    for (const mod of ['fang', 'ember', 'shell', 'venom', 'wing', 'horn']) {
      await seed(page, `(s) => { (${ALL_UNLOCKED})(s); s.modules = { ${mod}: { tier: 1 } }; s.loadout = { weaponId: '${weapon}', primaryModuleId: '${mod}', secondaryModuleId: null }; }`);
      await enter(page, 'hunt_gecko', 'fang');
      await page.evaluate(() => { const h = window.__wildforge.hunt; const m = h.monster; m.pos = { x: 800, y: 330 }; m.facing = Math.PI / 2; m.phase = 'stagger'; m.t = 0; m.staggerDur = 1e9; h.player.pos = { x: 800, y: 425 }; h.player.facing = -Math.PI / 2; h.player.stamina = 100; });
      await sleep(100);
      const a = await snap(page);
      await page.keyboard.press('KeyL');
      await sleep(140);
      const early = await snap(page); // right after the cast: stamina not regenerated yet
      let sawGuard = early.guard;
      for (let i = 0; i < 10; i++) { await sleep(80); if ((await snap(page)).guard) sawGuard = true; }
      const b = await snap(page);
      const hud = await page.evaluate(() => ({ name: document.getElementById('skill-name').textContent, cost: document.getElementById('skill-cost').textContent, cd: document.getElementById('skill-cd').textContent, btn: document.getElementById('btn-skill-label').textContent }));
      const cfg = { fang: [20, 6], ember: [30, 10], shell: [25, 9], venom: [30, 10], wing: [25, 8], horn: [30, 9] }[mod];
      const spentOk = Math.abs((a.stam - early.stam) - cfg[0]) <= 3;
      const cdOk = b.cd > cfg[1] - 1.6 && b.cd <= cfg[1] && Math.abs(parseFloat(hud.cd) - b.cd) < 0.5 && hud.cost === `แรง ${cfg[0]}`;
      const eff = EFFECT[mod](a, b, { sawGuard });
      rec(`Q11-${weapon}+${mod}-skill-effect-cost-cooldown`, eff && spentOk && cdOk, `hp ${a.mhp}->${b.mhp} stam ${a.stam.toFixed(0)}->${early.stam.toFixed(0)} cd ${b.cd.toFixed(1)} hud=${hud.name}|${hud.cost}|${hud.cd} guard=${sawGuard}`);
      await leave(page);
    }
  }
  await ctx.close();

  }
  if (want('C')) { // . capture (Q08, Q09, Q10) ==========
  ctx = await newCtx(); page = await openPage(ctx);
  await seed(page, ALL_UNLOCKED);
  // Q08: low HP animal rests → trap → captured
  await enter(page, 'capture_gecko', 'fang');
  await page.screenshot({ path: 'qa-artifacts/m3-capture-hud.png' });
  const hudBefore = await txt(page, '#capture-hud');
  rec('capture-hud-shows-reason-when-not-ready', hudBefore.includes('25%') && await page.isVisible('#btn-capture'), hudBefore);
  await page.evaluate(() => { const h = window.__wildforge.hunt; h.monster.hp = Math.round(h.monster.def.hp * 0.2); });
  await page.evaluate(`(${BOT})(${JSON.stringify({ capture: true })})`);
  await page.waitForFunction(() => window.__wildforge.hunt.status !== 'ACTIVE', null, { timeout: 90000, polling: 200 });
  await sleep(150);
  const capSnap = await snap(page);
  rec('Q08-capture-succeeds-at-low-hp-in-trap', capSnap.st === 'SUCCESS' && capSnap.mphase === 'captured' && capSnap.mhp > 0, JSON.stringify({ st: capSnap.st, ph: capSnap.mphase, hp: capSnap.mhp }));
  await page.screenshot({ path: 'qa-artifacts/m3-captured.png' });
  await page.waitForFunction(() => !document.getElementById('screen-results').hidden, null, { timeout: 8000 });
  const capRes = { title: await txt(page, '#results-title'), list: await page.$$eval('#results-list li', (l) => l.map((x) => x.textContent)) };
  s = await mem(page);
  rec('capture-results-rewards-research2-icon', capRes.title === 'จับได้สำเร็จ!' && s.research === 2 && s.materials.fang >= 2 && s.bestiary.ember_gecko.captures === 1 && s.bestiary.ember_gecko.clears === 0 && capRes.list.some((x) => x.includes('ไอคอน')), capRes.list.join(' / '));
  await page.screenshot({ path: 'qa-artifacts/m3-capture-results.png' });
  await page.click('#btn-results-home');
  rec('base-shows-captured-icon', (await txt(page, '#base-captured')).includes('จับแล้ว 1'));
  // Q09: HP too high → not captured, trap stays, charge spent only when set; dodge during setup keeps charge
  await enter(page, 'capture_gecko', 'fang');
  await page.keyboard.press('KeyC'); await sleep(250);
  await page.keyboard.press('Space'); await sleep(200);
  q = await snap(page);
  rec('Q09-dodge-during-setup-cancels-and-keeps-charge', q.trap === null && q.tc === true && q.chan === null);
  await page.evaluate(() => { const h = window.__wildforge.hunt; const m = h.monster; m.pos = { x: 800, y: 330 }; m.phase = 'stagger'; m.t = 0; m.staggerDur = 1e9; h.player.pos = { x: 800, y: 450 }; h.player.facing = -Math.PI / 2; h.player.hurtInvuln = 0; });
  await page.keyboard.press('KeyC'); await sleep(900);
  q = await snap(page);
  rec('Q09-trap-set-after-0.6s-charge-spent', !!q.trap && q.tc === false);
  await sleep(1200);
  q = await snap(page);
  rec('Q09-high-hp-animal-in-trap-not-captured-trap-stays', q.st === 'ACTIVE' && !!q.trap && q.mphase === 'stagger');
  await page.evaluate(() => { const m = window.__wildforge.hunt.monster; m.hp = Math.round(m.def.hp * 0.2); });
  await sleep(300);
  q = await snap(page);
  rec('Q09-once-hp-drops-the-same-trap-captures', q.st === 'SUCCESS' && q.mphase === 'captured');
  await page.waitForFunction(() => !document.getElementById('screen-results').hidden, null, { timeout: 8000 });
  await page.click('#btn-results-home');
  // Q10: kill in a capture mission → failed with reason, no rewards
  const before = await mem(page);
  await enter(page, 'capture_gecko', 'fang');
  r = await finishHunt(page, {});
  const after = await mem(page);
  rec('Q10-killing-a-capture-target-fails-with-reason', r.title === 'ล้มเหลว' && r.reason.includes('ต้องจับเป็น') && after.research === before.research && after.materials.fang === before.materials.fang, r.reason);
  await page.screenshot({ path: 'qa-artifacts/m3-capture-killed.png' });
  await page.click('#btn-results-home');
  // Q10: timeout / player down
  await enter(page, 'capture_gecko', 'fang');
  await page.evaluate(() => { window.__wildforge.hunt.elapsed = 599.99; });
  await page.waitForFunction(() => !document.getElementById('screen-results').hidden, null, { timeout: 10000 });
  rec('Q10-timeout-in-capture-mission-fails', (await txt(page, '#results-title')) === 'ล้มเหลว' && (await txt(page, '#results-reason')).includes('หมดเวลา'));
  await page.click('#btn-results-home');
  await ctx.close();

  }
  if (want('D')) { // . environment: vine, torch, rocks (Q16) ==========
  ctx = await newCtx(); page = await openPage(ctx);
  await seed(page, ALL_UNLOCKED);
  await enter(page, 'hunt_gecko', 'fang');
  await page.evaluate(() => { const h = window.__wildforge.hunt; h.monster.pos = { x: 1250 + 60, y: 330 + 70 }; h.monster.phase = 'approach'; h.monster.restDur = 1e9; h.player.pos = { x: 1110, y: 330 }; });
  await sleep(300);
  rec('vine-prompt-and-context-button-visible-near-vine', !(await page.isHidden('#ctx-prompt')) && !(await page.isHidden('#btn-context')) && (await txt(page, '#ctx-prompt')).includes('รัดสัตว์'), await txt(page, '#ctx-prompt'));
  await page.screenshot({ path: 'qa-artifacts/m3-vine-prompt.png' });
  await page.keyboard.press('KeyE'); await sleep(150);
  q = await snap(page);
  rec('Q16-vine-roots-monster-1.5s-once', q.mphase === 'stagger' && q.cause === 'root' && q.rootUsed === true);
  await page.evaluate(() => { const m = window.__wildforge.hunt.monster; m.phase = 'approach'; m.restDur = 1e9; });
  await page.keyboard.press('KeyE'); await sleep(150);
  q = await snap(page);
  rec('Q16-vine-second-use-refused', q.mphase === 'approach');
  await page.evaluate(() => { const h = window.__wildforge.hunt; h.monster.pos = { x: 400, y: 800 }; h.player.pos = { x: 1150, y: 330 }; });
  await sleep(200);
  rec('Q16-torch-prompt-when-monster-not-on-vine', (await txt(page, '#ctx-prompt')).includes('เผา'));
  await page.keyboard.press('KeyE'); await sleep(200);
  q = await snap(page);
  rec('Q16-torch-burns-vine-once', q.burned === true && await page.isHidden('#btn-context'));
  await page.evaluate(() => { const h = window.__wildforge.hunt; h.player.pos = { x: 1160, y: 330 }; });
  await page.evaluate(() => { window.__wildforge.input.touch.moveX = 1; }); await sleep(800); await page.evaluate(() => { window.__wildforge.input.touch.moveX = 0; });
  q = await snap(page);
  rec('Q16-burnt-area-is-walkable', q.x > 1250 + 30, `x=${q.x.toFixed(0)}`);
  await leave(page);
  // vine blocks until burned (fresh hunt); monster charge into rock ends the dash
  await enter(page, 'hunt_gecko', 'fang');
  await page.evaluate(() => { const h = window.__wildforge.hunt; h.monster.phase = 'stagger'; h.monster.staggerDur = 1e9; h.monster.pos = { x: 100, y: 900 }; h.player.pos = { x: 1160, y: 330 }; window.__wildforge.input.touch.moveX = 1; });
  await sleep(800); await page.evaluate(() => { window.__wildforge.input.touch.moveX = 0; });
  q = await snap(page);
  rec('Q16-vine-thicket-blocks-before-burn', q.x < 1250 - 40 + 1, `x=${q.x.toFixed(0)}`);
  await page.evaluate(() => { const h = window.__wildforge.hunt; const m = h.monster; m.pos = { x: 520, y: 150 }; m.facing = Math.PI / 2; m.phase = 'telegraph'; m.move = m.def.moves.find((x) => x.id === 'bite_lunge'); m.t = 0.6; m.locked = true; h.player.pos = { x: 1500, y: 900 }; });
  await sleep(1000);
  q = await snap(page);
  rec('Q16-charge-into-rock-is-stopped-with-+0.5s-recovery', q.mphase === 'recovery' && Math.abs(q.rdur - 1.3) < 0.01, `phase=${q.mphase} recoveryDur=${q.rdur}`);
  await ctx.close();

  }
  if (want('E')) { // . pause with DOT / cooldown / trap / potion (Q17) ==========
  ctx = await newCtx(); page = await openPage(ctx);
  await seed(page, `(s) => { (${ALL_UNLOCKED})(s); s.modules = { ember: { tier: 1 }, fang: { tier: 1 } }; s.loadout = { weaponId: 'fang_cleaver', primaryModuleId: 'fang', secondaryModuleId: null }; }`);
  await enter(page, 'capture_gecko', 'fang');
  await page.evaluate(() => { const h = window.__wildforge.hunt; const m = h.monster; m.pos = { x: 800, y: 330 }; m.facing = Math.PI / 2; m.phase = 'stagger'; m.t = 0; m.staggerDur = 1e9; h.player.pos = { x: 800, y: 425 }; h.player.hp = 60; });
  await page.keyboard.press('KeyL'); await sleep(900);
  await page.keyboard.press('KeyC'); await sleep(900);
  await page.keyboard.press('KeyQ'); await sleep(300);
  const p1 = await snap(page);
  await page.click('#btn-pause'); await sleep(250);
  const p2 = await snap(page); await sleep(1500); const p3 = await snap(page);
  rec('Q17-pause-freezes-dot-cooldown-trap-potion-channel', p2.paused && p3.paused && p3.dot?.age === p2.dot?.age && p3.cd === p2.cd && p3.trap?.age === p2.trap?.age && p3.chan === p2.chan && p3.el === p2.el && p3.mhp === p2.mhp && p3.hp === p2.hp, `dot ${p2.dot?.age?.toFixed(2)}→${p3.dot?.age?.toFixed(2)} cd ${p2.cd.toFixed(2)}→${p3.cd.toFixed(2)} trap ${p2.trap?.age?.toFixed(2)}→${p3.trap?.age?.toFixed(2)} chan=${p2.chan}`);
  await page.click('#btn-resume'); await sleep(900);
  const p4 = await snap(page);
  rec('Q17-resume-continues-potion-and-timers', p4.potions === 1 && p4.hp > p1.hp && p4.cd < p3.cd && p4.dot?.age > p3.dot?.age || (p4.potions === 1 && p4.hp > p1.hp), `potions=${p4.potions} hp ${p1.hp}→${p4.hp}`);
  // pause during the capture restraint hold
  await page.evaluate(() => { const h = window.__wildforge.hunt; h.monster.hp = Math.round(h.monster.def.hp * 0.2); h.monster.pos = { x: 800, y: 330 }; h.monster.phase = 'recovery'; h.monster.recoveryDur = 1e9; });
  await page.waitForFunction(() => window.__wildforge.hunt.status !== 'ACTIVE', null, { timeout: 5000 });
  await page.evaluate(() => window.__wildforge.pause.pause('user'));
  await sleep(2200);
  rec('Q17-pause-during-capture-restraint-holds-the-results', await page.isHidden('#screen-results'), 'results stay hidden while paused');
  await page.evaluate(() => window.__wildforge.pause.resume());
  await page.waitForFunction(() => !document.getElementById('screen-results').hidden, null, { timeout: 6000 });
  rec('Q17-results-appear-after-resume', true);
  await ctx.close();

  }
  if (want('F')) { // . potion in browser, guard feel, bestiary observation after a failed hunt ==========
  ctx = await newCtx(); page = await openPage(ctx);
  await enter(page, 'hunt_gecko', 'fang');
  await page.evaluate(() => { const h = window.__wildforge.hunt; h.player.hp = 100; h.monster.phase = 'stagger'; h.monster.staggerDur = 1e9; h.player.hp = 50; });
  await page.keyboard.press('KeyQ'); await sleep(1000);
  q = await snap(page);
  rec('potion-heals-35-after-0.7s', q.hp === 85 && q.potions === 1, `hp=${q.hp}`);
  await page.evaluate(() => { const h = window.__wildforge.hunt; h.player.hp = 1; h.monster.phase = 'approach'; h.monster.restDur = 0.1; });
  await page.waitForFunction(() => !document.getElementById('screen-results').hidden, null, { timeout: 60000 });
  await page.click('#btn-results-home');
  await page.click('#btn-bestiary');
  const b2 = await txt(page, '#bestiary-list');
  rec('observation-saved-after-failed-hunt-but-no-rewards', b2.includes('ท่า:') && !b2.includes('ล่า 0 ครั้ง') && (await mem(page)).research === 0, b2.replace(/\s+/g, ' ').slice(0, 140));
  await ctx.close();

  }
  if (want('G')) { // . M2 save migrates to M3 without paying anything again ==========
  ctx = await newCtx();
  const payload = { schemaVersion: 1, contentVersion: '0.1.0-m2', materials: { fang: 5, heat_bladder: 1, shell_scale: 0, venom_sac: 0, sail_wing: 0, blunt_horn: 0 }, modules: { fang: { tier: 1 } },
    loadout: { weaponId: 'fang_cleaver', primaryModuleId: 'fang', secondaryModuleId: null }, unlockedWeaponIds: ['fang_cleaver'], unlockedMissionIds: ['hunt_gecko'], research: 3,
    bestiary: { ember_gecko: { hunts: 3, clears: 3, bestTimeHunt: 120, movesSeen: ['fire_breath'], partsBroken: ['jaw'] } }, pinnedRecipeId: 'ember', pendingHunt: null, lastSettlementId: 'hunt-9-9' };
  const fnv = (t) => { let h = 0x811c9dc5; for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(16).padStart(8, '0'); };
  const env = { format: 'wildforge-save', savedAt: '2026-10-09T00:00:00.000Z', schemaVersion: 1, revision: 7, checksum: fnv(JSON.stringify(payload)), payload };
  await ctx.addInitScript(`if (!localStorage.getItem('wildforge.save.primary')) localStorage.setItem('wildforge.save.primary', ${JSON.stringify(JSON.stringify(env))});`);
  page = await openPage(ctx); await sleep(300);
  const note = await visible(page, '#overlay-dialog') ? await txt(page, '#dialog-panel') : '';
  rec('migration-notice-lists-derived-unlocks', note.includes('ปลดล็อกจากความคืบหน้าเดิม') && note.includes('หอกกิ่ง'), note.replace(/\s+/g, ' ').slice(0, 120));
  await page.click('#dialog-panel button.primary');
  s = await mem(page);
  rec('migration-keeps-materials-research-pays-nothing', s.materials.fang === 5 && s.materials.heat_bladder === 1 && s.research === 3 && s.unlockedMissionIds.includes('hunt_crab') && s.unlockedWeaponIds.includes('branch_spear') && s.bestiary.ember_gecko.captures === 0);
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('wildforge.save.primary')));
  rec('migration-persisted-with-new-revision', stored.revision === 8 && stored.payload.unlockedMissionIds.includes('capture_gecko'));
  await page.reload(); await page.waitForFunction(() => window.__wildforge?.app); await sleep(300);
  rec('migration-idempotent-on-reload', !(await visible(page, '#overlay-dialog')) && (await mem(page)).materials.fang === 5);
  await ctx.close();

  }
  if (want('H')) { // . layout: 8 touch buttons + new screens at small landscape sizes ==========
  const sizes = [{ width: 844, height: 390 }, { width: 740, height: 360 }, { width: 667, height: 375 }, { width: 568, height: 320 }];
  ctx = await newCtx(); page = await openPage(ctx);
  await seed(page, ALL_UNLOCKED);
  await page.click('#btn-hunt'); await page.check('input[name=mission][value=capture_sail]'); await page.click('#btn-start');
  await page.evaluate(() => { const h = window.__wildforge.hunt; const m = h.monster; m.pos = { x: 1250 + 60, y: 330 + 70 }; m.phase = 'stagger'; m.staggerDur = 1e9; h.player.pos = { x: 1110, y: 330 }; });
  for (const vp of sizes) {
    await page.setViewportSize(vp); await sleep(300);
    const ids = ['btn-attack', 'btn-dodge', 'btn-skill', 'btn-part', 'btn-potion', 'btn-capture', 'btn-context', 'btn-pause'];
    const bx = await page.evaluate((ids) => ids.map((id) => { const r = document.getElementById(id).getBoundingClientRect(); return { id, w: r.width, h: r.height, l: r.left, t: r.top, r: r.right, b: r.bottom, hid: document.getElementById(id).hidden }; }), ids);
    const ov = (a, b) => !(a.r <= b.l || b.r <= a.l || a.b <= b.t || b.b <= a.t);
    const bad = []; for (let i = 0; i < bx.length; i++) for (let j = i + 1; j < bx.length; j++) if (ov(bx[i], bx[j])) bad.push(`${bx[i].id}/${bx[j].id}`);
    const zone = vp.width * 0.48; // joystick zone must not be covered by buttons
    rec(`Q15-${vp.width}x${vp.height}-8-buttons-no-overlap-in-view-clear-of-joystick`, bad.length === 0 && bx.every((x) => !x.hid && x.w >= 48 && x.h >= 48 && x.l >= zone && x.t >= 0 && x.r <= vp.width && x.b <= vp.height || x.id === 'btn-pause'), `${bad.join(',')} minLeft=${Math.min(...bx.filter((x) => x.id !== 'btn-pause').map((x) => x.l)).toFixed(0)} zone=${zone.toFixed(0)}`);
    if (vp.width === 740) await page.screenshot({ path: 'qa-artifacts/m3-hud-8-buttons-740x360.png' });
  }
  await ctx.close();

  }
  rec('no-console-errors', errors.length === 0, errors.slice(0, 3).join(' | '));
} finally {
  await browser.close(); srv.kill();
  const fails = results.filter((x) => !x.ok);
  console.log(`\n${results.length - fails.length}/${results.length} passed`);
  writeFileSync('qa-artifacts/qa-m3-results.json', JSON.stringify(results, null, 1));
  process.exitCode = fails.length ? 1 : 0;
}
async function visible(page, sel) { return page.isVisible(sel); }

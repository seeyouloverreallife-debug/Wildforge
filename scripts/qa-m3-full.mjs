// Full-HP bot hunts of the two new monsters (no shortening), recorded. Run: npm run build && node scripts/qa-m3-full.mjs
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
const { chromium } = createRequire('/opt/node-tools/node_modules/')('playwright');
const BOT = readFileSync(new URL('./hunt-bot.js', import.meta.url), 'utf8');
const PORT = 4179;
const srv = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 2500));
mkdirSync('qa-artifacts/tmp', { recursive: true });
const VP = { width: 844, height: 390 };
const browser = await chromium.launch({ args: ['--no-sandbox'] });
const errors = [];
const out = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (const [mission, target, tag] of [['hunt_crab', 'shell_scale', 'crab'], ['hunt_sail', 'sail_wing', 'sail']].filter((x) => !process.env.QA_MON || x[2] === process.env.QA_MON)) {
  let won = false;
  for (let attempt = 1; attempt <= 3 && !won; attempt++) {
    const ctx = await browser.newContext({ viewport: VP, hasTouch: true, isMobile: true, recordVideo: { dir: 'qa-artifacts/tmp', size: VP } });
    const page = await ctx.newPage();
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(`http://localhost:${PORT}/?debug=1`);
    await page.waitForFunction(() => window.__wildforge?.app);
    await page.evaluate(() => { const W = window.__wildforge; const s = JSON.parse(JSON.stringify(W.save.state)); s.unlockedMissionIds = ['hunt_gecko', 'hunt_crab', 'hunt_sail', 'capture_gecko', 'capture_crab', 'capture_sail']; W.save.commit(s); W.app.show('base'); });
    await page.click('#btn-hunt'); await page.check(`input[name=mission][value=${mission}]`); await page.check(`input[name=target][value=${target}]`); await page.click('#btn-start');
    await page.evaluate(`(${BOT})({})`);
    const t0 = Date.now();
    await page.waitForFunction(() => window.__wildforge.hunt.status !== 'ACTIVE', null, { timeout: 400000, polling: 500 });
    await sleep(1200);
    const info = await page.evaluate(() => { const h = window.__wildforge.hunt; return { st: h.status, el: h.elapsed, hp: h.player.hp, broken: [...h.monster.broken], log: window.__wildforge.log.filter((e) => e.type === 'player_hurt').length, tele: [...new Set(window.__wildforge.log.filter((e) => e.type === 'telegraph').map((e) => e.move))], bot: window.__bot.stats, hurtMoves: window.__wildforge.log.filter((e) => e.type === 'player_hurt').map((e) => e.move) }; });
    console.log(`${tag} attempt ${attempt}: ${info.st} sim ${info.el.toFixed(0)}s wall ${((Date.now() - t0) / 1000).toFixed(0)}s hp=${info.hp} broken=${info.broken} hurt=${info.log} moves=${info.tele} dodges=${info.bot.dodges}`);
    await page.screenshot({ path: `qa-artifacts/m3-${tag}-full-results.png` });
    const v = page.video();
    await ctx.close();
    if (info.st === 'SUCCESS') { won = true; await v.saveAs(`qa-artifacts/tmp/m3-${tag}-full.webm`); } else await v.delete();
    out.push({ tag, attempt, ...info });
  }
}
await browser.close(); srv.kill();
writeFileSync('qa-artifacts/qa-m3-full.json', JSON.stringify({ out, errors }, null, 1));
console.log('console errors:', errors.length);

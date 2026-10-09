import Phaser from 'phaser';
import { PLAYER } from './data/tuning';
import { DebugOverlay } from './diagnostics/debugOverlay';
import { captureReady, contextAction, type HuntEvent } from './domain/hunt';
import { monsterShapeHits, partWorldPos } from './domain/monster';
import { InputController } from './engine/input/InputController';
import { PauseController } from './engine/PauseController';
import { ArenaScene, type FrameInfo } from './engine/scenes/ArenaScene';
import { loadSettings, saveSettings, type Settings } from './persistence/settings';
import { localStorageKV, SaveManager } from './persistence/saveManager';
import { App } from './ui/app';
import { TouchControls } from './ui/touchControls';

const debugOn = new URLSearchParams(location.search).get('debug') === '1';
const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const settings: Settings = loadSettings();
const pause = new PauseController();
const gameEl = $('game');
const input = new InputController(gameEl);
const touchRoot = $('touch');
const touch = new TouchControls(touchRoot, input);
const debug = new DebugOverlay($('debug'), input);
const scene = new ArenaScene();
const saveMgr = new SaveManager(localStorageKV());
saveMgr.load();
let app: App;

// --- Touch visibility: coarse pointer, touch-capable device, ?touch=1, or first touch seen ---
const forceTouch = new URLSearchParams(location.search).get('touch') === '1';
const showTouch = () => { touchRoot.hidden = false; };
if (forceTouch || matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window) showTouch();
window.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') showTouch(); }, { capture: true, passive: true });

// --- Pause / settings / rotate overlays (screens are owned by App) ---
const overlays = { pause: $('overlay-pause'), settings: $('overlay-settings'), rotate: $('overlay-rotate') };
const render = () => {
  const manual = pause.cause !== null;
  const inHunt = app ? app.screen === 'hunt' : false;
  overlays.settings.hidden = !pause.settingsOpen;
  overlays.rotate.hidden = !(pause.portrait && !pause.settingsOpen);
  overlays.pause.hidden = !(manual && inHunt && !pause.settingsOpen && !pause.portrait);
  $('pause-reason').textContent = pause.cause === 'focus' ? 'เกมหยุดเพราะหน้าต่างเสียโฟกัส' : '';
  if (pause.paused) { input.reset(); touch.reset(); }
  if (!overlays.pause.hidden) $('btn-resume').focus();
  else if (!overlays.settings.hidden) $('btn-close-settings').focus();
};
pause.onChange(render);

const checkOrientation = () => pause.setPortrait(window.innerHeight > window.innerWidth);
window.addEventListener('resize', checkOrientation);
window.addEventListener('orientationchange', checkOrientation);
checkOrientation();

window.addEventListener('blur', () => { if (app?.screen === 'hunt') pause.pause('focus'); });
document.addEventListener('visibilitychange', () => { if (document.hidden && app?.screen === 'hunt') pause.pause('focus'); });
window.addEventListener('keydown', (e) => {
  if (e.code !== 'Escape' && e.code !== 'KeyP') return;
  if (e.repeat) return;
  if (pause.settingsOpen) { pause.setSettingsOpen(false); return; }
  if (app.screen !== 'hunt') return;
  if (pause.cause === null) pause.pause('user'); else pause.resume();
});
$('btn-pause').addEventListener('click', () => pause.pause('user'));
$('btn-resume').addEventListener('click', () => pause.resume());
$('btn-open-settings').addEventListener('click', () => pause.setSettingsOpen(true));
$('btn-rotate-settings').addEventListener('click', () => pause.setSettingsOpen(true));
$('btn-close-settings').addEventListener('click', () => pause.setSettingsOpen(false));

// --- Settings UI ---
const shake = $<HTMLInputElement>('set-shake'), reduced = $<HTMLInputElement>('set-reduced');
const showShake = () => { $('shake-val').textContent = `${Math.round(settings.screenShake * 100)}%`; };
shake.value = String(settings.screenShake); reduced.checked = settings.reducedEffects; showShake();
shake.addEventListener('input', () => { settings.screenShake = Number(shake.value); showShake(); saveSettings(settings); });
reduced.addEventListener('change', () => { settings.reducedEffects = reduced.checked; saveSettings(settings); });

// --- HUD ---
const hpFill = $('hp-fill'), hpText = $('hp-text'), stFill = $('st-fill'), stText = $('st-text'), timer = $('timer');
const bossFill = $('boss-fill'), hintEl = $('hint');
const skillHud = $('skill-hud'), skillName = $('skill-name'), skillCost = $('skill-cost'), skillCd = $('skill-cd');
const btnSkill = $('btn-skill'), btnSkillLabel = $('btn-skill-label');
const chips = new Map<string, HTMLElement>();
let chipsFor = '';
const potionHud = $('potion-hud'), captureHud = $('capture-hud'), ctxPrompt = $('ctx-prompt');
const btnPotion = $('btn-potion'), btnPotionLabel = $('btn-potion-label'), btnCapture = $('btn-capture'), btnContext = $('btn-context');
const setText = (el: HTMLElement, t: string) => { if (el.textContent !== t) el.textContent = t; };
const buildChips = (f: FrameInfo) => {
  const def = f.hunt.monster.def;
  chips.clear();
  const wrap = $('chips'); wrap.replaceChildren();
  for (const [id, name] of [['body', 'ตัว'], ...def.parts.map((p) => [p.id, p.nameTh] as const)] as const) {
    const c = document.createElement('span'); c.className = 'chip'; c.dataset.part = id; c.textContent = name; wrap.append(c); chips.set(id, c);
  }
  $('boss-name').textContent = def.nameTh;
  chipsFor = f.hunt.huntId;
};
const hintShown = new Set<string>(); // hint once per move per page session
let hintTimer: number | undefined;
let lastSecond = -1;
const onFrame = (f: FrameInfo) => {
  const { player, monster, elapsed, selected, build } = f.hunt;
  if (chipsFor !== f.hunt.huntId) buildChips(f);
  hpFill.style.width = `${(player.hp / PLAYER.maxHp) * 100}%`;
  hpText.textContent = String(Math.ceil(player.hp));
  stFill.style.width = `${(player.stamina / PLAYER.maxStamina) * 100}%`;
  stText.textContent = String(Math.floor(player.stamina));
  bossFill.style.width = `${(monster.hp / monster.def.hp) * 100}%`; // bar only, no HP numbers (§14.3)
  const s = Math.floor(elapsed);
  if (s !== lastSecond) { lastSecond = s; timer.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }
  chips.forEach((el, id) => {
    el.classList.toggle('sel', selected === id);
    el.classList.toggle('broken', monster.broken.includes(id as never));
  });
  const sk = build.skill, cost = Math.max(1, Math.round(sk.cost));
  const cd = player.skillCooldown;
  skillName.textContent = `[L] ${sk.nameTh}`; skillCost.textContent = `แรง ${cost}`;
  skillCd.textContent = cd > 0 ? `${cd.toFixed(1)}s` : 'ใช้ได้';
  skillHud.classList.toggle('cooling', cd > 0); skillHud.classList.toggle('ready', cd <= 0);
  btnSkillLabel.textContent = cd > 0 ? cd.toFixed(1) : 'สกิล';
  btnSkill.classList.toggle('cooling', cd > 0 || player.stamina < cost);
  const h = f.hunt;
  setText(potionHud, `ยา ×${h.potions} [Q]`);
  setText(btnPotionLabel, `ยา ${h.potions}`);
  btnPotion.classList.toggle('cooling', h.potions <= 0 || player.hp >= PLAYER.maxHp);
  const isCap = h.objective === 'capture';
  captureHud.hidden = !isCap; btnCapture.hidden = !isCap;
  if (isCap) {
    const ready = captureReady(h);
    setText(captureHud, h.trap ? 'กับดักวางแล้ว — ล่อสัตว์เข้าวง' : !h.trapCharge ? 'ใช้กับดักไปแล้ว'
      : ready ? '◆ พร้อมจับ! [C] วางกับดัก' : '◆ จับ [C]: ลดพลังชีวิตให้ต่ำกว่า 25% ก่อน');
    captureHud.classList.toggle('ready', ready);
    btnCapture.classList.toggle('cooling', !h.trapCharge || !!h.trap);
  }
  const ca = contextAction(h);
  btnContext.hidden = !ca; ctxPrompt.hidden = !ca;
  if (ca) {
    const label = ca.kind === 'root' ? 'ดึงเถา' : 'เผา';
    setText(btnContext, label);
    btnContext.classList.toggle('cooling', !ca.ok);
    setText(ctxPrompt, ca.ok ? (ca.kind === 'root' ? '[E] ดึงเถาวัลย์ รัดสัตว์ 1.5 วินาที (ใช้ได้ครั้งเดียว)' : '[E] เผาเถาวัลย์ด้วยคบเพลิง (เปิดทาง แต่ใช้รัดสัตว์ไม่ได้อีก)') : `เถาวัลย์: ${ca.reason}`);
  }
  debug.update(f);
};

const showHint = (text: string) => {
  hintEl.textContent = text; hintEl.hidden = false;
  window.clearTimeout(hintTimer);
  hintTimer = window.setTimeout(() => { hintEl.hidden = true; }, 2800);
};
const debugLog: HuntEvent[] = [];
const onEvent = (e: HuntEvent) => {
  if (debugOn) { debugLog.push(e); if (debugLog.length > 2000) debugLog.shift(); }
  if (e.type === 'telegraph' && !hintShown.has(e.move)) {
    hintShown.add(e.move);
    const def = scene.hunt.monster.def;
    const mv = def.moves.find((m) => m.id === e.move);
    if (mv) showHint(`${mv.nameTh}: ${mv.hintTh}`);
  } else if (e.type === 'part_break') {
    const def = scene.hunt.monster.def;
    const p = def.parts.find((x) => x.id === e.part)!;
    showHint(`${p.nameTh}แตก! ${def.breakEffects[e.part]?.descTh ?? ''}`);
  } else if (e.type === 'captured') showHint('จับได้แล้ว!');
  else if (e.type === 'vine_root') showHint('เถาวัลย์รัดสัตว์ไว้!');
  else if (e.type === 'torch_burn') showHint('เผาเถาวัลย์แล้ว — เปิดทางเดิน');
  else if (e.type === 'guard_hit') showHint('การ์ดรับไว้ — รอสวนกลับ');
  else if (e.type === 'monster_reset') showHint('สัตว์ติด — ย้ายไปจุดปลอดภัย');
};

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: gameEl,
  backgroundColor: '#101a14',
  scale: { mode: Phaser.Scale.RESIZE, width: gameEl.clientWidth || window.innerWidth, height: gameEl.clientHeight || window.innerHeight },
  input: { keyboard: false, mouse: false, touch: false, gamepad: false },
  disableContextMenu: true,
  render: { antialias: true, roundPixels: false },
  scene: [],
});
app = new App(saveMgr, scene, pause);
game.scene.add('Arena', scene, true, { input, pause, getSettings: () => settings, onFrame, onEvent, onResult: (r: Parameters<App['onResult']>[0]) => app.onResult(r) });

if (debugOn) {
  (window as unknown as Record<string, unknown>).__wildforge = {
    scene, pause, input, app, save: saveMgr, log: debugLog, api: { monsterShapeHits, partWorldPos },
    get state() { return scene.debugState; }, get hunt() { return scene.hunt; },
  };
}
pause.setMenu(true);
app.boot();
render();

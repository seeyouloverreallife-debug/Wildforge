import Phaser from 'phaser';
import { EMBER_GECKO } from './data/monsters';
import { PLAYER } from './data/tuning';
import { DebugOverlay } from './diagnostics/debugOverlay';
import type { HuntEvent } from './domain/hunt';
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
document.querySelectorAll<HTMLElement>('#chips .chip').forEach((c) => chips.set(c.dataset.part!, c));
const hintShown = new Set<string>();
let hintTimer: number | undefined;
let lastSecond = -1;
const onFrame = (f: FrameInfo) => {
  const { player, monster, elapsed, selected, build } = f.hunt;
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
  btnSkillLabel.textContent = cd > 0 ? cd.toFixed(1) : sk.nameTh;
  btnSkill.classList.toggle('cooling', cd > 0 || player.stamina < cost);
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
    const mv = EMBER_GECKO.moves.find((m) => m.id === e.move);
    if (mv) showHint(`${mv.nameTh}: ${mv.hintTh}`);
  } else if (e.type === 'part_break') {
    const p = EMBER_GECKO.parts.find((x) => x.id === e.part)!;
    showHint(`${p.nameTh}แตก! ${EMBER_GECKO.breakEffects[e.part].descTh}`);
  }
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

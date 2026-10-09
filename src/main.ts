import Phaser from 'phaser';
import { EMBER_GECKO, type MoveId } from './data/monsters';
import { PLAYER } from './data/tuning';
import type { HuntEvent, HuntResult } from './domain/hunt';
import { monsterShapeHits } from './domain/monster';
import { partWorldPos } from './domain/monster';
import { DebugOverlay } from './diagnostics/debugOverlay';
import { InputController } from './engine/input/InputController';
import { PauseController } from './engine/PauseController';
import { ArenaScene, type FrameInfo } from './engine/scenes/ArenaScene';
import { loadSettings, saveSettings, type Settings } from './persistence/settings';
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

// --- Touch visibility: coarse pointer, touch-capable device, ?touch=1, or first touch seen ---
const forceTouch = new URLSearchParams(location.search).get('touch') === '1';
const showTouch = () => { touchRoot.hidden = false; };
if (forceTouch || matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window) showTouch();
window.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') showTouch(); }, { capture: true, passive: true });

// --- Pause wiring ---
const overlays = { pause: $('overlay-pause'), settings: $('overlay-settings'), rotate: $('overlay-rotate'), start: $('overlay-start'), results: $('overlay-results') };
let startOpen = true, resultsOpen = false;
const render = () => {
  const manual = pause.cause !== null;
  overlays.settings.hidden = !pause.settingsOpen;
  overlays.rotate.hidden = !(pause.portrait && !pause.settingsOpen);
  overlays.pause.hidden = !(manual && !pause.settingsOpen && !pause.portrait);
  overlays.start.hidden = !(startOpen && !manual);
  overlays.results.hidden = !(resultsOpen && !manual);
  $('pause-reason').textContent = pause.cause === 'focus' ? 'เกมหยุดเพราะหน้าต่างเสียโฟกัส' : '';
  if (pause.paused) { input.reset(); touch.reset(); }
  const focusTarget = !overlays.pause.hidden ? 'btn-resume' : !overlays.settings.hidden ? 'btn-close-settings' : !overlays.start.hidden ? 'btn-start' : !overlays.results.hidden ? 'btn-retry' : null;
  if (focusTarget) $(focusTarget).focus();
};
pause.onChange(render);

const checkOrientation = () => pause.setPortrait(window.innerHeight > window.innerWidth);
window.addEventListener('resize', checkOrientation);
window.addEventListener('orientationchange', checkOrientation);
checkOrientation();

window.addEventListener('blur', () => pause.pause('focus'));
document.addEventListener('visibilitychange', () => { if (document.hidden) pause.pause('focus'); });
window.addEventListener('keydown', (e) => {
  if ((e.code === 'Escape' || e.code === 'KeyP') && !e.repeat) {
    if (pause.settingsOpen) pause.setSettingsOpen(false);
    else if (pause.cause === null) pause.pause('user');
    else pause.resume();
  }
});
$('btn-pause').addEventListener('click', () => pause.pause('user'));
$('btn-resume').addEventListener('click', () => pause.resume());
const newHunt = () => { scene.restart(); resultsOpen = false; startOpen = false; hintShown.clear(); pause.resume(); pause.setMenu(false); };
$('btn-restart').addEventListener('click', newHunt);
$('btn-retry').addEventListener('click', newHunt);
$('btn-start').addEventListener('click', () => { startOpen = false; pause.setMenu(false); });
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
const chips = new Map<string, HTMLElement>();
document.querySelectorAll<HTMLElement>('#chips .chip').forEach((c) => chips.set(c.dataset.part!, c));
const hintShown = new Set<MoveId>();
let hintTimer: number | undefined;
let lastSecond = -1;
const onFrame = (f: FrameInfo) => {
  const { player, monster, elapsed, selected } = f.hunt;
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

const onResult = (r: HuntResult) => {
  const win = r.outcome === 'success';
  $('results-title').textContent = win ? 'ล่าสำเร็จ!' : 'ล้มเหลว';
  $('results-reason').textContent = win ? '' : r.failReason === 'timeout' ? 'หมดเวลา 10 นาที' : 'ผู้เล่นล้ม';
  const parts = r.brokenPartIds.map((id) => EMBER_GECKO.parts.find((p) => p.id === id)!.nameTh);
  const moves = r.movesSeen.map((id) => EMBER_GECKO.moves.find((m) => m.id === id)!.nameTh);
  const mm = Math.floor(r.elapsed / 60), ss = Math.floor(r.elapsed % 60);
  const list = $('results-list');
  list.replaceChildren();
  const row = (t: string) => { const li = document.createElement('li'); li.textContent = t; list.append(li); };
  row(`ผล: ${win ? 'เสร็จแล้ว — ล่ากิ้งก่าถุงไฟ' : 'ยังไม่ผ่าน — ล่ากิ้งก่าถุงไฟ'}`);
  row(`เวลา: ${mm}:${String(ss).padStart(2, '0')}`);
  row(`ส่วนที่ทำลาย: ${parts.length ? parts.join(', ') : 'ไม่มี'}`);
  row(`ท่าที่เห็น: ${moves.length ? moves.join(', ') : 'ยังไม่เห็น'}`);
  $('btn-retry').textContent = win ? 'ล่าอีกครั้ง' : 'ลองใหม่';
  resultsOpen = true;
  pause.setMenu(true);
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
game.scene.add('Arena', scene, true, { input, pause, getSettings: () => settings, onFrame, onEvent, onResult });

if (debugOn) {
  (window as unknown as Record<string, unknown>).__wildforge = {
    scene, pause, input, log: debugLog, api: { monsterShapeHits, partWorldPos }, get state() { return scene.debugState; }, get hunt() { return scene.hunt; },
  };
}
pause.setMenu(true); // start screen until 'เริ่มล่า'
render();

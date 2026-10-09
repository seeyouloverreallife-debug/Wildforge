import Phaser from 'phaser';
import { PLAYER } from './data/tuning';
import { DebugOverlay } from './diagnostics/debugOverlay';
import { InputController } from './engine/input/InputController';
import { PauseController } from './engine/PauseController';
import { ArenaScene, type FrameInfo } from './engine/scenes/ArenaScene';
import { loadSettings, saveSettings, type Settings } from './persistence/settings';
import { TouchControls } from './ui/touchControls';

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
const overlays = { pause: $('overlay-pause'), settings: $('overlay-settings'), rotate: $('overlay-rotate') };
const render = () => {
  const manual = pause.cause !== null;
  overlays.settings.hidden = !pause.settingsOpen;
  overlays.rotate.hidden = !(pause.portrait && !pause.settingsOpen);
  overlays.pause.hidden = !(manual && !pause.settingsOpen && !pause.portrait);
  $('pause-reason').textContent = pause.cause === 'focus' ? 'เกมหยุดเพราะหน้าต่างเสียโฟกัส' : '';
  if (pause.paused) { input.reset(); touch.reset(); }
  const focusTarget = !overlays.pause.hidden ? 'btn-resume' : !overlays.settings.hidden ? 'btn-close-settings' : null;
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
$('btn-restart').addEventListener('click', () => { scene.restart(); pause.resume(); });
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
let lastSecond = -1;
const onFrame = (f: FrameInfo) => {
  hpFill.style.width = `${(f.player.hp / PLAYER.maxHp) * 100}%`;
  hpText.textContent = String(Math.ceil(f.player.hp));
  stFill.style.width = `${(f.player.stamina / PLAYER.maxStamina) * 100}%`;
  stText.textContent = String(Math.floor(f.player.stamina));
  const s = Math.floor(f.elapsed);
  if (s !== lastSecond) { lastSecond = s; timer.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }
  debug.update(f);
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
game.scene.add('Arena', scene, true, { input, pause, getSettings: () => settings, onFrame });

if (new URLSearchParams(location.search).get('debug') === '1') {
  (window as unknown as Record<string, unknown>).__wildforge = {
    scene, pause, input, get state() { return scene.debugState; },
  };
}
render();

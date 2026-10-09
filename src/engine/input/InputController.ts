import type { Vec } from '../../domain/vec';

const KEY_MOVE: Record<string, Vec> = {
  KeyW: { x: 0, y: -1 }, ArrowUp: { x: 0, y: -1 },
  KeyS: { x: 0, y: 1 }, ArrowDown: { x: 0, y: 1 },
  KeyA: { x: -1, y: 0 }, ArrowLeft: { x: -1, y: 0 },
  KeyD: { x: 1, y: 0 }, ArrowRight: { x: 1, y: 0 },
};
const KEY_ATTACK = new Set(['KeyJ']);
const KEY_DODGE = new Set(['Space', 'KeyK']);
const GAME_KEYS = new Set([...Object.keys(KEY_MOVE), ...KEY_ATTACK, ...KEY_DODGE, 'Tab', 'KeyQ', 'KeyR', 'KeyC', 'KeyE']);

export interface RawInput {
  moveX: number; moveY: number;
  attackHeld: boolean; attackPressed: boolean; dodgePressed: boolean; partPressed: boolean;
  /** Mouse position relative to the game canvas (CSS px), null until the mouse has moved over it. */
  mouse: Vec | null;
}

/** Collects keyboard / mouse / touch state. Touch UI writes into `touch`; mouse listens on the game element only. */
export class InputController {
  enabled = false;
  readonly touch = { moveX: 0, moveY: 0, attackHeld: false };
  private keys = new Set<string>();
  private mouseHeld = false;
  private mouse: Vec | null = null;
  private attackEdge = false;
  private dodgeEdge = false;
  private partEdge = false;
  private readonly cleanup: Array<() => void> = [];

  constructor(private readonly target: HTMLElement) {
    const on = <K extends keyof WindowEventMap>(t: Window, e: K, f: (ev: WindowEventMap[K]) => void) => {
      t.addEventListener(e, f as EventListener); this.cleanup.push(() => t.removeEventListener(e, f as EventListener));
    };
    on(window, 'keydown', (e) => this.onKeyDown(e));
    on(window, 'keyup', (e) => this.onKeyUp(e));
    on(window, 'blur', () => this.reset());

    const onEl = (e: string, f: (ev: PointerEvent) => void) => {
      target.addEventListener(e, f as EventListener); this.cleanup.push(() => target.removeEventListener(e, f as EventListener));
    };
    onEl('pointerdown', (e) => this.onMouseDown(e));
    onEl('pointermove', (e) => { if (e.pointerType !== 'touch') this.setMouse(e); });
    onEl('pointerup', (e) => this.onMouseUp(e));
    onEl('pointercancel', (e) => { if (e.pointerType !== 'touch') this.mouseHeld = false; });
    onEl('pointerleave', (e) => { if (e.pointerType !== 'touch') this.mouse = null; });
    // Right-click is a skill input; suppress the browser menu on the game area only.
    const ctx = (e: Event) => e.preventDefault();
    target.addEventListener('contextmenu', ctx); this.cleanup.push(() => target.removeEventListener('contextmenu', ctx));
  }

  private setMouse(e: PointerEvent): void {
    const r = this.target.getBoundingClientRect();
    this.mouse = { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private onMouseDown(e: PointerEvent): void {
    if (e.pointerType === 'touch' || !this.enabled) return;
    this.setMouse(e);
    if (e.button === 0) { this.mouseHeld = true; this.attackEdge = true; }
  }

  private onMouseUp(e: PointerEvent): void {
    if (e.pointerType !== 'touch' && e.button === 0) this.mouseHeld = false;
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (!this.enabled) return;
    if (GAME_KEYS.has(e.code)) e.preventDefault();
    if (e.repeat) return;
    this.keys.add(e.code);
    if (KEY_ATTACK.has(e.code)) this.attackEdge = true;
    if (KEY_DODGE.has(e.code)) this.dodgeEdge = true;
    if (e.code === 'Tab' || e.code === 'KeyR') this.partEdge = true;
  }

  private onKeyUp(e: KeyboardEvent): void { this.keys.delete(e.code); }

  pressDodge(): void { if (this.enabled) this.dodgeEdge = true; }
  pressAttack(): void { if (this.enabled) this.attackEdge = true; }
  pressPart(): void { if (this.enabled) this.partEdge = true; }

  /** Clear every held input and pending edge (pause, blur, pointercancel, scene exit). */
  reset(): void {
    this.keys.clear();
    this.mouseHeld = false;
    this.attackEdge = this.dodgeEdge = this.partEdge = false;
    this.touch.moveX = this.touch.moveY = 0;
    this.touch.attackHeld = false;
  }

  sample(): RawInput {
    let mx = 0, my = 0;
    for (const k of this.keys) { const v = KEY_MOVE[k]; if (v) { mx += v.x; my += v.y; } }
    if (mx === 0 && my === 0) { mx = this.touch.moveX; my = this.touch.moveY; }
    const out: RawInput = {
      moveX: mx, moveY: my,
      attackHeld: this.mouseHeld || this.touch.attackHeld || [...this.keys].some((k) => KEY_ATTACK.has(k)),
      attackPressed: this.attackEdge, dodgePressed: this.dodgeEdge, partPressed: this.partEdge,
      mouse: this.mouse,
    };
    this.attackEdge = this.dodgeEdge = this.partEdge = false;
    return out;
  }

  /** Debug summary for QA. */
  snapshot() {
    return { keys: [...this.keys], mouseHeld: this.mouseHeld, touch: { ...this.touch } };
  }

  dispose(): void { this.reset(); this.cleanup.forEach((f) => f()); this.cleanup.length = 0; }
}

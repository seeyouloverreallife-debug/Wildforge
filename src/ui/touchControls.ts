import type { InputController } from '../engine/input/InputController';

const JOY_RADIUS = 60; // CSS px

/**
 * DOM touch controls driven by Pointer Events. Each control tracks its own pointerId,
 * so the joystick never steals a pointer that belongs to a button (Q04).
 */
export class TouchControls {
  private joyId: number | null = null;
  private origin = { x: 0, y: 0 };
  private readonly btnIds = new Map<HTMLElement, number>();
  private readonly cleanup: Array<() => void> = [];

  constructor(private readonly root: HTMLElement, private readonly input: InputController) {
    const zone = root.querySelector<HTMLElement>('#joy-zone')!;
    const base = root.querySelector<HTMLElement>('#joy-base')!;
    const knob = root.querySelector<HTMLElement>('#joy-knob')!;
    const atk = root.querySelector<HTMLElement>('#btn-attack')!;
    const dodge = root.querySelector<HTMLElement>('#btn-dodge')!;

    this.listen(zone, 'pointerdown', (e) => {
      if (this.joyId !== null || !input.enabled) return;
      e.preventDefault();
      this.joyId = e.pointerId;
      zone.setPointerCapture(e.pointerId);
      this.origin = { x: e.clientX, y: e.clientY };
      base.style.display = 'block';
      base.style.left = `${e.clientX}px`;
      base.style.top = `${e.clientY}px`;
      knob.style.transform = 'translate(-50%, -50%)';
      this.setStick(0, 0);
    });
    this.listen(zone, 'pointermove', (e) => {
      if (e.pointerId !== this.joyId) return;
      const dx = e.clientX - this.origin.x, dy = e.clientY - this.origin.y;
      const d = Math.hypot(dx, dy);
      const k = d > JOY_RADIUS ? JOY_RADIUS / d : 1;
      knob.style.transform = `translate(calc(-50% + ${dx * k}px), calc(-50% + ${dy * k}px))`;
      const dead = 8;
      if (d < dead) this.setStick(0, 0);
      else this.setStick((dx * k) / JOY_RADIUS, (dy * k) / JOY_RADIUS);
    });
    const endJoy = (e: PointerEvent) => {
      if (e.pointerId !== this.joyId) return;
      this.joyId = null;
      base.style.display = 'none';
      this.setStick(0, 0);
    };
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) this.listen(zone, ev, endJoy);

    this.bindButton(atk, () => { input.touch.attackHeld = true; input.pressAttack(); }, () => { input.touch.attackHeld = false; });
    this.bindButton(dodge, () => input.pressDodge(), () => {});
    this.bindButton(root.querySelector<HTMLElement>('#btn-potion')!, () => input.pressPotion(), () => {});
    this.bindButton(root.querySelector<HTMLElement>('#btn-capture')!, () => input.pressCapture(), () => {});
    this.bindButton(root.querySelector<HTMLElement>('#btn-context')!, () => input.pressContext(), () => {});
    this.bindButton(root.querySelector<HTMLElement>('#btn-skill')!, () => input.pressSkill(), () => {});
    this.bindButton(root.querySelector<HTMLElement>('#btn-part')!, () => input.pressPart(), () => {});

    // Geometry changed under a held finger (rotate / resize / browser chrome): drop the touch rather than leave a stale origin.
    const onGeom = () => { if (this.joyId !== null || this.btnIds.size) { this.reset(); input.reset(); } };
    window.addEventListener('resize', onGeom);
    window.addEventListener('orientationchange', onGeom);
    this.cleanup.push(() => { window.removeEventListener('resize', onGeom); window.removeEventListener('orientationchange', onGeom); });
  }

  private setStick(x: number, y: number): void { this.input.touch.moveX = x; this.input.touch.moveY = y; }

  private bindButton(el: HTMLElement, down: () => void, up: () => void): void {
    this.listen(el, 'pointerdown', (e) => {
      if (this.btnIds.has(el) || !this.input.enabled) return;
      e.preventDefault();
      this.btnIds.set(el, e.pointerId);
      el.setPointerCapture(e.pointerId);
      el.classList.add('down');
      down();
    });
    const release = (e: PointerEvent) => {
      if (this.btnIds.get(el) !== e.pointerId) return;
      this.btnIds.delete(el);
      el.classList.remove('down');
      up();
    };
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) this.listen(el, ev, release);
  }

  /** Drop all held touches (called on pause / blur). */
  reset(): void {
    this.joyId = null;
    this.btnIds.clear();
    this.root.querySelector<HTMLElement>('#joy-base')!.style.display = 'none';
    this.root.querySelectorAll('.act-btn').forEach((b) => b.classList.remove('down'));
  }

  private listen<K extends keyof HTMLElementEventMap>(el: HTMLElement, ev: K, f: (e: HTMLElementEventMap[K] & PointerEvent) => void): void {
    const h = f as EventListener;
    el.addEventListener(ev, h);
    this.cleanup.push(() => el.removeEventListener(ev, h));
  }

  dispose(): void { this.cleanup.forEach((f) => f()); this.cleanup.length = 0; }
}

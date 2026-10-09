import Phaser from 'phaser';
import { ARENA, PLAYER, SIM } from '../../data/tuning';
import { WEAPONS } from '../../data/weapons';
import { FixedStepper } from '../../domain/fixedStep';
import {
  attackPhase, createPlayer, emptyIntent, isInvulnerable, stepPlayer,
  type PlayerState,
} from '../../domain/player';
import { defaultWorld } from '../../domain/world';
import { clamp } from '../../domain/vec';
import type { Settings } from '../../persistence/settings';
import type { InputController } from '../input/InputController';
import type { PauseController } from '../PauseController';

export interface SceneDeps {
  input: InputController;
  pause: PauseController;
  getSettings: () => Settings;
  onFrame: (info: FrameInfo) => void;
}

export interface FrameInfo {
  player: PlayerState; elapsed: number; paused: boolean; fps: number; stepsLastFrame: number; zoom: number;
}

const COL = { ground: 0x24382c, grid: 0x2e4637, border: 0x8a6a3c, rock: 0x6b6f72, rockEdge: 0xcfd3d6,
  player: 0x57b6ff, playerEdge: 0xffffff, arc: 0xffd36b, ghost: 0x9fd8ff, invuln: 0xffffff };

export class ArenaScene extends Phaser.Scene {
  private deps!: SceneDeps;
  private world = defaultWorld();
  private stepper = new FixedStepper(SIM.hz, SIM.maxDeltaMs, SIM.maxStepsPerFrame);
  private player = createPlayer(ARENA.spawn);
  private prevPos: { x: number; y: number } = { ...ARENA.spawn };
  private elapsed = 0;
  private dyn!: Phaser.GameObjects.Graphics;
  private ghosts: Array<{ x: number; y: number; age: number }> = [];
  private camX: number = ARENA.spawn.x;
  private camY: number = ARENA.spawn.y;
  private stepsLast = 0;
  private fpsEma = 60;
  private wasPaused = false;
  private onResize = () => this.fitCamera();

  constructor() { super('Arena'); }

  init(deps: SceneDeps): void { this.deps = deps; }

  create(): void {
    const g = this.add.graphics();
    this.drawStatic(g);
    this.dyn = this.add.graphics().setDepth(10);
    this.cameras.main.setBackgroundColor(0x101a14);
    this.fitCamera();
    this.cameras.main.centerOn(this.camX, this.camY);
    this.scale.on('resize', this.onResize);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.teardown());
    this.events.once(Phaser.Scenes.Events.DESTROY, () => this.teardown());
  }

  private teardown(): void {
    this.scale.off('resize', this.onResize);
    this.deps.input.reset();
  }

  /** Back to spawn with a fresh player and timer. */
  restart(): void {
    this.player = createPlayer(ARENA.spawn);
    this.prevPos = { ...ARENA.spawn };
    this.elapsed = 0;
    this.ghosts.length = 0;
    this.stepper.reset();
    this.camX = ARENA.spawn.x; this.camY = ARENA.spawn.y;
    this.deps.input.reset();
  }

  private zoom(): number {
    const w = this.scale.width, h = this.scale.height;
    const fit = Math.min(w / 900, h / 560);
    const min = Math.max(w / ARENA.width, h / ARENA.height); // never show outside the world
    return clamp(Math.max(fit, min), 0.3, 1.6);
  }

  private fitCamera(): void { this.cameras.main.setZoom(this.zoom()); }

  private drawStatic(g: Phaser.GameObjects.Graphics): void {
    const { width: W, height: H } = ARENA;
    g.fillStyle(COL.ground, 1).fillRect(0, 0, W, H);
    g.lineStyle(1, COL.grid, 1);
    for (let x = 0; x <= W; x += 100) g.lineBetween(x, 0, x, H);
    for (let y = 0; y <= H; y += 100) g.lineBetween(0, y, W, y);
    g.lineStyle(12, COL.border, 1).strokeRect(0, 0, W, H);
    for (const r of ARENA.rocks) {
      g.fillStyle(COL.rock, 1).fillCircle(r.x, r.y, r.r);
      g.lineStyle(4, COL.rockEdge, 1).strokeCircle(r.x, r.y, r.r);
    }
  }

  override update(_time: number, deltaMs: number): void {
    const { input, pause } = this.deps;
    const paused = pause.paused;
    input.enabled = !paused;
    if (paused) {
      if (!this.wasPaused) { input.reset(); this.stepper.reset(); }
      this.wasPaused = true;
    } else if (this.wasPaused) {
      this.wasPaused = false;
      this.stepper.reset(); // paused time never counts toward sim
      input.reset();
    }

    this.stepsLast = 0;
    if (!paused) {
      const raw = input.sample();
      const aim = raw.mouse ? this.cameras.main.getWorldPoint(raw.mouse.x, raw.mouse.y) : null;
      const steps = this.stepper.advance(deltaMs);
      this.stepsLast = steps;
      for (let i = 0; i < steps; i++) {
        this.prevPos.x = this.player.pos.x; this.prevPos.y = this.player.pos.y;
        const first = i === 0;
        stepPlayer(this.player, {
          ...emptyIntent(), moveX: raw.moveX, moveY: raw.moveY, aim: aim ? { x: aim.x, y: aim.y } : null,
          attackHeld: raw.attackHeld, attackPressed: first && raw.attackPressed, dodgePressed: first && raw.dodgePressed,
        }, this.stepper.dt, this.world);
        this.elapsed += this.stepper.dt;
        this.trackGhosts();
        if (first && this.player.dodge && this.player.dodge.t === 0) this.shake();
      }
      if (deltaMs > 0) this.fpsEma += (1000 / deltaMs - this.fpsEma) * 0.05;
    }

    this.updateCamera(deltaMs / 1000);
    this.render();
    this.deps.onFrame({ player: this.player, elapsed: this.elapsed, paused, fps: this.fpsEma, stepsLastFrame: this.stepsLast, zoom: this.cameras.main.zoom });
  }

  private shake(): void {
    const s = this.deps.getSettings();
    if (s.reducedEffects || s.screenShake <= 0) return;
    this.cameras.main.shake(90, 0.003 * s.screenShake / 0.3);
  }

  private trackGhosts(): void {
    const dodging = !!this.player.dodge;
    if (dodging && !this.deps.getSettings().reducedEffects && this.ghosts.length < 12) {
      this.ghosts.push({ x: this.player.pos.x, y: this.player.pos.y, age: 0 });
    }
    for (const gh of this.ghosts) gh.age += this.stepper.dt;
    while (this.ghosts.length && (this.ghosts[0]!.age > 0.25)) this.ghosts.shift();
  }

  private updateCamera(dt: number): void {
    const cam = this.cameras.main;
    const a = 1 - Math.exp(-10 * dt);
    this.camX += (this.player.pos.x - this.camX) * a;
    this.camY += (this.player.pos.y - this.camY) * a;
    const hw = cam.width / cam.zoom / 2, hh = cam.height / cam.zoom / 2;
    const cx = hw * 2 >= ARENA.width ? ARENA.width / 2 : clamp(this.camX, hw, ARENA.width - hw);
    const cy = hh * 2 >= ARENA.height ? ARENA.height / 2 : clamp(this.camY, hh, ARENA.height - hh);
    cam.centerOn(cx, cy);
  }

  private render(): void {
    const g = this.dyn.clear();
    const p = this.player;
    const alpha = this.stepper.alpha;
    const x = this.prevPos.x + (p.pos.x - this.prevPos.x) * alpha;
    const y = this.prevPos.y + (p.pos.y - this.prevPos.y) * alpha;

    for (const gh of this.ghosts) {
      g.fillStyle(COL.ghost, 0.35 * (1 - gh.age / 0.25)).fillCircle(gh.x, gh.y, PLAYER.radius);
    }

    // Attack sector, drawn from the exact shape used for hit tests; dim during startup/recovery.
    const w = WEAPONS.fang_cleaver;
    const phase = attackPhase(p);
    if (p.attack && phase) {
      const half = (w.arcDeg * Math.PI) / 360;
      const a0 = p.attack.facing - half, a1 = p.attack.facing + half;
      if (phase === 'active') {
        g.fillStyle(COL.arc, 0.55).slice(x, y, w.range, a0, a1, false).fillPath();
        g.lineStyle(3, COL.arc, 1).slice(x, y, w.range, a0, a1, false).strokePath();
      } else {
        g.lineStyle(2, COL.arc, phase === 'startup' ? 0.6 : 0.25).slice(x, y, w.range, a0, a1, false).strokePath();
      }
    }

    g.fillStyle(COL.player, 1).fillCircle(x, y, PLAYER.radius);
    g.lineStyle(3, COL.playerEdge, 1).strokeCircle(x, y, PLAYER.radius);
    // Facing marker
    g.fillStyle(0xffffff, 1).fillTriangle(
      x + Math.cos(p.facing) * (PLAYER.radius + 10), y + Math.sin(p.facing) * (PLAYER.radius + 10),
      x + Math.cos(p.facing + 2.4) * 10 + Math.cos(p.facing) * PLAYER.radius * 0.6, y + Math.sin(p.facing + 2.4) * 10 + Math.sin(p.facing) * PLAYER.radius * 0.6,
      x + Math.cos(p.facing - 2.4) * 10 + Math.cos(p.facing) * PLAYER.radius * 0.6, y + Math.sin(p.facing - 2.4) * 10 + Math.sin(p.facing) * PLAYER.radius * 0.6,
    );
    if (isInvulnerable(p)) g.lineStyle(3, COL.invuln, 0.9).strokeCircle(x, y, PLAYER.radius + 8);
  }

  /** QA hook. */
  get debugState() { return { player: this.player, elapsed: this.elapsed }; }
}

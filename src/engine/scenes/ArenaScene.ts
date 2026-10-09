import Phaser from 'phaser';
import { EMBER_GECKO, type MoveDef, type PartId } from '../../data/monsters';
import { ARENA, PLAYER, SHAKE_TABLE, SIM, SOFT_LOCK_RANGE, type ShakeKind } from '../../data/tuning';
import { WEAPONS } from '../../data/weapons';
import { FixedStepper } from '../../domain/fixedStep';
import {
  abandonHunt, createHunt, cycleTarget, drainEvents, selectedTargetPos, stepHunt, type HuntEvent, type HuntResult, type HuntState,
} from '../../domain/hunt';
import { partWorldPos } from '../../domain/monster';
import { attackPhase, emptyIntent, isInvulnerable } from '../../domain/player';
import { clamp, fromAngle } from '../../domain/vec';
import type { Settings } from '../../persistence/settings';
import type { InputController } from '../input/InputController';
import type { PauseController } from '../PauseController';

export interface SceneDeps {
  input: InputController;
  pause: PauseController;
  getSettings: () => Settings;
  onFrame: (info: FrameInfo) => void;
  onEvent: (e: HuntEvent) => void;
  onResult: (r: HuntResult) => void;
}

export interface FrameInfo { hunt: HuntState; paused: boolean; fps: number; stepsLastFrame: number; zoom: number }

const COL = {
  ground: 0x24382c, grid: 0x2e4637, border: 0x8a6a3c, rock: 0x6b6f72, rockEdge: 0xcfd3d6,
  player: 0x57b6ff, white: 0xffffff, arc: 0xffd36b, ghost: 0x9fd8ff,
  body: 0x7d8f4c, bodyEdge: 0x1c2410, head: 0x93a65a, jaw: 0x5d6b35, sac: 0xff8a2b, danger: 0xff5a1f, broken: 0x555a50,
};
const MAX_FX = 24;

interface Fx { x: number; y: number; age: number; life: number; kind: 'hit' | 'break'; r: number }

export class ArenaScene extends Phaser.Scene {
  private deps!: SceneDeps;
  private stepper = new FixedStepper(SIM.hz, SIM.maxDeltaMs, SIM.maxStepsPerFrame);
  hunt!: HuntState;
  private prevPos: { x: number; y: number } = { ...ARENA.spawn };
  private dyn!: Phaser.GameObjects.Graphics;
  private label!: Phaser.GameObjects.Text;
  private ghosts: Array<{ x: number; y: number; age: number }> = [];
  private fx: Fx[] = [];
  private hitFlash = 0;
  private seedCounter = 1;
  private camX: number = ARENA.spawn.x;
  private camY: number = ARENA.spawn.y;
  private stepsLast = 0;
  private fpsEma = 60;
  private wasPaused = false;
  private reported = false;
  private onResize = () => this.fitCamera();

  constructor() { super('Arena'); }

  init(deps: SceneDeps): void { this.deps = deps; this.hunt = createHunt(this.nextSeed()); }

  private nextSeed(): number { return (Date.now() & 0xffff) * 31 + this.seedCounter++; }

  create(): void {
    const g = this.add.graphics();
    this.drawStatic(g);
    this.dyn = this.add.graphics().setDepth(10);
    this.label = this.add.text(0, 0, '', {
      fontFamily: '"Noto Sans Thai", Sarabun, "Leelawadee UI", Tahoma, system-ui, sans-serif', fontSize: '22px', fontStyle: 'bold', color: '#ffe9c2', stroke: '#000', strokeThickness: 5,
    }).setOrigin(0.5, 1).setDepth(20);
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

  /** New hunt (new huntId + seed). A hunt still ACTIVE is abandoned — no result is paid out for it. */
  restart(): void {
    abandonHunt(this.hunt);
    this.hunt = createHunt(this.nextSeed());
    this.prevPos = { ...ARENA.spawn };
    this.ghosts.length = 0; this.fx.length = 0; this.hitFlash = 0; this.reported = false;
    this.stepper.reset();
    this.camX = ARENA.spawn.x; this.camY = ARENA.spawn.y;
    this.deps.input.reset();
  }

  private zoom(): number {
    const w = this.scale.width, h = this.scale.height;
    const fit = Math.min(w / 900, h / 560);
    const min = Math.max(w / ARENA.width, h / ARENA.height);
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
    const h = this.hunt;
    const paused = pause.paused;
    const active = h.status === 'ACTIVE';
    input.enabled = !paused && active;
    if (paused) {
      if (!this.wasPaused) { input.reset(); this.stepper.reset(); }
      this.wasPaused = true;
    } else if (this.wasPaused) {
      this.wasPaused = false;
      this.stepper.reset(); // paused wall-time never reaches the simulation
      input.reset();
    }

    this.stepsLast = 0;
    if (!paused && active) {
      const raw = input.sample();
      if (raw.partPressed) cycleTarget(h);
      let aim: { x: number; y: number } | null = null;
      if (raw.mouse) aim = this.cameras.main.getWorldPoint(raw.mouse.x, raw.mouse.y);
      else if (h.monster.phase !== 'dead' && Math.hypot(h.monster.pos.x - h.player.pos.x, h.monster.pos.y - h.player.pos.y) <= SOFT_LOCK_RANGE) {
        aim = selectedTargetPos(h); // touch soft-lock: face the selected part, never pull the player toward it
      }
      const steps = this.stepper.advance(deltaMs);
      this.stepsLast = steps;
      for (let i = 0; i < steps && h.status === 'ACTIVE'; i++) {
        this.prevPos.x = h.player.pos.x; this.prevPos.y = h.player.pos.y;
        const first = i === 0;
        stepHunt(h, {
          ...emptyIntent(), moveX: raw.moveX, moveY: raw.moveY, aim: aim ? { x: aim.x, y: aim.y } : null,
          attackHeld: raw.attackHeld, attackPressed: first && raw.attackPressed, dodgePressed: first && raw.dodgePressed,
        }, this.stepper.dt);
        if (h.player.dodge && h.player.dodge.t === 0) this.shake('dodge');
        this.trackGhosts();
        this.handleEvents();
      }
      if (deltaMs > 0) this.fpsEma += (1000 / deltaMs - this.fpsEma) * 0.05;
    }
    if (!active && !this.reported && h.result) { this.reported = true; this.deps.onResult(h.result); }

    const dt = deltaMs / 1000;
    if (!paused) {
      this.hitFlash = Math.max(0, this.hitFlash - dt);
      for (const f of this.fx) f.age += dt;
      this.fx = this.fx.filter((f) => f.age < f.life);
    }
    this.updateCamera(dt);
    this.render();
    this.deps.onFrame({ hunt: h, paused, fps: this.fpsEma, stepsLastFrame: this.stepsLast, zoom: this.cameras.main.zoom });
  }

  private handleEvents(): void {
    for (const e of drainEvents(this.hunt)) {
      this.deps.onEvent(e);
      const m = this.hunt.monster;
      switch (e.type) {
        case 'hit_landed': {
          this.hitFlash = 0.08; this.shake('hitLanded');
          const at = e.part ? partWorldPos(m, e.part) : m.pos;
          this.addFx({ x: at.x, y: at.y, age: 0, life: 0.2, kind: 'hit', r: 26 });
          break;
        }
        case 'part_break': {
          const at = partWorldPos(m, e.part);
          this.addFx({ x: at.x, y: at.y, age: 0, life: 0.5, kind: 'break', r: 60 }); this.shake('partBreak');
          break;
        }
        case 'player_hurt': this.shake('playerHurt'); break;
        case 'monster_stagger': this.shake('monsterStagger'); break;
        case 'monster_death': this.shake('monsterDeath'); break;
        default: break;
      }
    }
  }

  private addFx(f: Fx): void { if (this.fx.length >= MAX_FX) this.fx.shift(); this.fx.push(f); }

  private shake(kind: ShakeKind): void {
    const s = this.deps.getSettings();
    if (s.reducedEffects || s.screenShake <= 0) return;
    const t = SHAKE_TABLE[kind];
    this.cameras.main.shake(t.ms, Math.min(0.02, t.intensity * (s.screenShake / 0.3)));
  }

  private trackGhosts(): void {
    const p = this.hunt.player;
    if (p.dodge && !this.deps.getSettings().reducedEffects && this.ghosts.length < 12) this.ghosts.push({ x: p.pos.x, y: p.pos.y, age: 0 });
    for (const gh of this.ghosts) gh.age += this.stepper.dt;
    while (this.ghosts.length && this.ghosts[0]!.age > 0.25) this.ghosts.shift();
  }

  private updateCamera(dt: number): void {
    const cam = this.cameras.main;
    const { player, monster } = this.hunt;
    const tx = player.pos.x + (monster.pos.x - player.pos.x) * 0.35;
    const ty = player.pos.y + (monster.pos.y - player.pos.y) * 0.35;
    const a = 1 - Math.exp(-8 * dt);
    this.camX += (tx - this.camX) * a;
    this.camY += (ty - this.camY) * a;
    const hw = cam.width / cam.zoom / 2, hh = cam.height / cam.zoom / 2;
    const cx = hw * 2 >= ARENA.width ? ARENA.width / 2 : clamp(this.camX, hw, ARENA.width - hw);
    const cy = hh * 2 >= ARENA.height ? ARENA.height / 2 : clamp(this.camY, hh, ARENA.height - hh);
    cam.centerOn(cx, cy);
  }

  // ---------------------------------------------------------------- rendering
  private render(): void {
    const g = this.dyn.clear();
    const h = this.hunt;
    this.drawTelegraph(g);
    this.drawMonster(g);
    this.drawPlayer(g);
    for (const f of this.fx) {
      const k = f.age / f.life;
      g.lineStyle(f.kind === 'break' ? 6 : 4, f.kind === 'break' ? COL.sac : COL.white, 1 - k).strokeCircle(f.x, f.y, f.r * (0.4 + k));
    }
    const m = h.monster;
    if (m.phase === 'telegraph' && m.move) {
      this.label.setText(`${m.move.nameTh}!`).setPosition(m.pos.x, m.pos.y - m.def.bodyRadius - 24).setVisible(true);
    } else if (m.phase === 'stagger') {
      this.label.setText('ชะงัก!').setPosition(m.pos.x, m.pos.y - m.def.bodyRadius - 24).setVisible(true);
    } else this.label.setVisible(false);
  }

  private drawPlayer(g: Phaser.GameObjects.Graphics): void {
    const p = this.hunt.player;
    const alpha = this.stepper.alpha;
    const x = this.prevPos.x + (p.pos.x - this.prevPos.x) * alpha;
    const y = this.prevPos.y + (p.pos.y - this.prevPos.y) * alpha;
    for (const gh of this.ghosts) g.fillStyle(COL.ghost, 0.35 * (1 - gh.age / 0.25)).fillCircle(gh.x, gh.y, PLAYER.radius);

    const w = WEAPONS.fang_cleaver;
    const phase = attackPhase(p);
    if (p.attack && phase) {
      const half = (w.arcDeg * Math.PI) / 360;
      const a0 = p.attack.facing - half, a1 = p.attack.facing + half;
      if (phase === 'active') {
        g.fillStyle(COL.arc, 0.55).slice(x, y, w.range, a0, a1, false).fillPath();
        g.lineStyle(3, COL.arc, 1).slice(x, y, w.range, a0, a1, false).strokePath();
      } else g.lineStyle(2, COL.arc, phase === 'startup' ? 0.6 : 0.25).slice(x, y, w.range, a0, a1, false).strokePath();
    }
    const reduced = this.deps.getSettings().reducedEffects;
    const hurt = p.hurtInvuln > 0;
    const a = hurt ? (reduced ? 0.6 : (Math.floor(p.hurtInvuln * 20) % 2 ? 0.35 : 1)) : 1;
    g.fillStyle(COL.player, a).fillCircle(x, y, PLAYER.radius);
    g.lineStyle(3, COL.white, a).strokeCircle(x, y, PLAYER.radius);
    const f = p.facing, R = PLAYER.radius;
    g.fillStyle(0xffffff, a).fillTriangle(
      x + Math.cos(f) * (R + 10), y + Math.sin(f) * (R + 10),
      x + Math.cos(f + 2.4) * 10 + Math.cos(f) * R * 0.6, y + Math.sin(f + 2.4) * 10 + Math.sin(f) * R * 0.6,
      x + Math.cos(f - 2.4) * 10 + Math.cos(f) * R * 0.6, y + Math.sin(f - 2.4) * 10 + Math.sin(f) * R * 0.6,
    );
    if (isInvulnerable(p) && !hurt) g.lineStyle(3, COL.white, 0.9).strokeCircle(x, y, R + 8);
  }

  private drawMonster(g: Phaser.GameObjects.Graphics): void {
    const m = this.hunt.monster;
    const dead = m.phase === 'dead';
    const fl = this.hitFlash > 0;
    const a = dead ? 0.45 : 1;
    const dir = fromAngle(m.facing);
    const body = fl ? COL.white : COL.body;
    // tail: tapering circles toward the rear
    for (let i = 1; i <= 4; i++) {
      const d = m.def.bodyRadius * 0.6 + i * 26;
      g.fillStyle(fl ? COL.white : COL.jaw, a).fillCircle(m.pos.x - dir.x * d, m.pos.y - dir.y * d, 26 - i * 4);
    }
    g.fillStyle(body, a).fillCircle(m.pos.x, m.pos.y, m.def.bodyRadius);
    g.lineStyle(4, COL.bodyEdge, a).strokeCircle(m.pos.x, m.pos.y, m.def.bodyRadius);
    g.fillStyle(fl ? COL.white : COL.head, a).fillCircle(m.pos.x + dir.x * 78, m.pos.y + dir.y * 78, 38);
    g.lineStyle(4, COL.bodyEdge, a).strokeCircle(m.pos.x + dir.x * 78, m.pos.y + dir.y * 78, 38);
    // parts
    const breathTele = m.phase === 'telegraph' && m.move?.id === 'fire_breath' ? Math.min(1, m.t / m.move.telegraph) : 0;
    for (const p of m.def.parts) {
      const at = partWorldPos(m, p.id);
      const broken = m.broken.includes(p.id);
      const r = p.radius * (p.id === 'fire_sac' && !broken ? 1 + 0.35 * breathTele : 1);
      const col = broken ? COL.broken : p.id === 'fire_sac' ? COL.sac : COL.jaw;
      g.fillStyle(col, a * (broken ? 0.9 : 0.95)).fillCircle(at.x, at.y, r);
      g.lineStyle(3, COL.bodyEdge, a).strokeCircle(at.x, at.y, r);
      if (broken) { // cracks, not gore
        g.lineStyle(3, 0x1a1a1a, a);
        g.lineBetween(at.x - r * 0.6, at.y - r * 0.6, at.x + r * 0.6, at.y + r * 0.6);
        g.lineBetween(at.x - r * 0.6, at.y + r * 0.6, at.x + r * 0.6, at.y - r * 0.6);
      }
    }
    // eyes
    const side = { x: -dir.y, y: dir.x };
    for (const s of [-1, 1]) g.fillStyle(0xfff3b0, a).fillCircle(m.pos.x + dir.x * 92 + side.x * 18 * s, m.pos.y + dir.y * 92 + side.y * 18 * s, 6);
    // selected part ring
    const sel = this.hunt.selected;
    if (!dead && this.hunt.status === 'ACTIVE') {
      const c = sel === 'body' ? m.pos : partWorldPos(m, sel);
      const r = sel === 'body' ? m.def.bodyRadius + 8 : (m.def.parts.find((p) => p.id === sel as PartId)!.radius + 8);
      g.lineStyle(3, COL.arc, 0.95).strokeCircle(c.x, c.y, r);
    }
    if (m.phase === 'stagger') g.lineStyle(4, COL.white, 0.8).strokeCircle(m.pos.x, m.pos.y, m.def.bodyRadius + 14);
    if (m.phase === 'recovery') g.lineStyle(3, 0xbfe3ff, 0.8).strokeCircle(m.pos.x, m.pos.y, m.def.bodyRadius + 14); // open window (×1.15)
  }

  private drawTelegraph(g: Phaser.GameObjects.Graphics): void {
    const m = this.hunt.monster;
    const mv: MoveDef | null = m.move;
    if (!mv || (m.phase !== 'telegraph' && m.phase !== 'attack')) return;
    const attacking = m.phase === 'attack';
    const prog = attacking ? 1 : Math.min(1, m.t / mv.telegraph);
    const locked = attacking || prog >= mv.lockAt;
    const fillA = attacking ? 0.6 : 0.1 + 0.25 * prog;
    const line = locked ? 5 : 2; // thick outline = direction locked, stop tracking
    const sh = mv.shape;
    const dir = fromAngle(m.facing);
    if (sh.kind === 'cone') {
      const o = { x: m.pos.x + dir.x * 80, y: m.pos.y + dir.y * 80 };
      const half = (sh.angleDeg * Math.PI) / 360;
      g.fillStyle(COL.danger, fillA).slice(o.x, o.y, sh.range, m.facing - half, m.facing + half, false).fillPath();
      g.lineStyle(line, COL.danger, 1).slice(o.x, o.y, sh.range, m.facing - half, m.facing + half, false).strokePath();
    } else if (sh.kind === 'dash') {
      const len = sh.distance + sh.headOffset + sh.hitRadius, w = sh.hitRadius;
      const n = { x: -dir.y, y: dir.x };
      const V = (x: number, y: number) => new Phaser.Math.Vector2(x, y);
      const pts = [
        V(m.pos.x + n.x * w, m.pos.y + n.y * w), V(m.pos.x + dir.x * len + n.x * w, m.pos.y + dir.y * len + n.y * w),
        V(m.pos.x + dir.x * len - n.x * w, m.pos.y + dir.y * len - n.y * w), V(m.pos.x - n.x * w, m.pos.y - n.y * w),
      ];
      g.fillStyle(COL.danger, fillA).fillPoints(pts, true);
      g.lineStyle(line, COL.danger, 1).strokePoints(pts, true);
    } else {
      const rear = m.facing + Math.PI, half = (sh.arcDeg * Math.PI) / 360;
      g.fillStyle(COL.danger, fillA).slice(m.pos.x, m.pos.y, sh.range, rear - half, rear + half, false).fillPath();
      g.lineStyle(line, COL.danger, 1).slice(m.pos.x, m.pos.y, sh.range, rear - half, rear + half, false).strokePath();
    }
  }

  /** QA hook. */
  get debugState() { return { hunt: this.hunt, EMBER_GECKO }; }
}

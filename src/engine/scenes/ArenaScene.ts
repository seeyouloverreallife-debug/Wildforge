import Phaser from 'phaser';
import type { MonsterId } from '../../data/content';
import { type MoveDef, type PartId } from '../../data/monsters';
import { ARENA, PLAYER, SHAKE_TABLE, SIM, SOFT_LOCK_RANGE, TRAP, type ShakeKind } from '../../data/tuning';
import { WEAPONS } from '../../data/weapons';
import { FixedStepper } from '../../domain/fixedStep';
import { BASIC_BUILD, type PlayerBuild } from '../../domain/build';
import {
  abandonHunt, createHunt, cycleTarget, drainEvents, selectedTargetPos, stepHunt, type HuntEvent, type HuntOptions, type HuntResult, type HuntState,
} from '../../domain/hunt';
import { effectiveShape, partWorldPos } from '../../domain/monster';
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
  ghosts: Array<{ x: number; y: number; age: number }> = [];
  fx: Fx[] = [];
  private hitFlash = 0;
  private seedCounter = 1;
  private camX: number = ARENA.spawn.x;
  private camY: number = ARENA.spawn.y;
  private stepsLast = 0;
  private fpsEma = 60;
  private wasPaused = false;
  private reported = false;
  private endHold = 0;
  private onResize = () => this.fitCamera();

  constructor() { super('Arena'); }

  init(deps: SceneDeps): void { this.deps = deps; this.hunt = createHunt(this.nextSeed(), BASIC_BUILD); }

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

  /** Replace the current hunt with a fresh one (new huntId + seed). A hunt still ACTIVE is abandoned — no result is paid out for it. */
  newHunt(build: PlayerBuild, opts: HuntOptions = {}): HuntState {
    abandonHunt(this.hunt);
    this.hunt = createHunt(this.nextSeed(), build, opts);
    this.prevPos = { ...ARENA.spawn };
    this.ghosts.length = 0; this.fx.length = 0; this.hitFlash = 0; this.reported = false; this.endHold = 0;
    this.stepper.reset();
    this.camX = ARENA.spawn.x; this.camY = ARENA.spawn.y;
    this.deps.input.reset();
    return this.hunt;
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
      else if (h.monster.phase !== 'dead' && h.monster.phase !== 'captured' && Math.hypot(h.monster.pos.x - h.player.pos.x, h.monster.pos.y - h.player.pos.y) <= SOFT_LOCK_RANGE) {
        aim = selectedTargetPos(h); // touch soft-lock: face the selected part, never pull the player toward it
      }
      const steps = this.stepper.advance(deltaMs);
      this.stepsLast = steps;
      for (let i = 0; i < steps && h.status === 'ACTIVE'; i++) {
        this.prevPos.x = h.player.pos.x; this.prevPos.y = h.player.pos.y;
        const first = i === 0;
        stepHunt(h, {
          ...emptyIntent(), moveX: raw.moveX, moveY: raw.moveY, aim: aim ? { x: aim.x, y: aim.y } : null,
          attackHeld: raw.attackHeld, attackPressed: first && raw.attackPressed, dodgePressed: first && raw.dodgePressed, skillPressed: first && raw.skillPressed,
          potionPressed: first && raw.potionPressed, capturePressed: first && raw.capturePressed, contextPressed: first && raw.contextPressed,
        }, this.stepper.dt);
        if (h.player.dodge && h.player.dodge.t === 0) this.shake('dodge');
        this.trackGhosts();
        this.handleEvents();
      }
      if (deltaMs > 0) this.fpsEma += (1000 / deltaMs - this.fpsEma) * 0.05;
    }
    if (!active && !this.reported && h.result) {
      // a capture plays a short restrained animation before the results; not simulation time
      if (!paused) this.endHold += h.result.captured ? deltaMs : 1e9;
      if (this.endHold >= (h.result.captured ? TRAP.restrain * 1000 : 0)) { this.reported = true; this.endHold = 0; this.deps.onResult(h.result); }
    }

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
        case 'dot_tick': { const z = this.hunt.zone; this.addFx({ x: m.pos.x, y: m.pos.y, age: 0, life: 0.25, kind: e.source === 'fire' && z ? 'break' : 'hit', r: 40 }); break; }
        case 'player_hurt': this.shake('playerHurt'); break;
        case 'monster_stagger': this.shake('monsterStagger'); break;
        case 'monster_death': this.shake('monsterDeath'); break;
        case 'guard_hit': this.shake('guardHit'); break;
        case 'captured': this.shake('captured'); break;
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
    this.drawEnvironment(g);
    this.drawZoneAndBleed(g);
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
      this.label.setText(m.staggerCause === 'root' ? 'ติดเถาวัลย์!' : 'ชะงัก!').setPosition(m.pos.x, m.pos.y - m.def.bodyRadius - 24).setVisible(true);
    } else if (m.phase === 'captured') {
      this.label.setText('จับได้!').setPosition(m.pos.x, m.pos.y - m.def.bodyRadius - 24).setVisible(true);
    } else this.label.setVisible(false);
  }

  private drawEnvironment(g: Phaser.GameObjects.Graphics): void {
    const h = this.hunt, v = ARENA.vine;
    // vine thicket + control ring (ring only while it can still be used)
    if (!h.vine.burned) {
      g.fillStyle(0x2f6b34, 1).fillCircle(v.x, v.y, v.thicketRadius);
      g.lineStyle(3, 0x9bd37a, 1).strokeCircle(v.x, v.y, v.thicketRadius);
      for (let i = 0; i < 6; i++) { const a = i * 1.047; g.lineBetween(v.x, v.y, v.x + Math.cos(a) * v.thicketRadius, v.y + Math.sin(a) * v.thicketRadius); }
      g.lineStyle(2, h.vine.rootUsed ? 0x6d6d6d : 0x9bd37a, 0.55).strokeCircle(v.x, v.y, v.zoneRadius);
    } else {
      g.fillStyle(0x2b2b28, 0.8).fillCircle(v.x, v.y, v.thicketRadius);
      g.lineStyle(2, 0x777770, 0.7).strokeCircle(v.x, v.y, v.thicketRadius);
    }
    for (const z of h.hazards) {
      const next = z.nextPulse - z.age;
      g.fillStyle(0x8a3fd1, 0.28).fillCircle(z.x, z.y, z.r);
      g.lineStyle(4, 0xc78bff, 0.95).strokeCircle(z.x, z.y, z.r);
      g.lineStyle(3, 0xffffff, 0.8).strokeCircle(z.x, z.y, z.r * (1 - Math.max(0, Math.min(1, next / z.interval)))); // fills toward the next pulse
    }
    if (h.trap) {
      const t = h.trap;
      g.fillStyle(0x59e0ff, 0.14).fillCircle(t.x, t.y, t.r);
      g.lineStyle(4, 0x59e0ff, 0.95).strokeCircle(t.x, t.y, t.r);
      g.lineStyle(3, 0x59e0ff, 0.8);
      g.lineBetween(t.x - t.r * 0.6, t.y - t.r * 0.6, t.x + t.r * 0.6, t.y + t.r * 0.6);
      g.lineBetween(t.x - t.r * 0.6, t.y + t.r * 0.6, t.x + t.r * 0.6, t.y - t.r * 0.6);
    }
  }

  private drawZoneAndBleed(g: Phaser.GameObjects.Graphics): void {
    const z = this.hunt.zone;
    if (z) {
      const fade = 1 - z.age / z.duration;
      g.fillStyle(0xff7a1a, 0.18 + 0.2 * fade).fillCircle(z.x, z.y, z.r);
      g.lineStyle(4, 0xffb347, 0.9).strokeCircle(z.x, z.y, z.r);
      g.lineStyle(2, 0xffb347, 0.6).strokeCircle(z.x, z.y, z.r * 0.55);
    }
    const b = this.hunt.dot, m = this.hunt.monster;
    if (b && m.phase !== 'dead') {
      g.lineStyle(3, b.source === 'poison' ? 0x8bd13a : 0xd1342a, 0.9);
      for (let i = 0; i < 3; i++) { // drip marks on the body
        const a = (i * 2.1) + b.age * 1.5;
        g.strokeCircle(m.pos.x + Math.cos(a) * m.def.bodyRadius * 0.5, m.pos.y + Math.sin(a) * m.def.bodyRadius * 0.5, 5);
      }
    }
  }

  private drawPlayer(g: Phaser.GameObjects.Graphics): void {
    const p = this.hunt.player;
    const alpha = this.stepper.alpha;
    const x = this.prevPos.x + (p.pos.x - this.prevPos.x) * alpha;
    const y = this.prevPos.y + (p.pos.y - this.prevPos.y) * alpha;
    for (const gh of this.ghosts) g.fillStyle(COL.ghost, 0.35 * (1 - gh.age / 0.25)).fillCircle(gh.x, gh.y, PLAYER.radius);

    const w = WEAPONS[this.hunt.build.weaponId];
    const phase = attackPhase(p);
    if (p.attack && phase) {
      const f0 = p.attack.facing;
      const sk = this.hunt.build.skill;
      const aOn = phase === 'active' ? 0.55 : 0;
      const strokeA = phase === 'active' ? 1 : phase === 'startup' ? 0.6 : 0.25;
      if (p.attack.kind === 'skill' && sk.hit?.shape === 'cone') {
        const half = (sk.hit.cone!.angleDeg * Math.PI) / 360;
        if (aOn) g.fillStyle(0x8bd13a, aOn).slice(x, y, sk.hit.cone!.range, f0 - half, f0 + half, false).fillPath();
        g.lineStyle(3, 0x8bd13a, strokeA).slice(x, y, sk.hit.cone!.range, f0 - half, f0 + half, false).strokePath();
      } else if (p.attack.kind === 'skill' && sk.guard) {
        // guard fan: 120° in front
        const half = Math.PI / 3;
        g.lineStyle(5, 0x59e0ff, phase === 'active' ? 1 : 0.4).slice(x, y, 54, f0 - half, f0 + half, false).strokePath();
        if (phase === 'active') g.fillStyle(0x59e0ff, p.guard?.used ? 0.5 : 0.22).slice(x, y, 54, f0 - half, f0 + half, false).fillPath();
      } else if (p.attack.kind === 'skill' && sk.dash) {
        // the dash itself is the shape; show the path
        if (p.attack.dashFrom) g.lineStyle(PLAYER.radius * 1.4, COL.arc, 0.35).lineBetween(p.attack.dashFrom.x, p.attack.dashFrom.y, x, y);
      } else if (!(p.attack.kind === 'skill' && !sk.hit)) {
        // Swing animation: the blade sweeps across the arc during the active frames (alternating direction per chain),
        // then a fading trail stays through the recovery so consecutive hits read as one flowing motion.
        const A = p.attack, k = phase === 'active' ? (A.t - A.startup) / A.active : phase === 'recovery' ? 1 : 0;
        const rec = phase === 'recovery' ? Math.min(1, (A.t - A.startup - A.active) / A.recovery) : 0;
        const dirSign = A.id % 2 === 0 ? -1 : 1;
        if (w.shape.kind === 'sector') {
          const half = (w.shape.arcDeg * Math.PI) / 360, R = w.shape.range;
          const from = f0 - dirSign * half, lead = from + dirSign * 2 * half * k;
          const a0 = Math.min(from, lead), a1 = Math.max(from, lead);
          if (phase === 'startup') g.lineStyle(3, COL.arc, 0.6).lineBetween(x, y, x + Math.cos(from) * R * 0.8, y + Math.sin(from) * R * 0.8);
          else {
            const trailA = phase === 'active' ? 0.5 : 0.4 * (1 - rec);
            if (a1 > a0) g.fillStyle(COL.arc, trailA).slice(x, y, R, a0, a1, false).fillPath();
            g.lineStyle(phase === 'active' ? 6 : 3, COL.arc, phase === 'active' ? 1 : 0.8 * (1 - rec)).lineBetween(x, y, x + Math.cos(lead) * R, y + Math.sin(lead) * R);
          }
        } else { // spear: thrust out during active, pull back through recovery
          const L = w.shape.length;
          const ext = phase === 'startup' ? 0.15 : phase === 'active' ? 0.15 + 0.85 * k : 1 - 0.85 * rec;
          const ex = x + Math.cos(f0) * L * ext, ey = y + Math.sin(f0) * L * ext;
          g.lineStyle(w.shape.halfWidth * 2, COL.arc, phase === 'active' ? 0.5 : 0.25).lineBetween(x, y, ex, ey);
          g.lineStyle(phase === 'active' ? 6 : 3, COL.arc, 1).lineBetween(x, y, ex, ey);
        }
      }
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
    if (p.channel) { // progress ring while drinking / setting the trap
      const k = Math.min(1, p.channel.t / p.channel.dur);
      g.lineStyle(5, p.channel.kind === 'potion' ? 0x6ee06e : 0x59e0ff, 0.95).slice(x, y, R + 14, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k, false).strokePath();
    }
  }

  private partColor(id: PartId): number {
    return ({ fire_sac: COL.sac, jaw: COL.jaw, shell: 0x6b4a2a, poison_sac: 0x8a3fd1, wing: 0x7aa7c7, horn: 0xe8dcc0 } as Record<PartId, number>)[id];
  }

  private drawMonster(g: Phaser.GameObjects.Graphics): void {
    const m = this.hunt.monster;
    const id: MonsterId = m.def.id;
    const dead = m.phase === 'dead';
    const fl = this.hitFlash > 0;
    const a = dead ? 0.45 : 1;
    const dir = fromAngle(m.facing);
    const side = { x: -dir.y, y: dir.x };
    const R = m.def.bodyRadius;
    const at = (f: number, s: number) => ({ x: m.pos.x + dir.x * f + side.x * s, y: m.pos.y + dir.y * f + side.y * s });
    const shade = (c: number) => (fl ? COL.white : c);

    if (id === 'ember_gecko') {
      for (let i = 1; i <= 4; i++) { const p = at(-(R * 0.6 + i * 26), 0); g.fillStyle(shade(COL.jaw), a).fillCircle(p.x, p.y, 26 - i * 4); }
      g.fillStyle(shade(COL.body), a).fillCircle(m.pos.x, m.pos.y, R);
      g.lineStyle(4, COL.bodyEdge, a).strokeCircle(m.pos.x, m.pos.y, R);
      const hd = at(78, 0);
      g.fillStyle(shade(COL.head), a).fillCircle(hd.x, hd.y, 38);
      g.lineStyle(4, COL.bodyEdge, a).strokeCircle(hd.x, hd.y, 38);
    } else if (id === 'mire_crab') {
      for (const s of [-1, 1]) { // legs and claws
        for (let i = 0; i < 3; i++) { const l = at(-20 + i * 28, s * (R + 14)); g.fillStyle(shade(0x7a3b2e), a).fillCircle(l.x, l.y, 11); g.lineStyle(4, 0x3a1c14, a).lineBetween(m.pos.x + side.x * s * R * 0.7, m.pos.y + side.y * s * R * 0.7, l.x, l.y); }
        const arm = at(R * 0.9, s * (R * 0.95)); const claw = at(R + 34, s * (R * 0.8));
        g.lineStyle(10, 0x7a3b2e, a).lineBetween(arm.x, arm.y, claw.x, claw.y);
        g.fillStyle(shade(0xa1503d), a).fillCircle(claw.x, claw.y, 24); g.lineStyle(4, 0x3a1c14, a).strokeCircle(claw.x, claw.y, 24);
      }
      g.fillStyle(shade(0x9c4a38), a).fillCircle(m.pos.x, m.pos.y, R);
      g.lineStyle(5, 0x3a1c14, a).strokeCircle(m.pos.x, m.pos.y, R);
      for (const s of [-1, 1]) { const e = at(R - 8, s * 16); g.fillStyle(0xfff3b0, a).fillCircle(e.x, e.y, 6); }
    } else { // sail lizard: long body, folded-sail wings, blunt horn
      for (let i = 1; i <= 5; i++) { const p = at(-(R * 0.5 + i * 24), 0); g.fillStyle(shade(0x4f8aa8), a).fillCircle(p.x, p.y, 24 - i * 3); }
      for (const s of [-1, 1]) {
        const w1 = at(10, s * (R * 0.8)), w2 = at(-70, s * (R * 2.6)), w3 = at(-90, s * R * 0.6);
        g.fillStyle(shade(0x7aa7c7), 0.75 * a).fillTriangle(w1.x, w1.y, w2.x, w2.y, w3.x, w3.y);
        g.lineStyle(3, 0x24485f, a).lineBetween(w1.x, w1.y, w2.x, w2.y).lineBetween(w2.x, w2.y, w3.x, w3.y);
      }
      g.fillStyle(shade(0x5da0c4), a).fillCircle(m.pos.x, m.pos.y, R);
      g.lineStyle(4, 0x24485f, a).strokeCircle(m.pos.x, m.pos.y, R);
      const hd = at(R + 14, 0);
      g.fillStyle(shade(0x6db4d8), a).fillCircle(hd.x, hd.y, 26); g.lineStyle(4, 0x24485f, a).strokeCircle(hd.x, hd.y, 26);
      for (const s of [-1, 1]) { const e = at(R + 20, s * 12); g.fillStyle(0xfff3b0, a).fillCircle(e.x, e.y, 5); }
    }

    // parts (same circles the hit tests use)
    const breathTele = m.phase === 'telegraph' && m.move?.id === 'fire_breath' ? Math.min(1, m.t / m.move.telegraph) : 0;
    for (const p of m.def.parts) {
      const pos = partWorldPos(m, p.id);
      const broken = m.broken.includes(p.id);
      const r = p.radius * (p.id === 'fire_sac' && !broken ? 1 + 0.35 * breathTele : 1);
      g.fillStyle(broken ? COL.broken : this.partColor(p.id), a * (p.id === 'wing' && !broken ? 0.55 : 0.95)).fillCircle(pos.x, pos.y, r);
      g.lineStyle(3, COL.bodyEdge, a).strokeCircle(pos.x, pos.y, r);
      if (p.id === 'shell' && !broken) { g.lineStyle(3, 0x3a1c14, a); for (let i = -1; i <= 1; i++) g.lineBetween(pos.x + side.x * i * 18 - dir.x * r * 0.8, pos.y + side.y * i * 18 - dir.y * r * 0.8, pos.x + side.x * i * 18 + dir.x * r * 0.8, pos.y + side.y * i * 18 + dir.y * r * 0.8); }
      if (broken) { // cracks, not gore
        g.lineStyle(3, 0x1a1a1a, a);
        g.lineBetween(pos.x - r * 0.6, pos.y - r * 0.6, pos.x + r * 0.6, pos.y + r * 0.6);
        g.lineBetween(pos.x - r * 0.6, pos.y + r * 0.6, pos.x + r * 0.6, pos.y - r * 0.6);
      }
    }
    if (id === 'ember_gecko') for (const s of [-1, 1]) { const e = at(92, s * 18); g.fillStyle(0xfff3b0, a).fillCircle(e.x, e.y, 6); }

    // armor indicator: intact front shell shows a thick arc on the armoured side
    const fa = m.def.frontArmor;
    if (fa && !m.broken.includes(fa.part) && !dead) {
      const half = (fa.halfArcDeg * Math.PI) / 180;
      g.lineStyle(8, 0xd8c08a, 0.9).slice(m.pos.x, m.pos.y, R + 6, m.facing - half, m.facing + half, false).strokePath();
    }
    // glide armor window
    if (m.phase === 'attack' && m.move?.armorWhileActive) g.lineStyle(6, 0xd8c08a, 0.9).strokeCircle(m.pos.x, m.pos.y, R + 8);

    const sel = this.hunt.selected;
    if (!dead && this.hunt.status === 'ACTIVE') {
      const c = sel === 'body' ? m.pos : partWorldPos(m, sel);
      const r = sel === 'body' ? R + 8 : (m.def.parts.find((p) => p.id === sel)!.radius + 8);
      g.lineStyle(3, COL.arc, 0.95).strokeCircle(c.x, c.y, r);
    }
    if (m.phase === 'stagger') g.lineStyle(4, COL.white, 0.8).strokeCircle(m.pos.x, m.pos.y, R + 14);
    if (m.phase === 'recovery') g.lineStyle(3, 0xbfe3ff, 0.8).strokeCircle(m.pos.x, m.pos.y, R + 14); // open window (×1.15)
    if (m.phase === 'captured') { // restraint net
      g.lineStyle(4, 0x59e0ff, 0.95).strokeCircle(m.pos.x, m.pos.y, R + 10);
      for (let i = -2; i <= 2; i++) { g.lineBetween(m.pos.x + i * R * 0.45, m.pos.y - R, m.pos.x + i * R * 0.45, m.pos.y + R); g.lineBetween(m.pos.x - R, m.pos.y + i * R * 0.45, m.pos.x + R, m.pos.y + i * R * 0.45); }
    }
  }

  private drawTelegraph(g: Phaser.GameObjects.Graphics): void {
    const h = this.hunt, m = h.monster;
    const mv: MoveDef | null = m.move;
    if (!mv || (m.phase !== 'telegraph' && m.phase !== 'attack')) return;
    const attacking = m.phase === 'attack';
    const prog = attacking ? 1 : Math.min(1, m.t / mv.telegraph);
    const locked = attacking || m.locked;
    const fillA = attacking ? 0.6 : 0.1 + 0.25 * prog;
    const line = locked ? 5 : 2; // thick outline = direction/target locked, stopped tracking
    const sh = effectiveShape(m, mv);
    const dir = fromAngle(m.facing);
    const V = (x: number, y: number) => new Phaser.Math.Vector2(x, y);
    if (sh.kind === 'cone') {
      const o = { x: m.pos.x + dir.x * 80, y: m.pos.y + dir.y * 80 };
      const half = (sh.angleDeg * Math.PI) / 360;
      g.fillStyle(COL.danger, fillA).slice(o.x, o.y, sh.range, m.facing - half, m.facing + half, false).fillPath();
      g.lineStyle(line, COL.danger, 1).slice(o.x, o.y, sh.range, m.facing - half, m.facing + half, false).strokePath();
    } else if (sh.kind === 'dash') {
      const len = sh.distance + sh.headOffset + sh.hitRadius, w = sh.hitRadius;
      const n = { x: -dir.y, y: dir.x };
      const pts = [
        V(m.pos.x + n.x * w, m.pos.y + n.y * w), V(m.pos.x + dir.x * len + n.x * w, m.pos.y + dir.y * len + n.y * w),
        V(m.pos.x + dir.x * len - n.x * w, m.pos.y + dir.y * len - n.y * w), V(m.pos.x - n.x * w, m.pos.y - n.y * w),
      ];
      g.fillStyle(COL.danger, fillA).fillPoints(pts, true);
      g.lineStyle(line, COL.danger, 1).strokePoints(pts, true);
    } else if (sh.kind === 'rear_arc') {
      const rear = m.facing + Math.PI, half = (sh.arcDeg * Math.PI) / 360;
      g.fillStyle(COL.danger, fillA).slice(m.pos.x, m.pos.y, sh.range, rear - half, rear + half, false).fillPath();
      g.lineStyle(line, COL.danger, 1).slice(m.pos.x, m.pos.y, sh.range, rear - half, rear + half, false).strokePath();
    } else if (sh.kind === 'target_circle' || sh.kind === 'puddle') {
      const c = m.locked && m.lockTarget ? m.lockTarget : h.player.pos; // follows the player until the lock
      const r = sh.kind === 'target_circle' ? sh.radius : sh.radius;
      const col = sh.kind === 'puddle' ? 0xc78bff : COL.danger;
      g.fillStyle(col, fillA).fillCircle(c.x, c.y, r);
      g.lineStyle(line, col, 1).strokeCircle(c.x, c.y, r);
      if (!locked) g.lineStyle(2, col, 0.7).strokeCircle(c.x, c.y, r * 0.6); // inner ring = still tracking
    } else {
      const mid = (sh.inner + sh.outer) / 2;
      g.lineStyle(sh.outer - sh.inner, COL.danger, fillA).strokeCircle(m.pos.x, m.pos.y, mid);
      g.lineStyle(line, COL.danger, 1).strokeCircle(m.pos.x, m.pos.y, sh.outer);
      g.lineStyle(line, 0x7be07b, 1).strokeCircle(m.pos.x, m.pos.y, sh.inner); // green inner edge = the safe hole
    }
  }

  /** QA hook. */
  get debugState() { return { hunt: this.hunt }; }
}

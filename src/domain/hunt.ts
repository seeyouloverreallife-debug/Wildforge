import { MISSIONS, type MissionId, type MonsterId, type Objective } from '../data/content';
import { MONSTERS, STAGGER, VULNERABLE_MULT, type MoveId, type PartId } from '../data/monsters';
import { ARENA, HUNT_TIME_LIMIT, POTION, TRAP } from '../data/tuning';
import { WEAPONS } from '../data/weapons';
import { BASIC_BUILD, type PlayerBuild } from './build';
import { circlesOverlap, distToSegment, sectorHitsCircle, wrapPi } from './geometry';
import {
  bodyArmorMultiplier, createMonster, markMonsterHitLanded, partDef, partWorldPos, startStagger, stepMonster, type MonsterState,
} from './monster';
import {
  activeAttackShape, attackPhase, createPlayer, damagePlayer, isInvulnerable, shapeTip, startChannel, stepPlayer, weaponShape,
  type Intent, type PlayerShape, type PlayerState,
} from './player';
import { PLAYER } from '../data/tuning';
import type { Vec } from './vec';
import { defaultWorld, resolveCollisions, type World } from './world';

export type HuntStatus = 'ACTIVE' | 'SUCCESS' | 'FAILED' | 'ABANDONED';
export type FailReason = 'player_down' | 'timeout' | 'killed_capture';
export type Target = 'body' | PartId;

export type HuntEvent =
  | { type: 'hit_landed'; part: PartId | null; bodyDamage: number; partDamage: number }
  | { type: 'player_hurt'; move: MoveId | 'hazard'; damage: number }
  | { type: 'part_break'; part: PartId }
  | { type: 'monster_stagger'; cause: 'part_break' | 'meter' | 'root' }
  | { type: 'telegraph'; move: MoveId }
  | { type: 'skill_used'; skill: string }
  | { type: 'dot_tick'; source: 'bleed' | 'poison' | 'fire'; damage: number }
  | { type: 'guard_hit'; reduced: number }
  | { type: 'counter'; hit: boolean }
  | { type: 'potion_used'; healed: number }
  | { type: 'trap_set' }
  | { type: 'captured' }
  | { type: 'vine_root' }
  | { type: 'torch_burn' }
  | { type: 'monster_reset' }
  | { type: 'monster_death' }
  | { type: 'player_down' }
  | { type: 'terminal'; status: HuntStatus };

export interface HuntResult {
  huntId: string;
  missionId: MissionId;
  monsterId: MonsterId;
  objective: Objective;
  outcome: 'success' | 'failed' | 'abandoned';
  failReason: FailReason | null;
  captured: boolean;
  elapsed: number;
  brokenPartIds: PartId[];
  movesSeen: MoveId[];
}

export interface Dot { source: 'bleed' | 'poison'; dps: number; duration: number; age: number; nextPulse: number; carry: number }
export interface FireZone { x: number; y: number; r: number; tick: number; duration: number; age: number; nextTick: number; carry: number }
export interface Hazard { x: number; y: number; r: number; damage: number; duration: number; interval: number; age: number; nextPulse: number }
export interface Trap { x: number; y: number; r: number; age: number }

export interface HuntState {
  huntId: string;
  seed: number;
  missionId: MissionId;
  monsterId: MonsterId;
  objective: Objective;
  status: HuntStatus;
  elapsed: number;
  build: PlayerBuild;
  player: PlayerState;
  monster: MonsterState;
  /** damage-over-time on the monster: body only, refresh (never stack) on reuse (§7.4) */
  dot: Dot | null;
  zone: FireZone | null;
  hazards: Hazard[];
  trap: Trap | null;
  trapCharge: boolean;
  potions: number;
  vine: { burned: boolean; rootUsed: boolean };
  baseWorld: World;
  selected: Target;
  movesSeen: MoveId[];
  lastResolvedAttackId: number;
  events: HuntEvent[];
  /** set exactly once, when the hunt leaves ACTIVE */
  result: HuntResult | null;
}

let huntCounter = 0;

export interface HuntOptions { missionId?: MissionId }

export function createHunt(seed: number, build: PlayerBuild = BASIC_BUILD, opts: HuntOptions = {}): HuntState {
  huntCounter++;
  const missionId = opts.missionId ?? 'hunt_gecko';
  const mission = MISSIONS[missionId];
  const def = MONSTERS[mission.monsterId];
  return {
    huntId: `hunt-${huntCounter}-${seed}`, seed, missionId, monsterId: def.id, objective: mission.objective, status: 'ACTIVE', elapsed: 0,
    build, dot: null, zone: null, hazards: [], trap: null, trapCharge: mission.objective === 'capture', potions: POTION.uses,
    vine: { burned: false, rootUsed: false },
    player: createPlayer(ARENA.spawn),
    monster: createMonster(def, { x: 800, y: 340 }, seed),
    baseWorld: defaultWorld(), selected: 'body', movesSeen: [], lastResolvedAttackId: 0, events: [], result: null,
  };
}

export const drainEvents = (h: HuntState): HuntEvent[] => h.events.splice(0, h.events.length);

/** Terminal transitions happen once; later calls are no-ops (no double settlement). */
export function finishHunt(h: HuntState, status: Exclude<HuntStatus, 'ACTIVE'>, failReason: FailReason | null = null, captured = false): boolean {
  if (h.status !== 'ACTIVE') return false;
  h.status = status;
  h.result = {
    huntId: h.huntId, missionId: h.missionId, monsterId: h.monsterId, objective: h.objective,
    outcome: status === 'SUCCESS' ? 'success' : status === 'ABANDONED' ? 'abandoned' : 'failed',
    failReason, captured, elapsed: h.elapsed, brokenPartIds: [...h.monster.broken], movesSeen: [...h.movesSeen],
  };
  h.events.push({ type: 'terminal', status });
  return true;
}

export const abandonHunt = (h: HuntState): boolean => finishHunt(h, 'ABANDONED');

export function selectedTargetPos(h: HuntState): Vec {
  return h.selected === 'body' ? h.monster.pos : partWorldPos(h.monster, h.selected);
}

/** body → part A → part B, skipping broken parts. */
export function cycleTarget(h: HuntState): Target {
  const order: Target[] = ['body', ...h.monster.def.parts.map((p) => p.id).filter((id) => !h.monster.broken.includes(id))];
  const i = order.indexOf(h.selected);
  h.selected = order[(i + 1) % order.length] ?? 'body';
  return h.selected;
}

/** Arena obstacles: rocks plus the vine thicket until burned (§13). */
export function worldFor(h: HuntState): World {
  const v = ARENA.vine;
  const extra = h.vine.burned ? [] : [{ id: 'vine', x: v.x, y: v.y, r: v.thicketRadius }];
  return { ...h.baseWorld, obstacles: [...h.baseWorld.obstacles, ...extra] };
}
function worldWithMonster(h: HuntState): World {
  const w = worldFor(h);
  return { ...w, obstacles: [...w.obstacles, { id: 'monster', x: h.monster.pos.x, y: h.monster.pos.y, r: h.monster.def.bodyRadius }] };
}

export const captureReady = (h: HuntState): boolean =>
  h.objective === 'capture' && h.monster.hp > 0 && h.monster.hp <= h.monster.def.hp * TRAP.hpThreshold;

export function shapeHitsCircle(s: PlayerShape, c: Vec, r: number): boolean {
  if (s.t === 'sector') return sectorHitsCircle(s.origin, s.facing, s.range, s.arcRad, c, r);
  return distToSegment(c, s.from, s.to) <= s.halfWidth + r;
}

interface HitSpec { base: number; stagger: number; partMult: number; bodyOnly: boolean; dot?: Dot | null }

/** Resolve one hit on the monster: body damage once, part damage on ONE part, break before death (§7.3, §7.4, §10). */
function hitMonster(h: HuntState, shape: PlayerShape, spec: HitSpec): boolean {
  const m = h.monster;
  if (m.phase === 'dead' || m.phase === 'captured') return false;
  const hitParts = m.def.parts.filter((p) => shapeHitsCircle(shape, partWorldPos(m, p.id), p.radius));
  const hitBody = shapeHitsCircle(shape, m.pos, m.def.bodyRadius) || hitParts.length > 0;
  if (!hitBody) return false;

  const pre = spec.base * (m.phase === 'recovery' ? VULNERABLE_MULT : 1);
  const bodyDamage = Math.round(pre * bodyArmorMultiplier(m, h.player.pos));
  m.hp = Math.max(0, m.hp - bodyDamage);

  // Part damage: nearest hit, unbroken part to the swing tip; the selected part wins ties. Armor never reduces it.
  let target: PartId | null = null;
  if (!spec.bodyOnly) {
    const tip = shapeTip(shape);
    let best = Infinity;
    for (const p of hitParts) {
      if (m.broken.includes(p.id)) continue;
      const pos = partWorldPos(m, p.id);
      const d = Math.hypot(pos.x - tip.x, pos.y - tip.y) - (p.id === h.selected ? 0.5 : 0);
      if (d < best) { best = d; target = p.id; }
    }
  }
  let partDamage = 0;
  if (target) {
    partDamage = Math.round(pre * spec.partMult * h.build.partMult);
    m.partHp[target] = Math.max(0, (m.partHp[target] ?? 0) - partDamage);
  }
  h.events.push({ type: 'hit_landed', part: target, bodyDamage, partDamage });

  m.sinceHit = 0;
  if (m.phase !== 'stagger') m.staggerMeter += spec.stagger;
  if (spec.dot) h.dot = spec.dot; // refresh, never stack

  if (target && (m.partHp[target] ?? 1) <= 0 && !m.broken.includes(target)) {
    m.broken.push(target);
    h.events.push({ type: 'part_break', part: target });
    if (h.selected === target) h.selected = 'body';
    if (startStagger(m, STAGGER.partBreak, 'part_break')) h.events.push({ type: 'monster_stagger', cause: 'part_break' });
  } else if (m.staggerMeter >= STAGGER.threshold) {
    if (startStagger(m, STAGGER.meterStagger, 'meter')) h.events.push({ type: 'monster_stagger', cause: 'meter' });
  }
  if (m.hp <= 0) { m.phase = 'dead'; h.events.push({ type: 'monster_death' }); }
  return true;
}

/** Player's normal attack / hitting skill vs the monster. One attackId resolves at most once. */
export function resolvePlayerAttack(h: HuntState): void {
  const a = activeAttackShape(h.player, h.build);
  if (!a || a.attackId === h.lastResolvedAttackId) return;
  const sk = h.build.skill;
  let spec: HitSpec;
  if (a.kind === 'skill' && sk.hit) {
    spec = { base: sk.hit.damage, stagger: sk.hit.stagger, partMult: sk.hit.partMult, bodyOnly: sk.hit.bodyOnly };
    if (sk.dot) spec.dot = { source: sk.dot.source, dps: sk.dot.dps, duration: sk.dot.duration, age: 0, nextPulse: 1, carry: 0 };
  } else {
    // secondary attack multiplier applies to normal attacks only
    spec = { base: WEAPONS[h.build.weaponId].damage * h.build.normalDamageMult, stagger: STAGGER.hit, partMult: 1, bodyOnly: false };
  }
  if (hitMonster(h, a.shape, spec)) h.lastResolvedAttackId = a.attackId;
}

/** Skill effects that happen once when the skill reaches its active frames. */
function fireSkillEffects(h: HuntState): void {
  const p = h.player, a = p.attack;
  if (!a || a.kind !== 'skill' || a.fired || attackPhase(p) !== 'active') return;
  a.fired = true;
  const sk = h.build.skill;
  h.events.push({ type: 'skill_used', skill: sk.id });
  if (sk.zone) {
    h.zone = {
      x: p.pos.x + Math.cos(a.facing) * sk.zone.offset, y: p.pos.y + Math.sin(a.facing) * sk.zone.offset, r: sk.zone.radius,
      tick: sk.zone.tick, duration: sk.zone.duration, age: 0, nextTick: 1, carry: 0,
    }; // a second cast replaces the first instance
  }
  if (sk.guard) p.guard = { t: 0, duration: sk.guard.duration, facing: a.facing, used: false, counter: false };
}

function stepGuard(h: HuntState, dt: number): void {
  const p = h.player, g = p.guard, sk = h.build.skill;
  if (!g || !sk.guard) return;
  g.t += dt;
  if (g.t >= g.duration - 1e-9) {
    if (g.counter) {
      const w = WEAPONS[h.build.weaponId];
      const hit = hitMonster(h, weaponShape(w, p.pos, g.facing), { base: sk.guard.counterDamage, stagger: STAGGER.hit, partMult: 1, bodyOnly: false });
      h.events.push({ type: 'counter', hit });
    }
    p.guard = null;
  }
}

/** DOT hits body only: no part damage, no stagger, no vulnerability bonus. Fractional per-tick values carry over. */
function dotHit(h: HuntState, source: 'bleed' | 'poison' | 'fire', amount: number, owner: { carry: number }): void {
  const m = h.monster;
  if (m.phase === 'dead' || m.phase === 'captured') return;
  owner.carry += amount;
  const whole = Math.floor(owner.carry + 1e-9);
  owner.carry -= whole;
  m.hp = Math.max(0, m.hp - whole);
  h.events.push({ type: 'dot_tick', source, damage: whole });
  if (m.hp <= 0) { m.phase = 'dead'; h.events.push({ type: 'monster_death' }); }
}

function stepDamageOverTime(h: HuntState, dt: number): void {
  const b = h.dot;
  if (b) {
    b.age += dt;
    while (b.nextPulse <= b.duration && b.age >= b.nextPulse - 1e-9) { dotHit(h, b.source, b.dps, b); b.nextPulse++; }
    if (b.age >= b.duration - 1e-9) h.dot = null;
  }
  const z = h.zone;
  if (z) {
    z.age += dt;
    while (z.nextTick <= z.duration && z.age >= z.nextTick - 1e-9) {
      // only a monster standing in the zone at that moment is hurt; nothing sticks to it afterwards
      if (circlesOverlap({ x: z.x, y: z.y }, z.r, h.monster.pos, h.monster.def.bodyRadius)) dotHit(h, 'fire', z.tick, z);
      z.nextTick++;
    }
    if (z.age >= z.duration - 1e-9) h.zone = null;
  }
}

/** Monster → player damage pipeline: invulnerability, guard (melee front only), passive, min 1. Returns damage dealt. */
function hurtPlayer(h: HuntState, base: number, from: Vec, melee: boolean, tag: MoveId | 'hazard', knockback = 0): number {
  const p = h.player;
  if (isInvulnerable(p) || p.hp <= 0) return 0;
  let mult = h.build.damageTakenMult;
  const g = p.guard, gs = h.build.skill.guard;
  if (melee && g && gs && !g.used) {
    const toSource = Math.atan2(from.y - p.pos.y, from.x - p.pos.x);
    if (Math.abs(wrapPi(toSource - g.facing)) <= Math.PI / 3) { // front arc 120°
      mult *= 1 - gs.reduction;
      g.used = true; g.counter = true;
      h.events.push({ type: 'guard_hit', reduced: gs.reduction });
    }
  }
  const dealt = damagePlayer(p, base * mult);
  if (dealt > 0) {
    h.events.push({ type: 'player_hurt', move: tag, damage: dealt });
    if (knockback > 0) {
      const d = Math.hypot(p.pos.x - from.x, p.pos.y - from.y) || 1;
      p.pos.x += ((p.pos.x - from.x) / d) * knockback;
      p.pos.y += ((p.pos.y - from.y) / d) * knockback;
      resolveCollisions(p.pos, PLAYER.radius, worldWithMonster(h));
    }
  }
  return dealt;
}

function stepHazards(h: HuntState, dt: number): void {
  for (const z of h.hazards) {
    z.age += dt;
    while (z.nextPulse <= z.duration && z.age >= z.nextPulse - 1e-9) {
      // each pulse has its own id; it respects invulnerability and is never guarded (§8.2)
      if (circlesOverlap({ x: z.x, y: z.y }, z.r, h.player.pos, PLAYER.radius)) hurtPlayer(h, z.damage, { x: z.x, y: z.y }, false, 'hazard');
      z.nextPulse += z.interval;
    }
  }
  h.hazards = h.hazards.filter((z) => z.age < z.duration + 1e-9);
}

function finishChannel(h: HuntState): void {
  const p = h.player, c = p.channel;
  if (!c) return;
  if (c.t < c.dur - 1e-9) return;
  p.channel = null;
  if (c.kind === 'potion') {
    const before = p.hp;
    p.hp = Math.min(PLAYER.maxHp, p.hp + POTION.heal);
    h.potions--;
    h.events.push({ type: 'potion_used', healed: p.hp - before });
  } else {
    h.trap = { x: p.pos.x + Math.cos(p.facing) * TRAP.offset, y: p.pos.y + Math.sin(p.facing) * TRAP.offset, r: TRAP.radius, age: 0 };
    h.trapCharge = false; // spent only when the trap is actually set
    h.events.push({ type: 'trap_set' });
  }
}

/** Context action at the vine point: rope the monster standing on it, or burn the thicket with the torch (§13). */
export type ContextAction = { kind: 'root' | 'burn'; ok: boolean; reason?: string } | null;
export function contextAction(h: HuntState): ContextAction {
  const v = ARENA.vine;
  if (h.vine.burned) return null;
  const p = h.player.pos;
  if (Math.hypot(p.x - v.x, p.y - v.y) > v.interactRange) return null;
  const m = h.monster;
  const onVine = circlesOverlap({ x: v.x, y: v.y }, v.zoneRadius, m.pos, m.def.bodyRadius);
  if (onVine) {
    const free = m.phase !== 'stagger' && m.phase !== 'dead' && m.phase !== 'captured';
    if (h.vine.rootUsed) return { kind: 'root', ok: false, reason: 'ใช้เถาวัลย์ไปแล้ว' };
    if (!free) return { kind: 'root', ok: false, reason: 'สัตว์ชะงักอยู่แล้ว' };
    return { kind: 'root', ok: true };
  }
  return { kind: 'burn', ok: true };
}

function doContext(h: HuntState): void {
  const c = contextAction(h);
  if (!c || !c.ok) return;
  if (c.kind === 'root') {
    if (startStagger(h.monster, ARENA.vine.rootSeconds, 'root')) { h.vine.rootUsed = true; h.events.push({ type: 'vine_root' }); }
  } else {
    h.vine.burned = true;
    h.events.push({ type: 'torch_burn' });
  }
}

export function stepHunt(h: HuntState, intent: Intent, dt: number): void {
  if (h.status !== 'ACTIVE') return;
  h.elapsed += dt;
  const p = h.player;

  if (intent.potionPressed && h.potions > 0 && p.hp < PLAYER.maxHp) startChannel(p, 'potion', POTION.duration);
  if (intent.capturePressed && h.objective === 'capture' && h.trapCharge && !h.trap) startChannel(p, 'trap', TRAP.setup);
  if (intent.contextPressed) doContext(h);

  stepPlayer(p, intent, dt, worldWithMonster(h), h.build);
  if (p.channel) { p.channel.t += dt; finishChannel(h); }
  fireSkillEffects(h);
  stepGuard(h, dt);
  resolvePlayerAttack(h);
  stepDamageOverTime(h, dt);

  if (h.monster.phase === 'dead') {
    // killing blow beats a same-tick monster hit; a capture mission needs the animal alive
    if (h.objective === 'capture') finishHunt(h, 'FAILED', 'killed_capture'); else finishHunt(h, 'SUCCESS');
    return;
  }

  if (h.trap) {
    h.trap.age += dt;
    if (h.trap.age >= TRAP.life) h.trap = null;
    else if (captureReady(h) && (h.monster.phase === 'recovery' || h.monster.phase === 'stagger')
      && Math.hypot(h.monster.pos.x - h.trap.x, h.monster.pos.y - h.trap.y) <= h.trap.r) {
      h.monster.phase = 'captured'; // restrained from this tick: nothing damages it any more
      h.events.push({ type: 'captured' });
      finishHunt(h, 'SUCCESS', null, true);
      return;
    }
  }

  const res = stepMonster(h.monster, p.pos, dt, worldFor(h));
  for (const e of res.events) {
    if (e.type === 'telegraph') {
      if (!h.movesSeen.includes(e.move)) h.movesSeen.push(e.move);
      h.events.push({ type: 'telegraph', move: e.move });
    } else if (e.type === 'reset') h.events.push({ type: 'monster_reset' });
  }
  if (res.spawnPuddle) {
    const s = res.spawnPuddle;
    h.hazards.push({ x: s.x, y: s.y, r: s.radius, damage: s.damage, duration: s.duration, interval: s.interval, age: 0, nextPulse: s.interval });
  }
  if (res.hitPlayer) {
    const hp = res.hitPlayer;
    const dealt = hurtPlayer(h, hp.damage, hp.from, true, hp.moveId, hp.knockback);
    if (dealt > 0) markMonsterHitLanded(h.monster); // an attack hits at most once; i-frame contact doesn't consume it
  }
  stepHazards(h, dt);

  if (p.hp <= 0) { h.events.push({ type: 'player_down' }); finishHunt(h, 'FAILED', 'player_down'); return; }
  if (h.elapsed >= HUNT_TIME_LIMIT) finishHunt(h, 'FAILED', 'timeout');
}

export { partDef };

import { EMBER_GECKO, STAGGER, VULNERABLE_MULT, type MoveId, type PartId } from '../data/monsters';
import { ARENA, HUNT_TIME_LIMIT } from '../data/tuning';
import { WEAPONS, type WeaponDef } from '../data/weapons';
import { BASIC_BUILD, type PlayerBuild } from './build';
import { circlesOverlap, sectorHitsCircle } from './geometry';
import {
  createMonster, markMonsterHitLanded, partWorldPos, startStagger, stepMonster, type MonsterEvent, type MonsterState,
} from './monster';
import { activeAttackShape, attackPhase, createPlayer, damagePlayer, stepPlayer, type Intent, type PlayerState } from './player';
import type { Vec } from './vec';
import { defaultWorld, type World } from './world';

export type HuntStatus = 'ACTIVE' | 'SUCCESS' | 'FAILED' | 'ABANDONED';
export type FailReason = 'player_down' | 'timeout';
export type Target = 'body' | PartId;

export type HuntEvent =
  | { type: 'hit_landed'; part: PartId | null; bodyDamage: number; partDamage: number }
  | { type: 'player_hurt'; move: MoveId; damage: number }
  | { type: 'part_break'; part: PartId }
  | { type: 'monster_stagger'; cause: 'part_break' | 'meter' }
  | { type: 'telegraph'; move: MoveId }
  | { type: 'skill_used'; skill: string }
  | { type: 'dot_tick'; source: 'bleed' | 'fire'; damage: number }
  | { type: 'monster_death' }
  | { type: 'player_down' }
  | { type: 'terminal'; status: HuntStatus };

export interface HuntResult {
  huntId: string;
  outcome: 'success' | 'failed' | 'abandoned';
  failReason: FailReason | null;
  elapsed: number;
  brokenPartIds: PartId[];
  movesSeen: MoveId[];
}

export interface HuntState {
  huntId: string;
  seed: number;
  status: HuntStatus;
  elapsed: number;
  build: PlayerBuild;
  player: PlayerState;
  monster: MonsterState;
  /** damage-over-time: body damage only, refresh (never stack) on reuse (§7.4) */
  bleed: { dps: number; duration: number; age: number; nextPulse: number; carry: number } | null;
  zone: { x: number; y: number; r: number; tick: number; duration: number; age: number; nextTick: number; carry: number } | null;
  baseWorld: World;
  selected: Target;
  movesSeen: MoveId[];
  lastResolvedAttackId: number;
  events: HuntEvent[];
  /** set exactly once, when the hunt leaves ACTIVE */
  result: HuntResult | null;
}

let huntCounter = 0;

export function createHunt(seed: number, build: PlayerBuild = BASIC_BUILD): HuntState {
  huntCounter++;
  const baseWorld = defaultWorld();
  return {
    huntId: `hunt-${huntCounter}-${seed}`, seed, status: 'ACTIVE', elapsed: 0,
    build, bleed: null, zone: null,
    player: createPlayer(ARENA.spawn),
    monster: createMonster(EMBER_GECKO, { x: 800, y: 340 }, seed),
    baseWorld, selected: 'body', movesSeen: [], lastResolvedAttackId: 0, events: [], result: null,
  };
}

export const drainEvents = (h: HuntState): HuntEvent[] => h.events.splice(0, h.events.length);

/** Terminal transitions happen once; later calls are no-ops (no double settlement). */
export function finishHunt(h: HuntState, status: Exclude<HuntStatus, 'ACTIVE'>, failReason: FailReason | null = null): boolean {
  if (h.status !== 'ACTIVE') return false;
  h.status = status;
  h.result = {
    huntId: h.huntId,
    outcome: status === 'SUCCESS' ? 'success' : status === 'ABANDONED' ? 'abandoned' : 'failed',
    failReason, elapsed: h.elapsed, brokenPartIds: [...h.monster.broken], movesSeen: [...h.movesSeen],
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

function worldWithMonster(h: HuntState): World {
  return { ...h.baseWorld, obstacles: [...h.baseWorld.obstacles, { id: 'monster', x: h.monster.pos.x, y: h.monster.pos.y, r: h.monster.def.bodyRadius }] };
}

/** Player's swing vs monster regions. One attackId resolves at most once (body + one part). */
export function resolvePlayerAttack(h: HuntState, weapon: WeaponDef = WEAPONS.fang_cleaver): void {
  const m = h.monster;
  const shape = activeAttackShape(h.player, weapon, h.build);
  if (!shape || m.phase === 'dead' || shape.attackId === h.lastResolvedAttackId) return;

  const hits = (c: Vec, r: number) => sectorHitsCircle(shape.origin, shape.facing, shape.range, shape.arcRad, c, r);
  const hitParts = m.def.parts.filter((p) => hits(partWorldPos(m, p.id), p.radius));
  const hitBody = hits(m.pos, m.def.bodyRadius) || hitParts.length > 0;
  if (!hitBody) return;
  h.lastResolvedAttackId = shape.attackId;

  const skill = shape.kind === 'skill' ? h.build.skill : null;
  const base = skill?.hit ? skill.hit.damage : weapon.damage * h.build.normalDamageMult; // secondary multiplier: normal attacks only
  const pre = base * (m.phase === 'recovery' ? VULNERABLE_MULT : 1);
  const bodyDamage = Math.round(pre);
  m.hp = Math.max(0, m.hp - bodyDamage);

  // Part damage: nearest hit, unbroken part to the swing tip; the selected part wins ties.
  const tip = { x: shape.origin.x + Math.cos(shape.facing) * shape.range, y: shape.origin.y + Math.sin(shape.facing) * shape.range };
  let target: PartId | null = null;
  let best = Infinity;
  for (const p of hitParts) {
    if (m.broken.includes(p.id)) continue;
    const pos = partWorldPos(m, p.id);
    const d = Math.hypot(pos.x - tip.x, pos.y - tip.y) - (p.id === h.selected ? 0.5 : 0);
    if (d < best) { best = d; target = p.id; }
  }
  let partDamage = 0;
  const monsterEvents: MonsterEvent[] = [];
  if (target) {
    partDamage = Math.round(pre);
    m.partHp[target] = Math.max(0, m.partHp[target] - partDamage);
  }
  h.events.push({ type: 'hit_landed', part: target, bodyDamage, partDamage });

  // Stagger meter (§9): normal hit +5, no gain while staggered.
  m.sinceHit = 0;
  if (m.phase !== 'stagger') m.staggerMeter += skill?.hit ? skill.hit.stagger : STAGGER.hit;
  if (skill?.bleed) h.bleed = { dps: skill.bleed.dps, duration: skill.bleed.duration, age: 0, nextPulse: 1, carry: 0 }; // refresh, never stack

  // Resolve break BEFORE death so a killing blow still pays the part bonus (§10).
  if (target && m.partHp[target] <= 0 && !m.broken.includes(target)) {
    m.broken.push(target);
    h.events.push({ type: 'part_break', part: target });
    if (h.selected === target) h.selected = 'body';
    startStagger(m, STAGGER.partBreak, 'part_break', monsterEvents);
  } else if (m.staggerMeter >= STAGGER.threshold) {
    startStagger(m, STAGGER.meterStagger, 'meter', monsterEvents);
  }
  for (const e of monsterEvents) if (e.type === 'stagger') h.events.push({ type: 'monster_stagger', cause: e.cause });

  if (m.hp <= 0) {
    m.phase = 'dead';
    h.events.push({ type: 'monster_death' });
  }
}

/** Skill effects that happen once when the skill reaches its active frames. */
function fireSkillEffects(h: HuntState): void {
  const a = h.player.attack;
  if (!a || a.kind !== 'skill' || a.fired || attackPhase(h.player) !== 'active') return;
  a.fired = true;
  const sk = h.build.skill;
  h.events.push({ type: 'skill_used', skill: sk.id });
  if (sk.zone) {
    const d = sk.zone.offset;
    h.zone = {
      x: h.player.pos.x + Math.cos(a.facing) * d, y: h.player.pos.y + Math.sin(a.facing) * d, r: sk.zone.radius,
      tick: sk.zone.tick, duration: sk.zone.duration, age: 0, nextTick: 1, carry: 0,
    }; // a second cast replaces the first instance
  }
}

/** DOT hits body only: no part damage, no stagger, no vulnerability bonus. Fractional per-tick values carry over. */
function dotHit(h: HuntState, source: 'bleed' | 'fire', amount: number, carryOwner: { carry: number }): void {
  const m = h.monster;
  if (m.phase === 'dead') return;
  carryOwner.carry += amount;
  const whole = Math.floor(carryOwner.carry + 1e-9);
  carryOwner.carry -= whole;
  m.hp = Math.max(0, m.hp - whole);
  h.events.push({ type: 'dot_tick', source, damage: whole });
  if (m.hp <= 0) { m.phase = 'dead'; h.events.push({ type: 'monster_death' }); }
}

function stepDamageOverTime(h: HuntState, dt: number): void {
  const b = h.bleed;
  if (b) {
    b.age += dt;
    while (b.nextPulse <= b.duration && b.age >= b.nextPulse - 1e-9) { dotHit(h, 'bleed', b.dps, b); b.nextPulse++; }
    if (b.age >= b.duration - 1e-9) h.bleed = null;
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

export function stepHunt(h: HuntState, intent: Intent, dt: number): void {
  if (h.status !== 'ACTIVE') return;
  h.elapsed += dt;

  stepPlayer(h.player, intent, dt, worldWithMonster(h), WEAPONS.fang_cleaver, h.build);
  fireSkillEffects(h);
  resolvePlayerAttack(h);
  stepDamageOverTime(h, dt);

  if (h.monster.phase === 'dead') { finishHunt(h, 'SUCCESS'); return; } // killing blow beats a same-tick monster hit

  const res = stepMonster(h.monster, h.player.pos, dt, h.baseWorld);
  for (const e of res.events) {
    if (e.type === 'telegraph') {
      if (!h.movesSeen.includes(e.move)) h.movesSeen.push(e.move);
      h.events.push({ type: 'telegraph', move: e.move });
    }
  }
  if (res.hitPlayer) {
    const dealt = damagePlayer(h.player, res.hitPlayer.damage);
    if (dealt > 0) {
      markMonsterHitLanded(h.monster); // an attack hits at most once; i-frame contact doesn't consume it
      h.events.push({ type: 'player_hurt', move: res.hitPlayer.moveId, damage: dealt });
    }
  }

  if (h.player.hp <= 0) { h.events.push({ type: 'player_down' }); finishHunt(h, 'FAILED', 'player_down'); return; }
  if (h.elapsed >= HUNT_TIME_LIMIT) finishHunt(h, 'FAILED', 'timeout');
}


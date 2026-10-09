import { EMBER_GECKO, STAGGER, VULNERABLE_MULT, type MoveId, type PartId } from '../data/monsters';
import { ARENA, HUNT_TIME_LIMIT } from '../data/tuning';
import { WEAPONS, type WeaponDef } from '../data/weapons';
import { sectorHitsCircle } from './geometry';
import {
  createMonster, markMonsterHitLanded, partWorldPos, startStagger, stepMonster, type MonsterEvent, type MonsterState,
} from './monster';
import { activeAttackShape, createPlayer, damagePlayer, stepPlayer, type Intent, type PlayerState } from './player';
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
  player: PlayerState;
  monster: MonsterState;
  baseWorld: World;
  selected: Target;
  movesSeen: MoveId[];
  lastResolvedAttackId: number;
  events: HuntEvent[];
  /** set exactly once, when the hunt leaves ACTIVE */
  result: HuntResult | null;
}

let huntCounter = 0;

export function createHunt(seed: number): HuntState {
  huntCounter++;
  const baseWorld = defaultWorld();
  return {
    huntId: `hunt-${huntCounter}-${seed}`, seed, status: 'ACTIVE', elapsed: 0,
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
  const shape = activeAttackShape(h.player, weapon);
  if (!shape || m.phase === 'dead' || shape.attackId === h.lastResolvedAttackId) return;

  const hits = (c: Vec, r: number) => sectorHitsCircle(shape.origin, shape.facing, shape.range, shape.arcRad, c, r);
  const hitParts = m.def.parts.filter((p) => hits(partWorldPos(m, p.id), p.radius));
  const hitBody = hits(m.pos, m.def.bodyRadius) || hitParts.length > 0;
  if (!hitBody) return;
  h.lastResolvedAttackId = shape.attackId;

  const pre = weapon.damage * (m.phase === 'recovery' ? VULNERABLE_MULT : 1);
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
  if (m.phase !== 'stagger') m.staggerMeter += STAGGER.hit;

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

export function stepHunt(h: HuntState, intent: Intent, dt: number): void {
  if (h.status !== 'ACTIVE') return;
  h.elapsed += dt;

  stepPlayer(h.player, intent, dt, worldWithMonster(h));
  resolvePlayerAttack(h);

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


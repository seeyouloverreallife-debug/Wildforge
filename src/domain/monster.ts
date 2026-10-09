import {
  OBSTACLE_RECOVERY_BONUS, STAGGER, type MonsterDef, type MoveDef, type MoveId, type MoveShape, type PartId,
} from '../data/monsters';
import { ARENA, PLAYER } from '../data/tuning';
import { circlesOverlap, rotate, sectorHitsCircle, wrapPi } from './geometry';
import { createRng } from './rng';
import { fromAngle, type Vec } from './vec';
import { resolveCollisions, type World } from './world';

export type MonsterPhase = 'approach' | 'telegraph' | 'attack' | 'recovery' | 'stagger' | 'dead' | 'captured';
export type StaggerCause = 'part_break' | 'meter' | 'root';

export interface MonsterState {
  def: MonsterDef;
  pos: Vec;
  facing: number;
  hp: number;
  partHp: Partial<Record<PartId, number>>;
  broken: PartId[];
  phase: MonsterPhase;
  /** time in current phase */
  t: number;
  /** minimum approach time before next move (the 0.4–0.8 s rest) */
  restDur: number;
  move: MoveDef | null;
  recoveryDur: number;
  attackId: number;
  attackHitPlayer: boolean;
  dashFrom: Vec | null;
  /** position locked at `lockAt` of the telegraph (target circles / puddles) */
  lockTarget: Vec | null;
  locked: boolean;
  staggerMeter: number;
  sinceHit: number;
  staggerDur: number;
  staggerCause: StaggerCause | null;
  history: MoveId[];
  rng: () => number;
  stuckT: number;
  sidestepT: number;
  sidestepSign: number;
}

export type MonsterEvent =
  | { type: 'telegraph'; move: MoveId }
  | { type: 'attack'; move: MoveId }
  | { type: 'reset' };

export function createMonster(def: MonsterDef, pos: Vec, seed: number): MonsterState {
  const partHp: Partial<Record<PartId, number>> = {};
  for (const p of def.parts) partHp[p.id] = p.hp;
  return {
    def, pos: { ...pos }, facing: Math.PI / 2, hp: def.hp, partHp, broken: [],
    phase: 'approach', t: 0, restDur: 1.0, move: null, recoveryDur: 0, attackId: 0, attackHitPlayer: false, dashFrom: null,
    lockTarget: null, locked: false, staggerMeter: 0, sinceHit: 0, staggerDur: 0, staggerCause: null, history: [], rng: createRng(seed),
    stuckT: 0, sidestepT: 0, sidestepSign: 1,
  };
}

export const partDef = (m: MonsterState, id: PartId) => m.def.parts.find((x) => x.id === id)!;

export const partWorldPos = (m: MonsterState, id: PartId): Vec => {
  const o = rotate(partDef(m, id).offset, m.facing);
  return { x: m.pos.x + o.x, y: m.pos.y + o.y };
};

export function eligibleMoves(m: MonsterState, dist: number): MoveDef[] {
  const removed = new Set<MoveId>();
  for (const b of m.broken) for (const id of m.def.breakEffects[b]?.removeMoves ?? []) removed.add(id);
  return m.def.moves.filter((mv) => !removed.has(mv.id) && dist >= mv.minRange && dist <= mv.maxRange);
}

export function moveDamage(m: MonsterState, mv: MoveDef): number {
  let d = mv.damage;
  for (const b of m.broken) { const o = m.def.breakEffects[b]?.damageOverride?.[mv.id]; if (o !== undefined) d = o; }
  return d;
}

export function moveRecovery(m: MonsterState, mv: MoveDef): number {
  let r = mv.recovery;
  for (const b of m.broken) r += m.def.breakEffects[b]?.recoveryBonus?.[mv.id] ?? 0;
  return r;
}

/** Move shape after part-break overrides (e.g. a broken wing shortens the glide). */
export function effectiveShape(m: MonsterState, mv: MoveDef): MoveShape {
  const sh = mv.shape;
  if (sh.kind !== 'dash') return sh;
  let distance = sh.distance;
  for (const b of m.broken) { const o = m.def.breakEffects[b]?.dashDistance?.[mv.id]; if (o !== undefined) distance = o; }
  return { ...sh, distance };
}

/** Body damage multiplier for a hit from `from` (§7.4, §8.2, §8.3). Part damage is never reduced. */
export function bodyArmorMultiplier(m: MonsterState, from: Vec): number {
  let mult = 1;
  const fa = m.def.frontArmor;
  if (fa && !m.broken.includes(fa.part)) {
    const toAttacker = Math.atan2(from.y - m.pos.y, from.x - m.pos.x);
    if (Math.abs(wrapPi(toAttacker - m.facing)) <= (fa.halfArcDeg * Math.PI) / 180) mult *= fa.mult;
  }
  if (m.phase === 'attack' && m.move?.armorWhileActive) mult *= m.move.armorWhileActive;
  return mult;
}

/** Seeded weighted pick; never the same move 3× in a row while another is eligible (§8.4). */
export function chooseMove(m: MonsterState, dist: number): MoveDef | null {
  let pool = eligibleMoves(m, dist);
  const n = m.history.length;
  if (n >= 2 && m.history[n - 1] === m.history[n - 2]) {
    const alt = pool.filter((x) => x.id !== m.history[n - 1]);
    if (alt.length) pool = alt;
  }
  if (!pool.length) return null;
  const total = pool.reduce((s, x) => s + x.weight, 0);
  let r = m.rng() * total;
  for (const x of pool) { r -= x.weight; if (r <= 0) return x; }
  return pool[pool.length - 1]!;
}

/** Never extends an ongoing stagger / root. Returns true if it started. */
export function startStagger(m: MonsterState, dur: number, cause: StaggerCause): boolean {
  if (m.phase === 'dead' || m.phase === 'captured' || m.phase === 'stagger') return false;
  m.phase = 'stagger'; m.t = 0; m.staggerDur = dur; m.staggerCause = cause; m.move = null; m.staggerMeter = 0; m.locked = false;
  return true;
}

function turnToward(m: MonsterState, target: number, dt: number, rate: number): void {
  const d = wrapPi(target - m.facing);
  const step = rate * dt;
  m.facing += Math.abs(d) <= step ? d : Math.sign(d) * step;
}

export interface MonsterStepResult {
  events: MonsterEvent[];
  hitPlayer: { damage: number; moveId: MoveId; knockback: number; from: Vec } | null;
  spawnPuddle: { x: number; y: number; radius: number; duration: number; damage: number; interval: number } | null;
}

/** Farthest candidate point from the player that is not inside an obstacle (stuck reset, §13). */
function safePoint(m: MonsterState, playerPos: Vec, world: World): Vec {
  const cands: Vec[] = [{ x: 200, y: 200 }, { x: ARENA.width - 200, y: 200 }, { x: 200, y: ARENA.height - 200 }, { x: ARENA.width - 200, y: ARENA.height - 200 }, { x: ARENA.width / 2, y: ARENA.height / 2 }];
  let best = cands[0]!, bestD = -1;
  for (const c of cands) {
    if (world.obstacles.some((o) => Math.hypot(o.x - c.x, o.y - c.y) < o.r + m.def.bodyRadius)) continue;
    const d = Math.hypot(c.x - playerPos.x, c.y - playerPos.y);
    if (d > bestD) { bestD = d; best = c; }
  }
  return best;
}

export function stepMonster(m: MonsterState, playerPos: Vec, dt: number, world: World): MonsterStepResult {
  const res: MonsterStepResult = { events: [], hitPlayer: null, spawnPuddle: null };
  if (m.phase === 'dead' || m.phase === 'captured') return res;

  m.sinceHit += dt;
  if (m.sinceHit >= STAGGER.decayDelay) m.staggerMeter = Math.max(0, m.staggerMeter - STAGGER.decayPerSec * dt);
  m.t += dt;

  const toPlayer = Math.atan2(playerPos.y - m.pos.y, playerPos.x - m.pos.x);
  const dist = Math.hypot(playerPos.x - m.pos.x, playerPos.y - m.pos.y);

  switch (m.phase) {
    case 'stagger':
      if (m.t >= m.staggerDur) { m.phase = 'approach'; m.t = 0; m.restDur = 0.4; m.staggerCause = null; }
      break;

    case 'approach': {
      turnToward(m, toPlayer, dt, 4);
      const stopDist = m.def.bodyRadius + PLAYER.radius + 30;
      if (dist > stopDist) {
        const before = { x: m.pos.x, y: m.pos.y };
        const dir = m.sidestepT > 0 ? m.facing + (Math.PI / 2) * m.sidestepSign : m.facing;
        m.pos.x += Math.cos(dir) * m.def.approachSpeed * dt;
        m.pos.y += Math.sin(dir) * m.def.approachSpeed * dt;
        resolveCollisions(m.pos, m.def.bodyRadius, world);
        const moved = Math.hypot(m.pos.x - before.x, m.pos.y - before.y);
        if (m.sidestepT > 0) m.sidestepT = Math.max(0, m.sidestepT - dt);
        if (moved < m.def.approachSpeed * dt * 0.3) m.stuckT += dt; else { m.stuckT = 0; }
        if (m.stuckT > 2 && m.sidestepT <= 0 && m.stuckT < 5) { m.sidestepT = 0.6; m.sidestepSign = m.rng() < 0.5 ? -1 : 1; m.stuckT += 0.001; }
        if (m.stuckT >= 5) {
          // cannot walk for 5 s: reset to a safe, far point and stop attacking for a moment (never teleport-attack)
          m.pos = { ...safePoint(m, playerPos, world) };
          m.phase = 'recovery'; m.t = 0; m.recoveryDur = 1.0; m.move = null; m.stuckT = 0; m.sidestepT = 0;
          res.events.push({ type: 'reset' });
          break;
        }
      } else m.stuckT = 0;
      if (m.t >= m.restDur) {
        const mv = chooseMove(m, dist);
        if (mv) {
          m.move = mv; m.phase = 'telegraph'; m.t = 0; m.attackHitPlayer = false; m.locked = false; m.lockTarget = null;
          m.history.push(mv.id); if (m.history.length > 4) m.history.shift();
          res.events.push({ type: 'telegraph', move: mv.id });
        }
      }
      break;
    }

    case 'telegraph': {
      const mv = m.move!;
      const prog = m.t / mv.telegraph;
      if (!m.locked) {
        // tail sweep: the head swings away so the tail faces the player
        const aim = mv.shape.kind === 'rear_arc' ? toPlayer + Math.PI : toPlayer;
        turnToward(m, aim, dt, 5);
        if (prog >= mv.lockAt) { m.locked = true; m.lockTarget = { x: playerPos.x, y: playerPos.y }; }
      }
      if (m.t >= mv.telegraph) {
        if (!m.locked) { m.locked = true; m.lockTarget = { x: playerPos.x, y: playerPos.y }; }
        m.phase = 'attack'; m.t = 0; m.attackId++; m.attackHitPlayer = false;
        m.dashFrom = { ...m.pos };
        res.events.push({ type: 'attack', move: mv.id });
        if (mv.shape.kind === 'puddle') {
          const lt = m.lockTarget!;
          res.spawnPuddle = { x: lt.x, y: lt.y, radius: mv.shape.radius, duration: mv.shape.duration, damage: mv.shape.pulseDamage, interval: mv.shape.interval };
        }
      }
      break;
    }

    case 'attack': {
      const mv = m.move!;
      const sh = effectiveShape(m, mv);
      let blocked = false;
      if (sh.kind === 'dash') {
        const speed = sh.distance / mv.active;
        const before = { x: m.pos.x, y: m.pos.y };
        m.pos.x += Math.cos(m.facing) * speed * dt;
        m.pos.y += Math.sin(m.facing) * speed * dt;
        resolveCollisions(m.pos, m.def.bodyRadius, world);
        const moved = Math.hypot(m.pos.x - before.x, m.pos.y - before.y);
        if (moved < speed * dt - 0.5) blocked = true;
      }
      if (!m.attackHitPlayer && sh.kind !== 'puddle' && monsterShapeHits(m, mv, playerPos)) {
        res.hitPlayer = { damage: moveDamage(m, mv), moveId: mv.id, knockback: sh.kind === 'annulus' ? sh.knockback : 0, from: { x: m.pos.x, y: m.pos.y } };
      }
      if (blocked || m.t >= mv.active) {
        m.phase = 'recovery'; m.t = 0;
        m.recoveryDur = moveRecovery(m, mv) + (blocked ? OBSTACLE_RECOVERY_BONUS : 0);
      }
      break;
    }

    case 'recovery':
      if (m.t >= m.recoveryDur) {
        m.phase = 'approach'; m.t = 0; m.move = null;
        m.restDur = m.def.restRange[0] + m.rng() * (m.def.restRange[1] - m.def.restRange[0]);
      }
      break;
  }
  return res;
}

/** Called by the hunt once the hit actually landed (not while the player was invulnerable). */
export const markMonsterHitLanded = (m: MonsterState): void => { m.attackHitPlayer = true; };

export function monsterShapeHits(m: MonsterState, mv: MoveDef, p: Vec): boolean {
  const sh = effectiveShape(m, mv);
  const pr = PLAYER.radius;
  switch (sh.kind) {
    case 'cone': {
      const head = { x: m.pos.x + Math.cos(m.facing) * 80, y: m.pos.y + Math.sin(m.facing) * 80 };
      return sectorHitsCircle(head, m.facing, sh.range, (sh.angleDeg * Math.PI) / 180, p, pr);
    }
    case 'dash': {
      const d = fromAngle(m.facing);
      return circlesOverlap({ x: m.pos.x + d.x * sh.headOffset, y: m.pos.y + d.y * sh.headOffset }, sh.hitRadius, p, pr);
    }
    case 'rear_arc':
      return sectorHitsCircle(m.pos, m.facing + Math.PI, sh.range, (sh.arcDeg * Math.PI) / 180, p, pr);
    case 'target_circle':
      return !!m.lockTarget && circlesOverlap(m.lockTarget, sh.radius, p, pr);
    case 'puddle':
      return false; // hazards deal their own pulses
    case 'annulus': {
      const d = Math.hypot(p.x - m.pos.x, p.y - m.pos.y);
      return d >= sh.inner && d <= sh.outer; // player centre: inner safe zone is reachable only because the body is small (§8.3)
    }
  }
}

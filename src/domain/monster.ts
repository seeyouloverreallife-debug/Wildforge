import { OBSTACLE_RECOVERY_BONUS, STAGGER, type MonsterDef, type MoveDef, type MoveId, type PartId } from '../data/monsters';
import { PLAYER } from '../data/tuning';
import { circlesOverlap, rotate, sectorHitsCircle, wrapPi } from './geometry';
import { createRng } from './rng';
import { fromAngle, type Vec } from './vec';
import { resolveCollisions, type World } from './world';

export type MonsterPhase = 'approach' | 'telegraph' | 'attack' | 'recovery' | 'stagger' | 'dead';

export interface MonsterState {
  def: MonsterDef;
  pos: Vec;
  facing: number;
  hp: number;
  partHp: Record<PartId, number>;
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
  staggerMeter: number;
  sinceHit: number;
  staggerDur: number;
  history: MoveId[];
  rng: () => number;
}

export type MonsterEvent =
  | { type: 'telegraph'; move: MoveId }
  | { type: 'attack'; move: MoveId }
  | { type: 'stagger'; cause: 'part_break' | 'meter' };

export function createMonster(def: MonsterDef, pos: Vec, seed: number): MonsterState {
  const partHp = {} as Record<PartId, number>;
  for (const p of def.parts) partHp[p.id] = p.hp;
  return {
    def, pos: { ...pos }, facing: Math.PI / 2, hp: def.hp, partHp, broken: [],
    phase: 'approach', t: 0, restDur: 1.0, move: null, recoveryDur: 0, attackId: 0, attackHitPlayer: false, dashFrom: null,
    staggerMeter: 0, sinceHit: 0, staggerDur: 0, history: [], rng: createRng(seed),
  };
}

export const partWorldPos = (m: MonsterState, id: PartId): Vec => {
  const p = m.def.parts.find((x) => x.id === id)!;
  const o = rotate(p.offset, m.facing);
  return { x: m.pos.x + o.x, y: m.pos.y + o.y };
};

export function eligibleMoves(m: MonsterState, dist: number): MoveDef[] {
  const removed = new Set<MoveId>();
  for (const b of m.broken) for (const id of m.def.breakEffects[b].removeMoves ?? []) removed.add(id);
  return m.def.moves.filter((mv) => !removed.has(mv.id) && dist >= mv.minRange && dist <= mv.maxRange);
}

export function moveDamage(m: MonsterState, mv: MoveDef): number {
  let d = mv.damage;
  for (const b of m.broken) { const o = m.def.breakEffects[b].damageOverride?.[mv.id]; if (o !== undefined) d = o; }
  return d;
}

export function moveRecovery(m: MonsterState, mv: MoveDef): number {
  let r = mv.recovery;
  for (const b of m.broken) r += m.def.breakEffects[b].recoveryBonus?.[mv.id] ?? 0;
  return r;
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

export function startStagger(m: MonsterState, dur: number, cause: 'part_break' | 'meter', out: MonsterEvent[]): void {
  if (m.phase === 'dead') return;
  if (m.phase === 'stagger') return; // never extend an ongoing stagger
  m.phase = 'stagger'; m.t = 0; m.staggerDur = dur; m.move = null; m.staggerMeter = 0;
  out.push({ type: 'stagger', cause });
}

function turnToward(m: MonsterState, target: number, dt: number, rate: number): void {
  const d = wrapPi(target - m.facing);
  const step = rate * dt;
  m.facing += Math.abs(d) <= step ? d : Math.sign(d) * step;
}

export interface MonsterStepResult { events: MonsterEvent[]; hitPlayer: { damage: number; moveId: MoveId } | null }

export function stepMonster(m: MonsterState, playerPos: Vec, dt: number, world: World): MonsterStepResult {
  const res: MonsterStepResult = { events: [], hitPlayer: null };
  if (m.phase === 'dead') return res;

  m.sinceHit += dt;
  if (m.sinceHit >= STAGGER.decayDelay) m.staggerMeter = Math.max(0, m.staggerMeter - STAGGER.decayPerSec * dt);
  m.t += dt;

  const toPlayer = Math.atan2(playerPos.y - m.pos.y, playerPos.x - m.pos.x);
  const dist = Math.hypot(playerPos.x - m.pos.x, playerPos.y - m.pos.y);

  switch (m.phase) {
    case 'stagger':
      if (m.t >= m.staggerDur) { m.phase = 'approach'; m.t = 0; m.restDur = 0.4; }
      break;

    case 'approach': {
      turnToward(m, toPlayer, dt, 4);
      const stopDist = m.def.bodyRadius + PLAYER.radius + 30;
      if (dist > stopDist) {
        m.pos.x += Math.cos(m.facing) * m.def.approachSpeed * dt;
        m.pos.y += Math.sin(m.facing) * m.def.approachSpeed * dt;
        resolveCollisions(m.pos, m.def.bodyRadius, world);
      }
      if (m.t >= m.restDur) {
        const mv = chooseMove(m, dist);
        if (mv) {
          m.move = mv; m.phase = 'telegraph'; m.t = 0; m.attackHitPlayer = false;
          m.history.push(mv.id); if (m.history.length > 4) m.history.shift();
          res.events.push({ type: 'telegraph', move: mv.id });
        }
      }
      break;
    }

    case 'telegraph': {
      const mv = m.move!;
      if (m.t / mv.telegraph < mv.lockAt) {
        // tail sweep: the head swings away so the tail faces the player
        const aim = mv.shape.kind === 'rear_arc' ? toPlayer + Math.PI : toPlayer;
        turnToward(m, aim, dt, 5);
      }
      if (m.t >= mv.telegraph) {
        m.phase = 'attack'; m.t = 0; m.attackId++; m.attackHitPlayer = false;
        m.dashFrom = { ...m.pos };
        res.events.push({ type: 'attack', move: mv.id });
      }
      break;
    }

    case 'attack': {
      const mv = m.move!;
      const sh = mv.shape;
      let blocked = false;
      if (sh.kind === 'dash') {
        const speed = sh.distance / mv.active;
        const before = { ...m.pos };
        m.pos.x += Math.cos(m.facing) * speed * dt;
        m.pos.y += Math.sin(m.facing) * speed * dt;
        resolveCollisions(m.pos, m.def.bodyRadius, world);
        const moved = Math.hypot(m.pos.x - before.x, m.pos.y - before.y);
        if (moved < speed * dt - 0.5) blocked = true;
      }
      if (!m.attackHitPlayer && monsterShapeHits(m, mv, playerPos)) {
        res.hitPlayer = { damage: moveDamage(m, mv), moveId: mv.id };
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
  const sh = mv.shape;
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
  }
}

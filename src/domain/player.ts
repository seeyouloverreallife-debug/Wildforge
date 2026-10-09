import { ATTACK_WALK_MULT, HURT_INVULN, PLAYER } from '../data/tuning';
import { WEAPONS, type WeaponDef } from '../data/weapons';
import { fromAngle, len, norm, type Vec } from './vec';
import { resolveCollisions, type World } from './world';

/** One frame of player intent. Edge flags are applied on the first fixed step of the frame. */
export interface Intent {
  moveX: number;
  moveY: number;
  /** World-space aim point (mouse only). null → face movement direction. */
  aim: Vec | null;
  attackHeld: boolean;
  attackPressed: boolean;
  dodgePressed: boolean;
}

export const emptyIntent = (): Intent => ({
  moveX: 0, moveY: 0, aim: null, attackHeld: false, attackPressed: false, dodgePressed: false,
});

type BufferedKind = 'attack' | 'dodge';
export type AttackPhase = 'startup' | 'active' | 'recovery';

export interface PlayerState {
  pos: Vec;
  facing: number;
  hp: number;
  stamina: number;
  /** seconds since stamina was last spent */
  staminaIdle: number;
  dodge: { t: number; dir: Vec } | null;
  dodgeCooldown: number;
  attack: { t: number; facing: number; id: number } | null;
  attackCounter: number;
  buffer: { kind: BufferedKind; age: number } | null;
  /** seconds of post-hit invulnerability remaining (§7.1) */
  hurtInvuln: number;
  time: number;
}

export function createPlayer(spawn: Vec): PlayerState {
  return {
    pos: { x: spawn.x, y: spawn.y },
    facing: -Math.PI / 2,
    hp: PLAYER.maxHp,
    stamina: PLAYER.maxStamina,
    staminaIdle: PLAYER.staminaRegenDelay,
    dodge: null,
    dodgeCooldown: 0,
    attack: null,
    attackCounter: 0,
    buffer: null,
    hurtInvuln: 0,
    time: 0,
  };
}

const attackTotal = (w: WeaponDef): number => w.startup + w.active + w.recovery;

export function attackPhase(p: PlayerState, w: WeaponDef = WEAPONS.fang_cleaver): AttackPhase | null {
  if (!p.attack) return null;
  if (p.attack.t < w.startup) return 'startup';
  if (p.attack.t < w.startup + w.active) return 'active';
  return 'recovery';
}

/** Dodge may cancel normal-attack recovery once half of it has elapsed (§7.2). */
function canCancelAttackIntoDodge(p: PlayerState, w: WeaponDef): boolean {
  if (!p.attack) return true;
  return p.attack.t >= w.startup + w.active + w.recovery / 2;
}

export function isInvulnerable(p: PlayerState): boolean {
  if (p.hurtInvuln > 0) return true;
  return !!p.dodge && p.dodge.t >= PLAYER.dodgeInvulnStart && p.dodge.t <= PLAYER.dodgeInvulnEnd;
}

/** Attack sector for hit tests; null unless the active frames are running. */
export function activeAttackShape(p: PlayerState, w: WeaponDef = WEAPONS.fang_cleaver) {
  if (attackPhase(p, w) !== 'active' || !p.attack) return null;
  return { origin: p.pos, facing: p.attack.facing, range: w.range, arcRad: (w.arcDeg * Math.PI) / 180, attackId: p.attack.id };
}

export function stepPlayer(
  p: PlayerState, intent: Intent, dt: number, world: World, weapon: WeaponDef = WEAPONS.fang_cleaver,
): void {
  p.time += dt;
  p.hurtInvuln = Math.max(0, p.hurtInvuln - dt);
  p.dodgeCooldown = Math.max(0, p.dodgeCooldown - dt);
  p.staminaIdle += dt;
  if (p.staminaIdle >= PLAYER.staminaRegenDelay) {
    p.stamina = Math.min(PLAYER.maxStamina, p.stamina + PLAYER.staminaRegenPerSec * dt);
  }

  // Input buffer: one slot, latest press wins, expires after 0.15 s.
  if (p.buffer) {
    p.buffer.age += dt;
    if (p.buffer.age > PLAYER.inputBuffer) p.buffer = null;
  }
  if (intent.dodgePressed) p.buffer = { kind: 'dodge', age: 0 };
  else if (intent.attackPressed) p.buffer = { kind: 'attack', age: 0 };

  const move = { x: intent.moveX, y: intent.moveY };
  const ml = len(move);
  const moveDir = ml > 1 ? norm(move) : move; // analog magnitude kept up to 1
  const hasMove = ml > 0.05;

  // Facing: pointer aim wins; else movement direction. Locked while attacking/dodging.
  if (!p.dodge && !p.attack) {
    if (intent.aim) p.facing = Math.atan2(intent.aim.y - p.pos.y, intent.aim.x - p.pos.x);
    else if (hasMove) p.facing = Math.atan2(move.y, move.x);
  }

  // Consume buffer.
  if (p.buffer?.kind === 'dodge') {
    if (!p.dodge && p.dodgeCooldown <= 0 && p.stamina >= PLAYER.dodgeCost && canCancelAttackIntoDodge(p, weapon)) {
      const dir = hasMove ? norm(move) : fromAngle(p.facing);
      p.attack = null;
      p.dodge = { t: 0, dir };
      p.facing = Math.atan2(dir.y, dir.x);
      p.stamina -= PLAYER.dodgeCost;
      p.staminaIdle = 0;
      p.dodgeCooldown = PLAYER.dodgeCooldown;
      p.buffer = null;
    }
  } else if (p.buffer?.kind === 'attack') {
    if (!p.dodge && !p.attack) { startAttack(p, intent); p.buffer = null; }
  }
  if (intent.attackHeld && !p.dodge && !p.attack) startAttack(p, intent);

  // Movement.
  if (p.dodge) {
    const speed = PLAYER.dodgeDistance / PLAYER.dodgeDuration;
    const stepT = Math.min(dt, PLAYER.dodgeDuration - p.dodge.t);
    p.pos.x += p.dodge.dir.x * speed * stepT;
    p.pos.y += p.dodge.dir.y * speed * stepT;
    p.dodge.t += dt;
    if (p.dodge.t >= PLAYER.dodgeDuration - 1e-9) p.dodge = null;
  } else if (hasMove) {
    const phase = attackPhase(p, weapon);
    const mult = phase ? ATTACK_WALK_MULT[phase] : 1;
    p.pos.x += moveDir.x * PLAYER.walkSpeed * mult * dt;
    p.pos.y += moveDir.y * PLAYER.walkSpeed * mult * dt;
  }
  resolveCollisions(p.pos, PLAYER.radius, world);

  if (p.attack) {
    p.attack.t += dt;
    if (p.attack.t >= attackTotal(weapon) - 1e-9) p.attack = null;
  }
}

function startAttack(p: PlayerState, intent: Intent): void {
  p.attackCounter++;
  let facing = p.facing;
  if (intent.aim) facing = Math.atan2(intent.aim.y - p.pos.y, intent.aim.x - p.pos.x);
  p.facing = facing;
  p.attack = { t: 0, facing, id: p.attackCounter };
}

/** Apply monster damage. Returns damage dealt (0 if invulnerable). Min 1 for a real hit (§9). */
export function damagePlayer(p: PlayerState, amount: number): number {
  if (isInvulnerable(p) || p.hp <= 0) return 0;
  const d = Math.max(1, Math.round(amount));
  p.hp = Math.max(0, p.hp - d);
  p.hurtInvuln = HURT_INVULN;
  return d;
}

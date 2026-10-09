import { ATTACK_WALK_MULT, HURT_INVULN, PLAYER } from '../data/tuning';
import { WEAPONS, type WeaponDef } from '../data/weapons';
import { BASIC_BUILD, type PlayerBuild } from './build';
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
  skillPressed: boolean;
}

export const emptyIntent = (): Intent => ({
  moveX: 0, moveY: 0, aim: null, attackHeld: false, attackPressed: false, dodgePressed: false, skillPressed: false,
});

type BufferedKind = 'attack' | 'dodge' | 'skill';
export type AttackPhase = 'startup' | 'active' | 'recovery';

export interface AttackState {
  t: number; facing: number; id: number;
  kind: 'normal' | 'skill';
  startup: number; active: number; recovery: number;
  cooldownStarted: boolean;
  /** skill effect (zone placement) already fired */
  fired: boolean;
}

export interface PlayerState {
  pos: Vec;
  facing: number;
  hp: number;
  stamina: number;
  /** seconds since stamina was last spent */
  staminaIdle: number;
  dodge: { t: number; dir: Vec } | null;
  dodgeCooldown: number;
  attack: AttackState | null;
  /** seconds until the skill can be used again (starts when the skill reaches its active frames, §9) */
  skillCooldown: number;
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
    skillCooldown: 0,
    attackCounter: 0,
    buffer: null,
    hurtInvuln: 0,
    time: 0,
  };
}

export function attackPhase(p: PlayerState, _w: WeaponDef = WEAPONS.fang_cleaver): AttackPhase | null {
  const a = p.attack;
  if (!a) return null;
  if (a.t < a.startup) return 'startup';
  if (a.t < a.startup + a.active) return 'active';
  return 'recovery';
}

/** Dodge may cancel normal-attack recovery once half of it has elapsed (§7.2). */
function canCancelAttackIntoDodge(p: PlayerState): boolean {
  const a = p.attack;
  if (!a) return true;
  return a.t >= a.startup + a.active + a.recovery / 2;
}

export function isInvulnerable(p: PlayerState): boolean {
  if (p.hurtInvuln > 0) return true;
  return !!p.dodge && p.dodge.t >= PLAYER.dodgeInvulnStart && p.dodge.t <= PLAYER.dodgeInvulnEnd;
}

/** Attack sector for hit tests; null unless the active frames of a hitting attack are running. */
export function activeAttackShape(p: PlayerState, w: WeaponDef = WEAPONS.fang_cleaver, build: PlayerBuild = BASIC_BUILD) {
  if (attackPhase(p) !== 'active' || !p.attack) return null;
  if (p.attack.kind === 'skill' && !build.skill.hit) return null; // e.g. ember: places a zone, no direct hit
  return {
    origin: p.pos, facing: p.attack.facing, range: w.range, arcRad: (w.arcDeg * Math.PI) / 180,
    attackId: p.attack.id, kind: p.attack.kind,
  };
}

export function stepPlayer(
  p: PlayerState, intent: Intent, dt: number, world: World, weapon: WeaponDef = WEAPONS.fang_cleaver, build: PlayerBuild = BASIC_BUILD,
): void {
  p.time += dt;
  p.hurtInvuln = Math.max(0, p.hurtInvuln - dt);
  p.dodgeCooldown = Math.max(0, p.dodgeCooldown - dt);
  p.skillCooldown = Math.max(0, p.skillCooldown - dt);
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
  else if (intent.skillPressed) p.buffer = { kind: 'skill', age: 0 };
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
    if (!p.dodge && p.dodgeCooldown <= 0 && p.stamina >= PLAYER.dodgeCost && canCancelAttackIntoDodge(p)) {
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
    if (!p.dodge && !p.attack) { startAttack(p, intent, weapon); p.buffer = null; }
  } else if (p.buffer?.kind === 'skill') {
    if (!p.dodge && !p.attack && p.skillCooldown <= 0) {
      const cost = Math.max(1, Math.round(build.skill.cost));
      if (p.stamina >= cost) {
        p.stamina -= cost; p.staminaIdle = 0;
        startAttack(p, intent, weapon, build);
        p.buffer = null;
      }
    }
  }
  if (intent.attackHeld && !p.dodge && !p.attack) startAttack(p, intent, weapon);

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
    // cooldown starts when the skill enters its active state (§9)
    if (p.attack.kind === 'skill' && !p.attack.cooldownStarted && p.attack.t >= p.attack.startup) {
      p.attack.cooldownStarted = true;
      p.skillCooldown = build.skill.cooldown;
    }
    if (p.attack.t >= p.attack.startup + p.attack.active + p.attack.recovery - 1e-9) p.attack = null;
  }
}

function startAttack(p: PlayerState, intent: Intent, weapon: WeaponDef, build?: PlayerBuild): void {
  p.attackCounter++;
  let facing = p.facing;
  if (intent.aim) facing = Math.atan2(intent.aim.y - p.pos.y, intent.aim.x - p.pos.x);
  p.facing = facing;
  const skill = build?.skill;
  p.attack = {
    t: 0, facing, id: p.attackCounter, kind: skill ? 'skill' : 'normal',
    startup: skill?.windup ?? weapon.startup, active: weapon.active, recovery: weapon.recovery,
    cooldownStarted: false, fired: false,
  };
}

/** Apply monster damage. Returns damage dealt (0 if invulnerable). Min 1 for a real hit (§9). */
export function damagePlayer(p: PlayerState, amount: number): number {
  if (isInvulnerable(p) || p.hp <= 0) return 0;
  const d = Math.max(1, Math.round(amount));
  p.hp = Math.max(0, p.hp - d);
  p.hurtInvuln = HURT_INVULN;
  return d;
}

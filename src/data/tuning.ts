// Starting values from design doc V1.0 §7.1 / §13. Playtest hypotheses, not proven balance.
export const PLAYER = {
  radius: 20,
  maxHp: 100,
  maxStamina: 100,
  staminaRegenPerSec: 20,
  staminaRegenDelay: 0.8,
  walkSpeed: 220,
  dodgeDistance: 150,
  dodgeDuration: 0.3,
  dodgeCost: 25,
  dodgeCooldown: 0.65,
  dodgeInvulnStart: 0.05,
  dodgeInvulnEnd: 0.22,
  inputBuffer: 0.15,
} as const;

export const SIM = { hz: 60, maxDeltaMs: 100, maxStepsPerFrame: 5 } as const;

export interface CircleObstacle { id: string; x: number; y: number; r: number }

export const ARENA = {
  width: 1600,
  height: 1000,
  spawn: { x: 800, y: 720 },
  rocks: [
    { id: 'rock_a', x: 520, y: 420, r: 60 },
    { id: 'rock_b', x: 1130, y: 560, r: 70 },
  ] as readonly CircleObstacle[],
  /** vine thicket: solid until burned; the control zone is a ring around it (§13) */
  vine: { x: 1250, y: 330, thicketRadius: 40, zoneRadius: 90, interactRange: 170, rootSeconds: 1.5 },
} as const;

export const POTION = { heal: 35, uses: 2, duration: 0.7 } as const;
export const TRAP = { radius: 90, offset: 70, setup: 0.6, life: 15, hpThreshold: 0.25, restrain: 2 } as const;
export const CHANNEL_WALK_MULT = 0.5; // drinking / setting a trap
export const GUARD_WALK_MULT = 0.5;

/** Player speed multiplier while swinging, by attack phase. PROPOSED values (no table was supplied) — tune in playtest. */
export const ATTACK_WALK_MULT = { startup: 0.7, active: 0.4, recovery: 0.85 } as const;

/** Camera shake table: duration ms, intensity at the default slider (0.3). Scaled by slider/0.3, capped. PROPOSED values. */
export const SHAKE_TABLE = {
  dodge: { ms: 80, intensity: 0.0015 },
  hitLanded: { ms: 60, intensity: 0.0015 },
  playerHurt: { ms: 150, intensity: 0.006 },
  partBreak: { ms: 150, intensity: 0.005 },
  monsterStagger: { ms: 100, intensity: 0.003 },
  monsterDeath: { ms: 300, intensity: 0.008 },
  guardHit: { ms: 80, intensity: 0.003 },
  captured: { ms: 200, intensity: 0.004 },
} as const;
export type ShakeKind = keyof typeof SHAKE_TABLE;

export const HURT_INVULN = 0.6; // §7.1 invulnerability after being hit
export const HUNT_TIME_LIMIT = 600; // §7.1 10 minutes
export const SOFT_LOCK_RANGE = 420; // §7.3

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
} as const;

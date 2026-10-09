import { emptyIntent, stepPlayer, type Intent, type PlayerState } from '../src/domain/player';
import type { World } from '../src/domain/world';

export const OPEN_WORLD: World = { width: 3000, height: 3000, obstacles: [] };
export const DT = 1 / 60;

export function run(p: PlayerState, seconds: number, intent: Partial<Intent> | ((i: number) => Partial<Intent>), world: World = OPEN_WORLD): void {
  const n = Math.round(seconds / DT);
  for (let i = 0; i < n; i++) {
    const patch = typeof intent === 'function' ? intent(i) : intent;
    stepPlayer(p, { ...emptyIntent(), ...patch }, DT, world);
  }
}

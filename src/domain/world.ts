import { ARENA, type CircleObstacle } from '../data/tuning';
import type { Vec } from './vec';
import { clamp } from './vec';

export interface World { width: number; height: number; obstacles: readonly CircleObstacle[] }

export const defaultWorld = (): World => ({ width: ARENA.width, height: ARENA.height, obstacles: ARENA.rocks });

/** Push a circle out of obstacles and clamp inside world bounds. Mutates pos. */
export function resolveCollisions(pos: Vec, radius: number, world: World): void {
  for (let pass = 0; pass < 2; pass++) {
    for (const o of world.obstacles) {
      const dx = pos.x - o.x;
      const dy = pos.y - o.y;
      const d = Math.hypot(dx, dy);
      const min = o.r + radius;
      if (d < min) {
        if (d < 1e-6) { pos.x = o.x + min; continue; }
        pos.x = o.x + (dx / d) * min;
        pos.y = o.y + (dy / d) * min;
      }
    }
    pos.x = clamp(pos.x, radius, world.width - radius);
    pos.y = clamp(pos.y, radius, world.height - radius);
  }
}

import type { Vec } from './vec';

export const wrapPi = (a: number): number => {
  const t = Math.PI * 2;
  return ((((a + Math.PI) % t) + t) % t) - Math.PI;
};

/** Does a circular sector (origin, facing, range, full arc) touch circle (c, r)? Approximate at the rim — fine for non pixel-perfect hitboxes. */
export function sectorHitsCircle(o: Vec, facing: number, range: number, arcRad: number, c: Vec, r: number): boolean {
  const dx = c.x - o.x, dy = c.y - o.y, d = Math.hypot(dx, dy);
  if (d > range + r) return false;
  if (d <= r) return true;
  const diff = Math.abs(wrapPi(Math.atan2(dy, dx) - facing));
  return diff <= arcRad / 2 + Math.asin(Math.min(1, r / d));
}

export const circlesOverlap = (a: Vec, ar: number, b: Vec, br: number): boolean =>
  Math.hypot(a.x - b.x, a.y - b.y) < ar + br;

export const rotate = (v: Vec, a: number): Vec => ({ x: v.x * Math.cos(a) - v.y * Math.sin(a), y: v.x * Math.sin(a) + v.y * Math.cos(a) });

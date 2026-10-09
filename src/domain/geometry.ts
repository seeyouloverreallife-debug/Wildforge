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

/** Distance from point p to segment a→b. */
export function distToSegment(p: Vec, a: Vec, b: Vec): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  const t = l2 < 1e-9 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
  return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
}

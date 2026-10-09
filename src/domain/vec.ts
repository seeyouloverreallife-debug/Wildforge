export interface Vec { x: number; y: number }

export const len = (v: Vec): number => Math.hypot(v.x, v.y);

export function norm(v: Vec): Vec {
  const l = len(v);
  return l > 1e-9 ? { x: v.x / l, y: v.y / l } : { x: 0, y: 0 };
}

export const fromAngle = (a: number): Vec => ({ x: Math.cos(a), y: Math.sin(a) });
export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

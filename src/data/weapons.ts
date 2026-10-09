import type { WeaponId } from './content';

export type { WeaponId };

export type WeaponShape =
  | { kind: 'sector'; arcDeg: number; range: number }
  /** narrow thrust: a capsule of `length` along the facing, half-width `halfWidth` */
  | { kind: 'capsule'; length: number; halfWidth: number };

export interface WeaponDef {
  id: WeaponId;
  nameTh: string;
  damage: number;
  startup: number;
  active: number;
  recovery: number;
  shape: WeaponShape;
  /** distance used for the "nearest part to the tip" rule and for drawing */
  reach: number;
}

// Design doc §7.2.
export const WEAPONS: Readonly<Record<WeaponId, WeaponDef>> = {
  fang_cleaver: {
    id: 'fang_cleaver', nameTh: 'ดาบเขี้ยว', damage: 10, startup: 0.18, active: 0.10, recovery: 0.32,
    shape: { kind: 'sector', arcDeg: 100, range: 90 }, reach: 90,
  },
  branch_spear: {
    id: 'branch_spear', nameTh: 'หอกกิ่ง', damage: 9, startup: 0.20, active: 0.10, recovery: 0.35,
    shape: { kind: 'capsule', length: 140, halfWidth: 18 }, reach: 140,
  },
};

export type WeaponId = 'fang_cleaver' | 'branch_spear';

export interface WeaponDef {
  id: WeaponId;
  nameTh: string;
  damage: number;
  startup: number;
  active: number;
  recovery: number;
  /** degrees; sector shape */
  arcDeg: number;
  range: number;
}

// M0 ships only fang_cleaver (branch_spear unlocks in M3).
export const WEAPONS: Readonly<Record<'fang_cleaver', WeaponDef>> = {
  fang_cleaver: {
    id: 'fang_cleaver', nameTh: 'ดาบเขี้ยว', damage: 10,
    startup: 0.18, active: 0.10, recovery: 0.32, arcDeg: 100, range: 90,
  },
};

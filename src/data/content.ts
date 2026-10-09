// Stable IDs and content tables (design doc §19, §9, §12). Tier numbers are playtest hypotheses.
export const MATERIAL_IDS = ['fang', 'heat_bladder', 'shell_scale', 'venom_sac', 'sail_wing', 'blunt_horn'] as const;
export const MODULE_IDS = ['fang', 'ember', 'shell', 'venom', 'wing', 'horn'] as const;
export const WEAPON_IDS = ['fang_cleaver', 'branch_spear'] as const;
export const MONSTER_IDS = ['ember_gecko', 'mire_crab', 'sail_lizard'] as const;
export const MISSION_IDS = ['hunt_gecko', 'hunt_crab', 'capture_gecko', 'hunt_sail', 'capture_crab', 'capture_sail'] as const;

export type MaterialId = (typeof MATERIAL_IDS)[number];
export type ModuleId = (typeof MODULE_IDS)[number];
export type WeaponId = (typeof WEAPON_IDS)[number];
export type MonsterId = (typeof MONSTER_IDS)[number];
export type MissionId = (typeof MISSION_IDS)[number];
export type Tier = 1 | 2;

/** Content playable in this milestone. Shell/venom/wing/horn, spear, crab, sail stay hidden until M3 (§22). */
export const AVAILABLE_MODULES: readonly ModuleId[] = ['fang', 'ember'];
export const AVAILABLE_WEAPONS: readonly WeaponId[] = ['fang_cleaver'];
export const AVAILABLE_MISSIONS: readonly MissionId[] = ['hunt_gecko'];

export const MATERIAL_NAMES_TH: Record<MaterialId, string> = {
  fang: 'เขี้ยว', heat_bladder: 'ถุงความร้อน', shell_scale: 'เกล็ดกระดอง', venom_sac: 'ถุงพิษ', sail_wing: 'ปีกใบเรือ', blunt_horn: 'เขาทู่',
};

export const CRAFT_COST = { craft: 4, upgrade: 6 } as const;

export interface ModuleDef {
  id: ModuleId;
  nameTh: string;
  materialId: MaterialId;
  skill: {
    nameTh: string; cost: number; cooldown: number;
    /** [tier I, tier II] */
    hit?: readonly [number, number];
    bleed?: { dps: readonly [number, number]; duration: number };
    zone?: { radius: number; tick: readonly [number, number]; duration: number; offset: number };
    descTh: string;
  };
  passive: { kind: 'normal_damage' | 'skill_cooldown'; value: readonly [number, number]; descTh: string };
}

export const MODULES: Partial<Record<ModuleId, ModuleDef>> = {
  fang: {
    id: 'fang', nameTh: 'โมดูลเขี้ยว', materialId: 'fang',
    skill: { nameTh: 'ตัดเลือด', cost: 20, cooldown: 6, hit: [15, 16], bleed: { dps: [3, 3.3], duration: 4 }, descTh: 'ฟันแรงแล้วทำให้เลือดไหล 4 วินาที' },
    passive: { kind: 'normal_damage', value: [1.08, 1.1], descTh: 'โจมตีปกติแรงขึ้น' },
  },
  ember: {
    id: 'ember', nameTh: 'โมดูลถุงไฟ', materialId: 'heat_bladder',
    skill: { nameTh: 'ถุงไฟ', cost: 30, cooldown: 10, zone: { radius: 85, tick: [6, 6.6], duration: 3, offset: 100 }, descTh: 'วางพื้นที่ไฟข้างหน้า 3 วินาที' },
    passive: { kind: 'skill_cooldown', value: [0.94, 0.92], descTh: 'สกิลคูลดาวน์เร็วขึ้น' },
  },
};

export const MISSIONS: Record<'hunt_gecko', { id: 'hunt_gecko'; monsterId: 'ember_gecko'; objective: 'hunt'; nameTh: string; allowedTargetMaterials: readonly MaterialId[] }> = {
  hunt_gecko: { id: 'hunt_gecko', monsterId: 'ember_gecko', objective: 'hunt', nameTh: 'ล่ากิ้งก่าถุงไฟ', allowedTargetMaterials: ['heat_bladder', 'fang'] },
};

export const PART_BONUS_MATERIAL = { fire_sac: 'heat_bladder', jaw: 'fang' } as const;
export const BASE_REWARD = 2;
export const CONTENT_VERSION = '0.1.0-m2';
export const SCHEMA_VERSION = 1;

export const isModuleId = (v: unknown): v is ModuleId => typeof v === 'string' && (MODULE_IDS as readonly string[]).includes(v);
export const isMaterialId = (v: unknown): v is MaterialId => typeof v === 'string' && (MATERIAL_IDS as readonly string[]).includes(v);

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

/** M3: every MVP weapon, module and mission is playable. Availability is still gated by unlocks (see UNLOCKS). */
export const AVAILABLE_MODULES: readonly ModuleId[] = MODULE_IDS;
export const AVAILABLE_WEAPONS: readonly WeaponId[] = WEAPON_IDS;
export const AVAILABLE_MISSIONS: readonly MissionId[] = MISSION_IDS;

export const MATERIAL_NAMES_TH: Record<MaterialId, string> = {
  fang: 'เขี้ยว', heat_bladder: 'ถุงความร้อน', shell_scale: 'เกล็ดกระดอง', venom_sac: 'ถุงพิษ', sail_wing: 'ปีกใบเรือ', blunt_horn: 'เขาทู่',
};
export const WEAPON_NAMES_TH: Record<WeaponId, string> = { fang_cleaver: 'ดาบเขี้ยว', branch_spear: 'หอกกิ่ง' };

export const CRAFT_COST = { craft: 4, upgrade: 6 } as const;

type Pair = readonly [number, number];
export interface SkillConfig {
  nameTh: string; cost: number; cooldown: number; descTh: string;
  /** seconds before the active frames; omitted → weapon startup */
  windup?: number;
  hit?: { damage: Pair; stagger: Pair | number; partMult?: number; bodyOnly?: boolean; shape: 'weapon' | 'cone' | 'dash'; cone?: { range: number; angleDeg: number } };
  dash?: { distance: Pair; duration: number };
  dot?: { source: 'bleed' | 'poison'; dps: Pair; duration: number };
  zone?: { radius: number; tick: Pair; duration: number; offset: number };
  guard?: { duration: number; reduction: Pair; counterDamage: Pair };
}
export type PassiveKind = 'normal_damage' | 'skill_cooldown' | 'damage_taken' | 'skill_cost' | 'move_speed' | 'part_damage';
export interface ModuleDef { id: ModuleId; nameTh: string; materialId: MaterialId; skill: SkillConfig; passive: { kind: PassiveKind; value: Pair; descTh: string } }

// Design doc §9. Tier values are [I, II].
export const MODULES: Record<ModuleId, ModuleDef> = {
  fang: {
    id: 'fang', nameTh: 'โมดูลเขี้ยว', materialId: 'fang',
    skill: { nameTh: 'ตัดเลือด', cost: 20, cooldown: 6, descTh: 'ฟันแรงแล้วทำให้เลือดไหล 4 วินาที',
      hit: { damage: [15, 16], stagger: 5, shape: 'weapon' }, dot: { source: 'bleed', dps: [3, 3.3], duration: 4 } },
    passive: { kind: 'normal_damage', value: [1.08, 1.1], descTh: 'โจมตีปกติแรงขึ้น' },
  },
  ember: {
    id: 'ember', nameTh: 'โมดูลถุงไฟ', materialId: 'heat_bladder',
    skill: { nameTh: 'ถุงไฟ', cost: 30, cooldown: 10, descTh: 'วางพื้นที่ไฟข้างหน้า 3 วินาที', zone: { radius: 85, tick: [6, 6.6], duration: 3, offset: 100 } },
    passive: { kind: 'skill_cooldown', value: [0.94, 0.92], descTh: 'สกิลคูลดาวน์เร็วขึ้น' },
  },
  shell: {
    id: 'shell', nameTh: 'โมดูลเกราะ', materialId: 'shell_scale',
    skill: { nameTh: 'เกราะสวน', cost: 25, cooldown: 9, windup: 0, descTh: 'ตั้งการ์ด 0.8 วินาที ลดดาเมจฮิตแรกที่รับจากด้านหน้า แล้วสวนกลับ',
      guard: { duration: 0.8, reduction: [0.7, 0.77], counterDamage: [20, 22] } },
    passive: { kind: 'damage_taken', value: [0.92, 0.9], descTh: 'ดาเมจที่รับลดลง' },
  },
  venom: {
    id: 'venom', nameTh: 'โมดูลพิษ', materialId: 'venom_sac',
    skill: { nameTh: 'พ่นพิษ', cost: 30, cooldown: 10, descTh: 'พ่นพิษเป็นรูปกรวย ติดพิษ 6 วินาที',
      hit: { damage: [5, 5], stagger: 5, bodyOnly: true, shape: 'cone', cone: { range: 150, angleDeg: 60 } }, dot: { source: 'poison', dps: [4, 4.4], duration: 6 } },
    passive: { kind: 'skill_cost', value: [0.92, 0.9], descTh: 'สกิลใช้แรงน้อยลง' },
  },
  wing: {
    id: 'wing', nameTh: 'โมดูลปีก', materialId: 'sail_wing',
    skill: { nameTh: 'พุ่งลม', cost: 25, cooldown: 8, windup: 0, descTh: 'พุ่งไปข้างหน้า ชนศัตรูระหว่างทาง (ไม่มี i-frame)',
      hit: { damage: [12, 12], stagger: 5, shape: 'dash' }, dash: { distance: [210, 230], duration: 0.35 } },
    passive: { kind: 'move_speed', value: [1.08, 1.1], descTh: 'เดินเร็วขึ้น' },
  },
  horn: {
    id: 'horn', nameTh: 'โมดูลเขา', materialId: 'blunt_horn',
    skill: { nameTh: 'กระแทกเขา', cost: 30, cooldown: 9, windup: 0.45, descTh: 'ฟาดหนักเล็งอวัยวะ ดาเมจอวัยวะ ×2 สะสม stagger มาก',
      hit: { damage: [20, 22], stagger: [30, 33], partMult: 2, shape: 'weapon' } },
    passive: { kind: 'part_damage', value: [1.15, 1.18], descTh: 'ดาเมจอวัยวะมากขึ้น' },
  },
};

export type Objective = 'hunt' | 'capture';
export interface MissionDef { id: MissionId; monsterId: MonsterId; objective: Objective; nameTh: string }
export const MISSIONS: Record<MissionId, MissionDef> = {
  hunt_gecko: { id: 'hunt_gecko', monsterId: 'ember_gecko', objective: 'hunt', nameTh: 'ล่ากิ้งก่าถุงไฟ' },
  capture_gecko: { id: 'capture_gecko', monsterId: 'ember_gecko', objective: 'capture', nameTh: 'จับกิ้งก่าถุงไฟ' },
  hunt_crab: { id: 'hunt_crab', monsterId: 'mire_crab', objective: 'hunt', nameTh: 'ล่าปูเกราะพิษ' },
  capture_crab: { id: 'capture_crab', monsterId: 'mire_crab', objective: 'capture', nameTh: 'จับปูเกราะพิษ' },
  hunt_sail: { id: 'hunt_sail', monsterId: 'sail_lizard', objective: 'hunt', nameTh: 'ล่ากิ้งก่าปีกลม' },
  capture_sail: { id: 'capture_sail', monsterId: 'sail_lizard', objective: 'capture', nameTh: 'จับกิ้งก่าปีกลม' },
};
export const START_MISSIONS: readonly MissionId[] = ['hunt_gecko'];

/** First *hunt* clear of a monster unlocks these (§11.1). Capturing never unlocks hunt content. */
export const FIRST_CLEAR_UNLOCKS: Record<MonsterId, { missions: readonly MissionId[]; weapons: readonly WeaponId[] }> = {
  ember_gecko: { missions: ['hunt_crab', 'capture_gecko'], weapons: ['branch_spear'] },
  mire_crab: { missions: ['hunt_sail', 'capture_crab'], weapons: [] },
  sail_lizard: { missions: ['capture_sail'], weapons: [] },
};
export const UNLOCK_LABELS_TH: Record<string, string> = {
  hunt_crab: 'ภารกิจล่าปูเกราะพิษ', capture_gecko: 'ภารกิจจับกิ้งก่าถุงไฟ', branch_spear: 'อาวุธ: หอกกิ่ง',
  hunt_sail: 'ภารกิจล่ากิ้งก่าปีกลม', capture_crab: 'ภารกิจจับปูเกราะพิษ', capture_sail: 'ภารกิจจับกิ้งก่าปีกลม',
};
/** A recipe appears once the mission that drops its material is unlocked (no shell recipe before the crab, §22). */
export const RECIPE_SOURCE_MISSION: Record<ModuleId, MissionId> = {
  fang: 'hunt_gecko', ember: 'hunt_gecko', shell: 'hunt_crab', venom: 'hunt_crab', wing: 'hunt_sail', horn: 'hunt_sail',
};

export const BASE_REWARD = 2;
export const CONTENT_VERSION = '0.1.0-m3';
export const SCHEMA_VERSION = 1;

export const isModuleId = (v: unknown): v is ModuleId => typeof v === 'string' && (MODULE_IDS as readonly string[]).includes(v);
export const isMaterialId = (v: unknown): v is MaterialId => typeof v === 'string' && (MATERIAL_IDS as readonly string[]).includes(v);

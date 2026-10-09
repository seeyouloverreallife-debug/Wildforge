import {
  CONTENT_VERSION, START_MISSIONS, MATERIAL_IDS, MISSION_IDS, MONSTER_IDS, SCHEMA_VERSION, WEAPON_IDS,
  isModuleId, type MaterialId, type MissionId, type ModuleId, type MonsterId, type Tier, type WeaponId,
} from '../data/content';

export interface BestiaryEntry {
  hunts: number;
  /** hunt-objective wins (drive first-clear unlocks) */
  clears: number;
  captures: number;
  bestTimeHunt: number | null;
  bestTimeCapture: number | null;
  movesSeen: string[];
  partsBroken: string[];
}

export interface PendingHunt { huntId: string; missionId: MissionId; targetMaterialId: MaterialId; startedAt: string }

export interface SaveData {
  schemaVersion: number;
  contentVersion: string;
  materials: Record<MaterialId, number>;
  modules: Partial<Record<ModuleId, { tier: Tier }>>;
  loadout: { weaponId: WeaponId; primaryModuleId: ModuleId | null; secondaryModuleId: ModuleId | null };
  unlockedWeaponIds: WeaponId[];
  unlockedMissionIds: MissionId[];
  research: number;
  bestiary: Partial<Record<MonsterId, BestiaryEntry>>;
  pinnedRecipeId: ModuleId | null;
  pendingHunt: PendingHunt | null;
  lastSettlementId: string | null;
}

export function newSave(): SaveData {
  const materials = {} as Record<MaterialId, number>;
  for (const id of MATERIAL_IDS) materials[id] = 0;
  return {
    schemaVersion: SCHEMA_VERSION, contentVersion: CONTENT_VERSION, materials, modules: {},
    loadout: { weaponId: 'fang_cleaver', primaryModuleId: null, secondaryModuleId: null },
    unlockedWeaponIds: ['fang_cleaver'], unlockedMissionIds: [...START_MISSIONS], research: 0, bestiary: {},
    pinnedRecipeId: null, pendingHunt: null, lastSettlementId: null,
  };
}

export const cloneSave = (s: SaveData): SaveData => JSON.parse(JSON.stringify(s)) as SaveData;

export type Validation = { ok: true; data: SaveData } | { ok: false; reason: string };
const fail = (reason: string): Validation => ({ ok: false, reason });
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 1_000_000;
const isTime = (v: unknown): boolean => v === null || (typeof v === 'number' && Number.isFinite(v) && v >= 0);
const known = <T extends string>(list: readonly T[], v: unknown): v is T => typeof v === 'string' && (list as readonly string[]).includes(v);

/** Strict validation (§19). Unknown IDs, bad counts or future schemas are rejected with a reason — never silently dropped. */
export function validateSave(raw: unknown): Validation {
  if (!isObj(raw)) return fail('ข้อมูลไม่ใช่ออบเจ็กต์');
  if (typeof raw.schemaVersion !== 'number') return fail('ไม่มี schemaVersion');
  if (raw.schemaVersion > SCHEMA_VERSION) return fail(`เซฟนี้มาจากเกมรุ่นใหม่กว่า (schema ${raw.schemaVersion})`);
  if (raw.schemaVersion !== SCHEMA_VERSION) return fail(`ไม่รู้จัก schema ${raw.schemaVersion}`);

  if (!isObj(raw.materials)) return fail('ไม่มี materials');
  for (const k of Object.keys(raw.materials)) if (!known(MATERIAL_IDS, k)) return fail(`วัสดุที่ไม่รู้จัก: ${k}`);
  const materials = {} as Record<MaterialId, number>;
  for (const id of MATERIAL_IDS) {
    const v = raw.materials[id];
    if (!isCount(v)) return fail(`จำนวนวัสดุ ${id} ไม่ถูกต้อง`);
    materials[id] = v;
  }

  if (!isObj(raw.modules)) return fail('ไม่มี modules');
  const modules: SaveData['modules'] = {};
  for (const [k, v] of Object.entries(raw.modules)) {
    if (!isModuleId(k)) return fail(`โมดูลที่ไม่รู้จัก: ${k}`);
    if (!isObj(v) || (v.tier !== 1 && v.tier !== 2)) return fail(`tier ของโมดูล ${k} ต้องเป็น 1 หรือ 2`);
    modules[k] = { tier: v.tier };
  }

  const lo = raw.loadout;
  if (!isObj(lo)) return fail('ไม่มี loadout');
  if (!known(WEAPON_IDS, lo.weaponId)) return fail(`อาวุธที่ไม่รู้จัก: ${String(lo.weaponId)}`);
  for (const key of ['primaryModuleId', 'secondaryModuleId'] as const) {
    const v = lo[key];
    if (v !== null && !isModuleId(v)) return fail(`โมดูลใน loadout ไม่รู้จัก: ${String(v)}`);
    if (v !== null && !modules[v as ModuleId]) return fail(`ติดตั้งโมดูลที่ไม่ได้ครอบครอง: ${String(v)}`);
  }
  if (lo.primaryModuleId !== null && lo.primaryModuleId === lo.secondaryModuleId) return fail('ติดโมดูลเดียวกันสองช่องไม่ได้');

  if (!Array.isArray(raw.unlockedWeaponIds) || !raw.unlockedWeaponIds.every((x) => known(WEAPON_IDS, x))) return fail('unlockedWeaponIds ไม่ถูกต้อง');
  if (!raw.unlockedWeaponIds.includes(lo.weaponId)) return fail('อาวุธใน loadout ยังไม่ปลดล็อก');
  if (!Array.isArray(raw.unlockedMissionIds) || !raw.unlockedMissionIds.every((x) => known(MISSION_IDS, x))) return fail('unlockedMissionIds ไม่ถูกต้อง');
  if (!isCount(raw.research)) return fail('research ไม่ถูกต้อง');

  if (!isObj(raw.bestiary)) return fail('ไม่มี bestiary');
  const bestiary: SaveData['bestiary'] = {};
  for (const [k, v] of Object.entries(raw.bestiary)) {
    if (!known(MONSTER_IDS, k)) return fail(`สัตว์ที่ไม่รู้จักในสมุด: ${k}`);
    if (!isObj(v) || !isCount(v.hunts) || !isCount(v.clears) || !Array.isArray(v.movesSeen) || !Array.isArray(v.partsBroken)
      || !isTime(v.bestTimeHunt) || !v.movesSeen.every((x) => typeof x === 'string') || !v.partsBroken.every((x) => typeof x === 'string')) return fail(`ข้อมูลสมุด ${k} ไม่ถูกต้อง`);
    // M2 saves have no capture fields: migrate with defaults instead of rejecting
    const captures = v.captures === undefined ? 0 : v.captures;
    const bestTimeCapture = v.bestTimeCapture === undefined ? null : v.bestTimeCapture;
    if (!isCount(captures) || !isTime(bestTimeCapture)) return fail(`ข้อมูลสมุด ${k} ไม่ถูกต้อง`);
    bestiary[k] = {
      hunts: v.hunts, clears: v.clears, captures, bestTimeHunt: v.bestTimeHunt as number | null, bestTimeCapture: bestTimeCapture as number | null,
      movesSeen: [...(v.movesSeen as string[])], partsBroken: [...(v.partsBroken as string[])],
    };
  }

  const pin = raw.pinnedRecipeId;
  if (pin !== null && !isModuleId(pin)) return fail('pinnedRecipeId ไม่ถูกต้อง');

  let pendingHunt: PendingHunt | null = null;
  if (raw.pendingHunt !== null) {
    const p = raw.pendingHunt;
    if (!isObj(p) || typeof p.huntId !== 'string' || !known(MISSION_IDS, p.missionId) || !known(MATERIAL_IDS, p.targetMaterialId) || typeof p.startedAt !== 'string') return fail('pendingHunt ไม่ถูกต้อง');
    pendingHunt = { huntId: p.huntId, missionId: p.missionId, targetMaterialId: p.targetMaterialId, startedAt: p.startedAt };
  }
  if (raw.lastSettlementId !== null && typeof raw.lastSettlementId !== 'string') return fail('lastSettlementId ไม่ถูกต้อง');

  return {
    ok: true,
    data: {
      schemaVersion: SCHEMA_VERSION, contentVersion: typeof raw.contentVersion === 'string' ? raw.contentVersion : CONTENT_VERSION,
      materials, modules,
      loadout: { weaponId: lo.weaponId, primaryModuleId: lo.primaryModuleId as ModuleId | null, secondaryModuleId: lo.secondaryModuleId as ModuleId | null },
      unlockedWeaponIds: [...raw.unlockedWeaponIds] as WeaponId[], unlockedMissionIds: [...raw.unlockedMissionIds] as MissionId[],
      research: raw.research, bestiary, pinnedRecipeId: pin as ModuleId | null, pendingHunt, lastSettlementId: raw.lastSettlementId as string | null,
    },
  };
}

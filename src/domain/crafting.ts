import { CRAFT_COST, MODULES, WEAPON_IDS, type ModuleId, type WeaponId } from '../data/content';
import { cloneSave, type SaveData } from './save';
import { recipeUnlocked } from './unlocks';

export type Tx<T = SaveData> = { ok: true; save: T } | { ok: false; error: string };

export interface CraftInfo {
  moduleId: ModuleId;
  action: 'craft' | 'upgrade' | 'maxed';
  cost: number;
  have: number;
  enough: boolean;
  missing: number;
}

export function craftInfo(save: SaveData, id: ModuleId): CraftInfo {
  const def = MODULES[id];
  const owned = save.modules[id];
  const have = save.materials[def.materialId];
  if (owned?.tier === 2) return { moduleId: id, action: 'maxed', cost: 0, have, enough: false, missing: 0 };
  const action = owned ? 'upgrade' : 'craft';
  const cost = owned ? CRAFT_COST.upgrade : CRAFT_COST.craft;
  return { moduleId: id, action, cost, have, enough: have >= cost, missing: Math.max(0, cost - have) };
}

/** Craft tier I or upgrade I→II: one pure transaction (materials and module change together). */
export function craftOrUpgrade(save: SaveData, id: ModuleId): Tx {
  if (!MODULES[id]) return { ok: false, error: 'ไม่รู้จักโมดูลนี้' };
  if (!recipeUnlocked(save, id)) return { ok: false, error: 'สูตรนี้ยังไม่เปิด' };
  const info = craftInfo(save, id);
  if (info.action === 'maxed') return { ok: false, error: 'โมดูลอยู่ระดับสูงสุดแล้ว' };
  if (!info.enough) return { ok: false, error: `วัสดุไม่พอ: มี ${info.have}/${info.cost}` };
  const next = cloneSave(save);
  next.materials[MODULES[id].materialId] = info.have - info.cost;
  next.modules[id] = { tier: info.action === 'craft' ? 1 : 2 };
  return { ok: true, save: next };
}

export function setLoadout(save: SaveData, primary: ModuleId | null, secondary: ModuleId | null): Tx {
  for (const m of [primary, secondary]) {
    if (m === null) continue;
    if (!MODULES[m]) return { ok: false, error: 'ไม่รู้จักโมดูลนี้' };
    if (!save.modules[m]) return { ok: false, error: 'ยังไม่ได้สร้างโมดูลนี้' };
  }
  if (primary !== null && primary === secondary) return { ok: false, error: 'ติดโมดูลเดียวกันสองช่องไม่ได้' };
  const next = cloneSave(save);
  next.loadout.primaryModuleId = primary;
  next.loadout.secondaryModuleId = secondary;
  return { ok: true, save: next };
}

export function setWeapon(save: SaveData, id: WeaponId): Tx {
  if (!(WEAPON_IDS as readonly string[]).includes(id)) return { ok: false, error: 'ไม่รู้จักอาวุธนี้' };
  if (!save.unlockedWeaponIds.includes(id)) return { ok: false, error: 'อาวุธนี้ยังไม่ปลดล็อก' };
  const next = cloneSave(save);
  next.loadout.weaponId = id;
  return { ok: true, save: next };
}

export function pinRecipe(save: SaveData, id: ModuleId | null): Tx {
  if (id !== null && (!MODULES[id] || !recipeUnlocked(save, id))) return { ok: false, error: 'สูตรนี้ยังไม่เปิด' };
  const next = cloneSave(save);
  next.pinnedRecipeId = id;
  return { ok: true, save: next };
}

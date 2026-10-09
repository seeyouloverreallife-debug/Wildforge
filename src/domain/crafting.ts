import { AVAILABLE_MODULES, CRAFT_COST, MODULES, type ModuleId } from '../data/content';
import { cloneSave, type SaveData } from './save';

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
  const def = MODULES[id]!;
  const owned = save.modules[id];
  const have = save.materials[def.materialId];
  if (owned?.tier === 2) return { moduleId: id, action: 'maxed', cost: 0, have, enough: false, missing: 0 };
  const action = owned ? 'upgrade' : 'craft';
  const cost = owned ? CRAFT_COST.upgrade : CRAFT_COST.craft;
  return { moduleId: id, action, cost, have, enough: have >= cost, missing: Math.max(0, cost - have) };
}

/** Craft tier I or upgrade I→II: one pure transaction (materials and module change together). */
export function craftOrUpgrade(save: SaveData, id: ModuleId): Tx {
  if (!AVAILABLE_MODULES.includes(id) || !MODULES[id]) return { ok: false, error: 'โมดูลนี้ยังไม่เปิด' };
  const info = craftInfo(save, id);
  if (info.action === 'maxed') return { ok: false, error: 'โมดูลอยู่ระดับสูงสุดแล้ว' };
  if (!info.enough) return { ok: false, error: `วัสดุไม่พอ: มี ${info.have}/${info.cost}` };
  const next = cloneSave(save);
  const mat = MODULES[id]!.materialId;
  next.materials[mat] = info.have - info.cost;
  next.modules[id] = { tier: info.action === 'craft' ? 1 : 2 };
  return { ok: true, save: next };
}

export function setLoadout(save: SaveData, primary: ModuleId | null, secondary: ModuleId | null): Tx {
  for (const m of [primary, secondary]) {
    if (m === null) continue;
    if (!AVAILABLE_MODULES.includes(m)) return { ok: false, error: 'โมดูลนี้ยังไม่เปิด' };
    if (!save.modules[m]) return { ok: false, error: 'ยังไม่ได้สร้างโมดูลนี้' };
  }
  if (primary !== null && primary === secondary) return { ok: false, error: 'ติดโมดูลเดียวกันสองช่องไม่ได้' };
  const next = cloneSave(save);
  next.loadout.primaryModuleId = primary;
  next.loadout.secondaryModuleId = secondary;
  return { ok: true, save: next };
}

export function pinRecipe(save: SaveData, id: ModuleId | null): Tx {
  if (id !== null && !AVAILABLE_MODULES.includes(id)) return { ok: false, error: 'โมดูลนี้ยังไม่เปิด' };
  const next = cloneSave(save);
  next.pinnedRecipeId = id;
  return { ok: true, save: next };
}

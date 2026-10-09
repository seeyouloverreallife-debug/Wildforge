import { FIRST_CLEAR_UNLOCKS, MODULE_IDS, MONSTER_IDS, RECIPE_SOURCE_MISSION, type ModuleId } from '../data/content';
import { cloneSave, type SaveData } from './save';

/**
 * Derive every unlock the player is entitled to from first-clear records (§11.1, §22).
 * Pure and idempotent: safe to run on load, so an M2 save that already cleared the gecko gets the crab, the spear and
 * the capture mission without replaying anything and without paying first-clear rewards again.
 */
export function recomputeUnlocks(save: SaveData): { save: SaveData; added: string[] } {
  const next = cloneSave(save);
  const added: string[] = [];
  for (const m of MONSTER_IDS) {
    if ((next.bestiary[m]?.clears ?? 0) <= 0) continue;
    for (const id of FIRST_CLEAR_UNLOCKS[m].missions) if (!next.unlockedMissionIds.includes(id)) { next.unlockedMissionIds.push(id); added.push(id); }
    for (const id of FIRST_CLEAR_UNLOCKS[m].weapons) if (!next.unlockedWeaponIds.includes(id)) { next.unlockedWeaponIds.push(id); added.push(id); }
  }
  return { save: added.length ? next : save, added };
}

/** A recipe shows up once the mission that drops its material is unlocked. */
export const recipeUnlocked = (save: SaveData, id: ModuleId): boolean => save.unlockedMissionIds.includes(RECIPE_SOURCE_MISSION[id]);
export const unlockedRecipes = (save: SaveData): ModuleId[] => MODULE_IDS.filter((m) => recipeUnlocked(save, m));

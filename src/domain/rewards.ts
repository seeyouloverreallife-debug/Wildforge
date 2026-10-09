import { BASE_REWARD, MISSIONS, PART_BONUS_MATERIAL, type MaterialId, type MissionId } from '../data/content';
import type { PartId } from '../data/monsters';
import type { HuntResult } from './hunt';
import { cloneSave, type BestiaryEntry, type SaveData } from './save';

export interface RewardSummary {
  settlementId: string;
  huntId: string;
  objectiveOutcome: 'success' | 'failed' | 'abandoned';
  baseMaterial: { id: MaterialId; count: number } | null;
  partBonuses: { partId: PartId; materialId: MaterialId; count: number }[];
  research: number;
  firstClearUnlocks: string[];
  elapsed: number;
}

export interface HuntContext { missionId: MissionId; targetMaterialId: MaterialId }

export type Settlement =
  | { kind: 'settled'; save: SaveData; summary: RewardSummary }
  /** same huntId was already settled — nothing is paid twice */
  | { kind: 'duplicate'; save: SaveData };

/**
 * Pure, idempotent settlement (§11.3). Success pays: 2 × target material, +1 per broken part, +1 research.
 * Failed / abandoned pay nothing, but non-reward observations (moves seen, parts broken) are still recorded (§16).
 */
export function settleHunt(save: SaveData, result: HuntResult, ctx: HuntContext): Settlement {
  if (save.lastSettlementId === result.huntId) return { kind: 'duplicate', save };
  const mission = MISSIONS[ctx.missionId as 'hunt_gecko'];
  const next = cloneSave(save);
  const summary: RewardSummary = {
    settlementId: result.huntId, huntId: result.huntId, objectiveOutcome: result.outcome,
    baseMaterial: null, partBonuses: [], research: 0, firstClearUnlocks: [], elapsed: result.elapsed,
  };

  const key = mission.monsterId;
  const entry: BestiaryEntry = next.bestiary[key] ?? { hunts: 0, clears: 0, bestTimeHunt: null, movesSeen: [], partsBroken: [] };
  for (const m of result.movesSeen) if (!entry.movesSeen.includes(m)) entry.movesSeen.push(m);
  for (const p of result.brokenPartIds) if (!entry.partsBroken.includes(p)) entry.partsBroken.push(p);

  if (result.outcome !== 'abandoned') entry.hunts += 1;
  if (result.outcome === 'success' && mission.allowedTargetMaterials.includes(ctx.targetMaterialId)) {
    next.materials[ctx.targetMaterialId] += BASE_REWARD;
    summary.baseMaterial = { id: ctx.targetMaterialId, count: BASE_REWARD };
    for (const p of result.brokenPartIds) {
      const mat = PART_BONUS_MATERIAL[p];
      next.materials[mat] += 1;
      summary.partBonuses.push({ partId: p, materialId: mat, count: 1 });
    }
    next.research += 1;
    summary.research = 1;
    entry.clears += 1;
    if (entry.bestTimeHunt === null || result.elapsed < entry.bestTimeHunt) entry.bestTimeHunt = result.elapsed;
  }
  next.bestiary[key] = entry;
  next.pendingHunt = null;
  next.lastSettlementId = result.huntId;
  return { kind: 'settled', save: next, summary };
}

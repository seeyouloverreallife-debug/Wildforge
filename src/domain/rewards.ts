import { BASE_REWARD, MISSIONS, type MaterialId, type MissionId, type Objective } from '../data/content';
import { MONSTERS, type PartId } from '../data/monsters';
import type { HuntResult } from './hunt';
import { cloneSave, type BestiaryEntry, type SaveData } from './save';
import { recomputeUnlocks } from './unlocks';

export interface RewardSummary {
  settlementId: string;
  huntId: string;
  objective: Objective;
  objectiveOutcome: 'success' | 'failed' | 'abandoned';
  captured: boolean;
  baseMaterial: { id: MaterialId; count: number } | null;
  partBonuses: { partId: PartId; materialId: MaterialId; count: number }[];
  research: number;
  firstClearUnlocks: string[];
  firstCapture: boolean;
  elapsed: number;
}

export interface HuntContext { missionId: MissionId; targetMaterialId: MaterialId }

export type Settlement =
  | { kind: 'settled'; save: SaveData; summary: RewardSummary }
  /** same huntId was already settled — nothing is paid twice */
  | { kind: 'duplicate'; save: SaveData };

/**
 * Pure, idempotent settlement (§11.3). Success pays 2 × the chosen target material, +1 per broken part and Research
 * (1, or 2 when captured). A hunt mission needs the monster dead, a capture mission needs it captured alive.
 * Failed / abandoned pay nothing but still record observations (moves seen, parts broken) (§16).
 */
export function settleHunt(save: SaveData, result: HuntResult, ctx: HuntContext): Settlement {
  if (save.lastSettlementId === result.huntId) return { kind: 'duplicate', save };
  const mission = MISSIONS[ctx.missionId];
  const def = MONSTERS[mission.monsterId];
  const next = cloneSave(save);
  const summary: RewardSummary = {
    settlementId: result.huntId, huntId: result.huntId, objective: mission.objective, objectiveOutcome: result.outcome, captured: result.captured,
    baseMaterial: null, partBonuses: [], research: 0, firstClearUnlocks: [], firstCapture: false, elapsed: result.elapsed,
  };

  const entry: BestiaryEntry = next.bestiary[def.id] ?? { hunts: 0, clears: 0, captures: 0, bestTimeHunt: null, bestTimeCapture: null, movesSeen: [], partsBroken: [] };
  for (const m of result.movesSeen) if (!entry.movesSeen.includes(m)) entry.movesSeen.push(m);
  for (const p of result.brokenPartIds) if (!entry.partsBroken.includes(p)) entry.partsBroken.push(p);
  if (result.outcome !== 'abandoned') entry.hunts += 1;

  const objectiveMet = result.outcome === 'success' && (mission.objective === 'hunt' || result.captured);
  if (objectiveMet && def.materials.includes(ctx.targetMaterialId)) {
    next.materials[ctx.targetMaterialId] += BASE_REWARD;
    summary.baseMaterial = { id: ctx.targetMaterialId, count: BASE_REWARD };
    for (const pid of result.brokenPartIds) {
      const mat = def.parts.find((p) => p.id === pid)!.bonusMaterialId;
      next.materials[mat] += 1;
      summary.partBonuses.push({ partId: pid, materialId: mat, count: 1 });
    }
    summary.research = mission.objective === 'capture' ? 2 : 1;
    next.research += summary.research;
    if (mission.objective === 'hunt') {
      entry.clears += 1;
      if (entry.bestTimeHunt === null || result.elapsed < entry.bestTimeHunt) entry.bestTimeHunt = result.elapsed;
    } else {
      summary.firstCapture = entry.captures === 0;
      entry.captures += 1;
      if (entry.bestTimeCapture === null || result.elapsed < entry.bestTimeCapture) entry.bestTimeCapture = result.elapsed;
    }
  }
  next.bestiary[def.id] = entry;
  next.pendingHunt = null;
  next.lastSettlementId = result.huntId;

  const unlocked = recomputeUnlocks(next);
  summary.firstClearUnlocks = unlocked.added;
  return { kind: 'settled', save: unlocked.save, summary };
}

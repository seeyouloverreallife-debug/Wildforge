import { MODULES, type ModuleId, type Tier } from '../data/content';
import type { SaveData } from './save';

export interface ResolvedSkill {
  id: 'focus' | ModuleId;
  nameTh: string;
  cost: number;
  cooldown: number;
  windup: number | null; // null → weapon startup
  hit: { damage: number; stagger: number } | null;
  bleed: { dps: number; duration: number } | null;
  zone: { radius: number; tick: number; duration: number; offset: number } | null;
}

export interface PlayerBuild {
  skill: ResolvedSkill;
  normalDamageMult: number;
  primary: { id: ModuleId; tier: Tier } | null;
  secondary: { id: ModuleId; tier: Tier } | null;
}

/** No primary module → Focus Strike (§7.2). */
export const FOCUS_STRIKE: ResolvedSkill = {
  id: 'focus', nameTh: 'โฟกัสสไตรค์', cost: 20, cooldown: 6, windup: 0.35, hit: { damage: 18, stagger: 8 }, bleed: null, zone: null,
};

export const BASIC_BUILD: PlayerBuild = { skill: FOCUS_STRIKE, normalDamageMult: 1, primary: null, secondary: null };

export function resolveBuild(save: Pick<SaveData, 'loadout' | 'modules'>): PlayerBuild {
  const { primaryModuleId, secondaryModuleId } = save.loadout;
  const tierOf = (id: ModuleId | null) => (id && save.modules[id] ? { id, tier: save.modules[id]!.tier } : null);
  const primary = tierOf(primaryModuleId), secondary = tierOf(secondaryModuleId);

  let skill: ResolvedSkill = FOCUS_STRIKE;
  const pdef = primary ? MODULES[primary.id] : undefined;
  if (primary && pdef) {
    const i = primary.tier - 1, s = pdef.skill;
    skill = {
      id: primary.id, nameTh: s.nameTh, cost: s.cost, cooldown: s.cooldown, windup: null,
      hit: s.hit ? { damage: s.hit[i]!, stagger: 5 } : null,
      bleed: s.bleed ? { dps: s.bleed.dps[i]!, duration: s.bleed.duration } : null,
      zone: s.zone ? { radius: s.zone.radius, tick: s.zone.tick[i]!, duration: s.zone.duration, offset: s.zone.offset } : null,
    };
  }
  let normalDamageMult = 1;
  const sdef = secondary ? MODULES[secondary.id] : undefined;
  if (secondary && sdef) {
    const v = sdef.passive.value[secondary.tier - 1]!;
    if (sdef.passive.kind === 'normal_damage') normalDamageMult = v;
    else if (sdef.passive.kind === 'skill_cooldown') skill = { ...skill, cooldown: skill.cooldown * v };
  }
  return { skill, normalDamageMult, primary, secondary };
}

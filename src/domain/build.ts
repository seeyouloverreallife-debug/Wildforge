import { MODULES, type ModuleId, type Tier, type WeaponId } from '../data/content';
import type { SaveData } from './save';

export interface ResolvedSkill {
  id: 'focus' | ModuleId;
  nameTh: string;
  /** final stamina cost after passives (rounded, min 1) */
  cost: number;
  /** final cooldown seconds after passives */
  cooldown: number;
  windup: number | null; // null → weapon startup
  hit: {
    damage: number; stagger: number; partMult: number; bodyOnly: boolean;
    shape: 'weapon' | 'cone' | 'dash'; cone?: { range: number; angleDeg: number };
  } | null;
  dash: { distance: number; duration: number } | null;
  dot: { source: 'bleed' | 'poison'; dps: number; duration: number } | null;
  zone: { radius: number; tick: number; duration: number; offset: number } | null;
  guard: { duration: number; reduction: number; counterDamage: number } | null;
}

export interface PlayerBuild {
  weaponId: WeaponId;
  skill: ResolvedSkill;
  normalDamageMult: number;
  damageTakenMult: number;
  moveSpeedMult: number;
  /** secondary part-damage multiplier (horn passive) */
  partMult: number;
  primary: { id: ModuleId; tier: Tier } | null;
  secondary: { id: ModuleId; tier: Tier } | null;
}

/** No primary module → Focus Strike (§7.2). */
export const FOCUS_STRIKE: ResolvedSkill = {
  id: 'focus', nameTh: 'โฟกัสสไตรค์', cost: 20, cooldown: 6, windup: 0.35,
  hit: { damage: 18, stagger: 8, partMult: 1, bodyOnly: false, shape: 'weapon' }, dash: null, dot: null, zone: null, guard: null,
};

export const BASIC_BUILD: PlayerBuild = {
  weaponId: 'fang_cleaver', skill: FOCUS_STRIKE, normalDamageMult: 1, damageTakenMult: 1, moveSpeedMult: 1, partMult: 1, primary: null, secondary: null,
};

export function resolveBuild(save: Pick<SaveData, 'loadout' | 'modules'>): PlayerBuild {
  const { primaryModuleId, secondaryModuleId, weaponId } = save.loadout;
  const tierOf = (id: ModuleId | null) => (id && save.modules[id] ? { id, tier: save.modules[id]!.tier } : null);
  const primary = tierOf(primaryModuleId), secondary = tierOf(secondaryModuleId);

  let skill: ResolvedSkill = FOCUS_STRIKE;
  if (primary) {
    const i = primary.tier - 1, s = MODULES[primary.id].skill;
    skill = {
      id: primary.id, nameTh: s.nameTh, cost: s.cost, cooldown: s.cooldown, windup: s.windup ?? null,
      hit: s.hit ? {
        damage: s.hit.damage[i]!, stagger: Array.isArray(s.hit.stagger) ? s.hit.stagger[i]! : (s.hit.stagger as number),
        partMult: s.hit.partMult ?? 1, bodyOnly: !!s.hit.bodyOnly, shape: s.hit.shape, cone: s.hit.cone,
      } : null,
      dash: s.dash ? { distance: s.dash.distance[i]!, duration: s.dash.duration } : null,
      dot: s.dot ? { source: s.dot.source, dps: s.dot.dps[i]!, duration: s.dot.duration } : null,
      zone: s.zone ? { radius: s.zone.radius, tick: s.zone.tick[i]!, duration: s.zone.duration, offset: s.zone.offset } : null,
      guard: s.guard ? { duration: s.guard.duration, reduction: s.guard.reduction[i]!, counterDamage: s.guard.counterDamage[i]! } : null,
    };
  }
  const b: PlayerBuild = { weaponId, skill, normalDamageMult: 1, damageTakenMult: 1, moveSpeedMult: 1, partMult: 1, primary, secondary };
  if (secondary) {
    const p = MODULES[secondary.id].passive;
    const v = p.value[secondary.tier - 1]!;
    switch (p.kind) {
      case 'normal_damage': b.normalDamageMult = v; break;
      case 'skill_cooldown': b.skill = { ...b.skill, cooldown: b.skill.cooldown * v }; break; // not rounded: shown to 1 decimal, computed as float (§9)
      case 'damage_taken': b.damageTakenMult = v; break;
      case 'skill_cost': b.skill = { ...b.skill, cost: Math.max(1, Math.round(b.skill.cost * v)) }; break;
      case 'move_speed': b.moveSpeedMult = v; break;
      case 'part_damage': b.partMult = v; break;
    }
  }
  b.skill = { ...b.skill, cost: Math.max(1, Math.round(b.skill.cost)) };
  return b;
}

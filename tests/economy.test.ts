import { describe, expect, it } from 'vitest';
import { craftInfo, craftOrUpgrade, pinRecipe, setLoadout } from '../src/domain/crafting';
import type { HuntResult } from '../src/domain/hunt';
import { settleHunt } from '../src/domain/rewards';
import { cloneSave, newSave, validateSave, type SaveData } from '../src/domain/save';
import { resolveBuild } from '../src/domain/build';

const withMats = (m: Partial<SaveData['materials']>): SaveData => { const s = newSave(); Object.assign(s.materials, m); return s; };
const result = (over: Partial<HuntResult> = {}): HuntResult => ({
  huntId: 'hunt-1', missionId: 'hunt_gecko', monsterId: 'ember_gecko', objective: 'hunt', captured: false,
  outcome: 'success', failReason: null, elapsed: 120, brokenPartIds: [], movesSeen: ['fire_breath'], ...over,
});
const ctx = { missionId: 'hunt_gecko', targetMaterialId: 'heat_bladder' } as const;

describe('crafting', () => {
  it('craft costs 4, upgrade costs 6, counts never go negative', () => {
    let s = withMats({ heat_bladder: 5 });
    const a = craftOrUpgrade(s, 'ember');
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    s = a.save;
    expect(s.materials.heat_bladder).toBe(1);
    expect(s.modules.ember).toEqual({ tier: 1 });
    const bad = craftOrUpgrade(s, 'ember'); // upgrade needs 6
    expect(bad.ok).toBe(false);
    expect(craftInfo(s, 'ember')).toMatchObject({ action: 'upgrade', cost: 6, have: 1, missing: 5 });
    s.materials.heat_bladder = 6;
    const up = craftOrUpgrade(s, 'ember');
    expect(up.ok && up.save.modules.ember?.tier).toBe(2);
    expect(up.ok && up.save.materials.heat_bladder).toBe(0);
  });
  it('rejects not-enough ("มี 2/4"), tier II re-upgrade, and unavailable modules; input save untouched', () => {
    const s = withMats({ heat_bladder: 2 });
    const r = craftOrUpgrade(s, 'ember');
    expect(r).toEqual({ ok: false, error: 'วัสดุไม่พอ: มี 2/4' });
    expect(s.materials.heat_bladder).toBe(2);
    const t = withMats({ fang: 99 }); t.modules.fang = { tier: 2 };
    expect(craftOrUpgrade(t, 'fang').ok).toBe(false);
    expect(craftOrUpgrade(withMats({ shell_scale: 99 }), 'shell').ok).toBe(false); // recipe locked until the crab mission opens
  });
  it('double craft of the same module cannot spend twice (owned module → upgrade rules apply)', () => {
    const s = withMats({ fang: 4 });
    const first = craftOrUpgrade(s, 'fang');
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = craftOrUpgrade(first.save, 'fang');
    expect(second.ok).toBe(false);
    expect(first.save.materials.fang).toBe(0);
  });
  it('loadout: owned only, no duplicates across slots, swapping is free', () => {
    const s = withMats({}); s.modules.fang = { tier: 1 }; s.modules.ember = { tier: 1 };
    expect(setLoadout(s, 'shell', null).ok).toBe(false); // not owned
    expect(setLoadout(newSave(), 'fang', null).ok).toBe(false); // not owned
    expect(setLoadout(s, 'fang', 'fang').ok).toBe(false);
    const a = setLoadout(s, 'fang', 'ember');
    expect(a.ok).toBe(true);
    const b = a.ok ? setLoadout(a.save, 'ember', 'fang') : a;
    expect(b.ok && b.save.modules).toEqual(s.modules);
  });
  it('pins one recipe', () => {
    const r = pinRecipe(newSave(), 'ember');
    expect(r.ok && r.save.pinnedRecipeId).toBe('ember');
    expect(pinRecipe(newSave(), 'horn').ok).toBe(false); // locked recipe
  });
});

describe('rewards / settlement', () => {
  it('success: 2 of target + 1 per broken part + research 1', () => {
    const s = settleHunt(newSave(), result({ brokenPartIds: ['fire_sac', 'jaw'] }), ctx);
    expect(s.kind).toBe('settled');
    if (s.kind !== 'settled') return;
    expect(s.save.materials.heat_bladder).toBe(2 + 1);
    expect(s.save.materials.fang).toBe(1);
    expect(s.save.research).toBe(1);
    expect(s.summary.partBonuses).toHaveLength(2);
    expect(s.save.lastSettlementId).toBe('hunt-1');
  });
  it('failed / abandoned pay nothing but keep observations', () => {
    for (const outcome of ['failed', 'abandoned'] as const) {
      const s = settleHunt(newSave(), result({ outcome, brokenPartIds: ['jaw'], movesSeen: ['bite_lunge'] }), ctx);
      if (s.kind !== 'settled') throw new Error('expected settled');
      expect(Object.values(s.save.materials).every((n) => n === 0)).toBe(true);
      expect(s.save.research).toBe(0);
      expect(s.save.bestiary.ember_gecko?.movesSeen).toEqual(['bite_lunge']);
      expect(s.save.bestiary.ember_gecko?.partsBroken).toEqual(['jaw']);
      expect(s.save.bestiary.ember_gecko?.clears).toBe(0);
    }
  });
  it('same huntId settles once: replay or reload pays nothing more', () => {
    const first = settleHunt(newSave(), result(), ctx);
    if (first.kind !== 'settled') throw new Error('expected settled');
    const again = settleHunt(first.save, result(), ctx);
    expect(again.kind).toBe('duplicate');
    expect(again.save.materials.heat_bladder).toBe(2);
    const afterReload = settleHunt(JSON.parse(JSON.stringify(first.save)) as SaveData, result(), ctx);
    expect(afterReload.kind).toBe('duplicate');
  });
  it('is pure: does not mutate its input', () => {
    const s = newSave(); const copy = cloneSave(s);
    settleHunt(s, result(), ctx);
    expect(s).toEqual(copy);
  });
  it('tracks best time and clears', () => {
    let s = newSave();
    for (const [id, el] of [['h1', 200], ['h2', 150], ['h3', 180]] as const) {
      const r = settleHunt(s, result({ huntId: id, elapsed: el }), ctx);
      if (r.kind === 'settled') s = r.save;
    }
    expect(s.bestiary.ember_gecko).toMatchObject({ clears: 3, hunts: 3, bestTimeHunt: 150 });
  });
});

describe('save validation', () => {
  it('accepts a fresh save and round-trips JSON', () => {
    const v = validateSave(JSON.parse(JSON.stringify(newSave())));
    expect(v.ok).toBe(true);
  });
  it.each([
    ['unknown material', (s: any) => { s.materials.gold = 5; }],
    ['negative count', (s: any) => { s.materials.fang = -1; }],
    ['fractional count', (s: any) => { s.materials.fang = 1.5; }],
    ['NaN count', (s: any) => { s.materials.fang = NaN; }],
    ['bad tier', (s: any) => { s.modules.fang = { tier: 3 }; }],
    ['unknown module', (s: any) => { s.modules.laser = { tier: 1 }; }],
    ['equipped but not owned', (s: any) => { s.loadout.primaryModuleId = 'fang'; }],
    ['same module in both slots', (s: any) => { s.modules.fang = { tier: 1 }; s.loadout.primaryModuleId = 'fang'; s.loadout.secondaryModuleId = 'fang'; }],
    ['weapon not unlocked', (s: any) => { s.loadout.weaponId = 'branch_spear'; }],
    ['future schema', (s: any) => { s.schemaVersion = 99; }],
    ['unknown monster in bestiary', (s: any) => { s.bestiary.dragon = { hunts: 1, clears: 0, captures: 0, bestTimeHunt: null, bestTimeCapture: null, movesSeen: [], partsBroken: [] }; }],
  ])('rejects %s with a reason', (_n, mutate) => {
    const s = JSON.parse(JSON.stringify(newSave()));
    mutate(s);
    const v = validateSave(s);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason.length).toBeGreaterThan(3);
  });
});

describe('build resolution', () => {
  it('no primary → Focus Strike 18 / 20 stamina / 6 s', () => {
    const b = resolveBuild(newSave());
    expect(b.skill).toMatchObject({ id: 'focus', cost: 20, cooldown: 6, windup: 0.35 });
    expect(b.skill.hit?.damage).toBe(18);
  });
  it('tier I/II numbers from the table; passives from the secondary slot', () => {
    const s = newSave(); s.modules.fang = { tier: 2 }; s.modules.ember = { tier: 1 };
    s.loadout.primaryModuleId = 'ember'; s.loadout.secondaryModuleId = 'fang';
    const b = resolveBuild(s);
    expect(b.skill).toMatchObject({ id: 'ember', cost: 30, cooldown: 10 });
    expect(b.skill.zone?.tick).toBe(6);
    expect(b.normalDamageMult).toBe(1.1);
    const t = newSave(); t.modules.fang = { tier: 1 }; t.modules.ember = { tier: 2 };
    t.loadout.primaryModuleId = 'fang'; t.loadout.secondaryModuleId = 'ember';
    const c = resolveBuild(t);
    expect(c.skill).toMatchObject({ id: 'fang', cost: 20 });
    expect(c.skill.cooldown).toBeCloseTo(6 * 0.92);
    expect(c.skill.hit?.damage).toBe(15);
    expect(c.skill.dot?.dps).toBe(3);
  });
});

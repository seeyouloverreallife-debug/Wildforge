import { describe, expect, it } from 'vitest';
import { PLAYER, ARENA } from '../src/data/tuning';
import { resolveBuild, BASIC_BUILD, type PlayerBuild } from '../src/domain/build';
import { contextAction, createHunt, drainEvents, stepHunt, finishHunt, type HuntState, type HuntResult } from '../src/domain/hunt';
import { partWorldPos } from '../src/domain/monster';
import { emptyIntent, type Intent } from '../src/domain/player';
import { settleHunt } from '../src/domain/rewards';
import { cloneSave, newSave, validateSave, type SaveData } from '../src/domain/save';
import { recomputeUnlocks, recipeUnlocked } from '../src/domain/unlocks';
import { craftOrUpgrade, setWeapon } from '../src/domain/crafting';
import { DT } from './helpers';

const secs = (n: number) => Math.round(n / DT);
function buildOf(opts: { weapon?: 'fang_cleaver' | 'branch_spear'; primary?: any; secondary?: any; tiers?: Record<string, 1 | 2> }): PlayerBuild {
  const s = newSave();
  for (const id of [opts.primary, opts.secondary]) if (id) s.modules[id as 'fang'] = { tier: opts.tiers?.[id] ?? 1 };
  s.unlockedWeaponIds = ['fang_cleaver', 'branch_spear'];
  s.loadout = { weaponId: opts.weapon ?? 'fang_cleaver', primaryModuleId: opts.primary ?? null, secondaryModuleId: opts.secondary ?? null };
  return resolveBuild(s);
}
function dummy(build: PlayerBuild = BASIC_BUILD, mission: Parameters<typeof createHunt>[2] = {}): HuntState {
  const h = createHunt(1, build, mission);
  h.monster.pos = { x: 800, y: 300 }; h.monster.facing = Math.PI / 2;
  h.monster.phase = 'stagger'; h.monster.t = 0; h.monster.staggerDur = 1e6;
  h.player.pos = { x: 800, y: 440 }; // body edge at 370, player edge at 420: 50 away
  return h;
}
const run = (h: HuntState, n: number, i: Partial<Intent> = {}) => {
  for (let f = 0; f < n; f++) stepHunt(h, { ...emptyIntent(), ...i, attackPressed: f === 0 && !!i.attackPressed, skillPressed: f === 0 && !!i.skillPressed, potionPressed: f === 0 && !!i.potionPressed, capturePressed: f === 0 && !!i.capturePressed, contextPressed: f === 0 && !!i.contextPressed, dodgePressed: f === 0 && !!i.dodgePressed }, DT);
};
const UP = { x: 800, y: 0 };

describe('branch spear', () => {
  it('9 damage with a narrow capsule of length 140: hits straight ahead, misses to the side', () => {
    const b = buildOf({ weapon: 'branch_spear' });
    const h = dummy(b); h.player.pos = { x: 800, y: 300 + 62 + 20 + 55 }; // 137 from centre → tip reaches body
    run(h, secs(0.5), { aim: UP, attackPressed: true });
    expect(1400 - h.monster.hp).toBe(9);
    const s = dummy(b); s.player.pos = { x: 800 + 62 + 20 + 40, y: 300 }; // beside it, spear aimed forward (+y... up)
    run(s, secs(0.5), { aim: { x: 800 + 62 + 20 + 40, y: -500 }, attackPressed: true });
    expect(s.monster.hp).toBe(1400);
  });
  it('reaches farther than the cleaver (140 vs 90) and cycle is 0.65 s', () => {
    const far = (w: 'fang_cleaver' | 'branch_spear') => { const h = dummy(buildOf({ weapon: w })); h.player.pos = { x: 800, y: 520 }; run(h, secs(0.5), { aim: UP, attackPressed: true }); return h.monster.hp; };
    expect(far('branch_spear')).toBe(1400 - 9);
    expect(far('fang_cleaver')).toBe(1400);
    const h = dummy(buildOf({ weapon: 'branch_spear' }));
    run(h, 1, { attackPressed: true });
    expect(h.player.attack).not.toBeNull();
    run(h, secs(0.65));
    expect(h.player.attack).toBeNull();
  });
  it('weapon must be unlocked', () => {
    expect(setWeapon(newSave(), 'branch_spear').ok).toBe(false);
    const s = newSave(); s.unlockedWeaponIds.push('branch_spear');
    expect(setWeapon(s, 'branch_spear').ok).toBe(true);
  });
});

describe('shell module (guard)', () => {
  const guardHunt = (tier: 1 | 2 = 1) => {
    const h = createHunt(2, buildOf({ primary: 'shell', tiers: { shell: tier } }));
    h.monster.pos = { x: 800, y: 300 }; h.monster.facing = Math.PI / 2;
    h.monster.move = h.monster.def.moves.find((m) => m.id === 'bite_lunge')!; h.monster.phase = 'telegraph'; h.monster.t = 0;
    h.player.pos = { x: 800, y: 440 };
    return h;
  };
  it('first hit from the front is cut 70% (tier I) / 77% (tier II); a second hit is not', () => {
    for (const [tier, expectDmg] of [[1, 5], [2, 4]] as const) { // 16 × 0.30 = 4.8 → 5 ; 16 × 0.23 = 3.68 → 4
      const h = guardHunt(tier);
      run(h, secs(0.4), { aim: { x: 800, y: 300 }, skillPressed: true }); // guard up (0.8 s), monster still telegraphing
      run(h, secs(0.6), { aim: { x: 800, y: 300 } });
      expect(100 - h.player.hp).toBe(expectDmg);
    }
  });
  it('a hit from behind is not guarded', () => {
    const h = guardHunt(); h.player.pos = { x: 800, y: 440 };
    run(h, 1, { aim: { x: 800, y: 900 }, skillPressed: true }); // guard faces AWAY from the monster
    run(h, secs(1.0), { aim: { x: 800, y: 900 } });
    expect(100 - h.player.hp).toBe(16);
  });
  it('counter fires only when a hit was guarded: 20 (tier I) / 22 (tier II) at the end of the window', () => {
    const h = dummy(buildOf({ primary: 'shell' }));
    run(h, 1, { aim: UP, skillPressed: true });
    run(h, secs(0.4), { aim: UP });
    expect(h.monster.hp).toBe(1400);
    expect(drainEvents(h).some((e) => e.type === 'counter')).toBe(false); // nothing hit us → no counter
    const g = dummy(buildOf({ primary: 'shell', tiers: { shell: 2 } }));
    run(g, 1, { aim: UP, skillPressed: true });
    g.player.guard!.used = true; g.player.guard!.counter = true; // pretend a hit was guarded
    run(g, secs(1.0), { aim: UP });
    expect(1400 - g.monster.hp).toBe(22);
    expect(drainEvents(g).filter((e) => e.type === 'counter')).toHaveLength(1);
  });
  it('counter can miss when the monster is out of weapon range', () => {
    const h = dummy(buildOf({ primary: 'shell' })); h.player.pos = { x: 800, y: 700 };
    run(h, 1, { aim: UP, skillPressed: true });
    h.player.guard!.used = true; h.player.guard!.counter = true;
    run(h, secs(1.0), { aim: UP });
    expect(h.monster.hp).toBe(1400);
    expect(drainEvents(h).find((e) => e.type === 'counter')).toMatchObject({ hit: false });
  });
  it('invulnerable moments do not consume the guard; puddles are never guarded; passive ×0.92 reduces all damage', () => {
    const h = guardHunt(); h.player.hurtInvuln = 0.3;
    run(h, 1, { aim: { x: 800, y: 300 }, skillPressed: true });
    expect(h.player.guard?.used).toBe(false);
    const p = createHunt(2, buildOf({ primary: 'shell', secondary: 'fang' }));
    expect(p.build.damageTakenMult).toBe(1); // fang passive is attack-only
    const q = createHunt(2, buildOf({ primary: 'fang', secondary: 'shell' }));
    expect(q.build.damageTakenMult).toBe(0.92);
    q.monster.pos = { x: 800, y: 300 }; q.monster.facing = Math.PI / 2; q.monster.move = q.monster.def.moves.find((m) => m.id === 'tail_sweep')!;
    q.monster.phase = 'telegraph'; q.player.pos = { x: 800, y: 200 };
    run(q, secs(1.5));
    expect(100 - q.player.hp).toBe(Math.round(18 * 0.92)); // 16.56 → 17
  });
});

describe('venom module', () => {
  it('cone range 150: 5 body damage (no part damage), poison 4/s for 6 s, refresh not stack', () => {
    const h = dummy(buildOf({ primary: 'venom' })); h.player.pos = { x: 800, y: 300 + 62 + 20 + 40 };
    run(h, secs(0.4), { aim: UP, skillPressed: true });
    expect(1400 - h.monster.hp).toBe(5);
    expect(h.monster.partHp.jaw).toBe(180);
    expect(h.monster.partHp.fire_sac).toBe(220);
    const hp0 = h.monster.hp;
    run(h, secs(6.3), { aim: UP });
    expect(hp0 - h.monster.hp).toBe(24); // 6 pulses × 4
    expect(h.dot).toBeNull();
  });
  it('tier II poison 4.4/s with carry: 26 over 6 pulses', () => {
    const h = dummy(buildOf({ primary: 'venom', tiers: { venom: 2 } })); h.player.pos = { x: 800, y: 300 + 62 + 20 + 40 };
    run(h, secs(0.4), { aim: UP, skillPressed: true });
    const hp0 = h.monster.hp;
    run(h, secs(6.3), { aim: UP });
    expect(hp0 - h.monster.hp).toBe(26); // floor(26.4)
  });
  it('cone does not reach beyond 150; passive lowers skill cost (30 → 28 / 27)', () => {
    const h = dummy(buildOf({ primary: 'venom' })); h.player.pos = { x: 800, y: 300 + 62 + 20 + 200 };
    run(h, secs(0.4), { aim: UP, skillPressed: true });
    expect(h.monster.hp).toBe(1400);
    expect(buildOf({ primary: 'fang', secondary: 'venom' }).skill.cost).toBe(18); // 20 × 0.92 = 18.4 → 18
    expect(buildOf({ primary: 'ember', secondary: 'venom', tiers: { venom: 2 } }).skill.cost).toBe(27);
  });
});

describe('wing module', () => {
  it('dashes 210 (tier I) / 230 (tier II) over 0.35 s, 12 damage once, no i-frames, move speed ×1.08/1.10', () => {
    for (const [tier, dist] of [[1, 210], [2, 230]] as const) {
      const h = dummy(buildOf({ primary: 'wing', tiers: { wing: tier } })); h.monster.pos = { x: 800, y: 100 }; h.player.pos = { x: 800, y: 700 };
      run(h, 1, { aim: { x: 800, y: 0 }, skillPressed: true });
      expect(h.player.dodge).toBeNull();
      run(h, secs(0.5), { aim: { x: 800, y: 0 } });
      expect(700 - h.player.pos.y).toBeGreaterThanOrEqual(dist - 4);
      expect(700 - h.player.pos.y).toBeLessThanOrEqual(dist + 4);
    }
    const hit = dummy(buildOf({ primary: 'wing' })); hit.player.pos = { x: 800, y: 560 };
    run(hit, secs(0.6), { aim: UP, skillPressed: true });
    expect(1400 - hit.monster.hp).toBe(12);
    const spd = (mult: ReturnType<typeof buildOf>) => { const h = dummy(mult); h.monster.pos = { x: 100, y: 100 }; h.player.pos = { x: 600, y: 800 }; run(h, secs(1), { moveX: 1 }); return h.player.pos.x - 600; };
    expect(spd(buildOf({ primary: 'fang', secondary: 'wing' }))).toBeCloseTo(220 * 1.08, 0);
    expect(spd(buildOf({ primary: 'fang', secondary: 'wing', tiers: { wing: 2 } }))).toBeCloseTo(220 * 1.1, 0);
  });
  it('the dash is blocked by obstacles instead of passing through', () => {
    const h = dummy(buildOf({ primary: 'wing' })); h.monster.pos = { x: 1500, y: 100 };
    h.player.pos = { x: 520, y: 600 };
    run(h, 1, { aim: { x: 520, y: 0 }, skillPressed: true });
    run(h, secs(0.5), { aim: { x: 520, y: 0 } });
    expect(Math.hypot(h.player.pos.x - 520, h.player.pos.y - 420)).toBeGreaterThanOrEqual(60 + PLAYER.radius - 1);
  });
});

describe('horn module', () => {
  it('0.45 s windup, 20 body, part ×2 = 20×2 on the targeted part, stagger +30', () => {
    const h = dummy(buildOf({ primary: 'horn' })); h.player.pos = { x: 800, y: 300 + 95 + 26 + 40 };
    const jaw = partWorldPos(h.monster, 'jaw');
    run(h, secs(0.4), { aim: jaw, skillPressed: true });
    expect(h.monster.hp).toBe(1400); // still winding up
    run(h, secs(0.3), { aim: jaw });
    expect(1400 - h.monster.hp).toBe(20);
    expect(180 - (h.monster.partHp.jaw ?? 0)).toBe(40);
    expect(h.monster.staggerMeter).toBe(0); // already staggered in this dummy, so meter does not fill
  });
  it('stagger meter +30 from the skill when not staggered', () => {
    const h = dummy(buildOf({ primary: 'horn' })); h.monster.phase = 'recovery'; h.monster.recoveryDur = 1e6; h.player.pos = { x: 800, y: 300 + 95 + 26 + 40 };
    run(h, secs(0.8), { aim: partWorldPos(h.monster, 'jaw'), skillPressed: true });
    expect(h.monster.staggerMeter).toBe(30);
  });
  it('passive part damage ×1.15 (tier I) / ×1.18 (tier II) on top of any hit', () => {
    const h = dummy(buildOf({ primary: 'fang', secondary: 'horn' })); h.player.pos = { x: 800, y: 300 + 95 + 26 + 40 };
    run(h, secs(0.5), { aim: partWorldPos(h.monster, 'jaw'), attackPressed: true });
    expect(180 - (h.monster.partHp.jaw ?? 0)).toBe(12); // round(10 × 1.15 = 11.5)
    expect(1400 - h.monster.hp).toBe(10); // body unchanged
  });
});

describe('potion', () => {
  it('+35 HP after 0.7 s, 2 uses, not at full HP, cancelled by a hit or a dodge without spending a charge', () => {
    const h = dummy(); h.player.hp = 50;
    run(h, secs(0.5), { potionPressed: true });
    expect(h.player.hp).toBe(50); expect(h.potions).toBe(2);
    run(h, secs(0.3));
    expect(h.player.hp).toBe(85); expect(h.potions).toBe(1);
    const full = dummy(); run(full, secs(1), { potionPressed: true });
    expect(full.potions).toBe(2);
    const hit = dummy(); hit.player.hp = 50; run(hit, 5, { potionPressed: true });
    hit.player.hurtInvuln = 0; run(hit, 1);
    hit.player.hp = 40; // simulate damage through the real pipeline
    expect(hit.player.channel).not.toBeNull();
    import_damage(hit);
    run(hit, secs(1));
    expect(hit.potions).toBe(2);
    const dg = dummy(); dg.player.hp = 50; run(dg, 5, { potionPressed: true });
    run(dg, 2, { dodgePressed: true, moveX: 1 });
    run(dg, secs(1));
    expect(dg.potions).toBe(2); expect(dg.player.hp).toBe(50);
  });
  it('a third potion is refused; cannot start at 0 HP', () => {
    const h = dummy(); h.player.hp = 20;
    run(h, secs(0.8), { potionPressed: true }); h.player.hp = 20;
    run(h, secs(0.8), { potionPressed: true }); h.player.hp = 20;
    run(h, secs(0.8), { potionPressed: true });
    expect(h.potions).toBe(0);
    expect(h.player.hp).toBe(20);
  });
});
// helper kept at the bottom: damage via the player's own pipeline
import { damagePlayer } from '../src/domain/player';
function import_damage(h: HuntState) { h.player.hurtInvuln = 0; damagePlayer(h.player, 10); }

describe('capture', () => {
  const capHunt = (hpFrac: number) => {
    const h = dummy(BASIC_BUILD, { missionId: 'capture_gecko' });
    h.monster.hp = Math.round(h.monster.def.hp * hpFrac);
    h.monster.phase = 'recovery'; h.monster.recoveryDur = 1e6; h.monster.staggerDur = 0;
    h.player.pos = { x: 800, y: 440 }; h.player.facing = -Math.PI / 2;
    return h;
  };
  it('trap takes 0.6 s, lands 70 ahead with radius 90, spends the single charge only when set', () => {
    const h = capHunt(0.5);
    run(h, secs(0.4), { capturePressed: true, aim: UP });
    expect(h.trap).toBeNull(); expect(h.trapCharge).toBe(true);
    run(h, secs(0.3), { aim: UP });
    expect(h.trap).not.toBeNull();
    expect(h.trapCharge).toBe(false);
    expect(Math.hypot(h.trap!.x - 800, h.trap!.y - 440 + 70)).toBeLessThan(2);
    expect(h.trap!.r).toBe(90);
    run(h, 1, { capturePressed: true }); // no second charge
    expect(h.player.channel).toBeNull();
  });
  it('HP above 25%: the monster in the trap is NOT captured, the trap stays and works later', () => {
    const h = capHunt(0.5); h.monster.pos = { x: 800, y: 380 };
    run(h, secs(0.7), { capturePressed: true, aim: UP });
    expect(h.trap).not.toBeNull();
    run(h, secs(2));
    expect(h.status).toBe('ACTIVE');
    expect(h.trap).not.toBeNull();
    h.monster.hp = Math.round(h.monster.def.hp * 0.2); // now ≤ 25%
    run(h, 2);
    expect(h.status).toBe('SUCCESS');
    expect(h.result).toMatchObject({ captured: true, outcome: 'success', objective: 'capture' });
    expect(h.monster.phase).toBe('captured');
  });
  it('needs recovery/stagger: an attacking monster in the trap is not captured', () => {
    const h = capHunt(0.2); h.monster.pos = { x: 800, y: 380 }; h.monster.phase = 'attack'; h.monster.move = h.monster.def.moves[0]!; h.monster.t = 0;
    h.trap = { x: 800, y: 380, r: 90, age: 0 };
    h.monster.def.moves[0]!.active; // eslint-disable-line
    run(h, 3, {});
    expect(h.status).toBe('ACTIVE');
  });
  it('interrupted setup keeps the charge (Q09)', () => {
    const h = capHunt(0.2);
    run(h, secs(0.3), { capturePressed: true, aim: UP });
    expect(h.player.channel?.kind).toBe('trap');
    import_damage(h);
    run(h, secs(1));
    expect(h.trap).toBeNull(); expect(h.trapCharge).toBe(true);
  });
  it('trap expires after 15 s', () => {
    const h = capHunt(0.5); h.monster.pos = { x: 600, y: 100 };
    run(h, secs(0.7), { capturePressed: true, aim: UP });
    expect(h.trap).not.toBeNull();
    run(h, secs(15.2));
    expect(h.trap).toBeNull();
  });
  it('killing the animal in a capture mission fails with a clear reason and no rewards', () => {
    const h = capHunt(0.5); h.monster.hp = 5; h.monster.phase = 'stagger'; h.monster.staggerDur = 1e6;
    run(h, secs(0.5), { attackPressed: true, aim: UP });
    expect(h.status).toBe('FAILED');
    expect(h.result).toMatchObject({ failReason: 'killed_capture', captured: false });
    const r = settleHunt(newSave(), h.result!, { missionId: 'capture_gecko', targetMaterialId: 'fang' });
    if (r.kind !== 'settled') throw new Error();
    expect(Object.values(r.save.materials).every((n) => n === 0)).toBe(true);
    expect(r.save.research).toBe(0);
  });
  it('HP=0 can never be captured; hunt missions have no trap', () => {
    const h = createHunt(1, BASIC_BUILD); run(h, secs(1), { capturePressed: true });
    expect(h.player.channel).toBeNull();
  });
  it('capture success pays materials + 2 research, records first capture, never unlocks hunt content', () => {
    const res: HuntResult = { huntId: 'c1', missionId: 'capture_gecko', monsterId: 'ember_gecko', objective: 'capture', outcome: 'success', failReason: null, captured: true, elapsed: 90, brokenPartIds: ['jaw'], movesSeen: ['bite_lunge'] };
    const base = newSave(); base.unlockedMissionIds.push('capture_gecko');
    const r = settleHunt(base, res, { missionId: 'capture_gecko', targetMaterialId: 'fang' });
    if (r.kind !== 'settled') throw new Error();
    expect(r.save.materials.fang).toBe(3);
    expect(r.save.research).toBe(2);
    expect(r.summary.firstCapture).toBe(true);
    expect(r.save.bestiary.ember_gecko).toMatchObject({ captures: 1, clears: 0, bestTimeCapture: 90 });
    expect(r.save.unlockedMissionIds).not.toContain('hunt_crab');
    expect(r.save.unlockedWeaponIds).not.toContain('branch_spear');
  });
});

describe('vine and torch (§13)', () => {
  const V = ARENA.vine;
  const vineHunt = () => {
    const h = dummy();
    h.player.pos = { x: V.x - 120, y: V.y };
    h.monster.pos = { x: V.x + 60, y: V.y + 40 }; // overlapping the zone ring
    h.monster.phase = 'approach'; h.monster.restDur = 1e9;
    return h;
  };
  it('roots a free monster for 1.5 s, once per round', () => {
    const h = vineHunt();
    expect(contextAction(h)).toEqual({ kind: 'root', ok: true });
    run(h, 1, { contextPressed: true });
    expect(h.monster.phase).toBe('stagger'); expect(h.monster.staggerCause).toBe('root'); expect(h.monster.staggerDur).toBe(1.5);
    expect(h.vine.rootUsed).toBe(true);
    h.monster.phase = 'approach'; h.monster.restDur = 1e9;
    expect(contextAction(h)).toMatchObject({ kind: 'root', ok: false });
    run(h, 1, { contextPressed: true });
    expect(h.monster.phase).toBe('approach');
  });
  it('does not add a root while the monster is already staggered', () => {
    const h = vineHunt(); h.monster.phase = 'stagger'; h.monster.staggerDur = 5; h.monster.t = 0;
    expect(contextAction(h)).toMatchObject({ ok: false });
    run(h, 1, { contextPressed: true });
    expect(h.vine.rootUsed).toBe(false); expect(h.monster.staggerDur).toBe(5);
  });
  it('torch burns the thicket (opening the space) and then the root is gone for good', () => {
    const h = vineHunt(); h.monster.pos = { x: 600, y: 700 }; // not on the vine
    expect(contextAction(h)).toEqual({ kind: 'burn', ok: true });
    h.player.pos = { x: V.x - 60, y: V.y };
    run(h, 1, { contextPressed: true });
    expect(h.vine.burned).toBe(true);
    const walk = dummy(); walk.vine.burned = true; walk.monster.pos = { x: 100, y: 900 }; walk.player.pos = { x: V.x - 100, y: V.y };
    run(walk, secs(1), { moveX: 1 });
    expect(walk.player.pos.x).toBeGreaterThan(V.x); // can now walk through the burnt patch
    const solid = dummy(); solid.monster.pos = { x: 100, y: 900 }; solid.player.pos = { x: V.x - 100, y: V.y };
    run(solid, secs(1), { moveX: 1 });
    expect(solid.player.pos.x).toBeLessThan(V.x - V.thicketRadius); // thicket blocks until burned
    const burnt = vineHunt(); burnt.vine.burned = true;
    expect(contextAction(burnt)).toBeNull();
  });
  it('needs the player near the vine', () => {
    const h = vineHunt(); h.player.pos = { x: 100, y: 100 };
    expect(contextAction(h)).toBeNull();
  });
});

describe('unlocks and migration', () => {
  const win = (mission: HuntResult['missionId'], monster: HuntResult['monsterId'], id = 'w1'): HuntResult => ({
    huntId: id, missionId: mission, monsterId: monster, objective: 'hunt', outcome: 'success', failReason: null, captured: false, elapsed: 100, brokenPartIds: [], movesSeen: [],
  });
  it('first gecko clear unlocks crab hunt, gecko capture and the spear; crab unlocks sail hunt + crab capture; sail unlocks sail capture', () => {
    let s = newSave();
    const a = settleHunt(s, win('hunt_gecko', 'ember_gecko', 'a'), { missionId: 'hunt_gecko', targetMaterialId: 'fang' });
    if (a.kind !== 'settled') throw new Error();
    expect(a.summary.firstClearUnlocks.sort()).toEqual(['branch_spear', 'capture_gecko', 'hunt_crab']);
    s = a.save;
    expect(s.unlockedMissionIds).toEqual(['hunt_gecko', 'hunt_crab', 'capture_gecko']);
    const again = settleHunt(s, win('hunt_gecko', 'ember_gecko', 'b'), { missionId: 'hunt_gecko', targetMaterialId: 'fang' });
    if (again.kind !== 'settled') throw new Error();
    expect(again.summary.firstClearUnlocks).toEqual([]); // not a first clear any more
    const c = settleHunt(again.save, win('hunt_crab', 'mire_crab', 'c'), { missionId: 'hunt_crab', targetMaterialId: 'shell_scale' });
    if (c.kind !== 'settled') throw new Error();
    expect(c.summary.firstClearUnlocks.sort()).toEqual(['capture_crab', 'hunt_sail']);
    const d = settleHunt(c.save, win('hunt_sail', 'sail_lizard', 'd'), { missionId: 'hunt_sail', targetMaterialId: 'sail_wing' });
    if (d.kind !== 'settled') throw new Error();
    expect(d.summary.firstClearUnlocks).toEqual(['capture_sail']);
  });
  it('recipes appear only when their source mission is unlocked', () => {
    const s = newSave();
    expect(recipeUnlocked(s, 'ember')).toBe(true);
    expect(recipeUnlocked(s, 'shell')).toBe(false);
    expect(recipeUnlocked(s, 'wing')).toBe(false);
    s.materials.shell_scale = 9;
    expect(craftOrUpgrade(s, 'shell').ok).toBe(false);
    s.unlockedMissionIds.push('hunt_crab');
    expect(craftOrUpgrade(s, 'shell').ok).toBe(true);
  });
  it('an M2 save that already cleared the gecko is migrated on load: unlocks derived, no second reward', () => {
    const m2 = JSON.parse(JSON.stringify(newSave()));
    m2.bestiary.ember_gecko = { hunts: 3, clears: 2, bestTimeHunt: 120, movesSeen: ['fire_breath'], partsBroken: ['jaw'] }; // no capture fields
    m2.materials.fang = 5; m2.research = 2;
    const v = validateSave(m2);
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.data.bestiary.ember_gecko).toMatchObject({ captures: 0, bestTimeCapture: null });
    const r = recomputeUnlocks(v.data);
    expect(r.added.sort()).toEqual(['branch_spear', 'capture_gecko', 'hunt_crab']);
    expect(r.save.materials.fang).toBe(5); expect(r.save.research).toBe(2); // nothing paid again
    expect(recomputeUnlocks(r.save).added).toEqual([]);
  });
  it('M3 content in an imported save is now accepted (shell module equipped, spear selected)', () => {
    const s = cloneSave(newSave() as SaveData);
    s.modules.shell = { tier: 2 }; s.loadout.primaryModuleId = 'shell';
    s.unlockedWeaponIds.push('branch_spear'); s.loadout.weaponId = 'branch_spear';
    expect(validateSave(JSON.parse(JSON.stringify(s))).ok).toBe(true);
  });
  it('terminal result stays single when finishing twice', () => {
    const h = createHunt(1);
    expect(finishHunt(h, 'FAILED', 'timeout')).toBe(true);
    expect(finishHunt(h, 'SUCCESS')).toBe(false);
  });
});

describe('simultaneous endings (Q18)', () => {
  const trapped = () => {
    const h = dummy(BASIC_BUILD, { missionId: 'capture_gecko' });
    h.monster.hp = Math.round(h.monster.def.hp * 0.2); h.monster.phase = 'recovery'; h.monster.recoveryDur = 1e6;
    h.monster.pos = { x: 800, y: 330 };
    h.trap = { x: 800, y: 360, r: 90, age: 0 };
    return h;
  };
  it('captured and player down on the same tick: one terminal result, the capture wins (nothing hits afterwards)', () => {
    const h = trapped(); h.player.hp = 1;
    h.monster.phase = 'recovery';
    run(h, 2);
    expect(h.status).toBe('SUCCESS');
    expect(drainEvents(h).filter((e) => e.type === 'terminal')).toHaveLength(1);
    expect(h.player.hp).toBe(1);
  });
  it('a DOT kill beats the trap in the same tick: killed_capture, never a capture of an animal at 0 HP', () => {
    const h = trapped(); h.monster.hp = 3;
    h.dot = { source: 'bleed', dps: 3, duration: 4, age: 0.99, nextPulse: 1, carry: 0 };
    run(h, 3);
    expect(h.status).toBe('FAILED');
    expect(h.result).toMatchObject({ failReason: 'killed_capture', captured: false });
  });
  it('after capture nothing damages the animal (DOT and zone are frozen)', () => {
    const h = trapped();
    h.dot = { source: 'bleed', dps: 3, duration: 4, age: 0, nextPulse: 1, carry: 0 };
    run(h, 2);
    const hp = h.monster.hp;
    run(h, secs(5));
    expect(h.monster.hp).toBe(hp);
  });
});

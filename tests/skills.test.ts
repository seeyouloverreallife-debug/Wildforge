import { describe, expect, it } from 'vitest';
import { resolveBuild } from '../src/domain/build';
import { createHunt, drainEvents, stepHunt, type HuntState } from '../src/domain/hunt';
import { partWorldPos } from '../src/domain/monster';
import { emptyIntent, type Intent } from '../src/domain/player';
import { newSave, type SaveData } from '../src/domain/save';
import { DT } from './helpers';

function build(primary: 'fang' | 'ember' | null, secondary: 'fang' | 'ember' | null, tiers: { fang?: 1 | 2; ember?: 1 | 2 } = {}) {
  const s: SaveData = newSave();
  if (primary || secondary || tiers.fang) s.modules.fang = { tier: tiers.fang ?? 1 };
  if (primary || secondary || tiers.ember) s.modules.ember = { tier: tiers.ember ?? 1 };
  s.loadout.primaryModuleId = primary; s.loadout.secondaryModuleId = secondary;
  return resolveBuild(s);
}
function dummy(b = build(null, null)): HuntState {
  const h = createHunt(1, b);
  h.monster.pos = { x: 800, y: 300 }; h.monster.facing = Math.PI / 2;
  h.monster.phase = 'stagger'; h.monster.t = 0; h.monster.staggerDur = 1e6;
  h.player.pos = { x: 800, y: 470 };
  return h;
}
const run = (h: HuntState, frames: number, i: Partial<Intent> = {}) => {
  const jaw = partWorldPos(h.monster, 'jaw');
  for (let f = 0; f < frames; f++) stepHunt(h, { ...emptyIntent(), aim: jaw, ...i, skillPressed: f === 0 && !!i.skillPressed }, DT);
};
const UP = { x: 800, y: 0 };
const secs = (n: number) => Math.round(n / DT);

describe('Focus Strike (no primary module)', () => {
  it('18 damage after a 0.35 s windup, 20 stamina, 6 s cooldown, no cooldown if stamina is short', () => {
    const h = dummy();
    run(h, secs(0.3), { skillPressed: true });
    expect(h.monster.hp).toBe(1400); // still winding up
    run(h, secs(0.2));
    expect(1400 - h.monster.hp).toBe(18);
    expect(h.player.stamina).toBeLessThan(100 - 19);
    expect(h.player.skillCooldown).toBeGreaterThan(5.5);
    const g = dummy(); g.player.stamina = 10;
    run(g, secs(0.6), { skillPressed: true });
    expect(g.monster.hp).toBe(1400);
    expect(g.player.skillCooldown).toBe(0);
    expect(g.player.attack).toBeNull();
  });
  it('cannot be reused during cooldown', () => {
    const h = dummy(); h.player.stamina = 100;
    run(h, secs(0.9), { skillPressed: true });
    const hp1 = h.monster.hp;
    h.player.stamina = 100;
    run(h, secs(0.9), { skillPressed: true });
    expect(h.monster.hp).toBe(hp1);
  });
});

describe('fang module', () => {
  it('skill: 15 hit + bleed 3/s for 4 s on body only, no part damage from DOT', () => {
    const h = dummy(build('fang', null));
    run(h, secs(0.4), { skillPressed: true });
    expect(1400 - h.monster.hp).toBe(15);
    const partAfterHit = h.monster.partHp.jaw;
    const hpAfterHit = h.monster.hp;
    run(h, secs(4.2));
    expect(hpAfterHit - h.monster.hp).toBe(12); // 4 pulses × 3
    expect(h.monster.partHp.jaw).toBe(partAfterHit);
    expect(h.monster.staggerMeter).toBe(0); // stagger never accumulates from DOT (monster is staggered here, so also check no extra events)
    expect(h.bleed).toBeNull();
  });
  it('tier II: hit 16, bleed 3.3 carried → 13 total over 4 pulses', () => {
    const h = dummy(build('fang', null, { fang: 2 }));
    run(h, secs(0.4), { skillPressed: true });
    expect(1400 - h.monster.hp).toBe(16);
    const hp = h.monster.hp;
    run(h, secs(4.2));
    expect(hp - h.monster.hp).toBe(13);
  });
  it('re-applying bleed refreshes the timer and never stacks (one pulse per second, 4 pulses after the last cast)', () => {
    const h = dummy(build('fang', null));
    run(h, secs(0.4), { skillPressed: true });
    run(h, secs(2)); // 2 pulses happen
    h.player.skillCooldown = 0; h.player.stamina = 100;
    drainEvents(h);
    run(h, secs(0.4), { skillPressed: true }); // second cast: hit + bleed restarts
    run(h, secs(4.3));
    const ticks = drainEvents(h).filter((e) => e.type === 'dot_tick');
    // the first bleed's remaining pulses are replaced; total DOT after the second cast = 4 pulses of 3 (plus any pulse landing in the 0.4 s window)
    expect(ticks.length).toBeGreaterThanOrEqual(4);
    expect(ticks.length).toBeLessThanOrEqual(5);
    expect(ticks.every((t) => t.type === 'dot_tick' && t.damage === 3)).toBe(true);
    expect(h.bleed).toBeNull();
  });
  it('passive: normal attack ×1.08 (round 11); tier II ×1.10 (11)', () => {
    const h = dummy(build(null, 'fang'));
    run(h, secs(0.45), { attackPressed: true });
    expect(1400 - h.monster.hp).toBe(11);
    const g = dummy(build(null, 'fang', { fang: 2 }));
    run(g, secs(0.45), { attackPressed: true });
    expect(1400 - g.monster.hp).toBe(11);
  });
  it('passive does not boost the skill', () => {
    const h = dummy(build('ember', 'fang'));
    expect(h.build.skill.id).toBe('ember');
    const g = dummy(build(null, 'fang'));
    run(g, secs(0.5), { skillPressed: true });
    expect(1400 - g.monster.hp).toBe(18); // Focus Strike unaffected by the 1.08 passive
  });
});

describe('ember module', () => {
  it('skill places a zone 100 units ahead; costs 30; no direct damage; cooldown 10', () => {
    const h = dummy(build('ember', null));
    run(h, secs(0.35), { skillPressed: true });
    expect(h.zone).not.toBeNull();
    expect(h.zone!.r).toBe(85);
    expect(Math.hypot(h.zone!.x - h.player.pos.x, h.zone!.y - h.player.pos.y)).toBeCloseTo(100, 0);
    expect(h.monster.hp).toBe(1400);
    expect(100 - h.player.stamina).toBeGreaterThan(29);
    expect(h.player.skillCooldown).toBeGreaterThan(9);
  });
  it('ticks at 1/2/3 s only while the monster is inside; leaving removes the effect', () => {
    const h = dummy(build('ember', null));
    h.monster.pos = { x: 800, y: 380 }; // body overlaps a zone placed ~100 ahead of the player
    run(h, secs(0.35), { skillPressed: true, aim: UP });
    const hp0 = h.monster.hp;
    run(h, secs(3.3), { aim: UP });
    expect(hp0 - h.monster.hp).toBe(18); // 3 × 6
    expect(h.zone).toBeNull();
    // outside the zone: nothing
    const g = dummy(build('ember', null));
    g.monster.pos = { x: 800, y: -400 };
    run(g, secs(0.35), { skillPressed: true });
    const hp1 = g.monster.hp;
    run(g, secs(3.3));
    expect(g.monster.hp).toBe(hp1);
  });
  it('tier II ticks 6.6 (carry → 19 over three ticks); zone never damages parts', () => {
    const h = dummy(build('ember', null, { ember: 2 }));
    h.monster.pos = { x: 800, y: 380 };
    run(h, secs(0.35), { skillPressed: true, aim: UP });
    const hp0 = h.monster.hp, part0 = { ...h.monster.partHp };
    run(h, secs(3.3), { aim: UP });
    expect(hp0 - h.monster.hp).toBe(19);
    expect(h.monster.partHp).toEqual(part0);
  });
  it('passive: skill cooldown ×0.94 (tier I) / ×0.92 (tier II)', () => {
    const a = build('fang', 'ember'); expect(a.skill.cooldown).toBeCloseTo(5.64);
    const b = build('fang', 'ember', { ember: 2 }); expect(b.skill.cooldown).toBeCloseTo(5.52);
  });
  it('a DOT that brings HP to zero ends the hunt as SUCCESS exactly once', () => {
    const h = dummy(build('ember', null));
    h.monster.pos = { x: 800, y: 380 }; h.monster.hp = 5;
    run(h, secs(0.35), { skillPressed: true, aim: UP });
    run(h, secs(1.3), { aim: UP });
    expect(h.status).toBe('SUCCESS');
    expect(drainEvents(h).filter((e) => e.type === 'terminal')).toHaveLength(1);
  });
});

import { describe, expect, it } from 'vitest';
import { MIRE_CRAB, SAIL_LIZARD, MONSTERS } from '../src/data/monsters';
import { createHunt, stepHunt, type HuntState } from '../src/domain/hunt';
import { bodyArmorMultiplier, chooseMove, createMonster, eligibleMoves, moveDamage, moveRecovery, effectiveShape, partWorldPos, stepMonster } from '../src/domain/monster';
import { emptyIntent, type Intent } from '../src/domain/player';
import { BASIC_BUILD } from '../src/domain/build';
import { DT } from './helpers';

const secs = (n: number) => Math.round(n / DT);
function hunt(mission: 'hunt_crab' | 'hunt_sail', build = BASIC_BUILD): HuntState {
  const h = createHunt(3, build, { missionId: mission });
  h.monster.pos = { x: 800, y: 300 }; h.monster.facing = Math.PI / 2;
  return h;
}
const park = (h: HuntState) => { h.monster.phase = 'stagger'; h.monster.t = 0; h.monster.staggerDur = 1e6; };
const run = (h: HuntState, n: number, i: Partial<Intent> = {}) => { for (let f = 0; f < n; f++) stepHunt(h, { ...emptyIntent(), ...i }, DT); };
const startMove = (h: HuntState, id: string) => { h.monster.move = h.monster.def.moves.find((m) => m.id === id)!; h.monster.phase = 'telegraph'; h.monster.t = 0; h.monster.locked = false; };

describe('data sanity', () => {
  it('matches the design doc HP / part table', () => {
    expect([MIRE_CRAB.hp, MIRE_CRAB.parts.map((p) => p.hp)]).toEqual([1700, [300, 220]]);
    expect([SAIL_LIZARD.hp, SAIL_LIZARD.parts.map((p) => p.hp)]).toEqual([1500, [240, 200]]);
    expect(Object.keys(MONSTERS)).toHaveLength(3);
    expect(MIRE_CRAB.moves.map((m) => [m.telegraph, m.active, m.recovery])).toEqual([[0.85, 0.2, 1.0], [0.75, 0.35, 0.9], [1.0, 0.1, 1.2]]);
    expect(SAIL_LIZARD.moves.map((m) => [m.telegraph, m.active, m.recovery, m.damage])).toEqual([[0.9, 0.45, 1.2, 20], [0.7, 0.3, 1.0, 22], [1.0, 0.25, 1.1, 14]]);
  });
});

describe('mire crab', () => {
  it('front hit body damage ×0.8 while the shell is intact; part damage is NOT reduced; rear hit unreduced', () => {
    const m = createMonster(MIRE_CRAB, { x: 800, y: 300 }, 1); m.facing = Math.PI / 2;
    expect(bodyArmorMultiplier(m, { x: 800, y: 450 })).toBe(0.8); // in front (+y)
    expect(bodyArmorMultiplier(m, { x: 800, y: 150 })).toBe(1); // behind
    expect(bodyArmorMultiplier(m, { x: 1000, y: 300 })).toBe(1); // side
    m.broken.push('shell');
    expect(bodyArmorMultiplier(m, { x: 800, y: 450 })).toBe(1);
  });
  it('a real swing from the front: body 10→8, shell part still takes 10', () => {
    const h = hunt('hunt_crab'); park(h);
    h.player.pos = { x: 800, y: 300 + 70 + 20 + 5 };
    const shell = partWorldPos(h.monster, 'shell');
    run(h, secs(0.45), { aim: shell, attackPressed: true });
    expect(1700 - h.monster.hp).toBe(8);
    expect(300 - (h.monster.partHp.shell ?? 0)).toBe(10);
  });
  it('rear hit on the poison sac: full body damage', () => {
    const h = hunt('hunt_crab'); park(h);
    h.player.pos = { x: 700, y: 236 }; // rear-side: the sac is the part nearest the swing tip
    const sac = partWorldPos(h.monster, 'poison_sac');
    run(h, secs(0.45), { aim: sac, attackPressed: true });
    expect(1700 - h.monster.hp).toBe(10);
    expect(220 - (h.monster.partHp.poison_sac ?? 0)).toBe(10);
  });
  it('claw slam hits the circle locked at 70% of the telegraph, not where the player runs afterwards', () => {
    const h = hunt('hunt_crab');
    h.player.pos = { x: 800, y: 450 };
    startMove(h, 'claw_slam');
    run(h, secs(0.85 * 0.8)); // past the lock point
    expect(h.monster.lockTarget).not.toBeNull();
    const lock = { ...h.monster.lockTarget! };
    expect(Math.hypot(lock.x - 800, lock.y - 450)).toBeLessThan(30);
    h.player.pos = { x: 1100, y: 700 }; // runs away before the slam lands
    run(h, secs(0.6));
    expect(h.player.hp).toBe(100);
    // staying inside the locked circle is hit for 24
    const g = hunt('hunt_crab'); g.player.pos = { x: 800, y: 450 }; startMove(g, 'claw_slam');
    run(g, secs(1.3));
    expect(g.player.hp).toBe(76);
  });
  it('side charge: 18 damage; stops on a rock with +0.5 s recovery', () => {
    const h = hunt('hunt_crab'); h.player.pos = { x: 800, y: 560 }; startMove(h, 'side_charge');
    run(h, secs(1.4));
    expect(h.player.hp).toBe(82);
    const b = hunt('hunt_crab'); b.player.pos = { x: 800, y: 900 };
    b.baseWorld = { ...b.baseWorld, obstacles: [{ id: 'r', x: 800, y: 470, r: 40 }] };
    b.monster.pos = { x: 800, y: 300 }; startMove(b, 'side_charge');
    for (let i = 0; i < 100 && b.monster.phase !== 'recovery'; i++) stepMonster(b.monster, b.player.pos, DT, b.baseWorld);
    expect(b.monster.recoveryDur).toBeCloseTo(0.9 + 0.5);
  });
  it('venom puddle: hazard on the locked spot, 4 pulses of 4, invulnerability respected, expires after 4 s', () => {
    const h = hunt('hunt_crab'); h.player.pos = { x: 800, y: 480 }; startMove(h, 'venom_puddle');
    run(h, secs(1.0));
    expect(h.hazards).toHaveLength(1);
    const z = h.hazards[0]!;
    expect(Math.hypot(z.x - 800, z.y - 480)).toBeLessThan(30);
    expect(z.r).toBe(90);
    park(h); // only the hazard matters from here on
    // stand in it for the whole duration: pulses at 1,2,3,4 s → but 0.6 s post-hit invulnerability never blocks 1 s apart pulses
    run(h, secs(4.3));
    expect(h.player.hp).toBe(100 - 16);
    expect(h.hazards).toHaveLength(0);
  });
  it('hazard pulses are skipped by i-frames and never guarded', () => {
    const h = hunt('hunt_crab'); h.player.pos = { x: 800, y: 480 }; startMove(h, 'venom_puddle');
    park(h); // keep the crab out of the way after it spawned the hazard
    h.monster.phase = 'telegraph'; h.monster.t = 0.99; h.monster.locked = true; h.monster.lockTarget = { x: 800, y: 480 };
    run(h, secs(0.2));
    expect(h.hazards).toHaveLength(1);
    h.hazards[0]!.age = 0.95; // next pulse in 0.05 s
    h.player.hurtInvuln = 0.3;
    run(h, secs(0.2));
    expect(h.player.hp).toBe(100); // pulse landed during invulnerability: skipped
  });
  it('poison sac broken: no more puddles (existing ones expire on their own); shell broken: front armor gone', () => {
    const m = createMonster(MIRE_CRAB, { x: 0, y: 0 }, 5); m.broken.push('poison_sac');
    for (let i = 0; i < 60; i++) { const mv = chooseMove(m, 200)!; expect(mv.id).not.toBe('venom_puddle'); m.history.push(mv.id); }
    expect(eligibleMoves(m, 200).map((x) => x.id)).toEqual(['claw_slam', 'side_charge']);
    const h = hunt('hunt_crab');
    h.hazards.push({ x: 0, y: 0, r: 90, damage: 4, duration: 4, interval: 1, age: 0, nextPulse: 1 });
    h.monster.broken.push('poison_sac');
    run(h, secs(1));
    expect(h.hazards).toHaveLength(1);
    run(h, secs(3.5));
    expect(h.hazards).toHaveLength(0);
  });
});

describe('sail lizard', () => {
  it('glide: body ×0.8 only while gliding; wing broken → distance 150 and recovery 1.7', () => {
    const m = createMonster(SAIL_LIZARD, { x: 800, y: 300 }, 1);
    const glide = m.def.moves.find((x) => x.id === 'glide_pass')!;
    m.move = glide; m.phase = 'attack';
    expect(bodyArmorMultiplier(m, { x: 800, y: 500 })).toBe(0.8);
    m.phase = 'recovery';
    expect(bodyArmorMultiplier(m, { x: 800, y: 500 })).toBe(1);
    expect((effectiveShape(m, glide) as { distance: number }).distance).toBe(300);
    expect(moveRecovery(m, glide)).toBeCloseTo(1.2);
    m.broken.push('wing');
    expect((effectiveShape(m, glide) as { distance: number }).distance).toBe(150);
    expect(moveRecovery(m, glide)).toBeCloseTo(1.7);
  });
  it('glide pass travels 300 units, 20 damage; horn broken: ram 16', () => {
    const h = hunt('hunt_sail'); h.player.pos = { x: 800, y: 420 }; startMove(h, 'glide_pass');
    const y0 = h.monster.pos.y;
    run(h, secs(0.9 + 0.5));
    expect(h.player.hp).toBe(80);
    expect(h.monster.pos.y - y0).toBeGreaterThan(280);
    const m = createMonster(SAIL_LIZARD, { x: 0, y: 0 }, 1);
    const ram = m.def.moves.find((x) => x.id === 'horn_ram')!;
    expect(moveDamage(m, ram)).toBe(22);
    m.broken.push('horn');
    expect(moveDamage(m, ram)).toBe(16);
  });
  it('wind ring: 14 + knockback 60 outside the inner 70 radius; safe inside 70 and beyond 180', () => {
    const at = (d: number) => { const h = hunt('hunt_sail'); h.player.pos = { x: 800 + d, y: 300 }; startMove(h, 'wind_ring'); run(h, secs(1.4)); return h; };
    const hit = at(120);
    expect(hit.player.hp).toBe(86);
    expect(hit.player.pos.x).toBeGreaterThan(800 + 120 + 40); // pushed away ~60
    expect(at(200).player.hp).toBe(100);
    expect(at(66).player.hp).toBe(100); // inside the hole (body radius 46 + player 20)
  });
  it('wing / horn breaks resolve with the right effects and bonus ids', () => {
    for (const [part, mat] of [['wing', 'sail_wing'], ['horn', 'blunt_horn']] as const) {
      const h = hunt('hunt_sail'); park(h);
      h.monster.partHp[part] = 10;
      h.player.pos = part === 'horn' ? { x: 800, y: 300 + 78 + 24 + 30 } : { x: 800 - 46 - 20 - 10, y: 300 };
      const t = partWorldPos(h.monster, part);
      run(h, secs(0.45), { aim: t, attackPressed: true });
      expect(h.monster.broken).toContain(part);
      expect(h.monster.def.parts.find((p) => p.id === part)!.bonusMaterialId).toBe(mat);
    }
  });
});

describe('monster stuck handling (§13)', () => {
  it('a monster pinned against a wall of rock sidesteps after 2 s (no teleporting attacks)', () => {
    const m = createMonster(SAIL_LIZARD, { x: 130, y: 500 }, 2); m.facing = 0;
    const world = { width: 1600, height: 1000, obstacles: [{ id: 'wall', x: 520, y: 500, r: 300 }] };
    const player = { x: 1000, y: 500 };
    m.restDur = 1e9; // keep it walking, not attacking
    let moved = false;
    for (let i = 0; i < secs(3.5); i++) { stepMonster(m, player, DT, world); if (Math.abs(m.pos.y - 500) > 20) moved = true; }
    expect(moved).toBe(true);
    expect(m.phase).toBe('approach');
  });
});

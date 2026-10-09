import { describe, expect, it } from 'vitest';
import { PLAYER } from '../src/data/tuning';
import { createPlayer, isInvulnerable, attackPhase, stepPlayer, emptyIntent } from '../src/domain/player';
import { DT, OPEN_WORLD, run } from './helpers';

const mk = () => createPlayer({ x: 1000, y: 1000 });

describe('walking', () => {
  it('moves 220 units/s', () => {
    const p = mk();
    run(p, 1, { moveX: 1 });
    expect(p.pos.x - 1000).toBeCloseTo(220, 0);
  });
  it('normalises diagonals', () => {
    const p = mk();
    run(p, 1, { moveX: 1, moveY: 1 });
    expect(Math.hypot(p.pos.x - 1000, p.pos.y - 1000)).toBeCloseTo(220, 0);
  });
  it('stays inside world bounds and out of rocks', () => {
    const p = createPlayer({ x: 100, y: 100 });
    run(p, 3, { moveX: -1, moveY: -1 });
    expect(p.pos.x).toBeGreaterThanOrEqual(PLAYER.radius);
    const w = { width: 500, height: 500, obstacles: [{ id: 'r', x: 300, y: 100, r: 50 }] };
    const q = createPlayer({ x: 100, y: 100 });
    run(q, 3, { moveX: 1 }, w);
    expect(Math.hypot(q.pos.x - 300, q.pos.y - 100)).toBeGreaterThanOrEqual(50 + PLAYER.radius - 1e-6);
  });
});

describe('dodge', () => {
  it('covers 150 units in 0.30 s and costs 25 stamina', () => {
    const dodgeOnly = mk();
    run(dodgeOnly, 0.3, (i) => ({ moveX: 1, dodgePressed: i === 0 }));
    expect(dodgeOnly.pos.x - 1000).toBeCloseTo(150, 0);
    expect(dodgeOnly.stamina).toBeLessThan(PLAYER.maxStamina - 24);
    expect(dodgeOnly.dodge).toBeNull();
  });
  it('is invulnerable only in 0.05–0.22 s', () => {
    const p = mk();
    stepPlayer(p, { ...emptyIntent(), moveX: 1, dodgePressed: true }, DT, OPEN_WORLD);
    expect(isInvulnerable(p)).toBe(false);
    for (let i = 0; i < 6; i++) stepPlayer(p, { ...emptyIntent(), moveX: 1 }, DT, OPEN_WORLD);
    expect(isInvulnerable(p)).toBe(true);
    for (let i = 0; i < 10; i++) stepPlayer(p, { ...emptyIntent(), moveX: 1 }, DT, OPEN_WORLD);
    expect(isInvulnerable(p)).toBe(false);
  });
  it('enforces 0.65 s cooldown (no dodge spam)', () => {
    const p = mk();
    run(p, 1.2, (i) => ({ moveX: 1, dodgePressed: i % 6 === 0 }));
    // count dodge starts via stamina spent: 100 -> at most 2 dodges in 1.2 s
    const dodges = Math.round((PLAYER.maxStamina - p.stamina) / PLAYER.dodgeCost);
    expect(dodges).toBeLessThanOrEqual(2);
  });
  it('does nothing without stamina and does not start cooldown', () => {
    const p = mk();
    p.stamina = 10;
    run(p, 0.1, { dodgePressed: true });
    expect(p.dodge).toBeNull();
    expect(p.dodgeCooldown).toBe(0);
  });
  it('buffers one dodge pressed up to 0.15 s early', () => {
    const p = mk();
    run(p, 0.3, (i) => ({ moveX: 1, dodgePressed: i === 0 })); // first dodge
    // press again during cooldown such that cooldown ends within the buffer window
    let started = false;
    for (let i = 0; i < 60; i++) {
      stepPlayer(p, { ...emptyIntent(), moveX: 1, dodgePressed: p.dodgeCooldown > 0.1 && p.dodgeCooldown < 0.12 }, DT, OPEN_WORLD);
      if (p.dodge) { started = true; break; }
    }
    expect(started).toBe(true);
  });
});

describe('stamina', () => {
  it('regenerates 20/s only after 0.8 s idle', () => {
    const p = mk();
    run(p, 0.01, { dodgePressed: true });
    const s0 = p.stamina;
    run(p, 0.6, {});
    expect(p.stamina).toBeCloseTo(s0, 5);
    run(p, 1.0, {});
    expect(p.stamina).toBeGreaterThan(s0 + 5);
  });
});

describe('attack', () => {
  it('runs startup 0.18 / active 0.10 / recovery 0.32', () => {
    const p = mk();
    stepPlayer(p, { ...emptyIntent(), attackPressed: true }, DT, OPEN_WORLD);
    expect(attackPhase(p)).toBe('startup');
    run(p, 0.2, {});
    expect(attackPhase(p)).toBe('active');
    run(p, 0.1, {});
    expect(attackPhase(p)).toBe('recovery');
    run(p, 0.35, {});
    expect(p.attack).toBeNull();
  });
  it('dodge cannot cancel startup/active, can cancel late recovery', () => {
    const p = mk();
    stepPlayer(p, { ...emptyIntent(), attackPressed: true }, DT, OPEN_WORLD);
    run(p, 0.05, { dodgePressed: true });
    expect(p.dodge).toBeNull();
    const q = mk();
    stepPlayer(q, { ...emptyIntent(), attackPressed: true }, DT, OPEN_WORLD);
    run(q, 0.45, {});
    expect(q.attack).not.toBeNull();
    stepPlayer(q, { ...emptyIntent(), dodgePressed: true }, DT, OPEN_WORLD);
    expect(q.dodge).not.toBeNull();
    expect(q.attack).toBeNull();
  });
  it('holding attack repeats the cycle with new attack ids', () => {
    const p = mk();
    run(p, 1.3, { attackHeld: true });
    expect(p.attackCounter).toBeGreaterThanOrEqual(2);
  });
  it('locks facing for the swing', () => {
    const p = mk();
    stepPlayer(p, { ...emptyIntent(), attackPressed: true, aim: { x: 2000, y: 1000 } }, DT, OPEN_WORLD);
    run(p, 0.1, { aim: { x: 1000, y: 0 } });
    expect(p.attack?.facing).toBeCloseTo(0, 5);
  });
});

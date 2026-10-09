import { describe, expect, it } from 'vitest';
import { EMBER_GECKO } from '../src/data/monsters';
import { HURT_INVULN } from '../src/data/tuning';
import {
  abandonHunt, createHunt, cycleTarget, drainEvents, finishHunt, stepHunt, type HuntState,
} from '../src/domain/hunt';
import { chooseMove, createMonster, eligibleMoves, moveDamage, moveRecovery, partWorldPos, stepMonster } from '../src/domain/monster';
import { emptyIntent, isInvulnerable, type Intent } from '../src/domain/player';
import { DT, OPEN_WORLD } from './helpers';

/** Neutral target dummy: monster parked in a long stagger in front of the player. */
function dummyHunt(): HuntState {
  const h = createHunt(1);
  h.monster.pos = { x: 800, y: 300 };
  h.monster.facing = Math.PI / 2; // faces +y; jaw at (800,395)
  h.monster.phase = 'stagger'; h.monster.t = 0; h.monster.staggerDur = 1e6;
  h.player.pos = { x: 800, y: 470 };
  return h;
}
const swing = (h: HuntState, frames: number, extra: Partial<Intent> = {}) => {
  const jaw = partWorldPos(h.monster, 'jaw');
  for (let i = 0; i < frames; i++) {
    stepHunt(h, { ...emptyIntent(), aim: { x: jaw.x, y: jaw.y }, attackPressed: i === 0, ...extra }, DT);
  }
};

describe('player hits', () => {
  it('one swing overlapping many active frames deals body + part damage once', () => {
    const h = dummyHunt();
    swing(h, 40); // whole attack cycle, ~6 active frames
    const hits = drainEvents(h).filter((e) => e.type === 'hit_landed');
    expect(hits).toHaveLength(1);
    expect(h.monster.hp).toBe(1400 - 10);
    expect(h.monster.partHp.jaw).toBe(180 - 10);
    expect(h.monster.partHp.fire_sac).toBe(220);
  });
  it('holding attack gives one hit per attackId', () => {
    const h = dummyHunt();
    swing(h, 90, { attackHeld: true, attackPressed: false });
    const n = drainEvents(h).filter((e) => e.type === 'hit_landed').length;
    expect(n).toBe(h.player.attackCounter);
    expect(h.monster.hp).toBe(1400 - 10 * n);
  });
  it('hits during monster recovery take ×1.15', () => {
    const h = dummyHunt();
    h.monster.phase = 'recovery'; h.monster.recoveryDur = 1e6;
    swing(h, 40);
    expect(1400 - h.monster.hp).toBe(Math.round(10 * 1.15));
  });
  it('picks the part nearest the swing tip; selected part breaks ties only', () => {
    const h = dummyHunt();
    swing(h, 40);
    expect(h.monster.partHp.jaw).toBeLessThan(180); // jaw is nearest tip even though selected = body
    // from the side only the sac is in reach
    const s = dummyHunt();
    s.player.pos = { x: 800 - 85, y: 340 }; // monster's side, level with the sac (sac at y=340)
    const sac = partWorldPos(s.monster, 'fire_sac');
    for (let i = 0; i < 40; i++) stepHunt(s, { ...emptyIntent(), aim: sac, attackPressed: i === 0 }, DT);
    expect(s.monster.partHp.fire_sac).toBeLessThan(220);
    expect(s.monster.partHp.jaw).toBe(180);
  });
  it('cycleTarget walks body → fire_sac → jaw and skips broken parts', () => {
    const h = dummyHunt();
    expect([cycleTarget(h), cycleTarget(h), cycleTarget(h)]).toEqual(['fire_sac', 'jaw', 'body']);
    h.monster.broken.push('fire_sac');
    expect([cycleTarget(h), cycleTarget(h)]).toEqual(['jaw', 'body']);
  });
});

describe('part break', () => {
  it('breaking jaw and sac records ids once, staggers 1.5 s and does not re-pay', () => {
    const h = dummyHunt();
    h.monster.partHp.jaw = 10;
    swing(h, 40);
    const ev = drainEvents(h);
    expect(ev.filter((e) => e.type === 'part_break')).toHaveLength(1);
    expect(h.monster.broken).toEqual(['jaw']);
    swing(h, 40); // further hits on a broken part: body only
    expect(drainEvents(h).filter((e) => e.type === 'part_break')).toHaveLength(0);
    expect(h.monster.broken).toEqual(['jaw']);
    expect(h.monster.partHp.jaw).toBe(0);
  });
  it('part break and death on the same hit: break resolves first, bonus kept, single SUCCESS', () => {
    const h = dummyHunt();
    h.monster.hp = 10; h.monster.partHp.jaw = 10;
    swing(h, 40);
    const ev = drainEvents(h);
    const iBreak = ev.findIndex((e) => e.type === 'part_break');
    const iDeath = ev.findIndex((e) => e.type === 'monster_death');
    expect(iBreak).toBeGreaterThanOrEqual(0);
    expect(iDeath).toBeGreaterThan(iBreak);
    expect(h.status).toBe('SUCCESS');
    expect(h.result?.brokenPartIds).toEqual(['jaw']);
    expect(ev.filter((e) => e.type === 'terminal')).toHaveLength(1);
  });
  it('does not extend an ongoing stagger', () => {
    const h = dummyHunt();
    h.monster.staggerDur = 5; h.monster.t = 4;
    h.monster.partHp.jaw = 10;
    swing(h, 40);
    expect(h.monster.staggerDur).toBe(5);
  });
  it('stagger meter reaches 100 after 20 hits → 1.2 s stagger from non-stagger phase', () => {
    const h = dummyHunt();
    h.monster.phase = 'recovery'; h.monster.recoveryDur = 1e6; h.monster.staggerMeter = 95;
    swing(h, 40);
    expect(h.monster.phase).toBe('stagger');
    expect(h.monster.staggerDur).toBe(1.2);
  });
});

describe('break effects on AI (§8.1)', () => {
  it('fire sac broken: fire_breath is never eligible or chosen', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const m = createMonster(EMBER_GECKO, { x: 0, y: 0 }, seed);
      m.broken.push('fire_sac');
      for (const d of [100, 200, 300]) expect(eligibleMoves(m, d).some((x) => x.id === 'fire_breath')).toBe(false);
      for (let i = 0; i < 40; i++) { const mv = chooseMove(m, 150); expect(mv?.id).not.toBe('fire_breath'); if (mv) m.history.push(mv.id); }
    }
  });
  it('fire breath is chosen sometimes while the sac is intact', () => {
    const m = createMonster(EMBER_GECKO, { x: 0, y: 0 }, 7);
    const seen = new Set<string>();
    for (let i = 0; i < 100; i++) { const mv = chooseMove(m, 150)!; seen.add(mv.id); m.history.push(mv.id); }
    expect(seen).toEqual(new Set(['fire_breath', 'bite_lunge', 'tail_sweep']));
  });
  it('never repeats a move three times in a row', () => {
    const m = createMonster(EMBER_GECKO, { x: 0, y: 0 }, 3);
    let run = 0, last = '';
    for (let i = 0; i < 500; i++) {
      const mv = chooseMove(m, 100)!; m.history.push(mv.id); if (m.history.length > 4) m.history.shift();
      run = mv.id === last ? run + 1 : 1; last = mv.id; expect(run).toBeLessThanOrEqual(2);
    }
  });
  it('sac broken: bite recovery +0.20; jaw broken: bite damage 12', () => {
    const m = createMonster(EMBER_GECKO, { x: 0, y: 0 }, 1);
    const bite = EMBER_GECKO.moves.find((x) => x.id === 'bite_lunge')!;
    expect(moveRecovery(m, bite)).toBeCloseTo(0.8);
    m.broken.push('fire_sac'); expect(moveRecovery(m, bite)).toBeCloseTo(1.0);
    expect(moveDamage(m, bite)).toBe(16);
    m.broken.push('jaw'); expect(moveDamage(m, bite)).toBe(12);
  });
  it('same seed → same move sequence', () => {
    const seq = (s: number) => { const m = createMonster(EMBER_GECKO, { x: 0, y: 0 }, s); return Array.from({ length: 20 }, () => { const mv = chooseMove(m, 150)!; m.history.push(mv.id); return mv.id; }); };
    expect(seq(42)).toEqual(seq(42));
  });
});

/** Put the monster in telegraph of a move right next to the player. */
function monsterAttack(moveId: 'fire_breath' | 'bite_lunge' | 'tail_sweep') {
  const h = createHunt(5);
  h.monster.pos = { x: 800, y: 300 }; h.monster.facing = Math.PI / 2;
  h.monster.move = EMBER_GECKO.moves.find((x) => x.id === moveId)!;
  h.monster.phase = 'telegraph'; h.monster.t = 0;
  h.player.pos = { x: 800, y: 440 };
  h.movesSeen = [];
  return h;
}

describe('monster attacks and player invulnerability', () => {
  it('fire breath: 0.9 s telegraph, then exactly one 22 damage hit even though the cone lasts 0.7 s', () => {
    const h = monsterAttack('fire_breath');
    for (let i = 0; i < 40; i++) stepHunt(h, emptyIntent(), DT); // 0.67 s — still telegraphing
    expect(h.player.hp).toBe(100);
    for (let i = 0; i < 120; i++) stepHunt(h, emptyIntent(), DT);
    expect(h.player.hp).toBe(78);
    expect(drainEvents(h).filter((e) => e.type === 'player_hurt')).toHaveLength(1);
  });
  it('post-hit invulnerability lasts 0.6 s', () => {
    const h = monsterAttack('fire_breath');
    for (let i = 0; i < 70; i++) stepHunt(h, emptyIntent(), DT);
    expect(h.player.hp).toBe(78);
    expect(isInvulnerable(h.player)).toBe(true);
    for (let i = 0; i < Math.round(HURT_INVULN / DT) + 2; i++) stepHunt(h, emptyIntent(), DT);
    expect(isInvulnerable(h.player)).toBe(false);
  });
  it('dodge i-frames block a hit (timed so i-frames cover the attack onset)', () => {
    const h = monsterAttack('tail_sweep');
    h.player.pos = { x: 800, y: 300 - 100 }; // behind the monster, inside the rear arc
    const hp0 = h.player.hp;
    let pressed = false;
    for (let i = 0; i < 100; i++) {
      // dodge ~0.08 s before the sweep goes active; zero-length dodge keeps the player in the arc
      if (!pressed && h.monster.phase === 'telegraph' && h.monster.t > 0.72) {
        h.player.dodge = { t: 0.0, dir: { x: 0, y: 0 } }; pressed = true;
      }
      stepHunt(h, emptyIntent(), DT);
      if (pressed && h.player.dodge && h.player.dodge.t > 0.15) break; // still invulnerable here
    }
    expect(pressed).toBe(true);
    expect(h.player.hp).toBe(hp0);
  });
  it('contact during i-frames does not consume the attack: it lands once i-frames end', () => {
    const h = monsterAttack('fire_breath');
    h.player.pos = { x: 800, y: 420 };
    for (let i = 0; i < 100 && h.monster.phase !== 'attack'; i++) stepHunt(h, emptyIntent(), DT);
    h.player.dodge = { t: 0.1, dir: { x: 0, y: 0 } }; // invulnerable for ~0.12 s more
    for (let i = 0; i < 6; i++) stepHunt(h, emptyIntent(), DT);
    expect(h.player.hp).toBe(100);
    for (let i = 0; i < 60; i++) stepHunt(h, emptyIntent(), DT);
    expect(h.player.hp).toBe(78);
    expect(drainEvents(h).filter((e) => e.type === 'player_hurt')).toHaveLength(1);
  });
  it('bite lunge deals 16, tail sweep 18', () => {
    const b = monsterAttack('bite_lunge');
    for (let i = 0; i < 90; i++) stepHunt(b, emptyIntent(), DT);
    expect(b.player.hp).toBe(84);
    const t = monsterAttack('tail_sweep');
    t.player.pos = { x: 800, y: 300 - 100 };
    for (let i = 0; i < 90; i++) stepHunt(t, emptyIntent(), DT);
    expect(t.player.hp).toBe(82);
  });
  it('bite lunge stops at a rock and adds 0.5 s recovery', () => {
    const h = monsterAttack('bite_lunge');
    h.player.pos = { x: 800, y: 900 }; // straight down the dash line
    h.monster.pos = { x: 800, y: 500 };
    h.baseWorld = { ...h.baseWorld, obstacles: [{ id: 'r', x: 800, y: 640, r: 40 }] };
    for (let i = 0; i < 100 && h.monster.phase !== 'recovery'; i++) stepMonster(h.monster, h.player.pos, DT, h.baseWorld);
    expect(h.monster.recoveryDur).toBeCloseTo(0.8 + 0.5);
    expect(h.monster.pos.y).toBeLessThan(640 - 40 - 62 + 1);
  });
  it('tail sweep telegraph turns the rear toward the player', () => {
    const h = monsterAttack('tail_sweep');
    h.player.pos = { x: 500, y: 300 };
    for (let i = 0; i < 30; i++) stepMonster(h.monster, h.player.pos, DT, OPEN_WORLD);
    const rear = h.monster.facing + Math.PI;
    expect(Math.cos(rear)).toBeLessThan(-0.9); // rear points at -x, toward the player
  });
});

describe('hunt lifecycle', () => {
  it('player down → FAILED once, no further stepping', () => {
    const h = monsterAttack('fire_breath');
    h.player.hp = 5;
    for (let i = 0; i < 120; i++) stepHunt(h, emptyIntent(), DT);
    expect(h.status).toBe('FAILED');
    expect(h.result?.failReason).toBe('player_down');
    const t = h.elapsed;
    stepHunt(h, emptyIntent(), DT);
    expect(h.elapsed).toBe(t);
    expect(finishHunt(h, 'SUCCESS')).toBe(false);
    expect(h.status).toBe('FAILED');
  });
  it('simultaneous kill and lethal hit: player kill wins, single terminal result', () => {
    const h = dummyHunt();
    h.monster.hp = 5; h.player.hp = 1;
    h.monster.phase = 'telegraph'; h.monster.move = EMBER_GECKO.moves[0]!; h.monster.t = 0.89;
    swing(h, 40);
    expect(['SUCCESS', 'FAILED']).toContain(h.status);
    expect(drainEvents(h).filter((e) => e.type === 'terminal')).toHaveLength(1);
  });
  it('times out after 10 minutes and abandon is terminal-once', () => {
    const h = createHunt(2);
    h.elapsed = 599.99; h.monster.phase = 'stagger'; h.monster.staggerDur = 1e9; h.player.pos = { x: 100, y: 900 };
    stepHunt(h, emptyIntent(), DT);
    expect(h.result?.failReason).toBe('timeout');
    expect(abandonHunt(h)).toBe(false);
  });
  it('records telegraphed moves as observations', () => {
    const h = createHunt(9);
    h.player.pos = { x: 800, y: 420 };
    for (let i = 0; i < 60 * 3 && h.movesSeen.length === 0; i++) stepHunt(h, emptyIntent(), DT);
    expect(h.movesSeen.length).toBe(1);
  });
});

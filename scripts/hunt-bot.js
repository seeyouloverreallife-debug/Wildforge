// Injected into the page by qa scripts (debug mode). Drives the REAL input pipeline (touch fields + press* edges)
// so the game is played through the same code path as a finger on a phone. Test aid only — not shipped game logic.
// opts: { target: 'body' | undefined, capture: boolean (never attack; set the trap when the animal rests), skill: boolean }
(function installBot(opts) {
  const W = window.__wildforge, api = W.api;
  const stats = { dodges: 0, partPresses: 0, frames: 0, skills: 0, trapSet: false, potions: 0 };
  let lastPart = 0, lastSkill = 0, stopped = false;
  const ang = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);
  const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  function distSeg(p, a, b) { const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy; const t = l2 < 1e-9 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)); return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t)); }
  function threatened(m, mv, p, facing, margin) {
    const sh = mv.shape;
    if (sh.kind === 'dash') {
      const dx = Math.cos(facing), dy = Math.sin(facing), len = sh.distance + sh.headOffset;
      return distSeg(p.pos, m.pos, { x: m.pos.x + dx * len, y: m.pos.y + dy * len }) < sh.hitRadius + 20 + margin;
    }
    if (sh.kind === 'cone') {
      const o = { x: m.pos.x + Math.cos(facing) * 80, y: m.pos.y + Math.sin(facing) * 80 };
      return dist(p.pos, o) < sh.range + 20 + margin && Math.abs(wrap(ang(o, p.pos) - facing)) < (sh.angleDeg * Math.PI) / 360 + 0.25 + margin / 150;
    }
    if (sh.kind === 'rear_arc') return dist(p.pos, m.pos) < sh.range + 20 + margin && Math.abs(wrap(ang(m.pos, p.pos) - (facing + Math.PI))) < (sh.arcDeg * Math.PI) / 360 + 0.15;
    if (sh.kind === 'target_circle') { const c = m.locked && m.lockTarget ? m.lockTarget : p.pos; return dist(p.pos, c) < sh.radius + 20 + margin; }
    if (sh.kind === 'annulus') { const d = dist(p.pos, m.pos); return d > sh.inner - 25 && d < sh.outer + 25; }
    return false; // puddles are handled as hazards
  }
  function away(from, p) { const d = dist(from, p) || 1; return { x: (p.x - from.x) / d, y: (p.y - from.y) / d }; }
  function tick() {
    if (stopped) return;
    requestAnimationFrame(tick);
    const h = W.hunt, p = h.player, m = h.monster, inp = W.input, t = inp.touch;
    stats.frames++;
    if (h.status !== 'ACTIVE' || W.pause.paused || m.phase === 'dead' || m.phase === 'captured') { t.moveX = t.moveY = 0; t.attackHeld = false; return; }
    const reach = h.build.weaponId === 'branch_spear' ? 140 : 90;
    const now = performance.now();

    // heal when low and nothing is about to hit (potion is cancelled by damage)
    if (p.hp <= 55 && h.potions > 0 && !p.channel && (m.phase === 'recovery' || m.phase === 'stagger' || m.phase === 'approach') && now - (stats.lastPotion || 0) > 1500) { inp.pressPotion(); stats.potions++; stats.lastPotion = now; }

    // stand clear of puddles: pick the free direction that gets farthest out (the crab body can block the obvious one)
    for (const z of h.hazards) {
      if (dist(p.pos, z) < z.r + 28) {
        let best = null, bestScore = -1e9;
        for (let k = 0; k < 16; k++) {
          const a = (k * Math.PI) / 8, q = { x: p.pos.x + Math.cos(a) * 70, y: p.pos.y + Math.sin(a) * 70 };
          if (dist(q, m.pos) < m.def.bodyRadius + 26 || q.x < 40 || q.x > 1560 || q.y < 40 || q.y > 960) continue;
          if ([[520, 420, 60], [1130, 560, 70]].some(([rx, ry, rr]) => dist(q, { x: rx, y: ry }) < rr + 24)) continue;
          const score = Math.min(...h.hazards.map((hz) => dist(q, hz) - hz.r));
          if (score > bestScore) { bestScore = score; best = a; }
        }
        if (best !== null) { t.moveX = Math.cos(best); t.moveY = Math.sin(best); } else { const a = away(z, p.pos); t.moveX = a.x; t.moveY = a.y; }
        t.attackHeld = false;
        if (p.stamina >= 25 && p.dodgeCooldown <= 0 && !p.dodge && z.nextPulse - z.age < 0.25 && now - (stats.lastHazDodge || 0) > 700) { inp.pressDodge(); stats.dodges++; stats.lastHazDodge = now; }
        return;
      }
    }
    // dodge / sidestep monster attacks
    if ((m.phase === 'telegraph' || m.phase === 'attack') && m.move) {
      const mv = m.move, toP = ang(m.pos, p.pos);
      const tracking = m.phase === 'telegraph' && !m.locked;
      const facing = tracking ? (mv.shape.kind === 'rear_arc' ? toP + Math.PI : toP) : m.facing;
      if (threatened(m, mv, p, facing, 25)) {
        let e;
        if (mv.shape.kind === 'rear_arc' || mv.shape.kind === 'annulus') e = away(m.pos, p.pos);
        else if (mv.shape.kind === 'target_circle') {
          const c = m.locked && m.lockTarget ? m.lockTarget : p.pos;
          let best = null, bestScore = -1e9;
          for (let k = 0; k < 16; k++) {
            const a = (k * Math.PI) / 8, q = { x: p.pos.x + Math.cos(a) * 150, y: p.pos.y + Math.sin(a) * 150 };
            if (dist(q, m.pos) < m.def.bodyRadius + 26 || q.x < 40 || q.x > 1560 || q.y < 40 || q.y > 960) continue;
            if ([[520, 420, 60], [1130, 560, 70]].some(([rx, ry, rr]) => dist(q, { x: rx, y: ry }) < rr + 24)) continue;
            const sc = dist(q, c);
            if (sc > bestScore) { bestScore = sc; best = a; }
          }
          e = best === null ? away(c, p.pos) : { x: Math.cos(best), y: Math.sin(best) };
        }
        else {
          const s = [Math.PI / 2, -Math.PI / 2].map((o) => ({ o, x: p.pos.x + Math.cos(facing + o) * 150, y: p.pos.y + Math.sin(facing + o) * 150 }))
            .sort((a, b) => (Math.min(a.x, 1600 - a.x, a.y, 1000 - a.y) < 40) - (Math.min(b.x, 1600 - b.x, b.y, 1000 - b.y) < 40))[0];
          e = { x: Math.cos(facing + s.o), y: Math.sin(facing + s.o) };
        }
        if (e.x === 0 && e.y === 0) e = { x: 1, y: 0 };
        t.moveX = e.x; t.moveY = e.y; t.attackHeld = false;
        const remaining = m.phase === 'telegraph' ? mv.telegraph - m.t : 0;
        if (remaining <= 0.14 && p.stamina >= 25 && p.dodgeCooldown <= 0 && !p.dodge) { inp.pressDodge(); stats.dodges++; }
        return;
      }
    }

    const parts = m.def.parts.filter((x) => !m.broken.includes(x.id));
    const want = opts.target === 'body' || !parts.length ? 'body' : parts[0].id;
    if (h.selected !== want && now - lastPart > 140) { inp.pressPart(); lastPart = now; stats.partPresses++; }
    const tp = want === 'body' ? m.pos : api.partWorldPos(m, want);
    const r = want === 'body' ? m.def.bodyRadius : m.def.parts.find((x) => x.id === want).radius;
    let dx = tp.x - p.pos.x, dy = tp.y - p.pos.y, d = Math.hypot(dx, dy), gap = d - r;
    // never walk into / stand in a puddle: pick another spot around the target to fight from
    const inHaz = (x, y) => h.hazards.some((z) => Math.hypot(x - z.x, y - z.y) < z.r + 32);
    const standR = r + (h.build.weaponId === 'branch_spear' ? 140 : 90) - 22;
    const base = Math.atan2(p.pos.y - tp.y, p.pos.x - tp.x);
    if (h.hazards.length && !opts.capture) {
      for (const off of [0, 0.7, -0.7, 1.4, -1.4, 2.1, -2.1, 3.14]) {
        const sx = tp.x + Math.cos(base + off) * standR, sy = tp.y + Math.sin(base + off) * standR;
        if (!inHaz(sx, sy) && sx > 40 && sx < 1560 && sy > 40 && sy < 960) { dx = sx - p.pos.x; dy = sy - p.pos.y; d = Math.hypot(dx, dy); gap = Math.hypot(tp.x - p.pos.x, tp.y - p.pos.y) - r; if (d < 14) { dx = 0; dy = 0; d = 1; } break; }
      }
    }

    if (opts.capture) {
      // keep the animal alive: never attack. When it rests close by, set the trap once.
      const resting = m.phase === 'recovery' || m.phase === 'stagger';
      if (gap > 55) { t.moveX = dx / d; t.moveY = dy / d; } else { t.moveX = 0; t.moveY = 0; }
      t.attackHeld = false;
      if (h.trapCharge && !h.trap && !p.channel && !p.dodge && !p.attack && resting && m.t < 0.4 && dist(p.pos, m.pos) < 150 && now - (stats.lastTrap || 0) > 500) { inp.pressCapture(); stats.trapSet = true; stats.lastTrap = now; }
      return;
    }
    if (h.hazards.length ? (Math.hypot(dx, dy) > 14) : gap > reach - 28) { t.moveX = dx / d; t.moveY = dy / d; } else { t.moveX = 0; t.moveY = 0; }
    const inRange = gap <= reach - 12;
    t.attackHeld = inRange;
    if (opts.skill && inRange && p.skillCooldown <= 0 && p.stamina >= h.build.skill.cost + 10 && now - lastSkill > 400) { inp.pressSkill(); lastSkill = now; stats.skills++; }
  }
  tick();
  window.__bot = { stats, stop() { stopped = true; const t = W.input.touch; t.moveX = t.moveY = 0; t.attackHeld = false; } };
})

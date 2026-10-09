// Injected into the page by qa scripts (debug mode). Drives the REAL input pipeline (touch fields + pressDodge/pressPart)
// so the game is played through the same code path as a finger on a phone. Test aid only — not shipped game logic.
(function installBot(opts) {
  const W = window.__wildforge, api = W.api;
  const stats = { dodges: 0, partPresses: 0, frames: 0 };
  let lastPart = 0, stopped = false;
  const ang = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);
  const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  function threatened(m, mv, p, facing, margin) {
    const sh = mv.shape;
    if (sh.kind === 'dash') {
      const dx = Math.cos(facing), dy = Math.sin(facing), len = sh.distance + sh.headOffset;
      const rx = p.pos.x - m.pos.x, ry = p.pos.y - m.pos.y;
      const t = Math.max(0, Math.min(len, rx * dx + ry * dy));
      return Math.hypot(rx - dx * t, ry - dy * t) < sh.hitRadius + 20 + margin;
    }
    if (sh.kind === 'cone') {
      const o = { x: m.pos.x + Math.cos(facing) * 80, y: m.pos.y + Math.sin(facing) * 80 };
      const d = Math.hypot(p.pos.x - o.x, p.pos.y - o.y);
      return d < sh.range + 20 + margin && Math.abs(wrap(ang(o, p.pos) - facing)) < (sh.angleDeg * Math.PI) / 360 + 0.25 + margin / 150;
    }
    const d = Math.hypot(p.pos.x - m.pos.x, p.pos.y - m.pos.y);
    return d < sh.range + 20 + margin && Math.abs(wrap(ang(m.pos, p.pos) - (facing + Math.PI))) < (sh.arcDeg * Math.PI) / 360 + 0.15;
  }
  function tick() {
    if (stopped) return;
    requestAnimationFrame(tick);
    const h = W.hunt, p = h.player, m = h.monster, inp = W.input, t = inp.touch;
    stats.frames++;
    if (h.status !== 'ACTIVE' || W.pause.paused) { t.moveX = t.moveY = 0; t.attackHeld = false; return; }
    const want = opts.target === 'body' ? 'body' : !m.broken.includes('fire_sac') ? 'fire_sac' : !m.broken.includes('jaw') ? 'jaw' : 'body';
    const now = performance.now();
    if (h.selected !== want && now - lastPart > 140) { inp.pressPart(); lastPart = now; stats.partPresses++; }
    const tp = want === 'body' ? m.pos : api.partWorldPos(m, want);
    const r = want === 'body' ? m.def.bodyRadius : m.def.parts.find((x) => x.id === want).radius;

    if ((m.phase === 'telegraph' || m.phase === 'attack') && m.move) {
      const mv = m.move, toP = ang(m.pos, p.pos);
      const tracking = m.phase === 'telegraph' && m.t / mv.telegraph < mv.lockAt;
      const facing = tracking ? (mv.shape.kind === 'rear_arc' ? toP + Math.PI : toP) : m.facing;
      if (threatened(m, mv, p, facing, 25)) {
        let ex, ey;
        if (mv.shape.kind === 'rear_arc') { ex = Math.cos(toP); ey = Math.sin(toP); }
        else { const s = [Math.PI / 2, -Math.PI / 2].map((o) => ({ o, x: p.pos.x + Math.cos(facing + o) * 150, y: p.pos.y + Math.sin(facing + o) * 150 }))
          .sort((a, b) => (Math.min(a.x, 1600 - a.x, a.y, 1000 - a.y) < 40) - (Math.min(b.x, 1600 - b.x, b.y, 1000 - b.y) < 40) )[0];
          ex = Math.cos(facing + s.o); ey = Math.sin(facing + s.o); }
        t.moveX = ex; t.moveY = ey; t.attackHeld = false;
        const remaining = m.phase === 'telegraph' ? mv.telegraph - m.t : 0;
        if (remaining <= 0.14 && p.stamina >= 25 && p.dodgeCooldown <= 0 && !p.dodge) { inp.pressDodge(); stats.dodges++; }
        return;
      }
    }
    const dx = tp.x - p.pos.x, dy = tp.y - p.pos.y, d = Math.hypot(dx, dy), gap = d - r;
    if (gap > 62) { t.moveX = dx / d; t.moveY = dy / d; } else { t.moveX = 0; t.moveY = 0; }
    t.attackHeld = gap <= 78 && m.phase !== 'dead';
  }
  tick();
  window.__bot = { stats, stop() { stopped = true; const t = W.input.touch; t.moveX = t.moveY = 0; t.attackHeld = false; } };
})

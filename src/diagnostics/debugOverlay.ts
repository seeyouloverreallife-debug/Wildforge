import { attackPhase, isInvulnerable } from '../domain/player';
import type { FrameInfo } from '../engine/scenes/ArenaScene';
import type { InputController } from '../engine/input/InputController';

export class DebugOverlay {
  private visible = false;
  constructor(private readonly el: HTMLElement, private readonly input: InputController) {
    const q = new URLSearchParams(location.search);
    if (q.get('debug') === '1') this.set(true);
    window.addEventListener('keydown', (e) => { if (e.code === 'F3' || e.code === 'Backquote') { e.preventDefault(); this.set(!this.visible); } });
  }
  set(v: boolean): void { this.visible = v; this.el.hidden = !v; }
  update(f: FrameInfo): void {
    if (!this.visible) return;
    const p = f.hunt.player;
    const m = f.hunt.monster;
    const s = this.input.snapshot();
    this.el.textContent = [
      `fps ${f.fps.toFixed(0)}  steps ${f.stepsLastFrame}  zoom ${f.zoom.toFixed(2)}  ${f.paused ? 'PAUSED' : 'run'}`,
      `pos ${p.pos.x.toFixed(0)},${p.pos.y.toFixed(0)}  face ${((p.facing * 180) / Math.PI).toFixed(0)}°`,
      `stam ${p.stamina.toFixed(0)}  dodge ${p.dodge ? p.dodge.t.toFixed(2) : '-'}  cd ${p.dodgeCooldown.toFixed(2)}  inv ${isInvulnerable(p) ? 'Y' : 'n'}`,
      `atk ${attackPhase(p) ?? '-'}  #${p.attackCounter}  buf ${p.buffer?.kind ?? '-'}`,
      `mon ${m.phase}${m.move ? ':' + m.move.id : ''} t${m.t.toFixed(2)} hp ${m.hp} parts ${JSON.stringify(m.partHp)} stg ${m.staggerMeter.toFixed(0)}  hunt ${f.hunt.status} ${f.hunt.elapsed.toFixed(1)}s`,
      `keys [${s.keys.join(' ')}] mouse ${s.mouseHeld ? 'down' : 'up'} touch ${s.touch.moveX.toFixed(2)},${s.touch.moveY.toFixed(2)} atk ${s.touch.attackHeld ? 1 : 0}`,
    ].join('\n');
  }
}

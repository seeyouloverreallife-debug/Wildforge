/** Fixed-timestep accumulator. Delta is clamped and catch-up is bounded so the world never speeds up. */
export class FixedStepper {
  private acc = 0;
  readonly dt: number;

  constructor(hz: number, private readonly maxDeltaMs: number, private readonly maxSteps: number) {
    this.dt = 1 / hz;
  }

  /** Returns number of fixed steps to run for this frame. */
  advance(deltaMs: number): number {
    const d = Math.min(Math.max(deltaMs, 0), this.maxDeltaMs) / 1000;
    this.acc += d;
    let steps = 0;
    while (this.acc >= this.dt - 1e-9 && steps < this.maxSteps) {
      this.acc -= this.dt;
      steps++;
    }
    if (steps === this.maxSteps) this.acc = Math.min(this.acc, this.dt); // drop excess backlog
    if (this.acc < 0) this.acc = 0;
    return steps;
  }

  /** Render interpolation factor 0..1. */
  get alpha(): number { return Math.min(1, this.acc / this.dt); }

  reset(): void { this.acc = 0; }
}

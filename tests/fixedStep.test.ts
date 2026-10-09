import { describe, expect, it } from 'vitest';
import { FixedStepper } from '../src/domain/fixedStep';

describe('FixedStepper', () => {
  it('yields the same sim time regardless of frame rate', () => {
    for (const frameMs of [8.33, 16.67, 33.3]) {
      const s = new FixedStepper(60, 100, 5);
      let steps = 0;
      for (let t = 0; t < 10000; t += frameMs) steps += s.advance(frameMs);
      expect(steps / 60).toBeGreaterThan(9.9);
      expect(steps / 60).toBeLessThanOrEqual(10.05);
    }
  });
  it('clamps long frames and bounds catch-up', () => {
    const s = new FixedStepper(60, 100, 5);
    expect(s.advance(5000)).toBeLessThanOrEqual(5);
    expect(s.advance(0)).toBeLessThanOrEqual(1);
  });
});

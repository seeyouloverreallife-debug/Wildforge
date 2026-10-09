import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, sanitizeSettings } from '../src/persistence/settings';

describe('sanitizeSettings', () => {
  it('falls back to defaults for junk', () => {
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings({ screenShake: 'x', reducedEffects: 3 })).toEqual(DEFAULT_SETTINGS);
  });
  it('clamps numbers to 0..1', () => {
    const s = sanitizeSettings({ screenShake: 9, sfxVolume: -2, musicVolume: NaN });
    expect(s.screenShake).toBe(1);
    expect(s.sfxVolume).toBe(0);
    expect(s.musicVolume).toBe(DEFAULT_SETTINGS.musicVolume);
  });
});

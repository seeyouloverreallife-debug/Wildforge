export interface Settings { musicVolume: number; sfxVolume: number; screenShake: number; reducedEffects: boolean }

export const DEFAULT_SETTINGS: Settings = { musicVolume: 0.5, sfxVolume: 0.7, screenShake: 0.3, reducedEffects: false };
const KEY = 'wildforge.settings.v1';

const num = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : d);

/** Validate unknown data into Settings; bad fields fall back to defaults. */
export function sanitizeSettings(raw: unknown): Settings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    musicVolume: num(r.musicVolume, DEFAULT_SETTINGS.musicVolume),
    sfxVolume: num(r.sfxVolume, DEFAULT_SETTINGS.sfxVolume),
    screenShake: num(r.screenShake, DEFAULT_SETTINGS.screenShake),
    reducedEffects: typeof r.reducedEffects === 'boolean' ? r.reducedEffects : DEFAULT_SETTINGS.reducedEffects,
  };
}

export function loadSettings(): Settings {
  try {
    const s = localStorage.getItem(KEY);
    return s ? sanitizeSettings(JSON.parse(s)) : { ...DEFAULT_SETTINGS };
  } catch { return { ...DEFAULT_SETTINGS }; }
}

/** Returns false when storage is unavailable (private mode / quota). */
export function saveSettings(s: Settings): boolean {
  try { localStorage.setItem(KEY, JSON.stringify(s)); return true; } catch { return false; }
}

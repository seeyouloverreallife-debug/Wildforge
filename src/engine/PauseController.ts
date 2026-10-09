/**
 * Single source of truth for "is simulation running".
 * `manual` = user pause or lost focus (sticky until Resume); `settings` and `portrait` are transient.
 */
export type PauseCause = 'user' | 'focus' | null;

export class PauseController {
  private manualCause: PauseCause = null;
  settingsOpen = false;
  portrait = false;
  private listeners: Array<() => void> = [];

  get paused(): boolean { return this.manualCause !== null || this.settingsOpen || this.portrait; }
  get cause(): PauseCause { return this.manualCause; }

  pause(cause: Exclude<PauseCause, null>): void {
    // Keep 'focus' as the reason if focus was lost, so the player is told why.
    if (this.manualCause === 'focus' && cause === 'user') return;
    this.manualCause = cause; this.emit();
  }
  resume(): void { this.manualCause = null; this.emit(); }
  setSettingsOpen(v: boolean): void { this.settingsOpen = v; this.emit(); }
  setPortrait(v: boolean): void { if (this.portrait !== v) { this.portrait = v; this.emit(); } }
  onChange(f: () => void): void { this.listeners.push(f); }
  private emit(): void { this.listeners.forEach((f) => f()); }
}

import { SCHEMA_VERSION } from '../data/content';
import { cloneSave, newSave, validateSave, type SaveData } from '../domain/save';

/** Minimal storage surface; any method may throw (private mode, quota, disabled). */
export interface KV { get(key: string): string | null; set(key: string, value: string): void; remove(key: string): void }

export const PRIMARY_KEY = 'wildforge.save.primary';
export const BACKUP_KEY = 'wildforge.save.backup';
const PROBE_KEY = 'wildforge.probe';

export const localStorageKV = (): KV | null => {
  try {
    const ls = window.localStorage;
    ls.setItem(PROBE_KEY, '1'); ls.removeItem(PROBE_KEY);
    return { get: (k) => ls.getItem(k), set: (k, v) => ls.setItem(k, v), remove: (k) => ls.removeItem(k) };
  } catch { return null; }
};

export interface Envelope { format: 'wildforge-save'; savedAt: string; schemaVersion: number; revision: number; checksum: string; payload: SaveData }

/** FNV-1a 32-bit. Detects accidental corruption only; it is not anti-cheat (§20). */
export function checksum(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export const makeEnvelope = (save: SaveData, revision: number, savedAt: string): Envelope => ({
  format: 'wildforge-save', savedAt, schemaVersion: SCHEMA_VERSION, revision, checksum: checksum(JSON.stringify(save)), payload: save,
});

export type Parsed = { ok: true; env: Envelope } | { ok: false; reason: string };

export function parseEnvelope(text: string): Parsed {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return { ok: false, reason: 'อ่าน JSON ไม่ได้' }; }
  if (!raw || typeof raw !== 'object') return { ok: false, reason: 'รูปแบบไฟล์ไม่ถูกต้อง' };
  const r = raw as Record<string, unknown>;
  if (r.format !== 'wildforge-save') {
    // bare SaveData (no envelope) is accepted for import only when it validates
    const v = validateSave(raw);
    return v.ok ? { ok: true, env: makeEnvelope(v.data, 0, new Date(0).toISOString()) } : { ok: false, reason: v.reason };
  }
  if (typeof r.schemaVersion !== 'number' || r.schemaVersion > SCHEMA_VERSION) return { ok: false, reason: `เซฟมาจากเกมรุ่นใหม่กว่า (schema ${String(r.schemaVersion)})` };
  const v = validateSave(r.payload);
  if (!v.ok) return { ok: false, reason: v.reason };
  if (typeof r.checksum !== 'string' || r.checksum !== checksum(JSON.stringify(r.payload))) return { ok: false, reason: 'checksum ไม่ตรง (ไฟล์เสียหายหรือถูกแก้)' };
  if (typeof r.revision !== 'number' || !Number.isInteger(r.revision) || r.revision < 0) return { ok: false, reason: 'revision ไม่ถูกต้อง' };
  return { ok: true, env: { format: 'wildforge-save', savedAt: String(r.savedAt), schemaVersion: SCHEMA_VERSION, revision: r.revision, checksum: r.checksum, payload: v.data } };
}

export type LoadStatus = 'new' | 'ok' | 'recovered_backup' | 'corrupt' | 'volatile';
export type CommitResult = { ok: true; persisted: boolean } | { ok: false; error: string; conflict?: boolean };

export class SaveManager {
  state: SaveData = newSave();
  revision = 0;
  status: LoadStatus = 'new';
  /** raw text of primary/backup if they existed but could not be read (so the player can export them) */
  raw: { primary: string | null; backup: string | null } = { primary: null, backup: null };
  conflict = false;
  /** last attempted write failed and nothing newer is persisted */
  unsaved = false;
  private recoveredFrom: Envelope | null = null;

  constructor(private readonly kv: KV | null, private readonly now: () => Date = () => new Date()) {}

  load(): LoadStatus {
    if (!this.kv) { this.status = 'volatile'; return this.status; }
    let primary: string | null, backup: string | null;
    try { primary = this.kv.get(PRIMARY_KEY); backup = this.kv.get(BACKUP_KEY); } catch { this.status = 'volatile'; return this.status; }
    if (primary === null && backup === null) { this.status = 'new'; return this.status; }
    const p = primary !== null ? parseEnvelope(primary) : null;
    if (p?.ok) { this.state = p.env.payload; this.revision = p.env.revision; this.status = 'ok'; return this.status; }
    const b = backup !== null ? parseEnvelope(backup) : null;
    this.raw = { primary, backup };
    if (b?.ok) {
      // Keep the damaged primary untouched until the player confirms recovery.
      this.state = b.env.payload; this.revision = b.env.revision; this.recoveredFrom = b.env; this.status = 'recovered_backup';
      return this.status;
    }
    this.status = 'corrupt';
    return this.status;
  }

  get persisted(): boolean { return this.status !== 'volatile' && !this.unsaved; }
  get writable(): boolean { return this.status !== 'corrupt' && this.status !== 'recovered_backup' && !this.conflict; }

  /** Confirm restore from backup: write it back as the new primary. */
  acceptRecovery(): CommitResult {
    if (this.status !== 'recovered_backup' || !this.recoveredFrom) return { ok: false, error: 'ไม่มีอะไรให้กู้' };
    this.status = 'ok';
    const r = this.write(this.state, this.revision + 1, false);
    if (!r.ok) this.status = 'recovered_backup';
    return r;
  }

  /** Player explicitly chose to discard unreadable data and start over (raw data stays exportable until then). */
  startFresh(): CommitResult {
    const prev = this.status;
    this.status = 'ok'; this.state = newSave();
    const r = this.write(this.state, this.revision + 1, false);
    if (!r.ok) { this.status = prev; }
    else this.raw = { primary: null, backup: null };
    return r;
  }

  /** Atomic update: the in-memory state only changes if the write is verified (or storage is volatile). */
  commit(next: SaveData): CommitResult {
    if (this.status === 'corrupt') return { ok: false, error: 'เซฟเสียหาย — เลือกกู้/เริ่มใหม่/นำเข้าก่อน' };
    if (this.status === 'recovered_backup') return { ok: false, error: 'ต้องยืนยันการกู้เซฟจาก backup ก่อน' };
    if (this.conflict) return { ok: false, error: 'พบการใช้งานจากอีกแท็บ — โหลดใหม่หรือส่งออกเซฟก่อน', conflict: true };
    const v = validateSave(next);
    if (!v.ok) return { ok: false, error: `ข้อมูลไม่ถูกต้อง: ${v.reason}` };
    return this.write(v.data, this.revision + 1, true);
  }

  private write(next: SaveData, rev: number, checkRevision: boolean): CommitResult {
    if (!this.kv || this.status === 'volatile') { this.state = cloneSave(next); this.revision = rev; return { ok: true, persisted: false }; }
    const kv = this.kv;
    let before: string | null = null;
    try { before = kv.get(PRIMARY_KEY); } catch { /* handled by write failure below */ }
    if (checkRevision && before !== null) {
      const cur = parseEnvelope(before);
      if (cur.ok && cur.env.revision !== this.revision) { this.conflict = true; return { ok: false, error: 'พบการใช้งานจากอีกแท็บ — โหลดใหม่หรือส่งออกเซฟก่อน', conflict: true }; }
    }
    const env = makeEnvelope(next, rev, this.now().toISOString());
    const text = JSON.stringify(env);
    try {
      if (before !== null && parseEnvelope(before).ok) kv.set(BACKUP_KEY, before); // keep last valid primary as backup
      kv.set(PRIMARY_KEY, text);
      const back = kv.get(PRIMARY_KEY);
      const parsed = back !== null ? parseEnvelope(back) : null;
      if (!parsed?.ok || parsed.env.revision !== rev || parsed.env.checksum !== env.checksum) throw new Error('read-back mismatch');
    } catch {
      try { if (before !== null) kv.set(PRIMARY_KEY, before); } catch { /* best effort */ }
      this.unsaved = true;
      return { ok: false, error: 'บันทึกไม่สำเร็จ (พื้นที่เก็บข้อมูลใช้ไม่ได้หรือเต็ม)' };
    }
    this.state = cloneSave(next); this.revision = rev; this.unsaved = false;
    return { ok: true, persisted: true };
  }

  /** Another tab wrote the primary key. */
  noteForeignWrite(): void { this.conflict = true; }

  exportText(): string { return JSON.stringify(makeEnvelope(this.state, this.revision, this.now().toISOString()), null, 2); }
  exportRaw(): string { return JSON.stringify({ primary: this.raw.primary, backup: this.raw.backup }, null, 2); }

  /** Parse + validate in memory only; nothing is written (§20). */
  previewImport(text: string): { ok: true; save: SaveData; lines: string[] } | { ok: false; reason: string } {
    const p = parseEnvelope(text);
    if (!p.ok) return p;
    const s = p.env.payload;
    const mods = Object.entries(s.modules).map(([k, v]) => `${k} ระดับ ${v!.tier}`);
    return {
      ok: true, save: s,
      lines: [
        `วัสดุ: ${Object.entries(s.materials).filter(([, n]) => n > 0).map(([k, n]) => `${k}×${n}`).join(', ') || 'ไม่มี'}`,
        `โมดูล: ${mods.join(', ') || 'ไม่มี'}`,
        `Research: ${s.research}`,
        `บันทึกเมื่อ: ${p.env.savedAt}`,
      ],
    };
  }

  /** Replace everything with the previewed save (current primary becomes the backup). Never merges counts. */
  applyImport(save: SaveData): CommitResult {
    const wasBlocked = this.status === 'corrupt' || this.status === 'recovered_backup';
    const prev = this.status;
    if (wasBlocked) this.status = 'ok';
    const imported = cloneSave(save);
    imported.pendingHunt = null;
    const r = this.write(imported, this.revision + 1, !wasBlocked && !this.conflict);
    if (!r.ok && wasBlocked) this.status = prev;
    if (r.ok) this.conflict = false;
    return r;
  }
}

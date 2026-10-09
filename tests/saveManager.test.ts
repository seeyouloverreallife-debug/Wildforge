import { describe, expect, it } from 'vitest';
import type { HuntResult } from '../src/domain/hunt';
import { craftOrUpgrade } from '../src/domain/crafting';
import { cloneSave, newSave } from '../src/domain/save';
import { settleHunt } from '../src/domain/rewards';
import { BACKUP_KEY, PRIMARY_KEY, SaveManager, checksum, parseEnvelope, type KV } from '../src/persistence/saveManager';

class MemKV implements KV {
  data = new Map<string, string>();
  failSet = false; failGet = false;
  get(k: string) { if (this.failGet) throw new Error('get'); return this.data.get(k) ?? null; }
  set(k: string, v: string) { if (this.failSet) throw new Error('quota'); this.data.set(k, v); }
  remove(k: string) { this.data.delete(k); }
}
const mgr = (kv: KV | null) => { const m = new SaveManager(kv, () => new Date('2026-10-09T00:00:00Z')); m.load(); return m; };
const rich = () => { const s = cloneSave(newSave()); s.materials.heat_bladder = 5; return s; };

describe('SaveManager', () => {
  it('commit writes primary, read-back verified; reload sees the same state', () => {
    const kv = new MemKV(); const a = mgr(kv);
    expect(a.status).toBe('new');
    expect(a.commit(rich())).toEqual({ ok: true, persisted: true });
    const b = mgr(kv);
    expect(b.status).toBe('ok');
    expect(b.state.materials.heat_bladder).toBe(5);
  });
  it('keeps previous valid primary as backup', () => {
    const kv = new MemKV(); const a = mgr(kv);
    a.commit(rich());
    const s2 = cloneSave(a.state); s2.materials.fang = 3; a.commit(s2);
    const bk = parseEnvelope(kv.data.get(BACKUP_KEY)!);
    expect(bk.ok && bk.env.payload.materials.fang).toBe(0);
  });
  it('write failure: reports error, runtime state NOT committed, no fake success; retry then works', () => {
    const kv = new MemKV(); const a = mgr(kv); a.commit(rich());
    const next = cloneSave(a.state); next.materials.fang = 9;
    kv.failSet = true;
    const r = a.commit(next);
    expect(r.ok).toBe(false);
    expect(a.state.materials.fang).toBe(0);
    expect(a.unsaved).toBe(true);
    kv.failSet = false;
    expect(a.commit(next).ok).toBe(true);
    expect(a.state.materials.fang).toBe(9);
    expect(a.unsaved).toBe(false);
  });
  it('settlement save failure then retry pays exactly once', () => {
    const kv = new MemKV(); const a = mgr(kv);
    const res: HuntResult = { huntId: 'h1', outcome: 'success', failReason: null, elapsed: 100, brokenPartIds: [], movesSeen: [] };
    const ctx = { missionId: 'hunt_gecko', targetMaterialId: 'fang' } as const;
    kv.failSet = true;
    const s1 = settleHunt(a.state, { ...res, brokenPartIds: [] }, ctx);
    if (s1.kind !== 'settled') throw new Error();
    expect(a.commit(s1.save).ok).toBe(false);
    kv.failSet = false;
    const s2 = settleHunt(a.state, { ...res, brokenPartIds: [] }, ctx); // retry recomputes from the uncommitted state
    if (s2.kind !== 'settled') throw new Error();
    expect(a.commit(s2.save).ok).toBe(true);
    expect(a.state.materials.fang).toBe(2);
    expect(settleHunt(a.state, res, ctx).kind).toBe('duplicate');
  });
  it('craft is one transaction; reload keeps module and the deducted count', () => {
    const kv = new MemKV(); const a = mgr(kv); a.commit(rich());
    const t = craftOrUpgrade(a.state, 'ember');
    if (!t.ok) throw new Error();
    a.commit(t.save);
    const again = craftOrUpgrade(a.state, 'ember'); // double tap
    expect(again.ok).toBe(false);
    const b = mgr(kv);
    expect(b.state.modules.ember).toEqual({ tier: 1 });
    expect(b.state.materials.heat_bladder).toBe(1);
  });
  it('corrupt primary + valid backup → recovered_backup, primary not overwritten until confirmed', () => {
    const kv = new MemKV(); const a = mgr(kv); a.commit(rich()); const s2 = cloneSave(a.state); s2.research = 4; a.commit(s2);
    kv.data.set(PRIMARY_KEY, '{"oops":');
    const b = mgr(kv);
    expect(b.status).toBe('recovered_backup');
    expect(b.state.research).toBe(0);
    expect(kv.data.get(PRIMARY_KEY)).toBe('{"oops":');
    expect(b.commit(rich()).ok).toBe(false);
    expect(b.acceptRecovery().ok).toBe(true);
    expect(mgr(kv).status).toBe('ok');
  });
  it('both copies corrupt → status corrupt, no silent reset, raw exportable, writes blocked until choice', () => {
    const kv = new MemKV(); kv.data.set(PRIMARY_KEY, 'xx'); kv.data.set(BACKUP_KEY, 'yy');
    const a = mgr(kv);
    expect(a.status).toBe('corrupt');
    expect(a.commit(rich()).ok).toBe(false);
    expect(kv.data.get(PRIMARY_KEY)).toBe('xx');
    expect(a.exportRaw()).toContain('xx');
    expect(a.startFresh().ok).toBe(true);
    expect(mgr(kv).status).toBe('ok');
  });
  it('checksum mismatch is rejected', () => {
    const kv = new MemKV(); const a = mgr(kv); a.commit(rich());
    const env = JSON.parse(kv.data.get(PRIMARY_KEY)!); env.payload.materials.fang = 999;
    expect(parseEnvelope(JSON.stringify(env)).ok).toBe(false);
    expect(checksum('a')).not.toBe(checksum('b'));
  });
  it('storage unavailable → volatile: playable, never claims persisted', () => {
    const a = mgr(null);
    expect(a.status).toBe('volatile');
    expect(a.commit(rich())).toEqual({ ok: true, persisted: false });
    expect(a.persisted).toBe(false);
    expect(a.state.materials.heat_bladder).toBe(5);
    expect(JSON.parse(a.exportText()).payload.materials.heat_bladder).toBe(5);
  });
  it('two tabs: stale revision is detected, nothing silently overwritten', () => {
    const kv = new MemKV(); const a = mgr(kv); a.commit(rich());
    const b = mgr(kv); // second tab, same revision
    const sa = cloneSave(a.state); sa.materials.fang = 1; expect(a.commit(sa).ok).toBe(true);
    const sb = cloneSave(b.state); sb.materials.fang = 7;
    const r = b.commit(sb);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.conflict).toBe(true);
    expect(mgr(kv).state.materials.fang).toBe(1);
    expect(b.commit(sb).ok).toBe(false); // stays blocked
  });
  it('import: previews without writing, rejects bad data, replaces (not merges) and backs up current', () => {
    const kv = new MemKV(); const a = mgr(kv); a.commit(rich());
    const exported = a.exportText();
    const other = mgr(new MemKV()); const s = cloneSave(other.state); s.materials.fang = 8; other.commit(s);
    const before = kv.data.get(PRIMARY_KEY);
    const pv = a.previewImport(other.exportText());
    expect(pv.ok).toBe(true);
    expect(kv.data.get(PRIMARY_KEY)).toBe(before); // preview wrote nothing
    expect(a.previewImport('not json').ok).toBe(false);
    const bad = JSON.parse(exported); bad.payload.materials.gold = 1;
    expect(a.previewImport(JSON.stringify(bad)).ok).toBe(false);
    const fut = JSON.parse(exported); fut.schemaVersion = 9;
    expect(a.previewImport(JSON.stringify(fut)).ok).toBe(false);
    if (!pv.ok) return;
    expect(a.applyImport(pv.save).ok).toBe(true);
    expect(a.state.materials.fang).toBe(8);
    expect(a.state.materials.heat_bladder).toBe(0); // replaced, not merged
    const bk = parseEnvelope(kv.data.get(BACKUP_KEY)!);
    expect(bk.ok && bk.env.payload.materials.heat_bladder).toBe(5);
  });
  it('get() throwing at load → volatile, not a crash', () => {
    const kv = new MemKV(); kv.failGet = true;
    expect(mgr(kv).status).toBe('volatile');
  });
});

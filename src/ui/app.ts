import {
  AVAILABLE_MODULES, MATERIAL_NAMES_TH, MISSIONS, MODULES, type MaterialId, type ModuleId,
} from '../data/content';
import { EMBER_GECKO } from '../data/monsters';
import { resolveBuild } from '../domain/build';
import { craftInfo, craftOrUpgrade, pinRecipe, setLoadout } from '../domain/crafting';
import type { HuntResult } from '../domain/hunt';
import { settleHunt, type HuntContext, type RewardSummary } from '../domain/rewards';
import { cloneSave } from '../domain/save';
import type { ArenaScene } from '../engine/scenes/ArenaScene';
import type { PauseController } from '../engine/PauseController';
import type { CommitResult, SaveManager } from '../persistence/saveManager';
import { $id, el } from './dom';

type Screen = 'base' | 'prep' | 'craft' | 'hunt' | 'results';

const modName = (id: ModuleId) => MODULES[id]?.nameTh ?? id;
const matName = (id: MaterialId) => MATERIAL_NAMES_TH[id];
const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** Owns screen flow (BASE → PREP → HUNT → RESULTS, CRAFT) and every save transaction. */
export class App {
  screen: Screen = 'base';
  ctx: HuntContext = { missionId: 'hunt_gecko', targetMaterialId: 'heat_bladder' };
  private summary: RewardSummary | null = null;
  lastResult: HuntResult | null = null;
  private busy = false;

  constructor(private readonly save: SaveManager, private readonly scene: ArenaScene, private readonly pause: PauseController) {
    const on = (id: string, f: () => void) => $id(id).addEventListener('click', f);
    on('btn-hunt', () => this.show('prep'));
    on('btn-craft', () => this.show('craft'));
    on('btn-prep-craft', () => this.show('craft'));
    on('btn-prep-back', () => this.show('base'));
    on('btn-craft-back', () => this.show('base'));
    on('btn-base-settings', () => this.pause.setSettingsOpen(true));
    on('btn-save-tools', () => this.saveTools());
    on('btn-start', () => this.startHunt());
    on('btn-retry', () => { this.startHunt(); });
    on('btn-results-home', () => this.show('base'));
    on('btn-save-retry', () => this.settle());
    on('btn-restart', () => this.leaveHunt('restart'));
    on('btn-home', () => this.leaveHunt('home'));
    $id<HTMLSelectElement>('slot-primary').addEventListener('change', () => this.onSlots());
    $id<HTMLSelectElement>('slot-secondary').addEventListener('change', () => this.onSlots());
    window.addEventListener('storage', (e) => { if (e.key === 'wildforge.save.primary') this.onForeignWrite(); });
  }

  // ------------------------------------------------------------ boot
  boot(): void {
    const st = this.save.status;
    if (st === 'recovered_backup') return this.recoveryDialog();
    if (st === 'corrupt') return this.corruptDialog();
    this.afterLoad();
  }

  private afterLoad(): void {
    const p = this.save.state.pendingHunt;
    if (p) {
      // The page was closed mid-hunt (§6): abandoned, no reward, nothing deleted.
      const next = cloneSave(this.save.state);
      next.pendingHunt = null; next.lastSettlementId = p.huntId;
      this.save.commit(next);
      this.notice('รอบล่าที่แล้วถูกปิดกลางคัน — ไม่ได้รางวัล แต่วัสดุและโมดูลเดิมยังอยู่ครบ');
    }
    this.show('base');
  }

  // ------------------------------------------------------------ screens
  show(s: Screen): void {
    this.screen = s;
    for (const k of ['base', 'prep', 'craft', 'results'] as const) $id(`screen-${k}`).hidden = k !== s;
    this.pause.setMenu(s !== 'hunt');
    this.refreshBanner();
    if (s === 'base') this.renderBase();
    if (s === 'prep') this.renderPrep();
    if (s === 'craft') this.renderCraft();
    const focus = { base: 'btn-hunt', prep: 'btn-start', craft: 'btn-craft-back', results: 'btn-retry', hunt: '' }[s];
    if (focus) $id(focus).focus();
  }

  private inventoryTags(): HTMLElement[] {
    const m = this.save.state.materials;
    return (['heat_bladder', 'fang'] as const).map((id) => el('span', { class: 'tag' }, `${matName(id)} × ${m[id]}`));
  }

  private renderBase(): void {
    const s = this.save.state;
    $id('base-inv').replaceChildren(...this.inventoryTags(), el('span', { class: 'tag' }, `Research ${s.research}`));
    const owned = AVAILABLE_MODULES.filter((m) => s.modules[m]).map((m) => `${modName(m)} ระดับ ${s.modules[m]!.tier}`);
    $id('base-status').textContent = owned.length ? `โมดูลที่มี: ${owned.join(' • ')}` : 'ยังไม่มีโมดูล — ล่าเพื่อเก็บวัสดุ แล้วไป "ประกอบอาวุธ"';
    const pinEl = $id('base-pin');
    if (s.pinnedRecipeId) {
      const info = craftInfo(s, s.pinnedRecipeId);
      pinEl.textContent = info.action === 'maxed' ? `สูตรที่ปักหมุด: ${modName(s.pinnedRecipeId)} — สูงสุดแล้ว`
        : `สูตรที่ปักหมุด: ${modName(s.pinnedRecipeId)} (${info.action === 'craft' ? 'สร้าง' : 'อัปเกรด'}) มี ${info.have}/${info.cost}`;
    } else pinEl.textContent = 'ยังไม่ได้ปักหมุดสูตร (ปักได้ที่หน้าประกอบอาวุธ)';
    const b = s.bestiary.ember_gecko;
    $id('base-bestiary').textContent = b ? `กิ้งก่าถุงไฟ: ล่า ${b.hunts} ครั้ง ชนะ ${b.clears}${b.bestTimeHunt !== null ? ` • เวลาดีที่สุด ${fmtTime(b.bestTimeHunt)}` : ''}` : 'กิ้งก่าถุงไฟ: ยังไม่เคยล่า';
  }

  private renderPrep(): void {
    const s = this.save.state;
    const mission = MISSIONS.hunt_gecko;
    const pinMat = s.pinnedRecipeId ? MODULES[s.pinnedRecipeId]?.materialId : undefined;
    // suggest the pinned recipe's material, but any choice stays valid
    if (!mission.allowedTargetMaterials.includes(this.ctx.targetMaterialId) || (pinMat && this.ctxFresh)) {
      this.ctx = { missionId: 'hunt_gecko', targetMaterialId: pinMat && mission.allowedTargetMaterials.includes(pinMat) ? pinMat : 'heat_bladder' };
    }
    this.ctxFresh = false;
    const wrap = $id('prep-targets');
    wrap.replaceChildren(...mission.allowedTargetMaterials.map((id) => {
      const input = el('input', { type: 'radio', name: 'target', value: id, onchange: () => { this.ctx.targetMaterialId = id; this.renderPrepReward(); } });
      input.checked = this.ctx.targetMaterialId === id;
      return el('label', {}, input, `${matName(id)}${pinMat === id ? ' (ตรงกับสูตรที่ปักหมุด)' : ''} — มีอยู่ ${s.materials[id]}`);
    }));
    const build = resolveBuild(s);
    const pri = build.primary ? `${modName(build.primary.id)} ระดับ ${build.primary.tier}` : 'ไม่มี (ใช้ โฟกัสสไตรค์)';
    const sec = build.secondary ? `${modName(build.secondary.id)} ระดับ ${build.secondary.tier}: ${MODULES[build.secondary.id]!.passive.descTh}` : 'ไม่มี';
    $id('prep-loadout').replaceChildren(
      el('div', {}, 'อาวุธ: ดาบเขี้ยว'),
      el('div', {}, `โมดูลหลัก: ${pri}`),
      el('div', {}, `สกิล: ${build.skill.nameTh} — ใช้แรง ${Math.max(1, Math.round(build.skill.cost))}, คูลดาวน์ ${build.skill.cooldown.toFixed(1)} วินาที`),
      el('div', {}, `โมดูลเสริม: ${sec}`),
    );
    this.renderPrepReward();
    const err = $id('prep-error'); err.hidden = true;
  }
  private ctxFresh = true;

  private renderPrepReward(): void {
    $id('prep-reward').textContent = `รางวัลแน่นอนเมื่อล่าสำเร็จ: ${matName(this.ctx.targetMaterialId)} ×2, +1 ต่อส่วนที่ทำลาย (ถุงไฟ→ถุงความร้อน, ขากรรไกร→เขี้ยว), Research 1`;
  }

  private msg(text: string, ok = true): void {
    const m = $id('craft-msg'); m.textContent = text; m.style.color = ok ? '' : '#ffb4a8';
  }

  private renderCraft(): void {
    const s = this.save.state;
    $id('craft-inv').replaceChildren(...this.inventoryTags());
    $id('craft-list').replaceChildren(...AVAILABLE_MODULES.map((id) => {
      const def = MODULES[id]!;
      const info = craftInfo(s, id);
      const owned = s.modules[id];
      const label = info.action === 'maxed' ? 'ระดับสูงสุดแล้ว' : `${info.action === 'craft' ? 'สร้าง' : 'อัปเกรด→II'} (ใช้ ${info.cost})`;
      const btn = el('button', { type: 'button', class: info.enough ? 'primary' : '', onclick: () => this.craft(id) }, label);
      if (!info.enough) btn.disabled = true;
      const need = info.action === 'maxed' ? '' : `${matName(def.materialId)} มี ${info.have}/${info.cost}${info.enough ? '' : ` — ขาดอีก ${info.missing}`}`;
      const pinned = s.pinnedRecipeId === id;
      const pin = el('button', { type: 'button', onclick: () => this.pin(pinned ? null : id) }, pinned ? 'เลิกปักหมุด' : 'ปักหมุดสูตร');
      return el('div', { class: 'card' },
        el('h2', {}, `${def.nameTh}${owned ? ` — ระดับ ${owned.tier}` : ' — ยังไม่มี'}`),
        el('p', {}, `สกิล (ช่องหลัก): ${def.skill.nameTh} • แรง ${def.skill.cost} • คูลดาวน์ ${def.skill.cooldown}s — ${def.skill.descTh}`),
        el('p', {}, `ความสามารถติดตัว (ช่องเสริม): ${def.passive.descTh}`),
        need ? el('p', {}, need) : null,
        el('div', { class: 'row' }, btn, pin));
    }));
    const opts = (sel: HTMLSelectElement, cur: ModuleId | null) => {
      sel.replaceChildren(el('option', { value: '' }, 'ว่าง'), ...AVAILABLE_MODULES.filter((m) => s.modules[m]).map((m) => el('option', { value: m }, `${modName(m)} ระดับ ${s.modules[m]!.tier}`)));
      sel.value = cur ?? '';
    };
    opts($id<HTMLSelectElement>('slot-primary'), s.loadout.primaryModuleId);
    opts($id<HTMLSelectElement>('slot-secondary'), s.loadout.secondaryModuleId);
  }

  // ------------------------------------------------------------ transactions
  private tx(result: { ok: true; save: import('../domain/save').SaveData } | { ok: false; error: string }, okMsg: string): boolean {
    if (this.busy) return false;
    if (!result.ok) { this.msg(result.error, false); return false; }
    this.busy = true;
    const c = this.save.commit(result.save);
    this.busy = false;
    this.report(c, okMsg);
    this.renderCraft(); this.refreshBanner();
    return c.ok;
  }

  private report(c: CommitResult, okMsg: string): void {
    if (!c.ok) this.msg(c.error, false);
    else this.msg(c.persisted ? `${okMsg} (บันทึกแล้ว)` : `${okMsg} — แต่ยังไม่ได้บันทึกถาวร (พื้นที่เก็บข้อมูลใช้ไม่ได้)`, c.persisted);
    if (!c.ok && c.conflict) this.conflictDialog();
  }

  private craft(id: ModuleId): void {
    const info = craftInfo(this.save.state, id);
    const verb = info.action === 'upgrade' ? 'อัปเกรดแล้ว' : 'สร้างแล้ว';
    this.tx(craftOrUpgrade(this.save.state, id), `${verb}: ${modName(id)}`);
  }
  private pin(id: ModuleId | null): void { this.ctxFresh = true; this.tx(pinRecipe(this.save.state, id), id ? 'ปักหมุดแล้ว' : 'เลิกปักหมุดแล้ว'); }
  private onSlots(): void {
    const v = (id: string) => ($id<HTMLSelectElement>(id).value || null) as ModuleId | null;
    const ok = this.tx(setLoadout(this.save.state, v('slot-primary'), v('slot-secondary')), 'เปลี่ยนชุดอุปกรณ์แล้ว');
    if (!ok) this.renderCraft();
  }

  // ------------------------------------------------------------ hunt
  startHunt(): void {
    if (this.busy) return;
    this.busy = true;
    const build = resolveBuild(this.save.state);
    const hunt = this.scene.newHunt(build);
    const next = cloneSave(this.save.state);
    next.pendingHunt = { huntId: hunt.huntId, missionId: this.ctx.missionId, targetMaterialId: this.ctx.targetMaterialId, startedAt: new Date().toISOString() };
    const c = this.save.commit(next); // persist BEFORE entering the hunt (§6)
    this.busy = false;
    if (!c.ok) {
      const e = $id('prep-error'); e.textContent = `${c.error} — กด "เริ่มล่า" เพื่อลองใหม่`; e.hidden = false;
      if (this.screen !== 'prep') this.show('prep');
      if (c.conflict) this.conflictDialog();
      return;
    }
    this.summary = null; this.lastResult = null;
    this.screen = 'hunt';
    for (const k of ['base', 'prep', 'craft', 'results'] as const) $id(`screen-${k}`).hidden = true;
    this.pause.resume();
    this.pause.setMenu(false);
    this.refreshBanner();
  }

  /** Leave the hunt from the pause menu: abandoned, nothing paid, nothing deleted. */
  private leaveHunt(kind: 'restart' | 'home'): void {
    const h = this.scene.hunt;
    if (h.status === 'ACTIVE') {
      const next = cloneSave(this.save.state);
      next.pendingHunt = null; next.lastSettlementId = h.huntId;
      this.save.commit(next);
    }
    this.pause.resume();
    if (kind === 'home') this.show('base'); else { this.show('prep'); this.startHunt(); }
  }

  onResult(r: HuntResult): void {
    this.lastResult = r;
    this.screen = 'results';
    $id('screen-results').hidden = false;
    this.pause.setMenu(true);
    this.settle();
  }

  /** Idempotent: safe to press "ลองบันทึกใหม่" any number of times. */
  private settle(): void {
    const r = this.lastResult;
    if (!r || this.busy) return;
    this.busy = true;
    const out = settleHunt(this.save.state, r, this.ctx);
    let c: CommitResult = { ok: true, persisted: this.save.persisted };
    if (out.kind === 'settled') {
      this.summary = out.summary;
      c = this.save.commit(out.save);
    }
    this.busy = false;
    this.renderResults(r, c);
    if (!c.ok && c.conflict) this.conflictDialog();
    this.refreshBanner();
  }

  private renderResults(r: HuntResult, c: CommitResult): void {
    const win = r.outcome === 'success';
    $id('results-title').textContent = win ? 'ล่าสำเร็จ!' : 'ล้มเหลว';
    $id('results-reason').textContent = win ? '' : r.failReason === 'timeout' ? 'หมดเวลา 10 นาที' : 'ผู้เล่นล้ม';
    const list = $id('results-list'); list.replaceChildren();
    const row = (t: string) => list.append(el('li', {}, t));
    const sum = this.summary;
    row(`ผล: ${win ? 'เสร็จแล้ว — ล่ากิ้งก่าถุงไฟ' : 'ยังไม่ผ่าน — ล่ากิ้งก่าถุงไฟ'}`);
    row(`เวลา: ${fmtTime(r.elapsed)}`);
    if (win && sum?.baseMaterial) {
      row(`วัสดุหลัก: ${matName(sum.baseMaterial.id)} ×${sum.baseMaterial.count}`);
      for (const b of sum.partBonuses) row(`โบนัสส่วนที่ทำลาย: ${EMBER_GECKO.parts.find((p) => p.id === b.partId)!.nameTh} → ${matName(b.materialId)} ×${b.count}`);
      row(`Research +${sum.research}`);
    } else if (!win) row('ไม่ได้รับวัสดุหรือ Research รอบนี้ (ของเดิมไม่หาย)');
    const parts = r.brokenPartIds.map((id) => EMBER_GECKO.parts.find((p) => p.id === id)!.nameTh);
    row(`ส่วนที่ทำลาย: ${parts.length ? parts.join(', ') : 'ไม่มี'}`);
    row(`ท่าที่เห็น: ${r.movesSeen.map((id) => EMBER_GECKO.moves.find((m) => m.id === id)!.nameTh).join(', ') || 'ยังไม่เห็น'}`);
    const pin = this.save.state.pinnedRecipeId;
    if (pin && c.ok) { const i = craftInfo(this.save.state, pin); if (i.action !== 'maxed') row(`สูตรที่ปักหมุด ${modName(pin)}: มี ${i.have}/${i.cost}${i.enough ? ' — พร้อมสร้าง!' : ''}`); }
    const msg = $id('results-save');
    if (!c.ok) { msg.textContent = `⚠ ${c.error} — รางวัลยังไม่เข้าคลัง กด "ลองบันทึกใหม่" (จะไม่ได้รางวัลซ้ำ)`; msg.style.color = '#ffb4a8'; }
    else if (!c.persisted) { msg.textContent = 'รอบนี้ยังไม่ได้บันทึกถาวร — ไปที่ฐานแล้วส่งออกเซฟได้'; msg.style.color = '#ffd36b'; }
    else { msg.textContent = 'บันทึกแล้ว'; msg.style.color = ''; }
    $id('btn-save-retry').hidden = c.ok;
    $id('btn-retry').textContent = win ? 'ล่าอีกครั้ง' : 'ลองใหม่';
    ($id(c.ok ? 'btn-retry' : 'btn-save-retry')).focus();
  }

  // ------------------------------------------------------------ banner & notices
  refreshBanner(): void {
    const b = $id('save-banner');
    let text = '';
    if (this.save.status === 'volatile') text = 'พื้นที่เก็บข้อมูลใช้ไม่ได้ — ความคืบหน้ายังไม่บันทึกถาวร (ส่งออกเซฟได้ที่ฐาน)';
    else if (this.save.unsaved) text = 'บันทึกล่าสุดไม่สำเร็จ — ยังไม่ได้บันทึก';
    else if (this.save.conflict) text = 'พบการใช้งานจากอีกแท็บ — บันทึกถูกล็อก';
    b.textContent = text; b.hidden = !text;
  }

  private notice(text: string): void {
    this.dialog('ข้อความ', [el('p', {}, text)], [{ label: 'รับทราบ', primary: true }]);
  }

  // ------------------------------------------------------------ dialogs (§20 recovery, import/export)
  private dialog(title: string, body: Node[], buttons: { label: string; primary?: boolean; keepOpen?: boolean; onClick?: () => void; disabled?: boolean; id?: string }[]): HTMLButtonElement[] {
    const panel = $id('dialog-panel');
    const made = buttons.map((b) => {
      const btn = el('button', { type: 'button', class: b.primary ? 'primary' : '', ...(b.id ? { id: b.id } : {}) }, b.label);
      btn.disabled = !!b.disabled;
      btn.addEventListener('click', () => { if (!b.keepOpen) this.closeDialog(); b.onClick?.(); });
      return btn;
    });
    panel.replaceChildren(el('h1', { id: 'dialog-title' }, title), ...body, el('div', { class: 'row' }, ...made));
    $id('overlay-dialog').hidden = false;
    (made.find((_, i) => buttons[i]!.primary) ?? made[0])?.focus();
    return made;
  }
  private closeDialog(): void { $id('overlay-dialog').hidden = true; }

  private download(name: string, text: string): void {
    const a = el('a', { href: URL.createObjectURL(new Blob([text], { type: 'application/json' })), download: name });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  private stamp(): string { return new Date().toISOString().slice(0, 10).replace(/-/g, ''); }

  private recoveryDialog(): void {
    this.dialog('กู้เซฟจาก backup', [
      el('p', {}, 'ไฟล์เซฟหลักเสียหาย แต่พบ backup ที่ใช้ได้ เกมโหลดข้อมูลจาก backup แล้ว'),
      el('p', { class: 'muted' }, 'ยังไม่มีการเขียนทับไฟล์เดิมจนกว่าคุณจะกดยืนยัน — จะส่งออกไฟล์เสียเก็บไว้ก่อนก็ได้'),
    ], [
      { label: 'ใช้ข้อมูลที่กู้', primary: true, keepOpen: true, onClick: () => { const r = this.save.acceptRecovery(); if (r.ok) { this.closeDialog(); this.afterLoad(); } else this.notice(r.error); } },
      { label: 'ส่งออกข้อมูลดิบ', keepOpen: true, onClick: () => this.download(`wildforge-raw-${this.stamp()}.json`, this.save.exportRaw()) },
    ]);
  }

  private corruptDialog(): void {
    this.dialog('เซฟเสียหาย', [
      el('p', {}, 'อ่านไฟล์เซฟหลักและ backup ไม่ได้ เกมจะไม่รีเซ็ตให้เองเงียบ ๆ'),
      el('p', { class: 'muted' }, 'เลือกส่งออกข้อมูลดิบไว้ก่อน แล้วเลือกนำเข้าเซฟจากไฟล์ หรือเริ่มใหม่'),
    ], [
      { label: 'ส่งออกข้อมูลดิบ', primary: true, keepOpen: true, onClick: () => this.download(`wildforge-raw-${this.stamp()}.json`, this.save.exportRaw()) },
      { label: 'นำเข้าเซฟจากไฟล์', keepOpen: true, onClick: () => this.importDialog() },
      { label: 'เริ่มใหม่ (ลบข้อมูลเสีย)', keepOpen: true, onClick: () => this.confirmFresh() },
    ]);
  }

  private confirmFresh(): void {
    this.dialog('ยืนยันเริ่มใหม่', [el('p', {}, 'ข้อมูลเซฟเดิมที่เสียจะถูกแทนที่ด้วยเซฟใหม่ ส่งออกข้อมูลดิบไว้แล้วหรือยัง?')], [
      { label: 'ยกเลิก', primary: true, onClick: () => this.corruptDialog() },
      { label: 'เริ่มใหม่', keepOpen: true, onClick: () => { const r = this.save.startFresh(); if (r.ok) { this.closeDialog(); this.afterLoad(); } else this.notice(r.error); } },
    ]);
  }

  private conflictDialog(): void {
    this.pause.pause('user');
    this.dialog('พบการใช้งานหลายแท็บ', [
      el('p', {}, 'มีแท็บอื่นบันทึกเซฟไปแล้ว เพื่อไม่ให้ทับกันเงียบ ๆ เกมนี้หยุดบันทึกชั่วคราว'),
      el('p', { class: 'muted' }, 'โหลดหน้านี้ใหม่เพื่อใช้ข้อมูลล่าสุด หรือส่งออกเซฟของแท็บนี้ไว้ก่อน'),
    ], [
      { label: 'โหลดใหม่', primary: true, keepOpen: true, onClick: () => location.reload() },
      { label: 'ส่งออกเซฟของแท็บนี้', keepOpen: true, onClick: () => this.download(`wildforge-save-${this.stamp()}.json`, this.save.exportText()) },
    ]);
  }

  private onForeignWrite(): void {
    this.save.noteForeignWrite();
    this.refreshBanner();
    if (this.screen === 'hunt') this.pause.pause('user');
    this.conflictDialog();
  }

  private saveTools(): void {
    this.dialog('ส่งออก / นำเข้าเซฟ', [
      el('p', {}, 'ส่งออกเป็นไฟล์ JSON เก็บไว้เอง หรือนำเข้าเพื่อแทนที่เซฟปัจจุบัน (ไม่รวมจำนวนกับของเดิม)'),
    ], [
      { label: 'ส่งออกเซฟ', primary: true, keepOpen: true, onClick: () => this.download(`wildforge-save-${this.stamp()}.json`, this.save.exportText()) },
      { label: 'นำเข้าเซฟ', keepOpen: true, onClick: () => this.importDialog() },
      { label: 'ปิด' },
    ]);
  }

  private importDialog(): void {
    const ta = el('textarea', { id: 'import-text', 'aria-label': 'วางข้อความเซฟ JSON', placeholder: 'วาง JSON ที่นี่ หรือเลือกไฟล์' });
    const file = el('input', { type: 'file', accept: '.json,application/json', id: 'import-file' });
    const out = el('div', { id: 'import-preview', class: 'msg', role: 'status', 'aria-live': 'polite' });
    let pending: import('../domain/save').SaveData | null = null;
    const check = () => {
      pending = null;
      const text = ta.value.trim();
      if (!text) { out.textContent = ''; btns[0]!.disabled = true; return; }
      const p = this.save.previewImport(text);
      if (!p.ok) { out.textContent = `⚠ นำเข้าไม่ได้: ${p.reason}`; out.style.color = '#ffb4a8'; btns[0]!.disabled = true; return; }
      pending = p.save; out.style.color = '';
      out.replaceChildren(el('div', {}, 'ตัวอย่างข้อมูลที่จะนำเข้า (ของเดิมจะถูกแทนที่และเก็บเป็น backup):'), ...p.lines.map((l) => el('div', {}, l)));
      btns[0]!.disabled = false;
    };
    ta.addEventListener('input', check);
    file.addEventListener('change', async () => { const f = file.files?.[0]; if (f) { ta.value = await f.text(); check(); } });
    const btns = this.dialog('นำเข้าเซฟ', [file, ta, out], [
      { label: 'แทนที่เซฟด้วยข้อมูลนี้', primary: true, disabled: true, keepOpen: true, id: 'btn-import-apply', onClick: () => {
        if (!pending) return;
        const r = this.save.applyImport(pending);
        if (r.ok) { this.closeDialog(); this.refreshBanner(); this.afterLoadNoPending(); } else { out.textContent = `⚠ ${r.error}`; out.style.color = '#ffb4a8'; }
      } },
      { label: 'ยกเลิก', onClick: () => { /* nothing was written */ } },
    ]);
  }

  private afterLoadNoPending(): void { this.show('base'); }
}

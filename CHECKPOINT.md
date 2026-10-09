# CHECKPOINT

Milestone: **M1 / v0.0.2** — กิ้งก่าถุงไฟ 1 ตัว ล่าจบ/แพ้ได้ ท่าอ่านได้ อวัยวะแตกเปลี่ยน AI จริง → gate ผ่านใน emulation + บอท (ดู QA_REPORT) **ยังไม่ผ่านการเล่นโดยมนุษย์/มือถือจริง**

เสร็จ: ตรวจ dependency/clean install + บันทึก Node/npm • ปรับเดินระหว่างฟัน+ตารางสั่นจอ (ค่าเสนอ) • touch reset เมื่อ resize/หมุน • ember_gecko 3 ท่า + telegraph/lock • damage/i-frame/stagger/part break • hunt lifecycle + results • ปุ่มเลือกส่วน + soft-lock • tests 42 + browser 52 + M0 regression 26 • คลิป 1 รอบ

ค้าง/รู้ปัญหา: (1) ตาราง walk/shake จริงจากเจ้าของโครงการ (DESIGN_DEVIATIONS #1) (2) Focus Strike + ยาฟื้น (3) stuck-handling §13 (4) DPR cap (5) abandoned-on-reload ต้องรอ persistence (6) owner playtest จริงบนมือถือ — บอทชนะไม่ได้พิสูจน์ความยาก/ความสนุก (7) เอกสาร official เข้าตรงไม่ได้ ตรวจซ้ำเมื่อมีเน็ต

ห้ามเพิ่มมอนสเตอร์/คราฟต์จนกว่าเจ้าของโครงการลองเล่น M1 และตัดสินใจเรื่องค่าความยาก/อ่านท่า (ตามคำสั่ง)

Next exact task (M2 หลังเจ้าของอนุมัติ): `src/persistence/save.ts` (envelope savedAt/schemaVersion/payload/checksum, primary+backup, validate→write→read-back) + `src/domain/rewards.ts` (settlement idempotent ด้วย huntId/lastSettlementId, base 2 ของ target material + part bonus 1 ต่อส่วนที่ `HuntResult.brokenPartIds`) + `src/domain/crafting.ts` (4/6 หน่วย) + หน้า base/loadout/เลือก targetMaterial; ต่อเข้า `onResult` ใน `src/main.ts` (ตอนนี้แสดงผลอย่างเดียว) และเพิ่ม Focus Strike + ยาฟื้นใน `src/domain/player.ts`

# CHECKPOINT

Milestone: **M2 / v0.0.3** (vertical slice) — ล่า → วัสดุ → craft → ติดตั้ง → ล่าใหม่ → reload ของยังอยู่: **ผ่านใน emulation + บอท** (ดู QA_REPORT) ยังไม่ผ่านการเล่นโดยมนุษย์/มือถือจริง

เสร็จใน M2: ฐาน/เตรียมล่า/คราฟต์/ผลลัพธ์ • เซฟ versioned primary+backup+อ่านกลับ+revision (สองแท็บ) • settlement idempotent + pendingHunt • กู้/นำเข้า/ส่งออก/โหมดไม่บันทึก • โมดูลเขี้ยว+ถุงไฟ (สกิล+passive, tier I/II) + Focus Strike • ปุ่มสกิลและ HUD • tests 90 + browser 26/52/61

ค้าง/รู้ปัญหา: (1) เจ้าของยังไม่ playtest M2 — ต้นทุน 4/6 และความรู้สึกสกิล/DOT เป็นสมมติฐาน (2) ตาราง walk/shake จริงจากเจ้าของ (DEVIATIONS #1) (3) ยาฟื้น (4) stuck-handling §13 (5) DPR cap (6) หน้าคราฟต์บนจอเล็กต้องเลื่อน (#23) (7) validator เข้มเกินจำเป็นสำหรับ M3 (#20) (8) เอกสาร official ตรวจผ่านช่องทางอ้อม (docs/DEPENDENCY_CHECK.md)

Next exact task (M3 หลังเจ้าของอนุมัติ/ playtest): (a) ผ่อน `validateSave` + `AVAILABLE_*` ใน `src/data/content.ts` และเขียน migration test ให้เซฟ M2 ยังโหลดได้ (b) เพิ่ม `mire_crab`/`sail_lizard` ใน `src/data/monsters.ts` (ต้อง generalize `src/domain/monster.ts` ที่ผูกกับ gecko: `partWorldPos`, move shapes `circle`/`line`/`annulus`, puddle DOT, ปูเกราะ ×0.8 ด้านหน้า) (c) หอกกิ่ง `src/data/weapons.ts` + capsule hit shape ใน `activeAttackShape` (d) โมดูล shell/venom/wing/horn ใน `MODULES` + `resolveBuild` (guard, พ่นพิษ, พุ่งลม, กระแทกเขา) (e) capture trap + ใบ capture ใน `rewards.ts` (f) สมุดสัตว์เต็ม + first-clear unlock (g) เถาวัลย์/คบเพลิง/ยาฟื้น

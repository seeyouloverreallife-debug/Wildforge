# CHECKPOINT

Milestone: **M3 / v0.0.4** — ครบ 3 สัตว์ / 2 อาวุธ / 6 โมดูล + capture + สมุด + เถาวัลย์/คบเพลิง + ยาฟื้น: **ผ่านใน emulation + บอท** (ดู QA_REPORT) ยังไม่ผ่าน owner playtest/มือถือจริง

เสร็จใน M3: ปู + กิ้งก่าปีก (ท่า/เกราะ/อวัยวะ/AI ตาม §8.2–8.3) • หอกกิ่ง • โมดูล shell/venom/wing/horn + passive ครบ 6 • capture trap + ใบจับ + ไอคอนที่ฐาน • first-clear unlocks + recipe gating + migration M2→M3 • สมุดสัตว์ • เถาวัลย์/คบเพลิง • ยาฟื้น • stuck-handling • UI เลือกภารกิจ/อาวุธ • touch 8 ปุ่ม • tests 142 + browser 26/52/61/56 + ล่า HP เต็มด้วยบอท

ค้าง/รู้ปัญหา (รายละเอียดใน DESIGN_DEVIATIONS):
1. **ยังไม่มี owner playtest ตั้งแต่ M1** — ความยาก/ความสนุก/ค่าต้นทุน 4/6/การล็อกก้ามทุบ 25%/เถาวัลย์ เป็นสมมติฐานทั้งหมด (M4 ต้องทำก่อนเรียก MVP)
2. ตาราง walk/shake จริงจากเจ้าของ (#1) 3. DPR cap (#6) 4. หน้าคราฟต์บนจอเล็กต้องเลื่อน (#23) 5. stuck reset 5s ไม่มีเทสต์ (#38) 6. ไม่มีเสียง/ภาพจริง (ASSET_LICENSES: ไม่มี asset) 7. เอกสาร official ตรวจผ่านช่องทางอ้อม

Next exact task (M4 — QA cross-device, balance pass, UI/audio cleanup; ห้ามเพิ่มเนื้อหาใหม่): 
(a) เจ้าของ playtest จริงอย่างน้อย 1 รอบครบ loop บนมือถือ แล้วนำ feedback มาปรับค่าใน `src/data/{tuning,monsters,content}.ts` เท่านั้น 
(b) ใส่ local event log ตาม §23.3 (hunt_started, attack_received, part_broken, hunt_completed, hunt_failed, recipe_pinned, module_crafted, module_equipped, retry_selected) ที่ `src/diagnostics/` 
(c) DPR cap=2, ปรับหน้าคราฟต์/เตรียมล่าให้พอดีจอเล็ก, ภาพ/เสียง placeholder→ชุดจริง + ASSET_LICENSES.md 
(d) เทสต์ stuck reset และ Q-tests ที่ยังเป็น NOT TESTED

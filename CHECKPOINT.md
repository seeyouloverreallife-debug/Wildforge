# CHECKPOINT

Milestone: **M0 / v0.0.1** — gate: เดิน/หลบทั้งคอมและ touch ไม่ค้างหลัง blur → ผ่านใน emulation (ดู QA_REPORT) ยังไม่ผ่านบนมือถือจริง

เสร็จ: scaffold, arena, player (เดิน/หลบ/โจมตี placeholder), camera, keyboard/mouse, touch joystick+buttons, pause/blur/portrait, fixed step, settings, debug overlay, tests, QA script
ค้าง/รู้ปัญหา: DPR cap, เสียง, owner playtest บนมือถือจริง, ตรวจเอกสาร official ของ dependency (ดู DESIGN_DEVIATIONS #9), ตัดสินใจ #2 (เดินระหว่างฟัน)

Next exact task (M1): สร้าง `src/data/monsters.ts` (ember_gecko: HP 1400, fire_sac 220, jaw 180, 3 ท่า §8.1) + `src/domain/combat.ts` (hit resolution ตาม §7.3–7.4, attackId dedupe, part break ก่อน death) + `src/domain/monsterAI.ts` (FSM + seeded weighted selection) แล้วต่อเข้า `ArenaScene.update` (ใช้ `activeAttackShape()` ใน `src/domain/player.ts` เป็น hit shape ของผู้เล่น); เพิ่ม HuntState + RESULTS (ยังไม่ต้องมี save จนถึง M2); เพิ่มปุ่ม touch เลือกส่วน/ยา และ soft-lock

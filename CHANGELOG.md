# Changelog

## 0.0.1 — M0 (2026-10-09)
- โครงโครงการ TypeScript + Vite + Phaser; แยก data/domain/engine/ui/persistence/diagnostics
- Arena 1600×1000 (หิน 2 ก้อน, ขอบชน), กล้องตามแบบนุ่ม + zoom ปรับตามจอ
- ผู้เล่น: เดิน 220 u/s, หลบ 150u/0.30s (i-frame 0.05–0.22s, stamina 25, cooldown 0.65s), stamina regen 20/s หลังหน่วง 0.8s
- โจมตีดาบเขี้ยว placeholder (startup/active/recovery ตาม §7.2, sector 100°/90u, input buffer 0.15s, dodge cancel หลัง recovery ครึ่งหนึ่ง) — ยังไม่มีเป้าให้โดน
- Input: คีย์บอร์ด+เมาส์ (aim ตามเมาส์) และ touch joystick/ปุ่ม ด้วย Pointer Events แยก pointerId
- Pause อัตโนมัติเมื่อ blur/tab ซ่อน/แนวตั้ง; reset input ทุกครั้งที่หยุด; เวลาที่หยุดไม่นับ
- Fixed timestep 60Hz (clamp delta 100ms, สูงสุด 5 step/เฟรม) + render interpolation
- ตั้งค่า: สั่นจอ, ลดเอฟเฟกต์ (บันทึก localStorage แบบ try/catch)
- Debug overlay (F3)

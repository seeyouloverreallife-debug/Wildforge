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

## 0.0.2 — M1 (2026-10-09)
- **กิ้งก่าถุงไฟ** (HP 1400, ถุงไฟ 220, ขากรรไกร 180) ครบ 3 ท่า: พ่นไฟ (cone 70°/260), กัดพุ่ง (dash 180), กวาดหาง (arc 220° ด้านหลัง) พร้อม telegraph/active/recovery ตาม §8.1, ล็อกทิศที่ 70% ของ telegraph (เส้นขอบหนาขึ้นเมื่อล็อก), ป้ายชื่อท่า + คำใบ้ครั้งแรก
- AI: FSM + seeded weighted selection, ห้ามท่าเดิมเกิน 2 ครั้งติด, พักระหว่างท่า 0.4–0.8s, ชนหิน/ขอบระหว่างพุ่ง → recovery +0.5s
- Combat: damage ตาม §7.4 (×1.15 ตอน monster recovery), 1 attackId = body damage ครั้งเดียว + part damage 1 ส่วน (ใกล้ปลายอาวุธ, ส่วนที่เลือกเป็น tie-breaker), stagger meter, i-frame หลบ + invulnerability หลังโดน 0.6s
- อวัยวะแตก: เลิกพ่นไฟ + กัดพุ่งพัก +0.2s (ถุงไฟ) / กัดเบาลง 16→12 (ขากรรไกร), stagger 1.5s, resolve แตกก่อนตาย
- Hunt lifecycle ACTIVE→SUCCESS/FAILED/ABANDONED จบได้ครั้งเดียว, หมดเวลา 10 นาที, หน้าเริ่ม/หน้าผลลัพธ์ (ชนะ/แพ้ + ลองใหม่ปุ่มเดียว), HUD บอสแบบไม่มีตัวเลข HP + ชิปส่วน (เลือก/แตกใช้ข้อความ+ลายเส้น ไม่ใช้สีอย่างเดียว)
- ปุ่ม "เป้า" (Tab/R) + touch soft-lock 420 units
- **ปรับ M0**: เดินระหว่างฟันช้าลงตามตาราง `ATTACK_WALK_MULT` (0.7/0.4/0.85) และตาราง `SHAKE_TABLE` ต่อเหตุการณ์ (ค่าเสนอ ดู DESIGN_DEVIATIONS), touch controls รีเซ็ตเมื่อ resize/หมุนจอกลางการจับ
- ยังไม่มี: วัสดุ/รางวัล/คราฟต์/save (M2), skill Focus Strike, ยาฟื้น, เสียง

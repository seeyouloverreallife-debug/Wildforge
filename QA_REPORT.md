# QA report — M2 / 0.0.3

Environment: Linux container, Node v22.22.0, npm 10.9.4, headless Chromium (Playwright 1.56.1). **ไม่มีมือถือจริง** — touch เป็น CDP emulation; **ผู้เล่นในชุดทดสอบและคลิปเป็นบอท** → ไม่มีข้อมูลความสนุก/สมดุล/touch feel

## ผลรวม (รอบสุดท้ายบนโค้ดที่ส่ง)
| ชุด | คำสั่ง | ผล |
|---|---|---|
| Domain unit | `npm test` | **90/90 PASS** (7 ไฟล์) |
| M0 regression | `npm run qa:browser` | 26/26 PASS |
| M1 regression (ล่า HP เต็ม 1 รอบ + pause/defeat/resize) | `npm run qa:m1` | 52/52 PASS |
| **M2** | `npm run qa:m2` | **61/61 PASS** |
Clean-room: `npm ci` → build → test บน tree ที่ commit (ดู CHECKPOINT) — 0 vulnerabilities

## M2 gate: ล่า → ได้วัสดุ → craft → ติดตั้ง → ล่าใหม่ → reload ของยังอยู่ — PASS (บอท, ล่า HP ย่อ)
ลำดับจริงใน `qa-m2.mjs` section 1 และคลิป `qa-artifacts/m2-loop.mp4` (45 วินาที, HP สัตว์ถูกย่อ):
ล่าชนะ (วัสดุเข้า + บันทึก) → reload (ไม่จ่ายซ้ำ) → ล่าอีก → ปักหมุด+คราฟต์ถุงไฟ → ติดตั้งเป็นโมดูลหลัก → reload (ยังอยู่) → ล่าใหม่ใช้สกิลถุงไฟ → โซนไฟ r85 แรง 30 คูลดาวน์ ~10 ตรงกับ HUD

## Manual-integration IDs ที่เกี่ยวข้อง
| ID | ผล | วิธี/หลักฐาน |
|---|---|---|
| Q06 ชนะแล้วกดผลซ้ำ/reload | PASS | replay `onResult` 2 ครั้ง + reload → วัสดุเท่าเดิม |
| Q07 craft double tap + reload | PASS | dblclick ปุ่มสร้าง: หักครั้งเดียว, โมดูลอยู่ครบหลัง reload |
| Q11 สลับโมดูลหลักกับอาวุธ | PASS บางส่วน | มีอาวุธเดียว (หอกยังไม่เปิด): ทดสอบ ถุงไฟ/เขี้ยว เป็นหลัก+เสริม, สกิลมีผลจริง (โซนไฟ / เลือดไหล), cost/cooldown ใน HUD ตรง state (±0.4s ข้อมูลอ่านทันที); passive คูลดาวน์ 5.64 ตรง |
| Q12 JSON ผิด / storage ใช้ไม่ได้ | PASS | primary เสีย→เสนอกู้ backup (ไม่เขียนทับก่อนยืนยัน), ทั้งสองเสีย→ไม่รีเซ็ต + ส่งออกดิบ (ได้ byte เดิม), นำเข้า: JSON เสีย/ID แปลก/schema อนาคต/checksum ไม่ตรง ถูกปฏิเสธโดยไม่เขียน, นำเข้าถูก→พรีวิว→แทนที่; storage ใช้ไม่ได้→แบนเนอร์ + เล่นได้ + ไม่ขึ้น "บันทึกแล้ว" + ส่งออกได้; เขียนล้มเหลวตอน settlement → แจ้ง error, รางวัลไม่เข้าคลัง, retry จ่ายครั้งเดียว |
| Q13 สองแท็บ | PASS | แท็บที่ตามหลังถูกล็อก+ขึ้น dialog, เขียนถูกปฏิเสธ (revision), เซฟของแท็บแรกไม่ถูกทับ, reload ได้ข้อมูลล่าสุด |
| Q14 10 รอบไม่มี growth | PASS (วัดแบบหยาบ) | `scene.children` = 3 ตลอด 10 รอบ; heap หลัง GC 14.3–14.9 MB (ไม่โตต่อรอบ ≈ −60 KB/รอบ) ใน Chromium headless — ไม่ใช่การวัดบนมือถือ |
| Q15 viewport | PASS | 5 ปุ่ม HUD (รวมสกิล) ที่ 844×390, 740×360, 667×375, 568×320: ≥48px ไม่ซ้อน อยู่ในจอ; หน้า ฐาน/เตรียมล่า/คราฟต์ ปุ่ม ≥48px (หน้าคราฟต์ต้องเลื่อน — DESIGN_DEVIATIONS #23) |
| ใหม่: ปิดหน้ากลางล่า | PASS | pendingHunt ถูกเขียนก่อนเข้าล่า; reload → abandoned, ไม่ได้รางวัล, วัสดุเดิมครบ, แจ้งข้อความสั้น |
| ใหม่: แพ้ไม่ได้อะไร | PASS | วัสดุ/Research = 0 แต่ท่าที่เห็นถูกบันทึกในสมุด |

## Domain tests ใหม่ใน M2 (63 จาก 90)
คราฟต์ 4/6, ไม่ติดลบ, ห้ามซ้ำ/upgrade ซ้ำ/โมดูลที่ยังไม่เปิด • settlement: ชนะ/แพ้/abandon, idempotent, pure • validateSave 11 กรณีปฏิเสธพร้อมเหตุผล • SaveManager: commit/อ่านกลับ/backup, write fail → ไม่ commit + retry, settlement fail→retry จ่ายครั้งเดียว, craft transaction, primary เสีย/ทั้งคู่เสีย, checksum, volatile, สองแท็บ, import/export • สกิล: Focus Strike (windup 0.35, 18 dmg, แรง 20, cd 6, stamina ไม่พอ=ไม่ติด cd), เขี้ยว (15/16, bleed 3/3.3 carry, refresh ไม่ stack, DOT ไม่ทำ part/stagger), ถุงไฟ (โซน, pulse 1/2/3 วินาที เฉพาะเมื่ออยู่ในโซน, 6/6.6), passive ทั้งสอง, DOT ฆ่า = SUCCESS ครั้งเดียว

## NOT TESTED / ข้อจำกัด
- มือถือจริง (touch feel, FPS ≥30, ความร้อน, safe-area); ความสนุก/ความยาก/ความอ่านง่ายเมื่อมนุษย์เล่น — **ยังไม่มี owner playtest M2**
- ล่า HP เต็มพร้อมโมดูล (ทดสอบ HP ย่อ; HP เต็มทดสอบเฉพาะ M1 regression ไม่มีโมดูล)
- Balance ต้นทุน 4/6 เทียบรางวัล 2/รอบ ("โมดูลแรกใช้สูงสุด 2 รอบ") — ในเกมจริงต้อง playtest; ค่าอยู่ใน `CRAFT_COST`
- การเขียนเซฟ crash กลางทาง (process kill ระหว่าง `setItem`) — ใช้ atomic per-key + backup แต่ไม่ได้จำลอง kill จริง
- localStorage quota จริง/Safari private mode จริง (จำลองด้วย setItem ที่ throw), Firefox/Safari, หลาย origin
- Q03 (shell/poison/wing/horn), Q08–Q10, Q16–Q18 (ยังไม่มีปู/ปีก/จับ/เถาวัลย์), ยาฟื้น, stuck-handling ของสัตว์
- FPS ~60 มาจาก headless Chromium เท่านั้น • คลิปเปิด `?debug=1` เลยเห็น overlay

หลักฐาน: `qa-artifacts/` (m2-*.png, m2-loop.mp4, m1-hunt-win.mp4, qa-m*-run.log, qa-m2-results.json) — ทั้งหมดเป็น placeholder shapes

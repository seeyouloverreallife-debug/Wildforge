# QA report — M0 / 0.0.1

Environment: Linux container, Node 22.22.0, headless Chromium (Playwright 1.56.1, chromium-1194). **ไม่มีมือถือจริง; touch ทั้งหมดเป็น CDP touch emulation** ผลคือ "simulated" ไม่ใช่ real device

## Automated (npm test): 17/17 PASS
player (เดิน/ทแยง/ขอบ/หิน, หลบ 150u, i-frame, cooldown, stamina, buffer, attack phases, cancel, facing lock), fixedStep (frame-rate independent, clamp), settings sanitize

## Browser (npm run qa:browser, scripts/qa-browser.mjs): 26/26 PASS (รอบล่าสุด)
| ID | ผล | วิธี |
|---|---|---|
| M0 เดิน/หลบ คอม | PASS | คีย์บอร์ด/เมาส์ใน Chromium viewport 1366×768 (ความเร็วเดิน ≤222 u/s วัดจากเวลา sim; ค่าแม่นยำอยู่ใน unit test) |
| M0 เดิน/หลบ touch | PASS (simulated) | CDP multi-touch 844×390 และ 740×360 |
| Q04 จอย+โจมตี+หลบพร้อมกัน | PASS (simulated) | จอยไม่ขโมย pointer ปุ่ม; ปล่อยแล้วหยุดค้างไม่มี |
| Q05 blur / pointercancel | PASS (simulated) | ส่ง `blur` event และ CDP touchCancel; **ไม่ได้ทดสอบ alt-tab จริง / visibilitychange จริง** |
| Q15 viewport | PASS ที่ 844×390, 740×360, 390×844 (portrait) และ 1366×768 | ปุ่ม ≥48px, ไม่ซ้อนกัน, อยู่ในจอ; portrait แสดงคำแนะนำ+หยุดเกม+ปุ่มตั้งค่า |
| Console errors | PASS | ไม่มี error ระหว่างชุดทดสอบ |

## NOT TESTED
มือถือจริง (touch feel, safe-area จริง, FPS/ความร้อน) • FPS 30+ บนมือถือ • memory growth 10 รอบ (ยังไม่มี loop) • Q01–Q03, Q06–Q14, Q16–Q18 (นอก M0) • Firefox/Safari • screen reader • ฟอนต์ไทยบนอุปกรณ์จริง • iOS rotate behaviour
FPS ในรายงาน (~60) วัดจาก headless Chromium เท่านั้น ไม่ใช่ค่ามือถือ

หลักฐานภาพ: `qa-artifacts/*.png` (ทุกภาพเป็น placeholder shapes)

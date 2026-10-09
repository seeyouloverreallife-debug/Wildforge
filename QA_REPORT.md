# QA report — M1 / 0.0.2

Environment: Linux container, Node v22.22.0, npm 10.9.4, headless Chromium (Playwright 1.56.1). Clean-room `npm ci` → build → test → audit re-run on the committed tree: all OK (`docs/DEPENDENCY_CHECK.md`).
**ไม่มีมือถือจริง** — touch ทั้งหมดเป็น CDP touch emulation ("simulated") และ**ผู้เล่นในคลิปเป็นบอท** ไม่ใช่มนุษย์ → ไม่มีข้อมูลความสนุก/ความยาก/touch feel

## Automated domain tests (`npm test`): 42/42 PASS
M0 player/fixedStep/settings (17) + M1 hunt (25): ฟันหลายเฟรมทับกัน = damage ครั้งเดียวต่อ attackId • ถือปุ่มโจมตี = 1 hit/attackId • ×1.15 ช่วง recovery • เลือกส่วนใกล้ปลายอาวุธ/ด้านข้างโดนถุงไฟ • cycleTarget ข้ามส่วนที่แตก • แตกซ้ำไม่จ่ายซ้ำ • **อวัยวะแตกพร้อมตาย → break มาก่อน death, brokenPartIds ครบ, SUCCESS ครั้งเดียว** • แตกไม่ต่อเวลา stagger • stagger meter 100 → 1.2s • ถุงไฟแตก → พ่นไฟไม่ eligible/ไม่ถูกเลือก (50 seeds × 40 ครั้ง) • ไม่ซ้ำท่าเกิน 2 ติด • seed เดิม = ลำดับท่าเดิม • ถุงไฟแตก bite recovery +0.2, ขากรรไกรแตก bite 12 • พ่นไฟ 22 ครั้งเดียวทั้งที่ cone อยู่ 0.7s • invulnerable 0.6s หลังโดน • i-frame หลบกันดาเมจ / สัมผัสตอน i-frame ไม่ใช้ attack • กัด 16 / กวาด 18 • ชนหินหยุดพุ่ง recovery +0.5 • หางหันเข้าหาผู้เล่น • FAILED/timeout/ABANDONED จบครั้งเดียว ไม่ step ต่อ • ฆ่ากับถูกตี tick เดียวกัน = terminal เดียว

## Browser M1 (`npm run qa:m1`, scripts/qa-m1.mjs): 52/52 PASS (simulated touch, 844×390)
| ID | ผล | หลักฐาน |
|---|---|---|
| ล่าจบ 1 รอบ (ชนะ) | PASS | บอทเล่นผ่านจอย/ปุ่ม touch emulation ชนะใน sim 141 วินาที, ใช้ 1 attempt, แตกทั้งถุงไฟ+ขากรรไกร — `qa-artifacts/m1-hunt-win.mp4`, `m1-results-success.png` |
| **Q02 ถุงไฟแตกแล้วหยุดพ่นไฟ** | PASS | log จริงในรอบชนะ: telegraph พ่นไฟก่อนแตก 4 ครั้ง, **หลังแตก 0 ครั้ง** ขณะที่ท่าอื่นถูกใช้อีก 45 ครั้ง |
| ทุกครั้งที่ผู้เล่นโดนมี telegraph ของท่านั้นนำก่อน | PASS | 3 hurt events ในรอบ (บอทเลี่ยงได้ส่วนใหญ่) |
| เห็นครบ 3 ท่า, terminal event เดียว, แตกก่อนตาย | PASS | event log |
| **Pause ระหว่าง telegraph / attack** | PASS | หยุดที่ monster t=0.317 (telegraph) และ 0.117 (attack): mon t, elapsed, phase, HP ไม่เปลี่ยนหลังรอ 1.5 วินาทีจริง; กด resume 0.25s จริง → elapsed เพิ่ม 0.267/0.250 (ไม่กระโดด) |
| พ่ายแพ้ | PASS | HP=1 → FAILED, หน้า "ล้มเหลว / ผู้เล่นล้ม / ลองใหม่", terminal เดียว, กด "ลองใหม่" ปุ่มเดียว → huntId ใหม่ ACTIVE HP 100 (`m1-results-failed.png`) |
| **Resize/หมุนจอ vs จอย/ปุ่ม** | PASS | 5 ขนาดแนวนอน (844×390, 740×360, 667×375, 932×430, 568×320): ปุ่มทั้ง 4 ≥48px ไม่ซ้อน อยู่ในจอ; canvas เท่า viewport; ฐานจอยโผล่ใต้นิ้ว (คลาด ≤1px) และเดินได้; **resize ระหว่างจอยค้าง → input ถูก drop ผู้เล่นหยุดนิ่ง (0.00)**; หมุนเป็นแนวตั้งขณะจับ → pause+คำแนะนำ, หมุนกลับ → เกมเดินต่อไม่มี input ค้าง |
| ไม่มี console error | PASS | ตลอดชุดทดสอบ |

## Browser M0 regression (`npm run qa:browser`): 26/26 PASS
(ปรับ script ให้กด "เริ่มล่า" และจอดสัตว์ไว้ เพื่อทดสอบการเดิน/หลบอย่างเดียว)

## การเปลี่ยนที่ผู้ใช้ขอ
* เดินระหว่างฟัน/แรงสั่น: ทำตามตารางใน `tuning.ts` แต่ **ไม่มีตารางต้นฉบับแนบมา** — ค่าเป็นข้อเสนอ ดู DESIGN_DEVIATIONS #1 (ทดสอบแล้ว: unit ฟัน/เดิน ผ่าน; ความรู้สึกยัง NOT TESTED)

## NOT TESTED / ข้อจำกัด
มือถือจริง (touch feel, FPS, ความร้อน, safe-area จริง) • ความสนุก/ความยุติธรรมของท่าเมื่อมนุษย์เล่น (บอทเก่งเกินมนุษย์) • Q01, Q03–Q04 เฉพาะ shell/poison/wing/horn, Q06–Q14, Q16–Q18 (ยังไม่มี save/ปู/ปีก/เถาวัลย์/จับ) • หมดเวลา 10 นาทีใน browser (ทดสอบเฉพาะ unit) • stuck-handling สัตว์ (ยังไม่ทำ) • alt-tab จริง/visibilitychange จริง (จำลองด้วย event `blur`) • Firefox/Safari • memory growth 10 รอบ (ยังไม่ได้วัด) • ฟอนต์ไทยบนอุปกรณ์จริง
FPS ~59–60 ในคลิปเป็นของ headless Chromium เท่านั้น • คลิปเปิด `?debug=1` จึงเห็น overlay

หลักฐาน: `qa-artifacts/` (ภาพทั้งหมดและคลิปเป็น placeholder shapes), `qa-artifacts/qa-m1-run.log`

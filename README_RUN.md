# Wildforge — รันโครงการ (M1 / v0.0.2)

บันทึกสภาพแวดล้อมที่ตรวจจริง: Node v22.22.0, npm 10.9.4 (Linux) — รายละเอียดและคำสั่งที่รันจริงดู `docs/DEPENDENCY_CHECK.md`
เวอร์ชันที่ล็อกใน `package-lock.json`: phaser 4.2.1, vite 8.3.4, typescript 7.0.2, vitest 5.0.3

```bash
npm ci               # ติดตั้งตาม lockfile (ใช้แทน npm install)
npm run dev          # dev server (Vite)
npm run build        # typecheck + production build -> dist/
npm run preview      # เสิร์ฟ dist/
npm test             # unit tests (vitest)
npm run qa:browser   # build + QA browser ของ M0 (Playwright + Chromium)
npm run qa:m1        # build + QA browser ของ M1 รวมบอทเล่นจนจบ 1 รอบ + บันทึกวิดีโอ (~4–6 นาที)
```
สคริปต์ QA ใช้ Playwright ที่ติดตั้งแบบ global ที่ `/opt/node-tools` (แก้ path ใน `scripts/*.mjs` ถ้าเครื่องอื่น)

Query flags: `?debug=1` debug overlay (F3 / ` สลับ) + `window.__wildforge` (state/event log) • `?touch=1` บังคับแสดงปุ่ม touch

## ปุ่มควบคุม
เดิน WASD/ลูกศร • โจมตี คลิกซ้าย/J (กดค้างได้) • หลบ Space/K • เปลี่ยนส่วนเป้าหมาย Tab/R • Pause Esc/P
Touch: จอยลอยครึ่งจอซ้าย • ปุ่ม โจมตี / หลบ / เป้า (เปลี่ยนส่วน) ขวาล่าง — ถ้าไม่ใช้เมาส์ ตัวละครจะหันหา "ส่วนที่เลือก" เมื่อสัตว์อยู่ในระยะ 420

## โครงสร้าง
`src/data` ค่า/ข้อมูล (tuning, weapons, monsters) • `src/domain` ตรรกะล้วน ไม่พึ่ง render (player, monster, hunt, geometry, rng) • `src/engine` Phaser scene, input, pause • `src/ui` DOM/CSS • `src/persistence` settings • `src/diagnostics` • `docs/` เอกสารออกแบบ V1.0

# Wildforge — รันโครงการ (M0 / v0.0.1)

ตรวจกับ Node 22.22.0 / npm 10.9.4 (Linux). เวอร์ชันที่ล็อกจริงอยู่ใน `package-lock.json`:
phaser 4.2.1, vite 8.3.4, typescript 7.0.2, vitest 5.0.3.

```bash
npm ci            # ติดตั้งตาม lockfile
npm run dev       # dev server (Vite)
npm run build     # typecheck + production build -> dist/
npm run preview   # เสิร์ฟ dist/
npm test          # domain unit tests (vitest)
npm run qa:browser  # build + Playwright QA (ต้องมี Playwright + Chromium; ดู scripts/qa-browser.mjs)
```

Query flags: `?debug=1` เปิด debug overlay (F3 / ` สลับ) และ `window.__wildforge`; `?touch=1` บังคับแสดงปุ่ม touch บนเดสก์ท็อป

## ปุ่มควบคุม (M0)
เดิน WASD/ลูกศร • โจมตี คลิกซ้าย/J (กดค้างได้) • หลบ Space/K • Pause Esc/P
Touch: จอยลอยครึ่งจอซ้าย, ปุ่ม "โจมตี" (กดค้าง) และ "หลบ" ขวาล่าง

## โครงสร้าง
`src/data` ค่า/ข้อมูล • `src/domain` ตรรกะล้วน (ไม่พึ่ง render) • `src/engine` Phaser scene, input, pause • `src/ui` DOM/CSS • `src/persistence` settings • `src/diagnostics` debug overlay • `docs/` เอกสารออกแบบ V1.0

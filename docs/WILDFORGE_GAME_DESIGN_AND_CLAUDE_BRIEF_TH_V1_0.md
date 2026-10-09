# WILDFORGE — เอกสารออกแบบเกมและคำสั่งพัฒนาให้ Claude

เวอร์ชันเอกสาร: 1.0 • วันที่: 9 ตุลาคม 2026

สถานะ: ข้อกำหนดต้นแบบที่เริ่มพัฒนาได้ ไม่ใช่เกมที่สร้างหรือทดสอบแล้ว

ชื่อชั่วคราว: Wildforge / เกาะหลอมเขี้ยว — ยังไม่ได้ตรวจความซ้ำของชื่อหรือเครื่องหมายการค้า

## 0. วิธีใช้ไฟล์นี้

ส่งไฟล์นี้ให้ Claude ทั้งไฟล์ แล้วใช้คำสั่งในหัวข้อ 25 เพื่อเริ่มงาน ให้ทำทีละ milestone และส่งหลักฐานตามหัวข้อ 24 เมื่อได้งานกลับมา ให้ส่ง source code พร้อมรายงานและภาพหรือวิดีโอให้ ChatGPT ตรวจเทียบข้อกำหนดก่อนสั่งรอบถัดไป

เอกสารนี้เป็นแหล่งข้อกำหนดหลักของโครงการ ค่าตัวเลขทั้งหมดเป็นค่าเริ่มต้นสำหรับ playtest ไม่ใช่ค่าที่ผ่านการพิสูจน์ความสนุกแล้ว ห้ามรายงานว่าเกมสนุก สมดุล หรือรองรับมือถือจริง หากยังไม่มีการเล่นทดสอบตามเงื่อนไขนั้น

หน้าที่ทีม:

| ผู้รับผิดชอบ | หน้าที่ |
|---|---|
| ผู้ใช้ / เจ้าของโครงการ | เลือกทิศทาง ทดลองเล่น แจ้งความรู้สึก และตัดสินใจเปลี่ยนขอบเขต |
| ChatGPT / หัวหน้างานออกแบบ | ดูแล concept, game loop, UX, balance hypotheses, roadmap และตรวจงานที่ส่งกลับมา |
| Claude / ผู้ดำเนินการ | สร้างเกม แยกโค้ดและข้อมูล ทดสอบ แก้บั๊ก ส่ง source และบันทึก checkpoint |

ไม่มีการเชื่อมต่ออัตโนมัติระหว่าง ChatGPT กับ Claude เจ้าของโครงการเป็นผู้ส่งไฟล์และผลการทำงานระหว่างกัน

## 1. Product vision

เกมล่ามอนสเตอร์ 2D มุมมองจากด้านบนสำหรับเล่นคนเดียว ใช้เวลารอบละประมาณ 3–7 นาที ผู้เล่นอ่านพฤติกรรมมอนสเตอร์ เลือกโจมตีอวัยวะ หลบหรือใช้สิ่งแวดล้อม แล้วนำชิ้นส่วนกลับมาสร้างอาวุธมีชีวิตที่เปลี่ยนวิธีต่อสู้

คำอธิบายหนึ่งประโยค: “รู้จักสัตว์ ล่าอย่างมีแผน แล้วเปลี่ยนสิ่งที่ได้มาเป็นวิธีเล่นใหม่”

ความรู้สึกที่ต้องการ:

- การล่าชนะจากการอ่านท่าและตัดสินใจ ไม่ใช่จากค่าโจมตีอย่างเดียว
- ของที่ได้ทำให้เห็นเป้าหมายชัดว่าอยากสร้างอะไรต่อ
- กลับฐานแล้วเห็นความคืบหน้า โดยไม่ต้องจัดการเมนูยาว
- ล่าซ้ำได้โดยเปลี่ยนอาวุธ เป้าหมายอวัยวะ และภารกิจ
- เล่นหนึ่งรอบแล้วหยุดได้ ความคืบหน้าไม่หาย และกลับมาเล่นต่อได้ง่าย

ตัวตนของเกมมาจากอาวุธประกอบจากอวัยวะ การอ่านสัตว์ และพื้นที่ล่าแบบกระชับ ใช้แนว monster hunting เป็นแรงบันดาลใจด้านวงจรการเล่น แต่สร้างชื่อ รูปลักษณ์ ท่าโจมตี UI เสียง และเนื้อเรื่องของตัวเองทั้งหมด

## 2. Design pillars และเกณฑ์ตัดสินฟีเจอร์

| เสาหลัก | สิ่งที่ต้องมี | สิ่งที่ไม่ช่วยเป้าหมายในรุ่นแรก |
|---|---|---|
| อ่านแล้วตอบสนองได้ | ท่ามีสัญญาณก่อนโจมตี รูปทรง hitbox สอดคล้องภาพ | โจมตีทันทีจากนอกจอ |
| วัตถุดิบเปลี่ยนวิธีเล่น | โมดูลเพิ่มทักษะคนละแบบ | ของหลายสิบชนิดที่ต่างแค่ +1 พลัง |
| รอบสั้นแต่มีการตัดสินใจ | เลือกอาวุธ เลือกส่วนโจมตี เลือกจังหวะใช้ทักษะ | เดินหาเป้าหมายนานก่อนต่อสู้ |
| เล่นซ้ำโดยสมัครใจ | เป้าหมายสร้างของ สมุดสัตว์ และความชำนาญ | ลงโทษเมื่อไม่ล็อกอินหรือพักเล่น |
| เล็กและส่งมอบได้ | เกมจบวงจรบนพื้นที่เดียวก่อน | โลกเปิด multiplayer และ backend ตั้งแต่เริ่ม |

เมื่อเสนอฟีเจอร์ใหม่ ให้ตอบว่า “ช่วยเสาหลักใด เพิ่มการตัดสินใจอะไร และทดสอบด้วยอะไร” หากตอบไม่ได้ให้พักไว้ใน backlog

## 3. ผู้เล่นและแพลตฟอร์ม

กลุ่มเป้าหมายเริ่มต้น: คนชอบล่าบอส ฟาร์มวัตถุดิบ ทดลอง build และเกมที่เล่นระหว่างช่วงพักได้ ไม่จำเป็นต้องเคยเล่นเกมแนวนี้

แพลตฟอร์มต้นแบบ: เว็บเกมที่เปิดในคอมและมือถือ แนวนอนเป็นรูปแบบหลัก บนแนวตั้งแสดงคำแนะนำให้หมุนจอพร้อมปุ่มเปิดการตั้งค่า ไม่วางจอยและ HUD จนบดบังสนาม

ภาษา UI รุ่นแรก: ไทย โดยใช้ stable English IDs ใน source/data เพื่อให้แก้ข้อมูลง่าย คำสั่งปุ่มต้องสั้น เช่น “ล่า”, “ประกอบ”, “ติดตั้ง”, “จับ”, “กลับฐาน”

การแจกจ่ายเริ่มต้น: source + build + README ให้รันได้ ไม่ต้องสมัครสมาชิกและไม่ต้องมี server การเผยแพร่เว็บไซต์หรือลงร้านแอปเป็นงานต่างหาก ต้องได้รับคำสั่งจากเจ้าของโครงการ

## 4. ขอบเขต MVP ที่ล็อกไว้

MVP ในเอกสารนี้หมายถึงรุ่น 0.1.0 หลังผ่าน milestone M0–M4

| ระบบ | จำนวน/รายละเอียดใน MVP |
|---|---|
| ผู้เล่น | 1 ตัว เล่นคนเดียว |
| ฐาน | 1 หน้าหลัก มีออกล่า โรงประกอบ และสมุดสัตว์ |
| พื้นที่ | 1 arena เป็นป่าชายฝั่ง ใช้ layout เดียว |
| มอนสเตอร์ | 3 ชนิด พฤติกรรมและ silhouette แตกต่าง |
| อาวุธพื้นฐาน | 2 แบบ: ดาบเขี้ยว และหอกกิ่ง |
| วัตถุดิบ | 6 ชนิด ไม่มีระบบทองใน MVP |
| โมดูลอาวุธ | 6 แบบ ระดับ I และ II |
| ช่องประกอบ | โมดูลหลัก 1 ช่อง + โมดูลเสริม 1 ช่อง หรือเว้นว่างได้ |
| ภารกิจ | ล่า 3 ใบ + จับ 3 ใบ หลังปลดล็อกตามลำดับ |
| สิ่งแวดล้อม | ก้อนหิน/กำแพงที่บัง charge และเถาวัลย์ 1 จุด |
| เครื่องมือ | ยาฟื้น 2 ครั้งต่อรอบ กับดักจับ 1 ครั้ง และคบเพลิงเผาเถาวัลย์ 1 ครั้ง |
| ความคืบหน้า | โมดูล วัตถุดิบ ใบภารกิจ และสมุดสัตว์ |
| การบันทึก | local save มี export/import และ backup |
| อินพุต | คีย์บอร์ด+เมาส์ และ touch controls |
| เสียง/ภาพ | placeholder ที่อ่านท่าได้ก่อน งานสวยหลัง core ผ่าน |

ยังไม่อยู่ใน MVP: multiplayer, online accounts, cloud save, open world, procedural maps, ระบบเลี้ยงสัตว์รายวัน, breeding, armor sets, durability, hunger, monetization, daily rewards, weather และสัตว์ชนิดที่สองใน arena

จับสัตว์ใน MVP เพิ่มประวัติในสมุดและภาพไอคอนที่ฐานเท่านั้น ไม่มีการให้อาหารหรือการลงโทษเมื่อผู้เล่นหายไป

## 5. Core loop และ first session

Core loop: ฐาน → เลือกใบภารกิจ/วัตถุดิบเป้าหมาย → เลือกอาวุธ/โมดูล → เข้าพื้นที่ → อ่านท่า/ทำลายส่วน → ล่าหรือจับสำเร็จ → ดูรางวัล → ประกอบ/ติดตั้ง → ออกล่าต่อ

ไม่มีการเดินไกลระหว่างฐานและ arena ใช้หน้าภารกิจเป็นจุดเตรียมตัว และเริ่มเข้า arena ในตำแหน่งปลอดภัย

ช่วงเริ่มเกมเป้าหมายประมาณ 10–15 นาที:

1. ตั้งค่าเสียง/การควบคุมได้ แต่ไม่บังคับสร้างชื่อหรือสมัคร
2. รับดาบเริ่มต้น ไม่มีโมดูล ตัวละครเริ่มเต็ม HP/stamina
3. ฝึกเดิน หลบ โจมตี และอ่านสัญญาณกับเป้าฝึกแบบข้ามได้
4. ล่ากิ้งก่าถุงไฟครั้งแรก ใช้ค่าปกติ มีคำใบ้สั้นเฉพาะครั้งแรก
5. เลือกวัตถุดิบเป้าหมายก่อนล่าเพื่อให้ผู้เล่นกำหนดสิ่งที่ฟาร์มเอง
6. หน้าผลลัพธ์ชี้ว่าได้อะไรและขาดอีกเท่าไรสำหรับโมดูลแรก
7. เมื่อมีวัสดุครบ สร้างและติดตั้ง แล้วแสดงทักษะใหม่ให้ทดลองบนเป้าฝึก
8. หลังชนะครั้งแรกปลดล็อกหอกและภารกิจปู หลังชนะปูปลดล็อกมอนสเตอร์บิน

หากผู้เล่นแพ้ครั้งแรก ต้องย้อนกลับไปลองได้ภายใน 2 ปุ่ม ไม่ต้องอ่าน tutorial ใหม่

## 6. State flow ของเกม

Game states: BOOT, BASE, MISSION_SELECT, LOADOUT, HUNT, PAUSED, RESULTS, SETTINGS

Hunt lifecycle: CREATED → ACTIVE → SUCCESS/FAILED/ABANDONED → SETTLED

กติกา:

- เข้า HUNT ได้เมื่อ loadout และ mission ผ่าน validation
- เปิด pause/settings หรือ browser เสีย focus ให้หยุด simulation, audio ต่อสู้ และ reset input
- ชนะ/แพ้ต้องเกิดได้ครั้งเดียวต่อ huntId ห้ามให้ death และ capture จ่ายรางวัลซ้ำ
- RESULTS ไม่เดินเวลา ไม่รับ combat input
- จ่ายรางวัลและบันทึก transaction ก่อนเปิดผลลัพธ์ หากเขียน save ไม่สำเร็จต้องแจ้งและ retry ได้โดยไม่สร้างรางวัลซ้ำ
- กลับฐานและเริ่มใหม่เป็น huntId ใหม่ ไม่ใช้ reward object ของรอบก่อน
- ปิดหน้าในระหว่างล่า: รอบนั้นเป็น abandoned เมื่อเปิดใหม่ ไม่ให้รางวัลและไม่ลบ inventory เดิม แสดงข้อความสั้น ไม่ลงโทษเพิ่ม
- MVP ไม่ resume กลางการต่อสู้ ให้บันทึก persistent state ก่อนเข้าล่า และหลัง settlement

## 7. Combat specification

### 7.1 ค่าผู้เล่นเริ่มต้น

| ค่า | ค่าเริ่มต้น | หมายเหตุ |
|---|---:|---|
| HP | 100 | ไม่มีค่าเกราะพื้นฐาน |
| Stamina | 100 | ใช้หลบและทักษะ |
| Stamina regen | 20/วินาที | เริ่มหลังใช้ stamina ครั้งสุดท้าย 0.8 วินาที |
| เดิน | 220 logical units/วินาที | โลกใช้พิกัดคงที่ แยกจากขนาดจอ |
| หลบ | 150 units ใน 0.30 วินาที | ใช้ 25 stamina |
| ช่วง invulnerable ของหลบ | วินาทีที่ 0.05–0.22 | แสดงเอฟเฟกต์สั้น |
| Dodge cooldown | 0.65 วินาที | ไม่มีการหลบไม่จำกัด |
| หลังโดนโจมตี | invulnerability 0.60 วินาที | ป้องกัน hitbox เดียวทำ damage ซ้ำ |
| ยาฟื้น | +35 HP, 2 ครั้ง/รอบ | ใช้เวลา 0.70 วินาที ยกเลิกได้ถ้าโดนก่อนจบ |
| เวลาสูงสุดการล่า | 10 นาที | เป้าหมายส่วนใหญ่จบ 3–7 นาที |

ยาฟื้นถูกหัก charge และฟื้น HP เมื่อใช้สำเร็จเท่านั้น โดนระหว่างชาร์จไม่หัก charge การรับ hit ที่ HP=0 ห้ามเริ่มใช้ยา

### 7.2 อาวุธพื้นฐาน

| อาวุธ | Normal attack | จุดเด่น | ข้อแลกเปลี่ยน |
|---|---|---|---|
| fang_cleaver / ดาบเขี้ยว | 10 damage, cycle 0.60s, arc 100°, range 90 | พื้นที่โจมตีกว้าง เข้าประชิดง่าย | ต้องเข้าใกล้ |
| branch_spear / หอกกิ่ง | 9 damage, cycle 0.65s, narrow capsule, range 140 | เล็งอวัยวะและรักษาระยะ | พลาดง่ายเมื่อเป้าอยู่ด้านข้าง |

Attack cycle แบ่ง startup/active/recovery ใน data: ดาบ 0.18/0.10/0.32s; หอก 0.20/0.10/0.35s Normal attack ไม่ใช้ stamina เพื่อลดช่วงที่ทำอะไรไม่ได้

Input buffer 0.15s: เก็บคำสั่งโจมตีหรือหลบได้ 1 รายการ ไม่ queue หลายคำสั่ง กดค้างโจมตีให้โจมตีต่อเนื่องได้ แต่ยังติด recovery หลบยกเลิก normal recovery ได้หลัง recovery ผ่านครึ่งหนึ่ง ห้ามยกเลิก startup/active และห้ามข้าม recovery ด้วยการสลับปุ่ม

ไม่มีโมดูลหลัก: skill เป็น Focus Strike, 18 damage, 20 stamina, cooldown 6s, windup 0.35s, ใช้ hit shape ของอาวุธพื้นฐาน หากมีโมดูลหลัก skill ถูกแทนที่ ไม่เพิ่มปุ่ม

### 7.3 การเล็งและอวัยวะ

เมาส์: ตัวละครหันไปตาม pointer ขณะโจมตี คีย์บอร์ดเดินไม่บังคับหันหนีเป้าระหว่างการโจมตี

Touch: มี soft-lock มอนสเตอร์เมื่ออยู่ในระยะ 420 units ปุ่มโจมตีหันหา selected part โดยไม่ดูดตัวละครไปหาเป้า หากไม่ lock ให้ใช้ทิศการเคลื่อนที่ล่าสุด

ปุ่มเลือกอวัยวะวน body → part A → part B ได้ทั้งคอมและมือถือ แสดงชื่อ/ไอคอนส่วนที่เลือก แต่จะโดนได้ต่อเมื่อ attack shape ชน hit region จริง ไม่มีการทำ damage ระยะไกลจากการเลือก

โมเดล collision: main body เป็นวงกลมหรือ ellipse และ part regions เป็นวงกลม/sector ที่ขยับตาม body orientation ไม่ใช้ pixel-perfect collision รุ่นแรก

เมื่อหนึ่ง attackId ชนหลาย region ของสัตว์เดียวกัน: ทำ body damage ครั้งเดียว เลือก part ที่ชนและใกล้ปลายโจมตีที่สุดเพื่อทำ part damage ครั้งเดียว การเลือก part ใช้เป็น tie-breaker ไม่ข้าม geometry

DOT ทำ body damage แต่ไม่ทำ part damage ไม่ stagger ไม่เติม part bonus ป้องกันทักษะพื้นที่ทำลายทุกส่วนโดยไม่เล็ง

### 7.4 Damage rules

preArmorDamage = baseDamage × secondaryAttackMultiplier × vulnerabilityMultiplier

bodyDamage = round(preArmorDamage × monsterArmorMultiplier)

monsterArmorMultiplier ใช้ 0.8 เฉพาะ hit ด้านหน้าของปูที่ shell ยังไม่แตก; กรณีอื่น 1.0 ค่า secondaryAttackMultiplier ของ fang passive ใช้เฉพาะ normal attack ตามตาราง ไม่เพิ่ม skill/DOT

vulnerabilityMultiplier = 1.15 เมื่อโจมตีระหว่าง monster recovery; กรณีอื่น 1.0 ไม่มี crit RNG ใน MVP

partDamage = round(preArmorDamage × partMultiplier ของ hit × secondaryPartMultiplier); default multipliers 1.0; Horn Breaker skill ใช้ 2.0 เฉพาะ hit นั้น ส่วนเสริม horn ใช้ secondaryPartMultiplier 1.15 หรือ 1.18 ตาม tier จึงไม่ลด part damage จากเกราะด้านหน้าปู

สถานะ poison/burn/bleed ใช้ค่าจากโมดูล ไม่รับ vulnerability bonus และไม่ stack หลาย instance จากผู้เล่นคนเดียว การใช้ซ้ำ refresh duration ถ้า DOT ทำ HP เป็นศูนย์จบเป็น hunt success ตามปกติ

ท่าของมอนสเตอร์ที่มี attackId เดียว hit ผู้เล่นได้ครั้งเดียว แม้ overlap หลาย frame ท่าหลาย pulse ต้องประกาศ pulse IDs แยกใน data

## 8. มอนสเตอร์ 3 ชนิด

ทุกชนิดต้องมี idle/approach, telegraph, attack, recovery, stagger, death และ captured state สีไม่ใช่สัญญาณเดียว ใช้รูปร่าง ท่าทาง และเสียงช่วยอ่าน

| ID / ชื่อ | Body HP | Part A / HP | Part B / HP | วัสดุที่เลือกฟาร์ม |
|---|---:|---|---|---|
| ember_gecko / กิ้งก่าถุงไฟ | 1400 | fire_sac / 220 | jaw / 180 | heat_bladder, fang |
| mire_crab / ปูเกราะพิษ | 1700 | shell / 300 | poison_sac / 220 | shell_scale, venom_sac |
| sail_lizard / กิ้งก่าปีกลม | 1500 | wing / 240 | horn / 200 | sail_wing, blunt_horn |

HP ออกแบบให้มีเวลาฝึกอ่านท่าหลายนาที แต่เวลาจริงขึ้นอยู่กับ uptime และ build ห้ามเพิ่ม HP อย่างเดียวเมื่ออยากให้ยากขึ้น

### 8.1 กิ้งก่าถุงไฟ — ฝึกอ่านทิศและเข้าด้านข้าง

ลักษณะ: สัตว์สี่ขา หัวกว้าง ถุงใต้คอเปล่งแสงสีส้ม หางหนา silhouette ของตัวเอง

| ท่า | Telegraph | Attack | Recovery | Damage / counter |
|---|---:|---:|---:|---|
| Fire breath | 0.90s สูดลม ถุงพอง | cone 70°, range 260, 0.70s | 1.10s | 22; หลบข้างแล้วโจมตีถุง |
| Bite lunge | 0.65s ลดหัว | dash 180, 0.25s | 0.80s | 16; หลบออกเส้นตรง |
| Tail sweep | 0.80s หันหัวมองหลัง | arc 220°, 0.30s | 0.90s | 18; ถอยหรือหลบเข้าช่วงต้น |

Fire breath ล็อกทิศเมื่อ telegraph ผ่าน 70% แสดงการหยุดติดตามให้เห็น เมื่อ fire_sac แตกเอา fire breath ออกจาก move pool และเพิ่ม recovery ของ bite อีก 0.20s เมื่อ jaw แตก bite damage ลดจาก 16 เหลือ 12

### 8.2 ปูเกราะพิษ — ฝึกเลือกด้านและจัดพื้นที่

ลักษณะ: กระดองกว้าง ขาเตี้ย ถุงพิษใต้ด้านท้าย ไม่ใช้หน้าตาเหมือนชนิดแรก

| ท่า | Telegraph | Attack | Recovery | Damage / counter |
|---|---:|---:|---:|---|
| Claw slam | 0.85s ยกก้าม | circle radius 100 ที่ตำแหน่งเป้าล็อก, 0.20s | 1.00s | 24; ออกวงก่อนตก |
| Side charge | 0.75s เอียงกระดอง | line 240, 0.35s | 0.90s | 18; ล่อเข้าหินให้ชน |
| Venom puddle | 1.00s ถุงพอง | circle radius 90, อยู่ 4s | 1.20s | 4 ต่อ pulse ทุก 1s; ไม่ยืนในบ่อ |

Venom puddle ใช้ pulse IDs แยกและยังเคารพ player invulnerability เมื่อ shell ยังไม่แตก body damage บริเวณด้านหน้าลด ×0.8 แต่ part damage ที่ shell ไม่ลด เพื่อให้ทำลายเกราะได้ เมื่อ shell แตกเอาการลดนี้ออก เมื่อ poison_sac แตกไม่สร้างบ่อใหม่ บ่อเก่าหมดตามเวลา

### 8.3 กิ้งก่าปีกลม — ฝึกหลบเส้นทางและใช้หน้าต่างลงพื้น

ลักษณะ: ลำตัวยาว ปีกเป็นเยื่อพับ หัวมีเขาทู่ บินต่ำหรือร่อน ไม่ต้องทำระบบความสูง 3D

| ท่า | Telegraph | Attack | Recovery | Damage / counter |
|---|---:|---:|---:|---|
| Glide pass | 0.90s กางปีก มีเงาเส้นทาง | line 300, 0.45s | 1.20s ลงพื้น | 20; หลบข้างแล้วเข้าปีก |
| Horn ram | 0.70s ก้มเขา | dash 200, 0.30s | 1.00s | 22; หลบหรือล่อชนหิน |
| Wind ring | 1.00s หมุนปีก | annulus inner 70 / outer 180, 0.25s | 1.10s | 14 + knockback 60; เข้าใกล้หรือออกนอกวง |

ระหว่าง glide มี body multiplier ×0.8 แต่โจมตีถูกได้ตาม geometry ไม่ทำ invincible flight เมื่อ wing แตก glide ระยะลดเหลือ 150 และ recovery เพิ่มเป็น 1.70s เมื่อ horn แตก horn ram damage เหลือ 16

### 8.4 AI selection

ใช้ finite state machine และ seeded weighted selection จาก eligible moves ไม่ต้องใช้ generative AI ในเกม ระยะ/สถานะส่วนที่แตกเป็นเงื่อนไขเลือกท่า ห้ามใช้ท่าเดิมเกิน 2 ครั้งติด หากมีท่าอื่นที่ eligible

ช่วงระหว่างท่า approach/rest 0.4–0.8s ไม่มี enraged phase ใน MVP เมื่อ HP ต่ำยังใช้กติกา telegraph เดิม ความยากเพิ่มจากผู้เล่นต้องจัดพื้นที่ ไม่ใช่ลดสัญญาณจนอ่านไม่ได้

Stagger: เมื่ออวัยวะแตกหยุดสัตว์ 1.5s หนึ่งครั้งต่อ part การสะสม stagger เพิ่มเติมอยู่ในหัวข้อโมดูล horn หาก stagger ซ้ำระหว่าง stagger ให้ไม่เพิ่มเวลา

## 9. อาวุธมีชีวิตและโมดูล 6 แบบ

ช่องหลัก: เปลี่ยน skill button และ visual accent ของอาวุธ

ช่องเสริม: ให้ passive หนึ่งอย่าง ห้ามติด moduleId เดียวกันทั้งสองช่อง แต่เว้นว่างได้ โมดูลไม่ถูกใช้หมดเมื่อสลับหรือเปลี่ยนช่อง

ระดับ II เพิ่มผลตามตารางเท่านั้น ไม่เพิ่มปุ่มใหม่ คูลดาวน์และ stamina cost คงเดิม

| โมดูล / material | Skill ระดับ I → II | Cost / cooldown | Passive เมื่อใส่ช่องเสริม I → II |
|---|---|---|---|
| fang / fang | ตัดเลือด: hit 15→16 และ bleed 3→3.3 ต่อวินาที 4s | 20 stamina / 6s | normal damage multiplier 1.08→1.10 |
| ember / heat_bladder | ถุงไฟ: วางไฟ radius 85, tick 6→6.6 ต่อวินาที 3s | 30 / 10s | skill cooldown multiplier 0.94→0.92 |
| shell / shell_scale | เกราะสวน: guard 0.80s ลด hit แรก 70%→77%, ถ้ารับ hit สวน 20→22 | 25 / 9s | damage ที่รับ multiplier 0.92→0.90 |
| venom / venom_sac | พ่นพิษ: cone range 150, initial 5, poison 4→4.4 ต่อวินาที 6s | 30 / 10s | stamina cost multiplier 0.92→0.90 เฉพาะ skill |
| wing / sail_wing | พุ่งลม: dash 210→230 ใน 0.35s, hit 12, ไม่มี i-frame | 25 / 8s | move speed multiplier 1.08→1.10 |
| horn / blunt_horn | กระแทกเขา: windup 0.45s, hit 20→22, part ×2, stagger 30→33 | 30 / 9s | part damage multiplier 1.15→1.18 |

Stagger meter: ทุก hit ปกติเติม 5, Focus Strike เติม 8, Horn skill ตามตาราง; threshold 100 ทำ stagger 1.2s แล้ว reset; meter ลด 10/วินาทีหลังไม่ถูก hit 3s; ระหว่าง stagger ไม่เติม meter

Guard ต้องหันรับใน front arc 120° ถ้าไม่รับ hit ใน 0.80s ไม่มี counter การกด guard ไม่กัน DOT ที่เกิดในพื้น และไม่กัน hit จากด้านหลัง

ไฟวางตำแหน่งข้างหน้าผู้เล่น 100 units ไม่ให้แตะจอแล้ววางได้ทั่วสนาม ไฟซ้ำใช้ instance ล่าสุด ไฟทำ damage pulse ที่ elapsed 1/2/3s เฉพาะสัตว์ที่อยู่ใน zone ในจังหวะนั้น ไม่มี burn ติดตัวหลังออกจาก zone Poison และ bleed pulse ทุก 1s จนครบ duration และใช้ซ้ำ refresh timer ไม่คูณ stack

Skill ที่มี direct hit ใช้ shape ของอาวุธพื้นฐานยกเว้น venom cone/ember zone และ wing ใช้ capsule ตามเส้น dash ห้าม skill เพิ่มระยะเพียงเพราะ selected part อยู่ไกล Shell counter ใช้ shape ของอาวุธเมื่อจบ guard สำเร็จ หากสัตว์อยู่นอกระยะ counter พลาดได้

Damage ที่ผู้เล่นรับ = round(monsterBaseDamage × shellPassiveMultiplier × guardMultiplier); guardMultiplier ใช้ 0.30 หรือ 0.23 เฉพาะ hit แรกที่ guard ถูกทิศ ค่าอื่น 1.0 และขั้นต่ำ 1 เมื่อมี hit ที่ควรทำ damage

Cooldown เริ่มเมื่อ skill เข้าสู่ active state ถ้าไม่มี stamina ไม่เริ่ม action และไม่ติด cooldown การลด cost ใช้ round และขั้นต่ำ 1; cooldown แสดงทศนิยม 1 ตำแหน่งแต่คำนวณ float

ไม่เรียกจำนวน combination ว่าเป็นจำนวน build ที่สนุกทั้งหมด ต้องทดสอบว่ามีทางเลือกต่างกันจริง เช่น ดาบ+shell เล่นสวน, หอก+horn เน้นส่วน, ดาบ+venom เน้นเดินจัดพื้นที่

## 10. การทำลายอวัยวะ

Part HP แยกจาก body HP ไม่เพิ่ม body HP ของสัตว์ เมื่อโจมตี part ทำ body damage และ part damage ตามหัวข้อ 7 ไม่หัก body damage ซ้ำ

เมื่อ part HP เป็นศูนย์:

1. ทำ break event ครั้งเดียว บันทึก brokenPartIds
2. แสดงเสียง/เอฟเฟกต์/ไอคอนแตก ไม่จำเป็นต้องมีภาพเลือด
3. เปลี่ยน AI/ค่าสัตว์ตามหัวข้อ 8 ทันที
4. บันทึก bonus material 1 หน่วยของ part นั้นใน hunt summary ยังไม่เข้า inventory จน mission success
5. เพิ่มข้อมูลในสมุดหลัง settlement สำเร็จ

อวัยวะแตกแล้วไม่รับ part damage ไม่ให้ reward ซ้ำ แต่ยัง hit body ได้ เมื่อ body damage ที่ทำให้ตายทำ part HP เป็นศูนย์พร้อมกัน ให้ resolve part break ก่อน death เพื่อไม่เสียโบนัสอย่างไม่ยุติธรรม

เลือกใช้ภาพแตกแบบรอยร้าว เยื่อขาด หรือเอฟเฟกต์แสง ไม่ต้องตัดอวัยวะหลุดและไม่ต้อง gore

## 11. ภารกิจ การจับ และ settlement

### 11.1 ลำดับปลดล็อก

- เริ่ม: hunt_gecko
- ชนะกิ้งก่าครั้งแรก: hunt_crab, capture_gecko, branch_spear
- ชนะปูครั้งแรก: hunt_sail, capture_crab
- ชนะกิ้งก่าปีกครั้งแรก: capture_sail

ใบ hunt ต้องลด HP เป็นศูนย์ ใบ capture ต้องจับสำเร็จ เลือก objective ก่อนออกล่า ห้ามเปลี่ยนกลางรอบ

### 11.2 การจับ

ทุกครั้งที่เข้าใบ capture มี capture trap 1 charge โดยไม่ใช้ inventory เงื่อนไข: HP ≤25% และสัตว์อยู่ใน recovery/stagger ตั้งกับดักวง radius 90 ข้างหน้าตัวละคร 70 units ใช้เวลา 0.60s ขัดจังหวะได้

สัตว์เข้า trap ตอนเงื่อนไขครบ → restrained 2s → captured ตั้งแต่ restrained เริ่ม ผู้เล่นและ DOT หยุดทำ damage ต่อสัตว์ตัวนั้น เพื่อป้องกันผลลัพธ์แข่งขันกัน

กับดักอยู่ 15s; หากสัตว์เข้าตอน HP >25% ไม่ทำงานและไม่หาย ให้ retry การล่อได้ภายในเวลานั้น Charge ถูกใช้เมื่อตั้งสำเร็จ จับสัตว์ HP=0 ไม่ได้

แสดง “พร้อมจับ” เมื่อ HP เข้าเกณฑ์ ใช้ทั้งไอคอนและข้อความ ไม่เปิดตัวเลข HP จริงโดยค่า default

ใบ capture หากฆ่าตายถือว่า objective failed ไม่ให้ material/research รอบนั้น แต่ให้ retry ได้ทันทีและแสดงเหตุผล “เป้าหมายต้องจับเป็น” ไม่แสดงชัยชนะปลอม

### 11.3 รางวัลที่กำหนดแน่นอน

ก่อนล่าเลือก targetMaterialId หนึ่งชนิดจากสองชนิดของสัตว์ที่เลือก ภารกิจสำเร็จได้:

- 2 หน่วยของ target material ที่เลือก
- +1 หน่วยวัสดุของแต่ละ part ที่ทำลายสำเร็จ
- Research 1 แต้ม; ถ้า capture success ได้ Research รวม 2 แต้ม
- First-clear unlocks ตามลำดับ ไม่จ่ายวัสดุพิเศษแอบแฝง

ไม่มี random material drop ใน MVP ทำให้ผู้เล่นรู้จำนวนรอบที่เหลือ ทุก part โบนัสจ่ายครั้งเดียวต่อรอบ ไม่มีโบนัสจากการกด RESULTS ซ้ำ

Research ใช้เป็นความคืบหน้าในสมุดและตัวเลขสถิติเท่านั้น ไม่ใช้เป็นค่า craft ใน MVP จึงไม่เป็นสกุลเงินที่หาทางใช้ไม่ได้

Failed/abandoned ไม่ได้รางวัล แต่ไม่ลบวัสดุหรือโมดูลเดิม ไม่มีค่ารักษาหรือค่าซ่อม

### 11.4 หน้าผลลัพธ์

แสดง objective, เวลา, วัสดุหลัก, part bonuses, สิ่งปลดล็อก และความคืบหน้าสูตรที่ pin ไว้ แยก “เสร็จแล้ว” และ “ยังไม่ผ่าน” ด้วยข้อความ

ปุ่มหลัก: “ล่าอีกครั้ง” ใช้ mission/target/loadout เดิม; ปุ่มรอง: “กลับฐาน” Failed เพิ่มปุ่ม “ลองใหม่” โดยไม่บังคับอ่านรายละเอียดทั้งหมด

## 12. Crafting และเศรษฐกิจ

ไม่มีทอง ไม่มี loot rarity และไม่มีไอเท็มสุ่มค่าใน MVP Inventory มี material counts, crafted modules และ module tiers เท่านั้น

| การกระทำ | ต้นทุน | ผล |
|---|---:|---|
| สร้างโมดูลระดับ I | วัสดุของโมดูล 4 หน่วย | เพิ่ม owned module tier=1 |
| อัปเกรดเป็นระดับ II | วัสดุเดียวกัน 6 หน่วย | เปลี่ยน tier=2 ตามตาราง |
| เปลี่ยนช่อง/สลับอาวุธ | ฟรี | ไม่มีการทำลายโมดูล |
| ยาฟื้น/กับดัก/คบเพลิงต่อรอบ | ฟรี | reset ตามจำนวนของ mission |

ไม่มี downgrade/sell/dismantle ใน MVP ปุ่ม craft อธิบายเหตุผลเมื่อไม่พอ และแสดง “มี 2/4” โมดูลเป็นของถาวรหนึ่งชิ้น ไม่อนุญาตสร้าง ID เดิมซ้ำเพื่อหลีกเลี่ยงการสิ้นเปลือง

การหักวัสดุและสร้าง/upgrade เป็น transaction เดียว ตรวจว่า count ไม่ติดลบและ state ที่ save ถูกต้องก่อนแจ้งสำเร็จ Double tap ไม่ craft ซ้ำ

Pin recipe ได้ 1 รายการ หน้าภารกิจเสนอสัตว์/วัสดุที่ตรงกับเป้าหมาย แต่ผู้เล่นเลือกอย่างอื่นได้เสมอ

จากรางวัลพื้นฐาน 2 ต่อครั้ง โมดูลแรกใช้สูงสุด 2 รอบสำเร็จโดยไม่ต้องพึ่งโบนัส; upgrade ใช้เพิ่มสูงสุด 3 รอบ ค่านี้เป็น hypothesis ต้องดูความรู้สึกจริง อย่าเพิ่มต้นทุนเพื่อยืดเวลาโดยไม่มีเนื้อหาใหม่

## 13. Arena และสิ่งแวดล้อม

ขนาดเริ่มต้น 1600×1000 logical units กล้องติดตามผู้เล่นแบบ smooth จำกัดขอบโลก และพยายามให้มอนสเตอร์กับผู้เล่นอยู่ในจอพร้อมกัน ใช้ modest dynamic zoom ได้แต่ไม่เปลี่ยนขนาดจนอ่านยาก

Layout เดียว ประกอบด้วยพื้นโล่งกลาง ขอบ arena ที่ชนได้ ก้อนหิน 2 ก้อน และเถาวัลย์หนึ่งจุด สัตว์ไม่ spawn บนผู้เล่นหรือ obstacle

หิน: collision ทั้งผู้เล่นและมอนสเตอร์ ท่า charge ชนแล้วยุติ dash เข้าสู่ recovery เพิ่ม 0.50s ไม่ทำ damage ฟรี ไม่ให้รางวัลอวัยวะฟรี

เถาวัลย์: trigger zone radius 90 อยู่กับที่ ผู้เล่นกด interaction ขณะสัตว์อยู่บนจุดนั้นทำ root 1.5s ใช้ได้ครั้งเดียวต่อรอบ; ไม่เพิ่มเมื่อสัตว์ stagger/root อยู่แล้ว ถ้าเผาด้วยคบเพลิง เถาวัลย์หายและเปิดพื้นที่เดินเพิ่ม แต่จะใช้ root ไม่ได้

คบเพลิงเป็น context action บนจุดเถาวัลย์ ไม่เพิ่มปุ่ม combat ถาวรบนมือถือ การตัดสินใจคือเก็บจุดควบคุมสัตว์ไว้หรือเปิดพื้นที่ ไม่ใช่เพิ่มระบบไฟลามทั้งโลก

หาก monster ติด obstacle >2s ให้เดินหาจุดใกล้ที่เข้าถึงผู้เล่นได้; ห้าม teleport โจมตี หากไม่สามารถเดินได้ >5s ให้ reset ไปจุดปลอดภัยที่อยู่ห่างผู้เล่น พร้อมหยุดโจมตีระหว่างนั้นและ log debug

## 14. UX หน้าจอและการควบคุม

### 14.1 ฐาน

ส่วนบน: ชื่อฐานเล็ก + settings

ส่วนกลาง: ภาพฐานและสัตว์ที่เคยจับเป็นไอคอนสะสม

ส่วนล่าง: ปุ่มหลัก “ออกล่า”, ปุ่ม “ประกอบอาวุธ”, “สมุดสัตว์” และ pinned recipe ขนาดเล็ก ไม่เปิดหลาย modal ซ้อนกัน

### 14.2 หน้าภารกิจ/เตรียมตัว

การ์ดสัตว์หนึ่งใบแสดงรูป ชื่อ objective วัสดุสองชนิด และคำใบ้หนึ่งประโยค จากนั้นเลือก target material และ loadout ในหน้าต่อเนื่องสั้น ก่อนกด “เริ่มล่า” ต้องเห็นอาวุธ โมดูลหลัก โมดูลเสริม และรางวัลแน่นอน

### 14.3 HUD ต่อสู้

- บนซ้าย: HP และ stamina
- บนกลาง: ชื่อสัตว์ + health bar โดยไม่มีค่าตัวเลข + part icons
- บนขวา: เวลาและ pause
- ล่างซ้ายมือถือ: virtual joystick
- ล่างขวามือถือ: โจมตี, หลบ, skill, ยาฟื้น
- ปุ่มเล็กเลือกส่วนอยู่ใกล้ skill; ปุ่มจับแสดงเฉพาะ capture mission
- context interaction เถาวัลย์แสดงเฉพาะเมื่อเข้าใกล้; ไม่ทับปุ่มหลัก

ตัวอย่างการจับ: ตอนเล่นใบ capture ปุ่มจับมองเห็นตลอด แต่เมื่อเงื่อนไขไม่ครบมีข้อความสั้นและสถานะ disabled ช่วยให้รู้ว่ายังมีเครื่องมือนี้ โดยไม่ต้องจำเมนูซ่อน

### 14.4 Input mapping

| Action | คอม | มือถือ |
|---|---|---|
| เดิน | WASD / ลูกศร | virtual joystick |
| Normal attack | left click / J | ปุ่มโจมตี กดค้างได้ |
| หลบ | Space / K | ปุ่มหลบ |
| Skill | right click / L | ปุ่ม skill |
| ยาฟื้น | Q | ปุ่มยา |
| เลือกส่วน | Tab / R | ปุ่มเปลี่ยนเป้า |
| ตั้งกับดักจับ | C | ปุ่มจับเฉพาะใบ capture |
| Context / torch | E | ปุ่มใกล้จุด interaction |
| Pause | Escape / P | pause |

ปิด browser context menu เฉพาะพื้นที่เกมที่ใช้ right-click ไม่ปิดทั้งเอกสาร Tab ใน HUNT ใช้เลือกส่วน; ในเมนูต้องยัง tab ผ่านปุ่มได้ตามปกติ Touch ใช้ Pointer Events/เทียบเท่าที่รองรับ multi-touch, track pointerId แยกจอยกับปุ่ม และ reset input เมื่อ pointercancel/blur

โจมตีมือถือต้องไม่ต้องลากเล็งจอพร้อมกับเดินและกดหลายปุ่ม ลดความซับซ้อนด้วย soft-lock ตามหัวข้อ 7

### 14.5 ความอ่านง่ายและความสะดวก

ปุ่ม touch มีพื้นที่อย่างน้อย 48 CSS px เว้นระหว่างกัน รองรับ safe-area และ scaling จอเล็ก Font ไทยต้องอ่านได้ มี text fallback เมื่อ font ภายนอกไม่โหลด

มี screen shake slider, ปิด flash, แยก music/SFX, และลดเอฟเฟกต์ ไม่ใช้เสียงเป็นสัญญาณเดียว ไม่ใช้สีแดง/เขียวอย่างเดียวแยกอันตรายกับรางวัล

เมนูใช้ semantic HTML ได้แม้สนามเป็น canvas มี focus indicator และ labels ส่วน canvas combat ยังต้องบันทึกข้อจำกัดการเข้าถึงอย่างตรงไปตรงมา

## 15. ภาพ เสียง และ asset brief

Art direction: stylized 2D สีป่าหม่นตัดกับอวัยวะเรืองแสง ภาพอบอุ่นแต่ท่าต่อสู้ชัด มอนสเตอร์ดูเป็นสัตว์ที่มีหน้าที่ของอวัยวะ ไม่ใช้รายละเอียดแน่นจนอ่านยากบนมือถือ

ผู้เล่นควรสูงประมาณ 48–64 logical units สัตว์ราว 140–220 units; ผู้เล่นและสัตว์ต้องเด่นกว่าพื้น ไม่มี UI คล้ายเกมต้นฉบับที่อ้างแรงบันดาลใจ

| Asset group | ชุดขั้นต่ำ | แนวทางทำงาน |
|---|---|---|
| ผู้เล่น | idle, walk, attack, dodge, hit, down | placeholder shape ใช้ได้ใน M0–M1 |
| มอนสเตอร์ 3 ตัว | telegraph/attack/recovery ของทุกท่า + break/stagger | อ่านได้ก่อนเพิ่ม frame สวย |
| อาวุธ | 2 silhouettes + 6 module accents | ใช้ layer overlay ไม่วาดทุก combination |
| วัตถุดิบ | 6 ไอคอน | แยกได้ด้วย shape และ label |
| Environment | ground, border, rock, vine, camp props | ชุดเดียวให้ครบก่อน |
| VFX | hit, break, skill 6 แบบ, ready capture | มีตัวเลือกลดเอฟเฟกต์ |
| SFX | attack, hit, dodge, telegraph 3 แบบ, break, craft, capture | เสียงไม่ดังเท่ากันทั้งหมด |
| Music | base loop และ hunt loop อย่างละ 1 | เล่นได้แม้ mute |

ทุก asset ต้องระบุแหล่ง/สิทธิ์ใน ASSET_LICENSES.md ถ้าใช้ AI สร้างให้บันทึกว่าเป็น generated placeholder และเก็บ prompt/source version ตรวจ sprite alignment ก่อนใช้งาน ห้าม hotlink asset ที่จำเป็นต่อการเล่น

ไม่ต้องสร้างภาพสวยครบก่อน combat playable ใช้ภาพเรียบที่ตรง hitbox เพื่อทดสอบก่อน

## 16. สมุดสัตว์และการเล่นซ้ำ

สมุดแต่ละสัตว์มี: silhouette/name, ประเภทวัสดุ, ท่าที่เคยเห็น, ส่วนที่เคยทำลาย, จำนวน hunt/capture, best time แยก objective และคำใบ้ที่ผู้เล่นค้นพบ

การ unlock observation:

- เห็นท่า telegraph หนึ่งครั้ง → เพิ่มชื่อท่าและคำบรรยายสั้นหลังรอบจบ แม้ failed
- ทำ part break → เพิ่มข้อมูลว่าพฤติกรรมเปลี่ยนอย่างไรหลัง settlement
- ชนะครั้งแรก → เปิดคำใบ้เตรียมตัวและวัสดุ
- จับครั้งแรก → เพิ่ม icon ที่ฐาน

Observation ที่ไม่ใช่รางวัล save แยกได้เมื่อจบรอบ failed แต่ห้ามเผลอจ่ายวัสดุ Research หรือ unlock victory ไปด้วย

แรงจูงใจกลับมาเล่น:

1. เป้าหมายใกล้: สร้างโมดูลที่ pin ไว้ใน 1–2 รอบ
2. เป้าหมายการทดลอง: ใช้ weapon/module ใหม่จัดการสัตว์เดิม
3. เป้าหมายความชำนาญ: ทำลายส่วน จับสำเร็จ หรือทำเวลาของตัวเอง
4. เป้าหมายสะสม: สมุดครบและภาพสัตว์ที่ฐาน

ไม่ใช้ login streak, energy timer, timed scarcity หรือข้อความทำให้รู้สึกผิดเมื่อไม่เล่น ไม่มีระบบ notification ใน MVP

กรอบความคาดหวัง: MVP มีเนื้อหาจำกัดและจะหมดความใหม่ได้ เป้าหมายคือพิสูจน์ว่าผู้เล่นอยากล่าซ้ำ 3–5 รอบก่อนขยาย ไม่สัญญาว่าเกมเล็กจะเล่นไม่รู้จบจากมอนสเตอร์เพียง 3 ตัว

## 17. Progression หลัง MVP

### 17.1 รุ่น 0.2 — ความหลากหลายของการล่า

เพิ่มเมื่อ core ผ่าน playtest:

- เงื่อนไขฝน/ลม 2 แบบ ที่แสดงก่อนออกล่าและเปลี่ยน tactic
- arena layout เพิ่ม 1 แบบ
- mission modifier ที่อ่านออก เช่น “หลีกเลี่ยงทำลายปีก” หรือ “ล่อชนหินหนึ่งครั้ง”
- bestiary เพิ่มข้อสังเกตและ challenge ของผู้เล่นเอง

ตัวอย่างฝนสำหรับทดสอบภายหลัง: fire zone duration ลดจาก 3s เป็น 2s ขณะเดียวกันสัตว์ไฟมี fire breath range ลดลง ทำให้มีทั้งข้อแลกเปลี่ยนและโอกาส ไม่ทำให้ build ไฟเสียเปรียบอย่างเดียว

### 17.2 รุ่น 0.3 — เกาะเริ่มมีชีวิต

เพิ่มสัตว์รองหนึ่งชนิดและ scripted interaction ในพื้นที่ เช่น แย่งอาหาร/ล่อบอสย้ายตำแหน่ง ไม่เริ่มจาก simulation ecosystem ถาวรทั้งเกาะ ไม่มีระบบที่สัตว์สูญพันธุ์หรือผู้เล่นติด progression เพราะล่าผิด

### 17.3 รุ่น 0.4 — ฐานและเนื้อหา

เพิ่มมอนสเตอร์ 2 ชนิด โมดูล 2 แบบ และของตกแต่งฐานที่สะท้อนการสำรวจ อาจทำพื้นที่สัตว์ที่จับได้ โดยไม่เพิ่ม maintenance รายวันทันที

### 17.4 สิ่งที่ต้องพิสูจน์ก่อนงานใหญ่

Multiplayer ต้องพิสูจน์ single-player fun และประเมิน networking/save/security แยก Native mobile ต้องทดลอง touch จริงและความร้อน/แบตเตอรี่ก่อน Cloud save ต้องมี migration และ conflict rules ก่อน

## 18. Technical brief สำหรับผู้ดำเนินการ

เอกสารนี้กำหนด behavior และ acceptance เป็นหลัก ไม่มี dependency versions ที่ตรวจแล้ว Claude ต้องตรวจ official documentation ณ เวลาลงมือก่อนเลือก version/API และล็อก versions ที่ติดตั้งจริงใน lockfile

Default implementation สำหรับเว็บต้นแบบ: TypeScript + Vite + Phaser สำหรับสนาม 2D และ HTML/CSS overlay สำหรับเมนู หากมีเหตุผลที่จะใช้ engine อื่น ให้รายงานข้อแลกเปลี่ยนก่อนเปลี่ยน ห้ามใช้ full-stack framework/backend โดยไม่มีความจำเป็นต่อ scope

เอกสารทางการที่ตรวจประกอบทิศทางนี้ ณ วันที่จัดทำ: [Phaser documentation](https://docs.phaser.io/) อธิบายการรองรับเกมผ่าน desktop/mobile web browsers; [Vite production build](https://vite.dev/guide/build) และ [Vite getting started](https://vite.dev/guide/) ให้แนวทางเริ่มโครงการและสร้าง build คำแนะนำเลือก stack เป็นการตัดสินใจของโครงการ ไม่ใช่คำรับรอง performance จากเอกสารเหล่านี้ ต้องตรวจ API/version อีกครั้งตอนพัฒนา

เกมเป็น client-only ไม่มี API key หรือ generative AI runtime ไม่มีข้อมูลส่วนตัวที่ต้องเก็บ เกมต้องเริ่มและเล่นได้หลัง assets โหลดโดยไม่เรียกบริการภายนอกเพิ่มเติม

เสนอการแยกส่วน:

```text
src/
  data/          # monsters, weapons, modules, missions, recipes
  domain/        # combat math, rewards, crafting, save validation
  engine/        # scenes, entities, hitboxes, camera, input
  ui/            # base, loadout, results, settings
  persistence/   # schema, migrations, transactions, export/import
  diagnostics/   # debug overlay, local event log
assets/
tests/
docs/
```

กติกา implementation:

- Data-driven content: ไม่เขียน recipe/drops/telegraph กระจัดกระจายใน UI
- Domain logic ไม่พึ่ง rendering เพื่อทดสอบ reward/craft/collision rules ได้
- Simulation ใช้ fixed timestep 60Hz หรือ fixed-step equivalent พร้อม clamp delta และจำกัด catch-up; ห้ามโลกเดินเร็วขึ้นเมื่อ FPS เปลี่ยน
- เวลา pause/background ไม่คิดเป็น huntElapsed หรือ DOT/cooldown
- รีเซ็ต pointer/keyboard state เมื่อออก scene และต้อง teardown listeners/timers
- Seeded RNG ต่อ hunt สำหรับเลือก AI/debug replay แต่ไม่อ้าง deterministic replay เต็มรูปแบบถ้ายังไม่ได้ทำ
- Render resolution ลดตาม device pixel ratio ได้ ตั้ง cap เริ่มต้น 2 แล้ววัดจริง
- Bounded particle pools และ projectile cleanup ไม่มี list ที่โตไม่จบ
- Schema/content version แยกจาก release version
- ไม่ minify source ที่ส่งให้เจ้าของโครงการ และต้องส่ง lockfile/build steps

Offline install/PWA ไม่ใช่ MVP requirement หากเพิ่มภายหลังต้องมี service worker versioning และการทดสอบ cache update แยก อย่าเรียกเกมว่า offline-ready เพียงเพราะไม่มี backend

## 19. Data contract

Stable IDs ต้องใช้ตามเอกสารหรือมี migration เมื่อเปลี่ยน

Material IDs: fang, heat_bladder, shell_scale, venom_sac, sail_wing, blunt_horn

Module IDs: fang, ember, shell, venom, wing, horn

Weapon IDs: fang_cleaver, branch_spear

Monster IDs: ember_gecko, mire_crab, sail_lizard

ตัวอย่าง shape ที่ Claude ต้องนำไปสร้าง typed schema ไม่ใช่ copy เป็น engine code ทั้งหมด:

```json
{
  "schemaVersion": 1,
  "contentVersion": "0.1.0",
  "materials": {
    "fang": 0,
    "heat_bladder": 0,
    "shell_scale": 0,
    "venom_sac": 0,
    "sail_wing": 0,
    "blunt_horn": 0
  },
  "modules": {},
  "loadout": {
    "weaponId": "fang_cleaver",
    "primaryModuleId": null,
    "secondaryModuleId": null
  },
  "unlockedWeaponIds": ["fang_cleaver"],
  "unlockedMissionIds": ["hunt_gecko"],
  "research": 0,
  "bestiary": {},
  "pinnedRecipeId": null,
  "pendingHunt": null,
  "lastSettlementId": null,
  "settings": {
    "musicVolume": 0.5,
    "sfxVolume": 0.7,
    "screenShake": 0.3,
    "reducedEffects": false
  }
}
```

Runtime HuntState ต้องแยกจาก persistent SaveData: huntId, seed, missionId, objective, targetMaterialId, elapsed, player state, monster state, brokenPartIds, observations, status

Monster definition: id, hp, bodyCollision, parts[], moves[], moveConditions, materialOptions[], breakEffects

Module definition: id, materialId, tierEffects, skill, passive, recipeCosts

Mission definition: id, monsterId, objective, unlockCondition, allowedTargetMaterials

Reward summary: settlementId, huntId, objectiveOutcome, baseMaterials, partBonuses, research, firstClearUnlocks, elapsed

Validation: counts เป็น finite non-negative integers; known IDs เท่านั้น; tier เป็น 1/2; loadout module ต้อง owned และไม่ซ้ำ; weapon/mission ต้อง unlocked; numeric settings อยู่ในขอบเขต หาก import พบ unknown content ให้ปฏิเสธพร้อมเหตุผลหรือ migration ที่ประกาศ ห้ามเงียบแล้วทำของหาย

## 20. Save safety และ export/import

ใช้ versioned save envelope มี savedAt, schemaVersion, payload และ checksum สำหรับตรวจข้อมูลผิดพลาดทั่วไป checksum ไม่ใช่ระบบป้องกันโกง ผู้เล่น local แก้ save ได้ ไม่ต้องทำ anti-cheat ใน MVP

ข้อเสนอ persistence: localStorage สำหรับข้อมูลขนาดเล็ก แยก keys primary/backup และเขียน envelope แต่ละชุดครั้งเดียว ไม่ split material counts เป็นหลาย key ที่ครึ่งหนึ่งอาจเขียนไม่สำเร็จ

ขั้นตอนเขียน: validate candidate → เก็บ valid primary เดิมเป็น backup → เขียน primary ใหม่ → read/parse/validate เพื่อยืนยัน → แจ้ง saved หาก fail ต้องคืน runtime state ที่ยังไม่ commit หรือแสดง pending retry อย่างชัดเจน

Rewards ใช้ pendingHunt และ lastSettlementId สำหรับ idempotency: settlement เดิมใช้ซ้ำแล้วไม่มีรางวัลเพิ่ม หลังเขียน primary สำเร็จให้ข้อมูล pending/settled อยู่ใน envelope เดียว เพื่อไม่เกิด torn update เมื่อ reload

ถ้า primary เสีย: ลอง backup ที่ valid แจ้งผู้เล่นว่ากู้จาก backup แล้ว และไม่เขียนทับไฟล์เสียจน export/recovery choice เสร็จ หากทั้งสองเสียแสดงปุ่ม export raw data/เริ่มใหม่โดยให้ผู้เล่นเลือก ไม่ reset เงียบ ๆ

Export เป็น JSON พร้อม version Import: parse/validate/migrate ใน memory → preview inventory/progression → ยืนยันแทนที่ → backup เดิม → commit ห้าม import แล้ว merge counts อัตโนมัติ

กรณี storage unavailable/private mode/quota: แจ้งว่ารอบนี้ยังไม่บันทึก ให้ export ได้ ไม่มีข้อความ “บันทึกแล้ว” ปลอม

หลายแท็บ: MVP อนุญาต active game writer เพียงแท็บเดียว ตรวจ session lock หรือเทียบ save revision ก่อน commit เมื่อขัดกันให้ pause และแจ้ง reload/export ไม่ใช้ last-write-wins แบบเงียบ

## 21. Performance และ quality targets

เป้าหมาย ไม่ใช่ผลทดสอบแล้ว:

- 60 FPS บนคอมทดสอบ; อย่างน้อย 30 FPS อย่างต่อเนื่องบนมือถือที่ระบุรุ่นจริงใน QA
- หลัง warmup เวลาตอบสนอง input ใน simulation ไม่เกินหนึ่ง tick บวก render; ถ้าวัด end-to-end ไม่ได้ให้รายงานวิธีที่วัดได้จริง
- เปิดฐานได้ภายใน 5s บนเครื่อง/เครือข่ายที่บันทึก ไม่อ้าง universal load time
- initial assets เป้าหมายไม่เกิน 10 MB; แยก lazy load เสียง/ภาพภายหลังได้
- เล่นต่อ 10 รอบไม่มี memory growth ต่อรอบอย่างชัดเจนจาก listener/entity leak
- ไม่เปิด scroll/zoom/page selection จากการใช้ touch combat ปกติ
- ไม่มี console errors ระหว่าง core loop

ขั้นต่ำทดสอบ viewport: 1366×768 คอม, 844×390 landscape touch, 740×360 landscape touch, 390×844 portrait guidance; viewport emulation ไม่แทนมือถือจริง ให้ระบุ simulated vs real

## 22. แผนพัฒนาเป็น milestone

ไม่กำหนดวันเสร็จโดยไม่มีข้อมูลการทำจริง ใช้ acceptance gate ก่อนขยาย และเก็บ checkpoint ทุก milestone

| Milestone / release | งาน | Gate ที่ต้องผ่าน |
|---|---|---|
| M0 / 0.0.1 | โครงโครงการ arena ผู้เล่น input camera pause | เดิน/หลบทั้งคอมและ touch ไม่ค้างหลัง blur |
| M1 / 0.0.2 | กิ้งก่าถุงไฟครบ 3 ท่า + hit/part/death/results | ล่าจบ/แพ้ได้ ท่าอ่านได้ break เปลี่ยน AI จริง |
| M2 / 0.0.3 | base/materials/craft/save + fang/ember | ล่า → ได้วัสดุ → craft → ติดตั้ง → ล่าใหม่ → reload ของยังอยู่ |
| M3 / 0.0.4 | หอก ปู ปีก โมดูลที่เหลือ จับ/สมุด | ครบ 3 สัตว์/2 อาวุธ/6 โมดูล และ capture objective ถูกต้อง |
| M4 / 0.1.0 | QA cross-device balance pass UI/audio cleanup | ผ่าน critical tests และมี playtest จริงอย่างน้อยหนึ่งรอบครบ loop |

M1 เป็น prototype combat; M2 เป็น vertical slice; M4 จึงเรียก MVP ได้ ห้ามเรียกรุ่นที่มีแต่หน้าจอเมนูว่า playable MVP

ในรุ่น milestone ที่ content ยังไม่ครบ ให้แสดงเฉพาะอาวุธ/โมดูล/ภารกิจที่เล่นได้จริง ห้ามเปิดสูตร shell ก่อนมีปูเป็นแหล่งวัสดุ ห้ามเปิดหอกที่ยังไม่ได้ทำ เมื่ออัปเดตเข้า M3 ให้คำนวณ unlock ที่ผู้เล่นมีสิทธิ์จาก first-clear records เดิม โดยไม่จ่ายรางวัล first-clear ซ้ำและไม่ต้องให้เริ่ม save ใหม่

หลัง M2 ให้เจ้าของโครงการลองเล่นก่อนลงทุนวาด asset เต็ม เพื่อทดสอบว่าการอ่านท่าและสร้างโมดูลสร้างความอยากเล่นซ้ำจริงหรือไม่

## 23. QA และ acceptance tests

### 23.1 Automated domain tests ที่ควรมี

1. Recipe หัก 4/6 หน่วยถูกต้อง counts ไม่ติดลบ และ owned module ไม่ซ้ำ
2. Upgrade tier I→II เท่านั้น ไม่อัปเกรดซ้ำ tier II
3. Reward success ได้ base 2 ของ target ที่เลือก และ part bonus ตาม broken IDs ไม่ซ้ำ
4. Failed/abandoned/capture mission ที่ฆ่าตายได้ material/research=0
5. settlementId เดิมผ่านซ้ำหรือ reload ไม่เพิ่มรางวัล
6. Hit หนึ่ง attackId ทำ body/part damage ตามกติกาไม่ซ้ำเมื่อ overlap หลาย frame
7. Part break กับ death tick เดียวกันได้โบนัส break หนึ่งครั้ง
8. DOT refresh ไม่ stack และไม่ทำ part damage
9. Loadout validation ไม่รับ module ที่ไม่ owned หรือซ้ำสองช่อง
10. Save round-trip/import corrupt/unknown IDs/future schema ไม่ทำข้อมูลเดิมหาย
11. Unlock ลำดับถูกต้อง capture success ไม่ปลดล็อก hunt victory ผิดชนิด
12. Reward/craft save failure ไม่แสดง success หรือทำ retry จ่ายซ้ำ

### 23.2 Manual integration tests

| ID | ขั้นตอน | ผ่านเมื่อ |
|---|---|---|
| Q01 | เปิดใหม่ เล่นครั้งแรกจนได้โมดูล | ไม่มีหน้าตันและรู้เป้าหมายถัดไป |
| Q02 | ทำถุงไฟแตกก่อนสัตว์ตาย | fire breath ไม่ถูกเลือกอีก |
| Q03 | ทำ shell/poison/wing/horn แตก | ผลในหัวข้อ 8 เกิดจริงทุกส่วน |
| Q04 | เดิน+โจมตี/หลบ touch พร้อมกัน | จอยไม่ขโมย pointer ของปุ่ม |
| Q05 | alt-tab / background / pointercancel | เกม pause และไม่เดินหรือยิงค้างเมื่อกลับ |
| Q06 | ชนะแล้วกดผลลัพธ์ซ้ำ/reload | วัสดุเพิ่มครั้งเดียว |
| Q07 | craft double tap แล้ว reload | หักวัสดุครั้งเดียว module อยู่ครบ |
| Q08 | HP เหลือ ≤25% ล่อเข้า trap | จับได้เมื่อเงื่อนไขครบ ใช้ charge ถูกต้อง |
| Q09 | trap ตอน HP สูง/โดนขัดตอนตั้ง | ไม่จับก่อนเกณฑ์ ไม่เสีย charge เมื่อยังไม่ตั้งสำเร็จ |
| Q10 | ฆ่าในใบ capture / timeout / player down | failed ชัดเจน ไม่มีรางวัล |
| Q11 | สลับแต่ละโมดูลหลักกับสองอาวุธ | ทักษะมีผลจริงและ UI แสดง cost/cooldown ตรง |
| Q12 | โหลด JSON ผิดหรือ storage unavailable | ไม่ reset เงียบ มี recovery/export ทางออก |
| Q13 | เปิด 2 แท็บและทำรายการพร้อมกัน | ไม่เขียน inventory ทับกันเงียบ ๆ |
| Q14 | เล่น 10 รอบแล้วตรวจ scene/entities/listeners | ไม่มี growth ต่อรอบจาก object ไม่ถูกเก็บ |
| Q15 | 4 viewports และมือถือจริงถ้ามี | HUD ไม่ทับปุ่ม เป้าหมายอ่านได้ และรายงานสิ่งที่ยังไม่ได้ทดสอบ |
| Q16 | ใช้หิน/เถาวัลย์/คบเพลิง | charge ถูกขวาง root ใช้ครั้งเดียว เผาแล้ว root ใช้ไม่ได้ |
| Q17 | pause ระหว่าง DOT/cooldown/capture restraint | ทุก timer หยุดและกลับมาเดินต่ออย่างถูกต้อง |
| Q18 | ตายกับ captured ใกล้ tick เดียวกัน | terminal result เดียว ไม่มีรางวัลซ้ำ |

QA ต้องเขียน PASS/FAIL/NOT TESTED พร้อมวิธีและหลักฐาน ห้ามใช้ “ผ่านทั้งหมด” ถ้าไม่มี environment รองรับ touch จริง

### 23.3 Playtest เพื่อประเมินความสนุก

ใช้ผู้เล่นกลุ่มเล็ก 3–5 คนเมื่อพร้อม ขนาดนี้ให้ feedback เชิงทิศทาง ไม่ใช่ผลสถิติประชากร ถ้ายังมีแค่เจ้าของโครงการ ให้รายงานว่า owner playtest

ถามหลังเล่น:

- เข้าใจไหมว่าสัตว์กำลังจะทำอะไร ก่อนโดน hit?
- รู้ไหมว่าต้องทำอะไรเพื่อได้โมดูลที่อยากใช้?
- โมดูลใหม่ทำให้เปลี่ยนวิธีเล่นจริงหรือรู้สึกแค่แรงขึ้น?
- กดเล่นรอบถัดไปเองหรือเพราะถูกขอให้เล่น?
- จังหวะไหนน่าเบื่อ/ไม่ยุติธรรม/กดไม่ทันเพราะปุ่ม?

เก็บ local events: hunt_started, attack_received, part_broken, hunt_completed, hunt_failed, recipe_pinned, module_crafted, module_equipped, retry_selected; ไม่ส่งออก server อัตโนมัติและไม่เก็บชื่อส่วนตัว

เป้าหมายตัดสินรอบแรก: ผู้เล่นอธิบายวิธีตอบโต้ท่าได้หลัง 1–2 รอบ สร้างโมดูลแรกสำเร็จ และมีอย่างน้อยบางคนอยากทดลองรอบถัดไปเอง หาก core ไม่ดี ให้แก้ telegraph/input/rewards ก่อนเพิ่มชนิดสัตว์

## 24. สิ่งที่ Claude ต้องส่งทุกครั้ง

แต่ละ milestone ต้องส่ง:

1. Source ครบและ build ที่ตรง source version รวม package manifest/lockfile
2. README_RUN.md: install/dev/build/test ตาม environment ที่ตรวจแล้ว
3. CHANGELOG.md: สิ่งที่ทำในรอบนี้และ user-visible behavior
4. CHECKPOINT.md: milestone, version, สิ่งเสร็จ/ค้าง, known issues, next exact task
5. QA_REPORT.md: tests พร้อม PASS/FAIL/NOT TESTED และ environment
6. DESIGN_DEVIATIONS.md: ต่างจาก spec ตรงไหน ทำไม และกระทบ acceptance อะไร; ถ้าไม่มีระบุ none
7. ภาพ/วิดีโอที่แสดง feature จริง พร้อมระบุภาพ placeholder
8. ASSET_LICENSES.md: แหล่งและสิทธิ์ assets ที่เพิ่ม

การตั้งชื่อ archive: WILDFORGE_V0_0_1_M0_SOURCE.zip ไล่ตาม milestone; มี release version เดียวที่สอดคล้อง package/UI/docs อย่าส่งชื่อ FINAL หลายชุด

Checkpoint ต้องเขียนก่อนหยุดจาก limit/context และไม่ทิ้งว่า “ทำต่อ” ลอย ๆ ให้มี exact file/function/task ที่ต้องแตะถัดไป

## 25. คำสั่งเริ่มงานสำหรับส่งให้ Claude

คัดลอกข้อความด้านล่างและแนบไฟล์นี้:

```text
คุณเป็นผู้ดำเนินการพัฒนาเกม WILDFORGE โดยมี ChatGPT เป็นหัวหน้างานออกแบบ
ให้ใช้เอกสาร WILDFORGE_GAME_DESIGN_AND_CLAUDE_BRIEF_TH_V1_0.md เป็นข้อกำหนดหลัก

เป้าหมายคือเกม 2D ล่ามอนสเตอร์รอบสั้นบนคอมและมือถือ ฟาร์มวัสดุและประกอบอาวุธที่เปลี่ยนวิธีเล่น
เริ่ม milestone M0 เท่านั้นในรอบแรก แล้วเดินต่อเมื่อ gate ผ่าน

ก่อนแก้ไฟล์:
1. อ่านเอกสารทั้งหมด สรุป scope และข้อกำหนดสำคัญ
2. ตรวจ workspace ว่ามีโค้ดเดิมหรือไม่ อย่าเขียนทับงานที่มีอยู่โดยไม่ตรวจ
3. เสนอ implementation plan ของ M0 แบบสั้น ระบุ environment/dependencies ที่ตรวจจาก official docs
4. จากนั้นลงมือทำ M0 ได้เลย ไม่ต้องหยุดที่แผนหรือรออนุมัติ routine implementation

M0 ต้องมีโครงโครงการ สนาม ผู้เล่น เดิน หลบ กล้อง คีย์บอร์ด/เมาส์ touch joystick/pointer handling และ pause-on-blur
ใช้ placeholder ที่เห็น hit/collision ชัดก่อน ไม่เพิ่ม backend/multiplayer/open world
แยก domain/data/render/input/persistence ตั้งแต่ต้น และล็อก dependency versions ที่ติดตั้งจริง

ตรวจงานตาม M0 gate และ Q04/Q05/Q15 ที่เกี่ยวข้อง
ห้ามรายงานว่ามือถือจริงผ่าน หากทดสอบเพียง emulation
ส่ง source/build/README/CHANGELOG/CHECKPOINT/QA_REPORT/DESIGN_DEVIATIONS/ASSET_LICENSES ตามหัวข้อ 24
เก็บ checkpoint ก่อนจบทุกครั้ง

หากข้อกำหนดขัดกันให้ระบุจุดขัดและเลือกทางที่ยังรักษา core loop/ข้อมูลผู้เล่น
การเพิ่มฟีเจอร์นอก scope หรือเปลี่ยน game design ให้เสนอใน DESIGN_DEVIATIONS ก่อน ไม่ทำเองเงียบ ๆ
ยังไม่ต้อง publish เว็บไซต์ สมัครบริการ หรือซื้อ asset
```

## 26. คำสั่งรอบถัดไปและการกลับมาตรวจงาน

### 26.1 เมื่อต้องการให้ Claude ทำต่อ

```text
พัฒนา WILDFORGE ต่อจาก checkpoint ล่าสุด ห้ามเริ่มใหม่
อ่าน CHECKPOINT.md, QA_REPORT.md, DESIGN_DEVIATIONS.md และเอกสารออกแบบ V1.0 ก่อน
แก้ blocker ของ milestone ปัจจุบันให้ gate ผ่าน แล้วทำ milestone ถัดไปตามหัวข้อ 22
ถ้ามี feedback จาก ChatGPT ที่แนบมา ให้ใช้เป็น change request ของรอบนี้
ส่ง package/checkpoint/QA และระบุสิ่งที่ยัง NOT TESTED ทุกครั้ง
```

### 26.2 เมื่อต้องการให้ ChatGPT ตรวจ

```text
นี่คือ source และรายงาน WILDFORGE ที่ Claude ส่งมา
ช่วยตรวจเทียบเอกสารออกแบบ V1.0 และ milestone gate
แยก critical bugs, design mismatch, UX problems และงานเสริม
ขอรายการแก้เรียงลำดับ พร้อม acceptance สำหรับส่งให้ Claude
ตรวจจากโค้ด/หลักฐานจริง อย่าใช้คำกล่าวอ้างในรายงานอย่างเดียว
```

แนบ source ZIP, CHECKPOINT, QA_REPORT, DESIGN_DEVIATIONS และภาพ/คลิป หากต้องตรวจ touch feel หรือความสนุกจำเป็นต้องมีผลเล่นจริง โค้ดอย่างเดียวไม่ตอบทุกประเด็น

## 27. ความเสี่ยงและวิธีรับมือ

| ความเสี่ยง | สัญญาณ | แนวทาง |
|---|---|---|
| Scope ใหญ่เกิน | มีเมนูเยอะแต่ล่าจบไม่ได้ | กลับไป M1/M2 ให้ครบ loop |
| ฟาร์มน่าเบื่อ | ล่าซ้ำแต่การตัดสินใจเหมือนเดิม | ทำ skill/part effects ให้ต่างก่อนเพิ่ม HP |
| Touch ยาก | เดิน+หลบไม่ได้ กดผิดบ่อย | ขยายปุ่ม/แก้ pointer/soft-lock ก่อน polish |
| Part targeting ไม่ชัด | เลือกส่วนแล้วคิดว่าต้องโดนเสมอ | แสดง selection กับ hit geometry และฝึกบนเป้า |
| Save หายหรือรางวัลซ้ำ | reload แล้ว counts ผิด | transaction/idempotency/backup tests เป็น blocker |
| ภาพสวยแต่อ่านท่าไม่ได้ | hitbox กับภาพไม่ตรง | debug overlay และแก้ animation timing |
| Game balance อิงแต่ทฤษฎี | เวลาล่าไม่ตรงเป้าหมาย | เก็บ uptime/hit rate/เวลาจริงแล้วปรับ data |
| Engine/dependency assumptions ผิด | build/run ไม่ตรง README | ตรวจ official docs และ lock versions จริง |

## 28. Review rubric สำหรับหัวหน้างาน

ใช้คะแนน 1–5 เพื่อเปรียบเทียบรุ่น ไม่ใช่รับรองคุณภาพตลาด:

| ด้าน | น้ำหนัก | คำถาม |
|---|---:|---|
| Combat readability / fairness | 25% | อ่านและตอบโต้ก่อนโดนได้หรือไม่ |
| Controls / mobile UX | 20% | คำสั่งเชื่อถือได้ ปุ่มไม่ขัดกันหรือไม่ |
| Build differentiation | 20% | โมดูลเปลี่ยน tactic จริงหรือไม่ |
| Progression / repeat desire | 15% | รู้เป้าหมายถัดไปและอยากลองรอบใหม่หรือไม่ |
| Reliability / save | 15% | core loop และข้อมูลไม่เสียหรือไม่ |
| Art / audio clarity | 5% | ภาพเสียงช่วยอ่านสถานการณ์หรือไม่ |

คะแนนรวมดีไม่ชดเชย critical bug เช่นข้อมูลหาย จ่ายรางวัลซ้ำ ควบคุมค้าง หรือเล่นไม่จบรอบ ต้องแก้ก่อนผ่าน gate

## 29. Definition of done ของ MVP

เรียก MVP เสร็จได้เมื่อ:

- ผู้เล่นใหม่ล่าสำเร็จ รับวัสดุ สร้างโมดูล ติดตั้ง และกลับไปล่าได้
- มีสัตว์ 3 ชนิดครบพฤติกรรม อาวุธ 2 แบบ และโมดูล 6 แบบตามข้อกำหนด
- อวัยวะแตกเปลี่ยน combat จริงและจ่ายโบนัสอย่างถูกต้อง
- Hunt/capture/failed/abandoned แยกผลและ settlement ได้ถูกต้อง
- Save/export/import/recovery ผ่าน critical tests
- คอมและ touch emulation ผ่าน พร้อมระบุผลมือถือจริงที่ทำหรือยังไม่ได้ทำ
- ไม่มี blocker ของ milestone และมีรายงานข้อจำกัดที่ตรงจริง
- Source/build/docs เป็น version เดียวกัน และมี checkpoint ทำต่อได้
- มี playtest จริงอย่างน้อยหนึ่งรอบครบ core loop; หากยังไม่มีมือถือจริง ห้ามอ้างพร้อมปล่อยมือถือ

## 30. ข้อสั่งการสุดท้าย

ทำให้ “ล่ารอบแรก → เห็นคุณค่าของวัสดุ → สร้างสิ่งใหม่ → อยากลองล่าอีกครั้ง” เกิดขึ้นก่อน

เมื่อแกนนี้ทำงานแล้วค่อยขยายเกาะ มอนสเตอร์ และฐาน เอกสารนี้ให้ Claude เริ่มสร้างได้ทันที ส่วนความสนุกและ balance ต้องกลับมาวัดจากผู้เล่นจริง ไม่ใช้จำนวนฟีเจอร์เป็นคำตอบแทน

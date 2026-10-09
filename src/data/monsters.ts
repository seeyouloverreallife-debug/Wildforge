import type { MaterialId, MonsterId } from './content';

export type MoveId =
  | 'fire_breath' | 'bite_lunge' | 'tail_sweep'
  | 'claw_slam' | 'side_charge' | 'venom_puddle'
  | 'glide_pass' | 'horn_ram' | 'wind_ring';
export type PartId = 'fire_sac' | 'jaw' | 'shell' | 'poison_sac' | 'wing' | 'horn';

export type MoveShape =
  | { kind: 'cone'; angleDeg: number; range: number }
  /** monster travels `distance` during the active window; hits whoever overlaps the circle at `headOffset` */
  | { kind: 'dash'; distance: number; hitRadius: number; headOffset: number }
  /** arc around the body centre, centred on the monster's rear */
  | { kind: 'rear_arc'; arcDeg: number; range: number }
  /** circle on the position locked near the end of the telegraph */
  | { kind: 'target_circle'; radius: number }
  /** hazard left on the locked position: damages in separate pulses */
  | { kind: 'puddle'; radius: number; duration: number; pulseDamage: number; interval: number }
  | { kind: 'annulus'; inner: number; outer: number; knockback: number };

export interface MoveDef {
  id: MoveId;
  nameTh: string;
  telegraph: number;
  active: number;
  recovery: number;
  damage: number;
  shape: MoveShape;
  /** fraction of telegraph after which direction / target stops tracking the player */
  lockAt: number;
  minRange: number;
  maxRange: number;
  weight: number;
  hintTh: string;
  /** body damage multiplier while this move is in its active window (glide, §8.3) */
  armorWhileActive?: number;
}

export interface PartDef {
  id: PartId;
  nameTh: string;
  hp: number;
  /** local coords: x = forward, y = right of the monster */
  offset: { x: number; y: number };
  radius: number;
  bonusMaterialId: MaterialId;
}

export interface BreakEffect {
  removeMoves?: readonly MoveId[];
  recoveryBonus?: Partial<Record<MoveId, number>>;
  damageOverride?: Partial<Record<MoveId, number>>;
  /** replace fields of a move's dash distance */
  dashDistance?: Partial<Record<MoveId, number>>;
  /** removes the front armor of the monster */
  removeArmor?: boolean;
  descTh: string;
}

export interface MonsterDef {
  id: MonsterId;
  nameTh: string;
  hp: number;
  bodyRadius: number;
  approachSpeed: number;
  restRange: [number, number];
  introTh: string;
  /** shown only after the first clear (§16) */
  tipTh: string;
  materials: readonly [MaterialId, MaterialId];
  /** body damage ×mult for hits from the front arc while `part` is intact (crab shell, §8.2) */
  frontArmor?: { part: PartId; mult: number; halfArcDeg: number };
  parts: readonly PartDef[];
  moves: readonly MoveDef[];
  breakEffects: Readonly<Partial<Record<PartId, BreakEffect>>>;
}

// Design doc §8. Numbers are playtest hypotheses.
export const EMBER_GECKO: MonsterDef = {
  id: 'ember_gecko', nameTh: 'กิ้งก่าถุงไฟ', hp: 1400, bodyRadius: 62, approachSpeed: 120, restRange: [0.4, 0.8],
  introTh: 'สัตว์สี่ขาหัวกว้าง ถุงใต้คอเรืองแสงส้ม',
  tipTh: 'หลบข้างตอนมันสูดลม แล้วตีถุงไฟให้แตก จะเลิกพ่นไฟ',
  materials: ['heat_bladder', 'fang'],
  parts: [
    { id: 'fire_sac', nameTh: 'ถุงไฟ', hp: 220, offset: { x: 40, y: 0 }, radius: 30, bonusMaterialId: 'heat_bladder' },
    { id: 'jaw', nameTh: 'ขากรรไกร', hp: 180, offset: { x: 95, y: 0 }, radius: 26, bonusMaterialId: 'fang' },
  ],
  moves: [
    { id: 'fire_breath', nameTh: 'พ่นไฟ', telegraph: 0.9, active: 0.7, recovery: 1.1, damage: 22,
      shape: { kind: 'cone', angleDeg: 70, range: 260 }, lockAt: 0.7, minRange: 0, maxRange: 340, weight: 3,
      hintTh: 'สูดลมถุงพอง — หลบไปด้านข้างแล้วโจมตีถุงไฟ' },
    { id: 'bite_lunge', nameTh: 'กัดพุ่ง', telegraph: 0.65, active: 0.25, recovery: 0.8, damage: 16,
      shape: { kind: 'dash', distance: 180, hitRadius: 44, headOffset: 95 }, lockAt: 0.7, minRange: 0, maxRange: 330, weight: 3,
      hintTh: 'ลดหัวต่ำ — หลบออกจากเส้นตรง' },
    { id: 'tail_sweep', nameTh: 'กวาดหาง', telegraph: 0.8, active: 0.3, recovery: 0.9, damage: 18,
      shape: { kind: 'rear_arc', arcDeg: 220, range: 150 }, lockAt: 0.7, minRange: 0, maxRange: 170, weight: 2,
      hintTh: 'หันหัวมองหลัง — ถอยหรือหลบเข้าช่วงต้น' },
  ],
  breakEffects: {
    fire_sac: { removeMoves: ['fire_breath'], recoveryBonus: { bite_lunge: 0.2 }, descTh: 'ถุงไฟแตก: เลิกพ่นไฟ และกัดพุ่งพักนานขึ้น' },
    jaw: { damageOverride: { bite_lunge: 12 }, descTh: 'ขากรรไกรแตก: กัดพุ่งเบาลง' },
  },
};

export const MIRE_CRAB: MonsterDef = {
  id: 'mire_crab', nameTh: 'ปูเกราะพิษ', hp: 1700, bodyRadius: 70, approachSpeed: 85, restRange: [0.4, 0.8],
  introTh: 'กระดองกว้างขาเตี้ย ถุงพิษอยู่ใต้ด้านท้าย',
  tipTh: 'เกราะด้านหน้าลดดาเมจลำตัว — ตีกระดองให้แตก หรืออ้อมไปตีถุงพิษด้านท้าย',
  materials: ['shell_scale', 'venom_sac'],
  frontArmor: { part: 'shell', mult: 0.8, halfArcDeg: 60 },
  parts: [
    { id: 'shell', nameTh: 'กระดอง', hp: 300, offset: { x: 12, y: 0 }, radius: 50, bonusMaterialId: 'shell_scale' },
    { id: 'poison_sac', nameTh: 'ถุงพิษ', hp: 220, offset: { x: -64, y: 0 }, radius: 28, bonusMaterialId: 'venom_sac' },
  ],
  moves: [
    { id: 'claw_slam', nameTh: 'ก้ามทุบ', telegraph: 0.85, active: 0.2, recovery: 1.0, damage: 24,
      shape: { kind: 'target_circle', radius: 100 }, lockAt: 0.25, minRange: 0, maxRange: 420, weight: 3,
      hintTh: 'ยกก้าม — วงล็อกตั้งแต่ต้น วิ่งหรือหลบออกจากวงก่อนก้ามตก' },
    { id: 'side_charge', nameTh: 'พุ่งข้าง', telegraph: 0.75, active: 0.35, recovery: 0.9, damage: 18,
      shape: { kind: 'dash', distance: 240, hitRadius: 70, headOffset: 0 }, lockAt: 0.7, minRange: 0, maxRange: 380, weight: 3,
      hintTh: 'เอียงกระดอง — ล่อให้พุ่งชนหินจะเสียจังหวะ' },
    { id: 'venom_puddle', nameTh: 'บ่อพิษ', telegraph: 1.0, active: 0.1, recovery: 1.2, damage: 0,
      shape: { kind: 'puddle', radius: 90, duration: 4, pulseDamage: 4, interval: 1 }, lockAt: 0.7, minRange: 0, maxRange: 520, weight: 2,
      hintTh: 'ถุงพองขึ้น — อย่ายืนในบ่อพิษ' },
  ],
  breakEffects: {
    shell: { removeArmor: true, descTh: 'กระดองแตก: โจมตีด้านหน้าไม่ถูกลดดาเมจแล้ว' },
    poison_sac: { removeMoves: ['venom_puddle'], descTh: 'ถุงพิษแตก: เลิกวางบ่อพิษ (บ่อเดิมหมดตามเวลา)' },
  },
};

export const SAIL_LIZARD: MonsterDef = {
  id: 'sail_lizard', nameTh: 'กิ้งก่าปีกลม', hp: 1500, bodyRadius: 46, approachSpeed: 125, restRange: [0.4, 0.8],
  introTh: 'ลำตัวยาว ปีกเยื่อพับ หัวมีเขาทู่ บินต่ำและร่อน',
  tipTh: 'ตอนร่อนลำตัวทนขึ้น — รอมันลงพื้นแล้วเข้าตีปีก ปีกแตกร่อนได้สั้นลง',
  materials: ['sail_wing', 'blunt_horn'],
  parts: [
    { id: 'wing', nameTh: 'ปีก', hp: 240, offset: { x: -18, y: 0 }, radius: 46, bonusMaterialId: 'sail_wing' },
    { id: 'horn', nameTh: 'เขา', hp: 200, offset: { x: 78, y: 0 }, radius: 24, bonusMaterialId: 'blunt_horn' },
  ],
  moves: [
    { id: 'glide_pass', nameTh: 'ร่อนผ่าน', telegraph: 0.9, active: 0.45, recovery: 1.2, damage: 20,
      shape: { kind: 'dash', distance: 300, hitRadius: 50, headOffset: 0 }, lockAt: 0.7, minRange: 0, maxRange: 450, weight: 3,
      armorWhileActive: 0.8, hintTh: 'กางปีก เห็นเงาเส้นทาง — หลบข้างแล้วเข้าตีปีกตอนลงพื้น' },
    { id: 'horn_ram', nameTh: 'เขากระแทก', telegraph: 0.7, active: 0.3, recovery: 1.0, damage: 22,
      shape: { kind: 'dash', distance: 200, hitRadius: 40, headOffset: 70 }, lockAt: 0.7, minRange: 0, maxRange: 330, weight: 3,
      hintTh: 'ก้มเขา — หลบหรือล่อให้ชนหิน' },
    { id: 'wind_ring', nameTh: 'วงลม', telegraph: 1.0, active: 0.25, recovery: 1.1, damage: 14,
      shape: { kind: 'annulus', inner: 70, outer: 180, knockback: 60 }, lockAt: 1, minRange: 0, maxRange: 230, weight: 2,
      hintTh: 'หมุนปีก — เข้าชิดตัวหรือออกนอกวง' },
  ],
  breakEffects: {
    wing: { dashDistance: { glide_pass: 150 }, recoveryBonus: { glide_pass: 0.5 }, descTh: 'ปีกแตก: ร่อนได้สั้นลงและพักนานขึ้น' },
    horn: { damageOverride: { horn_ram: 16 }, descTh: 'เขาแตก: เขากระแทกเบาลง' },
  },
};

export const MONSTERS: Readonly<Record<MonsterId, MonsterDef>> = {
  ember_gecko: EMBER_GECKO, mire_crab: MIRE_CRAB, sail_lizard: SAIL_LIZARD,
};

export const STAGGER = { partBreak: 1.5, meterStagger: 1.2, threshold: 100, hit: 5, decayPerSec: 10, decayDelay: 3 } as const;
export const VULNERABLE_MULT = 1.15; // attacking during monster recovery
export const OBSTACLE_RECOVERY_BONUS = 0.5; // dash blocked by rock/wall/thicket

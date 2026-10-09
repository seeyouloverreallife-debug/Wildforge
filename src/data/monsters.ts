export type MonsterId = 'ember_gecko';
export type MoveId = 'fire_breath' | 'bite_lunge' | 'tail_sweep';
export type PartId = 'fire_sac' | 'jaw';

export type MoveShape =
  | { kind: 'cone'; angleDeg: number; range: number }
  /** monster travels `distance` during the active window; hits whoever overlaps the head circle */
  | { kind: 'dash'; distance: number; hitRadius: number; headOffset: number }
  /** arc around the body centre, centred on the monster's rear */
  | { kind: 'rear_arc'; arcDeg: number; range: number };

export interface MoveDef {
  id: MoveId;
  nameTh: string;
  telegraph: number;
  active: number;
  recovery: number;
  damage: number;
  shape: MoveShape;
  /** fraction of telegraph after which the direction stops tracking the player */
  lockAt: number;
  minRange: number;
  maxRange: number;
  weight: number;
  hintTh: string;
}

export interface PartDef {
  id: PartId;
  nameTh: string;
  hp: number;
  /** local coords: x = forward, y = right of the monster */
  offset: { x: number; y: number };
  radius: number;
  /** material granted on break (paid out in M2 settlement) */
  bonusMaterialId: string;
}

export interface MonsterDef {
  id: MonsterId;
  nameTh: string;
  hp: number;
  bodyRadius: number;
  approachSpeed: number;
  restRange: [number, number];
  parts: readonly PartDef[];
  moves: readonly MoveDef[];
  breakEffects: Readonly<Record<PartId, {
    removeMoves?: readonly MoveId[];
    recoveryBonus?: Partial<Record<MoveId, number>>;
    damageOverride?: Partial<Record<MoveId, number>>;
    descTh: string;
  }>>;
}

// Design doc §8.1. Numbers are playtest hypotheses.
export const EMBER_GECKO: MonsterDef = {
  id: 'ember_gecko',
  nameTh: 'กิ้งก่าถุงไฟ',
  hp: 1400,
  bodyRadius: 62,
  approachSpeed: 120,
  restRange: [0.4, 0.8],
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

export const STAGGER = { partBreak: 1.5, meterStagger: 1.2, threshold: 100, hit: 5, decayPerSec: 10, decayDelay: 3 } as const;
export const VULNERABLE_MULT = 1.15; // attacking during monster recovery
export const OBSTACLE_RECOVERY_BONUS = 0.5; // dash blocked by rock/wall

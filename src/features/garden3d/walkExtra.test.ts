// Promenade : champ de vision, obstacles ronds et haies, limite de parcelle, bonds, téléportation.
import { describe, expect, it } from 'vitest'
import {
  HOP_M,
  HOP_TURN_RAD,
  PARCEL_MARGIN_M,
  WALKER_RADIUS_M,
  WALK_FOV_DEG,
  boxCollider,
  circleCollider,
  distanceOutside,
  forwardOf,
  hopWalker,
  horizontalFovDeg,
  limitToParcel,
  makeColliders,
  pushOutOfCircle,
  resolveCollisions,
  softFactor,
  stepWalker,
  teleportPose,
  trunkRadiusM,
  walkFovFor,
  type WalkInput,
  type WalkWorld,
} from './walk'

const bounds = { minX: -40, maxX: 40, minY: -40, maxY: 40 }
const parcel = [
  { x: -10, y: -10 },
  { x: 10, y: -10 },
  { x: 10, y: 10 },
  { x: -10, y: 10 },
]
const fwd: WalkInput = { forward: 1, strafe: 0, turn: 0, run: false }

describe('champ de vision de la Promenade', () => {
  it('portrait de téléphone : FOV vertical large, plafonné à 95°', () => {
    const v = walkFovFor(390 / 844)
    expect(v).toBe(95)
    // l'ancien FOV fixe de 65° ne donnait que ≈ 33° de large
    expect(horizontalFovDeg(WALK_FOV_DEG, 390 / 844)).toBeLessThan(35)
    expect(horizontalFovDeg(v, 390 / 844)).toBeGreaterThan(50)
  })
  it('paysage de bureau : FOV vertical plancher de 50°, large de ≈ 70°', () => {
    expect(walkFovFor(1280 / 800)).toBe(50)
    expect(horizontalFovDeg(50, 1.6)).toBeGreaterThan(65)
  })
  it('écran intermédiaire : vise 60° de large sans toucher aux bornes', () => {
    const a = 1.0 // carré
    const v = walkFovFor(a)
    expect(v).toBeGreaterThan(50)
    expect(v).toBeLessThan(95)
    expect(horizontalFovDeg(v, a)).toBeCloseTo(60, 3)
  })
  it('toujours dans [50, 95], et valeur de repli si le rapport est invalide', () => {
    for (const a of [0.2, 0.46, 0.75, 1, 1.33, 1.78, 2.4, 5]) {
      const v = walkFovFor(a)
      expect(v).toBeGreaterThanOrEqual(50)
      expect(v).toBeLessThanOrEqual(95)
    }
    expect(walkFovFor(0)).toBe(WALK_FOV_DEG)
    expect(walkFovFor(NaN)).toBe(WALK_FOV_DEG)
    expect(walkFovFor(-1)).toBe(WALK_FOV_DEG)
  })
})

describe('troncs (cercles) et haies (boîtes)', () => {
  it('rayon du tronc : 0,15 m pour un jeune plant, 0,5 m pour un grand arbre', () => {
    expect(trunkRadiusM(0.5)).toBe(0.15)
    expect(trunkRadiusM(2)).toBeCloseTo(0.15, 2)
    expect(trunkRadiusM(8)).toBeCloseTo(0.3, 2)
    expect(trunkRadiusM(30)).toBe(0.5)
    expect(trunkRadiusM(NaN)).toBe(0.15)
  })
  it('repousse le promeneur radialement hors du tronc', () => {
    const c = { x: 0, y: 0, r: 0.3 }
    expect(pushOutOfCircle({ x: 2, y: 0 }, WALKER_RADIUS_M, c)).toBeNull()
    const p = pushOutOfCircle({ x: 0.2, y: 0 }, WALKER_RADIUS_M, c)!
    expect(Math.hypot(p.x, p.y)).toBeGreaterThanOrEqual(0.3 + WALKER_RADIUS_M)
    // exactement au centre : sort quand même
    const q = pushOutOfCircle({ x: 0, y: 0 }, WALKER_RADIUS_M, c)!
    expect(Math.hypot(q.x, q.y)).toBeGreaterThanOrEqual(0.3 + WALKER_RADIUS_M)
  })
  it('on ne traverse pas un tronc : de face on s’arrête devant, un peu de côté on le contourne en glissant', () => {
    const world: WalkWorld = { colliders: [circleCollider(0, 5, 0.4)], bounds }
    for (const [x0, passes] of [[0, false], [0.3, true]] as const) {
      let w: { x: number; y: number; yaw: number } = { x: x0, y: 0, yaw: 0 }
      let minDist = Infinity
      for (let i = 0; i < 240; i++) {
        w = stepWalker(w, fwd, 1 / 30, world)
        minDist = Math.min(minDist, Math.hypot(w.x, w.y - 5))
      }
      expect(minDist).toBeGreaterThanOrEqual(0.4 + WALKER_RADIUS_M - 1e-6)
      if (passes) expect(w.y).toBeGreaterThan(5)
      else expect(w.y).toBeLessThan(5)
    }
  })
  it('une haie (boîte) arrête la marche et le promeneur glisse le long', () => {
    const hedge = boxCollider(0, 5, 6, 1)
    const world: WalkWorld = { colliders: [hedge], bounds }
    let w = { x: 0, y: 0, yaw: Math.PI / 4 } // en biais vers le nord-ouest
    for (let i = 0; i < 90; i++) w = stepWalker(w, fwd, 1 / 30, world)
    expect(w.y).toBeLessThan(5 - 0.5 + 1e-6) // jamais dans la haie
    expect(w.x).toBeLessThan(-0.5) // a glissé vers l'ouest
  })
  it('boxCollider : emprise rectangulaire, tournée', () => {
    const b = boxCollider(0, 0, 4, 2, Math.PI / 2)
    expect(b.maxX - b.minX).toBeCloseTo(2, 6)
    expect(b.maxY - b.minY).toBeCloseTo(4, 6)
  })
  it('resolveCollisions mélange polygones et cercles', () => {
    const cols = [...makeColliders([{ id: 'm', ring: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 }], heightM: 5 }]), circleCollider(5, 2, 0.3)]
    const p = resolveCollisions({ x: 4.5, y: 2 }, WALKER_RADIUS_M, cols)
    for (const c of cols) {
      if (c.circle) expect(Math.hypot(p.x - 5, p.y - 2)).toBeGreaterThanOrEqual(0.3 + WALKER_RADIUS_M - 1e-6)
      else expect(p.x).toBeGreaterThanOrEqual(4 + WALKER_RADIUS_M - 1e-3)
    }
  })
})

describe('limite de parcelle (polygone, souple, glissement)', () => {
  it('distance à l’extérieur : 0 dedans, distance au contour dehors', () => {
    expect(distanceOutside({ x: 0, y: 0 }, parcel)).toBe(0)
    expect(distanceOutside({ x: 13, y: 0 }, parcel)).toBeCloseTo(3, 6)
    expect(distanceOutside({ x: 13, y: 14 }, parcel)).toBeCloseTo(5, 6) // coin : distance au sommet
  })
  it('ramène un point trop loin à la marge, sans toucher ce qui est dans la marge', () => {
    expect(limitToParcel({ x: 15, y: 0 }, parcel, 12)).toEqual({ x: 15, y: 0 })
    const q = limitToParcel({ x: 40, y: 3 }, parcel, 12)
    expect(q.x).toBeCloseTo(22, 6)
    expect(q.y).toBeCloseTo(3, 6) // la position le long du bord est conservée : glissement
  })
  it('un parcelle en L (concave) : plus serrée que son rectangle englobant', () => {
    const L = [
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 5 },
      { x: 5, y: 5 },
      { x: 5, y: 20 },
      { x: 0, y: 20 },
    ]
    // (18, 18) est dans l'emprise (0..20) mais à 13 m du contour : hors marge de 12 m
    expect(distanceOutside({ x: 18, y: 18 }, L)).toBeGreaterThan(12)
    const q = limitToParcel({ x: 18, y: 18 }, L, 12)
    expect(distanceOutside(q, L)).toBeCloseTo(12, 6)
  })
  it('pas de téléportation : déjà dehors de la marge, on peut rester ou revenir, pas s’éloigner', () => {
    const from = { x: 30, y: 0 } // 20 m dehors
    const away = limitToParcel({ x: 31, y: 0 }, parcel, 12, from)
    expect(away.x).toBeCloseTo(30, 6)
    const back = limitToParcel({ x: 29, y: 0 }, parcel, 12, from)
    expect(back.x).toBeCloseTo(29, 6)
  })
  it('limite souple : la vitesse baisse vers le bord (1 → 0,35)', () => {
    expect(softFactor(0, 12)).toBe(1)
    expect(softFactor(7, 12)).toBe(1) // 0,6 × 12 = 7,2
    expect(softFactor(9.6, 12)).toBeLessThan(1)
    expect(softFactor(12, 12)).toBeCloseTo(0.35, 6)
    expect(softFactor(50, 12)).toBeCloseTo(0.35, 6)
  })
  it('stepWalker : la marche s’arrête à la marge, plus lentement près du bord, et signale la limite', () => {
    const world: WalkWorld = { colliders: [], bounds, parcel }
    let w = { x: 0, y: 0, yaw: -Math.PI / 2 } // vers l'est
    let limited = false
    const dts: number[] = []
    for (let i = 0; i < 600; i++) {
      const before = w.x
      const n = stepWalker(w, { ...fwd, run: true }, 1 / 30, world)
      dts.push(n.x - before)
      limited ||= n.limited
      w = n
    }
    expect(w.x).toBeLessThanOrEqual(10 + PARCEL_MARGIN_M + 1e-6)
    expect(w.x).toBeGreaterThan(10 + PARCEL_MARGIN_M - 0.2)
    expect(limited).toBe(true)
    // le pas dans la zone souple est plus court que le pas libre
    expect(Math.min(...dts.filter((d) => d > 0))).toBeLessThan(dts[0])
  })
  it('stepWalker : pousser en biais le long de la limite fait glisser', () => {
    const world: WalkWorld = { colliders: [], bounds, parcel }
    let w = { x: 21.99, y: 0, yaw: -Math.PI / 4 } // nord-est, contre la limite est
    for (let i = 0; i < 60; i++) w = stepWalker(w, fwd, 1 / 30, world)
    expect(w.x).toBeLessThanOrEqual(22 + 1e-6)
    expect(w.y).toBeGreaterThan(0.5) // a avancé vers le nord le long du bord
  })
  it('sans parcelle : comportement inchangé (emprise rectangulaire)', () => {
    const world: WalkWorld = { colliders: [], bounds }
    let w = { x: 0, y: 0, yaw: -Math.PI / 2 }
    for (let i = 0; i < 2000; i++) w = stepWalker(w, { ...fwd, run: true }, 0.1, world)
    expect(w.x).toBeLessThanOrEqual(bounds.maxX + 25 + 1e-6)
  })
})

describe('mouvement réduit : bonds', () => {
  const world: WalkWorld = { colliders: [], bounds }
  it('un bond avance de 1,5 m (3 m en courant) dans la direction du regard', () => {
    const w = { x: 0, y: 0, yaw: 0 }
    const a = hopWalker(w, fwd, world)!
    expect(a.y).toBeCloseTo(HOP_M, 6)
    expect(a.x).toBeCloseTo(0, 6)
    const r = hopWalker(w, { ...fwd, run: true }, world)!
    expect(r.y).toBeCloseTo(HOP_M * 2, 6)
    const east = hopWalker({ x: 0, y: 0, yaw: -Math.PI / 2 }, fwd, world)!
    expect(east.x).toBeCloseTo(HOP_M, 6)
  })
  it('tourner par bonds de 30°, à gauche (positif) ou à droite', () => {
    const l = hopWalker({ x: 1, y: 2, yaw: 0 }, { forward: 0, strafe: 0, turn: 1, run: false }, world)!
    expect(l.yaw).toBeCloseTo(HOP_TURN_RAD, 6)
    expect(l.x).toBe(1)
    const r = hopWalker({ x: 1, y: 2, yaw: 0 }, { forward: 0, strafe: 0, turn: -1, run: false }, world)!
    expect(r.yaw).toBeCloseTo(-HOP_TURN_RAD, 6)
  })
  it('sous le seuil (joystick au repos ou tremblant) : pas de bond', () => {
    expect(hopWalker({ x: 0, y: 0, yaw: 0 }, { forward: 0.2, strafe: 0.1, turn: 0.1, run: false }, world)).toBeNull()
  })
  it('un bond respecte les obstacles : il ne traverse pas un mur', () => {
    const wall = { colliders: makeColliders([{ id: 'm', ring: [{ x: -5, y: 1 }, { x: 5, y: 1 }, { x: 5, y: 3 }, { x: -5, y: 3 }], heightM: 5 }]), bounds }
    const a = hopWalker({ x: 0, y: 0, yaw: 0 }, fwd, wall)!
    expect(a.y).toBeLessThanOrEqual(1 - WALKER_RADIUS_M + 1e-3)
  })
  it('un bond respecte les limites (parcelle)', () => {
    const w = hopWalker({ x: 21.5, y: 0, yaw: -Math.PI / 2 }, fwd, { colliders: [], bounds, parcel })!
    expect(w.x).toBeLessThanOrEqual(22 + 1e-6)
  })
  it('même direction que la marche continue', () => {
    const f = forwardOf(0.7)
    const a = hopWalker({ x: 0, y: 0, yaw: 0.7 }, fwd, world)!
    expect(a.x / HOP_M).toBeCloseTo(f.x, 6)
    expect(a.y / HOP_M).toBeCloseTo(f.y, 6)
  })
})

describe('téléportation', () => {
  const world: WalkWorld = { colliders: makeColliders([{ id: 'm', ring: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 }], heightM: 5 }]), bounds, parcel }
  it('arrive à l’endroit demandé et garde le regard', () => {
    const t = teleportPose({ x: 0, y: -8, yaw: 1.2 }, { x: -6, y: -6 }, world)
    expect(t.x).toBeCloseTo(-6, 6)
    expect(t.y).toBeCloseTo(-6, 6)
    expect(t.yaw).toBe(1.2)
    expect(t.limited).toBe(false)
  })
  it('regarde la cible si demandé', () => {
    const t = teleportPose({ x: 0, y: -8, yaw: 0 }, { x: -6, y: -6 }, world, { x: -6, y: 0 })
    const f = forwardOf(t.yaw)
    expect(f.x).toBeCloseTo(0, 6)
    expect(f.y).toBeCloseTo(1, 6)
  })
  it('un point dans un bâtiment : le promeneur est placé dehors', () => {
    const t = teleportPose({ x: 0, y: -8, yaw: 0 }, { x: 2, y: 2 }, world)
    const inside = t.x > 0 - 1e-6 && t.x < 4 && t.y > 0 && t.y < 4
    expect(inside).toBe(false)
  })
  it('un point hors des limites est ramené dans la marge de parcelle', () => {
    const t = teleportPose({ x: 0, y: -8, yaw: 0 }, { x: 80, y: 0 }, world)
    expect(t.x).toBeLessThanOrEqual(10 + PARCEL_MARGIN_M + 1e-6)
    expect(t.limited).toBe(true)
  })
})

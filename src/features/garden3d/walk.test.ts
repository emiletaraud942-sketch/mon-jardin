import { describe, expect, it } from 'vitest'
import { CONTEXT_M } from './framing'
import { makeHeightSampler } from './terrain'
import {
  EYE_HEIGHT_M,
  RUN_SPEED,
  WALK_SPEED,
  WALKER_RADIUS_M,
  MAX_OUTSIDE_M,
  clampToBounds,
  clampToGround,
  createFramePacer,
  entrancePose,
  eyeHeightAt,
  forwardOf,
  isTextEntry,
  isWalkMoving,
  joystickVector,
  lookDelta,
  PITCH_LIMIT,
  lodFor,
  makeColliders,
  pickLabelIds,
  pointInPolygon,
  poseNearPlant,
  pushOutOfPolygon,
  resolveCollisions,
  stepWalker,
  walkKeyBlocked,
  walkNeedsFrames,
  yawToward,
} from './walk'

const rect = (x: number, y: number, w: number, h: number) => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + h },
  { x, y: y + h },
]
const bounds = { minX: -14, maxX: 14, minY: -14, maxY: 14 }

describe('collision cercle - polygone', () => {
  const ring = rect(0, 0, 10, 10)
  it('pas de collision loin du mur', () => {
    expect(pushOutOfPolygon({ x: -2, y: 5 }, 0.35, ring)).toBeNull()
    expect(pushOutOfPolygon({ x: 5, y: 20 }, 0.35, ring)).toBeNull()
  })
  it('repousse à la distance du rayon quand on frôle un mur', () => {
    const p = pushOutOfPolygon({ x: -0.1, y: 5 }, 0.35, ring)!
    expect(p.x).toBeCloseTo(-0.35, 2)
    expect(p.y).toBeCloseTo(5, 5)
  })
  it('un coin repousse radialement', () => {
    const p = pushOutOfPolygon({ x: -0.1, y: -0.1 }, 0.35, ring)!
    expect(Math.hypot(p.x, p.y)).toBeCloseTo(0.35, 2)
  })
  it('à l’intérieur : ressort par l’arête la plus proche (sens horaire aussi)', () => {
    const p = pushOutOfPolygon({ x: 1, y: 5 }, 0.35, ring)!
    expect(pointInPolygon(p, ring)).toBe(false)
    expect(p.x).toBeCloseTo(-0.35, 2)
    const cw = ring.slice().reverse()
    const q = pushOutOfPolygon({ x: 9, y: 5 }, 0.35, cw)!
    expect(q.x).toBeCloseTo(10.35, 2)
  })
  it('résout plusieurs bâtiments accolés', () => {
    const cols = makeColliders([
      { id: 'a', ring: rect(0, 0, 10, 3), heightM: 6 },
      { id: 'b', ring: rect(0, 3, 3, 7), heightM: 6 },
    ])
    const p = resolveCollisions({ x: 3.1, y: 3.1 }, WALKER_RADIUS_M, cols)
    for (const c of cols) expect(pushOutOfPolygon(p, WALKER_RADIUS_M - 0.01, c.ring)).toBeNull()
  })
  it('ignore les bâtiments plats ou dégénérés', () => {
    expect(makeColliders([{ id: 'x', ring: rect(0, 0, 2, 2), heightM: 0 }, { id: 'y', ring: rect(0, 0, 2, 2).slice(0, 2), heightM: 5 }])).toHaveLength(0)
  })
})

describe('déplacement', () => {
  const world = { colliders: makeColliders([{ id: 'maison', ring: rect(-2, 5, 4, 4), heightM: 6 }]), bounds }
  it('avance vers le nord à la vitesse de marche, plus vite en courant', () => {
    const w = stepWalker({ x: 0, y: 0, yaw: 0 }, { forward: 1, strafe: 0, turn: 0, run: false }, 1 / 10, world)
    expect(w.y).toBeCloseTo(WALK_SPEED / 10, 5)
    const r = stepWalker({ x: 0, y: 0, yaw: 0 }, { forward: 1, strafe: 0, turn: 0, run: true }, 1 / 10, world)
    expect(r.y).toBeCloseTo(RUN_SPEED / 10, 5)
  })
  it('lacet π/2 : on regarde vers l’ouest', () => {
    const f = forwardOf(Math.PI / 2)
    expect(f.x).toBeCloseTo(-1)
    expect(f.y).toBeCloseTo(0)
    const w = stepWalker({ x: 0, y: 0, yaw: Math.PI / 2 }, { forward: 1, strafe: 0, turn: 0, run: false }, 0.1, world)
    expect(w.x).toBeLessThan(0)
  })
  it('la diagonale n’est pas plus rapide', () => {
    const w = stepWalker({ x: 0, y: 0, yaw: 0 }, { forward: 1, strafe: 1, turn: 0, run: false }, 0.1, world)
    expect(Math.hypot(w.x, w.y)).toBeCloseTo(WALK_SPEED / 10, 5)
  })
  it('ne traverse pas un bâtiment', () => {
    let w = { x: 0, y: 2, yaw: 0 }
    for (let i = 0; i < 200; i++) w = stepWalker(w, { forward: 1, strafe: 0, turn: 0, run: true }, 1 / 30, world)
    expect(w.y).toBeLessThan(5 - WALKER_RADIUS_M + 0.01)
    expect(w.y).toBeGreaterThan(4)
  })
  it('glisse le long du mur', () => {
    const wall = { colliders: makeColliders([{ id: 'long', ring: rect(-10, 5, 20, 4), heightM: 6 }]), bounds }
    let w = { x: -1.5, y: 3, yaw: Math.PI / 4 } // vers le nord-ouest, contre la façade sud
    const start = w.x
    for (let i = 0; i < 60; i++) w = stepWalker(w, { forward: 1, strafe: 0, turn: 0, run: false }, 1 / 30, wall)
    expect(w.y).toBeLessThanOrEqual(5 - WALKER_RADIUS_M + 0.01)
    expect(w.x).toBeLessThan(start)
  })
  it('ne sort pas du voisinage visible (25 m autour de l’emprise, comme le sol texturé)', () => {
    expect(MAX_OUTSIDE_M).toBe(CONTEXT_M)
    const p = clampToBounds({ x: 500, y: -500 }, bounds)
    expect(p).toEqual({ x: 14 + CONTEXT_M, y: -14 - CONTEXT_M })
    let w = { x: 0, y: 0, yaw: -Math.PI / 2 } // vers l'est
    for (let i = 0; i < 600; i++) w = stepWalker(w, { forward: 1, strafe: 0, turn: 0, run: true }, 0.1, { colliders: [], bounds })
    expect(w.x).toBeCloseTo(14 + CONTEXT_M)
  })
  it('ne sort pas du sol réel (carré de côté 2·halfSizeM) même avec une grande emprise', () => {
    const big = { minX: -90, maxX: 90, minY: -90, maxY: 90 }
    let w = { x: 0, y: 0, yaw: -Math.PI / 2 }
    const r = { colliders: [], bounds: big, groundHalfM: 99 }
    for (let i = 0; i < 2000; i++) w = stepWalker(w, { forward: 1, strafe: 0, turn: 0, run: true }, 0.1, r)
    expect(w.x).toBeCloseTo(99)
  })
  it('signale la limite atteinte (message « Limite du jardin »)', () => {
    const r = { colliders: [], bounds, groundHalfM: 30 }
    const far = stepWalker({ x: 0, y: 0, yaw: -Math.PI / 2 }, { forward: 1, strafe: 0, turn: 0, run: false }, 0.1, r)
    expect(far.limited).toBe(false)
    const edge = stepWalker({ x: 29.95, y: 0, yaw: -Math.PI / 2 }, { forward: 1, strafe: 0, turn: 0, run: true }, 0.1, r)
    expect(edge.x).toBeCloseTo(30)
    expect(edge.limited).toBe(true)
  })
  it('un changement d’emprise ne déplace jamais le promeneur', () => {
    const shrunk = { minX: -2, maxX: 2, minY: -2, maxY: 2 }
    const still = stepWalker({ x: 20, y: -15, yaw: 0.3 }, { forward: 0, strafe: 0, turn: 0, run: false }, 0.016, { colliders: [], bounds: shrunk, groundHalfM: 10 })
    expect(still.x).toBe(20)
    expect(still.y).toBe(-15)
    // il peut revenir vers l'intérieur mais pas s'enfoncer plus loin dehors
    const out = stepWalker({ x: 20, y: 0, yaw: -Math.PI / 2 }, { forward: 1, strafe: 0, turn: 0, run: false }, 0.1, { colliders: [], bounds: shrunk, groundHalfM: 10 })
    expect(out.x).toBeCloseTo(20)
    const back = stepWalker({ x: 20, y: 0, yaw: Math.PI / 2 }, { forward: 1, strafe: 0, turn: 0, run: false }, 0.1, { colliders: [], bounds: shrunk, groundHalfM: 10 })
    expect(back.x).toBeLessThan(20)
  })
  it('clampToGround sans position de départ borne simplement au carré', () => {
    expect(clampToGround({ x: 50, y: -50 }, 30)).toEqual({ x: 30, y: -30 })
  })
  it('un pas très long reste borné (pas de téléportation à travers un mur)', () => {
    const w = stepWalker({ x: 0, y: 4, yaw: 0 }, { forward: 1, strafe: 0, turn: 0, run: true }, 5, world)
    expect(w.y).toBeLessThan(5)
  })
})

describe('hauteur sous le promeneur', () => {
  it('terrain plat : 1,65 m', () => {
    expect(eyeHeightAt(makeHeightSampler(undefined), { x: 3, y: 4 })).toBeCloseTo(EYE_HEIGHT_M)
  })
  it('suit le relief (pente de 0,1 m/m vers le nord)', () => {
    const n = 5
    const size = 10
    const heights: number[] = []
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) heights.push(0.1 * (-size + (2 * size * i) / (n - 1)))
    const s = makeHeightSampler({ n, size, heights })
    expect(eyeHeightAt(s, { x: 0, y: 0 })).toBeCloseTo(EYE_HEIGHT_M, 5)
    expect(eyeHeightAt(s, { x: 2, y: 5 })).toBeCloseTo(0.5 + EYE_HEIGHT_M, 5)
    expect(eyeHeightAt(s, { x: 2, y: -5 })).toBeCloseTo(-0.5 + EYE_HEIGHT_M, 5)
  })
  it('hors grille : valeur du bord', () => {
    const s = makeHeightSampler({ n: 2, size: 1, heights: [0, 0, 1, 1] })
    expect(eyeHeightAt(s, { x: 0, y: 50 })).toBeCloseTo(1 + EYE_HEIGHT_M)
  })
})

describe('poses de départ', () => {
  it('l’entrée est au sud de la parcelle et regarde vers le centre', () => {
    const parcel = [
      { x: -10, y: -8 },
      { x: 12, y: -12 },
      { x: 10, y: 14 },
      { x: -12, y: 12 },
    ]
    const b = { minX: -12, maxX: 12, minY: -12, maxY: 14 }
    const p = entrancePose(parcel, b)
    expect(p.y).toBeLessThan(-9)
    expect(p.y).toBeGreaterThan(-12)
    // on regarde vers le nord (yaw proche de 0)
    expect(Math.abs(p.yaw)).toBeLessThan(0.3)
  })
  it('à 3 m de la plante, face à elle', () => {
    const p = poseNearPlant({ x: 5, y: 5 }, { x: 5, y: -10 }, 3)
    expect(Math.hypot(p.x - 5, p.y - 5)).toBeCloseTo(3, 5)
    expect(p.y).toBeLessThan(5)
    const f = forwardOf(p.yaw)
    expect(f.y).toBeCloseTo(1, 5)
    expect(yawToward({ x: 0, y: 0 }, { x: -1, y: 0 })).toBeCloseTo(Math.PI / 2)
  })
  it('ne se place pas dans un bâtiment', () => {
    const cols = makeColliders([{ id: 'm', ring: rect(4, -2, 4, 6), heightM: 5 }])
    const p = poseNearPlant({ x: 5, y: 5 }, { x: 5, y: -10 }, 3, cols)
    expect(pushOutOfPolygon(p, WALKER_RADIUS_M - 0.02, cols[0].ring)).toBeNull()
  })
})

describe('niveaux de détail et étiquettes', () => {
  it('trois niveaux avec hystérésis', () => {
    expect(lodFor(5)).toBe(2)
    expect(lodFor(20)).toBe(1)
    expect(lodFor(40)).toBe(0)
    expect(lodFor(12.5, 0)).toBe(1)
    expect(lodFor(12.5, 2)).toBe(2)
    expect(lodFor(26, 0)).toBe(0)
    expect(lodFor(26, 1)).toBe(1)
  })
  it('étiquettes : < 8 m, dans le champ, les plus proches, 8 au plus', () => {
    const targets = [
      { id: 'devant', x: 0, y: 4 },
      { id: 'derriere', x: 0, y: -3 },
      { id: 'loin', x: 0, y: 12 },
      { id: 'cote', x: 7, y: 0.5 },
      ...Array.from({ length: 12 }, (_, i) => ({ id: 'n' + i, x: -1 + i * 0.2, y: 2 + i * 0.4 })),
    ]
    const ids = pickLabelIds({ x: 0, y: 0 }, 0, targets)
    expect(ids).not.toContain('derriere')
    expect(ids).not.toContain('loin')
    expect(ids).not.toContain('cote')
    expect(ids).toHaveLength(8)
    expect(ids[0]).toBe('n0')
  })
})

describe('touches de marche et champs de saisie', () => {
  const el = (tagName: string, type?: string, extra: Record<string, unknown> = {}) => ({ tagName, type, ...extra })
  it('les champs de texte bloquent la marche', () => {
    for (const t of ['text', 'search', 'email', 'number', 'password', 'tel', 'url']) expect(isTextEntry(el('INPUT', t))).toBe(true)
    expect(isTextEntry(el('TEXTAREA'))).toBe(true)
    expect(isTextEntry(el('SELECT'))).toBe(true)
    expect(isTextEntry(el('DIV', undefined, { isContentEditable: true }))).toBe(true)
  })
  it('curseur, case à cocher et bouton ne bloquent pas la marche', () => {
    for (const t of ['range', 'checkbox', 'radio', 'button', 'submit']) expect(isTextEntry(el('INPUT', t))).toBe(false)
    expect(isTextEntry(el('BUTTON'))).toBe(false)
    expect(isTextEntry(el('CANVAS'))).toBe(false)
    expect(isTextEntry(null)).toBe(false)
  })
  it('sur un curseur : ZQSD marchent, les flèches gardent leur rôle de curseur', () => {
    const range = el('INPUT', 'range')
    for (const k of ['z', 'q', 's', 'd', 'w', 'a', 'Z']) expect(walkKeyBlocked(range, k)).toBe(false)
    for (const k of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']) expect(walkKeyBlocked(range, k)).toBe(true)
  })
  it('hors curseur, les flèches font tourner / avancer', () => {
    for (const k of ['ArrowLeft', 'ArrowRight']) expect(walkKeyBlocked(el('BUTTON'), k)).toBe(false)
    expect(walkKeyBlocked(el('INPUT', 'checkbox'), 'z')).toBe(false)
    expect(walkKeyBlocked(el('INPUT', 'text'), 'z')).toBe(true)
  })
})

describe('rendu à la demande de la Promenade', () => {
  const still = { forward: 0, strafe: 0, turn: 0, run: false }
  it('à l’arrêt et lissage convergé : aucune image', () => {
    expect(isWalkMoving(still)).toBe(false)
    expect(walkNeedsFrames(still, 0)).toBe(false)
    expect(walkNeedsFrames(still, 0.0002)).toBe(false)
  })
  it('touche, joystick ou rotation : images continues', () => {
    expect(walkNeedsFrames({ ...still, forward: 1 }, 0)).toBe(true)
    expect(walkNeedsFrames({ ...still, strafe: -0.4 }, 0)).toBe(true)
    expect(walkNeedsFrames({ ...still, turn: 1 }, 0)).toBe(true)
  })
  it('lissage de hauteur non convergé : on continue jusqu’au seuil', () => {
    expect(walkNeedsFrames(still, 0.05)).toBe(true)
    expect(walkNeedsFrames(still, -0.05)).toBe(true)
  })
})

describe('plafond d’images par seconde', () => {
  /** Simule un écran à `hz` Hz qui demande une image à chaque vsync pendant 1 s. */
  function fps(maxFps: number, hz: number) {
    const p = createFramePacer(maxFps)
    let n = 0
    for (let t = 0; t < 1000; t += 1000 / hz) {
      if (p.due(t)) {
        p.mark(t)
        n++
      }
    }
    return n
  }
  it('60 Hz plafonné à 60 : toutes les images', () => {
    expect(fps(60, 60)).toBeGreaterThanOrEqual(59)
    expect(fps(60, 60)).toBeLessThanOrEqual(61)
  })
  it('120 Hz plafonné à 60 : une image sur deux', () => {
    expect(fps(60, 120)).toBeGreaterThanOrEqual(58)
    expect(fps(60, 120)).toBeLessThanOrEqual(61)
  })
  it('tactile : 45 images/s maximum sur un écran 60 Hz (moyenne, pas 30)', () => {
    const n = fps(45, 60)
    expect(n).toBeGreaterThanOrEqual(43)
    expect(n).toBeLessThanOrEqual(46)
  })
  it('après un long arrêt, la première image est due tout de suite', () => {
    const p = createFramePacer(45)
    p.mark(0)
    expect(p.due(5000)).toBe(true)
    p.mark(5000)
    expect(p.due(5005)).toBe(false)
  })
})

describe('joystick virtuel', () => {
  it('zone morte : un doigt qui tremble ne bouge pas', () => {
    expect(joystickVector(2, -3, 32)).toEqual({ x: 0, y: 0 })
    expect(joystickVector(0, 0, 32)).toEqual({ x: 0, y: 0 })
  })
  it('vers le haut de l’écran = avancer, vers la droite = pas à droite', () => {
    const up = joystickVector(0, -32, 32)
    expect(up.y).toBeCloseTo(1)
    expect(up.x).toBeCloseTo(0)
    const right = joystickVector(32, 0, 32)
    expect(right.x).toBeCloseTo(1)
    expect(joystickVector(0, 32, 32).y).toBeCloseTo(-1)
  })
  it('borné à 1 au-delà de la butée, progressif avant', () => {
    expect(Math.hypot(joystickVector(300, -300, 32).x, joystickVector(300, -300, 32).y)).toBeCloseTo(1)
    const half = joystickVector(0, -16, 32).y
    expect(half).toBeGreaterThan(0.3)
    expect(half).toBeLessThan(0.7)
  })
  it('joystick poussé -> le promeneur avance dans la direction du regard à la vitesse de marche', () => {
    const w = { x: 0, y: 0, yaw: 0 }
    const j = joystickVector(0, -40, 32)
    let cur = w
    for (let i = 0; i < 60; i++) cur = stepWalker(cur, { forward: j.y, strafe: j.x, turn: 0, run: false }, 1 / 60, { colliders: [], bounds })
    expect(cur.y).toBeCloseTo(WALK_SPEED, 1)
    expect(cur.x).toBeCloseTo(0, 5)
  })
  it('en courant : RUN_SPEED m/s, et la diagonale n’est pas plus rapide', () => {
    let cur = { x: 0, y: -10, yaw: 0 }
    for (let i = 0; i < 60; i++) cur = stepWalker(cur, { forward: 1, strafe: 1, turn: 0, run: true }, 1 / 60, { colliders: [], bounds })
    expect(Math.hypot(cur.x, cur.y + 10)).toBeCloseTo(RUN_SPEED, 1)
  })
  it('à pleine vitesse et peu d’images par seconde (pas de 0,1 s), un mur fin n’est pas traversé', () => {
    const colliders = makeColliders([{ id: 'mur', ring: rect(-5, 2, 10, 0.3), heightM: 2 }])
    let cur = { x: 0, y: -1, yaw: 0 }
    for (let i = 0; i < 60; i++) cur = stepWalker(cur, { forward: 1, strafe: 0, turn: 0, run: true }, 0.1, { colliders, bounds })
    expect(cur.y).toBeLessThan(2 - WALKER_RADIUS_M + 0.01)
  })
  it('vitesses : marcher et courir restent nettement plus vifs que la marche réelle (1,4 m/s)', () => {
    expect(WALK_SPEED).toBeGreaterThanOrEqual(2.2)
    expect(RUN_SPEED).toBeGreaterThanOrEqual(2 * WALK_SPEED)
  })
  it('le promeneur ne traverse pas un bâtiment au joystick', () => {
    const colliders = makeColliders([{ id: 'b', ring: rect(-3, 2, 6, 4), heightM: 5 }])
    let cur = { x: 0, y: -1, yaw: 0 }
    for (let i = 0; i < 600; i++) cur = stepWalker(cur, { forward: 1, strafe: 0, turn: 0, run: true }, 1 / 60, { colliders, bounds })
    expect(cur.y).toBeLessThan(2 - WALKER_RADIUS_M + 0.01)
  })
})

describe('regard au doigt', () => {
  it('glisser à droite tourne vers la droite (lacet diminue), vers le haut lève la tête', () => {
    const a = lookDelta(0, 0, 100, 0)
    expect(a.yaw).toBeLessThan(0)
    const b = lookDelta(0, 0, 0, -100)
    expect(b.pitch).toBeGreaterThan(0)
  })
  it('l’inclinaison est bornée', () => {
    expect(lookDelta(0, 0, 0, -1e6).pitch).toBe(PITCH_LIMIT)
    expect(lookDelta(0, 0, 0, 1e6).pitch).toBe(-PITCH_LIMIT)
  })
})

describe('hauteur des yeux', () => {
  it('1,65 m au-dessus du sol, y compris sur une pente', () => {
    const sample = (x: number) => 0.1 * x
    expect(eyeHeightAt(sample, { x: 10, y: 0 })).toBeCloseTo(1 + EYE_HEIGHT_M)
  })
})

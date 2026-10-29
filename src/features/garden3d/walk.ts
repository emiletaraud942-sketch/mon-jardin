// Mode « Promenade » : logique pure (déplacement, collisions, hauteur des yeux, point de départ, niveaux de détail).
// Repère local : x = est, y = nord (m). Lacet (yaw) = 0 : on regarde vers le nord ; positif = vers l'ouest (sens trigonométrique vu de dessus).
// Three.js : X = est, Y = haut, Z = -nord.
import type { Building, XY } from '../../types'
import { CONTEXT_M, type Bounds } from './framing'
import type { HeightSampler } from './terrain'

export const EYE_HEIGHT_M = 1.65
/** Vitesses de promenade (m/s) : plus vives que la marche réelle (1,4 m/s), pour traverser un jardin sans s'impatienter. */
export const WALK_SPEED = 2.5
export const RUN_SPEED = 6
/** Longueur maximale d'un sous-pas (m) : à pleine vitesse et peu d'images par seconde, on ne saute jamais un mur fin. */
const MAX_SUBSTEP_M = 0.2
export const WALKER_RADIUS_M = 0.35
/** Distance maximale autorisée au-delà de l'emprise de la parcelle : le voisinage visible (sol et orthophoto). */
export const MAX_OUTSIDE_M = CONTEXT_M
export const TURN_SPEED = 1.8 // rad/s au clavier
export const PITCH_LIMIT = 1.25
export const WALK_FOV_DEG = 65

export interface Walker {
  x: number
  y: number
  yaw: number
}

/** Entrée de pilotage, chaque axe dans [-1, 1]. */
export interface WalkInput {
  forward: number
  strafe: number
  turn: number
  run: boolean
}

export interface Collider {
  ring: XY[]
  minX: number
  maxX: number
  minY: number
  maxY: number
}

export function makeColliders(buildings: Building[] | undefined): Collider[] {
  const out: Collider[] = []
  for (const b of buildings ?? []) {
    let ring = b.ring
    if (ring.length > 1) {
      const a = ring[0]
      const z = ring[ring.length - 1]
      if (Math.abs(a.x - z.x) < 1e-6 && Math.abs(a.y - z.y) < 1e-6) ring = ring.slice(0, -1)
    }
    if (ring.length < 3 || !(b.heightM > 0.3)) continue
    let minX = Infinity
    let maxX = -Infinity
    let minY = Infinity
    let maxY = -Infinity
    for (const p of ring) {
      minX = Math.min(minX, p.x)
      maxX = Math.max(maxX, p.x)
      minY = Math.min(minY, p.y)
      maxY = Math.max(maxY, p.y)
    }
    out.push({ ring, minX, maxX, minY, maxY })
  }
  return out
}

export function pointInPolygon(p: XY, ring: XY[]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]
    const b = ring[j]
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

function signedArea(ring: XY[]): number {
  let s = 0
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]
    const b = ring[(i + 1) % ring.length]
    s += a.x * b.y - b.x * a.y
  }
  return s / 2
}

const EPS = 1e-3

/**
 * Cercle (centre p, rayon r) contre polygone : renvoie le centre repoussé hors du polygone,
 * ou null s'il n'y a pas de collision. Le cercle glisse le long des murs.
 */
export function pushOutOfPolygon(p: XY, r: number, ring: XY[]): XY | null {
  let best = Infinity
  let qx = 0
  let qy = 0
  let nx = 0
  let ny = 0
  const ccw = signedArea(ring) >= 0
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]
    const b = ring[(i + 1) % ring.length]
    const ex = b.x - a.x
    const ey = b.y - a.y
    const len2 = ex * ex + ey * ey
    const t = len2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * ex + (p.y - a.y) * ey) / len2)) : 0
    const cx = a.x + ex * t
    const cy = a.y + ey * t
    const d = Math.hypot(p.x - cx, p.y - cy)
    if (d < best) {
      best = d
      qx = cx
      qy = cy
      const l = Math.sqrt(len2) || 1
      // Normale sortante : à droite de l'arête pour un contour anti-horaire.
      nx = (ccw ? ey : -ey) / l
      ny = (ccw ? -ex : ex) / l
    }
  }
  if (!isFinite(best)) return null
  const inside = pointInPolygon(p, ring)
  if (!inside && best >= r) return null
  if (inside) {
    // Au cœur du polygone : on ressort par l'arête la plus proche.
    return { x: qx + nx * (r + EPS), y: qy + ny * (r + EPS) }
  }
  if (best < 1e-9) return { x: qx + nx * (r + EPS), y: qy + ny * (r + EPS) }
  return { x: qx + ((p.x - qx) / best) * (r + EPS), y: qy + ((p.y - qy) / best) * (r + EPS) }
}

/** Repousse le centre hors de tous les obstacles (quelques passes pour les coins et les bâtiments accolés). */
export function resolveCollisions(p: XY, r: number, colliders: Collider[], passes = 4): XY {
  let cur = p
  for (let k = 0; k < passes; k++) {
    let moved = false
    for (const c of colliders) {
      if (cur.x < c.minX - r || cur.x > c.maxX + r || cur.y < c.minY - r || cur.y > c.maxY + r) continue
      const out = pushOutOfPolygon(cur, r, c.ring)
      if (out) {
        cur = out
        moved = true
      }
    }
    if (!moved) break
  }
  return cur
}

/**
 * Reste dans l'emprise de la parcelle élargie de maxOutsideM.
 * Si `from` (position actuelle) est déjà dehors parce que l'emprise a changé, on ne la déplace pas :
 * elle peut rester là ou revenir, pas s'enfoncer plus loin.
 */
export function clampToBounds(p: XY, bounds: Bounds, maxOutsideM = MAX_OUTSIDE_M, from?: XY): XY {
  const x0 = Math.min(bounds.minX - maxOutsideM, from ? from.x : Infinity)
  const x1 = Math.max(bounds.maxX + maxOutsideM, from ? from.x : -Infinity)
  const y0 = Math.min(bounds.minY - maxOutsideM, from ? from.y : Infinity)
  const y1 = Math.max(bounds.maxY + maxOutsideM, from ? from.y : -Infinity)
  return { x: Math.min(x1, Math.max(x0, p.x)), y: Math.min(y1, Math.max(y0, p.y)) }
}

/** Reste sur le sol réel : carré de côté 2·halfM centré sur l'origine (même règle de non-téléportation). */
export function clampToGround(p: XY, halfM: number, from?: XY): XY {
  const lx = Math.max(halfM, from ? Math.abs(from.x) : 0)
  const ly = Math.max(halfM, from ? Math.abs(from.y) : 0)
  return { x: Math.min(lx, Math.max(-lx, p.x)), y: Math.min(ly, Math.max(-ly, p.y)) }
}

/** Hauteur des yeux au-dessus du niveau de la mer relatif du jardin : relief + 1,65 m. */
export function eyeHeightAt(sample: HeightSampler, p: XY, eye = EYE_HEIGHT_M): number {
  return sample(p.x, p.y) + eye
}

export interface WalkWorld {
  colliders: Collider[]
  bounds: Bounds
  maxOutsideM?: number
  /** Demi-côté (m) du sol texturé : la marche s'arrête à son bord. */
  groundHalfM?: number
}

/** Résultat d'un pas : `limited` vaut vrai quand la limite du jardin a retenu le promeneur. */
export type WalkStep = Walker & { limited: boolean }

/** Vecteur « avant » du promeneur dans le repère local (x est, y nord). */
export function forwardOf(yaw: number): XY {
  return { x: -Math.sin(yaw), y: Math.cos(yaw) }
}

/** Avance le promeneur de dt secondes. */
export function stepWalker(w: Walker, input: WalkInput, dt: number, world: WalkWorld): WalkStep {
  const step = Math.min(0.1, Math.max(0, dt))
  const yaw = w.yaw + input.turn * TURN_SPEED * step
  const f = forwardOf(yaw)
  const right = { x: Math.cos(yaw), y: Math.sin(yaw) }
  let vx = f.x * input.forward + right.x * input.strafe
  let vy = f.y * input.forward + right.y * input.strafe
  const mag = Math.hypot(vx, vy)
  if (mag > 1) {
    vx /= mag
    vy /= mag
  }
  const speed = input.run ? RUN_SPEED : WALK_SPEED
  const parts = Math.max(1, Math.ceil((speed * step) / MAX_SUBSTEP_M))
  const from: XY = { x: w.x, y: w.y }
  let q: XY = from
  let limited = false
  for (let i = 0; i < parts; i++) {
    const prev = q
    let p: XY = { x: prev.x + (vx * speed * step) / parts, y: prev.y + (vy * speed * step) / parts }
    p = resolveCollisions(p, WALKER_RADIUS_M, world.colliders)
    q = clampToBounds(p, world.bounds, world.maxOutsideM ?? MAX_OUTSIDE_M, prev)
    if (world.groundHalfM != null) q = clampToGround(q, world.groundHalfM, prev)
    if (Math.abs(q.x - p.x) > 1e-6 || Math.abs(q.y - p.y) > 1e-6) limited = true
  }
  return { x: q.x, y: q.y, yaw, limited }
}

/**
 * Joystick virtuel : décalage du doigt (px, écran : y vers le bas) -> commande {x: pas de côté, y: avancer}, chacun dans [-1, 1].
 * Zone morte au centre (le doigt qui tremble ne bouge pas), puis réponse progressive jusqu'à `travelPx`.
 */
export function joystickVector(dxPx: number, dyPx: number, travelPx: number, deadzone = 0.14): XY {
  const len = Math.hypot(dxPx, dyPx)
  if (!(len > 0) || !(travelPx > 0)) return { x: 0, y: 0 }
  const m = Math.min(1, len / travelPx)
  if (m <= deadzone) return { x: 0, y: 0 }
  const k = (m - deadzone) / (1 - deadzone) // 0 au bord de la zone morte, 1 en butée
  return { x: (dxPx / len) * k, y: (-dyPx / len) * k }
}

/** Regard au doigt / à la souris : glisser vers la droite regarde à droite, vers le haut regarde en haut. Inclinaison bornée. */
export function lookDelta(yaw: number, pitch: number, dxPx: number, dyPx: number, sens = 0.0042): { yaw: number; pitch: number } {
  return { yaw: yaw - dxPx * sens, pitch: Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, pitch - dyPx * sens)) }
}

/** Lacet pour regarder de `from` vers `to`. */
export function yawToward(from: XY, to: XY): number {
  // forward = (-sin yaw, cos yaw) = direction (dx, dy) normalisée
  return Math.atan2(-(to.x - from.x), to.y - from.y)
}

/**
 * Point de départ « à l'entrée » : point le plus au sud de la parcelle (ou de l'emprise),
 * avancé de 1,5 m vers le centre et regardant vers le centre.
 */
export function entrancePose(parcel: XY[] | undefined, bounds: Bounds, colliders: Collider[] = []): Walker {
  const center: XY = { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 }
  let south: XY = { x: center.x, y: bounds.minY }
  if (parcel && parcel.length > 2) {
    for (const p of parcel) if (p.y < south.y || (p.y === south.y && Math.abs(p.x - center.x) < Math.abs(south.x - center.x))) south = p
  }
  const d = Math.hypot(center.x - south.x, center.y - south.y)
  const k = d > 0.01 ? Math.min(1.5, d / 2) / d : 0
  let pos: XY = { x: south.x + (center.x - south.x) * k, y: south.y + (center.y - south.y) * k }
  pos = resolveCollisions(pos, WALKER_RADIUS_M, colliders)
  return { x: pos.x, y: pos.y, yaw: d > 0.01 ? yawToward(pos, center) : 0 }
}

/**
 * Se place à `distM` d'une plante, du côté de `from` (par défaut le sud), en la regardant.
 */
export function poseNearPlant(plant: XY, from: XY | undefined, distM = 3, colliders: Collider[] = []): Walker {
  let dx = from ? from.x - plant.x : 0
  let dy = from ? from.y - plant.y : -1
  let l = Math.hypot(dx, dy)
  if (l < 0.5) {
    dx = 0
    dy = -1
    l = 1
  }
  let pos: XY = { x: plant.x + (dx / l) * distM, y: plant.y + (dy / l) * distM }
  pos = resolveCollisions(pos, WALKER_RADIUS_M, colliders)
  return { x: pos.x, y: pos.y, yaw: yawToward(pos, plant) }
}

// ---------- Niveaux de détail des plantes ----------

/** 0 = modèle simple, 1 = détail moyen, 2 = détail complet. */
export type DetailLevel = 0 | 1 | 2
export const LOD_FULL_M = 12
export const LOD_NEAR_M = 25
const LOD_HYSTERESIS = 1.12

/** Niveau de détail selon la distance à la caméra, avec hystérésis pour éviter le clignotement. */
export function lodFor(distM: number, prev: DetailLevel = 0): DetailLevel {
  const full = prev === 2 ? LOD_FULL_M * LOD_HYSTERESIS : LOD_FULL_M
  const near = prev >= 1 ? LOD_NEAR_M * LOD_HYSTERESIS : LOD_NEAR_M
  if (distM < full) return 2
  if (distM < near) return 1
  return 0
}

/**
 * Étiquettes à afficher : au plus `max` plantes à moins de `rangeM`, dans le champ de vision,
 * les plus proches d'abord.
 */
export function pickLabelIds(
  eye: XY,
  yaw: number,
  targets: { id: string; x: number; y: number }[],
  opts: { rangeM?: number; max?: number; halfFovRad?: number } = {},
): string[] {
  const range = opts.rangeM ?? 8
  const max = opts.max ?? 8
  const cosLim = Math.cos(opts.halfFovRad ?? 0.75)
  const f = forwardOf(yaw)
  const found: { id: string; d: number }[] = []
  for (const t of targets) {
    const dx = t.x - eye.x
    const dy = t.y - eye.y
    const d = Math.hypot(dx, dy)
    if (d > range) continue
    // Très proche : on l'affiche même si l'angle est large (le haut de la plante reste visible).
    if (d > 0.8 && (dx * f.x + dy * f.y) / d < cosLim) continue
    found.push({ id: t.id, d })
  }
  found.sort((a, b) => a.d - b.d)
  return found.slice(0, max).map((x) => x.id)
}

// ---------- État partagé entre le canvas (WalkRig) et l'interface (joystick, mini-carte) ----------

export interface WalkShared {
  /** Position (repère local), lacet et inclinaison du regard (rad, > 0 = vers le haut). */
  pose: Walker & { pitch: number }
  /** Altitude des yeux (Three.js Y). */
  eyeY: number
  /** Joystick virtuel : x vers la droite, y vers l'avant, chacun dans [-1, 1]. */
  joy: { x: number; y: number }
  /** Boutons fléchés tactiles : x = pas de côté, y = avancer, turn = tourner (> 0 = vers la gauche), chacun dans [-1, 1]. */
  pad: { x: number; y: number; turn: number }
  /** Bouton « Courir » tactile. */
  run: boolean
  /** Demande une image (rendu à la demande) : posé par WalkRig, appelé par le joystick et « Courir ». */
  wake?: () => void
  /** Une pose est mémorisée (reprise de la promenade). */
  saved: boolean
}

export function createWalkShared(): WalkShared {
  return { pose: { x: 0, y: 0, yaw: 0, pitch: 0 }, eyeY: EYE_HEIGHT_M, joy: { x: 0, y: 0 }, pad: { x: 0, y: 0, turn: 0 }, run: false, saved: false }
}

// ---------- Clavier : quelles touches marchent ----------

/** Ce dont `isTextEntry` a besoin d'un élément du DOM (testable sans navigateur). */
export interface KeyTarget {
  tagName?: string
  type?: string
  isContentEditable?: boolean
}

const TEXT_INPUT_TYPES = new Set(['text', 'search', 'email', 'number', 'password', 'tel', 'url', 'date', 'time', 'datetime-local', 'month', 'week'])

/** Vrai pour un champ où l'on tape du texte (la marche ne doit pas voler ces touches). */
export function isTextEntry(el: KeyTarget | null | undefined): boolean {
  const tag = el?.tagName?.toUpperCase()
  if (!el || !tag) return false
  if (el.isContentEditable) return true
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (tag === 'INPUT') return TEXT_INPUT_TYPES.has((el.type ?? 'text').toLowerCase())
  return false
}

/**
 * Vrai si la touche doit rester à l'élément ciblé : champ de texte, ou flèches sur un curseur (range) / bouton radio.
 * Un curseur, une case ou un bouton n'empêchent pas la marche au clavier (ZQSD, WASD).
 */
export function walkKeyBlocked(el: KeyTarget | null | undefined, key: string): boolean {
  if (isTextEntry(el)) return true
  if (el?.tagName?.toUpperCase() === 'INPUT') {
    const t = (el.type ?? '').toLowerCase()
    if ((t === 'range' || t === 'radio') && key.startsWith('Arrow')) return true
  }
  return false
}

// ---------- Rendu à la demande ----------

/** Écart de hauteur des yeux (m) en dessous duquel le lissage est considéré comme terminé. */
export const EYE_SETTLE_M = 0.0008
const INPUT_DEADZONE = 1e-3

export function isWalkMoving(i: WalkInput): boolean {
  return Math.abs(i.forward) > INPUT_DEADZONE || Math.abs(i.strafe) > INPUT_DEADZONE || Math.abs(i.turn) > INPUT_DEADZONE
}

/** Faut-il demander une image de plus ? Oui tant qu'on bouge ou que la hauteur des yeux n'a pas convergé. */
export function walkNeedsFrames(i: WalkInput, eyeGap: number): boolean {
  return isWalkMoving(i) || Math.abs(eyeGap) > EYE_SETTLE_M
}

/**
 * Plafond d'images par seconde pour une boucle qui redessine à chaque vsync.
 * Cadence sur une grille de `1000/maxFps` ms avec rattrapage : 45 images/s sur un écran 60 Hz font
 * 45 en moyenne (3 images sur 4), pas 30.
 */
export function createFramePacer(maxFps: number) {
  const interval = 1000 / maxFps
  const tolerance = 2 // ms : un vsync légèrement en avance compte comme dû
  let next = -Infinity
  return {
    interval,
    due(now: number): boolean {
      return now >= next - tolerance
    },
    mark(now: number): void {
      next = next === -Infinity || now - next > interval ? now + interval : next + interval
    },
  }
}

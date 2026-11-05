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
/** FOV vertical de repli (écran inconnu ou carré). Voir `walkFovFor` : en pratique il dépend de la forme de l'écran. */
export const WALK_FOV_DEG = 65
/** Champ horizontal visé en Promenade (degrés) : ce que l'œil attend d'une scène de jardin, quel que soit l'écran. */
export const WALK_TARGET_HFOV_DEG = 60
export const WALK_FOV_MIN_DEG = 50
export const WALK_FOV_MAX_DEG = 95

/**
 * FOV vertical (degrés) qui donne ≈ `targetHDeg` de champ horizontal pour un écran de rapport largeur/hauteur `aspect`,
 * borné à [min, max]. Un FOV vertical fixe de 65° ne donne que ≈ 33° de large sur un téléphone en portrait (390×844) : tunnel.
 * Portrait 390×844 : 95° vertical (≈ 53° de large, bornée) ; paysage 1280×800 : 50° vertical (≈ 73° de large).
 */
export function walkFovFor(aspect: number, targetHDeg = WALK_TARGET_HFOV_DEG, minDeg = WALK_FOV_MIN_DEG, maxDeg = WALK_FOV_MAX_DEG): number {
  if (!(aspect > 0) || !Number.isFinite(aspect)) return WALK_FOV_DEG
  const v = (2 * Math.atan(Math.tan((targetHDeg * Math.PI) / 360) / aspect) * 180) / Math.PI
  return Math.min(maxDeg, Math.max(minDeg, v))
}

/** Champ horizontal (degrés) d'une caméra de FOV vertical `vDeg` et de rapport `aspect`. */
export function horizontalFovDeg(vDeg: number, aspect: number): number {
  return (2 * Math.atan(Math.tan((vDeg * Math.PI) / 360) * Math.max(0, aspect)) * 180) / Math.PI
}

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
  /** Contour du polygone (bâtiment, haie) ; vide pour un cercle. */
  ring: XY[]
  minX: number
  maxX: number
  minY: number
  maxY: number
  /** Tronc, arbuste ou arbre des environs : obstacle circulaire (centre et rayon en m). */
  circle?: { x: number; y: number; r: number }
}

/** Obstacle circulaire (tronc). */
export function circleCollider(x: number, y: number, r: number): Collider {
  return { ring: [], minX: x - r, maxX: x + r, minY: y - r, maxY: y + r, circle: { x, y, r } }
}

/** Obstacle rectangulaire de largeur `w` (selon x avant rotation), profondeur `d`, tourné de `rot` rad autour du centre. */
export function boxCollider(cx: number, cy: number, w: number, d: number, rot = 0): Collider {
  const c = Math.cos(rot)
  const s = Math.sin(rot)
  const pts: XY[] = [
    [-w / 2, -d / 2],
    [w / 2, -d / 2],
    [w / 2, d / 2],
    [-w / 2, d / 2],
  ].map(([x, y]) => ({ x: cx + x * c - y * s, y: cy + x * s + y * c }))
  return {
    ring: pts,
    minX: Math.min(...pts.map((p) => p.x)),
    maxX: Math.max(...pts.map((p) => p.x)),
    minY: Math.min(...pts.map((p) => p.y)),
    maxY: Math.max(...pts.map((p) => p.y)),
  }
}

/** Rayon du tronc (m) d'après la hauteur de l'arbre : 0,15 m pour un jeune plant, 0,5 m pour un grand arbre (≥ 16 m). */
export function trunkRadiusM(heightM: number): number {
  const h = Number.isFinite(heightM) ? heightM : 0
  return Math.min(0.5, Math.max(0.15, 0.1 + 0.025 * h))
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

/** Cercle du promeneur (centre p, rayon r) contre un obstacle circulaire : centre repoussé radialement, ou null. */
export function pushOutOfCircle(p: XY, r: number, c: { x: number; y: number; r: number }): XY | null {
  const min = r + c.r
  const dx = p.x - c.x
  const dy = p.y - c.y
  const d = Math.hypot(dx, dy)
  if (d >= min) return null
  if (d < 1e-9) return { x: c.x + min + EPS, y: c.y }
  return { x: c.x + (dx / d) * (min + EPS), y: c.y + (dy / d) * (min + EPS) }
}

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
      const out = c.circle ? pushOutOfCircle(cur, r, c.circle) : pushOutOfPolygon(cur, r, c.ring)
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
  /** Contour de la parcelle : limite souple (voir `limitToParcel`). Absent : seule l'emprise rectangulaire borne la marche. */
  parcel?: XY[]
  /** Distance (m) autorisée au-delà du contour de la parcelle. */
  parcelMarginM?: number
}

/** Résultat d'un pas : `limited` vaut vrai quand la limite du jardin a retenu le promeneur. */
export type WalkStep = Walker & { limited: boolean }

/** Vecteur « avant » du promeneur dans le repère local (x est, y nord). */
export function forwardOf(yaw: number): XY {
  return { x: -Math.sin(yaw), y: Math.cos(yaw) }
}

// ---------- Limite de parcelle (polygone, souple, avec glissement) ----------

/** Au-delà du contour de la parcelle, le promeneur peut aller jusqu'à cette distance (m) : la rue et le voisinage proche. */
export const PARCEL_MARGIN_M = 12
/** Dès cette part de la marge, la marche ralentit quand on s'éloigne (limite « souple »). */
const SOFT_START = 0.6
const SOFT_MIN_FACTOR = 0.35

/** Point du contour le plus proche de p et sa distance. */
export function nearestOnRing(p: XY, ring: XY[]): { q: XY; d: number } {
  let best = Infinity
  let q: XY = ring[0] ?? { x: p.x, y: p.y }
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
      q = { x: cx, y: cy }
    }
  }
  return { q, d: best }
}

/** Distance (m) de p à l'extérieur du polygone : 0 dedans. */
export function distanceOutside(p: XY, ring: XY[]): number {
  if (ring.length < 3 || pointInPolygon(p, ring)) return 0
  return nearestOnRing(p, ring).d
}

/**
 * Ramène p dans « parcelle + marge ». Le point est replacé sur la ligne qui le joint au contour le plus proche :
 * le promeneur qui pousse en biais glisse le long de la limite au lieu de s'arrêter net.
 * `allowedM` est la marge effective : jamais plus petite que l'écart actuel de `from` (pas de téléportation).
 */
export function limitToParcel(p: XY, ring: XY[], marginM: number, from?: XY): XY {
  if (ring.length < 3) return p
  const allowed = Math.max(marginM, from ? distanceOutside(from, ring) : 0)
  if (pointInPolygon(p, ring)) return p
  const { q, d } = nearestOnRing(p, ring)
  if (d <= allowed) return p
  const k = allowed / d
  return { x: q.x + (p.x - q.x) * k, y: q.y + (p.y - q.y) * k }
}

/** Facteur de vitesse (0,35 à 1) quand on s'éloigne de la parcelle : 1 jusqu'à 60 % de la marge, puis décroissant. */
export function softFactor(distOutsideM: number, marginM: number): number {
  const t = (distOutsideM - SOFT_START * marginM) / ((1 - SOFT_START) * marginM)
  if (!(t > 0)) return 1
  return 1 - (1 - SOFT_MIN_FACTOR) * Math.min(1, t)
}

/**
 * Déplacement déjà calculé (dx, dy en m) : souplesse, obstacles, limites. Commun à la marche continue et aux bonds.
 * Toujours découpé en sous-pas de `MAX_SUBSTEP_M` : un bond de 3 m ou un pas à pleine vitesse ne saute jamais un mur fin
 * (le cercle du promeneur est repoussé à chaque sous-pas).
 */
function applyMove(w: Walker, yaw: number, dx: number, dy: number, world: WalkWorld): WalkStep {
  const ring = world.parcel && world.parcel.length > 2 ? world.parcel : undefined
  const margin = world.parcelMarginM ?? PARCEL_MARGIN_M
  const parts = Math.max(1, Math.ceil(Math.hypot(dx, dy) / MAX_SUBSTEP_M))
  const sx = dx / parts
  const sy = dy / parts
  let q: XY = { x: w.x, y: w.y }
  let limited = false
  for (let i = 0; i < parts; i++) {
    const prev = q
    let mx = sx
    let my = sy
    if (ring && (mx !== 0 || my !== 0)) {
      // Limite souple : on ralentit en s'éloignant de la parcelle (les pas qui rapprochent ne sont pas freinés).
      const d0 = distanceOutside(prev, ring)
      const d1 = distanceOutside({ x: prev.x + mx, y: prev.y + my }, ring)
      if (d1 > d0) {
        const k = softFactor(d1, margin)
        mx *= k
        my *= k
      }
    }
    let p: XY = { x: prev.x + mx, y: prev.y + my }
    p = resolveCollisions(p, WALKER_RADIUS_M, world.colliders)
    q = clampToBounds(p, world.bounds, world.maxOutsideM ?? MAX_OUTSIDE_M, prev)
    if (ring) q = limitToParcel(q, ring, margin, prev)
    if (world.groundHalfM != null) q = clampToGround(q, world.groundHalfM, prev)
    if (Math.abs(q.x - p.x) > 1e-6 || Math.abs(q.y - p.y) > 1e-6) limited = true
  }
  return { x: q.x, y: q.y, yaw, limited }
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
  return applyMove(w, yaw, vx * speed * step, vy * speed * step, world)
}

// ---------- Mouvement réduit : bonds ----------

/** Longueur d'un bond (m) et angle d'un bond de rotation. Le bond « courir » est deux fois plus long. */
export const HOP_M = 1.5
export const HOP_TURN_RAD = Math.PI / 6
/** Délai (s) entre deux bonds tant que la commande reste enfoncée. */
export const HOP_INTERVAL_S = 0.45
const HOP_DEADZONE = 0.5

/**
 * Un bond : le promeneur apparaît 1,5 m plus loin (3 m en courant) ou tourné de 30°, sans glissement de la vue.
 * Renvoie null si la commande est sous le seuil (rien à faire). Même règles d'obstacles et de limites que la marche.
 */
export function hopWalker(w: Walker, input: WalkInput, world: WalkWorld): WalkStep | null {
  const turning = Math.abs(input.turn) > HOP_DEADZONE
  const moving = Math.hypot(input.forward, input.strafe) > HOP_DEADZONE
  if (!turning && !moving) return null
  if (turning && !moving) return applyMove(w, w.yaw + Math.sign(input.turn) * HOP_TURN_RAD, 0, 0, world)
  const f = forwardOf(w.yaw)
  const right = { x: Math.cos(w.yaw), y: Math.sin(w.yaw) }
  let vx = f.x * input.forward + right.x * input.strafe
  let vy = f.y * input.forward + right.y * input.strafe
  const mag = Math.hypot(vx, vy) || 1
  const len = input.run ? HOP_M * 2 : HOP_M
  return applyMove(w, w.yaw, (vx / mag) * len, (vy / mag) * len, world)
}

/**
 * Pose d'arrivée d'une téléportation vers (x, y) : hors des obstacles, dans les limites, regard conservé
 * (ou tourné vers `look` s'il est donné).
 */
export function teleportPose(w: Walker, to: XY, world: WalkWorld, look?: XY): WalkStep {
  const ring = world.parcel && world.parcel.length > 2 ? world.parcel : undefined
  let q = resolveCollisions({ x: to.x, y: to.y }, WALKER_RADIUS_M, world.colliders)
  q = clampToBounds(q, world.bounds, world.maxOutsideM ?? MAX_OUTSIDE_M)
  if (ring) q = limitToParcel(q, ring, world.parcelMarginM ?? PARCEL_MARGIN_M)
  if (world.groundHalfM != null) q = clampToGround(q, world.groundHalfM)
  q = resolveCollisions(q, WALKER_RADIUS_M, world.colliders) // une dernière fois : la limite a pu ramener dans un obstacle
  const yaw = look ? yawToward(q, look) : w.yaw
  return { x: q.x, y: q.y, yaw, limited: Math.hypot(q.x - to.x, q.y - to.y) > 1e-6 }
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
  /** Téléporte le promeneur près de (x, y) (hors obstacles et limites), en regardant `look` s'il est donné. Posé par WalkRig. */
  teleport?: (to: XY, look?: XY) => void
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

// Points de vue en photos : calculs purs (sans DOM), testés dans geometry.test.ts.
// Caps en degrés : 0 = nord, 90 = est, sens horaire (comme src/lib/calibration.ts). Repère local : x = est, y = nord.
import type { Panorama, PanoramaShot, XY } from '../../types'
import { LIMITS } from '../../lib/security/limits'

export const MAX_POINTS = LIMITS.panoramasPerGarden
/** Place maximale pour les photos d'un jardin (octets). */
export const MAX_BYTES = 25 * 1024 * 1024
/** Cible d'une photo prise sur place (octets) et plus grand côté. */
export const SHOT_BYTES = 300 * 1024
export const SHOT_SIDE = 1280
export const SHOT_QUALITIES = [0.75, 0.65, 0.55, 0.46]
/** Photo importée (mode Panorama du téléphone) : plus large, sinon un tour complet serait flou. */
export const IMPORT_BYTES = 1400 * 1024
export const IMPORT_SIDE = 4096
/** Angle de vue en diagonale supposé d'un objectif de téléphone (degrés). */
const DIAGONAL_FOV = 72

const RAD = Math.PI / 180

/** Cap ramené dans [0, 360[. */
export const normDeg = (d: number) => ((d % 360) + 360) % 360

/** Écart signé de a vers b, dans ]-180, 180]. Positif = b est à droite de a. */
export function angleDelta(a: number, b: number): number {
  const d = normDeg(b - a)
  return d > 180 ? d - 360 : d
}

/** Moyenne mobile d'un angle (lissage de la boussole) : `k` entre 0 (rien ne bouge) et 1 (aucun lissage). */
export function smoothAngle(prev: number | undefined, next: number, k: number): number {
  if (prev === undefined) return normDeg(next)
  return normDeg(prev + angleDelta(prev, next) * k)
}

/** Largeur de champ horizontale (degrés) d'une image de ces dimensions, d'après un objectif supposé de 72° en diagonale. */
export function fovFromSize(width: number, height: number): number {
  if (!(width > 0) || !(height > 0)) return 60
  const half = Math.tan((DIAGONAL_FOV / 2) * RAD) * (width / Math.hypot(width, height))
  return Math.round(2 * Math.atan(half) / RAD)
}

/**
 * Répartition des photos d'un tour : un pas de 30 à 45° (3/4 de la largeur du champ, pour que les photos se recouvrent), 8 à 12 photos.
 */
export function planShots(fovDeg: number): { count: number; stepDeg: number } {
  const fov = Number.isFinite(fovDeg) && fovDeg > 0 ? fovDeg : 60
  const wanted = Math.min(45, Math.max(30, fov * 0.75))
  const count = Math.min(12, Math.max(8, Math.ceil(360 / wanted)))
  return { count, stepDeg: 360 / count }
}

/** Caps visés pour un tour qui commence à `startDeg`, vers la droite. */
export function targetHeadings(startDeg: number, count: number): number[] {
  const step = 360 / count
  return Array.from({ length: count }, (_, i) => normDeg(startDeg + i * step))
}

/** Prochain cap à viser, ou undefined quand le tour est fait. */
export const nextTarget = (startDeg: number, count: number, done: number): number | undefined => (done >= count ? undefined : targetHeadings(startDeg, count)[done])

/** Faut-il déclencher ? Cap assez proche de la cible, et téléphone presque immobile (vitesse en °/s). */
export function readyToShoot(headingDeg: number, targetDeg: number, speedDegPerS: number, tolDeg = 4, maxSpeed = 14): boolean {
  return Math.abs(angleDelta(headingDeg, targetDeg)) <= tolDeg && speedDegPerS <= maxSpeed
}

/** Consigne de rotation : « Tournez vers la droite de 25° ». */
export function turnHint(headingDeg: number, targetDeg: number): { dir: 'droite' | 'gauche' | 'ici'; deg: number } {
  const d = angleDelta(headingDeg, targetDeg)
  if (Math.abs(d) <= 4) return { dir: 'ici', deg: 0 }
  return { dir: d > 0 ? 'droite' : 'gauche', deg: Math.round(Math.abs(d)) }
}

// ---------- Capteurs ----------

/** Cap de l'arrière du téléphone (formule du W3C), 0 = nord. undefined si les angles sont inutilisables. */
export function cameraHeadingDeg(alpha: number, beta: number, gamma: number): number | undefined {
  if (![alpha, beta, gamma].every(Number.isFinite)) return undefined
  const x = beta * RAD
  const y = gamma * RAD
  const z = alpha * RAD
  const vx = -Math.cos(z) * Math.sin(y) - Math.sin(z) * Math.sin(x) * Math.cos(y)
  const vy = -Math.sin(z) * Math.sin(y) + Math.cos(z) * Math.sin(x) * Math.cos(y)
  if (Math.abs(vx) < 1e-9 && Math.abs(vy) < 1e-9) return undefined
  return normDeg(Math.atan2(vx, vy) / RAD)
}

/** Hauteur du regard de la caméra arrière : 0 = horizon, positif = vers le ciel. Téléphone tenu droit : beta = 90. */
export function cameraPitchDeg(beta: number, gamma: number): number | undefined {
  if (![beta, gamma].every(Number.isFinite)) return undefined
  const vz = -Math.cos(beta * RAD) * Math.cos(gamma * RAD)
  return Math.asin(Math.max(-1, Math.min(1, vz))) / RAD
}

// ---------- Position : plantes et points voisins vus depuis un point ----------

/** Cap d'un point vers un autre (0 = nord). */
export function bearingDeg(from: XY, to: XY): number {
  return normDeg(Math.atan2(to.x - from.x, to.y - from.y) / RAD)
}

export const distM = (a: XY, b: XY) => Math.hypot(a.x - b.x, a.y - b.y)

/** Hauteur des yeux (m). */
export const EYE_M = 1.5

export interface Seen {
  id: string
  name: string
  /** Cap depuis le point (degrés) et distance (m). */
  bearing: number
  distM: number
  /** Hauteur apparente du haut de la plante au-dessus de l'horizon (degrés, ≥ -5). */
  elevDeg: number
}

export interface PlantInput {
  id: string
  name: string
  pos: XY
  heightM: number
}

/** Plantes proches d'un point, de la plus proche à la plus lointaine. Une plante à moins de 0,5 m (sous les pieds) est ignorée. */
export function plantsSeenFrom(point: XY, plants: PlantInput[], maxDistM = 40, limit = 14): Seen[] {
  const out: Seen[] = []
  for (const p of plants) {
    const d = distM(point, p.pos)
    if (d < 0.5 || d > maxDistM) continue
    const top = Math.max(0.3, p.heightM)
    out.push({ id: p.id, name: p.name, bearing: bearingDeg(point, p.pos), distM: d, elevDeg: Math.max(-5, Math.atan2(top * 0.85 - EYE_M, d) / RAD) })
  }
  return out.sort((a, b) => a.distM - b.distM).slice(0, limit)
}

/** Les autres points de vue, vus depuis `current`. */
export function neighborsOf(current: Panorama, all: Panorama[]): { id: string; bearing: number; distM: number }[] {
  return all.filter((p) => p.id !== current.id).map((p) => ({ id: p.id, bearing: bearingDeg(current, p), distM: distM(current, p) })).sort((a, b) => a.distM - b.distM)
}

// ---------- Projection sur le cylindre (vue depuis l'intérieur) ----------

/** Abscisse (px) d'un cap sur l'écran : le centre de l'écran regarde `yawDeg`, `hfovDeg` couvre toute la largeur. */
export function screenX(bearing: number, yawDeg: number, hfovDeg: number, widthPx: number): number {
  return widthPx / 2 + (angleDelta(yawDeg, bearing) / hfovDeg) * widthPx
}

/** Ordonnée (px) d'une hauteur apparente : l'horizon est au milieu de l'écran, `pitchDeg` = hauteur du regard. */
export function screenY(elevDeg: number, pitchDeg: number, hfovDeg: number, widthPx: number, heightPx: number): number {
  return heightPx / 2 - ((elevDeg - pitchDeg) / hfovDeg) * widthPx
}

/** Vrai si ce cap est dans le champ (avec une marge en pixels de chaque côté). */
export function inView(bearing: number, yawDeg: number, hfovDeg: number, widthPx: number, marginPx = 0): boolean {
  const x = screenX(bearing, yawDeg, hfovDeg, widthPx)
  return x >= -marginPx && x <= widthPx + marginPx
}

/**
 * Évite que les noms se chevauchent : chaque étiquette (triées de la plus proche à la plus lointaine) prend la première rangée libre.
 * Sans rangée libre, elle est masquée (-1).
 */
export function layoutRows(items: { x: number; w: number }[], maxRows = 4, gap = 6): number[] {
  const rows: { l: number; r: number }[][] = Array.from({ length: maxRows }, () => [])
  return items.map((it) => {
    const l = it.x - it.w / 2
    const r = it.x + it.w / 2
    for (let i = 0; i < maxRows; i++) {
      if (rows[i].every((o) => r + gap <= o.l || l - gap >= o.r)) {
        rows[i].push({ l, r })
        return i
      }
    }
    return -1
  })
}

/** Limite du regard vers le haut ou le bas selon la hauteur couverte par les photos. */
export function maxPitch(coverVfovDeg: number, viewVfovDeg: number): number {
  return Math.max(0, coverVfovDeg / 2 - viewVfovDeg / 2)
}

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** Champ horizontal affiché (degrés) : plus large sur grand écran pour garder des photos nettes ; `zoom` entre 1 et 2,5. */
export function viewFov(widthPx: number, zoom: number): number {
  return clamp(widthPx / 11, 60, 100) / clamp(zoom, 1, 2.5)
}

// ---------- Photos : tri, import, limites ----------

/** Photos triées par cap croissant. */
export const sortedShots = (shots: PanoramaShot[]): PanoramaShot[] => [...shots].sort((a, b) => normDeg(a.headingDeg) - normDeg(b.headingDeg))

/** Largeur couverte par défaut d'une photo importée : un rapport 2:1 est une sphère complète, sinon une bande de 55° de haut. */
export function defaultSpan(width: number, height: number): 120 | 180 | 360 {
  if (!(width > 0) || !(height > 0)) return 180
  const r = width / height
  if (r >= 1.8 && r <= 2.2) return 360
  const span = r * 55
  return span >= 270 ? 360 : span >= 150 ? 180 : 120
}

export type Refusal = 'points' | 'place'

/** Peut-on ajouter un point ? `usedBytes` : place déjà prise par les photos du jardin. */
export function canAddPoint(count: number, usedBytes: number): { ok: true } | { ok: false; reason: Refusal } {
  if (count >= MAX_POINTS) return { ok: false, reason: 'points' }
  if (usedBytes > MAX_BYTES - 4 * 1024 * 1024) return { ok: false, reason: 'place' }
  return { ok: true }
}

export function refusalMessage(r: Refusal): string {
  return r === 'points' ? `Vous avez déjà ${MAX_POINTS} points. Supprimez-en un pour en ajouter un autre.` : 'Il reste trop peu de place pour les photos. Supprimez un point pour continuer.'
}

/** Taille lisible : « 2,4 Mo », « 310 Ko ». */
export function sizeLabel(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))}\u00a0Ko`
  const mo = bytes / 1024 / 1024
  return `${(Number.isInteger(mo) ? String(mo) : mo.toFixed(1)).replace('.', ',')}\u00a0Mo`
}

const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']

/** « Photo du 3 mai » (avec l'année si elle n'est pas l'année en cours). */
export function photoDateLabel(iso: string, now: Date = new Date()): string {
  const t = new Date(iso)
  if (Number.isNaN(t.getTime())) return 'Photo'
  const day = t.getDate() === 1 ? '1er' : String(t.getDate())
  return `Photo du ${day} ${MONTHS[t.getMonth()]}${t.getFullYear() === now.getFullYear() ? '' : ' ' + t.getFullYear()}`
}

/** Nom d'un point : « Point 2 ». */
export const pointName = (index: number) => `Point ${index + 1}`

/** Caps affichables en toutes lettres (aide à la saisie manuelle du cap). */
export const COMPASS_POINTS = ['nord', 'nord-est', 'est', 'sud-est', 'sud', 'sud-ouest', 'ouest', 'nord-ouest'] as const
export const compassWord = (deg: number) => COMPASS_POINTS[Math.round(normDeg(deg) / 45) % 8]

/** Cap de la première photo d'un tour fait sans boussole : l'ordre des photos suffit, le nord est inconnu. */
export const MANUAL_START_DEG = 0

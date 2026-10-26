// Simulation d'ensoleillement direct : position du soleil (suncalc) + lancer de rayon
// vers les obstacles (bâtiments extrudés, couronnes d'arbres). Le relief est ignoré.
import SunCalc from 'suncalc'
import type { Garden, Plant, Species, XY } from '../types'
import { plantSizeAt } from './growth'

/** Arbre voisin mesuré (LiDAR) : position locale (m), hauteur et rayon de houppier (m). Voir src/lib/lidar.ts. */
export interface NeighborTree {
  x: number
  y: number
  heightM: number
  radiusM: number
}

const DEG = Math.PI / 180
/** Hauteur minimale du soleil pour compter de l'ensoleillement direct (°). */
const MIN_ALTITUDE_DEG = 2
/** Les plantes plus basses ne projettent pas d'ombre significative. */
const MIN_PLANT_HEIGHT_M = 1.5

export type Vec3 = { x: number; y: number; z: number }

export type Obstacle =
  | { kind: 'prism'; ring: XY[]; heightM: number }
  | { kind: 'crown'; center: XY; baseM: number; topM: number; radiusM: number }

/**
 * Direction du soleil. Repère local : x = est, y = nord, z = haut.
 * altitude en degrés au-dessus de l'horizon, azimut en degrés depuis le nord, sens horaire
 * (90 = est, 180 = sud). suncalc donne l'azimut depuis le sud, positif vers l'ouest : on convertit.
 */
export function sunDirection(
  date: Date,
  lat: number,
  lon: number,
): { altitude: number; azimuth: number; vector: Vec3 } {
  const pos = SunCalc.getPosition(date, lat, lon)
  const alt = pos.altitude
  const az = pos.azimuth // 0 = sud, +π/2 = ouest
  const cosAlt = Math.cos(alt)
  const vector = { x: -cosAlt * Math.sin(az), y: -cosAlt * Math.cos(az), z: Math.sin(alt) }
  let azimuth = (az / DEG + 180) % 360
  if (azimuth < 0) azimuth += 360
  return { altitude: alt / DEG, azimuth, vector }
}

/** Arbres mesurés par LiDAR → couronnes ellipsoïdales (même modèle que les plantes). Entrées invalides ignorées. */
export function treeObstacles(trees: NeighborTree[] | undefined): Obstacle[] {
  const out: Obstacle[] = []
  for (const t of trees ?? []) {
    if (![t.x, t.y, t.heightM, t.radiusM].every(Number.isFinite) || t.heightM <= MIN_PLANT_HEIGHT_M || t.radiusM <= 0) continue
    out.push({
      kind: 'crown',
      center: { x: t.x, y: t.y },
      baseM: t.heightM * 0.35,
      topM: t.heightM,
      radiusM: Math.max(0.3, t.radiusM),
    })
  }
  return out
}

/**
 * Bâtiments (prismes) + plantes en place de plus de 1,5 m (couronnes ellipsoïdales)
 * + arbres voisins mesurés par LiDAR (facultatif : sans eux, comportement inchangé).
 */
export function obstaclesFor(
  garden: Garden,
  plants: Plant[],
  speciesById: Record<string, Species>,
  at: Date,
  neighborTrees?: NeighborTree[],
): Obstacle[] {
  const out: Obstacle[] = []
  for (const b of garden.buildings ?? []) {
    if (b.ring.length >= 3 && b.heightM > 0) out.push({ kind: 'prism', ring: b.ring, heightM: b.heightM })
  }
  for (const p of plants) {
    if (p.status !== 'en-place' && p.status !== 'malade') continue
    const sp = speciesById[p.speciesId]
    if (!sp) continue
    const { heightM, spreadM } = plantSizeAt(p, sp, at)
    if (heightM <= MIN_PLANT_HEIGHT_M) continue
    out.push({
      kind: 'crown',
      center: p.position,
      baseM: heightM * 0.35,
      topM: heightM,
      radiusM: Math.max(0.3, spreadM / 2),
    })
  }
  out.push(...treeObstacles(neighborTrees))
  return out
}

// ---------- Obstacles préparés (boîte englobante, pré-filtre rapide) ----------

interface Prepared {
  o: Obstacle
  cx: number
  cy: number
  /** Rayon du cercle englobant au sol. */
  r: number
  maxZ: number
}

const preparedCache = new WeakMap<Obstacle[], Prepared[]>()

function prepare(obstacles: Obstacle[]): Prepared[] {
  const cached = preparedCache.get(obstacles)
  if (cached) return cached
  const out: Prepared[] = obstacles.map((o) => {
    if (o.kind === 'crown') return { o, cx: o.center.x, cy: o.center.y, r: o.radiusM, maxZ: o.topM }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const p of o.ring) {
      if (p.x < minX) minX = p.x
      if (p.x > maxX) maxX = p.x
      if (p.y < minY) minY = p.y
      if (p.y > maxY) maxY = p.y
    }
    const cx = (minX + maxX) / 2
    const cy = (minY + maxY) / 2
    let r = 0
    for (const p of o.ring) r = Math.max(r, Math.hypot(p.x - cx, p.y - cy))
    return { o, cx, cy, r, maxZ: o.heightM }
  })
  preparedCache.set(obstacles, out)
  return out
}

/** Données du rayon solaire dérivées une fois par pas de temps. */
interface Ray {
  v: Vec3
  /** Direction horizontale unitaire vers le soleil. */
  ux: number
  uy: number
  /** Montée du rayon par mètre horizontal. */
  tanAlt: number
}

function makeRay(v: Vec3): Ray {
  const hn = Math.hypot(v.x, v.y)
  if (hn < 1e-9) return { v, ux: 0, uy: 0, tanAlt: Infinity }
  return { v, ux: v.x / hn, uy: v.y / hn, tanAlt: v.z / hn }
}

/** Le rayon partant de (px, py, pz) vers le soleil peut-il toucher cet obstacle ? (test grossier) */
function mayHit(px: number, py: number, pz: number, ray: Ray, ob: Prepared): boolean {
  if (ob.maxZ <= pz) return false
  const wx = ob.cx - px
  const wy = ob.cy - py
  if (ray.tanAlt === Infinity) return wx * wx + wy * wy <= ob.r * ob.r
  const along = wx * ray.ux + wy * ray.uy
  if (along < -ob.r) return false // derrière le point par rapport au soleil
  const perp = Math.abs(wx * ray.uy - wy * ray.ux)
  if (perp > ob.r) return false
  const reach = (ob.maxZ - pz) / ray.tanAlt // distance au-delà de laquelle le rayon passe au-dessus
  return along - ob.r <= reach
}

function hitPrism(px: number, py: number, pz: number, ray: Ray, ring: XY[], h: number): boolean {
  let sMin = Infinity
  let crossings = 0
  for (let i = 0, n = ring.length; i < n; i++) {
    const a = ring[i]
    const b = ring[(i + 1) % n]
    const ex = b.x - a.x
    const ey = b.y - a.y
    const denom = ray.ux * ey - ray.uy * ex
    if (Math.abs(denom) < 1e-12) continue
    const apx = a.x - px
    const apy = a.y - py
    const s = (apx * ey - apy * ex) / denom
    const t = (apx * ray.uy - apy * ray.ux) / denom
    if (t < 0 || t >= 1 || s <= 1e-9) continue
    crossings++
    if (s < sMin) sMin = s
  }
  if (crossings === 0) return false
  if (crossings % 2 === 1) return pz < h // point à l'intérieur de l'emprise
  return pz + sMin * ray.tanAlt < h
}

function hitCrown(
  px: number,
  py: number,
  pz: number,
  v: Vec3,
  c: { center: XY; baseM: number; topM: number; radiusM: number },
): boolean {
  const r = c.radiusM
  const half = Math.max(0.05, (c.topM - c.baseM) / 2)
  const k = r / half // on aplatit l'ellipsoïde en sphère de rayon r
  const ox = px - c.center.x
  const oy = py - c.center.y
  const oz = (pz - (c.baseM + half)) * k
  const dz = v.z * k
  const a = v.x * v.x + v.y * v.y + dz * dz
  const b = 2 * (ox * v.x + oy * v.y + oz * dz)
  const cc = ox * ox + oy * oy + oz * oz - r * r
  const disc = b * b - 4 * a * cc
  if (disc < 0) return false
  return (-b + Math.sqrt(disc)) / (2 * a) > 0
}

function shadedBy(px: number, py: number, pz: number, ray: Ray, list: Prepared[]): boolean {
  for (const ob of list) {
    if (!mayHit(px, py, pz, ray, ob)) continue
    const o = ob.o
    if (o.kind === 'prism' ? hitPrism(px, py, pz, ray, o.ring, o.heightM) : hitCrown(px, py, pz, ray.v, o)) return true
  }
  return false
}

/** Le point est-il à l'ombre pour ce vecteur soleil ? (soleil sous l'horizon = ombre) */
export function isShaded(point: XY & { z?: number }, sunVec: Vec3, obstacles: Obstacle[]): boolean {
  if (sunVec.z <= 0) return true
  return shadedBy(point.x, point.y, point.z ?? 0, makeRay(sunVec), prepare(obstacles))
}

// ---------- Heures d'ensoleillement ----------

/** Rayons solaires du jour (soleil > 2°), échantillonnés au milieu de chaque pas. */
function daySteps(date: Date, lat: number, lon: number, stepMin: number): Ray[] {
  // Midi local du jour civil de `date`, puis midi solaire le plus proche.
  const localNoon = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12)
  const noon = SunCalc.getTimes(localNoon, lat, lon).solarNoon.getTime()
  const stepMs = stepMin * 60000
  const start = noon - 12 * 3600000
  const n = Math.round((24 * 60) / stepMin)
  const rays: Ray[] = []
  for (let i = 0; i < n; i++) {
    const s = sunDirection(new Date(start + (i + 0.5) * stepMs), lat, lon)
    if (s.altitude > MIN_ALTITUDE_DEG) rays.push(makeRay(s.vector))
  }
  return rays
}

/** Obstacles dont l'ombre (au sol) peut atteindre la zone [minX,maxX]×[minY,maxY]. */
function filterForZone(list: Prepared[], ray: Ray, minX: number, minY: number, maxX: number, maxY: number): Prepared[] {
  return list.filter((ob) => {
    const len = ray.tanAlt === Infinity ? 0 : ob.maxZ / ray.tanAlt
    const ex = ob.cx - ray.ux * len
    const ey = ob.cy - ray.uy * len
    return (
      Math.max(ob.cx, ex) + ob.r >= minX &&
      Math.min(ob.cx, ex) - ob.r <= maxX &&
      Math.max(ob.cy, ey) + ob.r >= minY &&
      Math.min(ob.cy, ey) - ob.r <= maxY
    )
  })
}

function sunHoursForPoints(points: XY[], garden: Garden, obstacles: Obstacle[], date: Date, stepMin: number): number[] {
  const rays = daySteps(date, garden.center.lat, garden.center.lon, stepMin)
  const prepared = prepare(obstacles)
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const p of points) {
    minX = Math.min(minX, p.x)
    maxX = Math.max(maxX, p.x)
    minY = Math.min(minY, p.y)
    maxY = Math.max(maxY, p.y)
  }
  const counts = new Array<number>(points.length).fill(0)
  for (const ray of rays) {
    const near = filterForZone(prepared, ray, minX, minY, maxX, maxY)
    for (let i = 0; i < points.length; i++) {
      if (!shadedBy(points[i].x, points[i].y, 0, ray, near)) counts[i]++
    }
  }
  const h = stepMin / 60
  return counts.map((c) => Math.round(c * h * 100) / 100)
}

/** Heures d'ensoleillement direct au sol ce jour-là (relief ignoré). */
export function sunHoursAt(point: XY, garden: Garden, obstacles: Obstacle[], date: Date, stepMin = 20): number {
  return sunHoursForPoints([point], garden, obstacles, date, stepMin)[0]
}

/**
 * Grille d'heures d'ensoleillement couvrant [-halfSizeM, +halfSizeM] avec n points par côté.
 * Ordre des valeurs : lignes du sud vers le nord, chaque ligne d'ouest en est (comme TerrainGrid).
 */
export function sunHoursGrid(
  garden: Garden,
  obstacles: Obstacle[],
  date: Date,
  opts: { halfSizeM: number; n: number; stepMin?: number },
): { halfSizeM: number; n: number; values: number[] } {
  const { halfSizeM, n } = opts
  const step = n > 1 ? (2 * halfSizeM) / (n - 1) : 0
  const points: XY[] = []
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) points.push({ x: -halfSizeM + i * step, y: -halfSizeM + j * step })
  }
  return { halfSizeM, n, values: sunHoursForPoints(points, garden, obstacles, date, opts.stepMin ?? 20) }
}

/**
 * Ensoleillement aux 21 mars, 21 juin et 21 décembre de l'année donnée (année courante par défaut).
 * La moyenne pondère mars deux fois (il représente aussi l'équinoxe d'automne).
 */
export function seasonalSunHours(
  point: XY,
  garden: Garden,
  obstacles: Obstacle[],
  year = new Date().getFullYear(),
): { mars: number; juin: number; decembre: number; moyenne: number } {
  const at = (m: number) => sunHoursAt(point, garden, obstacles, new Date(year, m, 21, 12))
  const mars = at(2)
  const juin = at(5)
  const decembre = at(11)
  const moyenne = Math.round(((2 * mars + juin + decembre) / 4) * 100) / 100
  return { mars, juin, decembre, moyenne }
}

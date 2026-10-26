// Position du soleil (SunCalc) et ambiance lumineuse associée.
import SunCalc from 'suncalc'
import * as THREE from 'three'
import type { LonLat } from '../../types'

export interface SunState {
  /** Altitude (degrés) au-dessus de l'horizon. */
  altitudeDeg: number
  /** Azimut géographique (degrés, 0 = nord, 90 = est). */
  azimuthDeg: number
  /** Vecteur unitaire vers le soleil, repère Three.js (X est, Y haut, Z = -nord). */
  dir: [number, number, number]
  /** 0 (nuit) → 1 (plein jour). */
  daylight: number
  /** Couleur du zénith. */
  sky: string
  /** Couleur de l'horizon (et de la brume) : plus claire et plus chaude que le zénith. */
  horizon: string
  light: string
}

// Dégradé adouci : le zénith reste bleu même au lever, c'est l'horizon qui se réchauffe.
const SKY_STOPS: [number, string][] = [
  [-12, '#0b1426'],
  [-4, '#1f2d52'],
  [1, '#5f6c9e'],
  [8, '#86a8d2'],
  [25, '#7fb0e2'],
  [50, '#6aa4dc'],
]
const HORIZON_STOPS: [number, string][] = [
  [-12, '#141d34'],
  [-4, '#3d466f'],
  [1, '#e8a487'],
  [8, '#efdcc6'],
  [25, '#d9e8f3'],
  [50, '#d0e4f2'],
]

function lerpStops(stops: [number, string][], v: number): string {
  if (v <= stops[0][0]) return stops[0][1]
  for (let i = 1; i < stops.length; i++) {
    if (v <= stops[i][0]) {
      const [a, ca] = stops[i - 1]
      const [b, cb] = stops[i]
      return '#' + new THREE.Color(ca).lerp(new THREE.Color(cb), (v - a) / (b - a)).getHexString()
    }
  }
  return stops[stops.length - 1][1]
}

function smoothstep(a: number, b: number, v: number) {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

export function sunState(date: Date, center: LonLat): SunState {
  // SunCalc : azimut mesuré depuis le SUD, positif vers l'OUEST.
  const p = SunCalc.getPosition(date, center.lat, center.lon)
  const alt = p.altitude
  const az = p.azimuth
  const c = Math.cos(alt)
  const east = -Math.sin(az) * c // az = +90° (ouest) → est = -1
  const north = -Math.cos(az) * c // az = 0 (sud) → nord = -1
  const up = Math.sin(alt)
  const altitudeDeg = (alt * 180) / Math.PI
  const azimuthDeg = (((az * 180) / Math.PI + 180) % 360 + 360) % 360
  return {
    altitudeDeg,
    azimuthDeg,
    dir: [east, up, -north],
    daylight: smoothstep(-2, 14, altitudeDeg),
    sky: lerpStops(SKY_STOPS, altitudeDeg),
    horizon: lerpStops(HORIZON_STOPS, altitudeDeg),
    light: lerpStops(
      [
        [0, '#ffb070'],
        [10, '#ffd9a8'],
        [30, '#fff4e2'],
      ],
      altitudeDeg,
    ),
  }
}

// ---------- Date et heure dans le fuseau du jardin ----------
// L'heure simulée est l'heure légale du jardin (Europe/Paris par défaut, heure d'été comprise),
// jamais celle du navigateur : un téléphone réglé sur un autre fuseau voit le même soleil.

export const GARDEN_TIME_ZONE = 'Europe/Paris'

export interface ZonedParts {
  year: number
  /** 1–12 */
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

const formatters = new Map<string, Intl.DateTimeFormat>()
function partsFormatter(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz)
  if (!f) {
    f = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    })
    formatters.set(tz, f)
  }
  return f
}

/** Composantes (année, mois, jour, heure…) d'un instant, lues dans le fuseau `tz`. */
export function zonedParts(date: Date, tz = GARDEN_TIME_ZONE): ZonedParts {
  const out: Record<string, number> = {}
  for (const p of partsFormatter(tz).formatToParts(date)) if (p.type !== 'literal') out[p.type] = Number(p.value)
  return { year: out.year, month: out.month, day: out.day, hour: out.hour % 24, minute: out.minute, second: out.second }
}

/** Décalage (ms) du fuseau `tz` par rapport à UTC à l'instant `ms` : heure murale − instant. */
function offsetAt(ms: number, tz: string): number {
  const p = zonedParts(new Date(ms), tz)
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ms / 1000) * 1000
}

/** Jour de l'année (1–366) pour une date du calendrier (mois de 1 à 12), sans fuseau. */
export function doyOf(year: number, month: number, day: number): number {
  return Math.round((Date.UTC(year, month - 1, day) - Date.UTC(year, 0, 1)) / 86400000) + 1
}

export function daysInYearOf(year: number): number {
  return doyOf(year, 12, 31)
}

/** Jour de l'année (1–366) d'un instant, lu dans le fuseau du jardin. */
export function dayOfYear(d: Date, tz = GARDEN_TIME_ZONE): number {
  const p = zonedParts(d, tz)
  return doyOf(p.year, p.month, p.day)
}

/**
 * Instant correspondant à l'heure légale « année, jour de l'année, heure décimale » dans le fuseau `tz`.
 * Un jour de l'année hors de 1–365/366 déborde sur l'année suivante ou précédente, comme `Date`.
 * Heure inexistante (saut de printemps) : on prend l'instant juste après le saut.
 */
export function dateFromDoy(year: number, doy: number, hour: number, tz = GARDEN_TIME_ZONE): Date {
  const h = Math.floor(hour)
  const m = Math.round((hour - h) * 60)
  const wall = Date.UTC(year, 0, doy, h, m)
  let t = wall - offsetAt(wall, tz)
  t = wall - offsetAt(t, tz)
  return new Date(t)
}

/** Mise en forme d'un instant dans le fuseau du jardin (français). */
export function formatInGarden(d: Date, opts: Intl.DateTimeFormatOptions, tz = GARDEN_TIME_ZONE): string {
  return d.toLocaleDateString('fr-FR', { ...opts, timeZone: tz })
}

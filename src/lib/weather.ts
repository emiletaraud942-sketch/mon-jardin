// Météo et climat via Open-Meteo (sans clé).
// ATTENTION LICENCE : l'API gratuite d'Open-Meteo est réservée à un usage NON COMMERCIAL
// (< 10 000 appels/jour, attribution « Weather data by Open-Meteo.com », données CC BY 4.0).
// Un usage commercial impose un abonnement (customer-api.open-meteo.com).
// Requêtes via /ext/meteo et /ext/meteo-archive (proxy Vite en dev, rewrites Vercel en prod).
// Ce module garde le cache, le re-découpage et le calcul du climat ; la source des données
// est un fournisseur interchangeable (src/lib/weatherProviders, choix par VITE_WEATHER_PROVIDER).
// PROPRIÉTAIRE : agent dev-cartographie-ign.
import type { LonLat, WeatherBundle } from '../types'
import { getProvider, roundCoord, todayLocal } from './weatherProviders'
import type { ArchiveDaily } from './weatherProviders'
import { parseForecast } from './weatherProviders/openMeteo'

export { parseForecast, todayLocal }
export { getProvider, getWeatherLicense } from './weatherProviders'

export interface ClimateSummary {
  years: number
  /**
   * Jour de l'année moyen de la dernière gelée de printemps, calculé sur les SEULES années où il a gelé
   * (biais : si certaines années n'ont pas gelé, la moyenne est un peu trop tardive).
   * null si aucune gelée n'a été observée sur la période.
   */
  lastFrostDoy: number | null
  /** Idem pour la première gelée d'automne (biais : un peu trop précoce). null si aucune gelée. */
  firstFrostDoy: number | null
  rainMmPerYear: number
  /** Mois le plus chaud (1–12), d'après la moyenne des maximales. */
  hottestMonth: number
  /** ex. "Rusticité USDA 8a", calculée sur la moyenne des minimales absolues annuelles. */
  zone: string
  /** Température la plus basse observée sur la période (°C). */
  minAbsC: number
}

const WEATHER_TTL = 3 * 3600 * 1000
const CLIMATE_TTL = 30 * 24 * 3600 * 1000

// ---------- cache localStorage (tolérant : navigation privée, Node…) ----------

interface CacheEntry<T> {
  /** Date d'écriture (ms). */
  t: number
  v: T
  /** Décalage UTC (s) du lieu au moment de la requête : sert à re-découper la météo selon la date locale. */
  off?: number
}

function cacheRead<T>(key: string): CacheEntry<T> | null {
  try {
    const raw = globalThis.localStorage?.getItem(key)
    if (!raw) return null
    const e = JSON.parse(raw) as CacheEntry<T>
    return e && typeof e.t === 'number' && e.v != null ? e : null
  } catch {
    return null
  }
}

function cacheGet<T>(key: string, ttl: number): T | null {
  const e = cacheRead<T>(key)
  return e && Date.now() - e.t < ttl ? e.v : null
}

function cacheSet(key: string, v: unknown, off?: number): void {
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify({ t: Date.now(), v, off }))
  } catch {
    /* quota ou stockage indisponible : on ignore */
  }
}

/** Clé de cache : fournisseur + coordonnées arrondies à 2 décimales (comme les requêtes). */
const coordKey = (p: LonLat, providerId: string) => {
  const q = roundCoord(p)
  return `${providerId}:${q.lat.toFixed(2)},${q.lon.toFixed(2)}`
}

// ---------- prévisions ----------

type Num = number | null

const PAST_DAYS = 7

/**
 * Re-découpe un bundle selon la date du jour : les jours écoulés passent de `forecast` à `past`
 * (7 jours au plus), pour que le bilan hydrique ne porte jamais sur 6 jours après minuit.
 */
export function resliceBundle(b: WeatherBundle, today: string): WeatherBundle {
  const all = [...b.past, ...b.forecast]
  return {
    ...b,
    past: all.filter((x) => x.date < today).slice(-PAST_DAYS),
    forecast: all.filter((x) => x.date >= today),
  }
}

/**
 * Météo du jardin. Cache localStorage de 3 h, re-découpé à la lecture selon la date locale du jardin.
 * Hors ligne ou service en panne : repli sur le cache expiré, marqué `stale: true` (`fetchedAt` = date des données).
 */
export async function fetchWeather(p: LonLat, now: Date = new Date()): Promise<WeatherBundle> {
  const provider = getProvider()
  const key = `pj-meteo:${coordKey(p, provider.id)}`
  const entry = cacheRead<WeatherBundle>(key)
  const fromCache = (stale: boolean): WeatherBundle => {
    const b = resliceBundle(entry!.v, todayLocal(entry!.off, now))
    return stale ? { ...b, stale: true } : b
  }
  if (entry && Date.now() - entry.t < WEATHER_TTL) return fromCache(false)
  try {
    const { bundle, utcOffsetSec } = await provider.fetchForecast(p, undefined, now)
    cacheSet(key, bundle, utcOffsetSec)
    return bundle
  } catch (e) {
    if (entry) return fromCache(true)
    throw e
  }
}

// ---------- climat (archives) ----------

interface ArchiveJson {
  daily?: { time: string[]; temperature_2m_min: Num[]; temperature_2m_max?: Num[]; precipitation_sum: Num[] }
}

/** Jour de l'année (1 = 1er janvier) d'une date YYYY-MM-DD. */
export function dateToDoy(date: string): number {
  const [y, m, d] = date.split('-').map(Number)
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 1)) / 86400000) + 1
}

/** Zone de rusticité USDA à partir de la minimale absolue moyenne (°C). */
export function usdaZone(minC: number): string {
  const f = (minC * 9) / 5 + 32
  const steps = Math.floor((f + 60) / 5) // demi-zones de 5 °F depuis -60 °F (1a)
  const clamped = Math.max(0, Math.min(25, steps))
  const zone = Math.floor(clamped / 2) + 1
  return `Rusticité USDA ${zone}${clamped % 2 === 0 ? 'a' : 'b'}`
}

export function computeClimate(json: ArchiveJson): ClimateSummary {
  const d = json.daily
  if (!d?.time?.length) throw new Error('Réponse climatique inattendue.')
  interface Y {
    lastSpring?: number
    firstAutumn?: number
    min: number
    rain: number
    days: number
  }
  const byYear = new Map<number, Y>()
  const monthMax = Array.from({ length: 12 }, () => ({ s: 0, c: 0 }))
  const monthMin = Array.from({ length: 12 }, () => ({ s: 0, c: 0 }))
  d.time.forEach((date, i) => {
    const year = Number(date.slice(0, 4))
    const month = Number(date.slice(5, 7))
    const y = byYear.get(year) ?? { min: Infinity, rain: 0, days: 0 }
    byYear.set(year, y)
    const tMin = d.temperature_2m_min?.[i]
    const tMax = d.temperature_2m_max?.[i]
    const rain = d.precipitation_sum?.[i]
    if (rain != null) y.rain += rain
    if (tMax != null) {
      monthMax[month - 1].s += tMax
      monthMax[month - 1].c++
    }
    if (tMin == null) return
    y.days++
    monthMin[month - 1].s += tMin
    monthMin[month - 1].c++
    y.min = Math.min(y.min, tMin)
    if (tMin <= 0) {
      const doy = dateToDoy(date)
      if (month < 7) y.lastSpring = doy
      else if (y.firstAutumn == null) y.firstAutumn = doy
    }
  })
  const years = [...byYear.values()].filter((y) => y.days > 300)
  if (!years.length) throw new Error('Historique climatique insuffisant pour ce lieu.')
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
  const springs = years.map((y) => y.lastSpring).filter((x): x is number => x != null)
  const autumns = years.map((y) => y.firstAutumn).filter((x): x is number => x != null)
  const monthly = monthMax.some((m) => m.c) ? monthMax : monthMin
  let hottestMonth = 1
  monthly.forEach((m, i) => {
    const best = monthly[hottestMonth - 1]
    if (m.c && (!best.c || m.s / m.c > best.s / best.c)) hottestMonth = i + 1
  })
  return {
    years: years.length,
    lastFrostDoy: springs.length ? Math.round(mean(springs)) : null,
    firstFrostDoy: autumns.length ? Math.round(mean(autumns)) : null,
    rainMmPerYear: Math.round(mean(years.map((y) => y.rain))),
    hottestMonth,
    zone: usdaZone(mean(years.map((y) => y.min))),
    minAbsC: Math.min(...years.map((y) => y.min)),
  }
}

/** Historique neutre d'un fournisseur → format de `computeClimate`. */
function archiveToJson(days: ArchiveDaily[]): ArchiveJson {
  return {
    daily: {
      time: days.map((d) => d.date),
      temperature_2m_min: days.map((d) => d.tMin),
      temperature_2m_max: days.map((d) => d.tMax),
      precipitation_sum: days.map((d) => d.rainMm),
    },
  }
}

export async function fetchClimate(p: LonLat): Promise<ClimateSummary> {
  const provider = getProvider()
  const key = `pj-climat:${coordKey(p, provider.id)}`
  const cached = cacheGet<ClimateSummary>(key, CLIMATE_TTL)
  if (cached) return cached
  const summary = computeClimate(archiveToJson(await provider.fetchArchive(p, 5)))
  cacheSet(key, summary)
  return summary
}

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']

/** Jour de l'année → libellé, ex. 102 → "12 avril" (année non bissextile). */
export function doyToLabel(doy: number): string {
  const n = Math.max(1, Math.min(365, Math.round(doy)))
  const d = new Date(Date.UTC(2023, 0, n))
  const day = d.getUTCDate()
  return `${day === 1 ? '1er' : day} ${MOIS[d.getUTCMonth()]}`
}

// Fournisseur Open-Meteo (sans clé), via /ext/meteo et /ext/meteo-archive.
// ATTENTION LICENCE : l'API gratuite est réservée à un usage NON COMMERCIAL
// (< 10 000 appels/jour, attribution « Weather data by Open-Meteo.com », données CC BY 4.0).
// Un usage commercial impose un abonnement (customer-api.open-meteo.com).
import type { DailyWeather, LonLat, WeatherBundle } from '../../types'
import { fetchJson } from '../http'
import { isoDate } from '../dates'
import { roundCoord, todayLocal } from './common'
import type { ArchiveDaily, ForecastResult, WeatherProvider } from './types'

const RETRY_DELAY_MS = 600

/** Erreur réseau ou 5xx/429 (messages de `fetchJson`) : un nouvel essai a une chance de réussir. */
function isRetryable(e: unknown): boolean {
  if (!(e instanceof Error) || e.name === 'AbortError') return false
  return e.message.startsWith('Connexion impossible') || /\((429|5\d\d)\)/.test(e.message)
}

/** GET JSON Open-Meteo : délai de 15 s, un seul réessai après 600 ms (appel idempotent). */
async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const call = () => fetchJson<T>(url, { service: 'Open-Meteo', timeoutMs: 15000, signal })
  try {
    return await call()
  } catch (e) {
    if (!isRetryable(e)) throw e
    await new Promise((r) => setTimeout(r, RETRY_DELAY_MS))
    return call()
  }
}

type Num = number | null
export interface ForecastJson {
  /** Fournis par Open-Meteo avec timezone=auto. */
  timezone?: string
  utc_offset_seconds?: number
  daily?: {
    time: string[]
    temperature_2m_max: Num[]
    temperature_2m_min: Num[]
    precipitation_sum: Num[]
    et0_fao_evapotranspiration: Num[]
    /** Rafales maximales (km/h). Optionnel : absent d'une réponse ancienne ou d'un cache d'avant la v4A. */
    wind_gusts_10m_max?: Num[]
  }
}

export function parseForecast(json: ForecastJson, today: string, fetchedAt = new Date().toISOString()): WeatherBundle {
  const d = json.daily
  if (!d?.time?.length) throw new Error('Réponse météo inattendue.')
  const days: DailyWeather[] = []
  d.time.forEach((date, i) => {
    const tMin = d.temperature_2m_min?.[i]
    const tMax = d.temperature_2m_max?.[i]
    if (tMin == null || tMax == null) return
    const gust = d.wind_gusts_10m_max?.[i]
    days.push({
      date,
      tMin,
      tMax,
      rainMm: d.precipitation_sum?.[i] ?? 0,
      et0Mm: d.et0_fao_evapotranspiration?.[i] ?? 0,
      // Valeur manquante : on ne met pas 0 (ce serait « pas de vent »), on laisse le champ absent.
      ...(typeof gust === 'number' && Number.isFinite(gust) && gust >= 0 ? { gustKmh: gust } : {}),
    })
  })
  return {
    fetchedAt,
    past: days.filter((x) => x.date < today),
    forecast: days.filter((x) => x.date >= today),
  }
}

interface ArchiveJson {
  daily?: { time: string[]; temperature_2m_min: Num[]; temperature_2m_max?: Num[]; precipitation_sum: Num[] }
}

export const openMeteo: WeatherProvider = {
  id: 'open-meteo',
  label: 'Open-Meteo',
  license: {
    commercialUse: false,
    attribution: 'Météo : Open-Meteo (CC BY 4.0, usage non commercial)',
    url: 'https://open-meteo.com/en/license',
  },

  async fetchForecast(p: LonLat, signal?: AbortSignal, now: Date = new Date()): Promise<ForecastResult> {
    const q = roundCoord(p)
    const url =
      `/ext/meteo/v1/forecast?latitude=${q.lat.toFixed(2)}&longitude=${q.lon.toFixed(2)}` +
      '&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,et0_fao_evapotranspiration,wind_gusts_10m_max' +
      '&wind_speed_unit=kmh&past_days=7&forecast_days=7&timezone=auto'
    const json = await getJson<ForecastJson>(url, signal)
    const utcOffsetSec = typeof json.utc_offset_seconds === 'number' ? json.utc_offset_seconds : undefined
    return { bundle: parseForecast(json, todayLocal(utcOffsetSec, now), now.toISOString()), utcOffsetSec }
  },

  async fetchArchive(p: LonLat, years: number, signal?: AbortSignal): Promise<ArchiveDaily[]> {
    const q = roundCoord(p)
    const lastYear = Number(isoDate().slice(0, 4)) - 1
    const url =
      `/ext/meteo-archive/v1/archive?latitude=${q.lat.toFixed(2)}&longitude=${q.lon.toFixed(2)}` +
      `&start_date=${lastYear - (years - 1)}-01-01&end_date=${lastYear}-12-31` +
      '&daily=temperature_2m_min,temperature_2m_max,precipitation_sum&timezone=auto'
    const d = (await getJson<ArchiveJson>(url, signal)).daily
    if (!d?.time?.length) throw new Error('Réponse climatique inattendue.')
    return d.time.map((date, i) => ({
      date,
      tMin: d.temperature_2m_min?.[i] ?? null,
      tMax: d.temperature_2m_max?.[i] ?? null,
      rainMm: d.precipitation_sum?.[i] ?? null,
    }))
  },
}

import { afterEach, describe, expect, it, vi } from 'vitest'
import { computeClimate, dateToDoy, doyToLabel, fetchClimate, fetchWeather, parseForecast, resliceBundle, todayLocal, usdaZone } from './weather'

// Réponse réelle Open-Meteo (Nantes, 17/10/2026), sans les métadonnées.
const FORECAST = {
  latitude: 47.23,
  longitude: -1.5300007,
  timezone: 'Europe/Paris',
  utc_offset_seconds: 7200,
  daily: {
    time: ['2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16',
      '2026-10-17', '2026-10-18', '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23'],
    temperature_2m_max: [18.2, 18.8, 19.6, 22.3, 23.4, 26.6, 20.3, 16.8, 15.6, 15.5, 16.8, 14.3, 16.7, 14.8],
    temperature_2m_min: [12.0, 8.6, 13.7, 17.3, 12.3, 13.3, 11.5, 8.4, 7.2, 3.0, 5.2, 8.9, 8.9, 9.3],
    precipitation_sum: [0.7, 0.0, 3.0, 0.5, 0.0, 0.0, 2.3, 0.0, 0.9, 0.0, 0.1, 7.0, 6.4, 11.3],
    et0_fao_evapotranspiration: [2.11, 1.7, 0.57, 1.59, 1.68, 2.36, 1.15, 2.54, 1.63, 1.95, 2.11, 1.8, 1.52, 2.3],
  },
}

/** Même réponse avec les rafales (champ ajouté en v4A) : 25 km/h partout, 64,4 le 17 octobre, une valeur manquante le 18. */
const GUSTS = [25, 25, 25, 25, 25, 25, 25, 64.4, null, 25, 25, 25, 25, 25]
const WITH_GUSTS = { ...FORECAST, daily: { ...FORECAST.daily, wind_gusts_10m_max: GUSTS } }

// Extrait réel de l'archive (Nantes, 14–20/02/2025).
const ARCHIVE_SNIPPET = {
  daily: {
    time: ['2025-02-14', '2025-02-15', '2025-02-16', '2025-02-17', '2025-02-18', '2025-02-19', '2025-02-20'],
    temperature_2m_min: [4.5, 1.8, 0.5, 2.1, 3.1, 7.1, 8.5],
    temperature_2m_max: [8.9, 10.4, 8.9, 12.4, 12.4, 15.8, 15.6],
    precipitation_sum: [3.4, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
  },
}

/** Archive synthétique : gelée le dernier jour indiqué au printemps et le premier à l'automne. */
function synthArchive(years: { y: number; spring: string; autumn: string; min: number }[]) {
  const time: string[] = []
  const tmin: (number | null)[] = []
  const tmax: number[] = []
  const rain: number[] = []
  for (const { y, spring, autumn, min } of years) {
    for (let t = Date.UTC(y, 0, 1); t <= Date.UTC(y, 11, 31); t += 86400000) {
      const date = new Date(t).toISOString().slice(0, 10)
      time.push(date)
      const m = Number(date.slice(5, 7))
      tmin.push(date === spring ? min : date === autumn ? -1 : 5)
      tmax.push(m === 8 ? 28 : 15)
      rain.push(2)
    }
  }
  return { daily: { time, temperature_2m_min: tmin, temperature_2m_max: tmax, precipitation_sum: rain } }
}

/** localStorage minimal pour Node. */
function stubStorage() {
  const m = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  })
  return m
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('prévisions', () => {
  it('sépare passé et prévisions autour d’aujourd’hui', () => {
    const b = parseForecast(FORECAST, '2026-10-17', 'X')
    expect(b.fetchedAt).toBe('X')
    expect(b.past).toHaveLength(7)
    expect(b.forecast).toHaveLength(7)
    // Réponse sans rafales (ancienne, ou cache d'avant la v4A) : le champ reste absent, pas 0.
    expect(b.forecast[0]).toEqual({ date: '2026-10-17', tMin: 8.4, tMax: 16.8, rainMm: 0, et0Mm: 2.54 })
    expect('gustKmh' in b.forecast[0]).toBe(false)
    expect(b.past[6].date).toBe('2026-10-16')
  })

  it('lit les rafales ; une valeur manquante laisse le champ absent', () => {
    const b = parseForecast(WITH_GUSTS, '2026-10-17', 'X')
    expect(b.forecast[0].gustKmh).toBe(64.4)
    expect(b.forecast[1].date).toBe('2026-10-18')
    expect('gustKmh' in b.forecast[1]).toBe(false)
    expect(b.forecast[2].gustKmh).toBe(25)
    expect(b.past[0].gustKmh).toBe(25)
  })

  it('rafales négatives ou non numériques : ignorées', () => {
    const json = { daily: { ...FORECAST.daily, wind_gusts_10m_max: [-3, ...Array(13).fill('fort')] } }
    const b = parseForecast(json as never, '2026-10-17', 'X')
    expect([...b.past, ...b.forecast].every((d) => !('gustKmh' in d))).toBe(true)
  })

  it('ignore les jours sans température', () => {
    const json = { daily: { ...FORECAST.daily, temperature_2m_min: [null, ...FORECAST.daily.temperature_2m_min.slice(1)] } }
    expect(parseForecast(json, '2026-10-17').past).toHaveLength(6)
  })

  it('fetchWeather appelle le proxy avec les bons paramètres', async () => {
    const calls: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (u: string) => (calls.push(u), new Response(JSON.stringify(FORECAST)))))
    const b = await fetchWeather({ lon: -1.5308, lat: 47.2257 }, new Date('2026-10-17T10:00:00Z'))
    expect(b.past.length + b.forecast.length).toBe(14)
    expect(b.forecast[0].date).toBe('2026-10-17')
    expect(b.stale).toBeUndefined()
    expect(calls[0]).toMatch(/^\/ext\/meteo\/v1\/forecast\?latitude=47\.23&longitude=-1\.53/)
    expect(calls[0]).toContain('daily=temperature_2m_max,temperature_2m_min,precipitation_sum,et0_fao_evapotranspiration,wind_gusts_10m_max')
    expect(calls[0]).toContain('wind_speed_unit=kmh&past_days=7&forecast_days=7&timezone=auto')
  })

  it('erreur HTTP en français', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: true, reason: 'Latitude invalide' }), { status: 400 })))
    await expect(fetchWeather({ lon: 0, lat: 999 })).rejects.toThrow(/Open-Meteo.*400/)
  })

  it('réessaie une fois sur 5xx puis réussit', async () => {
    let n = 0
    vi.stubGlobal('fetch', vi.fn(async () => (++n === 1 ? new Response('', { status: 502 }) : new Response(JSON.stringify(FORECAST)))))
    const b = await fetchWeather({ lon: 5, lat: 45 }, new Date('2026-10-17T10:00:00Z'))
    expect(n).toBe(2)
    expect(b.forecast).toHaveLength(7)
  })

  it('todayLocal suit le décalage du lieu', () => {
    const now = new Date('2026-10-17T23:30:00Z')
    expect(todayLocal(7200, now)).toBe('2026-10-18') // Paris (été)
    expect(todayLocal(-4 * 3600, now)).toBe('2026-10-17') // Guadeloupe
    expect(todayLocal(12 * 3600, now)).toBe('2026-10-18') // Nouvelle-Calédonie : +11 h
  })

  it('resliceBundle : les jours écoulés passent dans past (7 jours max)', () => {
    const b = parseForecast(FORECAST, '2026-10-17', 'X')
    const next = resliceBundle(b, '2026-10-18')
    expect(next.past).toHaveLength(7)
    expect(next.past[0].date).toBe('2026-10-11')
    expect(next.past[6].date).toBe('2026-10-17')
    expect(next.forecast).toHaveLength(6)
    expect(next.forecast[0].date).toBe('2026-10-18')
    expect(next.fetchedAt).toBe('X')
  })

  it('cache : re-découpé à la lecture selon la date du jour, sans nouvel appel', async () => {
    stubStorage()
    const f = vi.fn(async () => new Response(JSON.stringify(FORECAST)))
    vi.stubGlobal('fetch', f)
    const p = { lon: -1.5308, lat: 47.2257 }
    const a = await fetchWeather(p, new Date('2026-10-17T10:00:00Z'))
    expect(a.forecast[0].date).toBe('2026-10-17')
    const b = await fetchWeather(p, new Date('2026-10-18T09:00:00Z')) // le lendemain, dans le TTL
    expect(f).toHaveBeenCalledTimes(1)
    expect(b.forecast[0].date).toBe('2026-10-18')
    expect(b.past).toHaveLength(7)
    expect(b.past[6].date).toBe('2026-10-17')
    expect(b.stale).toBeUndefined()
  })

  it('cache : les rafales survivent au re-découpage ; un ancien cache sans rafales se lit sans erreur', async () => {
    const m = stubStorage()
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(WITH_GUSTS))))
    const p = { lon: -1.5308, lat: 47.2257 }
    const a = await fetchWeather(p, new Date('2026-10-17T10:00:00Z'))
    expect(a.forecast[0].gustKmh).toBe(64.4)
    const b = await fetchWeather(p, new Date('2026-10-18T09:00:00Z'))
    expect(b.past.at(-1)?.gustKmh).toBe(64.4)
    // Entrée écrite par la version précédente (sans gustKmh) : lue telle quelle.
    m.clear()
    const old = parseForecast(FORECAST, '2026-10-17', 'X')
    const [key] = [`pj-meteo:open-meteo:47.23,-1.53`]
    m.set(key, JSON.stringify({ t: Date.now(), v: old, off: 7200 }))
    const f = vi.fn()
    vi.stubGlobal('fetch', f)
    const c = await fetchWeather(p, new Date('2026-10-17T10:00:00Z'))
    expect(f).not.toHaveBeenCalled()
    expect(c.forecast).toHaveLength(7)
    expect(c.forecast.every((d) => d.gustKmh === undefined)).toBe(true)
  })

  it('cache expiré + réseau en panne : repli stale avec fetchedAt d’origine', async () => {
    stubStorage()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-17T10:00:00Z'))
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(FORECAST))))
    const p = { lon: -1.5308, lat: 47.2257 }
    const a = await fetchWeather(p)
    vi.setSystemTime(new Date('2026-10-17T15:00:00Z')) // > 3 h
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline') }))
    const b = await fetchWeather(p)
    expect(b.stale).toBe(true)
    expect(b.fetchedAt).toBe(a.fetchedAt)
    expect(b.forecast[0].date).toBe('2026-10-17')
  })

  it('sans cache et réseau en panne : erreur en français', async () => {
    stubStorage()
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline') }))
    await expect(fetchWeather({ lon: 9, lat: 9 })).rejects.toThrow(/Connexion impossible/)
  })
})

describe('climat', () => {
  it('jour de l’année et libellé', () => {
    expect(dateToDoy('2025-01-01')).toBe(1)
    expect(dateToDoy('2025-04-12')).toBe(102)
    expect(doyToLabel(102)).toBe('12 avril')
    expect(doyToLabel(1)).toBe('1er janvier')
    expect(doyToLabel(365)).toBe('31 décembre')
  })

  it('zones USDA', () => {
    expect(usdaZone(-10)).toBe('Rusticité USDA 8a')
    expect(usdaZone(-7)).toBe('Rusticité USDA 8b')
    expect(usdaZone(-3)).toBe('Rusticité USDA 9b')
    expect(usdaZone(-20)).toBe('Rusticité USDA 6b')
  })

  it('moyennes de gelées, pluie, mois chaud', () => {
    const c = computeClimate(
      synthArchive([
        { y: 2023, spring: '2023-04-02', autumn: '2023-11-10', min: -8 },
        { y: 2024, spring: '2024-04-06', autumn: '2024-11-20', min: -12 },
      ]),
    )
    expect(c.years).toBe(2)
    expect(c.lastFrostDoy).toBe(Math.round((92 + 97) / 2))
    expect(c.firstFrostDoy).toBe(Math.round((314 + 325) / 2))
    expect(c.rainMmPerYear).toBe(Math.round((365 * 2 + 366 * 2) / 2))
    expect(c.hottestMonth).toBe(8)
    expect(c.minAbsC).toBe(-12)
    expect(c.zone).toBe('Rusticité USDA 8a') // moyenne -10 °C
  })

  it('gelées : moyenne sur les seules années avec gel, null si aucune', () => {
    // 2023 sans gel au printemps ni à l'automne (min toujours 5), 2024 avec gel.
    const noFrost = synthArchive([{ y: 2023, spring: '', autumn: '', min: 5 }])
    const withFrost = synthArchive([{ y: 2024, spring: '2024-04-06', autumn: '2024-11-20', min: -2 }])
    const mixed = {
      daily: {
        time: [...noFrost.daily.time, ...withFrost.daily.time],
        temperature_2m_min: [...noFrost.daily.temperature_2m_min, ...withFrost.daily.temperature_2m_min],
        temperature_2m_max: [...noFrost.daily.temperature_2m_max, ...withFrost.daily.temperature_2m_max],
        precipitation_sum: [...noFrost.daily.precipitation_sum, ...withFrost.daily.precipitation_sum],
      },
    }
    const m = computeClimate(mixed)
    expect(m.years).toBe(2)
    expect(m.lastFrostDoy).toBe(97) // pas de dilution par l'année sans gel
    expect(m.firstFrostDoy).toBe(325)
    const none = computeClimate(noFrost)
    expect(none.lastFrostDoy).toBeNull()
    expect(none.firstFrostDoy).toBeNull()
  })

  it('année incomplète (extrait réel) refusée', () => {
    expect(() => computeClimate(ARCHIVE_SNIPPET)).toThrow(/insuffisant/)
  })

  it('fetchClimate demande les 5 dernières années complètes', async () => {
    const calls: string[] = []
    const body = JSON.stringify(synthArchive([{ y: 2025, spring: '2025-03-01', autumn: '2025-12-01', min: -4 }]))
    vi.stubGlobal('fetch', vi.fn(async (u: string) => (calls.push(u), new Response(body))))
    const c = await fetchClimate({ lon: -1.5308, lat: 47.2257 })
    expect(c.lastFrostDoy).toBe(60)
    const year = new Date().getFullYear()
    expect(calls[0]).toMatch(/^\/ext\/meteo-archive\/v1\/archive\?latitude=47\.23&longitude=-1\.53/)
    expect(calls[0]).toContain(`start_date=${year - 5}-01-01&end_date=${year - 1}-12-31`)
    expect(calls[0]).toContain('daily=temperature_2m_min,temperature_2m_max,precipitation_sum&timezone=auto')
  })
})

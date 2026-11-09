import { afterEach, describe, expect, it, vi } from 'vitest'
import { getProvider, getWeatherLicense, roundCoord } from './index'
import { fetchClimate, fetchWeather } from '../weather'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const FC = { utc_offset_seconds: 7200, daily: { time: ['2026-10-17'], temperature_2m_max: [16], temperature_2m_min: [8], precipitation_sum: [0], et0_fao_evapotranspiration: [2] } }

describe('sélection du fournisseur', () => {
  it('absente : open-meteo', () => {
    vi.stubEnv('VITE_WEATHER_PROVIDER', '')
    expect(getProvider().id).toBe('open-meteo')
  })
  it('valide : meteo-france', () => {
    vi.stubEnv('VITE_WEATHER_PROVIDER', 'meteo-france')
    expect(getProvider().id).toBe('meteo-france')
  })
  it('inconnue : repli open-meteo + avertissement', () => {
    const w = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.stubEnv('VITE_WEATHER_PROVIDER', 'inconnu')
    expect(getProvider().id).toBe('open-meteo')
    expect(w).toHaveBeenCalled()
    vi.stubEnv('VITE_WEATHER_PROVIDER', '__proto__')
    expect(getProvider().id).toBe('open-meteo')
  })
})

describe('arrondi des coordonnées', () => {
  it('2 décimales', () => {
    expect(roundCoord({ lon: -1.5308, lat: 47.2257 })).toEqual({ lon: -1.53, lat: 47.23 })
  })
  it('URL réelle de prévision et d’archive', async () => {
    const calls: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (u: string) => (calls.push(u), new Response(JSON.stringify(u.includes('archive') ? { daily: { time: [], temperature_2m_min: [], precipitation_sum: [] } } : FC)))))
    await fetchWeather({ lon: -1.5308, lat: 47.2257 }, new Date('2026-10-17T10:00:00Z'))
    await fetchClimate({ lon: -1.5308, lat: 47.2257 }).catch(() => {})
    expect(calls[0]).toContain('latitude=47.23&longitude=-1.53&')
    expect(calls[1]).toContain('latitude=47.23&longitude=-1.53&')
    expect(calls.join()).not.toContain('47.2257')
    // Rafales demandées sur la même route /ext/meteo (aucun nouveau domaine).
    expect(calls[0]).toMatch(/^\/ext\/meteo\/v1\/forecast\?/)
    expect(calls[0]).toContain('wind_gusts_10m_max')
  })
})

describe('licence', () => {
  it('Open-Meteo : non commerciale', () => {
    vi.stubEnv('VITE_WEATHER_PROVIDER', '')
    const l = getWeatherLicense()
    expect(l).toMatchObject({ id: 'open-meteo', label: 'Open-Meteo', commercialUse: false })
    expect(l.attribution).toContain('Open-Meteo')
    expect(l.url).toMatch(/^https:\/\//)
  })
  it('Météo-France : commercialUse true dans le registre', () => {
    vi.stubEnv('VITE_WEATHER_PROVIDER', 'meteo-france')
    expect(getWeatherLicense().commercialUse).toBe(true)
  })
})

describe('Météo-France non configuré', () => {
  it('erreur lisible, prévisions et climat', async () => {
    vi.stubEnv('VITE_WEATHER_PROVIDER', 'meteo-france')
    await expect(fetchWeather({ lon: 1, lat: 1 })).rejects.toThrow('Fournisseur Météo-France non configuré')
    await expect(fetchClimate({ lon: 1, lat: 1 })).rejects.toThrow('Fournisseur Météo-France non configuré')
  })
})

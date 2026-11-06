import { describe, expect, it, vi } from 'vitest'
import { fetchWeather } from '../../lib/weather'
import { canShare } from './useTasks'

describe('message d’erreur météo', () => {
  it('reste en français quand le fournisseur n’est pas configuré (ce que useTasks affiche en weatherError)', async () => {
    vi.stubEnv('VITE_WEATHER_PROVIDER', 'meteo-france')
    await expect(fetchWeather({ lon: 2, lat: 48 })).rejects.toThrow(/Fournisseur Météo-France non configuré/)
    vi.unstubAllEnvs()
  })
  it('reste en français hors ligne', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline') }))
    await expect(fetchWeather({ lon: 7.7, lat: 48.5 })).rejects.toThrow(/Connexion impossible/)
    vi.unstubAllGlobals()
  })
})

describe('partage des tâches', () => {
  it('réutilise le calcul de l’appli seulement pour le même jardin', () => {
    expect(canShare('g1', 'g1')).toBe(true)
    expect(canShare('g1', 'g2')).toBe(false)
  })
  it('jamais sans jardin', () => {
    expect(canShare(undefined, undefined)).toBe(false)
    expect(canShare('g1', undefined)).toBe(false)
  })
})

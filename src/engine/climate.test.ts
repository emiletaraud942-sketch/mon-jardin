import { describe, expect, it } from 'vitest'
import { climateSummary, isMetropolitan, zoneCode } from './climate'

describe('climateSummary', () => {
  it('zone et pluie arrondie à 10 mm', () => {
    expect(climateSummary({ climateZone: '8a', rainMmPerYear: 647 })).toBe('Votre jardin : zone 8a, environ 650 mm de pluie par an')
  })
  it('accepte la zone telle que la renvoie usdaZone (« Rusticité USDA 8a »)', () => {
    expect(climateSummary({ climateZone: 'Rusticité USDA 8a', rainMmPerYear: 650 })).toBe('Votre jardin : zone 8a, environ 650 mm de pluie par an')
  })
  it('milliers séparés par une espace insécable', () => {
    expect(climateSummary({ rainMmPerYear: 1243 })).toBe('Votre jardin : environ 1 240 mm de pluie par an')
  })
  it('une seule information, ou aucune', () => {
    expect(climateSummary({ climateZone: '7b' })).toBe('Votre jardin : zone 7b')
    expect(climateSummary({ climateZone: 'n’importe quoi', rainMmPerYear: -3 })).toBeUndefined()
    expect(climateSummary({})).toBeUndefined()
  })
  it('une pluie de 0 mm est une valeur valide', () => {
    expect(climateSummary({ rainMmPerYear: 0 })).toBe('Votre jardin : environ 0 mm de pluie par an')
  })
})

describe('zoneCode', () => {
  it('retire le préfixe, met en minuscules, refuse le reste', () => {
    expect(zoneCode('Rusticité USDA 9b')).toBe('9b')
    expect(zoneCode('10A')).toBe('10a')
    expect(zoneCode('zone 8')).toBeUndefined()
    expect(zoneCode(undefined)).toBeUndefined()
  })
})

describe('isMetropolitan', () => {
  const yes: [string, number, number][] = [
    ['Paris', 2.35, 48.85], ['Marseille', 5.37, 43.3], ['Brest', -4.49, 48.39], ['Lille', 3.06, 50.63], ['Strasbourg', 7.75, 48.58],
    ['Perpignan', 2.9, 42.7], ['Bayonne', -1.47, 43.49], ['Nice', 7.26, 43.7], ['Chamonix', 6.87, 45.92], ['Ajaccio', 8.74, 41.92],
    ['Bastia', 9.45, 42.7], ['Bordeaux', -0.58, 44.84], ['Dunkerque', 2.38, 51.03], ['Nantes', -1.55, 47.22], ['Lyon', 4.83, 45.76],
  ]
  const no: [string, number, number][] = [
    ['Madrid', -3.7, 40.42], ['Londres', -0.12, 51.5], ['Bruxelles', 4.35, 50.85], ['Barcelone', 2.17, 41.39], ['Turin', 7.68, 45.07],
    ['Luxembourg', 6.13, 49.61], ['Fort-de-France', -61.07, 14.6], ['Cayenne', -52.33, 4.94], ['Saint-Denis (Réunion)', 55.45, -20.88],
    ['Mamoudzou', 45.23, -12.78], ['Papeete', -149.57, -17.54], ['Bilbao', -2.93, 43.26], ['Francfort', 8.68, 50.11], ['Zurich', 8.54, 47.37],
  ]
  it.each(yes)('%s : métropole', (_n, lon, lat) => expect(isMetropolitan({ lon, lat })).toBe(true))
  it.each(no)('%s : hors métropole', (_n, lon, lat) => expect(isMetropolitan({ lon, lat })).toBe(false))
  it('coordonnées invalides', () => {
    expect(isMetropolitan({ lon: NaN, lat: 48 })).toBe(false)
  })
})

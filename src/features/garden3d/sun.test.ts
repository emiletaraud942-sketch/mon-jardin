import { describe, expect, it } from 'vitest'
import { GARDEN_TIME_ZONE, dateFromDoy, dayOfYear, doyOf, daysInYearOf, formatInGarden, sunState, zonedParts } from './sun'

// Ces tests doivent passer quel que soit le fuseau du processus :
//   TZ=America/New_York npx vitest run src/features/garden3d/sun
const PARIS = { lon: 2.35, lat: 48.85 }
const iso = (d: Date) => d.toISOString()

describe('heure simulée dans le fuseau du jardin', () => {
  it('le fuseau par défaut est Europe/Paris', () => {
    expect(GARDEN_TIME_ZONE).toBe('Europe/Paris')
  })

  it('21 juin 12 h légale (UTC+2) = 10 h UTC', () => {
    expect(iso(dateFromDoy(2025, doyOf(2025, 6, 21), 12))).toBe('2025-06-21T10:00:00.000Z')
  })

  it('21 décembre 12 h légale (UTC+1) = 11 h UTC', () => {
    expect(iso(dateFromDoy(2025, doyOf(2025, 12, 21), 12))).toBe('2025-12-21T11:00:00.000Z')
  })

  it('heure décimale : 14,25 = 14 h 15', () => {
    expect(iso(dateFromDoy(2025, doyOf(2025, 6, 21), 14.25))).toBe('2025-06-21T12:15:00.000Z')
  })

  it('suit le changement d’heure : 30 mars 2025 (passage à l’heure d’été à 2 h)', () => {
    expect(iso(dateFromDoy(2025, doyOf(2025, 3, 29), 12))).toBe('2025-03-29T11:00:00.000Z') // UTC+1
    expect(iso(dateFromDoy(2025, doyOf(2025, 3, 31), 12))).toBe('2025-03-31T10:00:00.000Z') // UTC+2
    expect(iso(dateFromDoy(2025, doyOf(2025, 3, 30), 5))).toBe('2025-03-30T03:00:00.000Z') // après le saut
  })

  it('l’heure inexistante (2 h 30 le 30 mars) ne plante pas', () => {
    const d = dateFromDoy(2025, doyOf(2025, 3, 30), 2.5)
    expect(Number.isFinite(d.getTime())).toBe(true)
    expect(zonedParts(d).day).toBe(30)
  })

  it('aller-retour : les composantes lues dans le fuseau du jardin sont celles demandées', () => {
    for (const [m, dd, h] of [[1, 1, 5], [3, 30, 12], [6, 21, 22], [10, 26, 9.5], [12, 31, 23]] as const) {
      const d = dateFromDoy(2025, doyOf(2025, m, dd), h)
      const p = zonedParts(d)
      expect([p.year, p.month, p.day]).toEqual([2025, m, dd])
      expect(p.hour + p.minute / 60).toBeCloseTo(h, 5)
    }
  })

  it('dayOfYear d’un instant se lit dans le fuseau du jardin', () => {
    // 21 juin 23 h 30 UTC = 22 juin 1 h 30 à Paris
    expect(dayOfYear(new Date('2025-06-21T23:30:00Z'))).toBe(doyOf(2025, 6, 22))
    // 21 juin 00 h 30 UTC = 21 juin 2 h 30 à Paris
    expect(dayOfYear(new Date('2025-06-21T00:30:00Z'))).toBe(doyOf(2025, 6, 21))
  })

  it('doyOf et daysInYearOf', () => {
    expect(doyOf(2025, 1, 1)).toBe(1)
    expect(doyOf(2025, 12, 31)).toBe(365)
    expect(doyOf(2024, 12, 31)).toBe(366)
    expect(daysInYearOf(2024)).toBe(366)
    expect(daysInYearOf(2025)).toBe(365)
  })

  it('formatInGarden : jour et mois dans le fuseau du jardin', () => {
    expect(formatInGarden(new Date('2025-06-21T23:30:00Z'), { day: 'numeric', month: 'long' })).toBe('22 juin')
  })

  it('le soleil de midi légal est plein sud, pas celui du fuseau de l’appareil', () => {
    // À Paris le 21 juin, midi solaire ≈ 13 h 50 légale : à 14 h le soleil est presque plein sud.
    const s = sunState(dateFromDoy(2025, doyOf(2025, 6, 21), 14), PARIS)
    expect(Math.abs(s.azimuthDeg - 180)).toBeLessThan(10)
    expect(s.altitudeDeg).toBeGreaterThan(60)
    // Avec l'heure légale de 14 h interprétée à New York (= 20 h Paris), le soleil serait bas à l'ouest-nord-ouest.
    const wrong = sunState(new Date('2025-06-21T14:00:00-04:00'), PARIS)
    expect(wrong.altitudeDeg).toBeLessThan(20)
  })

  it('ciel : horizon plus clair que le zénith de jour, dégradé continu (pas de saut au lever)', () => {
    const day = sunState(dateFromDoy(2025, doyOf(2025, 6, 21), 14), PARIS)
    const lum = (hex: string) => parseInt(hex.slice(1, 3), 16) + parseInt(hex.slice(3, 5), 16) + parseInt(hex.slice(5, 7), 16)
    expect(lum(day.horizon)).toBeGreaterThan(lum(day.sky))
    // d'un quart d'heure à l'autre autour du lever, la couleur change peu
    let prev = sunState(dateFromDoy(2025, doyOf(2025, 6, 21), 4), PARIS).horizon
    for (let h = 4.25; h <= 8; h += 0.25) {
      const cur = sunState(dateFromDoy(2025, doyOf(2025, 6, 21), h), PARIS).horizon
      expect(Math.abs(lum(cur) - lum(prev))).toBeLessThan(130)
      prev = cur
    }
  })
})

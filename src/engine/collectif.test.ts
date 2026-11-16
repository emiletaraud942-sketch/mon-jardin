import { describe, expect, it } from 'vitest'
import type { Geste } from '../types'
import { bilanAnnuel, bilanYears, compostStatus, daysBetween, GESTE_LABEL, GRID_MAX, gridPlots, HABITATS, MATURE_DAYS, plotAt } from './collectif'

const g = (date: string, type: Geste['type'], quantite: number): Geste => ({ id: date + type + quantite, date, type, quantite })

describe('bilan annuel', () => {
  const gestes = [g('2026-03-01', 'compost', 10.5), g('2026-04-02', 'compost', 4.5), g('2026-05-01', 'broyat', 20), g('2026-06-01', 'eau-pluie', 300), g('2025-12-31', 'feuilles', 8)]
  it('additionne par type, sans mélanger les années', () => {
    const b = bilanAnnuel(gestes, 2026)
    expect(b.parType.compost).toBe(15)
    expect(b.parType.broyat).toBe(20)
    expect(b.nombre).toBe(4)
    expect(bilanAnnuel(gestes, 2025).parType.feuilles).toBe(8)
  })
  it('les déchets évités comptent les kilos, pas l’eau', () => {
    const b = bilanAnnuel(gestes, 2026)
    expect(b.dechetsEvitesKg).toBe(35)
    expect(b.eauLitres).toBe(300)
  })
  it('sans geste, tout est à zéro', () => {
    expect(bilanAnnuel(undefined, 2026)).toMatchObject({ dechetsEvitesKg: 0, eauLitres: 0, nombre: 0 })
  })
  it('évite les erreurs d’arrondi des décimales', () => {
    expect(bilanAnnuel([g('2026-01-01', 'compost', 0.1), g('2026-01-02', 'compost', 0.2)], 2026).parType.compost).toBe(0.3)
  })
  it('propose l’année en cours et celles où il y a des gestes, la plus récente d’abord', () => {
    expect(bilanYears(gestes, new Date('2026-11-16'))).toEqual([2026, 2025])
    expect(bilanYears(undefined, new Date('2026-11-16'))).toEqual([2026])
    expect(Object.keys(GESTE_LABEL)).toHaveLength(5)
  })
})

describe('parcelles en grille', () => {
  let i = 0
  const id = () => 'p' + ++i
  it('numérote de gauche à droite puis de bas en haut', () => {
    const p = gridPlots({ cols: 3, rows: 2, w: 2, h: 5, gap: 0.5, origin: { x: -4, y: 1 } }, id)
    expect(p).toHaveLength(6)
    expect(p.map((q) => q.n)).toEqual([1, 2, 3, 4, 5, 6])
    expect(p[1]).toMatchObject({ x: -1.5, y: 1 })
    expect(p[3]).toMatchObject({ x: -4, y: 6.5 })
  })
  it('refuse ce qui est absurde', () => {
    expect(gridPlots({ cols: 0, rows: 2, w: 2, h: 2, gap: 0, origin: { x: 0, y: 0 } }, id)).toEqual([])
    expect(gridPlots({ cols: 20, rows: 20, w: 2, h: 2, gap: 0, origin: { x: 0, y: 0 } }, id)).toEqual([])
    expect(gridPlots({ cols: 2, rows: 2, w: -1, h: 2, gap: 0, origin: { x: 0, y: 0 } }, id)).toEqual([])
    expect(gridPlots({ cols: 2.5, rows: 2, w: 1, h: 2, gap: 0, origin: { x: 0, y: 0 } }, id)).toEqual([])
    expect(GRID_MAX).toBe(200)
  })
  it('trouve la parcelle d’un point, bords compris', () => {
    const p = gridPlots({ cols: 2, rows: 1, w: 2, h: 2, gap: 1, origin: { x: 0, y: 0 } }, id)
    expect(plotAt({ x: 1, y: 1 }, p)?.n).toBe(1)
    expect(plotAt({ x: 4, y: 2 }, p)?.n).toBe(2)
    expect(plotAt({ x: 2.5, y: 1 }, p)).toBeUndefined() // dans l'écart
    expect(plotAt({ x: 1, y: 1 }, undefined)).toBeUndefined()
  })
})

describe('composteur', () => {
  const t = (s: string) => new Date(s + 'T12:00:00')
  it('compte les jours', () => {
    expect(daysBetween('2026-01-01', t('2026-01-31'))).toBe(30)
  })
  it('rien à faire au début, puis « à retourner » après 6 semaines', () => {
    expect(compostStatus({ debut: '2026-10-01' }, t('2026-10-10')).state).toBe('ok')
    const s = compostStatus({ debut: '2026-10-01' }, t('2026-11-16'))
    expect(s.state).toBe('tourner')
    expect(s.text).toContain('6 semaines')
  })
  it('un retournement récent remet le compteur à zéro', () => {
    expect(compostStatus({ debut: '2026-05-01', retourne: '2026-11-10' }, t('2026-11-16')).state).toBe('mur')
    expect(compostStatus({ debut: '2026-09-01', retourne: '2026-11-10' }, t('2026-11-16')).state).toBe('ok')
  })
  it('peut être mûr au bout de 6 mois', () => {
    expect(MATURE_DAYS).toBe(183)
    expect(compostStatus({ debut: '2026-01-01' }, t('2026-08-01')).state).toBe('mur')
  })
  it('une date de départ à venir ne casse rien', () => {
    expect(compostStatus({ debut: '2027-01-01' }, t('2026-11-16')).state).toBe('ok')
  })
  it('chaque habitat a une idée courte', () => {
    for (const h of HABITATS) expect(h.idea.split(' ').length, h.id).toBeLessThanOrEqual(25)
  })
})

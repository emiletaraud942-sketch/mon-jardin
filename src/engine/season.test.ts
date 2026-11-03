import { describe, expect, it } from 'vitest'
import type { Garden, Plant } from '../types'
import { SPECIES_BY_ID } from '../data/species'
import { seasonEnd, seasonEnded, seasonMonths } from './season'
import { generateTasks, yearPlan } from './tasks'

const garden: Garden = { id: 'g1', name: 'Test', address: '', center: { lat: 48.85, lon: 2.35 }, createdAt: '2026-01-01' }
let n = 0
const plant = (speciesId: string, plantedAt: string, extra: Partial<Plant> = {}): Plant => ({
  id: `s${++n}`, gardenId: 'g1', speciesId, position: { x: n, y: 0 }, plantedAt, status: 'en-place', photos: [], ...extra,
})
const tasksAt = (plants: Plant[], today: Date) =>
  generateTasks({ garden, plants, speciesById: SPECIES_BY_ID, today, tasksDone: [] })

describe('fin de saison des annuelles', () => {
  it('tomate plantée en mai 2026 : aucune tâche en juillet 2027, mais des tâches en juillet 2026', () => {
    const tomate = plant('tomate', '2026-05-15')
    expect(tasksAt([tomate], new Date(2026, 6, 10, 9)).length).toBeGreaterThan(0)
    expect(tasksAt([tomate], new Date(2027, 6, 10, 9))).toEqual([])
  })

  it('laitue plantée en 2026 : aucune tâche en juillet 2027 (récolte, arrosage, désherbage)', () => {
    expect(tasksAt([plant('laitue', '2026-04-10')], new Date(2027, 6, 10, 9))).toEqual([])
  })

  it('la saison finit à la dernière récolte + 30 jours', () => {
    const tomate = SPECIES_BY_ID.tomate // récolte juillet à octobre
    const end = seasonEnd(plant('tomate', '2026-05-15'), tomate)!
    expect(end.getFullYear()).toBe(2026)
    expect(end.getMonth()).toBe(10) // fin novembre
    expect(seasonEnded(plant('tomate', '2026-05-15'), tomate, new Date(2026, 9, 20))).toBe(false)
    expect(seasonEnded(plant('tomate', '2026-05-15'), tomate, new Date(2026, 11, 5))).toBe(true)
  })

  it('une plante mise en terre pendant la récolte garde la saison en cours', () => {
    const laitue = SPECIES_BY_ID.laitue
    const p = plant('laitue', '2026-09-05')
    expect(seasonEnded(p, laitue, new Date(2026, 9, 20))).toBe(false)
    expect(seasonEnded(p, laitue, new Date(2027, 2, 1))).toBe(true)
  })

  it('culture d’hiver : le poireau planté en juin va jusqu’au printemps suivant', () => {
    const p = plant('poireau', '2026-06-10')
    expect(seasonEnded(p, SPECIES_BY_ID.poireau, new Date(2027, 2, 1))).toBe(false)
    expect(seasonEnded(p, SPECIES_BY_ID.poireau, new Date(2027, 6, 1))).toBe(true)
  })

  it('vivaces et arbres : inchangés, sans fin de saison', () => {
    for (const id of ['pommier', 'lavande', 'romarin']) {
      const sp = SPECIES_BY_ID[id]
      if (!sp) continue
      expect(seasonEnd(plant(id, '2020-03-01'), sp)).toBeUndefined()
      expect(seasonMonths(plant(id, '2020-03-01'), sp)).toBeUndefined()
    }
    const pommier = plant('pommier', '2020-03-01')
    expect(tasksAt([pommier], new Date(2027, 0, 13, 9)).some((t) => t.type === 'taille')).toBe(true)
    expect(tasksAt([pommier], new Date(2027, 8, 13, 9)).some((t) => t.type === 'recolte')).toBe(true)
  })

  it('statut « recoltee » : plus aucune tâche, même en pleine saison', () => {
    const tomate = plant('tomate', '2026-05-15', { status: 'recoltee' })
    expect(tasksAt([tomate], new Date(2026, 7, 10, 9))).toEqual([])
    const pommier = plant('pommier', '2020-03-01', { status: 'recoltee' })
    expect(tasksAt([pommier], new Date(2026, 8, 10, 9))).toEqual([])
  })

  it('l’alerte de gel et l’arrosage météo ignorent aussi les annuelles finies', () => {
    const today = new Date(2027, 0, 13, 9)
    const day = (o: number) => {
      const d = new Date(2027, 0, 13 + o)
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    }
    const mk = (o: number, t: { tMin: number; rainMm: number }) => ({ date: day(o), tMin: t.tMin, tMax: 5, rainMm: t.rainMm, et0Mm: 0.5 })
    const weather = {
      fetchedAt: today.toISOString(),
      past: Array.from({ length: 7 }, (_, i) => mk(i - 7, { tMin: 2, rainMm: 0 })),
      forecast: Array.from({ length: 7 }, (_, i) => mk(i, { tMin: -3, rainMm: 0 })),
    }
    const out = generateTasks({ garden, plants: [plant('tomate', '2026-05-15')], speciesById: SPECIES_BY_ID, today, tasksDone: [], weather })
    expect(out).toEqual([])
  })

  it('yearPlan : la saison d’une annuelle se limite à ses mois, rien après sa fin', () => {
    const tomate = plant('tomate', '2026-05-15')
    const plan = yearPlan([tomate], SPECIES_BY_ID, new Date(2026, 6, 1))
    const months = plan.filter((m) => m.tasks.length).map((m) => m.month)
    expect(months.length).toBeGreaterThan(0)
    expect(months.every((m) => m >= 5 && m <= 11)).toBe(true)
    const after = yearPlan([tomate], SPECIES_BY_ID, new Date(2027, 6, 1))
    expect(after.every((m) => m.tasks.length === 0)).toBe(true)
    // Une vivace garde toute l'année.
    expect(yearPlan([plant('pommier', '2020-03-01')], SPECIES_BY_ID, new Date(2027, 6, 1))[0].tasks.length).toBeGreaterThan(0)
  })
})

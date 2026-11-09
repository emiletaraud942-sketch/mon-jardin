import { describe, expect, it } from 'vitest'
import { buildWeekSheet, weekRange, weekSheetText } from './weekSheet'
import type { GeneratedTask, Plant } from '../../types'

const task = (o: Partial<GeneratedTask> & { key: string }): GeneratedTask => ({
  type: 'arrosage',
  title: 'Arroser',
  howTo: '',
  plantIds: [],
  priority: 'normale',
  reason: 'Il n’a pas plu.',
  ...o,
})
const plant = (id: string, speciesId: string, customName?: string) => ({ id, speciesId, customName }) as Plant
const names: Record<string, string> = { pommier: 'pommier', rosier: 'rosier' }
const speciesName = (id: string) => names[id]
const now = new Date(2026, 10, 9) // lundi 9 novembre 2026

describe('Ma semaine', () => {
  it('semaine du lundi au dimanche, avec le mois et l’année', () => {
    expect(weekRange(now)).toBe('Du lundi 9 au dimanche 15 novembre 2026')
    expect(weekRange(new Date(2026, 10, 12))).toBe('Du lundi 9 au dimanche 15 novembre 2026')
    expect(weekRange(new Date(2026, 10, 15))).toBe('Du lundi 9 au dimanche 15 novembre 2026')
  })
  it('semaine à cheval sur deux mois', () => {
    expect(weekRange(new Date(2026, 9, 28))).toBe('Du lundi 26 octobre au dimanche 1er novembre 2026')
  })
  it('range les tâches en Urgent puis Cette semaine, et laisse de côté celles qui attendent', () => {
    const s = buildWeekSheet({
      tasks: [
        task({ key: 'a', title: 'Tailler le pommier', priority: 'normale', plantIds: ['p1'] }),
        task({ key: 'b', title: 'Protéger du gel', priority: 'haute', plantIds: ['p2'], reason: 'Gel annoncé.' }),
        task({ key: 'c', title: 'Désherber', blockedBy: 'Il pleut' }),
      ],
      plants: [plant('p1', 'pommier'), plant('p2', 'rosier')],
      speciesName,
      gardenName: 'Chez moi',
      now,
    })
    expect(s.title).toBe('Ma semaine')
    expect(s.empty).toBe(false)
    expect(s.groups.map((g) => g.title)).toEqual(['Urgent', 'Cette semaine'])
    expect(s.groups[0].rows).toEqual([{ title: 'Protéger du gel', plants: 'Rosier', reason: 'Gel annoncé.' }])
    expect(s.groups[1].rows.map((r) => r.title)).toEqual(['Tailler le pommier'])
    expect(s.footer).toBe('Jardin : Chez moi · édité le 9 novembre 2026')
  })
  it('un groupe vide n’apparaît pas ; aucune tâche : feuille vide', () => {
    const only = buildWeekSheet({ tasks: [task({ key: 'a', priority: 'haute' })], plants: [], speciesName, gardenName: 'J', now })
    expect(only.groups.map((g) => g.id)).toEqual(['urgent'])
    const none = buildWeekSheet({ tasks: [], plants: [], speciesName, gardenName: 'J', now })
    expect(none.empty).toBe(true)
    expect(weekSheetText(none)).toContain('profitez du jardin')
  })
  it('noms de plantes : sans doublon, nom perso d’abord, plafonnés', () => {
    const plants = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((x) => plant(x, 'pommier', 'Arbre ' + x))
    const s = buildWeekSheet({
      tasks: [task({ key: 'k', plantIds: [...plants.map((p) => p.id), 'a'] }), task({ key: 'k2', plantIds: ['x', 'y'] })],
      plants: [...plants, plant('x', 'pommier'), plant('y', 'pommier')],
      speciesName,
      gardenName: 'J',
      now,
    })
    expect(s.groups[0].rows[0].plants).toBe('Arbre a, Arbre b, Arbre c, Arbre d, Arbre e, Arbre f et 2 autres')
    expect(s.groups[0].rows[1].plants).toBe('Pommier')
  })
  it('tâche du jardin entier : pas de ligne de plantes', () => {
    const s = buildWeekSheet({ tasks: [task({ key: 'a' })], plants: [], speciesName, gardenName: 'J', now })
    expect(s.groups[0].rows[0].plants).toBe('')
  })
  it('le texte à partager reprend les lignes', () => {
    const s = buildWeekSheet({ tasks: [task({ key: 'a', title: 'Tailler le pommier', plantIds: ['p1'] })], plants: [plant('p1', 'pommier')], speciesName, gardenName: 'Chez moi', now })
    const t = weekSheetText(s)
    expect(t).toContain('Ma semaine\nDu lundi 9 au dimanche 15 novembre 2026')
    expect(t).toContain('☐ Tailler le pommier')
    expect(t).toContain('Plantes : Pommier')
    expect(t.trimEnd().endsWith('Jardin : Chez moi · édité le 9 novembre 2026')).toBe(true)
  })
})

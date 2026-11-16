import { describe, expect, it } from 'vitest'
import { migrateState } from './migrate'

const base = { id: 'g1', name: 'Jardin', address: 'Rouen', center: { lon: 1.09, lat: 49.44 }, createdAt: '2026-01-01T00:00:00.000Z' }
const load = (extra: Record<string, unknown>) => {
  const r = migrateState({ version: 2, gardens: [{ ...base, ...extra }], plants: [] })
  if (!r.ok) throw new Error(r.error)
  return r.data.gardens[0]
}

describe('jardin collectif : données validées au chargement', () => {
  it('garde des données valides', () => {
    const g = load({
      collectif: { coordinateur: ' Sam ', association: 'Les jardins de la rue', charteAt: '2026-03-01' },
      gestes: [{ id: 'a', date: '2026-04-02', type: 'compost', quantite: 12.34, note: 'Épluchures' }],
      plots: [{ id: 'p1', n: 1, x: 0, y: 0, w: 2, h: 5, holder: 'Marie' }],
      composteurs: [{ id: 'c1', nom: 'Bac 1', debut: '2026-02-01', retourne: '2026-03-15' }],
      habitats: ['haie', 'mare', 'haie'],
    })
    expect(g.collectif).toEqual({ coordinateur: 'Sam', association: 'Les jardins de la rue', charteAt: '2026-03-01' })
    expect(g.gestes).toEqual([{ id: 'a', date: '2026-04-02', type: 'compost', quantite: 12.3, note: 'Épluchures' }])
    expect(g.plots?.[0]).toMatchObject({ n: 1, holder: 'Marie' })
    expect(g.composteurs?.[0].retourne).toBe('2026-03-15')
    expect(g.habitats).toEqual(['haie', 'mare'])
  })
  it('retire ce qui est invalide sans toucher au jardin', () => {
    const g = load({
      collectif: { coordinateur: 42, charteAt: '2026-02-31' },
      gestes: [
        { id: 'a', date: '2026-13-01', type: 'compost', quantite: 5 },
        { id: 'b', date: '2026-04-02', type: 'poison', quantite: 5 },
        { id: 'c', date: '2026-04-02', type: 'compost', quantite: -3 },
        { id: 'd', date: '2026-04-02', type: 'compost', quantite: 1e9 },
        { id: 'e', date: '2026-04-02', type: 'compost', quantite: 'beaucoup' },
        { id: 'f', date: '2026-04-02', type: 'tonte', quantite: 4 },
        { id: 'f', date: '2026-04-03', type: 'tonte', quantite: 9 },
        null,
        'x',
      ],
      plots: [
        { id: 'p1', n: 0, x: 0, y: 0, w: 2, h: 2 },
        { id: 'p2', n: 1, x: 0, y: 0, w: -2, h: 2 },
        { id: 'p3', n: 1.5, x: 0, y: 0, w: 2, h: 2 },
        { id: 'p4', n: 3, x: 'a', y: 0, w: 2, h: 2 },
      ],
      composteurs: [{ id: 'c1', nom: 'x', debut: 'hier' }],
      habitats: ['piscine', 3],
    })
    expect(g.name).toBe('Jardin')
    expect(g.collectif).toBeUndefined()
    expect(g.gestes).toEqual([{ id: 'f', date: '2026-04-02', type: 'tonte', quantite: 4 }])
    expect(g.plots).toBeUndefined()
    expect(g.composteurs).toBeUndefined()
    expect(g.habitats).toBeUndefined()
  })
  it('plafonne les listes et supporte les mauvais types', () => {
    const gestes = Array.from({ length: 1500 }, (_, i) => ({ id: 'g' + i, date: '2026-01-01', type: 'compost', quantite: 1 }))
    expect(load({ gestes }).gestes).toHaveLength(1000)
    const g = load({ collectif: 'x', gestes: 'x', plots: {}, composteurs: 3, habitats: 'haie' })
    expect([g.collectif, g.gestes, g.plots, g.composteurs, g.habitats]).toEqual([undefined, undefined, undefined, undefined, undefined])
  })
  it('un texte de personne est nettoyé et court', () => {
    const g = load({ plots: [{ id: 'p1', n: 1, x: 0, y: 0, w: 2, h: 2, holder: 'Marie\n<script>' + 'x'.repeat(100) }] })
    expect(g.plots?.[0].holder?.length).toBeLessThanOrEqual(30)
    expect(g.plots?.[0].holder).not.toContain('\n')
  })
})

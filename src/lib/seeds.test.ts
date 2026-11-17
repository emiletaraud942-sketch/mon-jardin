import { beforeEach, describe, expect, it } from 'vitest'
import { MAX_SEEDS, parseSeeds, sanitizeSeeds, seedsShareText } from './seeds'

describe('mes graines : lecture validée', () => {
  it('ignore ce qui n’est pas une liste ou un JSON illisible', () => {
    expect(sanitizeSeeds(undefined)).toEqual([])
    expect(sanitizeSeeds({ a: 1 })).toEqual([])
    expect(parseSeeds('{pas du json')).toEqual([])
    expect(parseSeeds(null)).toEqual([])
    expect(parseSeeds('x'.repeat(70_000))).toEqual([])
  })
  it('nettoie les textes, refuse une date impossible, retire les doublons et les lignes sans nom', () => {
    const out = sanitizeSeeds([
      { id: 'a', name: '  Haricot\n‮de ma   grand-mère ', at: '2026-09-31', toGive: true, note: 'x'.repeat(300) },
      { id: 'a', name: 'Doublon' },
      { id: 'b', name: '' },
      { id: 'c', name: 'Tomate', at: '2026-09-15' },
      42,
      null,
    ])
    expect(out.map((s) => s.id)).toEqual(['a', 'c'])
    expect(out[0].name).toBe('Haricot de ma grand-mère')
    expect(out[0].at).toBeUndefined()
    expect(out[0].note!.length).toBeLessThanOrEqual(80)
    expect(out[0].toGive).toBe(true)
    expect(out[1]).toEqual({ id: 'c', name: 'Tomate', at: '2026-09-15', toGive: false })
  })
  it('borne la liste', () => {
    const many = Array.from({ length: MAX_SEEDS + 50 }, (_, i) => ({ id: `i${i}`, name: `Plante ${i}` }))
    expect(sanitizeSeeds(many)).toHaveLength(MAX_SEEDS)
  })
})

describe('mes graines : stockage et partage', () => {
  beforeEach(() => {
    const store = new Map<string, string>()
    ;(globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    }
  })
  it('ajoute, bascule « à donner », supprime et remet', async () => {
    const m = await import('./seeds')
    m.clearSeeds()
    const s = m.addSeed({ name: 'Courgette', at: '2026-09-02' })!
    expect(m.readSeeds()).toHaveLength(1)
    expect(m.addSeed({ name: '   ' })).toBeUndefined()
    m.toggleGive(s.id)
    expect(m.readSeeds()[0].toGive).toBe(true)
    const before = m.removeSeed(s.id)
    expect(m.readSeeds()).toHaveLength(0)
    m.restoreSeeds(before)
    expect(m.readSeeds()[0].name).toBe('Courgette')
  })
  it('le texte partagé ne liste que les graines à donner, sinon tout ; jamais plus que le nécessaire', () => {
    const list = sanitizeSeeds([
      { id: 'a', name: 'Courgette', toGive: true, at: '2026-09-02' },
      { id: 'b', name: 'Tomate', toGive: false },
    ])
    const t = seedsShareText(list, new Date(2026, 10, 13))
    expect(t).toContain('Graines à donner ou échanger')
    expect(t).toContain('• Courgette (récolte septembre 2026)')
    expect(t).not.toContain('Tomate')
    expect(seedsShareText([list[1]], new Date(2026, 10, 13))).toContain('Mes graines')
  })
})

describe('informations lues sur un sachet', () => {
  it('sanitizeSeedInfo garde le valide et retire le reste', async () => {
    const { sanitizeSeedInfo } = await import('./seeds')
    expect(sanitizeSeedInfo({ semis: [5, 3, 3, 13, 'x'], profondeurCm: 1.26, leveeJours: 10.4, soleil: 'soleil', contenu: ' 2 g ', speciesId: 'tomate', hauteurCm: -3 })).toEqual({ semis: [3, 5], profondeurCm: 1.3, leveeJours: 10, soleil: 'soleil', contenu: '2 g', speciesId: 'tomate' })
    expect(sanitizeSeedInfo({ soleil: 'lune', profondeurCm: 999 })).toBeUndefined()
    expect(sanitizeSeedInfo('x')).toBeUndefined()
    expect(sanitizeSeedInfo({ speciesId: '../x' })).toBeUndefined()
  })
  it('un sachet garde ses informations', async () => {
    const { sanitizeSeeds } = await import('./seeds')
    const [s] = sanitizeSeeds([{ id: 'a', name: 'Tomate', toGive: false, info: { semis: [3, 4], espacementCm: 50 } }])
    expect(s.info).toEqual({ semis: [3, 4], espacementCm: 50 })
  })
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TOUR_SLIDES } from './featureTour'

const words = (s: string) => s.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length

describe('visite des fonctions', () => {
  it('quatre à six écrans, une phrase courte chacun', () => {
    expect(TOUR_SLIDES.length).toBeGreaterThanOrEqual(4)
    expect(TOUR_SLIDES.length).toBeLessThanOrEqual(6)
    expect(new Set(TOUR_SLIDES.map((s) => s.id)).size).toBe(TOUR_SLIDES.length)
    for (const s of TOUR_SLIDES) {
      expect(words(s.text), s.id).toBeLessThanOrEqual(20)
      expect(s.title.length).toBeGreaterThan(2)
      expect(s.word.length).toBeGreaterThan(2)
    }
  })

  it('couvre l’accueil, Tout, l’aide, Je suis perdu, la barre du bas et Annuler', () => {
    expect(TOUR_SLIDES.map((s) => s.id)).toEqual(['accueil', 'tout', 'aide', 'perdu', 'barre', 'annuler'])
  })
})

describe('visite des fonctions : déjà vue', () => {
  beforeEach(() => vi.resetModules())
  afterEach(() => vi.unstubAllGlobals())

  it('jamais vue au départ, vue après markTourSeen (clé pj.tourSeen)', async () => {
    const store = new Map<string, string>()
    vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) })
    const m = await import('./featureTour')
    expect(m.tourSeen()).toBe(false)
    m.markTourSeen()
    expect(store.get('pj.tourSeen')).toBe('1')
    expect(m.tourSeen()).toBe(true)
  })

  it('mémoire indisponible : on ne remontre pas la visite à chaque ouverture', async () => {
    vi.stubGlobal('localStorage', {
      getItem() {
        throw new Error('SecurityError')
      },
      setItem() {
        throw new Error('QuotaExceededError')
      },
    })
    const m = await import('./featureTour')
    expect(m.tourSeen()).toBe(true)
    expect(() => m.markTourSeen()).not.toThrow()
  })
})

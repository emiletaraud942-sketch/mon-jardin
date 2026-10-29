import { describe, expect, it } from 'vitest'
import { SPECIES_BY_ID } from '../data/species'
import type { Plant } from '../types'
import { migrateState } from './migrate'
import { formsFor, isTree, measureAdvice, purchaseFormLabel, purchasePatch, PURCHASE_FORMS, shouldAskPurchase, suggestedAgeYears, suggestedHeightCm } from './purchase'

const sp = (id: string) => SPECIES_BY_ID[id]
const plant = (extra: Partial<Plant> = {}): Plant => ({ id: 'p1', gardenId: 'g1', speciesId: 'pommier', position: { x: 0, y: 0 }, plantedAt: '2026-03-10', status: 'en-place', photos: [], ...extra })

describe('formes d’achat', () => {
  it('un arbre a toutes les formes, un légume seulement graine, godet, motte', () => {
    expect(formsFor(sp('pommier')).map((f) => f.id)).toEqual(PURCHASE_FORMS.map((f) => f.id))
    expect(formsFor(sp('tomate')).map((f) => f.id)).toEqual(['graine', 'godet', 'motte'])
    expect(formsFor(sp('lavande')).map((f) => f.id)).toEqual(['graine', 'godet', 'motte', 'racines-nues'])
    expect(isTree(sp('pommier'))).toBe(true)
    expect(isTree(sp('tomate'))).toBe(false)
  })
  it('chaque forme a un libellé et une phrase courte', () => {
    for (const f of PURCHASE_FORMS) {
      expect(f.label.length).toBeGreaterThan(2)
      expect(f.hint.split(/\s+/).length).toBeLessThanOrEqual(20)
    }
    expect(purchaseFormLabel('demi-tige')).toBe('Demi-tige')
    expect(purchaseFormLabel(undefined)).toBe('')
  })
  it('âge et hauteur d’achat estimés selon la forme (arbres) : scion < baliveau < demi-tige < haute-tige', () => {
    const ages = ['scion', 'baliveau', 'demi-tige', 'haute-tige'].map((f) => suggestedAgeYears(f as never, sp('pommier'))!)
    expect([...ages].sort((a, b) => a - b)).toEqual(ages)
    const hs = ['scion', 'baliveau', 'demi-tige', 'haute-tige'].map((f) => suggestedHeightCm(f as never, sp('pommier'))!)
    expect([...hs].sort((a, b) => a - b)).toEqual(hs)
    expect(suggestedAgeYears('graine', sp('tomate'))).toBe(0)
    expect(suggestedAgeYears(undefined, sp('pommier'))).toBeUndefined()
    expect(suggestedHeightCm('godet', sp('tomate'))).toBeUndefined() // pas de hauteur proposée hors arbres
  })
})

describe('purchasePatch', () => {
  it('range l’achat, l’âge estimé et la hauteur comme première mesure à la date de plantation', () => {
    const patch = purchasePatch(plant(), sp('pommier'), { form: 'baliveau', heightCm: 180, shop: ' Pépinière Martin ', priceEur: 24.9, note: '  variété Reine des reinettes ' })
    expect(patch.purchase).toEqual({ form: 'baliveau', heightCm: 180, shop: 'Pépinière Martin', priceEur: 24.9, note: 'variété Reine des reinettes' })
    expect(patch.ageAtPlanting).toBe(2)
    expect(patch.measurements).toEqual([{ at: '2026-03-10', heightM: 1.8 }])
  })
  it('n’écrase jamais un âge déjà connu', () => {
    const patch = purchasePatch(plant({ ageAtPlanting: 5 }), sp('pommier'), { form: 'scion' })
    expect(patch.ageAtPlanting).toBeUndefined()
  })
  it('garde les mesures existantes et remplace celle du même jour', () => {
    const p = plant({ measurements: [{ at: '2026-03-10', heightM: 1 }, { at: '2026-01-01', heightM: 0.5 }] })
    const patch = purchasePatch(p, sp('pommier'), { heightCm: 120 })
    expect(patch.measurements).toEqual([{ at: '2026-03-10', heightM: 1.2 }, { at: '2026-01-01', heightM: 0.5 }])
  })
  it('« je ne veux pas le renseigner » : mémorisé, sans âge ni mesure inventés', () => {
    const patch = purchasePatch(plant(), sp('pommier'), { skipped: true })
    expect(patch).toEqual({ purchase: { skipped: true } })
    expect(shouldAskPurchase({ status: 'en-place', purchase: patch.purchase })).toBe(false)
  })
  it('rien de renseigné : pas d’achat', () => {
    expect(purchasePatch(plant(), sp('pommier'), { shop: '   ' }).purchase).toBeUndefined()
  })
  it('on ne demande l’achat qu’une fois, pour une plante en place', () => {
    expect(shouldAskPurchase({ status: 'en-place' })).toBe(true)
    expect(shouldAskPurchase({ status: 'projet' })).toBe(false)
    expect(shouldAskPurchase({ status: 'en-place', purchase: { form: 'godet' } })).toBe(false)
  })
})

describe('measureAdvice : quand mesurer', () => {
  const june = new Date(2026, 5, 15)
  const december = new Date(2026, 11, 15)
  it('jamais mesurée : à faire maintenant', () => {
    expect(measureAdvice(plant(), june)).toMatchObject({ due: true })
    expect(measureAdvice(plant(), june)!.text).toMatch(/Mesurez-la maintenant/)
  })
  it('mesure récente : rien d’urgent, avec la prochaine date conseillée', () => {
    const a = measureAdvice(plant({ measurements: [{ at: '2026-06-01', heightM: 1 }] }), june)!
    expect(a.due).toBe(false)
    expect(a.text).toMatch(/dans 3 mois/)
  })
  it('mesure de plus de 3 mois, en saison de pousse : à refaire ; en hiver : on attend le printemps', () => {
    const old = plant({ measurements: [{ at: '2026-02-01', heightM: 1 }] })
    expect(measureAdvice(old, june)!.due).toBe(true)
    expect(measureAdvice(old, new Date(2026, 0, 20))!.due).toBe(false)
    expect(measureAdvice(plant({ measurements: [{ at: '2026-09-01', heightM: 1 }] }), december)!.text).toMatch(/au printemps/)
  })
  it('plus d’un an : toujours à refaire', () => {
    expect(measureAdvice(plant({ measurements: [{ at: '2025-01-01', heightM: 1 }] }), december)).toMatchObject({ due: true })
  })
  it('projet ou plante morte : aucun conseil ; phrases de 20 mots au plus', () => {
    expect(measureAdvice(plant({ status: 'projet' }), june)).toBeUndefined()
    expect(measureAdvice(plant({ status: 'mort' }), june)).toBeUndefined()
    for (const m of [[], [{ at: '2026-06-01', heightM: 1 }], [{ at: '2026-02-01', heightM: 1 }], [{ at: '2025-01-01', heightM: 1 }]]) {
      for (const sentence of measureAdvice(plant({ measurements: m }), june)!.text.split(/(?<=[.!?])\s+/)) expect(sentence.split(/\s+/).length).toBeLessThanOrEqual(20)
    }
  })
})

describe('format stocké : purchase', () => {
  const garden = { id: 'g1', name: 'J', address: '', center: { lon: 4, lat: 45 }, createdAt: '2025-01-01T00:00:00.000Z' }
  const raw = (purchase: unknown) => ({ gardens: [garden], plants: [{ ...plant(), purchase }], tasksDone: [] })
  const read = (purchase: unknown) => {
    const r = migrateState(raw(purchase))
    if (!r.ok) throw new Error(r.error)
    return r.data.plants[0].purchase
  }
  it('garde un achat valide', () => {
    expect(read({ form: 'scion', heightCm: 100, shop: 'Jardinerie', priceEur: 12, boughtAt: '2026-03-01', note: 'ok', skipped: false })).toEqual({ form: 'scion', heightCm: 100, shop: 'Jardinerie', priceEur: 12, boughtAt: '2026-03-01', note: 'ok' })
  })
  it('écarte forme inconnue, nombres absurdes, date invalide, champs étrangers', () => {
    expect(read({ form: 'ovni', heightCm: -3, priceEur: 1e9, boughtAt: '2026-13-45', shop: '   ', evil: 'x' })).toBeUndefined()
    expect(read({ form: 'godet', evil: '<script>' })).toEqual({ form: 'godet' })
    expect(read('pas un objet')).toBeUndefined()
  })
  it('borne les textes et garde « je ne veux pas »', () => {
    const p = read({ shop: 'x'.repeat(5000), skipped: true })!
    expect(p.shop!.length).toBeLessThanOrEqual(120)
    expect(p.skipped).toBe(true)
  })
})

import { afterEach, vi } from 'vitest'
import { askPurchaseEnabled, purchaseSummary, setAskPurchaseEnabled } from './purchase'

describe('demander l’achat : réglage et résumé', () => {
  afterEach(() => vi.unstubAllGlobals())
  it('actif par défaut ; « ne plus me demander » est mémorisé', () => {
    const store = new Map<string, string>()
    vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) })
    expect(askPurchaseEnabled()).toBe(true)
    setAskPurchaseEnabled(false)
    expect(askPurchaseEnabled()).toBe(false)
    setAskPurchaseEnabled(true)
    expect(askPurchaseEnabled()).toBe(true)
  })
  it('stockage indisponible : on continue de demander, sans erreur', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('bloqué') }, setItem: () => { throw new Error('bloqué') } })
    expect(askPurchaseEnabled()).toBe(true)
    expect(() => setAskPurchaseEnabled(false)).not.toThrow()
  })
  it('résumé : phrases courtes, rien si « je ne veux pas » ou vide', () => {
    expect(purchaseSummary(undefined)).toEqual([])
    expect(purchaseSummary({ skipped: true })).toEqual([])
    const lines = purchaseSummary({ form: 'demi-tige', heightCm: 250, shop: 'Pépinière Martin', boughtAt: '2026-03-01', priceEur: 24.9, note: 'Reine des reinettes' })
    expect(lines).toEqual([
      'Forme : demi-tige',
      'Hauteur à l’achat : 250 cm',
      'Achetée chez : Pépinière Martin',
      'Achetée le 1 mars 2026',
      'Prix : 24,9 €',
      'Note : Reine des reinettes',
    ])
  })
})

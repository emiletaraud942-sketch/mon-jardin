import { describe, expect, it } from 'vitest'
import { clearPurchaseDraft, peekPurchaseDraft, setPurchaseDraft } from './purchaseDraft'

describe('purchaseDraft', () => {
  it('ne rend le brouillon que pour la bonne espèce et avant 30 minutes', () => {
    setPurchaseDraft({ speciesId: 'pommier', form: 'godet', priceEur: 12 }, 1000)
    expect(peekPurchaseDraft('pommier', 2000)?.priceEur).toBe(12)
    expect(peekPurchaseDraft('poirier', 2000)).toBeUndefined()
    expect(peekPurchaseDraft('pommier', 1000 + 31 * 60 * 1000)).toBeUndefined()
    clearPurchaseDraft()
    expect(peekPurchaseDraft('pommier', 2000)).toBeUndefined()
  })
  it('ignore un brouillon vide', () => {
    setPurchaseDraft({ speciesId: 'pommier' })
    expect(peekPurchaseDraft('pommier')).toBeUndefined()
  })
})

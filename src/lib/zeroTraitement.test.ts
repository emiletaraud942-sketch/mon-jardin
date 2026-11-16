import { describe, expect, it } from 'vitest'
import { SPECIES } from '../data/species'
import { ENNUIS } from '../data/ravageurs'
import { adviceText, linesWithoutProducts, mentionsProduct, parseZero, PRODUCT, withoutProducts } from './zeroTraitement'

describe('zéro traitement', () => {
  it('est activé par défaut, seul « 0 » le coupe', () => {
    expect(parseZero(null)).toBe(true)
    expect(parseZero('1')).toBe(true)
    expect(parseZero('0')).toBe(false)
  })

  it('reconnaît les produits mais pas l’eau savonneuse ni les purins maison', () => {
    for (const t of ['bouillie bordelaise', 'un produit cuivré', 'du soufre', 'savon insecticide', 'Bacillus thuringiensis', 'granulés au phosphate ferrique']) expect(mentionsProduct(t), t).toBe(true)
    for (const t of ['eau savonneuse', 'purin de prêle', 'décoction d’ail', 'ramassez à la main']) expect(mentionsProduct(t), t).toBe(false)
  })

  it('retire les phrases de produit et celles qui n’ont plus de sens sans elles', () => {
    const t = 'Ramassez les feuilles. Au besoin, un produit cuivré préventif (type bouillie bordelaise). À appliquer à la chute des feuilles. Le cuivre s’accumule dans le sol.'
    expect(withoutProducts(t)).toBe('Ramassez les feuilles.')
    expect(adviceText(t, false)).toBe(t)
    expect(adviceText(t, true)).toBe('Ramassez les feuilles.')
  })

  it('met une phrase de repli quand il ne reste rien', () => {
    expect(adviceText('Un produit à base de soufre.', true)).toMatch(/Pas de produit/)
  })

  it('aucune fiche espèce ne garde un produit une fois le réglage actif', () => {
    for (const s of SPECIES) for (const r of s.taches) expect(PRODUCT.test(adviceText(r.howTo, true)), `${s.id} ${r.type}`).toBe(false)
  })

  it('aucune fiche d’ennui ne propose de produit une fois le réglage actif, et chacune garde un geste', () => {
    for (const e of ENNUIS) {
      const agir = linesWithoutProducts(e.agir)
      expect(agir.length, e.id).toBeGreaterThan(0)
      for (const l of agir) expect(PRODUCT.test(l), `${e.id}: ${l}`).toBe(false)
    }
  })
})

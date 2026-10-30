import { describe, expect, it } from 'vitest'
import { hasFacts, mergePurchase, noteDate, noteHeightCm, noteShop, parseNote } from './noteParse'

const NOW = new Date(2026, 9, 30)

describe('parseNote : ce que la personne écrit dans la note', () => {
  it('une note complète est répartie : forme, hauteur, prix, lieu, date', () => {
    const f = parseNote('Acheté chez Truffaut le 12/03/2026, en demi-tige racines nues, hauteur 1,50 m, payé 35 €.', NOW)
    expect(f).toEqual({ form: 'demi-tige', heightCm: 150, priceEur: 35, shop: 'Truffaut', boughtAt: '2026-03-12' })
  })
  it('une note sans rien de reconnaissable ne donne rien', () => {
    expect(hasFacts(parseNote('Belle floraison, à surveiller les pucerons.', NOW))).toBe(false)
    expect(parseNote('', NOW)).toEqual({})
  })
  it('« scion », « baliveau », « haute-tige » sont reconnus', () => {
    expect(parseNote('un scion de 1 an', NOW).form).toBe('scion')
    expect(parseNote('baliveau en pot', NOW).form).toBe('baliveau')
    expect(parseNote('Haute tige, 8/10', NOW).form).toBe('haute-tige')
  })
})

describe('hauteur', () => {
  it('centimètres, fourchette, mètre précédé d’un mot', () => {
    expect(noteHeightCm('il faisait 120 cm')).toBe(120)
    expect(noteHeightCm('100-120 cm')).toBe(110)
    expect(noteHeightCm('mesurait 1,20 m à l’achat')).toBe(120)
    expect(noteHeightCm('hauteur : 1.5 m')).toBe(150)
  })
  it('un mètre seul n’est pas une hauteur (distance, espacement)', () => {
    expect(noteHeightCm('plantée à 2 m de la clôture')).toBeUndefined()
    expect(noteHeightCm('espacement 1,5 m entre les rangs')).toBeUndefined()
  })
})

describe('date d’achat', () => {
  it('formats complets seulement', () => {
    expect(noteDate('acheté le 2026-03-12', NOW)).toBe('2026-03-12')
    expect(noteDate('acheté le 12/03/2026', NOW)).toBe('2026-03-12')
    expect(noteDate('acheté le 3 mars 2026', NOW)).toBe('2026-03-03')
    expect(noteDate('acheté le 1er février 2025', NOW)).toBe('2025-02-01')
  })
  it('jamais inventée : mois seul, date impossible ou future refusés', () => {
    expect(noteDate('acheté en mars', NOW)).toBeUndefined()
    expect(noteDate('acheté en mars 2026', NOW)).toBeUndefined()
    expect(noteDate('le 31/02/2026', NOW)).toBeUndefined()
    expect(noteDate('le 12/03/2027', NOW)).toBeUndefined()
  })
})

describe('lieu d’achat', () => {
  it('nom propre après « chez » ou « à »', () => {
    expect(noteShop('Acheté chez Truffaut')).toBe('Truffaut')
    expect(noteShop('pris à Jardiland pour pas cher')).toBe('Jardiland')
    expect(noteShop('commandé chez Pépinières du Moulin, livré en mars')).toBe('Pépinières du Moulin')
  })
  it('types de lieu et personnes', () => {
    expect(noteShop('achetée à la pépinière du village')).toMatch(/pépinière du village/i)
    expect(noteShop('reçu d’un voisin')).toMatch(/voisin/i)
    expect(noteShop('trouvé au marché de Pâques')).toMatch(/marché/i)
  })
  it('rien sans verbe d’achat : un lieu de plantation n’est pas un lieu d’achat', () => {
    expect(noteShop('plantée près du Cerisier, au fond du jardin')).toBeUndefined()
    expect(noteShop('Belle plante')).toBeUndefined()
  })
})

describe('mergePurchase', () => {
  it('complète l’achat sans toucher à la note libre ni aux champs non trouvés', () => {
    const merged = mergePurchase({ shop: 'Ancien', note: 'variété Reine', priceEur: 10 }, { form: 'scion', priceEur: 12 })
    expect(merged).toEqual({ shop: 'Ancien', note: 'variété Reine', priceEur: 12, form: 'scion' })
  })
  it('« je ne veux pas le renseigner » est levé quand la personne applique', () => {
    expect(mergePurchase({ skipped: true }, { form: 'godet' })).toEqual({ form: 'godet' })
  })
})

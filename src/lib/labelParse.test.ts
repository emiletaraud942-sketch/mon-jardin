import { describe, expect, it } from 'vitest'
import { findSpeciesInText, parseForm, parseHeightCm, parseLabel, parsePriceEur } from './labelParse'

describe('parseHeightCm', () => {
  it('fourchette, hauteur annoncée, mètres', () => {
    expect(parseHeightCm('Hauteur 100-120 cm')).toBe(110)
    expect(parseHeightCm('80/100 cm')).toBe(90)
    expect(parseHeightCm('H. 150')).toBe(150)
    expect(parseHeightCm('taille 1,20 m')).toBe(120)
    expect(parseHeightCm('pot 3 L, 60 cm')).toBe(60)
  })
  it('ignore ce qui n’est pas une hauteur plausible', () => {
    expect(parseHeightCm('Pot 19 cm de diamètre 3 litres')).toBe(19) // ambigu : on propose, la personne corrige
    expect(parseHeightCm('rien ici')).toBeUndefined()
    expect(parseHeightCm('2 cm')).toBeUndefined()
    expect(parseHeightCm('5000 cm')).toBeUndefined()
  })
})

describe('parsePriceEur', () => {
  it('formats français', () => {
    expect(parsePriceEur('Prix 24,90 €')).toBe(24.9)
    expect(parsePriceEur('12 € TTC')).toBe(12)
    expect(parsePriceEur('€ 8.50')).toBe(8.5)
    expect(parsePriceEur('19,90 EUR')).toBe(19.9)
  })
  it('pas de prix, ou absurde', () => {
    expect(parsePriceEur('sans prix')).toBeUndefined()
    expect(parsePriceEur('0 €')).toBeUndefined()
    expect(parsePriceEur('99999 €')).toBeUndefined()
  })
})

describe('parseForm', () => {
  it('reconnaît les formes d’achat', () => {
    expect(parseForm('Pommier racines nues')).toBe('racines-nues')
    expect(parseForm('SCION 1 an')).toBe('scion')
    expect(parseForm('Baliveau 2 ans')).toBe('baliveau')
    expect(parseForm('Poirier demi-tige')).toBe('demi-tige')
    expect(parseForm('Cerisier 1/2 tige')).toBe('demi-tige')
    expect(parseForm('Tilleul haute tige')).toBe('haute-tige')
    expect(parseForm('Pot C3')).toBe('godet')
    expect(parseForm('en motte')).toBe('motte')
    expect(parseForm('Graines de tomate, sachet')).toBe('graine')
    expect(parseForm('Rosier')).toBeUndefined()
  })
  it('la forme d’arbre l’emporte sur le conditionnement', () => {
    expect(parseForm('Scion racines nues')).toBe('scion')
    expect(parseForm('Baliveau en motte')).toBe('baliveau')
    expect(parseForm('Haute-tige en pot')).toBe('haute-tige')
  })
  it('« demi-tige » l’emporte sur « tige »', () => {
    expect(parseForm('demi-tige en pot')).toBe('demi-tige')
  })
})

describe('findSpeciesInText', () => {
  it('nom latin, nom usuel, alias', () => {
    expect(findSpeciesInText('Malus domestica Golden')?.id).toBe('pommier')
    expect(findSpeciesInText('LAVANDE vraie')?.id).toBe('lavande')
    expect(findSpeciesInText('Ma pomme préférée')?.id).toBe('pommier') // alias « pomme »
  })
  it('rien de sûr : undefined, plutôt que de se tromper', () => {
    expect(findSpeciesInText('Plante vivace de pleine terre')).toBeUndefined()
    expect(findSpeciesInText('')).toBeUndefined()
  })
})

describe('parseLabel : étiquettes d’exemple', () => {
  it('étiquette de pépinière d’un arbre fruitier', () => {
    const f = parseLabel(['POMMIER', 'Malus domestica ‘Reine des reinettes’', 'Demi-tige — racines nues', 'H. 250 cm', '24,90 €'].join('\n'))
    expect(f.speciesId).toBe('pommier')
    expect(f.form).toBe('demi-tige') // « demi-tige — racines nues » : la forme d'arbre l'emporte
    expect(f.heightCm).toBe(250)
    expect(f.priceEur).toBe(24.9)
    expect(f.noteLines.join(' ')).toMatch(/Reine des reinettes/)
  })
  it('étiquette de godet', () => {
    const f = parseLabel('Lavandula angustifolia\nLavande vraie\nPot C3  40-60 cm\n7,50 €')
    expect(f).toMatchObject({ speciesId: 'lavande', form: 'godet', heightCm: 50, priceEur: 7.5 })
  })
  it('texte illisible : rien d’inventé', () => {
    expect(parseLabel('@@ ## ~~ ||')).toEqual({ noteLines: [] })
    expect(parseLabel('')).toEqual({ noteLines: [] })
  })
})

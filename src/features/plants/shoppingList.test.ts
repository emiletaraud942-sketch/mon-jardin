import { describe, expect, it } from 'vitest'
import type { Garden, Plant, Species } from '../../types'
import { buildShoppingList, itemLine, shoppingText } from './shoppingList'

const garden = { id: 'g', name: 'Mon jardin', center: { lon: 2, lat: 48 } } as Garden
const sp = (o: Partial<Species>): Species => ({ id: 'x', nomCommun: 'X', rusticiteC: -15, taches: [], ...o }) as Species
const species: Record<string, Species> = {
  tomate: sp({ id: 'tomate', nomCommun: 'Tomate', semisAbri: [3, 4], plantation: [5] }),
  pommier: sp({ id: 'pommier', nomCommun: 'Pommier', plantation: [11, 12, 1, 2, 3] }),
  ail: sp({ id: 'ail', nomCommun: 'Ail' }),
}
const plant = (id: string, speciesId: string, status: Plant['status'], extra: Partial<Plant> = {}): Plant => ({ id, gardenId: 'g', speciesId, status, position: { x: 0, y: 0 }, ...extra }) as Plant

describe('buildShoppingList', () => {
  const plants = [plant('1', 'tomate', 'projet'), plant('2', 'tomate', 'projet'), plant('3', 'tomate', 'en-place'), plant('4', 'pommier', 'projet'), plant('5', 'ail', 'projet')]

  it('ne garde que les plantes prévues, regroupées par espèce avec leur nombre', () => {
    const list = buildShoppingList(plants, species, garden, 11)
    expect(list.map((i) => [i.name, i.count])).toEqual([['Pommier', 1], ['Ail', 1], ['Tomate', 2]])
  })

  it('met en tête ce qui se fait ce mois-ci', () => {
    expect(buildShoppingList(plants, species, garden, 11)[0].name).toBe('Pommier')
    expect(buildShoppingList(plants, species, garden, 3)[0].name).toBe('Pommier') // plantation jusqu'en mars
    expect(buildShoppingList(plants, species, garden, 4).find((i) => i.now)?.name).toBe('Tomate')
  })

  it('écrit la fenêtre de plantation en phrases', () => {
    const t = buildShoppingList(plants, species, garden, 11).find((i) => i.name === 'Tomate')!
    expect(t.windows).toEqual(['semis sous abri en mars et avril', 'plantation en mai'])
    expect(itemLine(t)).toBe('2 × Tomate : semis sous abri en mars et avril ; plantation en mai.')
  })

  it('renvoie à la fiche quand aucune période n’est connue', () => {
    expect(itemLine(buildShoppingList(plants, species, garden, 11).find((i) => i.name === 'Ail')!)).toBe('1 × Ail : période : voir la fiche.')
  })

  it('range une plante hors base sous son propre nom', () => {
    const list = buildShoppingList([plant('9', 'inconnue', 'projet', { customName: 'Rosier du voisin' })], species, garden, 5)
    expect(list).toHaveLength(1)
    expect(list[0].name).toBe('Rosier du voisin')
  })

  it('liste vide sans plante prévue', () => {
    expect(buildShoppingList([plant('3', 'tomate', 'en-place')], species, garden, 5)).toEqual([])
  })
})

describe('shoppingText', () => {
  it('commence par le jardin et le total, une ligne par espèce', () => {
    const list = buildShoppingList([plant('1', 'tomate', 'projet'), plant('2', 'tomate', 'projet')], species, garden, 4)
    const t = shoppingText(list, 'Mon jardin')
    expect(t.split('\n')[0]).toBe('Liste de courses et de semis : Mon jardin (2 plantes)')
    expect(t).toContain('- 2 × Tomate : semis sous abri en mars et avril ; plantation en mai. À faire ce mois-ci.')
  })
})

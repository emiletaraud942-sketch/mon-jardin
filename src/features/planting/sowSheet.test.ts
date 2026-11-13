import { describe, expect, it } from 'vitest'
import { buildSowSheet, previewList, SOW_PREVIEW, sowSheetText } from './sowSheet'

const now = new Date(2026, 10, 13)
const base = { monthName: 'Novembre', gardenName: 'Chez moi', now, semisAbri: [], semisPleineTerre: [], plantation: [], recolte: [] }

describe('feuille « Que semer ce mois »', () => {
  it('ne garde que les groupes qui ont des plantes, sans doublon, avec majuscule', () => {
    const s = buildSowSheet({ ...base, plantation: ['pommier', 'Pommier', 'cerisier'], recolte: ['poireau'] })
    expect(s.empty).toBe(false)
    expect(s.groups.map((g) => g.id)).toEqual(['plantation', 'recolte'])
    expect(s.groups[0].names).toEqual(['Pommier', 'Cerisier'])
    expect(s.subtitle).toBe('Mois : novembre')
  })
  it('dit quand il n’y a rien', () => {
    const s = buildSowSheet(base)
    expect(s.empty).toBe(true)
    expect(sowSheetText(s)).toContain('Rien à indiquer ce mois-ci.')
  })
  it('le texte partagé a des cases à cocher, le nom du jardin et la mention « conseils généraux »', () => {
    const t = sowSheetText(buildSowSheet({ ...base, semisAbri: ['tomate'] }))
    expect(t).toContain('Semer à l’abri (1)')
    expect(t).toContain('☐ Tomate')
    expect(t).toContain('Jardin : Chez moi')
    expect(t).toContain('conseils généraux')
  })
})

describe('listes raccourcies du mois', () => {
  const list = Array.from({ length: 15 }, (_, i) => i)
  it('montre les premières seulement, et dit combien restent', () => {
    expect(previewList(list, false)).toEqual({ shown: list.slice(0, SOW_PREVIEW), hidden: 15 - SOW_PREVIEW })
  })
  it('montre tout une fois dépliée, ou quand la liste est courte', () => {
    expect(previewList(list, true)).toEqual({ shown: list, hidden: 0 })
    expect(previewList(list.slice(0, SOW_PREVIEW), false).hidden).toBe(0)
    expect(previewList([], false)).toEqual({ shown: [], hidden: 0 })
  })
})

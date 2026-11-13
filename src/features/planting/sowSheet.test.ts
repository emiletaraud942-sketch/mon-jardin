import { describe, expect, it } from 'vitest'
import { buildSowSheet, sowSheetText } from './sowSheet'

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

import { describe, expect, it } from 'vitest'
import { topNames } from './topNames'

describe('topNames', () => {
  it('liste les trois premières plantes et compte les autres', () => {
    expect(topNames(['Lavande', 'Romarin', 'Thym', 'Sauge', 'Menthe'])).toBe('Lavande · Romarin · Thym · +2')
  })
  it('sans reste, pas de compteur', () => {
    expect(topNames(['Lavande', 'Romarin'])).toBe('Lavande · Romarin')
  })
  it('sans idée, le dit', () => {
    expect(topNames([])).toBe('Aucune idée ici')
  })
})

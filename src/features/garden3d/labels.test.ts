import { describe, expect, it } from 'vitest'
import { ERROR_3D_TITLE, SEASON_SHORTCUTS, describeSun, describeSunShort, walkHelpShort, directionName, formatClock, gardenSummary, walkHelp, yearsLabel } from './labels'

describe('libellés 3D en langage clair', () => {
  it('direction en toutes lettres', () => {
    expect(directionName(0)).toBe('nord')
    expect(directionName(225)).toBe('sud-ouest')
    expect(directionName(-90)).toBe('ouest')
    expect(directionName(359)).toBe('nord')
  })
  it('heure 14:30', () => {
    expect(formatClock(14.5)).toBe('14:30')
    expect(formatClock(9.999)).toBe('10:00')
    expect(formatClock(5)).toBe('5:00')
  })
  it('phrase du soleil', () => {
    expect(describeSun(14.5, 45, 225)).toBe('Soleil à 14:30 · haut dans le ciel, côté sud-ouest')
    expect(describeSun(8, 10, 100)).toContain('bas sur l’horizon')
    expect(describeSun(22, -5, 300)).toBe('Soleil couché à 22:00')
  })
  it('années', () => {
    expect(yearsLabel(0)).toBe('Aujourd’hui')
    expect(yearsLabel(1)).toBe('Dans 1 an')
    expect(yearsLabel(5)).toBe('Dans 5 ans')
  })
  it('raccourcis de saison sans jargon', () => {
    expect(SEASON_SHORTCUTS.map((s) => s.label)).toEqual(['Début du printemps', 'Plein été', 'Plein hiver'])
  })
  it('résumé du jardin et aide sans ZQSD', () => {
    expect(gardenSummary('Chez moi', 3, 0)).toContain('3 plantes')
    expect(gardenSummary(undefined, 0, 2)).toContain('2 maisons voisines')
    expect(walkHelp(false)).not.toMatch(/ZQSD/i)
    expect(walkHelp(false)).toContain('Touches fléchées')
    expect(ERROR_3D_TITLE).toBe('La vue 3D ne fonctionne pas sur cet appareil.')
  })
})

describe('textes courts de la vue 3D', () => {
  it('soleil en une ligne', () => {
    expect(describeSunShort(17.25, 5, 235)).toBe('17:15 · soleil bas, sud-ouest')
    expect(describeSunShort(22, -5, 0)).toBe('22:00 · soleil couché')
  })
  it('aide courte : deux lignes au plus', () => {
    expect(walkHelpShort(true).length).toBeLessThan(80)
    expect(walkHelpShort(false)).toContain('Maj')
  })
})

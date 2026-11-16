import { describe, expect, it } from 'vitest'
import { invasiveWarning, INVASIVES } from './invasives'

describe('espèces invasives signalées par la Métropole', () => {
  it('reconnaît le nom, le nom usuel, le début du nom, avec ou sans accent et majuscule', () => {
    expect(invasiveWarning('Buddleia')?.id).toBe('buddleia')
    expect(invasiveWarning('arbre aux papillons')?.id).toBe('buddleia')
    expect(invasiveWarning('Renouée du Japon')?.id).toBe('renouee')
    expect(invasiveWarning('renou')).toBeUndefined() // trop court : pas d'alerte sur 5 lettres communes
    expect(invasiveWarning('renoué')?.id).toBe('renouee')
    expect(invasiveWarning('Buddleia davidii violet')?.id).toBe('buddleia')
  })
  it('ne crie pas au loup', () => {
    for (const q of ['', 'pom', 'pommier', 'lavande', 'bud', 'rosier du japon']) expect(invasiveWarning(q), q).toBeUndefined()
  })
  it('chaque texte est court et dit quoi faire', () => {
    for (const i of INVASIVES) {
      expect(i.texte.split(' ').length).toBeLessThanOrEqual(35)
      expect(i.texte).toMatch(/Ne /)
    }
  })
})

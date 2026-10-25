import { describe, expect, it } from 'vitest'
import { CUSTOM_NAME_MAX, cleanCustomName, inSentence, yourPlant } from './customName'

describe('cleanCustomName', () => {
  it('nettoie les espaces', () => {
    expect(cleanCustomName('  Rosier   de grand-mère \n')).toBe('Rosier de grand-mère')
  })
  it('un texte vide reste vide', () => {
    expect(cleanCustomName('   ')).toBe('')
  })
  it('borne la longueur', () => {
    expect(cleanCustomName('a'.repeat(200))).toHaveLength(CUSTOM_NAME_MAX)
  })
})

describe('inSentence', () => {
  it('met la première lettre en minuscule', () => {
    expect(inSentence('Pommier')).toBe('pommier')
    expect(inSentence('Rosier de grand-mère')).toBe('rosier de grand-mère')
  })
  it('laisse les sigles', () => {
    expect(inSentence('GR1 de Paul')).toBe('GR1 de Paul')
  })
  it('gère les noms courts', () => {
    expect(inSentence('')).toBe('')
    expect(inSentence('X')).toBe('X')
  })
})

describe('yourPlant', () => {
  it('« votre pommier »', () => {
    expect(yourPlant('Pommier')).toBe('votre pommier')
    expect(yourPlant('Rosier de grand-mère')).toBe('votre rosier de grand-mère')
  })
  it('ne double pas l’article ou le possessif', () => {
    expect(yourPlant('Mon rosier rouge')).toBe('votre rosier rouge')
    expect(yourPlant('le figuier')).toBe('votre figuier')
    expect(yourPlant('L’if du fond')).toBe('votre if du fond')
    expect(yourPlant('Ma lavande')).toBe('votre lavande')
  })
  it('un nom réduit à l’article reste lisible', () => {
    expect(yourPlant('Le')).toBe('votre le')
  })
})

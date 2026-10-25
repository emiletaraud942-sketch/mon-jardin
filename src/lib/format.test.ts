import { describe, expect, it } from 'vitest'
import { formatDay, frMeters, frNumber, plural } from './format'

describe('format', () => {
  it('nombres avec virgule', () => {
    expect(frNumber(1.2)).toBe('1,2')
    expect(frNumber(3)).toBe('3')
    expect(frNumber(2.46)).toBe('2,5')
    expect(frMeters(0.8)).toBe('0,8 m')
  })
  it('grands nombres : espace fine entre milliers', () => {
    expect(frNumber(1250, 0).replace(/\s/g, ' ')).toBe('1 250')
  })
  it('nombre invalide : texte vide', () => {
    expect(frNumber(Number.NaN)).toBe('')
  })
  it('dates en toutes lettres', () => {
    expect(formatDay('2026-10-24')).toBe('24 octobre')
    expect(formatDay('2026-03-01', { year: true })).toBe('1 mars 2026')
    expect(formatDay(new Date(2026, 11, 5))).toBe('5 décembre')
  })
  it('date invalide : texte vide', () => {
    expect(formatDay('n’importe quoi')).toBe('')
  })
  it('pluriel', () => {
    expect(plural(1, 'plante')).toBe('1 plante')
    expect(plural(0, 'plante')).toBe('0 plante')
    expect(plural(2, 'jardin')).toBe('2 jardins')
  })
})

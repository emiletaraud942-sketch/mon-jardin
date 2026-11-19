import { describe, expect, it } from 'vitest'
import { pickRotation, readability, ROTATION_TRIGGER } from './labelRotation'

const w = (text: string, confidence: number) => ({ text, confidence })

describe('readability', () => {
  it('compte les vrais mots sûrs, pas le bruit', () => {
    expect(readability([w('Tomate', 90), w('Semis', 80), w('mars', 70)])).toBeCloseTo(2.4)
    expect(readability([w('x', 95), w('1', 95), w('..', 90), w('ab', 99)])).toBe(0) // trop courts ou sans lettres
    expect(readability([w('Tomate', 30), w('Semis', 49)])).toBe(0) // confiance trop basse
  })
  it('une étiquette lue normalement dépasse très largement le seuil', () => {
    const words = Array.from({ length: 30 }, () => w('semis', 85))
    expect(readability(words)).toBeGreaterThan(ROTATION_TRIGGER * 2)
  })
  it('accents et lettres non latines comptent comme des lettres', () => {
    expect(readability([w('récolte', 90), w('Ernte', 90)])).toBeCloseTo(1.8)
  })
})

describe('pickRotation', () => {
  it('garde le sens normal quand il est lisible', () => {
    expect(pickRotation({ 0: 25, 90: 3, 270: 2 })).toBe(0)
  })
  it('prend le sens tourné quand il est nettement meilleur', () => {
    expect(pickRotation({ 0: 1, 90: 20, 270: 2 })).toBe(90)
    expect(pickRotation({ 0: 0, 90: 2, 270: 18 })).toBe(270)
    expect(pickRotation({ 0: 0, 90: 1, 270: 2, 180: 22 })).toBe(180)
  })
  it('ne change pas de sens sur un écart de bruit', () => {
    expect(pickRotation({ 0: 5, 90: 7, 270: 6 })).toBe(0)
    expect(pickRotation({ 0: 0, 90: 2 })).toBe(0)
  })
  it('sans autre essai : sens normal', () => {
    expect(pickRotation({ 0: 3 })).toBe(0)
    expect(pickRotation({})).toBe(0)
  })
})

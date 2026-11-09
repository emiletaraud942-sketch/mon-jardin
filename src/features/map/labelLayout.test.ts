import { describe, expect, it } from 'vitest'
import { boxesOverlap, hiddenLabelIds, type LabelBox } from './labelLayout'

const box = (id: string, left: number, top = 0, width = 60, height = 22, keep = false): LabelBox => ({ id, left, top, width, height, keep })

describe('hiddenLabelIds', () => {
  it('ne masque rien quand les noms sont espacés', () => {
    expect(hiddenLabelIds([box('a', 0), box('b', 100), box('c', 0, 40)]).size).toBe(0)
  })
  it('masque le nom qui en recouvre un autre, garde le premier', () => {
    const h = hiddenLabelIds([box('a', 0), box('b', 30), box('c', 200)])
    expect([...h]).toEqual(['b'])
  })
  it('compare avec les noms gardés seulement (un nom masqué ne gêne personne)', () => {
    // b touche a, c touche b mais pas a : c reste affiché
    const h = hiddenLabelIds([box('a', 0), box('b', 50), box('c', 100)])
    expect([...h]).toEqual(['b'])
  })
  it('la plante choisie passe toujours, même si elle vient après', () => {
    const h = hiddenLabelIds([box('a', 0), box('b', 30, 0, 60, 22, true)])
    expect([...h]).toEqual(['a'])
  })
  it('respecte la marge entre deux noms', () => {
    expect(boxesOverlap(box('a', 0), box('b', 61), 2)).toBe(true)
    expect(boxesOverlap(box('a', 0), box('b', 63), 2)).toBe(false)
    expect(hiddenLabelIds([box('a', 0), box('b', 61)], 0).size).toBe(0)
  })
  it('deux noms l’un sous l’autre ne se recouvrent pas', () => {
    expect(hiddenLabelIds([box('a', 0, 0), box('b', 0, 24)]).size).toBe(0)
    expect(hiddenLabelIds([box('a', 0, 0), box('b', 0, 10)]).size).toBe(1)
  })
})

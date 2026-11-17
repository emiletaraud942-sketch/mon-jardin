import { describe, expect, it } from 'vitest'
import { SPECIES } from '../data/species'
import { ENGLISH_NAMES } from './englishNames'

describe('noms anglais', () => {
  it('chaque nom anglais renvoie à une fiche qui existe', () => {
    const ids = new Set(SPECIES.map((s) => s.id))
    for (const id of Object.keys(ENGLISH_NAMES)) expect(ids.has(id), id).toBe(true)
  })
})

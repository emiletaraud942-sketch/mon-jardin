import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PHOTO_IDS } from './photoIds'
import { SPECIES_BY_ID } from './index'

const DIR = join(__dirname, '../../../public/plantes')
const credits = JSON.parse(readFileSync(join(DIR, 'credits.json'), 'utf8')) as Record<string, { f: string; a: string; l: string }>

describe('photos des espèces', () => {
  it('chaque photo listée existe, correspond à une espèce et a un crédit avec licence libre', () => {
    for (const id of PHOTO_IDS) {
      expect(existsSync(join(DIR, id + '.jpg')), id).toBe(true)
      expect(SPECIES_BY_ID[id], id).toBeTruthy()
      expect(credits[id]?.a, id).toBeTruthy()
      expect(credits[id]?.l, id).toMatch(/^(CC0|CC BY|Public domain)/i)
    }
  })
  it('la liste PHOTO_IDS est à jour (node scripts/photos/index.mjs)', () => {
    const files = readdirSync(DIR).filter((f) => f.endsWith('.jpg')).map((f) => f.slice(0, -4)).sort()
    expect([...PHOTO_IDS].sort()).toEqual(files)
  })
})

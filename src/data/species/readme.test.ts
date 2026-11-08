import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SPECIES } from './index'

describe('README', () => {
  it('cite le bon nombre de fiches espèces (motif « N fiches »)', () => {
    const text = readFileSync(join(__dirname, '..', '..', '..', 'README.md'), 'utf8')
    const cited = [...text.matchAll(/\b(\d+)\s+fiches\b/g)].map((m) => Number(m[1]))
    expect(cited.length, 'README.md ne cite aucun « N fiches »').toBeGreaterThan(0)
    for (const n of cited) expect(n, `README.md dit ${n} fiches, le catalogue en a ${SPECIES.length}`).toBe(SPECIES.length)
  })
})

import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('moteurs', () => {
  it('chaque module de src/engine a son fichier de test voisin', () => {
    const modules = readdirSync(__dirname).filter((f) => /\.ts$/.test(f) && !/\.test\.ts$/.test(f))
    expect(modules.length).toBeGreaterThan(0)
    for (const f of modules) expect(existsSync(join(__dirname, f.replace(/\.ts$/, '.test.ts'))), `${f} n’a pas de test`).toBe(true)
  })
})

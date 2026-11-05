import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const src = join(__dirname, '..', '..')
function files(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f)
    if (statSync(p).isDirectory()) files(p, out)
    else if (/\.(ts|tsx)$/.test(f) && !/\.test\./.test(f)) out.push(p)
  }
  return out
}

describe('aucun remplacement des données sans copie de sécurité', () => {
  it('tout appel à replaceData() hors de store.ts est précédé de keepLocalSafetyCopy() dans le même fichier, avec keepPhotos', () => {
    const callers = files(src).filter((f) => !f.endsWith(join('lib', 'store.ts')) && /\breplaceData\(/.test(readFileSync(f, 'utf8')))
    expect(callers.length).toBeGreaterThanOrEqual(2) // synchro (sync.ts) et import (SettingsPage.tsx)
    for (const f of callers) {
      const text = readFileSync(f, 'utf8')
      const copy = text.indexOf('keepLocalSafetyCopy()')
      const replace = text.search(/\breplaceData\(/)
      expect(copy, `${f} : pas de keepLocalSafetyCopy()`).toBeGreaterThanOrEqual(0)
      expect(copy, `${f} : la copie doit venir avant le remplacement`).toBeLessThan(replace)
      expect(text, f).toMatch(/replaceData\([^)]*\{ keepPhotos: true \}\)/)
    }
  })

  it('la synchro automatique remplace les données uniquement par pullSnapshot() (qui fait la copie)', () => {
    const auto = readFileSync(join(src, 'lib', 'autoSync.ts'), 'utf8')
    expect(auto).not.toMatch(/\breplaceData\(/)
    expect(auto).toMatch(/pull: \(\) => sync\.pullSnapshot\(\)/)
  })
})

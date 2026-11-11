// Verrou : plus aucun paramètre d'adresse de revue (?debug, ?ortho) en production.
// Les outils de mesure passent par `pj.debug` (sessionStorage) ou le mode développement, jamais par l'URL.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { reviewToolsEnabled } from '../debugFlag'

const root = join(__dirname, '..', '..', '..')
const FILES = ['src/features/map/photoZoom.ts', 'src/features/map/MapView.tsx', 'src/lib/debugFlag.ts']

describe('aucun réglage de revue lu dans l’adresse', () => {
  for (const f of FILES) {
    const code = readFileSync(join(root, f), 'utf8')
    it(`${f} ne lit ni location.search ni URLSearchParams`, () => {
      expect(code).not.toMatch(/location\s*\.\s*search/)
      expect(code).not.toMatch(/URLSearchParams/)
    })
    it(`${f} ne lit ni « debug » ni « ortho » depuis l’adresse`, () => {
      expect(code).not.toMatch(/\.get\(\s*['"](debug|ortho)['"]/)
      expect(code).not.toMatch(/[?&](debug|ortho)=/)
      expect(code).not.toMatch(/parseReview|orthoPaint|\breview\(\)/)
    })
  }
})

describe('outils de mesure : développement ou clé de session seulement', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('en production sans clé : rien n’est exposé, même avec ?debug=1&debug=map&ortho=net dans l’adresse', () => {
    vi.stubEnv('DEV', false)
    vi.stubGlobal('location', { search: '?debug=1&debug=map&ortho=net,nearest' })
    vi.stubGlobal('sessionStorage', { getItem: () => null })
    expect(reviewToolsEnabled()).toBe(false)
  })

  it('en production avec pj.debug = 1 : activé', () => {
    vi.stubEnv('DEV', false)
    vi.stubGlobal('sessionStorage', { getItem: (k: string) => (k === 'pj.debug' ? '1' : null) })
    expect(reviewToolsEnabled()).toBe(true)
  })

  it('en production, un stockage qui échoue : désactivé', () => {
    vi.stubEnv('DEV', false)
    vi.stubGlobal('sessionStorage', {
      getItem: () => {
        throw new Error('refusé')
      },
    })
    expect(reviewToolsEnabled()).toBe(false)
  })
})

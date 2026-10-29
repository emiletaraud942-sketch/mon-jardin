import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const css = readFileSync(join(__dirname, 'app.css'), 'utf8')

describe('grands écrans', () => {
  it('la base du texte grandit à 1800, 2300 et 3000 px, et se combine avec « grand » et « très grand »', () => {
    for (const w of [1800, 2300, 3000]) {
      const block = css.slice(css.indexOf(`@media (min-width: ${w}px)`))
      expect(block, String(w)).toMatch(/html\s*\{\s*font-size:\s*\d+(\.\d+)?%/)
      expect(block.slice(0, 700), String(w)).toContain("html[data-text-size='grand']")
      expect(block.slice(0, 700), String(w)).toContain("html[data-text-size='tres-grand']")
    }
  })
  it('la grille et le panneau latéral sont en rem, pas en pixels fixes (sinon ils restent étroits sur grand écran)', () => {
    expect(css).toMatch(/\.app\s*\{[^}]*grid-template-columns:\s*13\.75rem 1fr/)
    expect(css).toMatch(/\.sidepanel\s*\{[^}]*width:\s*22\.5rem/)
  })
  it('les règles de grand écran viennent après celles du téléphone et de la taille du texte (elles l’emportent)', () => {
    const phone = css.indexOf("html[data-text-size='tres-grand']")
    expect(css.indexOf('@media (min-width: 1800px)')).toBeGreaterThan(phone)
  })
})

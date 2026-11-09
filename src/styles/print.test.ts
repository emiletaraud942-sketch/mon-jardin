import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('./print.css', import.meta.url), 'utf8')
const printBlock = css.slice(css.indexOf('@media print'))

describe('impression « Ma semaine »', () => {
  it('la feuille est cachée à l’écran', () => {
    expect(css.slice(0, css.indexOf('@media print'))).toMatch(/\.print-week\s*\{\s*display:\s*none/)
  })
  it('à l’impression, la navigation, les barres et les boutons sont masqués', () => {
    for (const sel of ['.topbar', '.sidenav', '.lost-fab', '.overlay-stack', '.pagehead', 'button']) {
      expect(printBlock).toContain(sel)
    }
    expect(printBlock).toMatch(/button\s*\{\s*display:\s*none\s*!important/)
  })
  it('pendant l’impression de la semaine, tout le reste de la page est masqué', () => {
    expect(printBlock).toMatch(/html\[data-print-week\] body > \*:not\(\.print-week\)\s*\{\s*display:\s*none\s*!important/)
    expect(printBlock).toMatch(/html\[data-print-week\] \.print-week\s*\{[^}]*display:\s*block/)
  })
  it('texte de 12 pt, noir sur blanc, graisses du projet', () => {
    expect(printBlock).toMatch(/font-size:\s*12pt/)
    expect(printBlock).toMatch(/color:\s*#000/)
    expect(printBlock).not.toMatch(/font-weight:\s*(700|800|900|bold)/)
  })
  it('les lignes ne se coupent pas entre deux pages', () => {
    expect(printBlock).toMatch(/\.print-week li\s*\{[^}]*break-inside:\s*avoid/)
  })
})

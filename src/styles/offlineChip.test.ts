import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Sur téléphone, « Je suis perdu » occupe la rangée juste au-dessus de la barre du bas : la puce « Hors connexion » doit se poser au-dessus.
const css = (f: string) => readFileSync(join(__dirname, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

describe('puce « Hors connexion » et « Je suis perdu »', () => {
  const nav = css('mobile-nav.css')
  const phone = nav.match(/@media \(max-width: 760px\)\s*\{\s*\.offline-chip\s*\{([^}]*)\}/)?.[1] ?? ''
  const facile = css('facile.css')

  it('la puce téléphone monte d’au moins la hauteur d’une cible au-dessus de la barre', () => {
    expect(phone).toMatch(/bottom:\s*calc\(var\(--nav-h\)\s*\+\s*var\(--tap\)\s*\+/)
  })
  it('« Je suis perdu » est bien une rangée statique de la grille sur téléphone', () => {
    expect(facile).toMatch(/@media \(max-width: 760px\)[\s\S]*\.app \.lost-fab,\s*\.app\[data-tab\] \.lost-fab\s*\{[^}]*position:\s*static/)
  })
})

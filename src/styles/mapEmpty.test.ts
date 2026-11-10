import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Sur ordinateur, la carte d'invite du jardin vide (en bas à gauche) recouvrait « Légende » et « Aide sur cet écran » du panneau Options.
const read = (f: string) => readFileSync(join(__dirname, f), 'utf8')
const css = (f: string) => read(f).replace(/\/\*[\s\S]*?\*\//g, '')

describe('carte d’invite du jardin vide et panneau Options', () => {
  const view = read('../features/map/MapView.tsx')

  it('l’invite n’est montée ni avec les Options ouvertes ni avec la légende ouverte', () => {
    const cond = view.match(/const emptyCard =\s*plants\.length === 0 &&([^\n]*)\? \(\s*<div className="floating map-empty">/)?.[1] ?? ''
    expect(cond).toContain('!optionsOpen')
    expect(cond).toContain('!legendOpen')
  })
  it('« Ajouter une plante au jardin » reste dans le panneau de droite', () => {
    expect(read('../features/map/SidePanel.tsx')).toContain('PlaceAction')
  })
  it('sur ordinateur, la colonne de la carte défile et laisse la place de l’attribution', () => {
    const m = css('app.css').match(/@media \(min-width: 761px\)\s*\{\s*\.map-top\s*\{([^}]*)\}/)?.[1] ?? ''
    expect(m).toMatch(/max-height:\s*calc\(100%\s*-\s*\d+px\)/)
    expect(css('app.css')).toMatch(/\.map-top\s*\{[^}]*overflow-y:\s*auto/)
  })
  it('« Pointer mon jardin » : le « i » de l’attribution garde sa taille en Grandes touches', () => {
    expect(css('facile.css')).toMatch(/html\[data-big-taps\] dialog\.modal :is\([^)]*\):not\(\.maplibregl-map \*\)\s*\{[^}]*min-height:\s*56px/)
  })
  it('« Pointer mon jardin » : la carte laisse la place de l’en-tête et du bouton', () => {
    expect(css('novice-pages.css')).toMatch(/\.location-map\s*\{[^}]*height:\s*clamp\(\s*\d+px,\s*calc\(100dvh\s*-\s*\d+px\)/)
  })
})

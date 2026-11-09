import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Correction 4 (ordinateur) : ces règles évitent les recouvrements relevés à la recette PC (1024 à 2560 px, zoom 150 %, texte très grand).
const read = (f: string) => readFileSync(join(__dirname, f), 'utf8')
const css = (f: string) => read(f).replace(/\/\*[\s\S]*?\*\//g, '')

/** Corps de chaque bloc `@media <query> { … }` (accolades équilibrées). */
function mediaBlocks(source: string, query: string): string[] {
  const out: string[] = []
  let from = 0
  for (;;) {
    const i = source.indexOf(`@media ${query}`, from)
    if (i < 0) break
    let depth = 0
    let j = source.indexOf('{', i)
    const start = j + 1
    for (; j < source.length; j++) {
      if (source[j] === '{') depth++
      else if (source[j] === '}' && --depth === 0) break
    }
    out.push(source.slice(start, j))
    from = j
  }
  return out
}
const mediaBlock = (source: string, query: string): string => mediaBlocks(source, query).join('\n')

describe('pastille « Je suis perdu » sur ordinateur', () => {
  const facile = css('facile.css')
  it('la règle de la 3D qui la monte de 296 px ne vaut que pour un téléphone', () => {
    const rule = /\.app\[data-tab='3d'\] \.lost-fab\s*\{[^}]*296px[^}]*\}/
    expect(mediaBlock(facile, '(max-width: 760px)')).toMatch(rule)
    // Retire chaque bloc téléphone : la règle ne doit plus figurer nulle part ailleurs.
    let rest = facile
    for (const b of mediaBlocks(facile, '(max-width: 760px)')) rest = rest.replace(b, '')
    expect(rest).not.toMatch(rule)
  })
  it('sur ordinateur elle se pose dans le bas du menu de gauche, y compris en carte et en 3D (jamais sur le contenu)', () => {
    const desk = mediaBlock(facile, '(min-width: 761px)')
    const rule = desk.match(/\.lost-fab,\s*\.app\[data-tab='carte'\] \.lost-fab,\s*\.app\[data-tab='3d'\] \.lost-fab\s*\{([^}]*)\}/)?.[1] ?? ''
    expect(rule).toMatch(/left:\s*12px/)
    expect(rule).toMatch(/right:\s*auto/)
    expect(rule).toMatch(/bottom:\s*12px/)
    expect(rule).toMatch(/max-width:\s*calc\(min\(13\.75rem,\s*19vw\)\s*-\s*20px\)/)
  })
  it('le menu garde une réserve en bas pour elle (le lien « Copier le lien de l’appli » reste au-dessus)', () => {
    const desk = mediaBlock(facile, '(min-width: 761px)')
    expect(desk).toMatch(/\.sidenav\s*\{[^}]*padding-bottom:\s*calc\(var\(--tap\)\s*\+\s*28px\)/)
  })
  it('elle ne s’efface plus quand un panneau de la carte ou de la 3D est ouvert (elle ne gêne plus rien)', () => {
    expect(facile).not.toMatch(/\.app:has\(#map-options\) \.lost-fab/)
  })
})

describe('deux colonnes : la carte garde sa place', () => {
  const app = css('app.css')
  it('menu et panneau de droite sont plafonnés en pourcentage de la fenêtre', () => {
    expect(app).toMatch(/\.app\s*\{[^}]*grid-template-columns:\s*min\(13\.75rem,\s*19vw\)\s*1fr/)
    expect(app).toMatch(/\.sidepanel\s*\{[^}]*width:\s*min\(22\.5rem,\s*33vw\)/)
  })
  it('de 761 à 1000 px (hors téléphone en paysage), le panneau passe sous la carte', () => {
    const b = mediaBlock(app, '(min-width: 761px) and (max-width: 1000px) and (min-height: 501px)')
    expect(b).toMatch(/\.workspace\s*\{[^}]*flex-direction:\s*column/)
    expect(b).toMatch(/\.sidepanel\s*\{[^}]*max-height:\s*40%/)
    expect(b).toMatch(/\.app\[data-tab='3d'\] \.sidepanel\s*\{[^}]*max-height:\s*28%/)
    expect(b).toMatch(/\.app\.is-placing \.sidepanel\s*\{[^}]*display:\s*none/)
  })
  it('à 1001 px, la carte garde au moins 480 px (calcul sur les plafonds)', () => {
    const vw = 1001
    const map = vw - 0.19 * vw - 0.33 * vw
    expect(map).toBeGreaterThanOrEqual(480)
  })
})

describe('carte sur ordinateur : rien ne recouvre l’échelle ni l’attribution', () => {
  const facile = css('facile.css')
  const desk = mediaBlock(facile, '(min-width: 761px)')
  it('la colonne d’outils laisse la place du bas et celle de la consigne de placement', () => {
    expect(desk).toMatch(/\.map-top\s*\{[^}]*max-height:\s*calc\(100%\s*-\s*60px\s*-\s*var\(--placing-h,\s*0px\)\)/)
  })
  it('l’échelle et l’attribution remontent au-dessus de la consigne (préfixe .maplibregl-map)', () => {
    expect(desk).toMatch(/\.workspace \.maplibregl-map \.maplibregl-ctrl-bottom-left,\s*\.workspace \.maplibregl-map \.maplibregl-ctrl-bottom-right\s*\{[^}]*margin-bottom:\s*var\(--placing-h,\s*0px\)/)
  })
  it('la carte d’invite du jardin vide est au-dessus de l’échelle', () => {
    expect(desk).toMatch(/\.map-empty\s*\{[^}]*bottom:\s*48px/)
  })
  it('la consigne de placement écrit sa hauteur dans --placing-h', () => {
    const banner = read('../features/map/GardenSide.tsx')
    expect(banner).toMatch(/className="floating placing-banner"[^>]*ref=\{reserve\}/)
    expect(read('../features/map/placingReserve.ts')).toContain("'--placing-h'")
  })
  it('les boutons de la carte sont avant la carte (et ses repères) dans le DOM, pour le clavier', () => {
    const view = read('../features/map/MapView.tsx')
    expect(view.indexOf('className="map-top"')).toBeGreaterThan(0)
    expect(view.indexOf('className="map-top"')).toBeLessThan(view.indexOf('className="map" data-feat="carte"'))
  })
  it('les petits avis se rangent côte à côte (une rangée)', () => {
    expect(desk).toMatch(/\.map-chips\s*\{[^}]*display:\s*flex/)
    expect(facile).toMatch(/\.map-chips\s*\{[^}]*display:\s*contents/)
  })
})

describe('écrans plein cadre : largeur de lecture', () => {
  it('« Tout ce que je peux faire » et le guide se centrent sur 800 px au plus', () => {
    const f = css('facile.css')
    expect(f).toMatch(/\.tf-overlay\s*\{[^}]*--read-pad:\s*max\(16px,\s*calc\(\(100%\s*-\s*min\(46rem,\s*800px\)\)\s*\/\s*2\)\)/)
    for (const sel of ['\\.tf-head', '\\.tf-search', '\\.tf-body']) expect(f).toMatch(new RegExp(`${sel}\\s*\\{[^}]*var\\(--read-pad\\)`))
  })
  it('« Photos du jardin » : l’en-tête et « Accueil » suivent la colonne de 720 px de la liste', () => {
    const p = css('panorama.css')
    expect(p).toMatch(/--pano-pad:\s*max\(16px,\s*calc\(\(100vw\s*-\s*720px\)\s*\/\s*2\)\)/)
    expect(p).toMatch(/\.pano-bar,\s*\.pano-top\s*\{[^}]*var\(--pano-pad\)/)
    expect(p).toMatch(/\.pano-overlay \.pano-home\s*\{[^}]*var\(--pano-pad\)/)
    expect(p).toMatch(/\.pano-scroll,[^{]*\{\s*width:\s*min\(100%,\s*720px\)/)
  })
})

describe('Grandes touches : curseurs de la 3D', () => {
  it('« Heure de la journée » fait 56 px', () => {
    expect(css('facile.css')).toMatch(/html\[data-big-taps\] \.g3d-hourfield input\[type='range'\][^{]*\{[^}]*height:\s*56px/)
  })
})

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
  it('sur ordinateur elle se pose dans le bas du menu de gauche, y compris en carte (jamais sur le contenu)', () => {
    const desk = mediaBlock(facile, '(min-width: 761px)')
    const rule = desk.match(/\.lost-fab,\s*\.app\[data-tab='carte'\] \.lost-fab\s*\{([^}]*)\}/)?.[1] ?? ''
    expect(rule).toMatch(/left:\s*12px/)
    expect(rule).toMatch(/right:\s*auto/)
    expect(rule).toMatch(/bottom:\s*12px/)
    expect(rule).toMatch(/max-width:\s*calc\(min\(13\.75rem,\s*19vw\)\s*-\s*20px\)/)
  })
  it('le menu garde une réserve en bas pour elle (le lien « Copier le lien de l’appli » reste au-dessus)', () => {
    const desk = mediaBlock(facile, '(min-width: 761px)')
    expect(desk).toMatch(/\.sidenav\s*\{[^}]*padding-bottom:\s*calc\(var\(--tap\)\s*\+\s*28px\)/)
  })
  it('elle ne s’efface plus quand un panneau de la carte est ouvert (elle ne gêne plus rien)', () => {
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
  it('le bas de la carte (mention sur la photo, invite du jardin vide) est une colonne au-dessus de l’échelle et de la consigne', () => {
    expect(desk).toMatch(/\.map-foot\s*\{[^}]*bottom:\s*calc\(44px\s*\+\s*var\(--placing-h,\s*0px\)\)[^}]*flex-direction:\s*column/)
    expect(desk).toMatch(/\.map-foot > \*\s*\{[^}]*position:\s*static/)
    expect(mediaBlock(facile, '(min-width: 761px) and (max-height: 820px)')).toMatch(/\.map-foot \.map-empty-art\s*\{[^}]*display:\s*none/)
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
  it('la mention sur la photo ne s’empile plus avec les autres avis : en bas de la carte sur ordinateur, sous les outils sur téléphone', () => {
    const view = read('../features/map/MapView.tsx')
    // Une seule rangée d'avis en haut (images absentes, données manquantes) ; la mention est rendue dans `map-foot` sur ordinateur seulement.
    expect(view).toMatch(/\{!mobileMap && \(\(!noteInColumn && photoNote\) \|\| emptyCard\) && \(\s*<div className="map-foot">/)
    expect(view).toContain('{noteInColumn && !(mobileMap && emptyCard) && photoNote}')
    expect(view).toContain('const noteInColumn = mobileMap || plants.length === 0 || optionsOpen || legendOpen')
    // Les avis viennent juste sous la barre d'outils, avant le panneau Options : jamais repoussés dans la partie qui défile.
    expect(view.indexOf('className="map-chips"')).toBeGreaterThan(view.indexOf('className="floating row map-toolbar"'))
    expect(view.indexOf('className="map-chips"')).toBeLessThan(view.indexOf('id="map-options"'))
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

describe('carte sur téléphone : la mention sur la photo reste lisible (360 px)', () => {
  const nav = css('mobile-nav.css')
  const phone = mediaBlock(nav, '(max-width: 760px)')
  it('la colonne du haut s’arrête au-dessus de la feuille du bas (96 px) et de l’échelle, et prend toute la largeur', () => {
    expect(nav).toMatch(/\.map-top\s*\{[^}]*right:\s*12px[^}]*max-height:\s*calc\(100%\s*-\s*12px\s*-\s*96px\s*-\s*32px\s*-\s*8px\)/)
    expect(nav).toMatch(/\.app\.is-placing \.map-top\s*\{[^}]*max-height:\s*calc\(100%\s*-\s*12px\s*-\s*var\(--placing-h,\s*0px\)\s*-\s*32px\s*-\s*8px\)/)
  })
  it('seuls les outils laissent la place des boutons + et − ; les avis prennent toute la largeur', () => {
    expect(nav).toMatch(/\.map-top > \.map-toolbar,[^{]*\.map-top > \.season-note\s*\{[^}]*max-width:\s*calc\(100%\s*-\s*56px\)/)
  })
  it('l’invite du jardin vide est dans la colonne : plus rien ne la recouvre, ni elle la mention', () => {
    expect(nav).toMatch(/\.map-top > \.map-empty\s*\{[^}]*width:\s*100%/)
    const view = read('../features/map/MapView.tsx')
    expect(view).toContain('{mobileMap && emptyCard}')
  })
  it('Options ouvertes : seul « Il manque… » se met de côté ; la mention sur la photo reste', () => {
    expect(nav).toMatch(/\.app:has\(#map-options\) \.map-top :is\(\.data-chip, \.data-banner\)\s*\{[^}]*display:\s*none/)
    expect(nav).not.toMatch(/map-photo-note\s*\{[^}]*display:\s*none/)
  })
  it('« Ajouter une plante » (carte) laisse la place des avis ; l’échelle suit la hauteur réelle de la consigne', () => {
    expect(nav).toMatch(/\.app\[data-tab='carte'\] \.add-fab\s*\{[^}]*bottom:\s*132px/)
    expect(nav).toMatch(/\.app\.is-placing \.workspace \.maplibregl-ctrl-bottom-left\s*\{[^}]*margin-bottom:\s*var\(--placing-h,\s*190px\)/)
    expect(phone.length).toBeGreaterThan(0)
  })
})

// Lot 6A : derniers recouvrements de la carte et du parcours (853 × 533, 1024 × 768, 360 px en Grandes touches).
describe('barre d’outils de la carte : deux rangées au plus (mots courts)', () => {
  const view = read('../features/map/MapView.tsx')
  const app = css('app.css')
  it('« Vue photo », « Vue plan » et « Options de la carte » ont un mot court ; le nom accessible reste le long', () => {
    for (const [long, short] of [['Vue photo', 'Photo'], ['Vue plan', 'Plan'], ['Options de la carte', 'Options']]) {
      expect(view).toContain(`aria-label="${long}"`)
      expect(view).toMatch(new RegExp(`<span className="lbl-long">${long}</span>\\s*<span className="lbl-short" aria-hidden>\\s*${short}\\s*</span>`))
    }
  })
  it('la colonne d’outils est un conteneur de largeur ; les mots courts se décident en rem (ils suivent la taille du texte)', () => {
    expect(app).toMatch(/\.map-top\s*\{[^}]*container:\s*maptop\s*\/\s*inline-size/)
    expect(app).toMatch(/\.map-toolbar \.lbl-short\s*\{\s*display:\s*none/)
    expect(mediaBlock(app, '(max-width: 760px)')).toMatch(/@container maptop \(max-width:\s*calc\(17\.5rem \+ 155px\)\)\s*\{\s*\.map-toolbar \.lbl-long\s*\{\s*display:\s*none/)
    expect(mediaBlock(app, '(min-width: 761px)')).toMatch(/@container maptop \(max-width:\s*24rem\)\s*\{\s*\.map-toolbar \.lbl-long\s*\{\s*display:\s*none/)
  })
  it('la barre passe de 3 rangées à 2 : 24 rem couvrent la colonne de 413 px à 1024 px en « Grand » (19 px de base)', () => {
    const column = 1024 - 0.19 * 1024 - 0.33 * 1024 - 80 // menu, panneau de droite, marge des boutons + et −
    expect(column / 19).toBeLessThan(24)
    expect(column / 16).toBeGreaterThan(24) // texte normal : mots longs gardés
  })
})

// Lot 8B : à 360 px en texte Normal la barre faisait 3 rangées (seuil de 19 rem < colonne de 21 rem, alors que la barre est 56 px plus étroite).
describe('barre d’outils sur téléphone : le seuil des mots courts suit la largeur réelle de la barre', () => {
  const app = css('app.css')
  const nav = css('mobile-nav.css')
  // Mesuré (Normal 16 px, Grand 17,8 px, Très grand 20,6 px) : trois boutons longs + écarts = 17,3 rem + 95 px sur une rangée.
  const longRow = (rem: number) => 17.3 * rem + 95
  const threshold = (rem: number) => 17.5 * rem + 155 // colonne = barre + 56 px réservés aux boutons + et −, + 4 px de marge
  const REM = [16, 17.8, 20.6]
  it('360, 390 et 412 px : colonne de 336, 366 et 388 px, toujours sous le seuil, donc mots courts à toute taille de texte', () => {
    for (const rem of REM) for (const column of [336, 366, 388]) expect(column).toBeLessThan(threshold(rem))
  })
  it('mots courts : trois boutons et Annuler/Rétablir (+ 12 px de marge de la barre) tiennent dans les 280 px de la barre à 360 px', () => {
    for (const [short, history] of [[230, 212], [245, 224], [269, 243]]) {
      expect(short).toBeLessThanOrEqual(280)
      expect(history + 12).toBeLessThanOrEqual(280)
    }
  })
  it('là où les mots longs tenaient déjà sur une rangée, ils sont gardés (téléphone large, 600 px)', () => {
    for (const rem of REM) {
      const column = 600 - 24
      expect(column).toBeGreaterThanOrEqual(threshold(rem))
      expect(column - 56).toBeGreaterThanOrEqual(longRow(rem))
    }
  })
  it('seuil juste : colonne plus petite que le seuil = les trois boutons longs ne tiennent pas (jamais 3 rangées avec des mots longs)', () => {
    for (const rem of REM) expect(threshold(rem) - 56).toBeGreaterThanOrEqual(longRow(rem))
  })
  it('360 à 430 px : écarts resserrés (colonne, barre, mention) et 2 px d’air sous la colonne, au lieu de 6 px', () => {
    const block = mediaBlock(nav, '(max-width: 430px)')
    expect(block).toMatch(/\.map-top\s*\{\s*gap:\s*2px/)
    expect(block).toMatch(/\.map-top > \.map-toolbar\s*\{\s*gap:\s*4px;\s*padding:\s*4px/)
    expect(block).toMatch(/\.map-top \.map-photo-note\s*\{\s*padding-block:\s*2px/)
    expect(block).toMatch(/\.app\[data-tab='carte'\]:has\(\.add-fab\):not\(:has\(#map-options\)\) \.map-top\s*\{[^}]*max-height:\s*calc\(100%\s*-\s*12px\s*-\s*132px\s*-\s*var\(--btn-h\)\s*-\s*2px\)/)
    // Rien n'est retiré : les avis restent rendus (la mention n'est jamais masquée à la place de l'écart).
    expect(block).not.toMatch(/display:\s*none/)
    expect(app).not.toMatch(/map-photo-note[^{]*\{[^}]*display:\s*none/)
  })
})

describe('carte courte (853 × 533) : l’invite du jardin vide se retire au lieu de recouvrir les outils', () => {
  const facile = css('facile.css')
  it('la carte est un conteneur de taille sur ordinateur seulement', () => {
    expect(mediaBlock(facile, '(min-width: 761px)')).toMatch(/\.map-wrap\s*\{[^}]*container:\s*mapwrap\s*\/\s*size/)
  })
  it('sous 28 rem de haut, l’invite du bas est cachée (le bouton reste dans le panneau)', () => {
    expect(mediaBlock(facile, '(min-width: 761px)')).toMatch(/@container mapwrap \(max-height:\s*28rem\)\s*\{\s*\.map-foot > \.map-empty\s*\{\s*display:\s*none/)
    expect(read('../features/map/SidePanel.tsx')).toContain('PlaceAction')
  })
})

describe('carte sur téléphone : « Ajouter une plante » et parcours', () => {
  const nav = css('mobile-nav.css')
  const facile = css('facile.css')
  const view = read('../features/map/MapView.tsx')
  it('la colonne du haut s’arrête au-dessus de « Ajouter une plante » quand il est affiché (pas quand les Options le cachent)', () => {
    expect(nav).toMatch(/\.app\[data-tab='carte'\]:has\(\.add-fab\):not\(:has\(#map-options\)\) \.map-top\s*\{[^}]*max-height:\s*calc\(100%\s*-\s*12px\s*-\s*132px\s*-\s*var\(--btn-h\)\s*-\s*\d+px\)/)
  })
  it('jardin vide : la mention sur la photo laisse la place à l’invite dans la colonne', () => {
    expect(view).toContain('{noteInColumn && !(mobileMap && emptyCard) && photoNote}')
  })
  it('Grandes touches : un lien de phrase est une boîte de 56 px, sans zone ::after qui recouvre le lien de la ligne voisine', () => {
    expect(facile).toMatch(/html\[data-big-taps\] p \.legal-link\s*\{[^}]*display:\s*inline-flex[^}]*min-height:\s*56px/)
    expect(facile).toMatch(/html\[data-big-taps\] p \.legal-link::after\s*\{\s*content:\s*none/)
  })
  it('téléphone : le bandeau « jardin d’exemple » garde 11 rem à sa phrase et passe son bouton à la ligne au lieu de l’écraser', () => {
    // Mesuré à 360 px : texte de 4 px (« Très grand ») ou 59 px (Normal) de large sur 117 px de haut ; après : une ligne de 296 px, bandeau de 83 px (66 px en Normal).
    const app = css('app.css')
    expect(app).toMatch(/\.alert\.demo-banner\s*\{[^}]*flex-wrap:\s*wrap/)
    expect(app).toMatch(/\.alert\.demo-banner > span\s*\{[^}]*flex:\s*1 1 11rem[^}]*min-width:\s*11rem/)
  })
})

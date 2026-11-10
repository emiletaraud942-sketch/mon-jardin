import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gotoMapSize } from './WalkUI'
import { essentialsClipped } from './tightPanel'

// Lot 5A : à 853×533 (ordinateur à 150 %) la scène ne fait que ≈ 290 px ; ses commandes ne doivent ni déborder ni se recouvrir,
// et le panneau « Aller à » de la promenade ne doit jamais se poser sur « Recentrer ».
const read = (f: string) => readFileSync(join(__dirname, f), 'utf8')
const css = read('garden3d.css').replace(/\/\*[\s\S]*?\*\//g, '')

/** Corps de chaque bloc `@container <query> { … }` (accolades équilibrées), réunis. */
function containerBlock(source: string, query: string): string {
  const out: string[] = []
  for (let from = 0; ; ) {
    const i = source.indexOf(`@container ${query} {`, from)
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
  return out.join('\n')
}
/** Déclarations (réunies) de toutes les règles dont le sélecteur est exactement `selector` (hors @media / @container : début de ligne). */
const rule = (source: string, selector: string): string => {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return [...source.matchAll(new RegExp(`(?:^|\\n)${esc}\\s*\\{([^}]*)\\}`, 'g'))].map((m) => m[1]).join('\n')
}

describe('scène : les commandes se mesurent sur la scène, pas sur la fenêtre', () => {
  it('la scène est un conteneur de taille (requêtes @container en hauteur et en largeur)', () => {
    expect(rule(css, '.g3d-root')).toMatch(/container-type:\s*size/)
  })
  it('le bas (panneau + barre) peut rétrécir : le panneau défile en interne, la barre Dessus / Perspective / Se promener reste entière', () => {
    expect(rule(css, '.g3d-top')).toMatch(/flex:\s*none/)
    expect(rule(css, '.g3d-bottom')).toMatch(/flex:\s*0 1 auto/)
    expect(rule(css, '.g3d-bottom')).toMatch(/min-height:\s*0/)
    expect(rule(css, '.g3d-bottom > *')).toMatch(/flex:\s*none/)
    const panel = rule(css, '.g3d-bottom > .g3d-panel')
    expect(panel).toMatch(/flex:\s*0 1 auto/)
    expect(panel).toMatch(/min-height:\s*4\.5rem/)
    expect(rule(css, '.g3d-panel')).toMatch(/overflow-y:\s*auto/)
  })
  it('scène basse (≤ 480 px) : les boutons de la promenade passent sur deux colonnes, le joystick rétrécit, « Tourner » et « Courir » tiennent sur une rangée', () => {
    const low = containerBlock(css, '(max-height: 480px)')
    expect(low).toMatch(/\.g3d-top--walk \.g3d-tools\s*\{[^}]*display:\s*grid[^}]*grid-template-columns:\s*auto auto/)
    expect(low).toMatch(/\.g3d-joy\s*\{[^}]*width:\s*clamp\(112px,\s*34cqh,\s*200px\)/)
    expect(low).toMatch(/\.g3d-pad\s*\{[^}]*grid-template-columns:\s*64px auto 64px/)
  })
  it('scène basse et large : l’heure, les saisons et la barre de vue tiennent en peu de rangées (les boutons de la barre gardent une base « auto »)', () => {
    const wide = containerBlock(css, '(min-width: 561px) and (max-height: 480px)')
    expect(wide).toMatch(/\.g3d-bar \.g3d-seg\s*\{[^}]*flex:\s*1 1 auto/)
    expect(wide).toMatch(/\.g3d-bar \.g3d-btn--label\s*\{[^}]*flex:\s*1 1 auto/)
    // Lot 6B : base de 15 rem (22 rem renvoyait « Animer » et « Réglages 3D » sur une 2e rangée : les saisons passaient sous la ligne de défilement du panneau)
    expect(wide).toMatch(/\.g3d-hourfield\s*\{[^}]*flex:\s*1 1 15rem/)
    expect(wide).not.toMatch(/22rem/)
  })
  it('sur téléphone en portrait rien ne change : joystick 44vw entre 140 et 200 px, boutons Tourner de 64 px, Courir large', () => {
    expect(rule(css, '.g3d-joy')).toMatch(/width:\s*clamp\(140px,\s*44vw,\s*200px\)/)
    expect(rule(css, '.g3d-pad')).toMatch(/grid-template-columns:\s*64px 64px/)
    expect(rule(css, '.g3d-padbtn')).toMatch(/min-width:\s*64px/)
    expect(rule(css, '.g3d-pad-run')).toMatch(/min-height:\s*56px/)
  })
})

describe('lot 6B : saisons visibles et panneau de l’heure qui tient dans sa colonne', () => {
  it('scène basse et large : l’heure, « Animer » et « Réglages 3D » tiennent sur une rangée, les saisons sur la suivante (Très grand + Grandes touches à 853×533 : 128 px, tout visible)', () => {
    const wide = containerBlock(css, '(min-width: 561px) and (max-height: 480px)')
    expect(wide).toMatch(/\.g3d-hourfield\s*\{[^}]*flex:\s*1 1 15rem/)
    // les saisons ne sont jamais réduites sous une cible tactile : aucune hauteur fixe plus petite que --tap sur leurs boutons
    expect(wide).not.toMatch(/season-picker[^{]*\{[^}]*(?<![-\w])(?:min-)?height:\s*(?:[0-3]\d|40)px/)
  })
  it('scène étroite (< 480 px) : le panneau de l’heure de la promenade se coupe en rangées entières (heure, curseur, − et +, Animer) au lieu de déborder sous « Recentrer »', () => {
    const narrow = containerBlock(css, '(max-width: 479px)')
    expect(narrow).toMatch(/\.g3d-panel--walk \.g3d-hourrow\s*\{[^}]*flex-wrap:\s*wrap/)
    expect(narrow).toMatch(/\.g3d-panel--walk \.g3d-hourfield\s*\{[^}]*display:\s*contents/)
    expect(narrow).toMatch(/\.g3d-panel--walk \.g3d-hourfield input\[type='range'\]\s*\{[^}]*flex:\s*1 0 100%[^}]*order:\s*1/)
    expect(narrow).toMatch(/\.g3d-panel--walk \.g3d-hourfield \.g3d-field-label\s*\{[^}]*flex:\s*1 0 100%/)
    expect(narrow).toMatch(/\.g3d-panel--walk \.g3d-hourrow > \.g3d-btn--label\s*\{[^}]*order:\s*3/)
  })
  it('− et + du curseur sont aussi larges que hauts en « Grandes touches » (--tap)', () => {
    expect(rule(css, '.g3d-btn--icon.g3d-step')).toMatch(/width:\s*var\(--tap,\s*44px\)/)
  })
})

describe('promenade : « Aller à » ne recouvre jamais « Recentrer » ni les autres boutons', () => {
  const goto = rule(css, '.g3d-goto')
  it('le panneau est accroché à la colonne de gauche : sa largeur est la place laissée par les boutons de droite', () => {
    expect(rule(css, '.g3d-left')).toMatch(/position:\s*relative/)
    expect(goto).toMatch(/position:\s*absolute/)
    expect(goto).toMatch(/left:\s*0/)
    expect(goto).toMatch(/width:\s*min\(360px,\s*100%\)/)
    // plus de centrage sur la scène entière (il passait sous la colonne des boutons à ≤ 1024 px)
    expect(goto).not.toMatch(/left:\s*50%/)
    expect(goto).not.toMatch(/translateX/)
  })
  it('sa hauteur suit la scène (jamais « 100 % − 200 px », qui laissait 89 px à 853×533) et il défile en interne', () => {
    expect(goto).toMatch(/max-height:\s*calc\(100cqh - var\(--tap,\s*44px\) - 24px\)/)
    expect(goto).not.toMatch(/100% - 200px/)
    expect(css).toMatch(/\.g3d-panel\s*\{[^}]*overflow-y:\s*auto/)
    expect(rule(css, '.g3d-goto-head')).toMatch(/position:\s*sticky/) // « Fermer » reste visible
  })
  it('il se pose sous la rangée Quitter / Heure, de la hauteur d’une cible tactile (--tap, 56 px en « Grandes touches »)', () => {
    expect(goto).toMatch(/top:\s*calc\(var\(--tap,\s*44px\)\s*\+\s*6px\)/)
  })
  it('sur scène étroite (< 480 px) les boutons de droite s’effacent derrière lui ; ouvert, il remplace la mini-carte et masque le bas (joystick, aide)', () => {
    expect(containerBlock(css, '(max-width: 479px)')).toMatch(/\.g3d-top--walk\[data-goto\] \.g3d-tools\s*\{[^}]*display:\s*none/)
    expect(css).toMatch(/\.g3d-top--walk\[data-goto\] \.g3d-minibtn\s*\{[^}]*display:\s*none/)
    expect(css).toMatch(/\.g3d-overlay\[data-goto\] \.g3d-bottom\s*\{[^}]*visibility:\s*hidden/)
  })
  it('scène basse : le panneau de l’heure remplace la mini-carte et l’aide « Flèches ou ZQSD… » attend sa fermeture', () => {
    const low = containerBlock(css, '(max-height: 480px)')
    expect(low).toMatch(/\.g3d-top--walk\[data-hour\] \.g3d-minibtn\s*\{[^}]*display:\s*none/)
    expect(low).toMatch(/\.g3d-top--walk\[data-hour\] ~ \.g3d-bottom \.g3d-helpchip\s*\{[^}]*visibility:\s*hidden/)
  })
  it('dans le composant, le panneau est rendu dans la colonne de gauche (avant les boutons de droite), et un seul panneau est ouvert à la fois', () => {
    const src = read('Garden3D.tsx')
    const left = src.indexOf('className="g3d-left"', src.indexOf('g3d-top--walk'))
    const panel = src.indexOf('<GotoPanel')
    const tools = src.indexOf('className="g3d-tools"', left)
    expect(left).toBeGreaterThan(0)
    expect(panel).toBeGreaterThan(left)
    expect(panel).toBeLessThan(tools)
    expect(src).toMatch(/data-goto=\{gotoOpen \|\| undefined\}/)
    expect(src).toMatch(/data-hour=\{\(hourOpen && !gotoOpen\) \|\| undefined\}/)
    expect(src).toMatch(/hourOpen && !gotoOpen &&/)
  })
  it('la grande carte d’« Aller à » rétrécit quand la fenêtre est basse (160 px sous 600 px), sinon 180 à 260 px', () => {
    expect(gotoMapSize(853, 533)).toBe(160)
    expect(gotoMapSize(740, 360)).toBe(160)
    expect(gotoMapSize(360, 740)).toBe(260)
    expect(gotoMapSize(320, 700)).toBe(256)
    expect(gotoMapSize(280, 700)).toBe(216)
    expect(gotoMapSize(200, 700)).toBe(180)
    expect(gotoMapSize(1280, 800)).toBe(260)
  })

  // Lot 8A : à 360×740 en « Très grand » + « Grandes touches », le panneau « Heure et réglages » n'avait que 91 px sur 248 (barre poussée sous la feuille du bas).
  describe('panneau « Heure et réglages » en portrait étroit', () => {
    const tight = containerBlock(css, '(max-width: 479px) and (orientation: portrait)')
    it('la règle se décide sur la scène (largeur et orientation, pas de seuil en hauteur : la scène fait 446 px à 360×740) et non sur la fenêtre', () => {
      expect(tight).not.toBe('')
      expect(css).not.toMatch(/@container \(max-width: 479px\) and \(min-height/)
    })
    it('sans place, la date, « Voir l’ensoleillement » et la boussole s’effacent ; la mention des arbres IGN reste', () => {
      expect(tight).toMatch(/\.g3d-root\[data-tight\] \.g3d-info[\s\S]*\.g3d-sunbtn[\s\S]*\.g3d-tools\s*\{[^}]*display:\s*none/)
      expect(tight).not.toMatch(/g3d-attrib/)
    })
    it('l’heure puis les saisons passent avant « Animer » et « Réglages 3D » ; le reste (jour, qualité, années) défile en interne', () => {
      expect(tight).toMatch(/\.g3d-hourrow\s*\{[^}]*display:\s*contents/)
      expect(tight).toMatch(/\.g3d-hourfield\s*\{[^}]*order:\s*1/)
      expect(tight).toMatch(/\[data-feat='saison'\]\s*\{[^}]*order:\s*2/)
      expect(tight).toMatch(/\.g3d-btn--label\s*\{[^}]*order:\s*3/)
      expect(tight).toMatch(/#g3d-time-panel > \*\s*\{[^}]*order:\s*4/)
      expect(rule(css, '.g3d-panel')).toMatch(/overflow-y:\s*auto/)
    })
    it('le composant pose data-tight seulement quand les saisons seraient sous la ligne de défilement, en mesurant sans l’attribut, et le retire à la fermeture', () => {
      const src = read('Garden3D.tsx')
      expect(src).toMatch(/essentialsClipped\(panel\)/)
      expect(src).toMatch(/removeAttribute\('data-tight'\)[\s\S]{0,80}essentialsClipped/)
      expect(src).toMatch(/setAttribute\('data-tight', ''\)/)
      expect(src).toMatch(/ro\.disconnect\(\)/)
    })
  })

  describe('essentialsClipped', () => {
    const fake = (opts: { panelBottom: number; seasonsBottom: number; scrollTop?: number; clientTop?: number; seasons?: boolean }) => {
      const seasons = { getBoundingClientRect: () => ({ bottom: opts.seasonsBottom }) }
      return {
        scrollTop: opts.scrollTop ?? 0,
        clientTop: opts.clientTop ?? 1,
        getBoundingClientRect: () => ({ bottom: opts.panelBottom }),
        querySelector: () => (opts.seasons === false ? null : seasons),
      } as unknown as HTMLElement
    }
    it('vrai si les saisons dépassent le bas visible du panneau', () => {
      expect(essentialsClipped(fake({ panelBottom: 368, seasonsBottom: 520 }))).toBe(true)
    })
    it('faux si elles tiennent (à la bordure près), ou s’il n’y a pas de saisons', () => {
      expect(essentialsClipped(fake({ panelBottom: 368, seasonsBottom: 367 }))).toBe(false)
      expect(essentialsClipped(fake({ panelBottom: 368, seasonsBottom: 999, seasons: false }))).toBe(false)
    })
    it('tient compte du défilement déjà fait (position naturelle = position + défilement)', () => {
      expect(essentialsClipped(fake({ panelBottom: 368, seasonsBottom: 300, scrollTop: 120 }))).toBe(true)
      expect(essentialsClipped(fake({ panelBottom: 368, seasonsBottom: 300, scrollTop: 40 }))).toBe(false)
    })
  })
})

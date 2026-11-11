import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { barOverflows, essentialsClipped } from './tightPanel'

// Lot 5A : à 853×533 (ordinateur à 150 %) la scène ne fait que ≈ 290 px ; ses commandes ne doivent ni déborder ni se recouvrir.
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
  it('le bas (panneau + barre) peut rétrécir : le panneau défile en interne, la barre Dessus / Perspective reste entière', () => {
    expect(rule(css, '.g3d-top')).toMatch(/flex:\s*none/)
    expect(rule(css, '.g3d-bottom')).toMatch(/flex:\s*0 1 auto/)
    expect(rule(css, '.g3d-bottom')).toMatch(/min-height:\s*0/)
    expect(rule(css, '.g3d-bottom > *')).toMatch(/flex:\s*none/)
    const panel = rule(css, '.g3d-bottom > .g3d-panel')
    expect(panel).toMatch(/flex:\s*0 1 auto/)
    expect(panel).toMatch(/min-height:\s*4\.5rem/)
    expect(rule(css, '.g3d-panel')).toMatch(/overflow-y:\s*auto/)
  })
  it('scène basse et large : l’heure, les saisons et la barre de vue tiennent en peu de rangées (les boutons de la barre gardent une base « auto »)', () => {
    const wide = containerBlock(css, '(min-width: 561px) and (max-height: 480px)')
    expect(wide).toMatch(/\.g3d-bar \.g3d-seg\s*\{[^}]*flex:\s*1 1 auto/)
    expect(wide).toMatch(/\.g3d-bar \.g3d-btn--label\s*\{[^}]*flex:\s*1 1 auto/)
    // Lot 6B : base de 15 rem (22 rem renvoyait « Animer » et « Réglages 3D » sur une 2e rangée : les saisons passaient sous la ligne de défilement du panneau)
    expect(wide).toMatch(/\.g3d-hourfield\s*\{[^}]*flex:\s*1 1 15rem/)
    expect(wide).not.toMatch(/22rem/)
  })
})

describe('lot 6B : saisons visibles et panneau de l’heure qui tient dans sa colonne', () => {
  it('scène basse et large : l’heure, « Animer » et « Réglages 3D » tiennent sur une rangée, les saisons sur la suivante (Très grand + Grandes touches à 853×533 : 128 px, tout visible)', () => {
    const wide = containerBlock(css, '(min-width: 561px) and (max-height: 480px)')
    expect(wide).toMatch(/\.g3d-hourfield\s*\{[^}]*flex:\s*1 1 15rem/)
    // les saisons ne sont jamais réduites sous une cible tactile : aucune hauteur fixe plus petite que --tap sur leurs boutons
    expect(wide).not.toMatch(/season-picker[^{]*\{[^}]*(?<![-\w])(?:min-)?height:\s*(?:[0-3]\d|40)px/)
  })
  it('− et + du curseur sont aussi larges que hauts en « Grandes touches » (--tap)', () => {
    expect(rule(css, '.g3d-btn--icon.g3d-step')).toMatch(/width:\s*var\(--tap,\s*44px\)/)
  })
})

describe('panneau de la 3D : saisons visibles, scènes très basses', () => {
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
  // Scène très basse : jardin d'exemple avec son bandeau, 360×740, « Très grand » + « Grandes touches » (scène de 321 px, rangée Heure à 466–522 px sous une feuille
  // qui commence à 488 px : un appui tombait sur la poignée de la feuille). Mesuré après : Heure à 426–482 px, au-dessus de la feuille.
  describe('scène très basse (data-squeezed)', () => {
    it('barOverflows : vrai si la barre descend sous la marge du bas (à un demi-pixel près)', () => {
      expect(barOverflows(522.4, 584, 102)).toBe(true)
      expect(barOverflows(482, 584, 102)).toBe(false)
      expect(barOverflows(482.4, 584, 102)).toBe(false)
      expect(barOverflows(483, 584, 102)).toBe(true)
    })
    it('le composant mesure sans l’attribut, pose le niveau 1 puis le niveau 2, ', () => {
      const src = read('Garden3D.tsx')
      expect(src).toMatch(/removeAttribute\('data-squeezed'\)[\s\S]{0,120}stackOverflows\(root\)/)
      expect(src).toMatch(/setAttribute\('data-squeezed', '1'\)[\s\S]{0,80}stackOverflows\(root\)[\s\S]{0,80}setAttribute\('data-squeezed', '2'\)/)
    })
    it('la CSS efface la carte de la date (niveau 1) puis « Voir l’ensoleillement » (niveau 2), sans condition d’orientation (360×321 px est « paysage »)', () => {
      const block = containerBlock(css, '(max-width: 479px)')
      expect(block).toMatch(/\.g3d-root\[data-squeezed\] \.g3d-info,\s*\.g3d-root\[data-squeezed='2'\] \.g3d-sunbtn\s*\{[^}]*display:\s*none/)
    })
    it('on n’observe jamais la carte de la date ni le bouton d’ensoleillement (leur taille change avec l’attribut : boucle)', () => {
      const src = read('Garden3D.tsx')
      const effect = src.slice(src.indexOf("const measure = () => {\n      root.removeAttribute('data-squeezed')"), src.indexOf('}, [collapsed, panelOpen])\n  const compassRef'))
      expect(effect).toContain('ro.observe(root)')
      expect(effect).not.toMatch(/g3d-info|g3d-sunbtn/)
    })
  })
  it('le panneau de la 3D montre par une ombre qu’il reste du contenu à faire défiler (couches « local » + ombres fixes, sans script)', () => {
    const panel = rule(css, '.g3d-panel')
    expect(panel).toMatch(/linear-gradient\(var\(--g3d-panel-bg\) 30%, transparent\) top \/ 100% 16px no-repeat local/)
    expect(panel).toMatch(/linear-gradient\(transparent, var\(--g3d-panel-bg\) 70%\) bottom \/ 100% 16px no-repeat local/)
    expect(panel).toMatch(/radial-gradient\(farthest-side at 50% 0, rgb\([^)]*\), transparent\) top \/ 100% 10px no-repeat scroll/)
    expect(panel).toMatch(/radial-gradient\(farthest-side at 50% 100%, rgb\([^)]*\), transparent\) bottom \/ 100% 10px no-repeat scroll/)
  })
})

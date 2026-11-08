import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { FEATURES } from './features'
import { HOME_ACTIONS, HOME_HELPERS } from './homeActions'

const words = (s: string) => s.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length
const css = readFileSync(join(__dirname, '../styles/facile.css'), 'utf8')

describe('gros boutons de l’accueil', () => {
  it('l’ordre est fixe et les mots sont ceux du propriétaire', () => {
    expect(HOME_ACTIONS.map((a) => a.mot)).toEqual([
      'Ajouter une plante',
      'Voir mon jardin',
      'Me promener dans mon jardin en 3D',
      'Photos du jardin',
      'Scanner mon jardin',
      'Ce qu’il y a à faire',
      'Où planter ?',
      'Voisins',
      'Tout ce que je peux faire',
      'Aide',
    ])
    expect(HOME_HELPERS.map((a) => a.mot)).toEqual(['Je ne sais pas par où commencer', 'Je suis perdu'])
  })

  it('chaque bouton lance une fonction du registre, ou une page d’aide', () => {
    const ids = new Set(FEATURES.map((f) => f.id))
    for (const a of [...HOME_ACTIONS, ...HOME_HELPERS]) {
      expect(!!a.featureId !== !!a.special, a.id).toBe(true)
      if (a.featureId) expect(ids.has(a.featureId), `${a.id} → ${a.featureId}`).toBe(true)
    }
  })

  it('« Voisins » dépend de l’entraide (visibleSi du registre)', () => {
    const voisins = HOME_ACTIONS.find((a) => a.id === 'voisins')!
    expect(FEATURES.find((f) => f.id === voisins.featureId)?.visibleSi).toBeTypeOf('function')
  })

  it('un verbe ou un nom, une phrase courte d’une ligne, jamais une icône seule', () => {
    for (const a of [...HOME_ACTIONS, ...HOME_HELPERS]) {
      expect(a.mot.trim().length, a.id).toBeGreaterThan(3)
      expect(words(a.phrase), a.id).toBeLessThanOrEqual(20)
      expect(a.phrase.length, `${a.id} : ${a.phrase}`).toBeLessThanOrEqual(36)
      expect(a.icon.length).toBeGreaterThan(0)
    }
  })

  it('les gros boutons font 56 px de haut au moins', () => {
    const min = (sel: string) => Number(css.match(new RegExp(`\\n${sel.replace(/[.[\]]/g, '\\$&')} \\{[^}]*min-height: (\\d+)px`))?.[1])
    expect(min('.home-btn')).toBeGreaterThanOrEqual(56)
    expect(min('.guide-btn')).toBeGreaterThanOrEqual(56)
    expect(min('.tour-btn')).toBeGreaterThanOrEqual(56)
  })

  it('« Je suis perdu » ne flotte plus par-dessus l’accueil ni les écrans du téléphone', () => {
    expect(css).toMatch(/\.app\[data-tab='accueil'\] \.lost-fab \{\s*display: none;/)
    expect(css).toMatch(/@media \(max-width: 760px\) \{[^@]*\.app \.lost-fab,[^}]*position: static/)
  })
})

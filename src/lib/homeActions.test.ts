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
      'Jardin partagé',
      'Apprendre à jardiner',
      'Compost et économie d’eau',
      'Voir mon jardin',
      'Visiter mon jardin en photos',
      'Photos du jardin',
      'Scanner mon jardin',
      'Ce qu’il y a à faire',
      'Où planter ?',
      'Voisins',
      'Tout ce que je peux faire',
    ])
    expect(HOME_HELPERS.map((a) => a.mot)).toEqual(['Je ne sais pas par où commencer', 'Je suis perdu'])
  })

  it('« Apprendre à jardiner » puis « Compost et économie d’eau » sont sur l’accueil, juste après « Ajouter une plante » et « Jardin partagé », mis à l’honneur sans être le bouton plein', () => {
    const i = HOME_ACTIONS.findIndex((a) => a.id === 'apprendre')
    expect(i).toBe(2)
    expect(HOME_ACTIONS[i]).toMatchObject({ featureId: 'apprendre-jardiner', featured: true })
    expect(HOME_ACTIONS[i].primary).toBeFalsy()
    expect(HOME_ACTIONS[3]).toMatchObject({ id: 'conseils', featureId: 'conseils-compost-eau', featured: true })
    expect(HOME_ACTIONS[3].primary).toBeFalsy()
    expect(HOME_ACTIONS.filter((a) => a.featured).map((a) => a.id)).toEqual(['apprendre', 'conseils'])
    expect(HOME_ACTIONS.filter((a) => a.primary).map((a) => a.id)).toEqual(['ajouter'])
    expect(css).toMatch(/\.home-btn\.featured \{\s*border-color: var\(--accent\);\s*background: var\(--accent-soft\);/)
    expect(css).toMatch(/\.home-btn\.featured \.home-btn-text span \{\s*color: var\(--muted-2\);/)
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

describe('« Apprendre à jardiner » : phrase de progression', () => {
  it('sans leçon faite : la phrase d’origine ; ensuite où l’on en est ; tout fait : un bravo — toujours 36 caractères au plus', async () => {
    const { lessonsPhrase } = await import('../features/onboarding/Accueil')
    const { LECON_OUTLINE } = await import('../features/lecons/outline')
    const ids = LECON_OUTLINE.map((l) => l.id)
    expect(lessonsPhrase([])).toBeUndefined()
    expect(lessonsPhrase(ids.slice(0, 1))).toBe('1 leçon sur 14. On continue ?')
    expect(lessonsPhrase(ids.slice(0, 5))).toBe('5 leçons sur 14. On continue ?')
    expect(lessonsPhrase(ids)).toBe('Tout est fait. Bravo !')
    for (let n = 1; n <= ids.length; n++) expect(lessonsPhrase(ids.slice(0, n))!.length).toBeLessThanOrEqual(36)
  })
})

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'
import { LECONS, NIVEAUX, getLecon } from '../../data/lecons'
import { SPECIES_BY_ID } from '../../data/species'
import { FEATURES, searchFeatures, visibleFeatures } from '../../lib/features'
import { leconsOpen, openLecon } from '../../lib/overlays'
import { sentencesOf, wordCount, MAX_WORDS } from '../../lib/sentences'
import LeconsScreen, { A_RELIRE, LECONS_TITLE, LeconSheet, LeconsList, NOTE_CONTENU } from './LeconsScreen'
import { LECON_OUTLINE } from './outline'
import { QUIZ_TEXT, Quiz, plainExplanation } from './Quiz'

const noop = () => undefined
const sheet = (id: string, done = false) =>
  renderToStaticMarkup(createElement(LeconSheet, { l: getLecon(id)!, done, onToggleDone: noop, onOpen: noop, onSpecies: noop, onTry: noop }))
const list = (done: string[]) => renderToStaticMarkup(createElement(LeconsList, { done, onOpen: noop }))
const screen = (initialId?: string) => renderToStaticMarkup(createElement(LeconsScreen, { initialId }))
const ids = LECON_OUTLINE.map((l) => l.id)

describe('leçons : remettre à zéro', () => {
  const withReset = (done: string[]) => renderToStaticMarkup(createElement(LeconsList, { done, onOpen: noop, onReset: noop }))
  it('le bouton n’apparaît que s’il y a un suivi à effacer et une action branchée', () => {
    expect(withReset(ids.slice(0, 2))).toContain('Remettre à zéro mon suivi')
    expect(withReset(ids.slice(0, 2))).toContain('data-lecon-reset')
    expect(withReset([])).not.toContain('Remettre à zéro')
    expect(list(ids.slice(0, 2))).not.toContain('Remettre à zéro')
  })
  it('l’écran branche l’action et propose « Annuler » (30 s) pour remettre les coches', () => {
    const src = readFileSync(join(__dirname, 'LeconsScreen.tsx'), 'utf8')
    expect(src).toMatch(/onReset=\{reset\}/)
    expect(src).toMatch(/resetProgress\(\)[\s\S]{0,160}actionLabel: 'Annuler'[\s\S]{0,80}restoreProgress\(before\)/)
  })
})

describe('leçons : liste', () => {
  it('au départ : « Aucune leçon terminée », « Commencer la leçon 1 », 14 lignes en 4 niveaux', () => {
    const h = list([])
    expect(h).toContain('Aucune leçon terminée sur 14')
    expect(h).toContain('Commencer la leçon 1')
    expect(h).toContain('<progress')
    expect(h).toContain('value="0"')
    expect(h.match(/data-lecon-id=/g)).toHaveLength(LECONS.length)
    for (const n of NIVEAUX) expect(h).toContain(n.libelle)
    expect(h.match(/<h2 /g)).toHaveLength(NIVEAUX.length)
    expect(h).toContain('4 min')
    expect(h).not.toContain('Terminée')
  })

  it('cinq leçons faites : « 5 leçons sur 14 », « Reprendre : leçon 6, … », ✓ « Terminée » (icône et mot)', () => {
    const h = list(ids.slice(0, 5))
    expect(h).toContain('5 leçons sur 14')
    expect(h).toContain(`Reprendre : leçon 6, ${LECONS[5].titre}`)
    expect(h.match(/lecon-done/g)).toHaveLength(5)
    expect(h.match(/<svg[^>]*>.{0,200}<\/svg> Terminée/g)).toHaveLength(5)
    expect(h).toContain('value="36"')
  })

  it('une leçon : « 1 leçon sur 14 » (singulier)', () => {
    expect(list(ids.slice(0, 1))).toContain('1 leçon sur 14')
  })

  it('tout fait : un mot d’encouragement, plus de bouton « Reprendre »', () => {
    const h = list(ids)
    expect(h).toContain('14 leçons sur 14')
    expect(h).toContain('Vous avez fait toutes les leçons')
    expect(h).not.toContain('Reprendre')
    expect(h).toContain('value="100"')
  })

  it('l’écran porte son titre, son repère, la mention « à relire » et un calque modal', () => {
    const h = screen()
    expect(h).toContain(`aria-label="${LECONS_TITLE}"`)
    expect(h).toContain('data-feat="lecons"')
    expect(h).toContain('aria-modal="true"')
    expect(h).toContain(NOTE_CONTENU)
    expect(A_RELIRE).toBe(true)
    expect(NOTE_CONTENU).toContain('relire par un jardinier ou un formateur')
    expect(h).toContain('<h1>Apprendre à jardiner</h1>')
  })
})

describe('leçons : ouverture d’emblée et identifiant inconnu', () => {
  it('une leçon ouverte d’emblée cache la liste et propose le retour', () => {
    const h = screen('connaitre-sol')
    expect(h).toContain(`aria-label="${getLecon('connaitre-sol')!.titre}"`)
    expect(h).toContain('data-lecon="connaitre-sol"')
    expect(h).toMatch(/class="tf-body ennui-body" hidden/)
    expect(h).toContain('Retour à la liste')
  })
  it('un identifiant inconnu ouvre la liste, jamais une fiche vide', () => {
    for (const bad of ['nimporte-quoi', '__proto__', 'constructor', '']) expect(screen(bad), bad).not.toContain('data-lecon="')
  })
})

describe('leçons : fiche', () => {
  it('chaque fiche : durée, objectif, points numérotés, quiz de 3 questions, bouton « Marquer comme terminée »', () => {
    for (const l of LECONS) {
      const h = sheet(l.id)
      expect(h, l.id).toContain(`${l.minutes} min`)
      expect(h, l.id).toContain(l.objectif)
      expect(h, l.id).toContain('<ol class="conseil-steps lecon-points">')
      expect(h.match(/<legend>/g), l.id).toHaveLength(3)
      expect(h.match(/type="radio"/g)!.length, l.id).toBeGreaterThanOrEqual(6)
      expect(h, l.id).toContain('Marquer comme terminée')
      expect(h, l.id).not.toContain('<details')
    }
  })

  it('l’attention porte un mot, une icône et un rôle, seulement quand la leçon en a une', () => {
    for (const l of LECONS) {
      const h = sheet(l.id)
      if (l.attention) {
        expect(h, l.id).toContain('<strong>Attention</strong>')
        expect(h, l.id).toContain('role="note"')
      } else expect(h, l.id).not.toContain('Attention')
    }
  })

  it('terminée : le mot « Terminée », le bouton « Rouvrir »', () => {
    const h = sheet('eau-jardin', true)
    expect(h).toContain('Terminée')
    expect(h).toContain('Rouvrir cette leçon')
    expect(h).not.toContain('Marquer comme terminée')
    expect(sheet('eau-jardin')).not.toContain('Rouvrir')
  })

  it('« Essayez dans votre jardin » reprend le libellé de la leçon et la fonction du registre', () => {
    const l = getLecon('connaitre-sol')!
    const h = sheet(l.id)
    expect(h).toContain('Essayez dans votre jardin')
    expect(h).toContain(l.essayer!.libelle)
    expect(h).toContain(`data-lecon-try="${l.essayer!.fonction}"`)
    const sans = LECONS.filter((x) => !x.essayer)
    for (const x of sans) expect(sheet(x.id)).not.toContain('Essayez dans votre jardin')
  })

  it('les plantes citées sont des pastilles, jamais un identifiant inconnu', () => {
    const h = sheet('observer-jardin')
    expect(h).toContain('Plantes citées')
    expect(h).toContain(SPECIES_BY_ID.tomate.nomCommun)
    for (const l of LECONS) for (const id of l.planteIds ?? []) expect(SPECIES_BY_ID[id], `${l.id} : ${id}`).toBeDefined()
    const sans = LECONS.find((l) => !l.planteIds?.length)
    if (sans) expect(sheet(sans.id)).not.toContain('Plantes citées')
  })

  it('« Pour aller plus loin » renvoie vers des leçons qui existent ; « Leçon suivante » en bas, sauf à la dernière', () => {
    const h = sheet('observer-jardin')
    expect(h).toContain('Pour aller plus loin')
    expect(h).toContain('data-lecon-id="connaitre-sol"')
    expect(h).toContain(`data-lecon-next="connaitre-sol"`)
    expect(h.indexOf('data-lecon-next')).toBeGreaterThan(h.indexOf('Pour aller plus loin'))
    expect(h.indexOf('data-lecon-next')).toBeGreaterThan(h.indexOf('data-lecon-done'))
    const last = LECONS[LECONS.length - 1]
    expect(sheet(last.id)).not.toContain('data-lecon-next')
    expect(sheet(last.id)).toContain('dernière leçon')
  })

  it('la source et la mention « à relire » sont données', () => {
    const h = sheet('eau-jardin')
    expect(h).toContain('Source : ')
    expect(h).toContain(NOTE_CONTENU)
  })
})

describe('leçons : quiz', () => {
  const l = getLecon('observer-jardin')!
  const quiz = () => renderToStaticMarkup(createElement(Quiz, { lessonId: l.id, questions: l.quiz }))

  it('groupes de choix natifs (fieldset, légende, radios), zone annoncée par question, résultat en role="status"', () => {
    const h = quiz()
    expect(h.match(/<fieldset/g)).toHaveLength(3)
    expect(h.match(/aria-live="polite"/g)!.length).toBeGreaterThanOrEqual(4)
    expect(h).toContain('role="status"')
    expect(h).toContain(QUIZ_TEXT.check)
    expect(h).not.toContain(QUIZ_TEXT.retry)
    expect(h).toContain('Question 1 sur 3')
  })

  it('aucune note chiffrée, jamais « faux » : ni dans les textes du quiz ni dans les explications', () => {
    const all = [...Object.values(QUIZ_TEXT), ...LECONS.flatMap((x) => x.quiz.map((q) => plainExplanation(q.explication)))].join(' ')
    expect(all).not.toMatch(/\bfaux\b|\bfausse\b|\bmauvaise\b|\d+\s*(?:\/|sur)\s*\d+|\bpoints?\b.*\bscore\b/i)
    expect(QUIZ_TEXT.notYet).toBe('Pas encore.')
  })

  it('plainExplanation retire le compliment d’ouverture et garde le sens', () => {
    expect(plainExplanation('Oui, les légumes-fruits donnent mieux.')).toBe('Les légumes-fruits donnent mieux.')
    expect(plainExplanation('Bien vu : en hiver le soleil est bas.')).toBe('En hiver le soleil est bas.')
    expect(plainExplanation('Exact : un sol aéré.')).toBe('Un sol aéré.')
    expect(plainExplanation('Bravo : une terre piétinée se tasse.')).toBe('Une terre piétinée se tasse.')
    expect(plainExplanation('Une phrase sans compliment.')).toBe('Une phrase sans compliment.')
    for (const x of LECONS) for (const q of x.quiz) expect(plainExplanation(q.explication).length, x.id).toBeGreaterThan(15)
  })
})

describe('leçons : textes de l’écran', () => {
  it('phrases de 20 mots au plus, sans jargon', () => {
    const texts = [
      NOTE_CONTENU,
      QUIZ_TEXT.intro,
      QUIZ_TEXT.missing,
      QUIZ_TEXT.right,
      QUIZ_TEXT.notYet,
      QUIZ_TEXT.allRight,
      QUIZ_TEXT.somePending,
      'Vous avez fait toutes les leçons. Bravo ! Vous pouvez les relire quand vous voulez.',
      'Cochez-la dans votre liste pour retrouver votre place.',
      'C’est la dernière leçon du parcours. Bravo pour votre curiosité !',
      FEATURES.find((f) => f.id === 'apprendre-jardiner')!.phrase,
    ]
    for (const t of texts) for (const s of sentencesOf(t)) expect(wordCount(s), s).toBeLessThanOrEqual(MAX_WORDS)
    const jargon = /strate|vivace|canopée|tuile|recalage|mellifère|diagnostic/i
    for (const t of [LECONS_TITLE, ...texts, list([]), sheet('observer-jardin')]) expect(t).not.toMatch(jargon)
  })
})

describe('leçons : registre et ouverture', () => {
  const f = FEATURES.find((x) => x.id === 'apprendre-jardiner')!
  afterEach(() => leconsOpen.set(undefined))

  it('la fonction est au registre, visible, avec son repère et sa rubrique', () => {
    expect(f).toBeDefined()
    expect(f.cible).toBe('lecons')
    expect(f.mot).toBe('Apprendre à jardiner')
    expect(f.rubrique).toBe('afaire')
    expect(wordCount(f.phrase)).toBeLessThanOrEqual(MAX_WORDS)
    expect(visibleFeatures().map((x) => x.id)).toContain('apprendre-jardiner')
    expect(FEATURES).toHaveLength(89)
  })
  it('on la trouve avec les mots d’un débutant', () => {
    for (const q of ['leçon', 'leçons', 'apprendre', 'formation', 'permaculture', 'débutant', 'cours'])
      expect(
        searchFeatures(q).map((x) => x.id),
        q,
      ).toContain('apprendre-jardiner')
  })
  it('run() ouvre l’écran sans état caché, openLecon() ouvre une leçon', () => {
    f.run()
    expect(leconsOpen.get()).toEqual({})
    openLecon('eau-jardin')
    expect(leconsOpen.get()).toEqual({ id: 'eau-jardin' })
  })
  it('chaque « Essayez » mène à une fonction du registre', () => {
    for (const l of LECONS)
      if (l.essayer)
        expect(
          FEATURES.some((x) => x.id === l.essayer!.fonction),
          l.id,
        ).toBe(true)
  })
})

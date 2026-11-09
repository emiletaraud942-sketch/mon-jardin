import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ENNUIS } from '../../data/ravageurs'
import { FEATURES, searchFeatures, visibleFeatures } from '../../lib/features'
import { ennuisOpen, openEnnui } from '../../lib/overlays'
import { A_RELIRE, ENNUIS_TITLE, EnnuiSheet, NOTE_CONTENU } from './EnnuisScreen'
import { GROUPS, TYPE_LABEL } from './filter'

const words = (s: string) => s.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length
const sentences = (s: string) => s.split(/(?<=[.!?])\s+(?=[A-ZÀ-ÖØ-Þ«“"'])/).filter(Boolean)
const html = (id: string, mine: string[] = []) => renderToStaticMarkup(createElement(EnnuiSheet, { e: ENNUIS.find((e) => e.id === id)!, mine: new Set(mine), onSpecies: () => undefined }))

describe('guide des ennuis : fiche', () => {
  it('chaque fiche a ses sections au premier niveau, dans l’ordre', () => {
    for (const e of ENNUIS) {
      const h = html(e.id)
      let at = -1
      for (const t of ['Ce que je vois', 'Quand', 'Pour l’éviter', 'Que faire', 'Quand demander conseil']) {
        const i = h.indexOf(`>${t}</h2>`)
        expect(i, `${e.id} : ${t}`).toBeGreaterThan(at)
        at = i
      }
      expect(h).not.toContain('<details')
    }
  })

  it('l’avertissement porte un mot et une icône, seulement quand la fiche en a un', () => {
    for (const e of ENNUIS) {
      const h = html(e.id)
      if (e.avertissement) {
        expect(h, e.id).toContain('<strong>Attention</strong>')
        expect(h, e.id).toContain('role="note"')
      } else expect(h, e.id).not.toContain('Attention')
    }
  })

  it('les mois sont écrits en lettres et la source est donnée', () => {
    const h = html('puceron')
    expect(h).toContain('On le voit surtout d’avril à septembre.')
    expect(h).toContain('Source : ')
    expect(h).toContain(NOTE_CONTENU)
  })

  it('les plantes du jardin sont marquées, les autres non', () => {
    const h = html('mildiou', ['tomate'])
    expect(h).toContain('aria-label="Tomate (dans votre jardin)"')
    expect(h).toContain('dans votre jardin')
    expect(html('mildiou')).not.toContain('dans votre jardin')
  })

  it('la mention « à relire » suit l’état du projet', () => {
    expect(A_RELIRE).toBe(true)
    expect(NOTE_CONTENU).toContain('relire par un jardinier')
    expect(NOTE_CONTENU).toContain('sans produit chimique de synthèse')
  })

  it('aucun mot de jargon dans les textes de l’écran', () => {
    const texts = [ENNUIS_TITLE, NOTE_CONTENU, ...GROUPS.map((g) => g.label), ...Object.values(TYPE_LABEL), html('puceron')]
    for (const t of texts) expect(t).not.toMatch(/ravageur/i)
  })

  it('les phrases de l’écran ont 20 mots au plus', () => {
    const texts = [NOTE_CONTENU, 'Rien ne correspond : essayez un autre mot.', 'Chercher un signe ou un nom : feuilles collantes, taches brunes, trous…', 'Seulement ce que je peux voir ce mois-ci (novembre)', 'Seulement pour mes plantes (ajoutez d’abord une plante)', 'Les plantes marquées d’une coche sont dans votre jardin.']
    for (const t of texts) for (const s of sentences(t)) expect(words(s), s).toBeLessThanOrEqual(20)
  })
})

describe('guide des ennuis : registre et ouverture', () => {
  const f = FEATURES.find((x) => x.id === 'guide-ravageurs')!

  it('la fonction est au registre, visible, avec son repère', () => {
    expect(f).toBeDefined()
    expect(f.cible).toBe('guide-ennuis')
    expect(f.mot).toBe('Reconnaître un ennui du jardin')
    expect(visibleFeatures().map((x) => x.id)).toContain('guide-ravageurs')
  })

  it('on la trouve avec les mots d’un jardinier', () => {
    for (const q of ['puceron', 'pucerons', 'limace', 'mildiou', 'maladie', 'bestiole', 'traitement', 'feuilles']) {
      expect(searchFeatures(q).map((x) => x.id), q).toContain('guide-ravageurs')
    }
  })

  it('run() ouvre l’écran sans état caché, openEnnui() ouvre une fiche', () => {
    ennuisOpen.set(undefined)
    f.run()
    expect(ennuisOpen.get()).toEqual({})
    openEnnui('mildiou')
    expect(ennuisOpen.get()).toEqual({ id: 'mildiou' })
    ennuisOpen.set(undefined)
  })
})

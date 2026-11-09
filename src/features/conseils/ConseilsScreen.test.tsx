import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'
import { CONSEIL_THEMES, CONSEILS, getConseil } from '../../data/conseils'
import { SPECIES_BY_ID } from '../../data/species'
import { FEATURES, searchFeatures, visibleFeatures } from '../../lib/features'
import { conseilsOpen, openConseil } from '../../lib/overlays'
import ConseilsScreen, { A_RELIRE, CONSEILS_TITLE, ConseilSheet, NOTE_CONTENU } from './ConseilsScreen'
import { ALERT_CONSEIL } from './links'

const words = (s: string) => s.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length
const sentences = (s: string) => s.split(/(?<=[.!?])\s+(?=[A-ZÀ-ÖØ-Þ«“"'])/).filter(Boolean)
const html = (id: string) => renderToStaticMarkup(createElement(ConseilSheet, { c: getConseil(id)!, onSpecies: () => undefined }))

describe('conseils : fiche', () => {
  it('chaque fiche a ses sections au premier niveau, dans l’ordre', () => {
    for (const c of CONSEILS) {
      const h = html(c.id)
      expect(h.indexOf('>Étape par étape</h2>'), c.id).toBeGreaterThan(-1)
      expect(h, c.id).toContain('<ol class="conseil-steps">')
      expect(h.match(/<li>/g)!.length, c.id).toBeGreaterThanOrEqual(c.etapes.length)
      if (c.astuces?.length) expect(h.indexOf('>Astuces</h2>'), c.id).toBeGreaterThan(h.indexOf('>Étape par étape</h2>'))
      else expect(h, c.id).not.toContain('>Astuces</h2>')
      expect(h).not.toContain('<details')
    }
  })

  it('l’attention porte un mot, une icône et un rôle, seulement quand la fiche en a une', () => {
    for (const c of CONSEILS) {
      const h = html(c.id)
      if (c.attention) {
        expect(h, c.id).toContain('<strong>Attention</strong>')
        expect(h, c.id).toContain('role="note"')
        expect(h, c.id).toContain('<svg')
      } else expect(h, c.id).not.toContain('Attention')
    }
  })

  it('les plantes citées sont des pastilles, jamais un identifiant inconnu', () => {
    const h = html('eau-plantes-seches')
    expect(h).toContain('Plantes citées')
    expect(h).toContain(SPECIES_BY_ID.lavande.nomCommun)
    expect(html('eau-pailler')).not.toContain('Plantes citées')
    for (const c of CONSEILS) for (const id of c.planteIds ?? []) expect(SPECIES_BY_ID[id], `${c.id} : ${id}`).toBeDefined()
  })

  it('la source et la mention « à relire » sont données', () => {
    const h = html('eau-pailler')
    expect(h).toContain('Source : ')
    expect(h).toContain(NOTE_CONTENU)
    expect(h).toContain('Surtout d’avril à juillet.')
    expect(A_RELIRE).toBe(true)
    expect(NOTE_CONTENU).toContain('relire par un jardinier')
  })

  it('les phrases de l’écran ont 20 mots au plus, sans jargon', () => {
    const texts = [NOTE_CONTENU, 'Rien ne correspond : essayez un autre mot.', 'Chercher un mot : paillage, épluchures, pluie, arroser…', 'Seulement ce qui concerne ce mois-ci (novembre)', ALERT_CONSEIL.secheresse!.label]
    for (const t of texts) for (const s of sentences(t)) expect(words(s), s).toBeLessThanOrEqual(20)
    for (const t of [CONSEILS_TITLE, NOTE_CONTENU, ...CONSEIL_THEMES.map((x) => x.libelle), html('compost-demarrer')]) expect(t).not.toMatch(/strate|vivace|canopée|lixivi/i)
  })
})

describe('conseils : écran', () => {
  const screen = (initialId?: string) => renderToStaticMarkup(createElement(ConseilsScreen, { initialId }))

  it('la liste montre trois tuiles, la recherche, le mois et une ligne par fiche', () => {
    const h = screen()
    expect(h).toContain(`aria-label="${CONSEILS_TITLE}"`)
    expect(h).toContain('data-feat="conseils"')
    expect(h).toContain('aria-modal="true"')
    expect(h.match(/class="conseil-tile[ "]/g)).toHaveLength(3)
    expect(h).toContain('>Compost<')
    expect(h).toContain('Économiser l’eau')
    expect(h).toContain('type="search"')
    expect(h).toContain('Seulement ce qui concerne ce mois-ci (')
    expect(h.match(/data-conseil-id=/g)).toHaveLength(CONSEILS.length)
    expect(h).toContain(`${CONSEILS.length} fiches.`)
    expect(h).not.toContain('Rien ne correspond')
    expect(h).toContain(NOTE_CONTENU)
  })

  it('« Tout » est le choix de départ ; la fiche ouverte d’emblée cache la liste', () => {
    expect(screen()).toMatch(/conseil-tile conseil-tile-all on"[^>]*aria-pressed="true"/)
    const h = screen('eau-pailler')
    expect(h).toContain('aria-label="Pailler pour garder l’humidité"')
    expect(h).toContain('data-conseil="eau-pailler"')
    expect(h).toMatch(/class="tf-body ennui-body" hidden/)
    expect(h).toContain('Retour à la liste')
  })

  it('un identifiant inconnu ouvre la liste, jamais une fiche vide', () => {
    expect(screen('nimporte-quoi')).not.toContain('data-conseil="')
    expect(screen('__proto__')).not.toContain('data-conseil="')
  })
})

describe('conseils : registre, ouverture et liens', () => {
  const f = FEATURES.find((x) => x.id === 'conseils-compost-eau')!
  afterEach(() => conseilsOpen.set(undefined))

  it('la fonction est au registre, visible, avec son repère et la rubrique du guide des ennuis', () => {
    expect(f).toBeDefined()
    expect(f.cible).toBe('conseils')
    expect(f.mot).toBe('Lire les conseils compost et économie d’eau')
    expect(f.rubrique).toBe(FEATURES.find((x) => x.id === 'guide-ravageurs')!.rubrique)
    expect(words(f.phrase)).toBeLessThanOrEqual(20)
    expect(visibleFeatures().map((x) => x.id)).toContain('conseils-compost-eau')
  })

  it('on la trouve avec les mots d’un jardinier', () => {
    for (const q of ['compost', 'eau', 'arrosage', 'paillage', 'pluie', 'épluchures', 'économiser']) {
      expect(searchFeatures(q).map((x) => x.id), q).toContain('conseils-compost-eau')
    }
  })

  it('run() ouvre l’écran sans état caché, openConseil() ouvre une fiche', () => {
    f.run()
    expect(conseilsOpen.get()).toEqual({})
    openConseil('eau-canicule')
    expect(conseilsOpen.get()).toEqual({ id: 'eau-canicule' })
  })

  it('les liens des alertes mènent à une fiche qui existe', () => {
    for (const [kind, l] of Object.entries(ALERT_CONSEIL)) expect(getConseil(l!.id), kind).toBeDefined()
    expect(ALERT_CONSEIL.vent).toBeUndefined()
  })
})

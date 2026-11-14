import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { FEATURES, searchFeatures, visibleFeatures } from '../../lib/features'
import { HOME_ACTIONS } from '../../lib/homeActions'
import { emptyEventsText, RADII } from '../../lib/neighbors/logic'
import type { EventItem } from '../../lib/neighbors/types'
import { EventDetail } from './EventDetail'
import { EventCard, EventsEmpty } from './Events'

const words = (s: string) => s.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length
const sentences = (s: string) => s.split(/(?<=[.!?])\s+(?=[A-ZÀ-ÖØ-Þ«“"'])/).filter(Boolean)
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;|&#39;/g, '’').replace(/\s+/g, ' ')

const inDays = (d: number, h = 14) => {
  const x = new Date(Date.now() + d * 86_400_000)
  x.setHours(h, 0, 0, 0)
  return x.toISOString()
}
function ev(o: Partial<EventItem> = {}): EventItem {
  return {
    id: '3f2a9c10-0000-4000-8000-000000000001',
    organizerId: 'o1',
    organizerName: 'Les Jardiniers du quartier',
    organizerDescription: 'Une association de jardiniers.',
    mine: false,
    title: 'Atelier de taille des rosiers',
    description: 'Venez avec votre sécateur.',
    startsAt: inDays(5),
    endsAt: inDays(5, 16),
    place: 'Jardin partagé du quartier',
    signupUrl: 'https://asso.exemple.fr/inscription',
    capacity: 12,
    status: 'open',
    interestCount: 3,
    interested: false,
    cell: { lat: 48.86, lon: 2.34 },
    createdAt: new Date().toISOString(),
    distanceKm: 3,
    distanceLabel: 'à environ 3 km',
    ...o,
  }
}
const noop = () => undefined
const card = (e: EventItem) => renderToStaticMarkup(createElement(EventCard, { event: e, online: true, onOpen: noop, onChange: noop }))

describe('liste des événements : une carte', () => {
  it('date en lettres, lieu, organisateur, places et intérêt', () => {
    const h = text(card(ev()))
    expect(h).toContain('Atelier de taille des rosiers')
    expect(h).toMatch(/Quand .*(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche) \d{1,2} \p{L}+ \d{4}, de 14 h 00 à 16 h 00/u)
    expect(h).toContain('Où Jardin partagé du quartier')
    expect(h).toContain('Organisé par Les Jardiniers du quartier')
    expect(h).toContain('12 places annoncées')
    expect(h).toContain('3 personnes intéressées')
    expect(h).toContain('S’inscrire')
  })

  it('« Ajouter à mon calendrier » et « Partager » : mot visible, nom accessible qui le contient, jamais seulement une icône', () => {
    const h = card(ev())
    const cal = /<button[^>]*aria-label="Ajouter à mon calendrier : Atelier de taille des rosiers"[^>]*>([\s\S]*?)<\/button>/.exec(h)
    const sh = /<button[^>]*aria-label="Partager cet événement : Atelier de taille des rosiers"[^>]*>([\s\S]*?)<\/button>/.exec(h)
    expect(cal && text(cal[1]).trim()).toBe('Ajouter à mon calendrier')
    expect(sh && text(sh[1]).trim()).toBe('Partager')
    expect(h.match(/class="btn"/g)?.length).toBeGreaterThanOrEqual(2)
  })

  it('un événement annulé ou terminé n’a ni calendrier ni partage', () => {
    for (const e of [ev({ status: 'cancelled' }), ev({ startsAt: inDays(-3), endsAt: inDays(-3, 16) })]) {
      const h = card(e)
      expect(h).not.toContain('Ajouter à mon calendrier')
      expect(h).not.toContain('Partager')
    }
  })

  it('mes propres événements : « Vous », et les boutons de partage restent', () => {
    const h = text(card(ev({ mine: true })))
    expect(h).toContain('Organisé par Vous')
    expect(h).toContain('Ajouter à mon calendrier')
    expect(h).not.toContain('Signaler')
  })

  it('lien d’inscription non valable : pas de bouton « S’inscrire »', () => {
    expect(card(ev({ signupUrl: null }))).not.toContain('S’inscrire')
  })
})

describe('liste vide', () => {
  const html = (o: { org?: Parameters<typeof EventsEmpty>[0]['org']; radius?: number } = {}) =>
    renderToStaticMarkup(createElement(EventsEmpty, { radius: o.radius ?? RADII[0], org: 'org' in o ? o.org : null, onRadius: noop, onOrganizer: noop }))

  it('dit qui publie et qu’il n’y a encore rien près d’ici', () => {
    const t = text(html())
    expect(t).toContain('Pas encore d’événement près de chez vous')
    expect(t).toContain('organisateurs vérifiés : associations, mairies, jardins partagés')
    expect(t).toContain('Il n’y en a pas encore près de chez vous.')
  })

  it('propose deux gestes visibles : devenir organisateur, inviter une association ou une mairie', () => {
    const h = html()
    expect(text(h)).toContain('Devenir organisateur')
    expect(text(h)).toContain('Inviter une association ou une mairie à publier')
    expect(h).toMatch(/<button[^>]*>[^<]*(<svg[\s\S]*?<\/svg>)?\s*Inviter une association ou une mairie à publier<\/button>/)
    expect(text(h)).toContain('Élargir à 25 km')
  })

  it('déjà organisateur ou en attente de validation : pas de « Devenir organisateur » en double ; au plus large : pas d’élargissement', () => {
    const org = { userId: 'u', name: 'Asso', description: '', verified: false, createdAt: '2026-11-01T00:00:00Z' }
    expect(text(html({ org }))).not.toContain('Devenir organisateur')
    expect(text(html({ org: undefined }))).not.toContain('Devenir organisateur')
    expect(text(html({ radius: RADII[RADII.length - 1] }))).not.toContain('Élargir')
  })

  it('phrases de 20 mots au plus', () => {
    const e = emptyEventsText()
    for (const t of [e.title, e.hint, e.ask]) for (const s of sentences(t)) expect(words(s), s).toBeLessThanOrEqual(20)
  })
})

describe('détail d’un événement', () => {
  const html = (e = ev()) => renderToStaticMarkup(createElement(EventDetail, { event: e, online: true, onBack: noop }))

  it('reprend les mêmes boutons que la carte, et l’organisateur', () => {
    const h = html()
    expect(h).toContain('aria-label="Ajouter à mon calendrier : Atelier de taille des rosiers"')
    expect(h).toContain('aria-label="Partager cet événement : Atelier de taille des rosiers"')
    expect(text(h)).toContain('L’organisateur : Les Jardiniers du quartier')
    expect(text(h)).toContain('Venez avec votre sécateur.')
  })

  it('annulé : aucun bouton de calendrier', () => {
    expect(html(ev({ status: 'cancelled' }))).not.toContain('Ajouter à mon calendrier')
  })
})

describe('point d’entrée', () => {
  it('« Voir les événements » ouvre l’onglet Événements : même demande des deux côtés, repère posé', () => {
    const page = readFileSync(join(__dirname, 'NeighborsPage.tsx'), 'utf8')
    const features = readFileSync(join(__dirname, '../../lib/features.ts'), 'utf8')
    expect(page).toContain("useIntent('voisins:evenements'")
    expect(page).toContain("setSection('evenements')")
    expect(features).toContain("intent: 'voisins:evenements'")
    expect(readFileSync(join(__dirname, 'Events.tsx'), 'utf8')).toContain('data-feat="evenements"')
  })
})

describe('registre et accueil', () => {
  const f = FEATURES.find((x) => x.id === 'evenements-voisins')!
  it('la fonction est au registre, avec son repère, sa rubrique et ses mots', () => {
    expect(f).toBeDefined()
    expect(FEATURES).toHaveLength(87)
    expect(f.cible).toBe('evenements')
    expect(f.rubrique).toBe('voisins')
    expect(f.mot).toBe('Voir les événements près de chez moi')
    expect(words(f.mot)).toBeLessThanOrEqual(8)
    for (const s of sentences(f.phrase)) expect(words(s), s).toBeLessThanOrEqual(20)
    expect(f.motsCles).toEqual(expect.arrayContaining(['événement', 'atelier', 'formation', 'rendez-vous', 'voisins', 'près de chez moi']))
    expect(typeof f.visibleSi).toBe('function')
  })
  it('on la trouve avec les mots d’un débutant', () => {
    for (const q of ['événement', 'événements', 'atelier', 'formation', 'rendez-vous', 'près de chez moi']) expect(searchFeatures(q, FEATURES).map((x) => x.id), q).toContain('evenements-voisins')
  })
  it('même visibilité que « voisins » (entraide configurée)', () => {
    const v = FEATURES.find((x) => x.id === 'voisins')!
    expect(f.visibleSi?.()).toBe(v.visibleSi?.())
    expect(visibleFeatures().some((x) => x.id === 'evenements-voisins')).toBe(!!v.visibleSi?.())
  })
  it('accueil : la phrase de « Voisins » cite les rendez-vous, l’ordre ne change pas', () => {
    const ids = HOME_ACTIONS.map((a) => a.id)
    // « apprendre » et « conseils » : mis à l'honneur à la demande du propriétaire (11 nov.) ; le reste garde son ordre.
    expect(ids).toEqual(['ajouter', 'partage', 'apprendre', 'conseils', 'carte', 'visite', 'photos', 'scanner', 'afaire', 'planter', 'voisins', 'tout'])
    const v = HOME_ACTIONS.find((a) => a.id === 'voisins')!
    expect(v.phrase).toBe('Dons, échanges, rendez-vous.')
    expect(v.phrase.length).toBeLessThanOrEqual(36)
    expect(words(v.phrase)).toBeLessThanOrEqual(20)
  })
})

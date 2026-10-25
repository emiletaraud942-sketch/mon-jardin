import { describe, expect, it } from 'vitest'
import {
  CONDUCT_RULES,
  DEFAULT_RADIUS,
  CATEGORY_FILTERS,
  KIND_FILTERS,
  categoryOption,
  categoryRequired,
  emptyFeedText,
  offerMessage,
  parseCategoryFilter,
  RADII,
  cellPreview,
  daysLeft,
  describeCell,
  formatWhen,
  isEmailLike,
  kindOption,
  parseRadius,
  postStatusInfo,
  sameIds,
  shouldPoll,
  communeFromAddress,
  neighborhoodText,
  gardenNeighborhoodText,
} from './logic'
import { POST_CATEGORIES, POST_KINDS, POST_KIND_LABELS, REPORT_REASONS } from './types'

const NOW = new Date('2026-10-23T12:00:00Z')
const sentencesOf = (t: string) => t.split(/(?<=[.!?])\s+(?=[A-ZÀ-ÖØ-Þ«“"'])/).map((x) => x.trim()).filter(Boolean)
const wordCount = (s: string) => s.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length

describe('filtres', () => {
  it('Tout / Dons / Échanges / Prêts / Questions / Je cherche, dans cet ordre', () => {
    expect(KIND_FILTERS.map((f) => f.label)).toEqual(['Tout', 'Dons', 'Échanges', 'Prêts', 'Questions', 'Je cherche'])
    expect(kindOption('all')).toBeUndefined()
    for (const k of POST_KINDS) expect(kindOption(k)).toBe(k)
  })
  it('rayon : 5, 10 ou 25 km, sinon 10', () => {
    expect([...RADII]).toEqual([5, 10, 25])
    expect(parseRadius('25')).toBe(25)
    expect(parseRadius(5)).toBe(5)
    expect(parseRadius('7')).toBe(DEFAULT_RADIUS)
    expect(parseRadius(null)).toBe(10)
    expect(parseRadius('abc')).toBe(10)
  })
})

describe('catégories et « Je cherche »', () => {
  it('libellés de type en français simple', () => {
    expect(POST_KINDS.map((k) => POST_KIND_LABELS[k])).toEqual(['Je donne', 'J’échange', 'Je prête', 'Je pose une question', 'Je cherche'])
  })
  it('sept catégories, filtre « toutes » en tête', () => {
    expect(POST_CATEGORIES.map((c) => c.id)).toEqual(['graines', 'plantes', 'compost', 'outils', 'materiel', 'services', 'autre'])
    expect(CATEGORY_FILTERS[0]).toEqual({ id: 'all', label: 'Toutes les catégories' })
    expect(CATEGORY_FILTERS).toHaveLength(8)
    expect(categoryOption('all')).toBeUndefined()
    expect(categoryOption('outils')).toBe('outils')
  })
  it('une valeur mémorisée inconnue donne « toutes »', () => {
    expect(parseCategoryFilter('outils')).toBe('outils')
    expect(parseCategoryFilter('voitures')).toBe('all')
    expect(parseCategoryFilter(null)).toBe('all')
    expect(parseCategoryFilter('toString')).toBe('all')
  })
  it('la catégorie est obligatoire pour une demande seulement', () => {
    expect(categoryRequired('cherche')).toBe(true)
    for (const k of POST_KINDS.filter((x) => x !== 'cherche')) expect(categoryRequired(k)).toBe(false)
  })
  it('état vide adapté', () => {
    expect(emptyFeedText('cherche', 'all').title).toBe('Personne ne cherche rien près de chez vous pour l’instant')
    expect(emptyFeedText('all', 'outils').title).toMatch(/catégorie/)
    expect(emptyFeedText('all', 'all').title).toMatch(/Rien près de chez vous/)
    expect(emptyFeedText('don', 'all').title).toBe('Aucune annonce de ce type')
  })
  it('message prérempli : cite l’annonce, phrases courtes, tient dans un message', () => {
    const m = offerMessage({ title: 'Une bêche' })
    expect(m).toContain('« Une bêche »')
    for (const s of sentencesOf(m)) expect(wordCount(s)).toBeLessThanOrEqual(20)
    expect(offerMessage({ title: 'x'.repeat(80) }).length).toBeLessThanOrEqual(1000)
  })
  it('textes d’état vide : phrases de 20 mots au plus', () => {
    for (const k of KIND_FILTERS) for (const c of ['all', 'outils'] as const) {
      const t = emptyFeedText(k.id, c)
      for (const s of [...sentencesOf(t.title), ...sentencesOf(t.hint)]) expect(wordCount(s)).toBeLessThanOrEqual(20)
    }
  })
})

describe('règles de conduite', () => {
  it('couvrent respect, pas de vente, pas de données personnelles', () => {
    const t = CONDUCT_RULES.join(' ')
    expect(t).toMatch(/poli/)
    expect(t).toMatch(/vend/)
    expect(t).toMatch(/e-mail/)
  })
})

describe('dates', () => {
  const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString()
  it('formate le temps écoulé en français', () => {
    expect(formatWhen(ago(10_000), NOW)).toBe('à l’instant')
    expect(formatWhen(ago(5 * 60_000), NOW)).toBe('il y a 5 min')
    expect(formatWhen(ago(3 * 3_600_000), NOW)).toBe('il y a 3 h')
    expect(formatWhen(ago(30 * 3_600_000), NOW)).toBe('hier')
    expect(formatWhen(ago(4 * 86_400_000), NOW)).toBe('il y a 4 j')
    expect(formatWhen(ago(60 * 86_400_000), NOW)).toMatch(/\d/)
    expect(formatWhen('pas une date', NOW)).toBe('')
  })
  it('jours restants', () => {
    expect(daysLeft(new Date(NOW.getTime() + 2.2 * 86_400_000).toISOString(), NOW)).toBe(3)
    expect(daysLeft(ago(1000), NOW)).toBe(0)
    expect(daysLeft('x', NOW)).toBe(0)
  })
})

describe('statut d’une annonce', () => {
  const future = new Date(NOW.getTime() + 10 * 86_400_000).toISOString()
  const past = new Date(NOW.getTime() - 86_400_000).toISOString()
  it('ouverte : peut être close', () => {
    const s = postStatusInfo({ status: 'open', expiresAt: future }, NOW)
    expect(s).toMatchObject({ canClose: true, canReopen: false, tone: 'green' })
    expect(s.label).toBe('En ligne · encore 10 jours')
  })
  it('terminée : peut être rouverte', () => {
    expect(postStatusInfo({ status: 'closed', expiresAt: future }, NOW)).toMatchObject({ canClose: false, canReopen: true })
  })
  it('masquée ou expirée : ni close ni rouverte', () => {
    expect(postStatusInfo({ status: 'hidden', expiresAt: future }, NOW)).toMatchObject({ canClose: false, canReopen: false, tone: 'danger' })
    expect(postStatusInfo({ status: 'open', expiresAt: past }, NOW)).toMatchObject({ label: 'Expirée', canClose: false, canReopen: false })
  })
})

describe('quartier', () => {
  it('arrondit le centre du jardin à 0,01° avant tout affichage', () => {
    const p = cellPreview(47.2234567, 2.0678901)
    expect(p.cell).toEqual({ lat: 47.22, lon: 2.07 })
    expect(p.text).toBe('47.22° N, 2.07° E')
    expect(p.text).not.toContain('4567')
  })
  it('hémisphères Sud et Ouest', () => {
    expect(describeCell({ lat: -33.87, lon: -70.5 })).toBe('33.87° S, 70.50° O')
  })
})

describe('divers', () => {
  it('ne rafraîchit que visible et en ligne', () => {
    expect(shouldPoll('visible', true)).toBe(true)
    expect(shouldPoll('hidden', true)).toBe(false)
    expect(shouldPoll('visible', false)).toBe(false)
    expect(shouldPoll(undefined, undefined)).toBe(true)
  })
  it('sameIds évite les rendus inutiles', () => {
    expect(sameIds([{ id: 'a' }, { id: 'b' }], [{ id: 'a' }, { id: 'b' }])).toBe(true)
    expect(sameIds([{ id: 'a' }], [{ id: 'a' }, { id: 'b' }])).toBe(false)
    expect(sameIds([{ id: 'a' }, { id: 'b' }], [{ id: 'b' }, { id: 'a' }])).toBe(false)
  })
  it('e-mail : contrôle de forme', () => {
    expect(isEmailLike(' a@b.fr ')).toBe(true)
    expect(isEmailLike('a@b')).toBe(false)
    expect(isEmailLike('a b@c.fr')).toBe(false)
  })
})

describe('libellés simples', () => {
  it('types d’annonce à la première personne', () => {
    expect(POST_KINDS.map((k) => POST_KIND_LABELS[k])).toEqual(['Je donne', 'J’échange', 'Je prête', 'Je pose une question', 'Je cherche'])
  })
  it('motifs de signalement sans jargon', () => {
    const all = Object.values(REPORT_REASONS).join(' ')
    expect(all).not.toMatch(/\bspam\b|quota/i)
  })
})

describe('commune d’après l’adresse', () => {
  it('texte après le code postal', () => {
    expect(communeFromAddress('8 Boulevard du Port 80000 Amiens')).toBe('Amiens')
    expect(communeFromAddress('12 rue des Lilas, 37000 Tours, France')).toBe('Tours')
    expect(communeFromAddress('1 place Bellecour 69002 Lyon Cedex 02')).toBe('Lyon')
    expect(communeFromAddress('Chemin du Moulin 42100 Saint-Étienne')).toBe('Saint-Étienne')
  })
  it('sans code postal ou sans adresse : rien', () => {
    expect(communeFromAddress('Chemin du Moulin')).toBeUndefined()
    expect(communeFromAddress('')).toBeUndefined()
    expect(communeFromAddress(undefined)).toBeUndefined()
    expect(communeFromAddress('37000')).toBeUndefined()
  })
  it('nom très long tronqué', () => {
    expect(communeFromAddress('1 rue X 12345 ' + 'A'.repeat(80))!.length).toBeLessThanOrEqual(40)
  })
})

describe('texte du quartier (sans degrés)', () => {
  const garden = { address: '8 Boulevard du Port 80000 Amiens', center: { lat: 49.8941, lon: 2.2958 } }
  it('commune quand le quartier est celui du jardin actif', () => {
    expect(neighborhoodText({ lat: 49.89, lon: 2.3 }, garden)).toBe('commune de Amiens')
    expect(gardenNeighborhoodText(garden)).toBe('commune de Amiens')
  })
  it('sans commune : autour de votre jardin', () => {
    expect(neighborhoodText({ lat: 49.89, lon: 2.3 }, { ...garden, address: '' })).toBe('autour de votre jardin')
    expect(gardenNeighborhoodText({ address: '' })).toBe('autour de votre jardin')
  })
  it('autre jardin : prudence', () => {
    expect(neighborhoodText({ lat: 43.6, lon: 1.44 }, garden)).toBe('autour du jardin choisi à l’inscription')
    expect(neighborhoodText({ lat: 43.6, lon: 1.44 }, undefined)).toBe('autour du jardin choisi à l’inscription')
  })
  it('jamais de degrés', () => {
    expect(neighborhoodText({ lat: 49.89, lon: 2.3 }, garden)).not.toMatch(/°/)
  })
})

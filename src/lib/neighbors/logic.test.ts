import { describe, expect, it } from 'vitest'
import { roundCell } from './cell'
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
  CELL_SIZE_CHOICES,
  CELL_SIZE_EXPLAIN,
  cellPreview,
  cellSizeLabel,
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
  neighborhoodWithZone,
  gardenNeighborhoodText,
  cuttingRequestText,
  sameSpecies,
  speciesToShare,
  whoHas,
} from './logic'
import { NEIGHBORS_LIMITS, POST_CATEGORIES, POST_KINDS, POST_KIND_LABELS, REPORT_REASONS } from './types'

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
    expect(emptyFeedText('cherche', 'outils').title).toBe('Aucune demande dans cette catégorie pour l’instant')
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
  it('arrondit le centre du jardin sur la grille avant tout affichage (standard)', () => {
    const p = cellPreview(47.2234567, 2.0678901, 'standard')
    expect(p.cell).toEqual({ lat: 47.22, lon: 2.07 })
    expect(p.text).toBe('47.22° N, 2.07° E')
    expect(p.text).not.toContain('4567')
  })
  it('quartier large : cellule plus grande', () => {
    const p = cellPreview(47.2234567, 2.0678901, 'large')
    expect(p.cell).toEqual({ lat: 47.2, lon: 2.1 })
  })
  it('les deux choix de taille sont en mots simples, sans degrés', () => {
    expect(CELL_SIZE_CHOICES.map((c) => c.id)).toEqual(['standard', 'large'])
    expect(CELL_SIZE_CHOICES[0].title).toBe('Standard (environ 2 km)')
    expect(CELL_SIZE_CHOICES[1].title).toBe('Large (environ 5 km, pour la campagne)')
    for (const c of CELL_SIZE_CHOICES) expect(`${c.title} ${c.help}`).not.toMatch(/°|~|\b1 km\b/)
    expect(CELL_SIZE_EXPLAIN).toBe('Plus la zone est grande, moins on peut deviner où vous habitez.')
    expect(cellSizeLabel('standard')).toBe('environ 2 km')
    expect(cellSizeLabel('large')).toBe('environ 5 km')
  })
  it('le nom de commune ne s’affiche que si la cellule est celle du jardin, pour la taille choisie', () => {
    const g = { address: '3 place du Capitole 31000 Toulouse', center: { lat: 43.6047, lon: 1.4442 } }
    expect(neighborhoodText(roundCell(43.6047, 1.4442, 'large'), g, 'large')).toBe('commune de Toulouse')
    expect(neighborhoodText(roundCell(43.6047, 1.4442, 'large'), g, 'standard')).toBe('autour du jardin choisi à l’inscription')
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
    expect(neighborhoodText({ lat: 49.9, lon: 2.31 }, garden)).toBe('commune de Amiens')
    expect(gardenNeighborhoodText(garden)).toBe('commune de Amiens')
  })
  it('sans commune : autour de votre jardin', () => {
    expect(neighborhoodText({ lat: 49.9, lon: 2.31 }, { ...garden, address: '' })).toBe('autour de votre jardin')
    expect(gardenNeighborhoodText({ address: '' })).toBe('autour de votre jardin')
  })
  it('autre jardin : prudence', () => {
    expect(neighborhoodText({ lat: 43.6, lon: 1.44 }, garden)).toBe('autour du jardin choisi à l’inscription')
    expect(neighborhoodText({ lat: 43.6, lon: 1.44 }, undefined)).toBe('autour du jardin choisi à l’inscription')
  })
  it('aperçu d’annonce : commune et taille de la zone, en mots simples', () => {
    expect(neighborhoodWithZone({ lat: 49.9, lon: 2.31 }, garden, 'standard')).toBe('commune de Amiens, zone d’environ 2 km')
    expect(neighborhoodWithZone({ lat: 49.9, lon: 2.31 }, undefined, 'large')).toBe('autour du jardin choisi à l’inscription, zone d’environ 5 km')
    expect(neighborhoodWithZone({ lat: 49.9, lon: 2.31 }, garden, 'standard')).not.toMatch(/°/)
  })
  it('jamais de degrés', () => {
    expect(neighborhoodText({ lat: 49.9, lon: 2.31 }, garden)).not.toMatch(/°/)
  })
})

// ---------- Événements ----------
import { capacityText, checkHttpsUrl, dateInput, emptyEventsText, eventCountdown, eventEnded, eventStatusInfo, externalHost, formatEventDate, interestCountText, localDateTimeToIso, safeExternalUrl, upcomingEvents } from './logic'

const PARIS = 'Europe/Paris'

describe('lien d’inscription : https seulement', () => {
  it.each([
    'https://exemple.fr/inscription?id=3#haut',
    'HTTPS://Exemple.FR/x',
    'https://asso.exemple.fr:8443/a/b',
    'https://exemple.fr',
    'https://xn--caf-dma.fr/ete',
    '  https://exemple.fr/espaces  ',
  ])('accepte %s', (u) => {
    expect(checkHttpsUrl(u).ok).toBe(true)
  })
  it.each([
    'javascript:alert(1)',
    'JavaScript:alert(1)',
    'data:text/html;base64,PHNjcmlwdD4=',
    'vbscript:msgbox(1)',
    'file:///etc/passwd',
    'blob:https://exemple.fr/abc',
    'ftp://exemple.fr/x',
    '//exemple.fr/x',
    'exemple.fr',
    'https://',
    'https://exemple',
    'https://user:pass@exemple.fr/x',
    'https://exemple.fr@evil.example/x',
    'https://1.2.3.4/x',
    'https://[::1]/x',
    'https://localhost/x',
    'https://exemple.fr/a b',
    'https://exemple.fr/"onmouseover="x',
    'https://exemple.fr/<script>',
    'https://exemple.fr\\evil',
    'https://-exemple.fr/x',
    'https://exemple..fr/x',
    'https://exemple.fr/\nx',
    'https://exemple.fr/`x`',
    'https://exemple.fr/‮abc',
    'https://exemple.fr/ x',
    'https://éxemple.fr/x',
  ])('refuse %j', (u) => {
    expect(checkHttpsUrl(u).ok).toBe(false)
  })
  it('http:// reçoit un message précis ; un lien trop long aussi', () => {
    expect(checkHttpsUrl('http://exemple.fr/x')).toEqual({ ok: false, message: expect.stringContaining('https://') })
    const long = checkHttpsUrl('https://exemple.fr/' + 'a'.repeat(300))
    expect(long.ok).toBe(false)
    expect(!long.ok && long.message).toContain('300')
    expect(checkHttpsUrl('https://exemple.fr/' + 'a'.repeat(281)).ok).toBe(true) // 300 caractères pile
  })
  it('rend l’adresse nettoyée et le nom du site', () => {
    expect(checkHttpsUrl(' https://Asso.Exemple.fr/a ')).toEqual({ ok: true, url: 'https://Asso.Exemple.fr/a', host: 'asso.exemple.fr' })
    expect(externalHost('https://exemple.fr/x')).toBe('exemple.fr')
    expect(externalHost('javascript:alert(1)')).toBeNull()
  })
  it('safeExternalUrl : jamais un lien douteux venu de la base', () => {
    expect(safeExternalUrl('https://exemple.fr/x')).toBe('https://exemple.fr/x')
    for (const bad of ['javascript:alert(1)', 'http://exemple.fr', null, undefined, 42, '']) expect(safeExternalUrl(bad)).toBeNull()
  })
})

describe('événements : dates en toutes lettres', () => {
  it('même jour : « de 14 h 00 à 16 h 00 »', () => {
    expect(formatEventDate('2026-11-14T13:00:00Z', '2026-11-14T15:00:00Z', PARIS)).toBe('samedi 14 novembre 2026, de 14 h 00 à 16 h 00')
  })
  it('début seul (fin = début) : « à 14 h 00 »', () => {
    expect(formatEventDate('2026-11-14T13:00:00Z', '2026-11-14T13:00:00Z', PARIS)).toBe('samedi 14 novembre 2026 à 14 h 00')
  })
  it('plusieurs jours', () => {
    expect(formatEventDate('2026-11-14T13:00:00Z', '2026-11-15T17:30:00Z', PARIS)).toBe('du samedi 14 novembre 2026 à 14 h 00 au dimanche 15 novembre 2026 à 18 h 30')
  })
  it('l’heure suit le fuseau (heure d’été et d’hiver)', () => {
    expect(formatEventDate('2026-07-14T12:00:00Z', '2026-07-14T13:00:00Z', PARIS)).toBe('mardi 14 juillet 2026, de 14 h 00 à 15 h 00')
    expect(formatEventDate('2026-07-14T07:00:00Z', '2026-07-14T08:00:00Z', PARIS)).toContain('de 9 h 00 à 10 h 00')
  })
  it('date invalide : texte vide', () => {
    expect(formatEventDate('pas une date', '2026-11-14T13:00:00Z', PARIS)).toBe('')
  })
})

describe('événements : compte à rebours et statut', () => {
  const now = new Date('2026-11-10T09:00:00Z')
  it('en ce moment, aujourd’hui, demain, dans N jours, terminé', () => {
    expect(eventCountdown('2026-11-10T08:00:00Z', '2026-11-10T12:00:00Z', now, PARIS)).toBe('En ce moment')
    expect(eventCountdown('2026-11-10T15:00:00Z', '2026-11-10T17:00:00Z', now, PARIS)).toBe('Aujourd’hui')
    expect(eventCountdown('2026-11-11T15:00:00Z', '2026-11-11T17:00:00Z', now, PARIS)).toBe('Demain')
    expect(eventCountdown('2026-11-15T15:00:00Z', '2026-11-15T17:00:00Z', now, PARIS)).toBe('Dans 5 jours')
    expect(eventCountdown('2026-11-09T15:00:00Z', '2026-11-09T17:00:00Z', now, PARIS)).toBe('Terminé')
  })
  it('« demain » suit le jour local, pas les 24 heures', () => {
    const late = new Date('2026-11-10T22:30:00Z') // 23 h 30 à Paris
    expect(eventCountdown('2026-11-10T23:30:00Z', '2026-11-11T00:30:00Z', late, PARIS)).toBe('Demain')
  })
  const ev = (status: 'open' | 'cancelled' | 'hidden', endsAt: string) => ({ status, startsAt: '2026-11-12T10:00:00Z', endsAt })
  it('statut : à venir, annulé, caché, terminé', () => {
    expect(eventStatusInfo(ev('open', '2026-11-12T12:00:00Z'), now, PARIS)).toMatchObject({ label: 'Dans 2 jours', tone: 'green', canCancel: true, canReopen: false })
    expect(eventStatusInfo(ev('cancelled', '2026-11-12T12:00:00Z'), now, PARIS)).toMatchObject({ label: 'Annulé', tone: 'danger', canCancel: false, canReopen: true })
    expect(eventStatusInfo(ev('hidden', '2026-11-12T12:00:00Z'), now, PARIS)).toMatchObject({ tone: 'danger', canCancel: false, canReopen: false })
    expect(eventStatusInfo(ev('open', '2026-11-09T12:00:00Z'), now, PARIS)).toMatchObject({ label: 'Terminé', canCancel: false, canReopen: false })
    expect(eventStatusInfo(ev('cancelled', '2026-11-09T12:00:00Z'), now, PARIS).canReopen).toBe(false)
    expect(eventEnded({ endsAt: '2026-11-09T12:00:00Z' }, now)).toBe(true)
  })
  it('à venir : sans les finis, par date', () => {
    const list = [
      { id: 'c', startsAt: '2026-11-20T10:00:00Z', endsAt: '2026-11-20T12:00:00Z' },
      { id: 'old', startsAt: '2026-11-01T10:00:00Z', endsAt: '2026-11-01T12:00:00Z' },
      { id: 'a', startsAt: '2026-11-11T10:00:00Z', endsAt: '2026-11-11T12:00:00Z' },
      { id: 'now', startsAt: '2026-11-10T07:00:00Z', endsAt: '2026-11-10T11:00:00Z' },
      { id: 'bad', startsAt: 'x', endsAt: 'y' },
    ]
    expect(upcomingEvents(list, now).map((e) => e.id)).toEqual(['now', 'a', 'c'])
  })
})

describe('événements : textes', () => {
  it('intérêt et places, avec le bon accord', () => {
    expect(interestCountText(0)).toBe('Personne n’est encore intéressé')
    expect(interestCountText(1)).toBe('1 personne intéressée')
    expect(interestCountText(12)).toBe('12 personnes intéressées')
    expect(interestCountText(-4)).toBe('Personne n’est encore intéressé')
    expect(capacityText(null)).toBeNull()
    expect(capacityText(1)).toBe('1 place annoncée')
    expect(capacityText(40)).toBe('40 places annoncées')
  })
  it('état vide', () => {
    expect(emptyEventsText().title).toContain('Aucun événement')
  })
})

describe('événements : saisie date et heure', () => {
  it('date et heure de l’appareil → ISO', () => {
    expect(localDateTimeToIso('2026-11-14', '14:30')).toBe(new Date(2026, 10, 14, 14, 30).toISOString())
    expect(dateInput(new Date(2026, 10, 4))).toBe('2026-11-04')
  })
  it.each([
    ['2026-02-30', '10:00'],
    ['2026-13-01', '10:00'],
    ['2026-11-14', '25:00'],
    ['2026-11-14', '10:61'],
    ['', '10:00'],
    ['2026-11-14', ''],
    ['14/11/2026', '10:00'],
    ['2026-11-14', '10h00'],
  ])('refuse %j %j', (d, t) => {
    expect(localDateTimeToIso(d, t)).toBeNull()
  })
})

describe('jardins partagés (v8)', () => {
  it('speciesToShare : espèces en place, sans doublon, triées ; ni projets ni plantes mortes', () => {
    const plants = [
      { speciesId: 'romarin', status: 'en-place' },
      { speciesId: 'pommier', status: 'en-place' },
      { speciesId: 'pommier', status: 'en-place' },
      { speciesId: 'cerisier', status: 'projet' },
      { speciesId: 'poirier', status: 'mort' },
    ]
    expect(speciesToShare(plants)).toEqual(['pommier', 'romarin'])
  })
  it('speciesToShare : écarte ce que la base refuserait ou que l’appli ne connaît pas', () => {
    const plants = [{ speciesId: 'Bizarre!', status: 'en-place' }, { speciesId: 'inconnu', status: 'en-place' }, { speciesId: 'thym', status: 'en-place' }]
    expect(speciesToShare(plants, (id) => id === 'thym')).toEqual(['thym'])
  })
  it('speciesToShare : au plus 80 espèces', () => {
    const plants = Array.from({ length: 100 }, (_, i) => ({ speciesId: `esp-${String(i).padStart(3, '0')}`, status: 'en-place' }))
    expect(speciesToShare(plants)).toHaveLength(80)
  })
  it('sameSpecies ignore l’ordre', () => {
    expect(sameSpecies(['a1', 'b2'], ['b2', 'a1'])).toBe(true)
    expect(sameSpecies(['a1'], ['a1', 'b2'])).toBe(false)
    expect(sameSpecies([], [])).toBe(true)
  })
  it('cuttingRequestText : poli, avec le pseudo et la plante', () => {
    const t = cuttingRequestText('Romarin', 'Marie')
    expect(t).toContain('Marie')
    expect(t).toContain('Romarin')
    expect(t).toMatch(/bouture/)
    expect(t.length).toBeLessThan(NEIGHBORS_LIMITS.messageMax)
  })
  it('whoHas : les voisins qui ont cette espèce', () => {
    const shares = [{ id: 1, species: ['thym', 'lavande'] }, { id: 2, species: ['pommier'] }]
    expect(whoHas(shares, 'thym').map((s) => s.id)).toEqual([1])
    expect(whoHas(shares, 'rose')).toEqual([])
  })
})

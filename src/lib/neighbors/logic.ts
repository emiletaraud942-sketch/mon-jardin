// Entraide entre voisins : logique pure de l'interface (filtres, libellés, dates). Aucun accès réseau ni navigateur.
import { CELL_STEPS, roundCell } from './cell'
import { NEIGHBORS_LIMITS as L, POST_CATEGORIES, isPostCategory, type Cell, type CellSize, type EventItem, type Post, type PostCategory, type PostKind } from './types'

// ---------- Filtres du fil ----------

export type KindFilter = 'all' | PostKind
export const KIND_FILTERS: { id: KindFilter; label: string }[] = [
  { id: 'all', label: 'Tout' },
  { id: 'don', label: 'Dons' },
  { id: 'echange', label: 'Échanges' },
  { id: 'pret', label: 'Prêts' },
  { id: 'question', label: 'Questions' },
  { id: 'cherche', label: 'Je cherche' },
]
export const kindOption = (f: KindFilter): PostKind | undefined => (f === 'all' ? undefined : f)

export type CategoryFilter = 'all' | PostCategory
export const CATEGORY_FILTERS: { id: CategoryFilter; label: string }[] = [{ id: 'all', label: 'Toutes les catégories' }, ...POST_CATEGORIES]
export const categoryOption = (f: CategoryFilter): PostCategory | undefined => (f === 'all' ? undefined : f)
/** Une valeur lue hors de l'appli (mémoire locale) : toute valeur inconnue donne « toutes ». */
export const parseCategoryFilter = (v: unknown): CategoryFilter => (isPostCategory(v) ? v : 'all')

/** Une demande « Je cherche » ne se publie pas sans catégorie. */
export const categoryRequired = (kind: PostKind) => kind === 'cherche'

/** Texte de l'état vide du fil, selon les filtres. */
export function emptyFeedText(kind: KindFilter, category: CategoryFilter): { title: string; hint: string } {
  if (kind === 'cherche' && category !== 'all') return { title: 'Aucune demande dans cette catégorie pour l’instant', hint: 'Essayez une autre catégorie, ou élargissez la distance.' }
  if (kind === 'cherche') return { title: 'Personne ne cherche rien près de chez vous pour l’instant', hint: 'Vous cherchez quelque chose ? Dites-le à vos voisins.' }
  if (category !== 'all') return { title: 'Rien dans cette catégorie pour l’instant', hint: 'Essayez une autre catégorie, ou élargissez la distance.' }
  if (kind === 'all') return { title: 'Rien près de chez vous pour l’instant', hint: 'Vous pouvez être le premier. Quelques idées :' }
  return { title: 'Aucune annonce de ce type', hint: 'Essayez « Tout », ou élargissez la distance.' }
}

/** Message proposé à celui qui a ce qu'une demande recherche. Modifiable avant l'envoi. */
export function offerMessage(post: Pick<Post, 'title'>): string {
  return `Bonjour, j’ai peut-être ce que vous cherchez : « ${post.title} ». Quand seriez-vous disponible pour en parler ?`
}

export const RADII = [5, 10, 25] as const
export const DEFAULT_RADIUS = 10
export function parseRadius(v: unknown): number {
  const n = Number(v)
  return (RADII as readonly number[]).includes(n) ? n : DEFAULT_RADIUS
}

// ---------- Règles de conduite (affichées à la 1re publication) ----------

export const CONDUCT_RULES: string[] = [
  'Soyez poli. Pas d’insultes ni de harcèlement.',
  'Rien ne se vend : dons, échanges, prêts, demandes et questions seulement.',
  'Ne donnez ni adresse, ni téléphone, ni e-mail dans une annonce. Utilisez les messages privés.',
  'Signalez les plantes toxiques ou envahissantes. Ne proposez rien de dangereux.',
]

// ---------- Dates ----------

/** « à l’instant », « il y a 5 min », « il y a 3 h », « hier », « il y a 4 j », puis la date. */
export function formatWhen(iso: string, now: Date = new Date()): string {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return ''
  const diff = now.getTime() - t
  if (diff < 0 || diff < 60_000) return 'à l’instant'
  const min = Math.floor(diff / 60_000)
  if (min < 60) return `il y a ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `il y a ${h} h`
  const d = Math.floor(h / 24)
  if (d === 1) return 'hier'
  if (d < 14) return `il y a ${d} j`
  return new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

/** Jours restants avant expiration (0 si passée). */
export function daysLeft(expiresAt: string, now: Date = new Date()): number {
  const t = Date.parse(expiresAt)
  if (!Number.isFinite(t)) return 0
  return Math.max(0, Math.ceil((t - now.getTime()) / 86_400_000))
}

// ---------- Statut d'une annonce (Mes annonces) ----------

export interface StatusInfo {
  label: string
  tone: 'green' | 'warn' | 'danger' | 'neutral'
  /** Peut être close. */
  canClose: boolean
  /** Peut être rouverte. */
  canReopen: boolean
}

export function postStatusInfo(p: Pick<Post, 'status' | 'expiresAt'>, now: Date = new Date()): StatusInfo {
  if (p.status === 'hidden') return { label: 'Cachée après plusieurs signalements', tone: 'danger', canClose: false, canReopen: false }
  if (p.status === 'closed') return { label: 'Terminée', tone: 'neutral', canClose: false, canReopen: true }
  if (Date.parse(p.expiresAt) <= now.getTime()) return { label: 'Expirée', tone: 'warn', canClose: false, canReopen: false }
  const d = daysLeft(p.expiresAt, now)
  return { label: `En ligne · encore ${d} ${d > 1 ? 'jours' : 'jour'}`, tone: 'green', canClose: true, canReopen: false }
}

// ---------- Quartier ----------

export interface CellPreview {
  cell: Cell
  /** Ex. « 47.22° N, 2.07° E ». Pour les tests et le diagnostic : jamais montré à l'utilisateur. */
  text: string
}

/** Quartier déduit d'un point (centre du jardin actif) : arrondi ICI, avant tout affichage ou envoi. */
export function cellPreview(lat: number, lon: number, size: CellSize): CellPreview {
  const cell = roundCell(lat, lon, size)
  return { cell, text: describeCell(cell) }
}

/** Les deux tailles de quartier proposées. Mots simples ; aucune coordonnée. */
export const CELL_SIZE_CHOICES: readonly { id: CellSize; title: string; help: string }[] = [
  { id: 'standard', title: 'Standard (environ 2 km)', help: 'Convient en ville et dans les villages.' },
  { id: 'large', title: 'Large (environ 5 km, pour la campagne)', help: 'Recommandé si peu de maisons sont proches de la vôtre.' },
]
export const CELL_SIZE_EXPLAIN = 'Plus la zone est grande, moins on peut deviner où vous habitez.'

/** « environ 2 km » ou « environ 5 km ». */
export function cellSizeLabel(size: CellSize): string {
  return CELL_STEPS[size].label
}

export function describeCell(c: Cell): string {
  return `${Math.abs(c.lat).toFixed(2)}° ${c.lat >= 0 ? 'N' : 'S'}, ${Math.abs(c.lon).toFixed(2)}° ${c.lon >= 0 ? 'E' : 'O'}`
}

export const AROUND_GARDEN = 'autour de votre jardin'

/**
 * Nom de la commune d'après une adresse française (« 8 Boulevard du Port 80000 Amiens » → « Amiens »).
 * C'est le texte après le code postal. Sans code postal : undefined (aucun appel réseau, aucune devinette).
 */
export function communeFromAddress(address: string | undefined | null): string | undefined {
  if (!address) return undefined
  const m = /\b\d{5}\s+([^,\d][^,]*)/.exec(address)
  if (!m) return undefined
  const name = m[1]
    .replace(/\s+cedex(\s+\d+)?\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (name.length < 2) return undefined
  return name.length > 40 ? name.slice(0, 39).trimEnd() + '…' : name
}

/**
 * Texte du quartier, sans degrés. Le nom de commune n'est donné que si le quartier enregistré
 * est bien celui du jardin actif ; sinon on reste prudent.
 */
export function neighborhoodText(cell: Cell, garden: { address?: string; center: { lat: number; lon: number } } | undefined, size: CellSize = 'standard'): string {
  if (!garden) return 'autour du jardin choisi à l’inscription'
  const same = (() => {
    try {
      const c = roundCell(garden.center.lat, garden.center.lon, size)
      return c.lat === cell.lat && c.lon === cell.lon
    } catch {
      return false
    }
  })()
  if (!same) return 'autour du jardin choisi à l’inscription'
  const commune = communeFromAddress(garden.address)
  return commune ? `commune de ${commune}` : AROUND_GARDEN
}

/** Texte du quartier avec la taille de la zone, pour l’aperçu d’une annonce : « commune de Amiens, zone d’environ 2 km ». */
export function neighborhoodWithZone(cell: Cell, garden: { address?: string; center: { lat: number; lon: number } } | undefined, size: CellSize): string {
  return `${neighborhoodText(cell, garden, size)}, zone d’${cellSizeLabel(size)}`
}

/** Même chose pour un point pas encore enregistré (centre du jardin actif). */
export function gardenNeighborhoodText(garden: { address?: string }): string {
  const commune = communeFromAddress(garden.address)
  return commune ? `commune de ${commune}` : AROUND_GARDEN
}

// ---------- Messages non lus ----------

/**
 * Messages reçus pas encore lus, par conversation. `reads` donne la date de dernière lecture de chaque conversation ;
 * sans date, tous les messages reçus comptent. Les messages doivent venir des autres (pas des siens).
 */
export function unreadByThread(received: { threadId: string; createdAt: string }[], reads: Record<string, string>): Record<string, number> {
  const out: Record<string, number> = {}
  for (const m of received) {
    const t = Date.parse(m.createdAt)
    if (!Number.isFinite(t)) continue
    const r = reads[m.threadId] == null ? NaN : Date.parse(reads[m.threadId])
    if (Number.isFinite(r) && t <= r) continue
    out[m.threadId] = (out[m.threadId] ?? 0) + 1
  }
  return out
}
export const sumCounts = (c: Record<string, number>): number => Object.values(c).reduce((a, b) => a + b, 0)

// ---------- Divers ----------

/** Rafraîchit seulement onglet visible et appareil en ligne. */
export const shouldPoll = (visibility: string | undefined, online: boolean | undefined) => visibility !== 'hidden' && online !== false

/** Vrai si les deux listes ont les mêmes identifiants dans le même ordre : évite un nouveau rendu inutile. */
export function sameIds<T extends { id: string }>(a: readonly T[], b: readonly T[]): boolean {
  return a.length === b.length && a.every((x, i) => x.id === b[i].id)
}

/** Contrôle léger de forme avant d’activer le bouton d’envoi (api.ts vérifie ensuite). */
export const isEmailLike = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim())

// ---------- Liens externes (inscription à un événement) ----------

/**
 * Lien d'inscription : https seulement, avec un nom de domaine (ni adresse numérique, ni nom et mot de passe dans l'adresse), en caractères ASCII
 * (un lien copié depuis le navigateur l'est toujours : les accents y sont codés %xx ; cela exclut aussi les caractères invisibles et de direction).
 * Même règle que la contrainte SQL `events_signup_url_check` : le client est au moins aussi strict que la base.
 */
const HTTPS_URL = /^https:\/\/([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z][a-z0-9-]+(:\d{1,5})?([/?#][^\s\u0000-\u001f\u007f-\uffff<>"'\\`{}|^]*)?$/i

export type UrlCheck = { ok: true; url: string; host: string } | { ok: false; message: string }

export function checkHttpsUrl(raw: string): UrlCheck {
  const url = String(raw ?? '').trim()
  if (!url) return { ok: false, message: 'Écrivez le lien.' }
  if (/^http:\/\//i.test(url)) return { ok: false, message: 'Le lien doit commencer par https:// et non par http://.' }
  if (url.length > L.eventUrlMax) return { ok: false, message: `Le lien est trop long (${L.eventUrlMax} caractères au maximum).` }
  const bad: UrlCheck = { ok: false, message: 'Ce lien n’est pas valable. Il doit commencer par https:// et être une adresse de site.' }
  if (!HTTPS_URL.test(url)) return bad
  try {
    const u = new URL(url)
    if (u.protocol !== 'https:' || u.username || u.password) return bad
    return { ok: true, url, host: u.hostname }
  } catch {
    return bad
  }
}

/** Lien à afficher : celui que la base a renvoyé, seulement s'il passe encore le contrôle (sinon null, jamais de lien douteux). */
export function safeExternalUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const c = checkHttpsUrl(raw)
  return c.ok ? c.url : null
}

/** Nom du site de destination, pour l'avertissement « Vous quittez l'appli ». */
export function externalHost(raw: string): string | null {
  const c = checkHttpsUrl(raw)
  return c.ok ? c.host : null
}

// ---------- Événements : dates ----------

const dayKey = (d: Date, timeZone?: string) => new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
const dayNumber = (key: string) => {
  const [y, m, d] = key.split('-').map(Number)
  return Date.UTC(y, m - 1, d) / 86_400_000
}
const longDay = (d: Date, timeZone?: string) => new Intl.DateTimeFormat('fr-FR', { timeZone, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(d)
const hourText = (d: Date, timeZone?: string) => {
  const t = new Intl.DateTimeFormat('fr-FR', { timeZone, hour: '2-digit', minute: '2-digit', hour12: false }).format(d)
  return t.replace(':', ' h ').replace(/^0(\d) h/, '$1 h')
}

/**
 * Date en toutes lettres : « samedi 14 novembre 2026, de 14 h 00 à 16 h 00 ».
 * Sur plusieurs jours : « du samedi 14 novembre 2026 à 14 h 00 au dimanche 15 novembre 2026 à 18 h 00 ».
 * `timeZone` sert aux tests ; par défaut, le fuseau de l'appareil.
 */
export function formatEventDate(startsAt: string, endsAt: string, timeZone?: string): string {
  const a = new Date(startsAt)
  const b = new Date(endsAt)
  if (!Number.isFinite(a.getTime())) return ''
  if (!Number.isFinite(b.getTime()) || b.getTime() === a.getTime()) return `${longDay(a, timeZone)} à ${hourText(a, timeZone)}`
  if (dayKey(a, timeZone) === dayKey(b, timeZone)) return `${longDay(a, timeZone)}, de ${hourText(a, timeZone)} à ${hourText(b, timeZone)}`
  return `du ${longDay(a, timeZone)} à ${hourText(a, timeZone)} au ${longDay(b, timeZone)} à ${hourText(b, timeZone)}`
}

/** « En ce moment », « Aujourd’hui », « Demain », « Dans 5 jours », « Terminé ». */
export function eventCountdown(startsAt: string, endsAt: string, now: Date = new Date(), timeZone?: string): string {
  const a = new Date(startsAt)
  const b = new Date(endsAt)
  if (!Number.isFinite(a.getTime())) return ''
  const end = Number.isFinite(b.getTime()) ? b : a
  if (end.getTime() < now.getTime()) return 'Terminé'
  if (a.getTime() <= now.getTime()) return 'En ce moment'
  const d = dayNumber(dayKey(a, timeZone)) - dayNumber(dayKey(now, timeZone))
  if (d <= 0) return 'Aujourd’hui'
  if (d === 1) return 'Demain'
  return `Dans ${d} jours`
}

/** Vrai si l'événement est fini (sa fin est passée). */
export const eventEnded = (e: Pick<EventItem, 'endsAt'>, now: Date = new Date()): boolean => Date.parse(e.endsAt) < now.getTime()

export interface EventStatusInfo {
  label: string
  tone: 'green' | 'warn' | 'danger' | 'neutral'
  canCancel: boolean
  canReopen: boolean
}

export function eventStatusInfo(e: Pick<EventItem, 'status' | 'startsAt' | 'endsAt'>, now: Date = new Date(), timeZone?: string): EventStatusInfo {
  if (e.status === 'hidden') return { label: 'Caché après plusieurs signalements', tone: 'danger', canCancel: false, canReopen: false }
  const ended = eventEnded(e, now)
  if (e.status === 'cancelled') return { label: 'Annulé', tone: 'danger', canCancel: false, canReopen: !ended }
  if (ended) return { label: 'Terminé', tone: 'neutral', canCancel: false, canReopen: false }
  return { label: eventCountdown(e.startsAt, e.endsAt, now, timeZone), tone: 'green', canCancel: true, canReopen: false }
}

/** À venir ou en cours (pas fini), du plus proche au plus lointain. */
export function upcomingEvents<T extends Pick<EventItem, 'startsAt' | 'endsAt'>>(events: readonly T[], now: Date = new Date()): T[] {
  return events
    .filter((e) => {
      const end = Date.parse(e.endsAt)
      return Number.isFinite(end) && end >= now.getTime()
    })
    .sort((x, y) => Date.parse(x.startsAt) - Date.parse(y.startsAt))
}

export function interestCountText(n: number): string {
  const c = Math.max(0, Math.floor(n) || 0)
  if (c === 0) return 'Personne n’est encore intéressé'
  return c === 1 ? '1 personne intéressée' : `${c} personnes intéressées`
}

export const capacityText = (c: number | null): string | null => (c == null ? null : `${c} ${c > 1 ? 'places annoncées' : 'place annoncée'}`)

export function emptyEventsText(): { title: string; hint: string } {
  return { title: 'Aucun événement près de chez vous pour l’instant', hint: 'Les organisateurs vérifiés publient ici les rendez-vous du coin. Revenez bientôt, ou élargissez la distance.' }
}

// ---------- Événements : saisie des dates (champs date et heure de l'appareil) ----------

const pad = (n: number) => String(n).padStart(2, '0')
/** « 2026-11-14 » dans le fuseau de l'appareil. */
export const dateInput = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/**
 * Date (« 2026-11-14 ») et heure (« 14:30 ») de l'appareil → date ISO complète, ou null si l'une est absente ou impossible
 * (30 février, 25 h…).
 */
export function localDateTimeToIso(date: string, time: string): string | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  const t = /^(\d{2}):(\d{2})$/.exec(time)
  if (!d || !t) return null
  const [y, mo, da, h, mi] = [Number(d[1]), Number(d[2]), Number(d[3]), Number(t[1]), Number(t[2])]
  const x = new Date(y, mo - 1, da, h, mi, 0, 0)
  if (x.getFullYear() !== y || x.getMonth() !== mo - 1 || x.getDate() !== da || x.getHours() !== h || x.getMinutes() !== mi) return null
  return x.toISOString()
}

// ---------- Jardins partagés et boutures (v8) ----------

/** Forme d'un identifiant de fiche accepté par la base (miroir de `neighbors_species_valid`). */
export const SPECIES_ID = /^[a-z0-9-]{2,40}$/

/**
 * Liste à partager : les espèces des plantes en place (ni projets ni plantes mortes), sans doublon, triées, limitées à 80.
 * Jamais de position, de nombre ni de nom personnel : seulement l'identifiant de la fiche.
 */
export function speciesToShare(plants: { speciesId: string; status: string }[], known: (id: string) => boolean = () => true): string[] {
  const ids = new Set<string>()
  for (const p of plants) {
    if (p.status === 'projet' || p.status === 'mort') continue
    if (SPECIES_ID.test(p.speciesId) && known(p.speciesId)) ids.add(p.speciesId)
  }
  return [...ids].sort().slice(0, L.gardenSpeciesMax)
}

/** Vrai si la liste partagée est celle du jardin (sert à proposer « Mettre à jour »). */
export function sameSpecies(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && [...a].sort().every((x, i) => x === [...b].sort()[i])
}

/** Message proposé (modifiable) pour demander une bouture. */
export function cuttingRequestText(speciesName: string, pseudo: string): string {
  const name = speciesName.trim() || 'plante'
  return `Bonjour ${pseudo}, j’ai vu dans votre jardin : ${name}. Auriez-vous une bouture à me donner ? Merci !`
}

/** Voisins qui ont cette espèce, pour répondre à « qui a du romarin ? ». */
export function whoHas<T extends { species: readonly string[] }>(shares: readonly T[], speciesId: string): T[] {
  return shares.filter((s) => s.species.includes(speciesId))
}

// Entraide entre voisins : logique pure de l'interface (filtres, libellés, dates). Aucun accès réseau ni navigateur.
import { roundCell } from './cell'
import { POST_CATEGORIES, isPostCategory, type Cell, type Post, type PostCategory, type PostKind } from './types'

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
export function cellPreview(lat: number, lon: number): CellPreview {
  const cell = roundCell(lat, lon)
  return { cell, text: describeCell(cell) }
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
export function neighborhoodText(cell: Cell, garden: { address?: string; center: { lat: number; lon: number } } | undefined): string {
  if (!garden) return 'autour du jardin choisi à l’inscription'
  const same = (() => {
    try {
      const c = roundCell(garden.center.lat, garden.center.lon)
      return c.lat === cell.lat && c.lon === cell.lon
    } catch {
      return false
    }
  })()
  if (!same) return 'autour du jardin choisi à l’inscription'
  const commune = communeFromAddress(garden.address)
  return commune ? `commune de ${commune}` : AROUND_GARDEN
}

/** Même chose pour un point pas encore enregistré (centre du jardin actif). */
export function gardenNeighborhoodText(garden: { address?: string }): string {
  const commune = communeFromAddress(garden.address)
  return commune ? `commune de ${commune}` : AROUND_GARDEN
}

// ---------- Divers ----------

/** Rafraîchit seulement onglet visible et appareil en ligne. */
export const shouldPoll = (visibility: string | undefined, online: boolean | undefined) => visibility !== 'hidden' && online !== false

/** Vrai si les deux listes ont les mêmes identifiants dans le même ordre : évite un nouveau rendu inutile. */
export function sameIds<T extends { id: string }>(a: readonly T[], b: readonly T[]): boolean {
  return a.length === b.length && a.every((x, i) => x.id === b[i].id)
}

/** Contrôle léger de forme avant d’activer le bouton d’envoi (api.ts vérifie ensuite). */
export const isEmailLike = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim())

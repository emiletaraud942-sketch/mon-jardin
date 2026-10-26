import type { XY } from '../../types'
import { SPECIES_BY_ID } from '../../data/species'
import { UNKNOWN_SPECIES_ID } from '../../lib/customName'

// File d'attente du scan des plantes : pure et testée. Chaque élément = une photo, une position proposée,
// des suggestions de nom. Elle survit à un rechargement (IndexedDB, voir queueStore.ts).

export type ItemStatus = 'en-attente' | 'a-valider' | 'validee' | 'ignoree'
export type WhyWaiting = 'consentement' | 'reseau' | 'erreur'

export interface Suggestion {
  latin: string
  name: string
  score: number
  /** Espèce de notre base, si elle existe. */
  speciesId?: string
  approx: boolean
}

export interface ScanItem {
  id: string
  /** Jardin dans lequel la plante a été photographiée. */
  gardenId: string
  photoId: string
  createdAt: string
  position: XY
  accuracyM: number
  status: ItemStatus
  /** Pourquoi l'identification n'est pas faite (statut « en-attente »). */
  why?: WhyWaiting
  attempts: number
  /** Ne pas réessayer avant cette date (ms). */
  nextTryAt?: number
  suggestions: Suggestion[]
  /** Choix actuel : espèce de la base (ou « inconnue » avec `customName`). */
  speciesId?: string
  customName?: string
  plantStatus: 'en-place' | 'projet'
  /** Plante créée à la validation. */
  plantId?: string
}

export const MAX_ATTEMPTS = 5
/** Attente avant réessai : 10 s, 30 s, 2 min, 5 min, 10 min. */
export const BACKOFF_MS = [10_000, 30_000, 120_000, 300_000, 600_000]
/** Au plus 40 éléments en attente de revue : au-delà, on demande de finir la revue. */
export const MAX_ITEMS = 40

export type Queue = ScanItem[]

export function newItem(p: { id: string; gardenId: string; photoId: string; position: XY; accuracyM: number; now?: Date; plantStatus?: 'en-place' | 'projet' }): ScanItem {
  return {
    id: p.id,
    gardenId: p.gardenId,
    photoId: p.photoId,
    createdAt: (p.now ?? new Date()).toISOString(),
    position: p.position,
    accuracyM: p.accuracyM,
    status: 'en-attente',
    why: 'reseau',
    attempts: 0,
    suggestions: [],
    plantStatus: p.plantStatus ?? 'en-place',
  }
}

const update = (q: Queue, id: string, f: (i: ScanItem) => ScanItem): Queue => q.map((i) => (i.id === id ? f(i) : i))

export const forGarden = (q: Queue, gardenId: string): Queue => q.filter((i) => i.gardenId === gardenId)

export const enqueue = (q: Queue, item: ScanItem): Queue => [...q, item]

/** Résultat d'identification reçu : l'élément passe « à valider ». La meilleure suggestion est choisie d'office. */
export function applyResults(q: Queue, id: string, suggestions: Suggestion[]): Queue {
  return update(q, id, (i) => {
    const best = suggestions[0]
    const choice = i.speciesId ? { speciesId: i.speciesId, customName: i.customName } : best ? choiceOf(best) : {}
    return { ...i, status: 'a-valider', why: undefined, nextTryAt: undefined, suggestions, ...choice }
  })
}

/** Espèce et nom à retenir pour une suggestion. */
export function choiceOf(s: Suggestion): { speciesId: string; customName?: string } {
  return s.speciesId ? { speciesId: s.speciesId } : { speciesId: UNKNOWN_SPECIES_ID, customName: s.name }
}

/** Échec d'envoi : l'élément attend, avec un délai croissant. Hors ligne, pas d'usure des essais. */
export function markFailed(q: Queue, id: string, opts: { offline: boolean; now: number }): Queue {
  return update(q, id, (i) => {
    if (opts.offline) return { ...i, status: 'en-attente', why: 'reseau', nextTryAt: undefined }
    const attempts = i.attempts + 1
    return { ...i, status: 'en-attente', why: 'erreur', attempts, nextTryAt: opts.now + BACKOFF_MS[Math.min(attempts - 1, BACKOFF_MS.length - 1)] }
  })
}

export const markNeedsConsent = (q: Queue, id: string): Queue => update(q, id, (i) => ({ ...i, status: 'en-attente', why: 'consentement', nextTryAt: undefined }))

/** Éléments à envoyer maintenant : en attente, délai écoulé, essais restants. Sans autorisation ou hors ligne : aucun. */
export function dueItems(q: Queue, o: { now: number; online: boolean; consent: boolean }): ScanItem[] {
  if (!o.online || !o.consent) return []
  return q.filter((i) => i.status === 'en-attente' && i.attempts < MAX_ATTEMPTS && (i.nextTryAt ?? 0) <= o.now)
}

/** Réessai demandé à la main : remet les compteurs à zéro. */
export function resetRetry(q: Queue, id?: string): Queue {
  return q.map((i) => (i.status === 'en-attente' && (!id || i.id === id) ? { ...i, attempts: 0, nextTryAt: undefined } : i))
}

export const moveItem = (q: Queue, id: string, position: XY, accuracyM?: number): Queue => update(q, id, (i) => ({ ...i, position, accuracyM: accuracyM ?? i.accuracyM }))

/** Choix manuel d'une espèce (ou d'un nom libre) : l'élément est prêt à valider, même sans identification. */
export function chooseSpecies(q: Queue, id: string, c: { speciesId: string; customName?: string }): Queue {
  return update(q, id, (i) => ({ ...i, speciesId: c.speciesId, customName: c.speciesId === UNKNOWN_SPECIES_ID ? c.customName : undefined, status: i.status === 'en-attente' ? 'a-valider' : i.status, why: undefined }))
}

export const setPlantStatus = (q: Queue, id: string, plantStatus: 'en-place' | 'projet'): Queue => update(q, id, (i) => ({ ...i, plantStatus }))

/** Un élément peut être validé s'il a une espèce (ou un nom). */
export const canValidate = (i: ScanItem) => i.status === 'a-valider' && !!i.speciesId && (i.speciesId !== UNKNOWN_SPECIES_ID || !!i.customName)

export const markValidated = (q: Queue, id: string, plantId: string): Queue => update(q, id, (i) => ({ ...i, status: 'validee', plantId }))
export const markIgnored = (q: Queue, id: string): Queue => update(q, id, (i) => ({ ...i, status: 'ignoree' }))
/** Retour en arrière après « Annuler » : la plante créée est retirée, l'élément redevient à valider. */
export const markUnvalidated = (q: Queue, id: string): Queue => update(q, id, (i) => ({ ...i, status: 'a-valider', plantId: undefined }))

export interface Summary {
  validated: number
  toReview: number
  ignored: number
  /** Dont ceux qui attendent l'identification. */
  waiting: number
}

export function summary(q: Queue): Summary {
  return {
    validated: q.filter((i) => i.status === 'validee').length,
    toReview: q.filter((i) => i.status === 'a-valider' || i.status === 'en-attente').length,
    ignored: q.filter((i) => i.status === 'ignoree').length,
    waiting: q.filter((i) => i.status === 'en-attente').length,
  }
}

const n = (k: number, one: string, many: string) => `${k} ${k > 1 ? many : one}`

/** « 6 plantes validées, 2 à revoir ». */
export function summaryText(s: Summary): string {
  if (s.validated === 0 && s.toReview === 0) return 'Aucune plante scannée pour le moment.'
  const parts: string[] = []
  if (s.validated > 0) parts.push(n(s.validated, 'plante validée', 'plantes validées'))
  if (s.toReview > 0) parts.push(`${s.toReview} à revoir`)
  return parts.join(', ')
}

/** Phrase simple pour un élément en attente. */
export function waitingText(i: ScanItem, now: number): string {
  if (i.status !== 'en-attente') return ''
  if (i.why === 'consentement') return 'En attente de votre accord pour envoyer la photo.'
  if (i.why === 'reseau') return 'Pas de connexion. La photo est gardée et sera envoyée plus tard.'
  if (i.attempts >= MAX_ATTEMPTS) return 'L’identification a échoué plusieurs fois. Choisissez la plante vous-même.'
  const wait = Math.max(0, Math.ceil(((i.nextTryAt ?? now) - now) / 1000))
  return wait > 0 ? `L’identification a échoué. Nouvel essai dans ${wait < 90 ? `${wait} s` : `${Math.ceil(wait / 60)} min`}.` : 'L’identification a échoué. Nouvel essai en cours.'
}

/** Nom affiché d'un élément : choix actuel, sinon première suggestion, sinon « Plante à nommer ». */
export function itemName(i: ScanItem): string {
  if (i.speciesId === UNKNOWN_SPECIES_ID && i.customName) return i.customName
  if (i.speciesId && SPECIES_BY_ID[i.speciesId]) return SPECIES_BY_ID[i.speciesId].nomCommun
  return i.suggestions[0]?.name ?? 'Plante à nommer'
}

/** Garde les éléments à revoir ; retire validés et ignorés (leurs photos sont gérées par l'appelant). */
export function finish(q: Queue): { kept: Queue; ignoredPhotos: string[] } {
  return { kept: q.filter((i) => i.status === 'a-valider' || i.status === 'en-attente'), ignoredPhotos: q.filter((i) => i.status === 'ignoree').map((i) => i.photoId) }
}

// ---------- Lecture sûre depuis IndexedDB ----------

const isXY = (v: unknown): v is XY => !!v && typeof v === 'object' && Number.isFinite((v as XY).x) && Number.isFinite((v as XY).y)
const STATUSES: ItemStatus[] = ['en-attente', 'a-valider', 'validee', 'ignoree']

/** Valide ce qui vient d'IndexedDB : tout élément incomplet est écarté, jamais de plantage. */
export function sanitizeQueue(raw: unknown): Queue {
  if (!Array.isArray(raw)) return []
  const out: Queue = []
  const seen = new Set<string>()
  for (const r of raw.slice(0, MAX_ITEMS * 2) as Record<string, unknown>[]) {
    if (!r || typeof r !== 'object') continue
    if (typeof r.id !== 'string' || typeof r.gardenId !== 'string' || seen.has(r.id) || typeof r.photoId !== 'string' || !/^photo:[A-Za-z0-9]{1,64}$/.test(r.photoId) || !isXY(r.position)) continue
    const status = STATUSES.includes(r.status as ItemStatus) ? (r.status as ItemStatus) : 'en-attente'
    seen.add(r.id)
    const suggestions: Suggestion[] = Array.isArray(r.suggestions)
      ? (r.suggestions as Record<string, unknown>[])
          .filter((s) => s && typeof s.latin === 'string' && typeof s.name === 'string' && typeof s.score === 'number')
          .slice(0, 5)
          .map((s) => ({ latin: s.latin as string, name: (s.name as string).slice(0, 80), score: s.score as number, speciesId: typeof s.speciesId === 'string' && SPECIES_BY_ID[s.speciesId] ? s.speciesId : undefined, approx: s.approx === true }))
      : []
    out.push({
      id: r.id,
      gardenId: r.gardenId,
      photoId: r.photoId,
      createdAt: typeof r.createdAt === 'string' ? r.createdAt : new Date(0).toISOString(),
      position: { x: (r.position as XY).x, y: (r.position as XY).y },
      accuracyM: typeof r.accuracyM === 'number' && Number.isFinite(r.accuracyM) ? r.accuracyM : 10,
      status,
      why: r.why === 'consentement' || r.why === 'reseau' || r.why === 'erreur' ? r.why : status === 'en-attente' ? 'reseau' : undefined,
      attempts: typeof r.attempts === 'number' && Number.isFinite(r.attempts) ? Math.max(0, Math.floor(r.attempts)) : 0,
      nextTryAt: typeof r.nextTryAt === 'number' && Number.isFinite(r.nextTryAt) ? r.nextTryAt : undefined,
      suggestions,
      speciesId: typeof r.speciesId === 'string' && (r.speciesId === UNKNOWN_SPECIES_ID || SPECIES_BY_ID[r.speciesId]) ? r.speciesId : undefined,
      customName: typeof r.customName === 'string' ? r.customName.slice(0, 80) : undefined,
      plantStatus: r.plantStatus === 'projet' ? 'projet' : 'en-place',
      plantId: typeof r.plantId === 'string' ? r.plantId : undefined,
    })
  }
  return out
}

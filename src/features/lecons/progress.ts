import { LECON_OUTLINE, type LeconOutline } from './outline'

// Suivi des leçons terminées : UNE clé localStorage `pj.lessons` (JSON : liste d'identifiants de leçons).
// Rien n'est envoyé, rien n'est synchronisé. Module sans React : lecture validée, jamais d'exception.

export const LESSONS_KEY = 'pj.lessons'

const KNOWN = new Set(LECON_OUTLINE.map((l) => l.id))
/** Plus de leçons que le plan n'en compte : un tableau plus long est coupé, jamais lu en entier. */
const MAX_READ = LECON_OUTLINE.length * 4

/** Garde les identifiants connus, sans doublon, dans l'ordre du plan (une valeur inconnue est ignorée). */
export function sanitizeDone(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  for (const v of raw.slice(0, MAX_READ)) if (typeof v === 'string' && KNOWN.has(v)) seen.add(v)
  return LECON_OUTLINE.filter((l) => seen.has(l.id)).map((l) => l.id)
}

/** Lecture de la chaîne stockée : JSON illisible ou autre forme = aucune leçon terminée. */
export function parseDone(text: string | null | undefined): string[] {
  if (!text || text.length > 4000) return []
  try {
    return sanitizeDone(JSON.parse(text))
  } catch {
    return []
  }
}

// Mémoire de la session : sert seulement quand localStorage est absent ou refuse l'écriture (navigation privée, stockage plein).
let memory: string[] | undefined
let cache: { raw: string | null; done: string[] } | undefined
const listeners = new Set<() => void>()

const rawStored = (): string | null | undefined => {
  try {
    return localStorage.getItem(LESSONS_KEY)
  } catch {
    return undefined // pas de stockage
  }
}

/** Les leçons terminées. Même tableau d'un appel à l'autre tant que rien ne change (utilisable avec useSyncExternalStore). */
export function readDone(): string[] {
  const raw = rawStored()
  if (raw === undefined) return memory ?? []
  if (raw === null && memory) return memory // écriture refusée plus tôt : la mémoire de la session reste juste
  if (cache && cache.raw === raw) return cache.done
  cache = { raw, done: parseDone(raw) }
  return cache.done
}

function write(next: string[]) {
  memory = undefined
  cache = undefined
  try {
    if (next.length === 0) localStorage.removeItem(LESSONS_KEY)
    else localStorage.setItem(LESSONS_KEY, JSON.stringify(next))
  } catch {
    memory = next // mémoire de la session seulement
  }
  listeners.forEach((l) => l())
}

/** Abonnement aux changements (cet onglet, et un autre onglet via l'événement `storage`). */
export function subscribeDone(l: () => void): () => void {
  listeners.add(l)
  const onStorage = (e: StorageEvent) => {
    if (e.key === LESSONS_KEY || e.key === null) {
      cache = undefined
      l()
    }
  }
  if (typeof window !== 'undefined') window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(l)
    if (typeof window !== 'undefined') window.removeEventListener('storage', onStorage)
  }
}

export const isDone = (done: readonly string[], id: string): boolean => done.includes(id)

/** Note la leçon comme terminée (sans effet si l'identifiant est inconnu). Renvoie la liste à jour. */
export function markDone(id: string): string[] {
  if (!KNOWN.has(id)) return readDone()
  const next = sanitizeDone([...readDone(), id])
  write(next)
  return next
}

/** « Rouvrir » : retire la coche. */
export function unmarkDone(id: string): string[] {
  const next = readDone().filter((x) => x !== id)
  write(next)
  return next
}

/** Efface tout le suivi. */
export function resetProgress() {
  write([])
}

export const countDone = (done: readonly string[]): number => sanitizeDone(done).length
export const totalLessons = (): number => LECON_OUTLINE.length

/** Part des leçons terminées, de 0 à 100 (entier). */
export function percentDone(done: readonly string[]): number {
  return Math.round((countDone(done) / LECON_OUTLINE.length) * 100)
}

/** La première leçon pas encore terminée, dans l'ordre du parcours (`undefined` : tout est fait). */
export function nextLesson(done: readonly string[]): LeconOutline | undefined {
  return LECON_OUTLINE.find((l) => !done.includes(l.id))
}

/** « 1 leçon sur 14 », « 5 leçons sur 14 », « Aucune leçon terminée sur 14 ». */
export function doneSentence(done: readonly string[]): string {
  const n = countDone(done)
  const t = LECON_OUTLINE.length
  if (n === 0) return `Aucune leçon terminée sur ${t}`
  return `${n} leçon${n > 1 ? 's' : ''} sur ${t}`
}

/** Requêtes réseau avec délai maximal et messages d'erreur en français. */

export async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit & { timeoutMs?: number } = {}): Promise<Response> {
  const { timeoutMs = 15000, signal, ...rest } = init
  // Signal déjà abandonné : aucune requête n'est envoyée (un écouteur « abort » ne se déclenche plus après coup).
  if (signal?.aborted) throw new DOMException('Requête annulée', 'AbortError')
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  const onAbort = () => ctrl.abort()
  signal?.addEventListener('abort', onAbort, { once: true })
  try {
    return await fetch(input, { ...rest, signal: ctrl.signal })
  } catch (e) {
    if ((e as Error).name === 'AbortError' && !signal?.aborted) throw new Error('Le service met trop de temps à répondre. Réessayez dans un instant.')
    if ((e as Error).name === 'AbortError') throw e
    throw new Error('Connexion impossible. Vérifiez votre accès à Internet.')
  } finally {
    clearTimeout(timer)
    // L'écouteur est retiré : un signal de longue durée ne garde plus une référence par appel.
    signal?.removeEventListener('abort', onAbort)
  }
}

/** Erreur HTTP : le statut et le délai demandé par le serveur (`Retry-After`, borné) restent lisibles par l'appelant. */
export class HttpStatusError extends Error {
  readonly status: number
  readonly retryAfterMs?: number
  constructor(message: string, status: number, retryAfterMs?: number) {
    super(message)
    this.name = 'HttpStatusError'
    this.status = status
    this.retryAfterMs = retryAfterMs
  }
}

/** Plafond de l'attente demandée par un serveur : au-delà, on rend la main plutôt que de bloquer l'écran. */
export const RETRY_AFTER_MAX_MS = 5000

/**
 * En-tête `Retry-After` (secondes entières ou date HTTP) en millisecondes, borné entre 0 et 5 s.
 * Absent ou illisible : `undefined` (l'appelant choisit son délai).
 */
export function parseRetryAfter(value: string | null | undefined, now = Date.now()): number | undefined {
  const v = value?.trim()
  if (!v) return undefined
  let ms: number
  if (/^\d+(\.\d+)?$/.test(v)) ms = Number(v) * 1000
  else {
    if (!/[a-z]/i.test(v)) return undefined
    const at = Date.parse(v)
    if (!Number.isFinite(at)) return undefined
    ms = at - now
  }
  if (!Number.isFinite(ms)) return undefined
  return Math.max(0, Math.min(RETRY_AFTER_MAX_MS, Math.round(ms)))
}

/** GET/POST JSON : erreur claire si le statut n'est pas 2xx ou si la réponse n'est pas du JSON. */
export async function fetchJson<T = unknown>(url: string, init: RequestInit & { timeoutMs?: number; service?: string } = {}): Promise<T> {
  const { service = 'Le service', ...rest } = init
  const r = await fetchWithTimeout(url, rest)
  const text = await r.text()
  if (!r.ok) throw new HttpStatusError(`${service} a répondu une erreur (${r.status}).`, r.status, parseRetryAfter(r.headers?.get('retry-after')))
  try {
    return JSON.parse(text) as T
  } catch {
    throw new Error(`${service} a renvoyé une réponse illisible.`)
  }
}

// ---------- file d'attente avec plafond ----------

export interface Limiter {
  /** Lance `task` dès qu'une place est libre. Un signal annulé pendant l'attente retire la tâche de la file. */
  run<T>(task: () => Promise<T>, signal?: AbortSignal): Promise<T>
  readonly active: number
  readonly queued: number
}

function abortRejection(): Error {
  const e = new Error('Requête annulée.')
  e.name = 'AbortError'
  return e
}

/**
 * File d'attente : au plus `maxConcurrent` tâches en même temps, et au moins `minGapMs` entre deux départs
 * (limites de débit des services, par exemple 5 requêtes par seconde pour l'altimétrie).
 */
export function createLimiter(maxConcurrent: number, minGapMs = 0, clock: () => number = Date.now): Limiter {
  const max = Math.max(1, Math.floor(maxConcurrent))
  interface Waiting {
    start: () => void
  }
  const queue: Waiting[] = []
  let active = 0
  let nextStart = 0
  let timer: ReturnType<typeof setTimeout> | undefined

  const pump = () => {
    if (timer !== undefined) return
    while (active < max && queue.length) {
      const wait = nextStart - clock()
      if (wait > 0) {
        timer = setTimeout(() => {
          timer = undefined
          pump()
        }, wait)
        return
      }
      const w = queue.shift() as Waiting
      active++
      nextStart = clock() + minGapMs
      w.start()
    }
  }

  return {
    run<T>(task: () => Promise<T>, signal?: AbortSignal): Promise<T> {
      if (signal?.aborted) return Promise.reject(abortRejection())
      return new Promise<T>((resolve, reject) => {
        const onAbort = () => {
          const k = queue.indexOf(entry)
          if (k >= 0) queue.splice(k, 1)
          reject(abortRejection())
        }
        const entry: Waiting = {
          start: () => {
            signal?.removeEventListener('abort', onAbort)
            Promise.resolve()
              .then(task)
              .then(resolve, reject)
              .finally(() => {
                active--
                pump()
              })
          },
        }
        signal?.addEventListener('abort', onAbort, { once: true })
        queue.push(entry)
        pump()
      })
    },
    get active() {
      return active
    },
    get queued() {
      return queue.length
    },
  }
}

/** Message pour l'écran : une phrase simple, et le détail technique à garder derrière un lien « Détails ». */
export interface FriendlyError {
  message: string
  detail?: string
}

const GENERIC = 'Un problème est survenu. Réessayez dans un instant.'
const SERVICE_DOWN = 'Le service ne répond pas pour le moment. Réessayez plus tard.'
const TECHNICAL = /\((\d{3})\)|\b(HTTP|TypeError|SyntaxError|undefined|null|JSON|fetch|Unexpected|Failed|Error:|status|CORS|abort)\b|[{}[\]]|^\s*\w+Error\b/i

/**
 * Traduit une erreur (réseau, service, code inattendu) en phrase simple. Le texte d'origine est gardé dans `detail`
 * quand il est technique : l'interface le montre derrière « Détails », jamais en premier.
 */
export function friendlyError(e: unknown): FriendlyError {
  const raw = (e instanceof Error ? e.message : typeof e === 'string' ? e : '').trim()
  if (!raw) return { message: GENERIC }
  if (/^Connexion impossible/.test(raw) || /trop de temps/.test(raw)) return { message: raw }
  if (/^L’espace de cet appareil est plein/.test(raw)) return { message: raw } // MESSAGE_FULL de photos.ts : long, mais déjà en mots simples
  if (/a répondu une erreur|réponse illisible/.test(raw)) return { message: SERVICE_DOWN, detail: raw }
  if (TECHNICAL.test(raw) || raw.length > 160) return { message: GENERIC, detail: raw }
  return { message: raw }
}

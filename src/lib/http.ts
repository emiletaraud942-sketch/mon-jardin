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

/** GET/POST JSON : erreur claire si le statut n'est pas 2xx ou si la réponse n'est pas du JSON. */
export async function fetchJson<T = unknown>(url: string, init: RequestInit & { timeoutMs?: number; service?: string } = {}): Promise<T> {
  const { service = 'Le service', ...rest } = init
  const r = await fetchWithTimeout(url, rest)
  const text = await r.text()
  if (!r.ok) throw new Error(`${service} a répondu une erreur (${r.status}).`)
  try {
    return JSON.parse(text) as T
  } catch {
    throw new Error(`${service} a renvoyé une réponse illisible.`)
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

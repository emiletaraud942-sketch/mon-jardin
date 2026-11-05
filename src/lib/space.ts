// Place disponible sur l'appareil : contrôle avant d'écrire une photo, nouvelle tentative, message unique.

export const STORAGE_FULL_MESSAGE = 'Il n’y a plus assez de place sur ce téléphone.'

/** Marge laissée libre en plus de l'écriture (l'état du jardin doit toujours pouvoir s'enregistrer). */
export const RESERVE_BYTES = 3 * 1024 * 1024

export class StorageFullError extends Error {
  constructor() {
    super(STORAGE_FULL_MESSAGE)
    this.name = 'StorageFullError'
  }
}

/** Vrai pour l'erreur « stockage plein » des navigateurs (nom standard, code 22, ancien nom Firefox). */
export function isQuotaError(e: unknown): boolean {
  if (e instanceof StorageFullError) return true
  if (!e || typeof e !== 'object') return false
  const o = e as { name?: unknown; code?: unknown }
  return o.name === 'QuotaExceededError' || o.name === 'NS_ERROR_DOM_QUOTA_REACHED' || o.code === 22 || o.code === 1014
}

/** Reste-t-il de la place pour `bytes` octets ? Une estimation absente ou incomplète donne « oui » (on tentera l'écriture). */
export function hasRoom(estimate: { quota?: number; usage?: number } | undefined, bytes: number, reserve = RESERVE_BYTES): boolean {
  const quota = estimate?.quota
  const usage = estimate?.usage
  if (typeof quota !== 'number' || typeof usage !== 'number' || !(quota > 0)) return true
  return quota - usage >= bytes + reserve
}

async function readEstimate(): Promise<{ quota?: number; usage?: number } | undefined> {
  try {
    return await navigator.storage?.estimate?.()
  } catch {
    return undefined
  }
}

/** Refuse avant d'écrire s'il n'y a pas la place. */
export async function ensureRoom(bytes: number): Promise<void> {
  if (!hasRoom(await readEstimate(), bytes)) throw new StorageFullError()
}

/**
 * Lance une écriture ; si le navigateur répond « plein », attend un instant et recommence une fois,
 * puis lève `StorageFullError`. Les autres erreurs passent telles quelles.
 */
export async function writeWithRetry<T>(write: () => Promise<T>, opts: { retries?: number; delayMs?: number } = {}): Promise<T> {
  const { retries = 1, delayMs = 400 } = opts
  for (let attempt = 0; ; attempt++) {
    try {
      return await write()
    } catch (e) {
      if (!isQuotaError(e)) throw e
      if (attempt >= retries) throw new StorageFullError()
      await new Promise((r) => setTimeout(r, delayMs))
    }
  }
}

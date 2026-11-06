// Place disponible sur l'appareil : contrôle avant d'écrire une photo et une nouvelle tentative avant d'abandonner.

/** Marge laissée libre en plus de l'écriture : l'état du jardin doit toujours pouvoir s'enregistrer. */
export const RESERVE_BYTES = 3 * 1024 * 1024

/** Reste-t-il de la place pour `bytes` octets ? Une estimation absente ou incomplète répond « oui » (on tentera l'écriture). */
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

/** Faux s'il est sûr qu'il n'y a pas la place pour `bytes` octets (plus la marge). */
export async function roomFor(bytes: number): Promise<boolean> {
  return hasRoom(await readEstimate(), bytes)
}

/**
 * Lance une écriture ; si le navigateur répond « plein », attend un instant et recommence (une fois par défaut),
 * puis relance l'erreur d'origine. Les autres erreurs passent telles quelles.
 */
export async function writeWithRetry<T>(write: () => Promise<T>, isFull: (e: unknown) => boolean, opts: { retries?: number; delayMs?: number } = {}): Promise<T> {
  const { retries = 1, delayMs = 400 } = opts
  for (let attempt = 0; ; attempt++) {
    try {
      return await write()
    } catch (e) {
      if (!isFull(e) || attempt >= retries) throw e
      await new Promise((r) => setTimeout(r, delayMs))
    }
  }
}

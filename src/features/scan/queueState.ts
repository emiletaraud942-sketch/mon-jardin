import { useSyncExternalStore } from 'react'
import { get, set } from 'idb-keyval'
import { SCAN_QUEUE_KEY } from '../../lib/store'
import type { Queue } from './queue'

// État de la file du scan (léger : ni identification ni photos). Séparé de `queueStore` pour que les boutons « N plantes à valider »
// ne tirent pas tout le code d'identification dans le chunk d'entrée. Local-first : tout reste dans IndexedDB.

let queue: Queue = []
let loading: Promise<void> | undefined
let version = 0
const listeners = new Set<() => void>()

function emit() {
  version++
  listeners.forEach((l) => l())
}

async function persist() {
  try {
    await set(SCAN_QUEUE_KEY, queue)
    // La copie en ligne (autoSync) en est prévenue : la file voyage avec elle.
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('pj:scan-queue'))
  } catch (e) {
    console.warn('File d’attente du scan non enregistrée', e)
  }
}

/** Charge la file depuis IndexedDB (une seule fois). */
export function loadQueue(): Promise<void> {
  loading ??= get(SCAN_QUEUE_KEY)
    .then(async (raw) => {
      const { sanitizeQueue } = await import('./queue') // chargé à la demande : le chunk d'entrée n'en a pas besoin
      // Ce qui a été ajouté pendant la lecture reste.
      const fresh = sanitizeQueue(raw).filter((i) => !queue.some((q) => q.id === i.id))
      queue = [...fresh, ...queue]
    })
    .catch((e) => console.warn('File d’attente du scan illisible', e))
    .finally(() => {
      emit()
    })
  return loading
}

export const getQueue = () => queue

const RANK: Record<string, number> = { 'en-attente': 0, 'a-valider': 1, ignoree: 2, validee: 3 }

/**
 * Reprend la file du scan d'une autre copie (copie en ligne) : on ajoute ce qui manque ici ; pour un même élément, l'état le plus avancé
 * (validé, ignoré) l'emporte, sinon celui d'ici. Jamais d'écrasement. Renvoie vrai si cet appareil a des éléments que la copie n'a pas.
 */
export async function mergeRemoteQueue(raw: unknown): Promise<boolean> {
  await loadQueue()
  const { sanitizeQueue } = await import('./queue')
  const remote = sanitizeQueue(raw)
  const byId = new Map(queue.map((i) => [i.id, i]))
  let changed = false
  const merged = [...queue]
  for (const r of remote) {
    const mine = byId.get(r.id)
    if (!mine) {
      merged.push(r)
      changed = true
    } else if ((RANK[r.status] ?? 0) > (RANK[mine.status] ?? 0)) {
      merged[merged.indexOf(mine)] = r
      changed = true
    }
  }
  if (changed) {
    queue = merged
    emit()
    try {
      await set(SCAN_QUEUE_KEY, queue)
    } catch (e) {
      console.warn('File d’attente du scan non enregistrée', e)
    }
  }
  const remoteIds = new Set(remote.map((i) => i.id))
  return queue.some((i) => !remoteIds.has(i.id))
}

/** Applique un changement à la file, l'enregistre et prévient l'interface. */
export function updateQueue(f: (q: Queue) => Queue) {
  queue = f(queue)
  emit()
  void persist()
}

export function useScanQueue(): Queue {
  useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => version,
  )
  return queue
}

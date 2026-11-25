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

/** Remplace la file par celle de la copie en ligne (reprise sur un autre appareil) : mêmes règles de validation qu'à la lecture locale. */
export async function replaceQueue(raw: unknown): Promise<void> {
  await loadQueue()
  const { sanitizeQueue } = await import('./queue')
  queue = sanitizeQueue(raw)
  emit()
  await persist()
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

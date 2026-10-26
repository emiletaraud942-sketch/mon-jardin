import { useSyncExternalStore } from 'react'
import { get, set } from 'idb-keyval'
import { identifyPlant } from '../../lib/plantnet'
import { hasConsent } from '../../lib/consent'
import { SCAN_QUEUE_KEY } from '../../lib/store'
import { deletePhoto, getPhoto } from '../../lib/photos'
import { dedupeQueue } from './dedupe'
import { applyResults, dueItems, markFailed, markNeedsConsent, sanitizeQueue, type Queue, type Suggestion } from './queue'

// File d'attente partagée entre l'écran de scan et la carte. Local-first : tout reste dans IndexedDB.
// Seule la photo part (vers /api/identify), jamais la position.

let queue: Queue = []
let loaded = false
let loading: Promise<void> | undefined
let version = 0
const listeners = new Set<() => void>()
let running = false
/** Pause entre deux identifications d'images de vidéo (ms). */
export const VIDEO_PAUSE_MS = 1500

function emit() {
  version++
  listeners.forEach((l) => l())
}

async function persist() {
  try {
    await set(SCAN_QUEUE_KEY, queue)
  } catch (e) {
    console.warn('File d’attente du scan non enregistrée', e)
  }
}

/** Charge la file depuis IndexedDB (une seule fois). */
export function loadQueue(): Promise<void> {
  loading ??= get(SCAN_QUEUE_KEY)
    .then((raw) => {
      // Ce qui a été ajouté pendant la lecture reste.
      const fresh = sanitizeQueue(raw).filter((i) => !queue.some((q) => q.id === i.id))
      queue = [...fresh, ...queue]
    })
    .catch((e) => console.warn('File d’attente du scan illisible', e))
    .finally(() => {
      loaded = true
      emit()
    })
  return loading
}

export const getQueue = () => queue
export const isQueueLoaded = () => loaded

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

export const isOnline = () => typeof navigator === 'undefined' || navigator.onLine !== false

export function toSuggestions(list: Awaited<ReturnType<typeof identifyPlant>>): Suggestion[] {
  return list.slice(0, 4).map((r) => ({
    latin: r.latin,
    name: r.species?.nomCommun && !r.approx ? r.species.nomCommun : (r.commonNames[0] ?? r.latin),
    score: r.score,
    speciesId: r.species?.id,
    approx: r.approx,
  }))
}

/**
 * Envoie les photos en attente à l'identification, une par une. Sans accord de l'utilisateur ou hors ligne : rien ne part.
 * `manual` : réessai demandé à la main (ignore le délai d'attente, voir resetRetry).
 */
export async function processQueue(): Promise<void> {
  if (running) return
  running = true
  try {
    await loadQueue()
    for (;;) {
      const consent = hasConsent('plantnet')
      if (!consent) {
        for (const i of queue) if (i.status === 'en-attente' && i.why !== 'consentement') updateQueue((q) => markNeedsConsent(q, i.id))
        return
      }
      const next = dueItems(queue, { now: Date.now(), online: isOnline(), consent })[0]
      if (!next) return
      try {
        const blob = await getPhoto(next.photoId)
        if (!blob) throw new Error('Photo introuvable')
        const results = await identifyPlant([blob])
        updateQueue((q) => dedupeQueue(applyResults(q, next.id, toSuggestions(results))))
        // Images d'une vidéo : jamais en rafale, une pause entre deux envois (quota Pl@ntNet partagé).
        if (next.from === 'video') await new Promise((r) => setTimeout(r, VIDEO_PAUSE_MS))
      } catch (e) {
        console.warn('Identification impossible', e)
        updateQueue((q) => markFailed(q, next.id, { offline: !isOnline(), now: Date.now() }))
        if (!isOnline()) return
      }
    }
  } finally {
    running = false
  }
}

let started = false
/** Réessaie quand la connexion revient et à intervalle régulier tant que l'écran de scan est ouvert. */
export function startRetryLoop(): () => void {
  if (started) return () => undefined
  started = true
  const kick = () => void processQueue()
  window.addEventListener('online', kick)
  const timer = window.setInterval(kick, 15_000)
  kick()
  return () => {
    started = false
    window.removeEventListener('online', kick)
    window.clearInterval(timer)
  }
}

/** Retire un élément et sa photo (ignoré), ou garde la photo (validée : elle appartient désormais à la plante). */
export function dropPhotoOf(photoId: string) {
  void deletePhoto(photoId)
}

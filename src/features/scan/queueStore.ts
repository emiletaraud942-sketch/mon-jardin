import { identifyPlant } from '../../lib/plantnet'
import { rerank } from '../../lib/identifyRank'
import { rankContext, verdictOf } from '../../lib/rankContext'
import { cropCenter } from './crop'
import { hasConsent } from '../../lib/consent'
import { getQueue, loadQueue, mergeRemoteQueue, updateQueue, useScanQueue } from './queueState'
import { deletePhoto, getPhoto } from '../../lib/photos'
import { dedupeQueue } from './dedupe'
import { applyGroupResults, dueItems, groupPlan, markFailed, markNeedsConsent, type Suggestion } from './queue'

export { getQueue, loadQueue, mergeRemoteQueue, updateQueue, useScanQueue }

// File d'attente partagée entre l'écran de scan et la carte. Local-first : tout reste dans IndexedDB.
// Seule la photo part (vers /api/identify), jamais la position.

let running = false
/** Pause entre deux identifications d'images de vidéo (ms). */
export const VIDEO_PAUSE_MS = 1500

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
        for (const i of getQueue()) if (i.status === 'en-attente' && i.why !== 'consentement') updateQueue((q) => markNeedsConsent(q, i.id))
        return
      }
      const next = dueItems(getQueue(), { now: Date.now(), online: isOnline(), consent })[0]
      if (!next) return
      try {
        // Images d'une vidéo prises au même endroit : un seul envoi (jusqu'à 5 images, recadrées au centre), plus sûr et moins de quota.
        const plan = groupPlan(getQueue(), next, { now: Date.now() })
        const companions = plan.send
        const blobs: Blob[] = []
        const used: string[] = []
        for (const it of [next, ...companions]) {
          const b = await getPhoto(it.photoId)
          if (!b) {
            if (it === next) throw new Error('Photo introuvable')
            continue
          }
          blobs.push(it.from === 'video' ? await cropCenter(b) : b)
          used.push(it.id)
        }
        const ctx = rankContext(next.gardenId, next.accuracyM < 99 ? next.position : undefined)
        const results = rerank(await identifyPlant(blobs), ctx)
        const verdict = verdictOf(results, ctx)
        updateQueue((q) => dedupeQueue(applyGroupResults(q, next.id, [...used.filter((id) => id !== next.id), ...plan.merge.map((m) => m.id)], toSuggestions(results), verdict)))
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

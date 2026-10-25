// Pastille « nouveautés » de l'entrée Entraide du menu. Léger : le client Supabase n'est chargé qu'à la demande.
import { useEffect, useState } from 'react'
import { shouldPoll } from './logic'
import { NEWS_EVENT } from './news'

export const BADGE_POLL_MS = 5 * 60_000

/** Nombre de nouveautés, ou 0 quand l'entraide est inactive (`enabled` faux : pas d'accord, pas configurée). */
export function useNeighborsBadge(enabled: boolean, radiusKm: () => number): number {
  const [n, setN] = useState(0)
  useEffect(() => {
    if (!enabled) {
      setN(0)
      return
    }
    let alive = true
    let busy = false
    const refresh = () => {
      if (busy) return
      busy = true
      import('./newsLoad')
        .then((m) => m.loadBadge(radiusKm()))
        .then((v) => alive && setN(v))
        .catch(() => undefined)
        .finally(() => {
          busy = false
        })
    }
    const tick = () => {
      if (shouldPoll(document.visibilityState, navigator.onLine)) refresh()
    }
    refresh()
    const id = setInterval(tick, BADGE_POLL_MS)
    document.addEventListener('visibilitychange', tick)
    window.addEventListener(NEWS_EVENT, refresh)
    return () => {
      alive = false
      clearInterval(id)
      document.removeEventListener('visibilitychange', tick)
      window.removeEventListener(NEWS_EVENT, refresh)
    }
  }, [enabled, radiusKm])
  return n
}

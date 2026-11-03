import { useEffect } from 'react'

interface WakeLockSentinelLike {
  release(): Promise<void>
  addEventListener?(type: 'release', cb: () => void): void
}

/**
 * Garde l'écran allumé tant que `active` est vrai (prise de 12 photos, scan vidéo).
 * Relâché à la sortie ; repris au retour au premier plan (le navigateur le relâche en arrière-plan).
 * Aucune erreur ne remonte : si l'appareil ou la politique de permissions refuse, rien ne change.
 */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active) return
    const wl = (navigator as Navigator & { wakeLock?: { request(type: 'screen'): Promise<WakeLockSentinelLike> } }).wakeLock
    if (!wl) return
    let sentinel: WakeLockSentinelLike | undefined
    let stopped = false
    const take = async () => {
      if (stopped || sentinel || document.visibilityState !== 'visible') return
      try {
        const s = await wl.request('screen')
        if (stopped) {
          void s.release().catch(() => undefined)
          return
        }
        sentinel = s
        s.addEventListener?.('release', () => {
          if (sentinel === s) sentinel = undefined
        })
      } catch {
        /* refusé (économie d'énergie, politique) : on continue sans */
      }
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') void take()
    }
    void take()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      stopped = true
      document.removeEventListener('visibilitychange', onVisible)
      const s = sentinel
      sentinel = undefined
      if (s) void s.release().catch(() => undefined)
    }
  }, [active])
}

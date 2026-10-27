import { useEffect } from 'react'

interface WakeLockSentinelLike {
  release(): Promise<void>
}
type WakeLockApi = { request(type: 'screen'): Promise<WakeLockSentinelLike> }

/**
 * Garde l'écran allumé tant que `active` est vrai (prise de photos, scan : l'écran qui s'éteint coupe la caméra).
 * Aucune permission demandée. Repli silencieux si le navigateur ne sait pas faire, ou le refuse (économie d'énergie).
 * Le verrou saute quand l'onglet est masqué : on le reprend au retour.
 */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    const api = (typeof navigator !== 'undefined' ? (navigator as Navigator & { wakeLock?: WakeLockApi }).wakeLock : undefined)
    if (!active || !api) return
    let lock: WakeLockSentinelLike | undefined
    let stopped = false
    const acquire = async () => {
      try {
        const got = await api.request('screen')
        if (stopped) void got.release().catch(() => undefined)
        else lock = got
      } catch {
        /* refusé : l'écran suivra les réglages du téléphone */
      }
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible' && !lock) void acquire()
    }
    void acquire()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      stopped = true
      document.removeEventListener('visibilitychange', onVisible)
      void lock?.release().catch(() => undefined)
      lock = undefined
    }
  }, [active])
}

// Préchargement du chunk 3D (three + vue, ≈ 230 Ko gzip) pendant que le navigateur est inactif, pour que « Vue 3D » s'ouvre vite.
// Le chunk n'est pas dans le précache du service worker : ce préchargement le met aussi en cache d'exécution.
// Pas de préchargement si l'utilisateur économise ses données, si la connexion est lente, ou si l'appareil ne sait pas dessiner.
import { detectWebGL } from './webgl'

export interface ConnectionInfo {
  saveData?: boolean
  effectiveType?: string
}

/** Pure : faut-il précharger, d'après la connexion déclarée ? */
export function shouldPreload3d(conn: ConnectionInfo | undefined): boolean {
  if (!conn) return true
  if (conn.saveData) return false
  if (conn.effectiveType && /^(slow-2g|2g|3g)$/.test(conn.effectiveType)) return false
  return true
}

let started = false
/**
 * À appeler une fois après le premier affichage (App.tsx). Renvoie une fonction d'annulation.
 * Idempotent : un second appel ne fait rien. Aucune erreur ne remonte (le chargement normal réessaiera à l'ouverture de la 3D).
 */
export function preload3d(): () => void {
  if (started || typeof window === 'undefined') return () => {}
  const conn = (navigator as Navigator & { connection?: ConnectionInfo }).connection
  if (!shouldPreload3d(conn)) return () => {}
  let cancelled = false
  const run = () => {
    if (cancelled || started) return
    // Pas la peine de télécharger 230 Ko pour un appareil qui n'affichera pas la 3D.
    if (detectWebGL() !== 'ok') return
    started = true
    void import('./View3D').catch(() => {
      started = false // réseau coupé : on pourra réessayer plus tard
    })
  }
  const w = window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number; cancelIdleCallback?: (h: number) => void }
  if (typeof w.requestIdleCallback === 'function') {
    const h = w.requestIdleCallback(run, { timeout: 8000 })
    return () => {
      cancelled = true
      w.cancelIdleCallback?.(h)
    }
  }
  const t = window.setTimeout(run, 3000)
  return () => {
    cancelled = true
    window.clearTimeout(t)
  }
}

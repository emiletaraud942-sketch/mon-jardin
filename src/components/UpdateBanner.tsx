import { useEffect } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'

const OFFLINE_KEY = 'permajardin:offline-ready-shown'
const CHECK_EVERY_MS = 60 * 60 * 1000

function offlineAlreadyShown(): boolean {
  try {
    return localStorage.getItem(OFFLINE_KEY) === '1'
  } catch {
    return true // stockage indisponible : on évite de répéter le message
  }
}

/** Bandeau de mise à jour de l'appli. Ne recharge jamais la page sans l'accord de l'utilisateur. */
export function UpdateBanner() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, reg) {
      // Vérifie de temps en temps qu'une nouvelle version n'est pas en ligne (appli laissée ouverte).
      if (reg) setInterval(() => void reg.update().catch(() => undefined), CHECK_EVERY_MS)
    },
  })

  const showOffline = offlineReady && !needRefresh && !offlineAlreadyShown()

  useEffect(() => {
    if (!showOffline) return
    try {
      localStorage.setItem(OFFLINE_KEY, '1')
    } catch {
      /* ignoré */
    }
    const t = setTimeout(() => setOfflineReady(false), 8000)
    return () => clearTimeout(t)
  }, [showOffline, setOfflineReady])

  if (needRefresh) {
    return (
      <div className="alert info banner" role="status">
        <span>
          <strong>Mise à jour disponible.</strong> L’appli se recharge en quelques secondes.
        </span>
        <span className="row">
          <button className="btn small primary" onClick={() => void updateServiceWorker(true)}>
            Mettre à jour
          </button>
          <button className="btn small" onClick={() => setNeedRefresh(false)}>
            Plus tard
          </button>
        </span>
      </div>
    )
  }
  if (showOffline) {
    return (
      <div className="alert info banner" role="status">
        <span>L’appli marche maintenant sans internet.</span>
        <button className="btn small" onClick={() => setOfflineReady(false)}>
          OK
        </button>
      </div>
    )
  }
  return null
}

import { useEffect, useRef, useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { useBanner } from '../lib/banners'

const OFFLINE_KEY = 'permajardin:offline-ready-shown'
const CHECK_EVERY_MS = 60 * 60 * 1000
/** Au retour dans l'appli, on cherche une mise à jour si la dernière recherche date de plus de 10 minutes. */
const CHECK_ON_RETURN_MS = 10 * 60 * 1000
/** « Plus tard » : le bandeau revient après ce délai (il ne disparaît pas pour toujours). */
const SNOOZE_MS = 6 * 60 * 60 * 1000

function offlineAlreadyShown(): boolean {
  try {
    return localStorage.getItem(OFFLINE_KEY) === '1'
  } catch {
    return true // stockage indisponible : on évite de répéter le message
  }
}

/** Bandeau de mise à jour de l'appli (file d'attente des bandeaux). Ne recharge jamais la page sans l'accord de l'utilisateur. */
export function UpdateBanner() {
  const {
    needRefresh: [needRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, reg) {
      // Vérifie de temps en temps qu'une nouvelle version n'est pas en ligne (appli laissée ouverte).
      if (!reg) return
      registration.current = reg
      if (!timer.current) timer.current = setInterval(() => void check(), CHECK_EVERY_MS)
    },
  })
  const registration = useRef<ServiceWorkerRegistration>()
  const timer = useRef<ReturnType<typeof setInterval>>()
  const lastCheck = useRef(Date.now())
  const [snoozed, setSnoozed] = useState(false)
  // Un écran lourd (la 3D) dont le fichier a changé depuis le déploiement ne se charge plus : on propose de recharger.
  const [staleChunk, setStaleChunk] = useState(false)

  async function check() {
    lastCheck.current = Date.now()
    try {
      await registration.current?.update()
    } catch {
      /* hors ligne : on réessaiera */
    }
  }

  useEffect(() => () => clearInterval(timer.current), [])

  // Retour dans l'appli (téléphone déverrouillé, onglet rouvert) : on cherche une nouvelle version sans attendre l'heure suivante.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastCheck.current > CHECK_ON_RETURN_MS) void check()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])

  useEffect(() => {
    const onPreloadError = (e: Event) => {
      e.preventDefault() // sans cela, l'écran reste blanc sans explication
      setStaleChunk(true)
    }
    window.addEventListener('vite:preloadError', onPreloadError)
    return () => window.removeEventListener('vite:preloadError', onPreloadError)
  }, [])

  useEffect(() => {
    if (!snoozed) return
    const t = setTimeout(() => setSnoozed(false), SNOOZE_MS)
    return () => clearTimeout(t)
  }, [snoozed])

  const showOffline = offlineReady && !needRefresh && !offlineAlreadyShown()
  // Un seul bandeau à la fois : celui-ci attend son tour derrière un problème de stockage, et se tait pendant un placement.
  const waiting = needRefresh && !snoozed
  const myTurn = useBanner('miseajour', waiting || staleChunk || showOffline)

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

  if (!myTurn) return null
  if (staleChunk) {
    return (
      <div className="alert info banner" role="alert">
        <span>
          <strong>Une nouvelle version est en ligne.</strong> Rechargez pour ouvrir cet écran.
        </span>
        <button className="btn small primary" onClick={() => (needRefresh ? void updateServiceWorker(true) : window.location.reload())}>
          Recharger
        </button>
      </div>
    )
  }
  if (waiting) {
    return (
      <div className="alert info banner" role="status">
        <span>
          <strong>Mise à jour disponible.</strong> L’appli se recharge en quelques secondes.
        </span>
        <span className="row">
          <button className="btn small primary" onClick={() => void updateServiceWorker(true)}>
            Mettre à jour
          </button>
          <button className="btn small" onClick={() => setSnoozed(true)}>
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

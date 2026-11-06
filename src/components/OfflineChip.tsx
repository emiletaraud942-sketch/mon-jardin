import { useEffect, useSyncExternalStore } from 'react'
import { Icon } from './Icon'

const subscribe = (cb: () => void) => {
  window.addEventListener('online', cb)
  window.addEventListener('offline', cb)
  return () => {
    window.removeEventListener('online', cb)
    window.removeEventListener('offline', cb)
  }
}

/** Vrai tant que l'appareil se dit hors connexion (`navigator.onLine` et événements online/offline). */
export function useOffline(): boolean {
  return useSyncExternalStore(subscribe, () => navigator.onLine === false, () => false)
}

/** Puce discrète « Hors connexion » : rassure, car les données sont sur l'appareil. Rien quand on est en ligne. */
export function OfflineChip() {
  const offline = useOffline()
  // La page garde un peu de place en bas : la puce ne cache pas la fin du contenu.
  useEffect(() => {
    document.documentElement.toggleAttribute('data-offline', offline)
    return () => document.documentElement.removeAttribute('data-offline')
  }, [offline])
  if (!offline) return null
  return (
    <p className="offline-chip" role="status">
      <Icon name="check" size={16} /> Hors connexion : vos données restent enregistrées
    </p>
  )
}

// Lien entre le service worker (alertes) et l'appli ouverte. Léger : aucun accès réseau, aucun client Supabase.
// - « nouveau message » : l'appli met à jour sa pastille.
// - « ouvrir les messages » : clic sur une alerte quand l'appli est déjà ouverte (sinon l'adresse #entraide/messages s'en charge).
import { setUi } from '../ui'
import { NEWS_EVENT } from './news'

export const OPEN_MESSAGES_EVENT = 'permajardin:open-messages'
/** Adresse ouverte par un clic sur l'alerte quand l'appli est fermée (voir public/push-sw.js). */
export const OPEN_MESSAGES_HASH = '#entraide/messages'

export type SwMessage = 'new-message' | 'open-messages'

/** Sens d'un message du service worker, ou null pour tout ce qui n'est pas à nous. */
export function routeSwMessage(data: unknown): SwMessage | null {
  const t = (data as { type?: unknown } | null | undefined)?.type
  if (t === 'permajardin:nouveau-message') return 'new-message'
  if (t === 'permajardin:ouvrir-messages') return 'open-messages'
  return null
}

export const wantsMessages = (hash: string): boolean => hash.startsWith(OPEN_MESSAGES_HASH)

/** Demande d'ouvrir les messages reçue avant que l'écran de l'entraide existe. */
let pendingOpen = false
let hashUsed = false

/** À l'ouverture de l'écran de l'entraide : faut-il aller directement aux messages ? Vrai une seule fois. */
export function consumeOpenMessages(hash: string = typeof location === 'undefined' ? '' : location.hash): boolean {
  const fromHash = !hashUsed && wantsMessages(hash)
  hashUsed = true
  const fromClick = pendingOpen
  pendingOpen = false
  return fromHash || fromClick
}

/** Réservé aux tests. */
export function resetBridge() {
  pendingOpen = false
  hashUsed = false
}

/** Écoute le service worker. Renvoie la fonction qui arrête l'écoute. */
export function startPushBridge(): () => void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return () => undefined
  const onMessage = (e: MessageEvent) => {
    const kind = routeSwMessage(e.data)
    if (kind === 'new-message') window.dispatchEvent(new Event(NEWS_EVENT))
    if (kind === 'open-messages') {
      pendingOpen = true
      setUi({ tab: 'voisins' })
      window.dispatchEvent(new Event(OPEN_MESSAGES_EVENT))
    }
  }
  navigator.serviceWorker.addEventListener('message', onMessage)
  return () => navigator.serviceWorker.removeEventListener('message', onMessage)
}

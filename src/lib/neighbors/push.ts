// Alertes de nouveaux messages : ce qui se passe SUR L'APPAREIL (détection, abonnement du navigateur, désabonnement).
// Rien ici ne parle à notre serveur : l'enregistrement de l'appareil est dans api.ts. Les fonctions pures sont testées.
import { neighborsVapidPublic } from './env'

/** Texte de l'alerte. Il est écrit dans public/push-sw.js (un test vérifie que les deux sont identiques). */
export const ALERT_TEXT = 'Vous avez un nouveau message'
/** Nombre d'appareils par personne (même plafond que la base). */
export const MAX_DEVICES = 5

// ---------- Détection du support ----------

export type PushUnsupported = 'not-configured' | 'ios-install' | 'service-worker' | 'push' | 'notification'
export type PushSupport = { ok: true } | { ok: false; reason: PushUnsupported }

export interface PushEnv {
  hasServiceWorker: boolean
  hasPushManager: boolean
  hasNotification: boolean
  /** iPhone ou iPad (y compris iPad qui se présente comme un Mac). */
  isIos: boolean
  /** Appli ouverte depuis l'écran d'accueil (et non dans un onglet). */
  standalone: boolean
  /** Clé publique VAPID valide, ou undefined. */
  vapidPublic: string | undefined
}

/** Peut-on proposer les alertes sur cet appareil ? Sinon, pourquoi pas. Pur. */
export function detectPushSupport(env: PushEnv): PushSupport {
  if (!env.vapidPublic) return { ok: false, reason: 'not-configured' }
  // Sur iPhone et iPad, les alertes n'existent que pour une appli ajoutée à l'écran d'accueil.
  if (env.isIos && !env.standalone) return { ok: false, reason: 'ios-install' }
  if (!env.hasServiceWorker) return { ok: false, reason: 'service-worker' }
  if (!env.hasPushManager) return { ok: false, reason: 'push' }
  if (!env.hasNotification) return { ok: false, reason: 'notification' }
  return { ok: true }
}

/** Phrases lues par l'utilisateur quand les alertes ne sont pas possibles. Le repli (nombre de messages à l'ouverture) marche toujours. */
export const SUPPORT_TEXT: Record<PushUnsupported, string> = {
  'not-configured': 'Les alertes ne sont pas encore ouvertes ici. Le nombre de nouveaux messages s’affiche quand vous ouvrez l’appli.',
  'ios-install': 'Sur iPhone et iPad, les alertes marchent seulement si l’appli est sur l’écran d’accueil. Touchez Partager, puis « Sur l’écran d’accueil ». Ouvrez ensuite l’appli depuis son icône.',
  'service-worker': 'Cet appareil ne sait pas recevoir d’alertes. Ce n’est pas grave : le nombre de nouveaux messages s’affiche quand vous ouvrez l’appli.',
  push: 'Cet appareil ne sait pas recevoir d’alertes. Ce n’est pas grave : le nombre de nouveaux messages s’affiche quand vous ouvrez l’appli.',
  notification: 'Cet appareil ne sait pas recevoir d’alertes. Ce n’est pas grave : le nombre de nouveaux messages s’affiche quand vous ouvrez l’appli.',
}

/** iPhone, iPod ou iPad. Depuis iPadOS 13, un iPad se présente comme un Mac : on le reconnaît à son écran tactile. */
export function isIosDevice(userAgent: string, platform: string, maxTouchPoints: number): boolean {
  return /iPhone|iPad|iPod/.test(userAgent) || (platform === 'MacIntel' && maxTouchPoints > 1)
}

export function pushEnvFromWindow(): PushEnv {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return { hasServiceWorker: false, hasPushManager: false, hasNotification: false, isIos: false, standalone: false, vapidPublic: neighborsVapidPublic }
  }
  let standalone = false
  try {
    standalone = (navigator as Navigator & { standalone?: boolean }).standalone === true || window.matchMedia?.('(display-mode: standalone)').matches === true
  } catch {
    /* lecture impossible : on considère que l'appli est dans un onglet */
  }
  return {
    hasServiceWorker: 'serviceWorker' in navigator,
    hasPushManager: 'PushManager' in window,
    hasNotification: 'Notification' in window,
    isIos: isIosDevice(navigator.userAgent, navigator.platform, navigator.maxTouchPoints ?? 0),
    standalone,
    vapidPublic: neighborsVapidPublic,
  }
}

// ---------- Autorisation du programme internet ----------

export type PermissionState = 'granted' | 'denied' | 'default' | 'unsupported'

export function readPermission(): PermissionState {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported'
  const p = Notification.permission
  return p === 'granted' || p === 'denied' ? p : 'default'
}

/** Ce que l'utilisateur lit sur l'état de l'autorisation de son programme internet. */
export const PERMISSION_TEXT: Record<PermissionState, string> = {
  granted: 'Votre programme internet autorise les alertes de ce site.',
  default: 'Votre programme internet n’a pas encore été interrogé. Il vous demandera son accord quand vous activerez les alertes.',
  denied: 'Votre programme internet bloque les alertes de ce site. Pour les autoriser, ouvrez ses réglages, cherchez ce site, puis « Notifications ».',
  unsupported: 'Cet appareil ne propose pas les alertes.',
}

export async function requestPermission(): Promise<PermissionState> {
  if (!('Notification' in window)) return 'unsupported'
  try {
    const r = await Notification.requestPermission()
    return r === 'granted' || r === 'denied' ? r : 'default'
  } catch {
    return readPermission()
  }
}

// ---------- Clés et abonnement ----------

export function urlBase64ToBytes(text: string): Uint8Array {
  const pad = '='.repeat((4 - (text.length % 4)) % 4)
  const bin = atob(text.replace(/-/g, '+').replace(/_/g, '/') + pad)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

export function sameBytes(a: ArrayBuffer | Uint8Array | null | undefined, b: Uint8Array): boolean {
  if (!a) return false
  const x = a instanceof Uint8Array ? a : new Uint8Array(a)
  if (x.length !== b.length) return false
  for (let i = 0; i < x.length; i++) if (x[i] !== b[i]) return false
  return true
}

export interface DeviceRow {
  endpoint: string
  p256dh: string
  auth: string
}

/** Services d'alerte connus (même liste que la contrainte SQL et que la fonction notify-message). */
const PUSH_ENDPOINT = /^https:\/\/(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)\/[!-~]+$/
export const isKnownPushEndpoint = (e: unknown): e is string => typeof e === 'string' && e.length >= 20 && e.length <= 700 && PUSH_ENDPOINT.test(e)

/** Ligne à enregistrer pour un abonnement, ou null s'il est inutilisable (adresse inconnue, clés absentes). */
export function toDeviceRow(sub: { toJSON(): unknown } | null): DeviceRow | null {
  if (!sub) return null
  const j = sub.toJSON() as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } }
  const p256dh = j.keys?.p256dh
  const auth = j.keys?.auth
  if (!isKnownPushEndpoint(j.endpoint) || typeof p256dh !== 'string' || typeof auth !== 'string') return null
  if (!/^[A-Za-z0-9_-]{80,100}$/.test(p256dh) || !/^[A-Za-z0-9_-]{16,32}$/.test(auth)) return null
  return { endpoint: j.endpoint, p256dh, auth }
}

const READY_TIMEOUT_MS = 8000

/** Service worker prêt, ou null s'il n'y en a pas (mode développement) ou s'il tarde trop. */
async function readyRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null
  const first = await navigator.serviceWorker.getRegistration().catch(() => undefined)
  if (!first) return null
  return Promise.race([navigator.serviceWorker.ready, new Promise<null>((r) => setTimeout(() => r(null), READY_TIMEOUT_MS))])
}

/** Abonnement actuel de ce navigateur, ou null. Ne demande rien et ne crée rien. */
export async function currentSubscription(): Promise<PushSubscription | null> {
  try {
    if (!('serviceWorker' in navigator)) return null
    const reg = await navigator.serviceWorker.getRegistration()
    return (await reg?.pushManager?.getSubscription()) ?? null
  } catch {
    return null
  }
}

/**
 * Abonne ce navigateur (ou reprend l'abonnement existant). `fresh` : jette l'ancien pour en créer un nouveau,
 * utile quand l'adresse est déjà prise par un autre compte sur le même appareil.
 * Lève une Error en français simple si le service worker n'est pas prêt.
 */
export async function subscribeDevice(vapidPublic: string, opts: { fresh?: boolean } = {}): Promise<PushSubscription> {
  const reg = await readyRegistration()
  if (!reg) throw new Error('L’appli n’est pas encore prête pour les alertes. Rechargez la page, puis réessayez.')
  const key = urlBase64ToBytes(vapidPublic)
  let sub = await reg.pushManager.getSubscription()
  if (sub && (opts.fresh || !sameBytes(sub.options?.applicationServerKey, key))) {
    await sub.unsubscribe().catch(() => false)
    sub = null
  }
  // Le Uint8Array est accepté par tous les navigateurs ; certains refusent la chaîne base64url.
  return sub ?? reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key as BufferSource })
}

/** Désabonne ce navigateur. Renvoie l'adresse retirée, ou null s'il n'y avait rien. Ne lève jamais d'erreur. */
export async function unsubscribeDevice(): Promise<string | null> {
  const sub = await currentSubscription()
  if (!sub) return null
  const endpoint = sub.endpoint
  await sub.unsubscribe().catch(() => false)
  return endpoint
}

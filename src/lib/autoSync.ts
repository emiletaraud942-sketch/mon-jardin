import { useSyncExternalStore } from 'react'
import { hasConsent } from './consent'
import { getState, subscribeStore, type AppState } from './store'

// Synchronisation automatique de la copie en ligne (si Supabase est configuré, qu'un compte est connecté et que l'accord est donné).
// Règle d'or : JAMAIS d'écrasement silencieux. Si les deux côtés ont changé, on s'arrête et on demande (état « conflit »).
//  - au démarrage et au retour dans l'appli : on compare la date de la copie en ligne à notre dernière synchro ;
//  - après chaque modification locale : envoi quelques secondes plus tard (une seule fois pour une rafale de modifications).
// Les photos ne partent jamais (voir sync.ts). Les actions manuelles de Réglages restent disponibles.

export type AutoSyncStatus = 'inactif' | 'en-cours' | 'ok' | 'conflit' | 'hors-ligne' | 'erreur'

export interface AutoSyncState {
  status: AutoSyncStatus
  /** Heure (ms) de la dernière synchro réussie, depuis le lancement de l'appli. */
  lastAt?: number
  error?: string
}

export interface AutoSyncDeps {
  getState(): Pick<AppState, 'gardens' | 'plants' | 'tasksDone' | 'loaded'>
  subscribe(l: () => void): () => void
  remote(): Promise<{ signedIn: boolean; remote: string | null; last: string | null }>
  push(): Promise<void>
  pull(): Promise<boolean>
  hasConsent(): boolean
  isConflict(e: unknown): boolean
  online(): boolean
  now(): number
  /** Mémoire du « modifié depuis la dernière synchro » (survit à la fermeture de l'appli). */
  readDirty(): boolean
  writeDirty(v: boolean): void
  delayMs: number
}

let current: AutoSyncState = { status: 'inactif' }
const listeners = new Set<() => void>()
const setCurrent = (patch: Partial<AutoSyncState>) => {
  current = { ...current, ...patch }
  if (patch.error === undefined && patch.status && patch.status !== 'erreur') delete current.error
  listeners.forEach((l) => l())
}
export const getAutoSyncState = () => current
export function useAutoSyncState(): AutoSyncState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => void listeners.delete(l)
    },
    getAutoSyncState,
  )
}
/** Pour les tests. */
export function resetAutoSync() {
  current = { status: 'inactif' }
}

/** Phrase d'état pour Réglages (courte, en français simple). */
export function autoSyncMessage(st: AutoSyncState): string {
  const at = st.lastAt ? ` (${new Date(st.lastAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })})` : ''
  switch (st.status) {
    case 'ok':
      return `✓ Copie en ligne à jour${at}.`
    case 'en-cours':
      return 'Synchronisation en cours…'
    case 'hors-ligne':
      return 'Hors ligne. La copie en ligne sera mise à jour dès le retour du réseau.'
    case 'erreur':
      return `La synchronisation automatique a échoué : ${st.error ?? 'réessayez plus tard.'}`
    case 'conflit':
      return 'Deux versions différentes existent. Choisissez celle à garder : rien n’est écrasé sans votre accord.'
    default:
      return 'La synchronisation automatique démarre dès que vous acceptez la copie en ligne.'
  }
}

const hasData = (s: Pick<AppState, 'gardens' | 'plants'>) => s.gardens.length > 0 || s.plants.length > 0

/** Démarre la synchronisation automatique. Renvoie une fonction d'arrêt et `reconcile` (à rappeler au retour dans l'appli). */
export function createAutoSync(deps: AutoSyncDeps) {
  let timer: ReturnType<typeof setTimeout> | undefined
  let applyingRemote = false
  let busy = false
  let seen = { g: deps.getState().gardens, p: deps.getState().plants, t: deps.getState().tasksDone }

  const fail = (e: unknown) => {
    if (deps.isConflict(e)) return setCurrent({ status: 'conflit' })
    if (!deps.online()) return setCurrent({ status: 'hors-ligne' })
    setCurrent({ status: 'erreur', error: e instanceof Error ? e.message : 'La synchronisation a échoué.' })
  }

  async function pushNow() {
    if (busy) return
    busy = true
    setCurrent({ status: 'en-cours' })
    try {
      await deps.push()
      deps.writeDirty(false)
      setCurrent({ status: 'ok', lastAt: deps.now() })
    } catch (e) {
      fail(e)
    } finally {
      busy = false
    }
  }

  async function pullNow() {
    applyingRemote = true
    try {
      await deps.pull()
      const s = deps.getState()
      seen = { g: s.gardens, p: s.plants, t: s.tasksDone }
      deps.writeDirty(false)
      setCurrent({ status: 'ok', lastAt: deps.now() })
    } finally {
      applyingRemote = false
    }
  }

  async function reconcile() {
    if (busy || !deps.getState().loaded) return
    if (!deps.hasConsent()) return setCurrent({ status: 'inactif' })
    busy = true
    setCurrent({ status: 'en-cours' })
    try {
      const r = await deps.remote()
      if (!r.signedIn) return setCurrent({ status: 'inactif' })
      const dirty = deps.readDirty()
      const s = deps.getState()
      const remoteNewer = r.remote !== null && (r.last === null || Date.parse(r.remote) > Date.parse(r.last))
      if (r.remote === null) {
        busy = false
        if (hasData(s)) await pushNow()
        else setCurrent({ status: 'ok', lastAt: deps.now() })
        return
      }
      if (remoteNewer) {
        // Une copie en ligne que cet appareil n'a jamais vue ou qui a changé ailleurs.
        if (!dirty && (r.last !== null || !hasData(s))) {
          await pullNow()
          return
        }
        return setCurrent({ status: 'conflit' })
      }
      if (dirty) {
        busy = false
        await pushNow()
        return
      }
      setCurrent({ status: 'ok', lastAt: deps.now() })
    } catch (e) {
      fail(e)
    } finally {
      busy = false
    }
  }

  const unsubscribe = deps.subscribe(() => {
    const s = deps.getState()
    if (!s.loaded) return
    if (s.gardens === seen.g && s.plants === seen.p && s.tasksDone === seen.t) return
    seen = { g: s.gardens, p: s.plants, t: s.tasksDone }
    if (applyingRemote) return
    deps.writeDirty(true)
    if (!deps.hasConsent() || current.status === 'conflit' || current.status === 'inactif') return
    clearTimeout(timer)
    timer = setTimeout(() => void pushNow(), deps.delayMs)
  })

  return {
    reconcile,
    /** L'utilisateur a choisi de garder cet appareil ou la copie en ligne : on repart sur de bonnes bases. */
    resolved() {
      setCurrent({ status: 'ok', lastAt: deps.now() })
      deps.writeDirty(false)
    },
    stop() {
      clearTimeout(timer)
      unsubscribe()
    },
  }
}

// ---------- Branchement réel (chargé à la demande, seulement si Supabase est configuré) ----------

const DIRTY_KEY = 'permajardin:sync-dirty'

export async function startAutoSync(): Promise<() => void> {
  const sync = await import('./sync')
  const readDirty = () => {
    try {
      return localStorage.getItem(DIRTY_KEY) === '1'
    } catch {
      return false
    }
  }
  const writeDirty = (v: boolean) => {
    try {
      if (v) localStorage.setItem(DIRTY_KEY, '1')
      else localStorage.removeItem(DIRTY_KEY)
    } catch {
      /* ignoré */
    }
  }
  const auto = createAutoSync({
    getState,
    subscribe: subscribeStore,
    remote: sync.syncStatus,
    push: () => sync.pushSnapshot(),
    pull: () => sync.pullSnapshot(),
    hasConsent: () => hasConsent('sync'),
    isConflict: (e) => e instanceof sync.SyncConflictError,
    online: () => (typeof navigator === 'undefined' ? true : navigator.onLine !== false),
    now: () => Date.now(),
    readDirty,
    writeDirty,
    delayMs: 5000,
  })
  // Attend que les données locales soient chargées avant la première comparaison.
  const waitLoaded = () =>
    new Promise<void>((resolve) => {
      if (getState().loaded) return resolve()
      const off = subscribeStore(() => {
        if (getState().loaded) {
          off()
          resolve()
        }
      })
    })
  await waitLoaded()
  void auto.reconcile()
  let lastReconcile = Date.now()
  const onVisible = () => {
    if (document.visibilityState === 'visible' && Date.now() - lastReconcile > 60_000) {
      lastReconcile = Date.now()
      void auto.reconcile()
    }
  }
  const onOnline = () => void auto.reconcile()
  document.addEventListener('visibilitychange', onVisible)
  window.addEventListener('online', onOnline)
  autoHandle = auto
  return () => {
    auto.stop()
    document.removeEventListener('visibilitychange', onVisible)
    window.removeEventListener('online', onOnline)
    autoHandle = undefined
  }
}

let autoHandle: ReturnType<typeof createAutoSync> | undefined
/** À appeler quand l'utilisateur a réglé un conflit à la main (Réglages). */
export function autoSyncResolved() {
  autoHandle?.resolved()
}
/** Relance une comparaison (après connexion, par exemple). */
export function autoSyncReconcile() {
  void autoHandle?.reconcile()
}

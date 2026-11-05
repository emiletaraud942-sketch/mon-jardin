// « Effacer toutes mes données » (droit à l'effacement, RGPD art. 17) : tout ce que l'appli garde sur l'appareil,
// et, sur demande, l'instantané ou le compte en ligne. Chaque étape est indépendante : un échec n'empêche pas les autres.
import { wipeLocalData } from '../store'
import { neighborsEnabled } from '../neighbors/enabled'
import { ERASABLE_CACHE, ERASABLE_LOCAL_KEY } from './inventory'

export interface EraseOptions {
  /** 'snapshot' : supprime l'instantané en ligne ; 'account' : supprime aussi le compte (adresse e-mail). Par défaut : rien en ligne. */
  remote?: 'none' | 'snapshot' | 'account'
}

export interface EraseStep {
  id: 'remote' | 'indexeddb' | 'localstorage' | 'caches' | 'signout'
  ok: boolean
  /** Message en français si l'étape a échoué. */
  error?: string
}

export interface EraseReport {
  /** Vrai si toutes les étapes ont réussi. */
  ok: boolean
  steps: EraseStep[]
  /** Ce que le navigateur ne laisse pas faire par programme (à dire à l'utilisateur). */
  manual: string[]
}

/** Sans Supabase configuré, le module de synchro (et supabase-js) n'est pas même chargé. */
const syncConfigured = () => !!import.meta.env.VITE_SUPABASE_URL && !!import.meta.env.VITE_SUPABASE_ANON_KEY

const message = (e: unknown) => (e instanceof Error && e.message ? e.message : 'Échec.')

function storageKeys(storage: Storage): string[] {
  const out: string[] = []
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i)
    if (k !== null) out.push(k)
  }
  return out
}

/** Supprime les clés localStorage (ou sessionStorage) de l'appli : permajardin:*, réglages pj.*, caches météo pj-*, jetons Supabase sb-*. Renvoie les clés retirées. */
export function clearLocalKeys(storage: Storage): string[] {
  const removed: string[] = []
  for (const k of storageKeys(storage)) {
    if (ERASABLE_LOCAL_KEY.test(k)) {
      storage.removeItem(k)
      removed.push(k)
    }
  }
  return removed
}

/** Supprime les caches de tuiles du service worker (ign-*). Renvoie les noms supprimés. */
export async function clearPlaceCaches(cacheStorage: Pick<CacheStorage, 'keys' | 'delete'>): Promise<string[]> {
  const removed: string[] = []
  for (const name of await cacheStorage.keys()) {
    if (ERASABLE_CACHE.test(name) && (await cacheStorage.delete(name))) removed.push(name)
  }
  return removed
}

export async function eraseAllData(opts: EraseOptions = {}): Promise<EraseReport> {
  const steps: EraseStep[] = []
  const run = async (id: EraseStep['id'], fn: () => Promise<void> | void): Promise<boolean> => {
    try {
      await fn()
      steps.push({ id, ok: true })
      return true
    } catch (e) {
      steps.push({ id, ok: false, error: message(e) })
      return false
    }
  }

  // 1. En ligne d'abord (il faut encore être connecté). Si cela échoue, on garde la session pour pouvoir réessayer.
  let remoteOk = true
  if ((opts.remote === 'snapshot' || opts.remote === 'account') && syncConfigured()) {
    remoteOk = await run('remote', async () => {
      const sync = await import('../sync')
      if (opts.remote === 'account') await sync.deleteMyAccount()
      else await sync.deleteRemoteSnapshot()
    })
  }

  // 1 bis. Entraide entre voisins : déconnexion (jeton révoqué tant que la session existe). Sans configuration, rien n'est chargé.
  if (neighborsEnabled) {
    await run('signout', async () => {
      const api = await import('../neighbors/api')
      await api.signOut()
    })
  }

  // 2. Appareil : IndexedDB (état, copie avant migration, photos), localStorage, caches de tuiles.
  await run('indexeddb', () => wipeLocalData())
  await run('localstorage', () => {
    clearLocalKeys(localStorage)
    try {
      if (typeof sessionStorage !== 'undefined') clearLocalKeys(sessionStorage)
    } catch {
      /* sessionStorage bloqué : il disparaît de toute façon à la fermeture de l'onglet */
    }
  })
  await run('caches', async () => {
    if (typeof caches !== 'undefined') await clearPlaceCaches(caches)
  })

  // 3. Déconnexion locale (sans réseau) si la suppression en ligne n'a pas échoué.
  if (remoteOk && syncConfigured()) {
    await run('signout', async () => {
      const sync = await import('../sync')
      await sync.signOutLocal()
    })
  }

  return {
    ok: steps.every((s) => s.ok),
    steps,
    manual: ['Le navigateur ne permet pas de retirer seul l’autorisation de notifications : désactivez-la dans les réglages du site si vous le souhaitez.'],
  }
}

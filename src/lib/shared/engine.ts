import { migrateState } from '../migrate'
import { getState, subscribeStore, updateGarden, applySharedPlants, addGarden } from '../store'
import { currentUser } from '../sync'
import { showToast } from '../toast'
import type { Garden, Plant } from '../../types'
import { fetchGarden, fetchMyRole, pullPlants, pushGarden, pushPlants, SharedError } from './api'
import { applyPush, emptySyncState, gardenHash, planPull, planPush, remoteGardenData, type SharedSyncState } from './model'

// Jardins partagés : la synchro à plusieurs. Reprendre d'abord, envoyer ensuite ; une plante modifiée en même temps par quelqu'un d'autre
// garde SA version (la personne est prévenue). Les photos ne voyagent pas. Rien ici ne s'exécute sans jardin partagé ni sans compte connecté.

const KEY = 'pj.sharedSync'
const PUSH_DELAY_MS = 2000
const POLL_MS = 30_000

// ---------- État de synchro par jardin (cet appareil seulement) ----------

type Book = Record<string, SharedSyncState>

function readBook(): Book {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw || raw.length > 4_000_000) return {}
    const v = JSON.parse(raw) as unknown
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Book) : {}
  } catch {
    return {}
  }
}

function writeBook(b: Book) {
  try {
    if (Object.keys(b).length === 0) localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, JSON.stringify(b))
  } catch {
    /* stockage plein ou absent : on reprendra tout à la prochaine fois */
  }
}

export function readSyncState(gid: string): SharedSyncState {
  const s = readBook()[gid]
  return s && typeof s === 'object' && s.known && typeof s.known === 'object' ? s : emptySyncState()
}

export function writeSyncState(gid: string, st: SharedSyncState) {
  writeBook({ ...readBook(), [gid]: st })
}

export function forgetSyncState(gid: string) {
  const b = readBook()
  delete b[gid]
  writeBook(b)
}

// ---------- Validation de ce qui vient des autres membres ----------

/** Une plante reçue est revalidée comme toute donnée qui entre dans l'appli (jamais crue sur parole). Les photos locales sont gardées. */
export function makePlant(gardenId: string) {
  const stub: Garden = { id: gardenId, name: 'x', address: '', center: { lon: 0, lat: 0 }, createdAt: new Date().toISOString() }
  return (id: string, data: Record<string, unknown>, existing?: Plant): Plant | undefined => {
    const r = migrateState({ version: 2, gardens: [stub], plants: [{ ...data, id, gardenId, photos: existing?.photos ?? [], ...(existing?.photoMeta ? { photoMeta: existing.photoMeta } : {}), ...(existing?.purchase ? { purchase: existing.purchase } : {}) }], tasksDone: [] })
    return r.ok ? r.data.plants[0] : undefined
  }
}

/** La fiche du jardin reçue : revalidée, avec l'identifiant et les réglages de CET appareil conservés. */
export function makeGarden(local: Garden, remote: Record<string, unknown>): Garden | undefined {
  const r = migrateState({ version: 2, gardens: [{ ...remote, id: local.id, createdAt: local.createdAt }], plants: [], tasksDone: [] })
  if (!r.ok || !r.data.gardens[0]) return undefined
  const g = r.data.gardens[0]
  return { ...g, id: local.id, shared: local.shared, ...(local.panoramas ? { panoramas: local.panoramas } : {}), ...(local.calibration ? { calibration: local.calibration } : {}) }
}

// ---------- Synchro d'un jardin ----------

export type SharedReport = { kind: 'ok'; conflicts: string[]; pushed: number } | { kind: 'left' } | { kind: 'error'; message: string }

const busy = new Set<string>()

export const sharedGardens = (): Garden[] => getState().gardens.filter((g) => !!g.shared)

/** Reprend puis envoie, pour un jardin partagé. Ne lève jamais : le résultat dit ce qui s'est passé. */
export async function syncSharedGarden(local: Garden): Promise<SharedReport> {
  const link = local.shared
  if (!link) return { kind: 'ok', conflicts: [], pushed: 0 }
  if (busy.has(link.id)) return { kind: 'ok', conflicts: [], pushed: 0 }
  busy.add(link.id)
  try {
    let st = readSyncState(link.id)
    // 1. Suis-je encore membre ? (fiche du jardin)
    const remote = await fetchGarden(link.id)
    if (!remote) return { kind: 'left' }
    // 2. Reprendre les plantes.
    const rows = await pullPlants(link.id, st.since)
    const plants = getState().plants.filter((p) => p.gardenId === local.id)
    const out = planPull(plants, rows, st, makePlant(local.id), (p, d) => p?.customName || String(d.customName ?? '') || String(d.speciesId ?? 'plante'))
    st = out.state
    if (out.changed) applySharedPlants(local.id, out.plants)
    // 3. Reprendre la fiche du jardin si elle a changé en ligne.
    let current = getState().gardens.find((g) => g.id === local.id) ?? local
    if (remote.updated_at !== st.gardenBase) {
      const merged = makeGarden(current, remote.garden)
      if (merged) {
        updateGarden(local.id, merged)
        current = merged
      }
      st = { ...st, gardenBase: remote.updated_at, gardenHash: gardenHash(current) }
    }
    // 4. Envoyer ce qui a changé ici.
    const now = getState().plants.filter((p) => p.gardenId === local.id)
    const push = planPush(now, st)
    let pushed = 0
    if (push.length) {
      const res = await pushPlants(link.id, push)
      st = applyPush(st, push, res, now)
      pushed = res.ok.length
    }
    // 5. La fiche du jardin : seuls les responsables l'envoient.
    if (link.role === 'admin' && gardenHash(current) !== st.gardenHash) {
      const at = await pushGarden(link.id, current)
      if (at) st = { ...st, gardenBase: at, gardenHash: gardenHash(current) }
    }
    writeSyncState(link.id, st)
    return { kind: 'ok', conflicts: out.conflicts.map((c) => c.name), pushed }
  } catch (e) {
    return { kind: 'error', message: e instanceof SharedError ? e.message : 'Le jardin partagé n’a pas pu être joint. Réessayez dans un instant.' }
  } finally {
    busy.delete(link.id)
  }
}

/** Je ne suis plus membre : le jardin reste sur cet appareil, comme un jardin personnel. */
export function detachGarden(local: Garden) {
  updateGarden(local.id, { shared: undefined })
  if (local.shared) forgetSyncState(local.shared.id)
}

/** Premier envoi d'un jardin qu'on vient de partager : toutes ses plantes, et on retient les versions en ligne. */
export async function uploadAll(local: Garden): Promise<SharedReport> {
  return syncSharedGarden(local)
}

/** À l'entrée dans un jardin partagé : crée la copie locale (identifiant = celui du jardin en ligne), puis reprend les plantes. */
export async function importSharedGarden(gid: string): Promise<{ garden?: Garden; error?: string }> {
  const remote = await fetchGarden(gid)
  if (!remote) return { error: 'Ce jardin partagé est introuvable.' }
  const role = (await fetchMyRole(gid)) ?? 'member'
  const stub: Garden = { id: gid, name: remote.name, address: '', center: { lon: 0, lat: 0 }, createdAt: new Date().toISOString() }
  const made = makeGarden(stub, remote.garden)
  if (!made) return { error: 'La fiche de ce jardin est illisible.' }
  const garden: Garden = { ...made, id: gid, name: remote.name || made.name, shared: { id: gid, role } }
  if (!getState().gardens.some((g) => g.id === gid)) addGarden(garden)
  forgetSyncState(gid)
  const r = await syncSharedGarden(garden)
  return r.kind === 'error' ? { garden, error: r.message } : { garden }
}

// ---------- Synchro en continu ----------

function announce(local: Garden, r: SharedReport) {
  if (r.kind === 'left') {
    detachGarden(local)
    showToast({ message: `Vous n’êtes plus dans le jardin partagé « ${local.name} ». Il reste sur cet appareil.` })
    return
  }
  if (r.kind === 'ok' && r.conflicts.length) {
    const names = r.conflicts.slice(0, 3).join(', ')
    showToast({ message: `${names}${r.conflicts.length > 3 ? '…' : ''} : quelqu’un d’autre l’a modifié en même temps. Sa version a été gardée.`, durationMs: 10_000 })
  }
}

/** Branche la synchro des jardins partagés : une fois après chaque modification (2 s), toutes les 30 s à l'écran, au retour dans l'appli. */
export function startSharedSync(): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined
  let running = false
  const run = async () => {
    if (running || typeof navigator !== 'undefined' && navigator.onLine === false) return
    const list = sharedGardens()
    if (list.length === 0) return
    running = true
    try {
      if (!(await currentUser())) return
      for (const g of list) announce(g, await syncSharedGarden(g))
    } catch {
      /* hors ligne ou service lent : on réessaiera */
    } finally {
      running = false
    }
  }
  const later = () => {
    clearTimeout(timer)
    timer = setTimeout(() => void run(), PUSH_DELAY_MS)
  }
  let last = getState().plants
  const unsub = subscribeStore(() => {
    const s = getState()
    if (s.plants === last) return
    last = s.plants
    if (sharedGardens().length > 0) later()
  })
  const poll = setInterval(() => {
    if (document.visibilityState === 'visible') void run()
  }, POLL_MS)
  const onVisible = () => {
    if (document.visibilityState === 'visible') void run()
    else if (timer !== undefined) {
      clearTimeout(timer)
      timer = undefined
      void run()
    }
  }
  const onOnline = () => void run()
  document.addEventListener('visibilitychange', onVisible)
  window.addEventListener('online', onOnline)
  void run()
  return () => {
    clearTimeout(timer)
    clearInterval(poll)
    unsub()
    document.removeEventListener('visibilitychange', onVisible)
    window.removeEventListener('online', onOnline)
  }
}

export { remoteGardenData }

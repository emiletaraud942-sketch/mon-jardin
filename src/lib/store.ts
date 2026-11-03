import { del, get, keys, set } from 'idb-keyval'
import { useMemo, useSyncExternalStore } from 'react'
import type { Garden, Plant, TaskDone } from '../types'
import { compactTasksDone, migrateState, STATE_VERSION, type StateData } from './migrate'
import { deletePhoto, listPhotoIds } from './photos'

export interface AppState {
  gardens: Garden[]
  plants: Plant[]
  tasksDone: TaskDone[]
  activeGardenId?: string
  loaded: boolean
}

/** État du stockage local, pour que l'interface prévienne l'utilisateur. */
export interface StorageStatus {
  /** Stockage protégé contre l'effacement automatique par le navigateur (undefined = inconnu). */
  persistent: boolean | undefined
  /** Lecture impossible au chargement : rien n'est écrit tant que l'utilisateur n'a pas confirmé (`resumeSaving`) ou réimporté. */
  readFailed: boolean
  /** Cause de l'échec de lecture (renseignée seulement si `readFailed`). Voir `describeReadFailure()` pour les textes et les actions. */
  readFailure?: ReadFailureKind
  /** Dernière écriture échouée (stockage plein, navigation privée…). */
  writeError?: string
}

/**
 * Pourquoi la lecture a échoué :
 * - `newer-version` : les données viennent d'une version plus récente de l'appli (ne jamais les effacer : mettre l'appli à jour) ;
 * - `unreadable` : les données existent mais sont inutilisables (abîmées) ;
 * - `io` : IndexedDB ne répond pas (stockage bloqué, navigation privée, panne passagère).
 */
export type ReadFailureKind = 'newer-version' | 'unreadable' | 'io'

const KEY = 'permajardin:state:v1'
/** Copie de sécurité la plus récente (avant correction au chargement, avant remplacement par une synchro ou un import, données illisibles). */
const BACKUP_KEY = KEY + ':avant-migration'
/** La copie de sécurité d'avant : une nouvelle copie ne détruit jamais la précédente. */
const PREVIOUS_BACKUP_KEY = BACKUP_KEY + ':precedente'
/** File d'attente du scan des plantes (IndexedDB) : ses photos ne sont pas des orphelines. Voir features/scan/queueStore.ts. */
export const SCAN_QUEUE_KEY = 'permajardin:scan-queue'
const UNREADABLE_COPY_ERROR = 'Impossible de garder une copie de vos données illisibles : rien n’a été remplacé. Faites une sauvegarde, puis réessayez.'
const WRITE_ERROR = "Impossible d'enregistrer sur cet appareil (stockage plein ou bloqué). Exportez une sauvegarde depuis les réglages."

let state: AppState = { gardens: [], plants: [], tasksDone: [], loaded: false }
let status: StorageStatus = { persistent: undefined, readFailed: false }
let loadWarnings: string[] = []
const listeners = new Set<() => void>()

function emit() {
  listeners.forEach((l) => l())
}

function setStatus(patch: Partial<StorageStatus>) {
  const next = { ...status, ...patch }
  if (next.writeError === undefined) delete next.writeError
  if (next.readFailure === undefined) delete next.readFailure
  if (next.persistent === status.persistent && next.readFailed === status.readFailed && next.readFailure === status.readFailure && next.writeError === status.writeError) return
  status = next
  emit()
}

export function getStorageStatus(): StorageStatus {
  return status
}

/** Avertissements de la dernière migration/validation des données stockées (en français). */
export function getLoadWarnings(): string[] {
  return loadWarnings
}

// ---------- Écriture ----------

let saveTimer: ReturnType<typeof setTimeout> | undefined
let dirty = false

let wiping = false

function persist() {
  dirty = true
  if (status.readFailed) return // jamais d'écriture par-dessus des données qu'on n'a pas pu lire
  clearTimeout(saveTimer)
  saveTimer = setTimeout(flush, 200)
}

/** Écrit tout de suite l'état en attente (appelé aussi sur `pagehide` et quand la page passe en arrière-plan). */
export function flush() {
  clearTimeout(saveTimer)
  saveTimer = undefined
  if (!dirty || !state.loaded || status.readFailed || wiping) return
  dirty = false
  const data = { version: STATE_VERSION, gardens: state.gardens, plants: state.plants, tasksDone: state.tasksDone, activeGardenId: state.activeGardenId }
  set(KEY, data).then(
    () => {
      setStatus({ writeError: undefined })
      channel?.postMessage({ type: 'saved' })
    },
    (e) => {
      console.warn('Sauvegarde impossible', e)
      dirty = true // sera retenté à la prochaine modification ou au prochain flush
      setStatus({ writeError: WRITE_ERROR })
    },
  )
}

// ---------- Cycle de vie, onglets multiples ----------

let channel: BroadcastChannel | undefined
let lifecycleReady = false

function initLifecycle() {
  if (lifecycleReady) return
  lifecycleReady = true
  if (typeof window !== 'undefined') window.addEventListener('pagehide', flush)
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flush()
    })
  }
  if (typeof BroadcastChannel !== 'undefined') {
    try {
      channel = new BroadcastChannel('permajardin')
      ;(channel as unknown as { unref?: () => void }).unref?.()
      // Un autre onglet a écrit : on se met à jour (dernier écrivain gagne), sauf si on a des changements en attente.
      channel.onmessage = (e: MessageEvent) => {
        const type = (e.data as { type?: string } | null)?.type
        if (type === 'erased') {
          // Un autre onglet a effacé toutes les données : on vide aussi la mémoire de celui-ci, sinon sa prochaine
          // modification réécrirait l'ancien état dans IndexedDB.
          clearTimeout(saveTimer)
          saveTimer = undefined
          dirty = false
          loadWarnings = []
          state = { gardens: [], plants: [], tasksDone: [], activeGardenId: undefined, loaded: true }
          emit()
          return
        }
        if (type !== 'saved' || dirty || status.readFailed) return
        void reloadFromStorage()
      }
    } catch {
      channel = undefined
    }
  }
}

async function requestPersistence() {
  try {
    const storage = typeof navigator !== 'undefined' ? navigator.storage : undefined
    if (!storage?.persist) return
    const already = storage.persisted ? await storage.persisted() : false
    setStatus({ persistent: already || (await storage.persist()) })
  } catch {
    /* non pris en charge ou refusé : on laisse « inconnu » */
  }
}

const validActive = (gardens: Garden[], id?: string) => (id && gardens.some((g) => g.id === id) ? id : gardens[0]?.id)

type Read =
  | { kind: 'empty' }
  | { kind: 'failed'; cause: ReadFailureKind; raw?: unknown }
  | { kind: 'ok'; raw: Record<string, unknown>; data: StateData; warnings: string[] }

const isNewerVersion = (raw: unknown): boolean => {
  const v = typeof raw === 'object' && raw !== null ? (raw as { version?: unknown }).version : undefined
  return typeof v === 'number' && Number.isFinite(v) && v > STATE_VERSION
}

/** Données stockées mais inutilisables (gardées en mémoire pour en faire une copie AVANT toute écriture par-dessus). */
let unreadableRaw: unknown

async function readStored(): Promise<Read> {
  let raw: unknown
  try {
    raw = await get(KEY)
  } catch (e) {
    console.warn('Lecture impossible', e)
    return { kind: 'failed', cause: 'io' }
  }
  if (raw === undefined || raw === null) return { kind: 'empty' }
  const r = migrateState(raw)
  if (!r.ok) {
    console.warn('Données stockées inutilisables :', r.error)
    return { kind: 'failed', cause: isNewerVersion(raw) ? 'newer-version' : 'unreadable', raw }
  }
  return { kind: 'ok', raw: raw as Record<string, unknown>, data: r.data, warnings: r.warnings }
}

// ---------- Copies de sécurité ----------

const sameJson = (a: unknown, b: unknown) => {
  try {
    return JSON.stringify(a) === JSON.stringify(b)
  } catch {
    return false
  }
}

/**
 * Garde `value` dans la copie de sécurité. L'ancienne copie passe en « précédente » (jamais détruite), sauf si elle est identique.
 * Renvoie `false` si le stockage a refusé : l'appelant ne doit alors RIEN écraser.
 */
async function keepSafetyCopy(value: unknown): Promise<boolean> {
  try {
    const current = await get(BACKUP_KEY)
    if (current !== undefined && current !== null) {
      if (sameJson(current, value)) return true
      await set(PREVIOUS_BACKUP_KEY, current)
    }
    await set(BACKUP_KEY, value)
    return true
  } catch (e) {
    console.warn('Copie de sécurité impossible', e)
    return false
  }
}

/**
 * Avant d'écrire par-dessus des données qu'on n'a pas pu lire : en garde une copie.
 * `true` = on peut écrire (copie faite, ou preuve qu'il n'y a rien à protéger) ; `false` = ne rien écraser.
 */
async function copyUnreadableData(): Promise<boolean> {
  if (unreadableRaw !== undefined) return keepSafetyCopy(unreadableRaw)
  // Échec d'entrée-sortie : on retente la lecture pour avoir de quoi copier.
  try {
    const raw = await get(KEY)
    if (raw === undefined || raw === null) return true // rien n'est stocké : rien à perdre
    return keepSafetyCopy(raw)
  } catch {
    // Toujours illisible. Dernier recours : la clé de l'état est-elle absente de la liste des clés ?
    try {
      return !(await keys()).includes(KEY)
    } catch {
      return false
    }
  }
}

/** Dernière copie de sécurité (état avant correction, remplacement ou données illisibles), ou undefined. */
export async function readSafetyCopy(): Promise<unknown> {
  try {
    return (await get(BACKUP_KEY)) ?? undefined
  } catch {
    return undefined
  }
}

/**
 * Copie de sécurité de l'état local, à faire AVANT de le remplacer (récupération depuis la synchro).
 * `false` : la copie a échoué, ne pas remplacer. Si la lecture avait échoué, ce sont les données illisibles qui sont copiées.
 * Les photos de la copie sont protégées du nettoyage (voir `purgeOrphanPhotos`).
 */
export async function keepLocalSafetyCopy(): Promise<boolean> {
  if (status.readFailed) return copyUnreadableData()
  if (!state.loaded || (state.gardens.length === 0 && state.plants.length === 0)) return true // rien à protéger
  return keepSafetyCopy({ version: STATE_VERSION, gardens: state.gardens, plants: state.plants, tasksDone: state.tasksDone, activeGardenId: state.activeGardenId })
}

// ---------- Échec de lecture : textes et actions (pour l'interface) ----------

export interface ReadFailureInfo {
  kind: ReadFailureKind
  title: string
  /** Phrase(s) à afficher dans le bandeau. */
  message: string
  /** Action principale : « update » = « Mettre à jour l'appli » (recharger la version la plus récente), « retry » = « Réessayer ». */
  primary: 'update' | 'retry'
  primaryLabel: string
  /** Proposer « Repartir de zéro » ? Jamais pour des données d'une version plus récente. */
  canStartOver: boolean
  /** Texte de confirmation de « Repartir de zéro » (absent si `canStartOver` est faux). */
  startOverWarning?: string
}

export function describeReadFailure(kind: ReadFailureKind): ReadFailureInfo {
  if (kind === 'newer-version') {
    return {
      kind,
      title: 'Mettre à jour l’appli',
      message: 'Vos données ont été enregistrées par une version plus récente de PermaJardin. Mettez l’appli à jour pour les ouvrir. En attendant, rien n’est modifié ni enregistré.',
      primary: 'update',
      primaryLabel: 'Mettre à jour l’appli',
      canStartOver: false,
    }
  }
  const startOverWarning =
    'Vos données illisibles seront remplacées dès le prochain enregistrement. Une copie est d’abord gardée sur cet appareil (Réglages > Récupérer la copie de sécurité), mais l’appli ne sait pas la rouvrir seule. Si la copie ne peut pas être faite, rien n’est remplacé.'
  return {
    kind,
    title: 'Vos données ne peuvent pas être lues sur cet appareil.',
    message:
      kind === 'io'
        ? 'Le stockage de l’appareil ne répond pas pour l’instant. Rien n’est enregistré, pour ne rien écraser. Réessayez dans un instant.'
        : 'Vos données enregistrées sont abîmées. Rien n’est enregistré pour l’instant, pour ne rien écraser.',
    primary: 'retry',
    primaryLabel: 'Réessayer',
    canStartOver: true,
    startOverWarning,
  }
}

/** Raison d'un refus de `resumeSaving()`. */
export type ResumeRefusal = 'not-blocked' | 'newer-version' | 'no-copy'
export const RESUME_REFUSAL_TEXT: Record<ResumeRefusal, string> = {
  'not-blocked': '',
  'newer-version': 'Ces données viennent d’une version plus récente de PermaJardin : elles ne sont jamais effacées. Mettez l’appli à jour.',
  'no-copy': 'Impossible de garder une copie de vos données illisibles : rien n’a été remplacé. Réessayez, ou utilisez « Effacer toutes mes données » dans Réglages si vous acceptez de les perdre.',
}

async function reloadFromStorage() {
  const read = await readStored()
  if (read.kind !== 'ok' || dirty) return
  state = { ...state, ...read.data, activeGardenId: validActive(read.data.gardens, state.activeGardenId ?? (read.raw.activeGardenId as string | undefined)) }
  emit()
}

export async function loadState() {
  initLifecycle()
  void requestPersistence()
  const read = await readStored()
  if (read.kind === 'failed') {
    state = { ...state, loaded: true }
    dirty = false
    unreadableRaw = read.raw
    setStatus({ readFailed: true, readFailure: read.cause })
    emit()
    return
  }
  if (read.kind === 'ok') {
    const tasksDone = compactTasksDone(read.data.tasksDone)
    loadWarnings = read.warnings
    state = {
      ...state,
      ...read.data,
      tasksDone,
      activeGardenId: validActive(read.data.gardens, read.raw.activeGardenId as string | undefined),
      loaded: true,
    }
    dirty = false
    unreadableRaw = undefined
    setStatus({ readFailed: false })
    emit()
    if (read.warnings.length > 0) {
      // On garde l'original avant de réécrire une version corrigée.
      await keepSafetyCopy(read.raw)
    }
    if (read.warnings.length > 0 || read.raw.version !== STATE_VERSION || tasksDone !== read.data.tasksDone) persist()
  } else {
    state = { ...state, loaded: true }
    dirty = false
    unreadableRaw = undefined
    setStatus({ readFailed: false })
    emit()
  }
  void purgeOrphanPhotos()
}

/**
 * Efface TOUT ce que l'appli garde dans IndexedDB (état, copie « avant migration », photos) et vide la mémoire.
 * Les autres onglets sont prévenus. Lève une erreur si le stockage refuse la suppression.
 * Pour tout effacer (localStorage, caches, compte en ligne), utiliser `eraseAllData()` de `lib/security/erase.ts`.
 */
export async function wipeLocalData(): Promise<void> {
  wiping = true
  try {
    clearTimeout(saveTimer)
    saveTimer = undefined
    dirty = false
    loadWarnings = []
    unreadableRaw = undefined
    state = { gardens: [], plants: [], tasksDone: [], activeGardenId: undefined, loaded: true }
    setStatus({ readFailed: false, writeError: undefined })
    emit()
    for (const k of await keys()) await del(k)
    channel?.postMessage({ type: 'erased' })
  } finally {
    wiping = false
    if (dirty) persist() // l'utilisateur a recommencé à saisir pendant l'effacement
  }
}

/** Nouvelle tentative de lecture après un échec ; lève le blocage si elle réussit. */
export async function retryLoadState() {
  const read = await readStored()
  if (read.kind === 'failed') {
    unreadableRaw = read.raw
    setStatus({ readFailure: read.cause })
    return
  }
  dirty = false
  unreadableRaw = undefined
  clearTimeout(saveTimer)
  if (read.kind === 'ok') {
    loadWarnings = read.warnings
    state = { ...state, ...read.data, tasksDone: compactTasksDone(read.data.tasksDone), activeGardenId: validActive(read.data.gardens, read.raw.activeGardenId as string | undefined), loaded: true }
  } else {
    state = { ...state, gardens: [], plants: [], tasksDone: [], activeGardenId: undefined, loaded: true }
  }
  setStatus({ readFailed: false })
  emit()
  void purgeOrphanPhotos()
}

/**
 * L'utilisateur accepte de continuer malgré l'échec de lecture : l'état actuel remplacera ce qui est stocké.
 * Une copie des données illisibles est faite AVANT de lever le blocage ; si elle échoue, rien n'est écrasé.
 * Jamais pour des données d'une version plus récente (il faut mettre l'appli à jour).
 */
export async function resumeSaving(): Promise<{ ok: true } | { ok: false; reason: ResumeRefusal }> {
  if (!status.readFailed) return { ok: false, reason: 'not-blocked' }
  if (status.readFailure === 'newer-version') return { ok: false, reason: 'newer-version' }
  if (!(await copyUnreadableData())) return { ok: false, reason: 'no-copy' }
  if (!status.readFailed) return { ok: true } // un autre événement (réessai, effacement) a déjà levé le blocage
  setStatus({ readFailed: false })
  persist()
  return { ok: true }
}

/** Supprime les photos d'IndexedDB qu'aucune plante ne référence (restes de suppressions ou d'imports). */
export async function purgeOrphanPhotos(): Promise<number> {
  if (!state.loaded || status.readFailed) return 0
  try {
    const refs = new Set([...state.plants.flatMap((p) => p.photos), ...panoramaPhotoIds(state.gardens)])
    // Références déjà enregistrées (autre onglet qui vient d'écrire).
    const stored = (await get(KEY)) as { plants?: { photos?: unknown }[]; gardens?: Garden[] } | undefined
    for (const p of Array.isArray(stored?.plants) ? stored.plants : []) {
      if (Array.isArray(p?.photos)) for (const id of p.photos) if (typeof id === 'string') refs.add(id)
    }
    if (Array.isArray(stored?.gardens)) for (const id of panoramaPhotoIds(stored.gardens)) refs.add(id)
    // Photos des copies de sécurité (avant remplacement par une synchro, données corrigées) : à garder tant que la copie existe.
    for (const k of [BACKUP_KEY, PREVIOUS_BACKUP_KEY]) {
      const copy = (await get(k)) as { plants?: { photos?: unknown }[]; gardens?: Garden[] } | undefined
      for (const p of Array.isArray(copy?.plants) ? copy.plants : []) {
        if (Array.isArray(p?.photos)) for (const id of p.photos) if (typeof id === 'string') refs.add(id)
      }
      if (Array.isArray(copy?.gardens)) for (const id of panoramaPhotoIds(copy.gardens)) refs.add(id)
    }
    // Photos du scan des plantes encore en attente de revue : à garder.
    const queued = await get(SCAN_QUEUE_KEY)
    if (Array.isArray(queued)) for (const i of queued) if (typeof i?.photoId === 'string') refs.add(i.photoId)
    let n = 0
    for (const id of await listPhotoIds()) {
      if (refs.has(id)) continue
      await deletePhoto(id)
      n++
    }
    return n
  } catch (e) {
    console.warn('Nettoyage des photos impossible', e)
    return 0
  }
}

function dropPhotos(plants: Plant[], stillUsedBy: Plant[], gone: Garden[] = [], keptGardens: Garden[] = []) {
  const keep = new Set([...stillUsedBy.flatMap((p) => p.photos), ...panoramaPhotoIds(keptGardens)])
  for (const id of new Set([...plants.flatMap((p) => p.photos), ...panoramaPhotoIds(gone)])) {
    if (!keep.has(id)) deletePhoto(id).catch(() => undefined)
  }
}

/** Identifiants des photos des points de vue (façon Street View) de ces jardins. */
export function panoramaPhotoIds(gardens: Garden[]): string[] {
  return gardens.flatMap((g) => (Array.isArray(g?.panoramas) ? g.panoramas.flatMap((p) => (Array.isArray(p?.shots) ? p.shots.map((s) => s?.photoId).filter((id): id is string => typeof id === 'string') : [])) : []))
}

// ---------- Accès à l'état ----------

export function getState() {
  return state
}

export function setState(update: (s: AppState) => Partial<AppState>) {
  state = { ...state, ...update(state) }
  emit()
  persist()
}

function subscribe(l: () => void) {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

export function useStore<T>(selector: (s: AppState) => T): T {
  return useSyncExternalStore(subscribe, () => selector(state))
}

/** État du stockage (persistance, lecture/écriture en échec) pour avertir l'utilisateur. */
export function useStorageStatus(): StorageStatus {
  return useSyncExternalStore(subscribe, getStorageStatus)
}

// ---------- Actions ----------

export function useActiveGarden(): Garden | undefined {
  return useStore((s) => s.gardens.find((g) => g.id === s.activeGardenId))
}

export function useGardenPlants(gardenId?: string): Plant[] {
  const plants = useStore((s) => s.plants)
  return useMemo(() => (gardenId ? plants.filter((p) => p.gardenId === gardenId) : []), [plants, gardenId])
}

export function addGarden(g: Garden) {
  setState((s) => ({ gardens: [...s.gardens, g], activeGardenId: g.id }))
}

export function updateGarden(id: string, patch: Partial<Garden>) {
  setState((s) => ({ gardens: s.gardens.map((g) => (g.id === id ? { ...g, ...patch } : g)) }))
}

export function removeGarden(id: string) {
  const removed = state.plants.filter((p) => p.gardenId === id)
  const removedGardens = state.gardens.filter((g) => g.id === id)
  setState((s) => {
    const gardens = s.gardens.filter((g) => g.id !== id)
    return {
      gardens,
      plants: s.plants.filter((p) => p.gardenId !== id),
      tasksDone: s.tasksDone.filter((t) => t.gardenId !== id),
      activeGardenId: s.activeGardenId === id ? gardens[0]?.id : s.activeGardenId,
    }
  })
  dropPhotos(removed, state.plants, removedGardens, state.gardens)
}

export function setActiveGarden(id: string) {
  setState(() => ({ activeGardenId: id }))
}

export function addPlant(p: Plant) {
  setState((s) => ({ plants: [...s.plants, p] }))
}

export function updatePlant(id: string, patch: Partial<Plant>) {
  setState((s) => ({ plants: s.plants.map((p) => (p.id === id ? { ...p, ...patch } : p)) }))
}

/** Retire une plante et ses photos. `keepPhotos` : garde les photos (pour pouvoir annuler ; les orphelines sont purgées au prochain démarrage). */
export function removePlant(id: string, opts: { keepPhotos?: boolean } = {}) {
  const removed = state.plants.filter((p) => p.id === id)
  setState((s) => ({ plants: s.plants.filter((p) => p.id !== id) }))
  if (!opts.keepPhotos) dropPhotos(removed, state.plants)
}

export function markTaskDone(t: TaskDone) {
  setState((s) => ({ tasksDone: [...s.tasksDone, t] }))
}

export function unmarkTask(gardenId: string, taskKey: string) {
  setState((s) => ({ tasksDone: s.tasksDone.filter((t) => !(t.gardenId === gardenId && t.taskKey === taskKey)) }))
}

/**
 * Remplace tout l'état (import d'une sauvegarde ou synchro ; données déjà passées par `migrateState`).
 * Action explicite : lève aussi le blocage d'écriture après un échec de lecture, mais seulement APRÈS une copie des
 * données illisibles (si la copie échoue, le blocage reste et `writeError` le dit : rien n'est écrasé).
 * `keepPhotos` : ne supprime pas les photos des plantes remplacées (elles sont dans la copie de sécurité faite avant).
 */
export function replaceData(data: Pick<AppState, 'gardens' | 'plants' | 'tasksDone'>, opts: { keepPhotos?: boolean } = {}) {
  const previous = state.plants
  const previousGardens = state.gardens
  // Les points de vue en photos ne voyagent ni dans les sauvegardes ni dans la synchro : on garde ceux de cet appareil.
  const gardens = data.gardens.map((g) => {
    const mine = previousGardens.find((x) => x.id === g.id)?.panoramas
    return mine && !g.panoramas ? { ...g, panoramas: mine } : g
  })
  data = { ...data, gardens }
  const wasBlocked = status.readFailed
  state = { ...state, ...data, tasksDone: compactTasksDone(data.tasksDone), activeGardenId: data.gardens[0]?.id }
  if (!wasBlocked) setStatus({ readFailed: false })
  emit()
  if (wasBlocked) {
    dirty = true
    void copyUnreadableData().then((ok) => {
      if (!ok) {
        setStatus({ writeError: UNREADABLE_COPY_ERROR })
        return
      }
      if (!status.readFailed) return
      setStatus({ readFailed: false, writeError: undefined })
      persist()
    })
  } else {
    persist()
  }
  if (!opts.keepPhotos && !wasBlocked) dropPhotos(previous, state.plants, previousGardens, state.gardens)
}

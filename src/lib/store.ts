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
  /** Heure (ms) de la dernière écriture réussie dans IndexedDB. */
  savedAt?: number
}

/**
 * Pourquoi la lecture a échoué :
 * - `newer-version` : les données viennent d'une version plus récente de l'appli (jamais effacées : il faut mettre l'appli à jour) ;
 * - `unreadable` : les données existent mais sont inutilisables (abîmées) ;
 * - `io` : IndexedDB ne répond pas (stockage bloqué, navigation privée, panne passagère).
 */
export type ReadFailureKind = 'newer-version' | 'unreadable' | 'io'

const KEY = 'permajardin:state:v1'
/** Copie de sécurité la plus récente de l'état (avant correction au chargement, avant remplacement par une synchro ou un import). */
const BACKUP_KEY = KEY + ':avant-migration'
/** La copie d'avant : une nouvelle copie ne détruit jamais la précédente (elle passe ici avant d'être écrasée). */
const PREVIOUS_BACKUP_KEY = BACKUP_KEY + ':precedente'
/** Copie des données illisibles (version plus récente, format inconnu) avant tout remplacement. */
const UNREADABLE_BACKUP_KEY = KEY + ':illisible'
const PREVIOUS_UNREADABLE_BACKUP_KEY = UNREADABLE_BACKUP_KEY + ':precedente'
/**
 * Copie de secours SYNCHRONE dans localStorage : écrite à chaque modification, avant l'écriture (asynchrone, différée) dans IndexedDB.
 * Si le navigateur est fermé avant que IndexedDB ait fini (Safari coupe les écritures de `pagehide`), ou si IndexedDB est vidée,
 * la copie la plus récente est reprise au démarrage. Taille plafonnée : au-delà, pas de copie (IndexedDB reste la référence).
 */
const MIRROR_KEY = KEY + ':miroir'
const MIRROR_MAX_CHARS = 3_000_000
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
  if (!next.readFailed || next.readFailure === undefined) delete next.readFailure
  if (next.persistent === status.persistent && next.readFailed === status.readFailed && next.readFailure === status.readFailure && next.writeError === status.writeError && next.savedAt === status.savedAt) return
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
/** Heure (ms) de la dernière modification demandée : sert à comparer la copie de secours et IndexedDB. */
let lastChange = 0

function snapshotData() {
  return { version: STATE_VERSION, gardens: state.gardens, plants: state.plants, tasksDone: state.tasksDone, activeGardenId: state.activeGardenId }
}

function writeMirror() {
  if (typeof localStorage === 'undefined') return
  try {
    const text = JSON.stringify({ savedAt: lastChange, data: snapshotData() })
    if (text.length <= MIRROR_MAX_CHARS) localStorage.setItem(MIRROR_KEY, text)
    else localStorage.removeItem(MIRROR_KEY)
  } catch {
    /* navigation privée ou stockage plein : IndexedDB reste la référence */
  }
}

function readMirror(): { savedAt: number; data: Record<string, unknown> } | undefined {
  if (typeof localStorage === 'undefined') return undefined
  try {
    const raw = localStorage.getItem(MIRROR_KEY)
    if (!raw) return undefined
    const m = JSON.parse(raw) as { savedAt?: unknown; data?: unknown }
    return typeof m.savedAt === 'number' && m.data && typeof m.data === 'object' ? { savedAt: m.savedAt, data: m.data as Record<string, unknown> } : undefined
  } catch {
    return undefined
  }
}

function persist() {
  dirty = true
  if (status.readFailed) return // jamais d'écriture par-dessus des données qu'on n'a pas pu lire
  lastChange = Date.now()
  if (state.loaded && !wiping) writeMirror() // synchrone : survit à une fermeture immédiate
  clearTimeout(saveTimer)
  saveTimer = setTimeout(flush, 200)
}

/** Écrit tout de suite l'état en attente (appelé aussi sur `pagehide` et quand la page passe en arrière-plan). */
export function flush() {
  clearTimeout(saveTimer)
  saveTimer = undefined
  if (!dirty || !state.loaded || status.readFailed || wiping) return
  dirty = false
  const data = { ...snapshotData(), savedAt: lastChange }
  set(KEY, data).then(
    () => {
      setStatus({ writeError: undefined, savedAt: Date.now() })
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
  | { kind: 'ok'; raw: Record<string, unknown>; data: StateData; warnings: string[]; fromMirror?: boolean; replacedByMirror?: unknown; corrected: boolean }

/** Données écrites par une version de l'appli plus récente que celle-ci. */
const isNewerVersion = (raw: unknown): boolean => {
  const v = typeof raw === 'object' && raw !== null ? (raw as { version?: unknown }).version : undefined
  return typeof v === 'number' && Number.isFinite(v) && v > STATE_VERSION
}

/** Données stockées mais inutilisables, gardées en mémoire pour en faire une copie AVANT toute écriture par-dessus. */
let unreadableRaw: unknown

async function readStored(): Promise<Read> {
  let raw: unknown
  let readError = false
  try {
    raw = await get(KEY)
  } catch (e) {
    console.warn('Lecture impossible', e)
    readError = true
  }
  // La copie de secours gagne si elle est plus récente que IndexedDB (fermeture avant la fin de l'écriture), ou si IndexedDB est vide ou illisible.
  // Jamais pour des données d'une version plus récente : la copie de secours (écrite par cette version) les ferait écraser.
  const mirror = isNewerVersion(raw) ? undefined : readMirror()
  const idbSavedAt = raw && typeof raw === 'object' ? Number((raw as { savedAt?: unknown }).savedAt) || 0 : 0
  let fromMirror = false
  let replacedByMirror: unknown
  if (mirror && (readError || raw === undefined || raw === null || mirror.savedAt > idbSavedAt)) {
    const rm = migrateState(mirror.data)
    if (rm.ok && (rm.data.gardens.length > 0 || rm.data.plants.length > 0)) {
      const stale = !readError && raw !== undefined && raw !== null && migrateState(raw).ok
      // Données de IndexedDB illisibles remplacées par la copie de secours : l'original sera copié avant réécriture.
      if (!readError && raw !== undefined && raw !== null && !stale) replacedByMirror = raw
      raw = { ...mirror.data, savedAt: mirror.savedAt }
      fromMirror = true
      if (stale) console.warn('Copie de secours plus récente que IndexedDB : reprise.')
    }
  }
  if (readError && !fromMirror) return { kind: 'failed', cause: 'io' }
  if (raw === undefined || raw === null) return { kind: 'empty' }
  const r = migrateState(raw)
  if (!r.ok) {
    console.warn('Données stockées inutilisables :', r.error)
    return { kind: 'failed', cause: isNewerVersion(raw) ? 'newer-version' : 'unreadable', raw }
  }
  const warnings = fromMirror ? [...r.warnings, 'Vos dernières modifications ont été retrouvées dans la copie de secours de cet appareil.'] : r.warnings
  return { kind: 'ok', raw: raw as Record<string, unknown>, data: r.data, warnings, fromMirror, replacedByMirror, corrected: r.warnings.length > 0 }
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
 * Garde `value` dans la copie `key`. L'ancienne copie passe en « précédente » (jamais détruite), sauf si elle est identique.
 * Renvoie `false` si le stockage a refusé : l'appelant ne doit alors RIEN écraser.
 */
async function keepSafetyCopy(value: unknown, key = BACKUP_KEY): Promise<boolean> {
  try {
    const current = await get(key)
    if (current !== undefined && current !== null) {
      if (sameJson(current, value)) return true
      await set(key === BACKUP_KEY ? PREVIOUS_BACKUP_KEY : PREVIOUS_UNREADABLE_BACKUP_KEY, current)
    }
    await set(key, value)
    return true
  } catch (e) {
    console.warn('Copie de sécurité impossible', e)
    return false
  }
}

/**
 * Avant d'écrire par-dessus des données qu'on n'a pas pu lire : en garde une copie (clé « illisible »).
 * `true` = on peut écrire (copie faite, ou preuve qu'il n'y a rien à protéger) ; `false` = ne rien écraser.
 */
async function copyUnreadableData(): Promise<boolean> {
  if (unreadableRaw !== undefined) return keepSafetyCopy(unreadableRaw, UNREADABLE_BACKUP_KEY)
  // Échec d'entrée-sortie : on retente la lecture pour avoir de quoi copier.
  try {
    const raw = await get(KEY)
    if (raw === undefined || raw === null) return true // rien n'est stocké : rien à perdre
    return keepSafetyCopy(raw, UNREADABLE_BACKUP_KEY)
  } catch {
    // Toujours illisible. Dernier recours : la clé de l'état est-elle absente de la liste des clés ?
    try {
      return !(await keys()).includes(KEY)
    } catch {
      return false
    }
  }
}

/**
 * Copie de sécurité à télécharger (voir `exportSafetyCopy()` de `backup.ts`). Pendant un échec de lecture : les données illisibles
 * elles-mêmes (brutes, telles que stockées) ; sinon la copie la plus récente d'avant un remplacement ou une correction. `undefined` s'il n'y en a pas.
 */
export async function readSafetyCopy(): Promise<unknown> {
  if (status.readFailed && unreadableRaw !== undefined) return unreadableRaw
  try {
    for (const k of [BACKUP_KEY, UNREADABLE_BACKUP_KEY, PREVIOUS_BACKUP_KEY, PREVIOUS_UNREADABLE_BACKUP_KEY]) {
      const v = await get(k)
      if (v !== undefined && v !== null) return v
    }
  } catch {
    /* illisible : pas de copie à proposer */
  }
  return undefined
}

/**
 * Copie de sécurité de l'état local, à faire AVANT de le remplacer (récupération depuis la synchro, import d'une sauvegarde).
 * `false` : la copie a échoué, ne rien remplacer. Si la lecture avait échoué, ce sont les données illisibles qui sont copiées.
 * Les photos de la copie sont protégées du nettoyage (voir `purgeOrphanPhotos`).
 */
export async function keepLocalSafetyCopy(): Promise<boolean> {
  if (status.readFailed) return copyUnreadableData()
  if (!state.loaded || (state.gardens.length === 0 && state.plants.length === 0)) return true // rien à protéger
  return keepSafetyCopy(snapshotData())
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
      title: 'Vos données viennent d’une version plus récente.',
      message: 'Elles ont été enregistrées par une version plus récente de PermaJardin. Mettez l’appli à jour pour les ouvrir. En attendant, rien n’est modifié ni enregistré.',
      primary: 'update',
      primaryLabel: 'Mettre à jour l’appli',
      canStartOver: false,
    }
  }
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
    startOverWarning:
      'Vos données illisibles seront remplacées dès le prochain enregistrement. Une copie est d’abord gardée sur cet appareil (bouton « Récupérer la copie de sécurité »). L’appli ne sait pas la rouvrir seule. Si la copie ne peut pas être faite, rien n’est remplacé.',
  }
}

/**
 * Remplacer les données de cet appareil (import d'une sauvegarde, reprise de la copie en ligne) est refusé tant qu'elles viennent
 * d'une version plus récente de l'appli : on ne les écrase jamais, même après copie. Renvoie le message à afficher, ou `undefined`.
 */
export function replaceRefusal(): string | undefined {
  return status.readFailed && status.readFailure === 'newer-version' ? NEWER_VERSION_TEXT : undefined
}

const NEWER_VERSION_TEXT = 'Les données de cet appareil viennent d’une version plus récente de PermaJardin : elles ne sont jamais écrasées. Mettez l’appli à jour, puis réessayez.'

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

/**
 * Essai d'écriture au démarrage : un navigateur qui refuse IndexedDB (navigation privée de Firefox, réglage « effacer à la fermeture »,
 * espace plein) est signalé tout de suite, pas à la première modification perdue.
 */
async function probeWrite() {
  const KEY_PROBE = 'permajardin:probe'
  try {
    const stamp = Date.now()
    await set(KEY_PROBE, stamp)
    if ((await get(KEY_PROBE)) !== stamp) throw new Error('relecture différente')
    await del(KEY_PROBE)
  } catch (e) {
    console.warn('Essai d’écriture impossible', e)
    setStatus({ writeError: WRITE_ERROR })
  }
}

export async function loadState() {
  initLifecycle()
  void requestPersistence()
  void probeWrite()
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
      // On garde l'original avant de réécrire une version corrigée (l'ancienne copie passe en « précédente »).
      // Reprise de la copie de secours : l'original à protéger est celui de IndexedDB s'il était illisible, sinon la copie de secours si elle a été corrigée.
      if (read.replacedByMirror !== undefined) await keepSafetyCopy(read.replacedByMirror, UNREADABLE_BACKUP_KEY)
      if (!read.fromMirror || read.corrected) await keepSafetyCopy(read.raw)
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
    try {
      if (typeof localStorage !== 'undefined') localStorage.removeItem(MIRROR_KEY)
    } catch {
      /* ignoré */
    }
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
 * Jamais pour des données d'une version plus récente (il faut mettre l'appli à jour). Si la lecture elle-même est impossible
 * (stockage en panne) et que la liste des clés prouve qu'il n'y a rien d'enregistré, il n'y a rien à copier : on reprend.
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

/** Ajoute à `refs` les photos citées par un état stocké, quel que soit son état (copie illisible : lecture prudente). */
function addPhotoRefs(value: unknown, refs: Set<string>) {
  if (typeof value !== 'object' || value === null) return
  const { plants, gardens } = value as { plants?: unknown; gardens?: unknown }
  for (const p of Array.isArray(plants) ? plants : []) {
    const photos = (p as { photos?: unknown } | null)?.photos
    if (Array.isArray(photos)) for (const id of photos) if (typeof id === 'string') refs.add(id)
  }
  if (Array.isArray(gardens)) for (const id of panoramaPhotoIds(gardens as Garden[])) refs.add(id)
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
    // Photos des copies de sécurité (avant remplacement par une synchro ou un import, données corrigées ou illisibles) : à garder tant que la copie existe.
    for (const k of [BACKUP_KEY, PREVIOUS_BACKUP_KEY, UNREADABLE_BACKUP_KEY, PREVIOUS_UNREADABLE_BACKUP_KEY]) addPhotoRefs(await get(k), refs)
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

/** Abonnement hors React (synchronisation automatique, indicateurs) : appelé à chaque changement d'état. */
export function subscribeStore(l: () => void) {
  return subscribe(l)
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

/** Retire une décision précise (annuler un « fait », un report ou un refus) sans toucher aux autres entrées de la même tâche. */
export function removeTaskDoneById(id: string) {
  setState((s) => ({ tasksDone: s.tasksDone.filter((t) => t.id !== id) }))
}

/**
 * Remplace tout l'état (import d'une sauvegarde ou synchro ; données déjà passées par `migrateState`).
 * Action explicite : lève aussi le blocage d'écriture après un échec de lecture, mais seulement APRÈS une copie des
 * données illisibles (si la copie échoue, le blocage reste et `writeError` le dit : rien n'est écrasé).
 * Les appelants font d'abord `await keepLocalSafetyCopy()` (copie de l'état courant ; pas de remplacement si elle échoue)
 * puis passent `keepPhotos` : les photos des plantes remplacées sont gardées (elles sont dans la copie, purgées plus tard).
 */
export function replaceData(data: Pick<AppState, 'gardens' | 'plants' | 'tasksDone'>, opts: { keepPhotos?: boolean } = {}) {
  // Dernier garde-fou : jamais de remplacement par-dessus des données d'une version plus récente (les appelants le vérifient avant).
  const refusal = replaceRefusal()
  if (refusal) throw new Error(refusal)
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

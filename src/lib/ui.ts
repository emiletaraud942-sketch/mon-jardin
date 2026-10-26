import { useSyncExternalStore } from 'react'
import type { Category, XY } from '../types'
import type { LegalId } from './legal'
import { neighborsEnabled } from './neighbors/enabled'

// État d'interface non persistant, partagé entre la carte, la 3D et les panneaux.
export type Tab = 'carte' | '3d' | 'plantes' | 'entretien' | 'planter' | 'catalogue' | 'reglages' | 'voisins'

/** Mode d'affichage selon le stade : modéliser le jardin, l'entretenir, planifier. */
export type Mode = 'jardin' | 'entretenir' | 'planifier'
export const MODES: Mode[] = ['jardin', 'entretenir', 'planifier']
export const MODE_LABEL: Record<Mode, string> = { jardin: 'Mon jardin', entretenir: 'Entretenir', planifier: 'Planifier' }
/** Onglets de chaque mode (barre du bas sur téléphone : 5 entrées au plus, plus « Plus »). */
export const MODE_TABS: Record<Mode, Tab[]> = {
  jardin: ['carte', '3d', 'plantes'],
  entretenir: ['entretien', 'plantes'],
  planifier: ['planter', 'catalogue', '3d'],
}
/** Toujours accessibles, quel que soit le mode (menu « Plus »). */
export const ALWAYS_TABS: Tab[] = ['catalogue', 'reglages', 'voisins']
export const DEFAULT_TAB: Record<Mode, Tab> = { jardin: 'carte', entretenir: 'entretien', planifier: 'planter' }
/** En dessous de ce nombre de plantes, on ouvre sur « Mon jardin ». */
export const MIN_PLANTS_FOR_CARE = 3

/** Barre du bas sur téléphone (5 entrées au plus, « Menu » compris) : la même dans tous les modes. Entraide seulement si activée. */
export const mobileBarTabs = (neighbors: boolean = neighborsEnabled): Tab[] => ['carte', 'plantes', 'entretien', ...(neighbors ? (['voisins'] as Tab[]) : (['planter'] as Tab[]))]
/** Écrans qui passent par le « Menu » sur téléphone. */
export const mobileMenuTabs = (neighbors: boolean = neighborsEnabled): Tab[] => TABS.filter((t) => !mobileBarTabs(neighbors).includes(t) && tabAvailable(t))

export const tabInMode = (mode: Mode, tab: Tab) => MODE_TABS[mode].includes(tab) || ALWAYS_TABS.includes(tab)
/** Mode qui contient l'onglet : le mode courant s'il convient, sinon le premier qui le propose. */
export function modeForTab(tab: Tab, current: Mode): Mode {
  if (tabInMode(current, tab)) return current
  return MODES.find((m) => tabInMode(m, tab)) ?? current
}
export const defaultMode = (plantCount: number): Mode => (plantCount < MIN_PLANTS_FOR_CARE ? 'jardin' : 'entretenir')
export const parseMode = (v: unknown): Mode | undefined => (MODES as unknown[]).includes(v) ? (v as Mode) : undefined

// ---------- Mémoire locale (localStorage peut être absent ou refuser d'écrire) ----------
const MODE_KEY = 'pj.mode'
const GUIDE_KEY = 'pj.guide'

function readPref(key: string): string | undefined {
  try {
    return localStorage.getItem(key) ?? undefined
  } catch {
    return undefined
  }
}
function writePref(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* mémoire indisponible : la préférence ne durera que pour cette session */
  }
}

/** Aides et repères mémorisés : cartes repliées, « plus tard », écrans déjà ouverts. */
export interface GuideState {
  /** Détails de la jauge (prochaine étape, Premiers pas) dépliés. */
  progressOpen: boolean
  /** Checklist « Premiers pas » masquée par l'utilisateur (ou jamais affichée). */
  stepsHidden: boolean
  stepsOpen: boolean
  /** Bandeau « jardin d'exemple » fermé par l'utilisateur. */
  demoHidden: boolean
  /** Ligne « Installer l'appli » fermée par l'utilisateur. */
  installHidden: boolean
  /** Date (ms) avant laquelle on ne repropose pas « passer à l'entretien ». */
  nudgeUntil: number
  /** Ids des jardins dont la vue 3D / l'écran Entretien ont déjà été ouverts. */
  opened3d: string[]
  openedEntretien: string[]
}
const DEFAULT_GUIDE: GuideState = { progressOpen: false, stepsHidden: true, stepsOpen: true, demoHidden: false, installHidden: false, nudgeUntil: 0, opened3d: [], openedEntretien: [] }
export const NUDGE_SNOOZE_MS = 7 * 86400000

function readGuide(): GuideState {
  try {
    const raw = JSON.parse(readPref(GUIDE_KEY) ?? '{}') as Partial<GuideState>
    const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d)
    const ids = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])
    return {
      progressOpen: bool(raw.progressOpen, DEFAULT_GUIDE.progressOpen),
      stepsHidden: bool(raw.stepsHidden, DEFAULT_GUIDE.stepsHidden),
      stepsOpen: bool(raw.stepsOpen, DEFAULT_GUIDE.stepsOpen),
      demoHidden: bool(raw.demoHidden, DEFAULT_GUIDE.demoHidden),
      installHidden: bool(raw.installHidden, DEFAULT_GUIDE.installHidden),
      nudgeUntil: typeof raw.nudgeUntil === 'number' && Number.isFinite(raw.nudgeUntil) ? raw.nudgeUntil : 0,
      opened3d: ids(raw.opened3d),
      openedEntretien: ids(raw.openedEntretien),
    }
  } catch {
    return { ...DEFAULT_GUIDE }
  }
}

/** Choix en cours sur l'écran « Planter » : survit à la navigation vers une fiche et retour. */
export interface PlantingState {
  gardenId: string
  spot?: XY
  cat: Category | ''
}

interface UiState {
  tab: Tab
  mode: Mode
  guide: GuideState
  selectedPlantId?: string
  placingSpeciesId?: string
  /** Pour une plante hors base (identifiée par photo) : nom affiché. */
  placingCustomName?: string
  /** Photos à rattacher à la prochaine plante placée. */
  pendingPhotos?: string[]
  /** Placement en série : le mode reste actif après chaque plante, jusqu'à « Terminé ». */
  placingSeries?: { count: number }
  /** « Déplacer cette plante » : la prochaine pression sur la carte donne son nouvel emplacement. */
  movingPlantId?: string
  /** Fiche espèce ouverte dans le catalogue. */
  speciesId?: string
  /** Écran « Planter » : emplacement et catégorie choisis. */
  planting?: PlantingState
  /** Mois choisi dans « Que semer et planter en ». */
  sowMonth?: number
  /** Plante sur laquelle la carte doit se centrer (« 📍 plante » d'une tâche, « Voir sur la carte »). Effacé une fois fait. */
  focusPlantId?: string
  /** Demande l'ouverture du formulaire « Nouveau jardin » dans les Réglages. */
  newGarden?: boolean
}

/** Noms des écrans, tels que l'utilisateur les lit (barre de navigation, titre de la page). */
export const TAB_LABEL: Record<Tab, string> = {
  carte: 'Carte',
  '3d': 'Vue 3D',
  plantes: 'Plantes',
  entretien: 'Entretien',
  planter: 'Où planter ?',
  catalogue: 'Catalogue',
  reglages: 'Réglages',
  voisins: 'Entraide',
}

export const TABS: Tab[] = ['carte', '3d', 'plantes', 'entretien', 'planter', 'catalogue', 'reglages', 'voisins']
/** L'onglet « Voisins » n'existe que si l'entraide est configurée (variables VITE_NEIGHBORS_*). */
export const tabAvailable = (t: Tab) => t !== 'voisins' || neighborsEnabled
/** Alias de hash : le retour d'un lien magique de l'entraide arrive sur `#entraide`. */
const HASH_ALIAS: Record<string, Tab> = { entraide: 'voisins' }
const MAP_TABS: Tab[] = ['carte', '3d']

/** Onglet désigné par un hash (`#plantes`, `#reglages#access_token=…`). Un hash inconnu (lien magique…) donne `undefined`. */
export function parseHash(hash: string): Tab | undefined {
  const m = /^#?([a-z0-9]+)(?:[#&?/]|$)/.exec(hash)
  const t = (HASH_ALIAS[m?.[1] ?? ''] ?? m?.[1]) as Tab | undefined
  return t && TABS.includes(t) && tabAvailable(t) ? t : undefined
}

/** Ce qui est mémorisé dans chaque entrée d'historique. */
interface NavSnap {
  tab: Tab
  selectedPlantId?: string
  speciesId?: string
}
interface HistoryState {
  nav: NavSnap
  /** Entrée créée par l'ouverture d'une fiche plante (sans changer d'onglet) : le bouton Fermer peut revenir en arrière. */
  sheetOnly?: boolean
}

const snap = (u: UiState): NavSnap => ({ tab: u.tab, selectedPlantId: u.selectedPlantId, speciesId: u.speciesId })
const sameSnap = (a: NavSnap, b: NavSnap) => a.tab === b.tab && a.selectedPlantId === b.selectedPlantId && a.speciesId === b.speciesId
const readState = (): HistoryState | undefined => {
  const s = history.state as HistoryState | null
  return s && typeof s === 'object' && s.nav ? s : undefined
}

/** Mode mémorisé d'une session précédente ; sans lui, `applyDefaultMode` choisira selon le nombre de plantes. */
const storedMode = parseMode(readPref(MODE_KEY))
/** Aucun onglet désigné au lancement (ni historique, ni hash) : le mode par défaut peut choisir l'écran d'ouverture. */
let tabImplicit = false

function initialUi(): UiState {
  const stored = readState()?.nav
  let tab: Tab
  let extra: Partial<UiState> = {}
  if (stored && TABS.includes(stored.tab) && tabAvailable(stored.tab)) {
    tab = stored.tab
    extra = { selectedPlantId: stored.selectedPlantId, speciesId: stored.speciesId }
  } else {
    const fromHash = parseHash(location.hash)
    tabImplicit = !fromHash
    // Relance sans écran désigné : on rouvre le mode où l'on s'était arrêté.
    tab = fromHash ?? (storedMode ? DEFAULT_TAB[storedMode] : 'carte')
  }
  return { tab, mode: modeForTab(tab, storedMode ?? 'jardin'), guide: readGuide(), ...extra }
}

let ui: UiState = initialUi()
const listeners = new Set<() => void>()

// Entrée initiale : on ne touche pas à l'URL si le hash contient autre chose qu'un onglet
// (jeton d'un lien magique, par exemple) : la synchronisation doit pouvoir le lire.
if (location.hash === '' || location.hash === '#' + ui.tab) {
  history.replaceState({ nav: snap(ui), sheetOnly: readState()?.sheetOnly } satisfies HistoryState, '', '#' + ui.tab)
}

function emit() {
  listeners.forEach((l) => l())
}

function clearPlacing(u: UiState): UiState {
  return { ...u, placingSpeciesId: undefined, placingCustomName: undefined, pendingPhotos: undefined, placingSeries: undefined, movingPlantId: undefined }
}

/**
 * Historique : un changement d'onglet et l'ouverture d'une fiche plante ajoutent une entrée
 * (le bouton Retour d'Android les défait) ; les autres changements remplacent l'entrée courante.
 */
function syncHistory(prev: UiState, next: UiState, forcePush: boolean) {
  const a = snap(prev)
  const b = snap(next)
  if (sameSnap(a, b) && !forcePush) return
  const tabChanged = a.tab !== b.tab
  const opened = !a.selectedPlantId && !!b.selectedPlantId
  const state: HistoryState = { nav: b, sheetOnly: opened && !tabChanged ? true : undefined }
  if (tabChanged || opened || forcePush) history.pushState(state, '', '#' + b.tab)
  else history.replaceState({ nav: b, sheetOnly: readState()?.sheetOnly && b.selectedPlantId ? true : undefined } satisfies HistoryState, '', '#' + b.tab)
}

export function setUi(patch: Partial<Omit<UiState, 'guide'>>, opts: { push?: boolean } = {}) {
  const prev = ui
  let next: UiState = { ...ui, ...patch }
  // Un onglet hors du mode courant (lien direct, « Voir sur la carte »…) bascule dans le bon mode.
  if (patch.tab) next.mode = modeForTab(patch.tab, patch.mode ?? next.mode)
  if (next.mode !== prev.mode) writePref(MODE_KEY, next.mode)
  // Quitter la carte/3D abandonne le placement en cours (sinon il resterait actif, invisible).
  if (patch.tab && patch.tab !== prev.tab && !MAP_TABS.includes(patch.tab) && !patch.placingSpeciesId) next = clearPlacing(next)
  ui = next
  syncHistory(prev, next, !!opts.push)
  emit()
}

// Bouton Retour (Android, navigateur) : on restitue l'écran mémorisé dans l'entrée d'historique.
window.addEventListener('popstate', (e) => {
  const s = (e.state as HistoryState | null)?.nav
  const tab = s?.tab && TABS.includes(s.tab) && tabAvailable(s.tab) ? s.tab : parseHash(location.hash) ?? 'carte'
  let next: UiState = { ...ui, tab, mode: modeForTab(tab, ui.mode), selectedPlantId: s?.selectedPlantId, speciesId: s ? s.speciesId : ui.speciesId }
  if (!MAP_TABS.includes(tab)) next = clearPlacing(next)
  if (next.mode !== ui.mode) writePref(MODE_KEY, next.mode)
  ui = next
  emit()
})

/** Change de mode et ouvre son onglet par défaut (une entrée d'historique, comme un changement d'onglet). */
export function setMode(mode: Mode) {
  writePref(MODE_KEY, mode) // même sans changement : le choix explicite l'emporte sur le mode par défaut
  if (ui.mode === mode && MODE_TABS[mode].includes(ui.tab)) return
  setUi({ mode, tab: DEFAULT_TAB[mode] })
}

/**
 * Premier lancement avec un jardin et sans mode mémorisé : « Mon jardin » s'il y a moins de 3 plantes, sinon « Entretenir ».
 * Remplace l'entrée d'historique courante (pas d'empilement) et ne change l'écran que s'il n'était pas désigné.
 */
export function applyDefaultMode(plantCount: number) {
  if (parseMode(readPref(MODE_KEY))) return
  const mode = defaultMode(plantCount)
  const prevTab = ui.tab
  const tab = tabImplicit && !tabInMode(mode, prevTab) ? DEFAULT_TAB[mode] : prevTab
  tabImplicit = false
  ui = { ...ui, mode: modeForTab(tab, mode), tab }
  writePref(MODE_KEY, ui.mode)
  // Le hash n'est réécrit que s'il ne contient rien d'autre que l'onglet (jeton de lien magique à préserver).
  if (tab !== prevTab && (location.hash === '' || location.hash === '#' + prevTab)) history.replaceState({ nav: snap(ui) } satisfies HistoryState, '', '#' + tab)
  emit()
}

/** Met à jour les repères mémorisés (cartes repliées, « plus tard »…). N'ajoute rien à l'historique. */
export function setGuide(patch: Partial<GuideState>) {
  const guide = { ...ui.guide, ...patch }
  ui = { ...ui, guide }
  writePref(GUIDE_KEY, JSON.stringify(guide))
  emit()
}

/** Note que l'écran visité (3D, Entretien) l'a été pour ce jardin : alimente la jauge et le mode conseillé. */
export function noteVisit(tab: Tab, gardenId: string) {
  if (tab === '3d' && !ui.guide.opened3d.includes(gardenId)) setGuide({ opened3d: [...ui.guide.opened3d, gardenId] })
  if (tab === 'entretien' && !ui.guide.openedEntretien.includes(gardenId)) setGuide({ openedEntretien: [...ui.guide.openedEntretien, gardenId] })
}

/**
 * Réaffiche la checklist « Premiers pas » sur « Mon jardin ». Ouverte par défaut (demande dans l'aide) ;
 * `open: false` la laisse repliée (jardin tout juste créé : on ne couvre pas la carte).
 */
export function showFirstSteps(opts: { open?: boolean } = {}) {
  setGuide({ stepsHidden: false, stepsOpen: true, progressOpen: opts.open ?? true })
  setMode('jardin')
}

export function useUi(): UiState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => ui,
  )
}

export function openSpecies(speciesId: string) {
  // Déjà dans le catalogue : on ajoute une entrée pour que Retour revienne à la fiche précédente.
  setUi({ tab: 'catalogue', speciesId }, { push: ui.tab === 'catalogue' && ui.speciesId !== speciesId })
}

/** Lance le placement d'une plante : bascule sur la carte si on n'est ni sur la carte ni en 3D. */
export function startPlacing(speciesId: string, extra: { customName?: string; photos?: string[]; series?: boolean } = {}) {
  setUi({
    placingSpeciesId: speciesId,
    placingCustomName: extra.customName,
    pendingPhotos: extra.photos,
    placingSeries: extra.series ? { count: 0 } : undefined,
    selectedPlantId: undefined,
    movingPlantId: undefined,
    tab: ui.tab === '3d' ? '3d' : 'carte',
  })
}

/** Arrête le placement ou le déplacement (bouton Annuler ou Terminé de la bannière). */
export function stopPlacing() {
  setUi({ placingSpeciesId: undefined, placingCustomName: undefined, pendingPhotos: undefined, placingSeries: undefined, movingPlantId: undefined })
}

/** « Déplacer cette plante » : un appui sur la carte donne le nouvel emplacement (sans glisser). Toujours sur la carte 2D. */
export function startMoving(plantId: string) {
  setUi({ movingPlantId: plantId, placingSpeciesId: undefined, placingCustomName: undefined, pendingPhotos: undefined, placingSeries: undefined, tab: 'carte' })
}

/** Ferme la fiche plante ; si elle a été ouverte par une entrée d'historique propre, revient en arrière (Retour ne la rouvre pas). */
export function closePlantSheet() {
  if (ui.selectedPlantId && readState()?.sheetOnly) history.back()
  else setUi({ selectedPlantId: undefined })
}

export function getUi() {
  return ui
}

// ---------- Pages légales (Confidentialité, Mentions légales, CGU) ----------
// Hors navigation par onglets : elles s'ouvrent aussi sans jardin créé et n'ajoutent rien à l'historique.
let legalOpen: LegalId | undefined
const legalListeners = new Set<() => void>()
export function openLegal(id: LegalId) {
  legalOpen = id
  legalListeners.forEach((l) => l())
}
export function closeLegal() {
  legalOpen = undefined
  legalListeners.forEach((l) => l())
}
export function useLegal(): LegalId | undefined {
  return useSyncExternalStore(
    (l) => {
      legalListeners.add(l)
      return () => legalListeners.delete(l)
    },
    () => legalOpen,
  )
}

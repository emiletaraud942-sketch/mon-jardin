import { useSyncExternalStore } from 'react'
import type { Category, XY } from '../types'
import type { LegalId } from './legal'
import { neighborsEnabled } from './neighbors/enabled'
import { EMPTY_ONBOARDING, hideRoute, markStep, markWelcomed, parseOnboarding, restartTour, type OnboardingState, type OnboardingStepId } from './onboarding'

// État d'interface partagé entre la carte, la 3D et les panneaux. Seuls le dernier rayon et les repères (GuideState) sont mémorisés.
export type Tab = 'accueil' | 'carte' | '3d' | 'plantes' | 'entretien' | 'planter' | 'catalogue' | 'reglages' | 'voisins'

/**
 * Les 4 rayons de l'appli (barre du bas). Chacun regroupe des écrans :
 * Mon jardin = carte, plantes, vue 3D ; À faire = entretien, météo, calendrier ; Où planter ? = conseils et catalogue ; Voisins = entraide.
 */
export type Rayon = 'jardin' | 'afaire' | 'planter' | 'voisins'
export const RAYONS: Rayon[] = ['jardin', 'afaire', 'planter', 'voisins']
export const RAYON_LABEL: Record<Rayon, string> = { jardin: 'Mon jardin', afaire: 'À faire', planter: 'Où planter ?', voisins: 'Voisins' }
export const RAYON_TABS: Record<Rayon, Tab[]> = {
  jardin: ['carte', 'plantes', '3d'],
  afaire: ['entretien'],
  planter: ['planter', 'catalogue'],
  voisins: ['voisins'],
}
/** Écran où l'on arrive en ouvrant un rayon. */
export const DEFAULT_TAB: Record<Rayon, Tab> = { jardin: 'carte', afaire: 'entretien', planter: 'planter', voisins: 'voisins' }
/** Rayon d'un écran ; « accueil » et « reglages » (compte) n'appartiennent à aucun rayon. */
export const rayonOfTab = (tab: Tab): Rayon | undefined => RAYONS.find((r) => RAYON_TABS[r].includes(tab))
export const parseRayon = (v: unknown): Rayon | undefined => ((RAYONS as unknown[]).includes(v) ? (v as Rayon) : undefined)
/** Voisins n'existe que si l'entraide est configurée (variables NEIGHBORS_*) : sinon la barre a 3 entrées. */
export const rayonAvailable = (r: Rayon, neighbors: boolean = neighborsEnabled) => r !== 'voisins' || neighbors
export const visibleRayons = (neighbors: boolean = neighborsEnabled): Rayon[] => RAYONS.filter((r) => rayonAvailable(r, neighbors))
/** Écrans du sélecteur segmenté d'un rayon (vide : pas de sélecteur). */
export const subTabs = (r: Rayon | undefined): Tab[] => (r === 'jardin' || r === 'planter' ? RAYON_TABS[r] : [])
/** Libellés du sélecteur segmenté d'un rayon. */
export const SUB_LABEL: Partial<Record<Tab, string>> = { carte: 'Carte', plantes: 'Plantes', '3d': 'Vue 3D', planter: 'Où planter ?', catalogue: 'Catalogue' }
/** Ancien mode mémorisé (avant les rayons) -> rayon. */
export const MODE_TO_RAYON: Record<string, Rayon> = { jardin: 'jardin', entretenir: 'afaire', planifier: 'planter' }

// ---------- Mémoire locale (localStorage peut être absent ou refuser d'écrire) ----------
const MODE_KEY = 'pj.mode' // ancienne clé (3 modes) : lue une fois pour retrouver le rayon
const RAYON_KEY = 'pj.rayon'
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
  /** Avancement du parcours d'accueil. `undefined` : rien d'enregistré, l'état de départ est déduit des jardins et des plantes. */
  onboarding?: OnboardingState
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
      onboarding: parseOnboarding(raw.onboarding),
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
  /** Dernier rayon visité (mémorisé) : sert à rouvrir l'appli où l'on s'était arrêté. */
  rayon?: Rayon
  /** Parcours d'accueil ouvert (plein écran). 'auto' : à l'étape en cours. */
  parcours?: ParcoursScreen
  guide: GuideState
  selectedPlantId?: string
  placingSpeciesId?: string
  /** Pour une plante hors base (identifiée par photo) : nom affiché. */
  placingCustomName?: string
  /** Photos à rattacher à la prochaine plante placée. */
  pendingPhotos?: string[]
  /** Placement en série : le mode reste actif après chaque plante, jusqu'à « Terminé ». */
  placingSeries?: { count: number }
  /** Plante dont on demande l'achat (forme, hauteur, lieu, prix) juste après son placement. */
  purchasePlantId?: string
  /** « Déplacer cette plante » : la prochaine pression sur la carte donne son nouvel emplacement. */
  movingPlantId?: string
  /** Endroit touché sur la carte, en attente de « Valider » (placement ou déplacement). Absent en mode Viser : le viseur fait foi. */
  placingSpot?: XY
  /** Mode « Viser » : viseur fixe au centre de la carte, la carte bouge sous le doigt. */
  aim?: boolean
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

export type ParcoursScreen = OnboardingStepId | 'fin' | 'auto'

/** Noms des écrans, tels que l'utilisateur les lit (barre de navigation, titre de la page). */
export const TAB_LABEL: Record<Tab, string> = {
  accueil: 'Accueil',
  carte: 'Carte',
  '3d': 'Vue 3D',
  plantes: 'Plantes',
  entretien: 'Entretien',
  planter: 'Où planter ?',
  catalogue: 'Catalogue',
  reglages: 'Réglages',
  voisins: 'Voisins',
}

export const TABS: Tab[] = ['accueil', 'carte', '3d', 'plantes', 'entretien', 'planter', 'catalogue', 'reglages', 'voisins']
/** L'onglet « Voisins » n'existe que si l'entraide est configurée (variables VITE_NEIGHBORS_*). */
export const tabAvailable = (t: Tab) => t !== 'voisins' || neighborsEnabled
/** Alias de hash : le retour d'un lien magique de l'entraide arrive sur `#entraide`. */
const HASH_ALIAS: Record<string, Tab> = { entraide: 'voisins', jardin: 'carte', afaire: 'entretien', compte: 'reglages' }
const MAP_TABS: Tab[] = ['carte', '3d']

/** Hash d'un écran (`#carte`). */
export const toHash = (tab: Tab) => '#' + tab

/** Onglet désigné par un hash (`#plantes`, `#reglages#access_token=…`). Un hash inconnu (lien magique…) donne `undefined`. */
export function fromHash(hash: string): Tab | undefined {
  return parseHash(hash)
}
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

/** Dernier rayon d'une session précédente (ou converti depuis l'ancien mode à trois boutons). */
function readStoredRayon(): Rayon | undefined {
  const r = parseRayon(readPref(RAYON_KEY))
  if (r) return r
  const old = readPref(MODE_KEY)
  return old ? MODE_TO_RAYON[old] : undefined
}
const storedRayon = readStoredRayon()

function initialUi(): UiState {
  const stored = readState()?.nav
  let tab: Tab
  let extra: Partial<UiState> = {}
  if (stored && TABS.includes(stored.tab) && tabAvailable(stored.tab)) {
    tab = stored.tab
    extra = { selectedPlantId: stored.selectedPlantId, speciesId: stored.speciesId }
  } else {
    // Ni historique ni hash : le dernier rayon s'il est connu et disponible, sinon « Que voulez-vous faire ? ».
    const fromHash = parseHash(location.hash)
    tab = fromHash ?? (storedRayon && rayonAvailable(storedRayon) ? DEFAULT_TAB[storedRayon] : 'accueil')
  }
  return { tab, rayon: rayonOfTab(tab) ?? storedRayon, guide: readGuide(), ...extra }
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
  return { ...u, placingSpeciesId: undefined, placingCustomName: undefined, pendingPhotos: undefined, placingSeries: undefined, movingPlantId: undefined, placingSpot: undefined }
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
  // Changer d'écran ferme le parcours d'accueil (sauf s'il est demandé en même temps).
  if (patch.tab && !('parcours' in patch)) next.parcours = undefined
  // Le rayon de l'écran devient le dernier rayon visité (mémorisé pour la prochaine ouverture).
  const r = patch.tab ? rayonOfTab(patch.tab) : undefined
  if (r && r !== prev.rayon) {
    next.rayon = r
    writePref(RAYON_KEY, r)
  }
  // Quitter la carte/3D abandonne le placement en cours (sinon il resterait actif, invisible).
  if (patch.tab && patch.tab !== prev.tab && !MAP_TABS.includes(patch.tab) && !patch.placingSpeciesId) next = clearPlacing(next)
  ui = next
  syncHistory(prev, next, !!opts.push)
  emit()
}

// Bouton Retour (Android, navigateur) : on restitue l'écran mémorisé dans l'entrée d'historique.
window.addEventListener('popstate', (e) => {
  const s = (e.state as HistoryState | null)?.nav
  const tab = s?.tab && TABS.includes(s.tab) && tabAvailable(s.tab) ? s.tab : parseHash(location.hash) ?? 'accueil'
  let next: UiState = { ...ui, tab, rayon: rayonOfTab(tab) ?? ui.rayon, parcours: undefined, selectedPlantId: s?.selectedPlantId, speciesId: s ? s.speciesId : ui.speciesId }
  if (!MAP_TABS.includes(tab)) next = clearPlacing(next)
  if (next.rayon && next.rayon !== ui.rayon) writePref(RAYON_KEY, next.rayon)
  ui = next
  emit()
})

/** Ouvre un rayon (barre du bas) : son écran d'arrivée, sauf si l'on y est déjà. */
export function goRayon(rayon: Rayon) {
  if (rayonOfTab(ui.tab) === rayon) return
  setUi({ tab: DEFAULT_TAB[rayon] })
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

// ---------- Parcours d'accueil (état enregistré dans GuideState.onboarding) ----------
/** État courant du parcours ; vide tant que rien n'est enregistré (l'application le déduit des jardins et des plantes). */
export const getOnboarding = (): OnboardingState => ui.guide.onboarding ?? EMPTY_ONBOARDING
export function updateOnboarding(fn: (s: OnboardingState) => OnboardingState) {
  setGuide({ onboarding: fn(getOnboarding()) })
}
export const noteStep = (id: OnboardingStepId, kind: 'done' | 'skipped') => updateOnboarding((s) => markStep(s, id, kind))
export const noteWelcomed = () => updateOnboarding(markWelcomed)
export const hideOnboardingRoute = () => updateOnboarding(hideRoute)
/** Ouvre le parcours plein écran à une étape (par défaut : l'étape en cours). */
export function openParcours(screen: ParcoursScreen = 'auto') {
  setUi({ parcours: screen })
}
export function closeParcours(opts: { to?: Tab } = {}) {
  setUi({ parcours: undefined, tab: opts.to ?? 'accueil' })
}
/** « Revoir la visite » (compte, aide) : repart de la première étape. */
export function restartOnboarding() {
  updateOnboarding(restartTour)
  setUi({ tab: 'accueil', parcours: 'adresse' })
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
  // Depuis l'étape « Mes plantes » du parcours d'accueil : choisir une façon d'ajouter une plante valide l'étape.
  if (ui.parcours === 'plantes') noteStep('plantes', 'done')
  setUi({
    placingSpeciesId: speciesId,
    placingCustomName: extra.customName,
    pendingPhotos: extra.photos,
    placingSeries: extra.series ? { count: 0 } : undefined,
    selectedPlantId: undefined,
    movingPlantId: undefined,
    placingSpot: undefined,
    tab: ui.tab === '3d' ? '3d' : 'carte',
    parcours: undefined,
  })
}

/** Arrête le placement ou le déplacement (bouton Annuler ou Terminé de la bannière). */
export function stopPlacing() {
  setUi({ placingSpeciesId: undefined, placingCustomName: undefined, pendingPhotos: undefined, placingSeries: undefined, movingPlantId: undefined, placingSpot: undefined })
}

/** « Déplacer cette plante » : un appui sur la carte donne le nouvel emplacement (sans glisser). Toujours sur la carte 2D. */
export function startMoving(plantId: string) {
  setUi({ movingPlantId: plantId, placingSpeciesId: undefined, placingCustomName: undefined, pendingPhotos: undefined, placingSeries: undefined, placingSpot: undefined, tab: 'carte' })
}

/** Ferme la fiche plante ; si elle a été ouverte par une entrée d'historique propre, revient en arrière (Retour ne la rouvre pas). */
export function closePlantSheet() {
  if (ui.selectedPlantId && readState()?.sheetOnly) history.back()
  else setUi({ selectedPlantId: undefined })
}

export function getUi() {
  return ui
}

// ---------- Aide de l'écran (feuille « ? ») ----------
// Ouverte depuis l'en-tête de bureau, la feuille du jardin ou Réglages : un seul état, tenu par App.
let helpOpen = false
const helpListeners = new Set<() => void>()
export function setHelpOpen(open: boolean) {
  if (helpOpen === open) return
  helpOpen = open
  helpListeners.forEach((l) => l())
}
export const openHelp = () => setHelpOpen(true)
export function useHelpOpen(): boolean {
  return useSyncExternalStore(
    (l) => {
      helpListeners.add(l)
      return () => helpListeners.delete(l)
    },
    () => helpOpen,
  )
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

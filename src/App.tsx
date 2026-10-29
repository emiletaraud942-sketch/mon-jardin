import { lazy, Suspense, useEffect, useRef } from 'react'
import { notifyDailyTasks } from './lib/notify'
import { Icon } from './components/Icon'
import { PageHead } from './components/PageHead'
import { SPECIES_BY_ID } from './data/species'
import { ErrorBoundary } from './components/ErrorBoundary'
import { HelpSheet } from './components/HelpSheet'
import { SubTabs } from './components/SubTabs'
import { StorageBanner } from './components/StorageBanner'
import { ToastHost } from './components/Toast'
import { UpdateBanner } from './components/UpdateBanner'
import { consumeExportReminder, exportCurrentState } from './lib/backup'
import { historyKeyHandler } from './lib/history'
import { PurchaseDialog } from './features/plants/PurchaseDialog'
import { getLoadWarnings, getState, useActiveGarden, useGardenPlants, useStore } from './lib/store'
import { showToast } from './lib/toast'
import { RAYON_LABEL, TAB_LABEL, getUi, goRayon, noteVisit, openHelp, openParcours, rayonOfTab, setGuide, setHelpOpen, setUi, subTabs, useHelpOpen, useUi, visibleRayons, type Rayon, type Tab } from './lib/ui'
import { useBanner } from './lib/banners'
import { deriveOnboarding } from './lib/onboarding'
import { Parcours } from './features/onboarding/Parcours'
import { Accueil } from './features/onboarding/Accueil'
import { useOnboarding } from './features/onboarding/useOnboarding'
import { shouldShowRoute } from './lib/onboarding'
import { isDemoGarden } from './features/settings/demo'
import { PlantsPage } from './features/plants/PlantsPage'
import { TasksPage } from './features/tasks/TasksPage'
import { useTasks } from './features/tasks/useTasks'
import { PlantingPage } from './features/planting/PlantingPage'
import { CataloguePage } from './features/plants/CataloguePage'
import { SettingsPage } from './features/settings/SettingsPage'
import { LegalModal } from './features/legal/LegalModal'
import { neighborsEnabled } from './lib/neighbors/enabled'
import { useNeighborsBadge } from './lib/neighbors/useBadge'
import { badgeAria, badgeLabel } from './lib/neighbors/news'
import { startPushBridge } from './lib/neighbors/pushBridge'
import { readRadius } from './features/neighbors/prefs'
import { useConsents } from './lib/consent'
import { InviteButton } from './components/InviteButton'
import { useScanUi } from './features/scan/scanUi'
import { usePanoUi } from './features/panorama/panoUi'
// En dernier : harmonisation Leafora (surcharge les feuilles de style des écrans ci-dessus), puis la navigation du téléphone (chantier D).
import './styles/leafora.css'
import './styles/mobile-nav.css'
import './styles/panorama.css'

const View3D = lazy(() => import('./features/garden3d/View3D'))
const NeighborsPage = lazy(() => import('./features/neighbors/NeighborsPage').then((m) => ({ default: m.NeighborsPage })))
const ScanHost = lazy(() => import('./features/scan/ScanHost'))
const PanoHost = lazy(() => import('./features/panorama/PanoHost'))
const MapView = lazy(() => import('./features/map/MapView').then((m) => ({ default: m.MapView })))

const Loading = ({ label }: { label: string }) => (
  <div className="empty">
    <span className="spinner" /> {label}
  </div>
)

/** Écrans qui, sur téléphone, ont l'en-tête minimal (titre en serif et une seule action : le profil, 52 px) à la place de la barre du haut.
 *  Plus de petite phrase ni de « ? » : l'aide est dans la feuille du jardin, les options de la carte et Réglages. */
const PHEAD_TABS: Tab[] = ['carte', '3d', 'plantes', 'planter', 'catalogue', 'voisins', 'reglages']

const RAYON_ICON: Record<Rayon, string> = { jardin: 'map', afaire: 'check', planter: 'leaf', voisins: 'users' }

/** Pastille de nouveautés de l'entraide (rien tant qu'il n'y a rien de nouveau). */
const NewsBadge = ({ count }: { count: number }) =>
  count > 0 ? (
    <span className="badge count" aria-label={badgeAria(count)}>
      {badgeLabel(count)}
    </span>
  ) : null

export function App() {
  const loaded = useStore((s) => s.loaded)
  const garden = useActiveGarden()
  const { tab, guide, parcours, placingSpeciesId, movingPlantId } = useUi()
  const plantCount = useGardenPlants(garden?.id).length
  const { tasks, weather, weatherLoading } = useTasks(garden)
  const { voisins } = useConsents()
  const newsCount = useNeighborsBadge(neighborsEnabled && voisins, readRadius)
  // Alertes de nouveaux messages : le service worker prévient l'appli ouverte (pastille, clic sur l'alerte).
  useEffect(() => (neighborsEnabled && voisins ? startPushBridge() : undefined), [voisins])
  // Ctrl/⌘ + Z : annuler ; Ctrl/⌘ + Maj + Z ou Ctrl + Y : rétablir (ignoré pendant la saisie dans un champ).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => void historyKeyHandler(e)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  const scanOpen = !!useScanUi().screen
  const panoOpen = !!usePanoUi().screen
  const onboarding = useOnboarding()
  const helpOpen = useHelpOpen()
  const mainRef = useRef<HTMLElement>(null)
  const firstPaint = useRef(true)
  const open = tasks.filter((t) => !t.blockedBy && !t.done).length
  const weatherReady = !weatherLoading && !!weather
  // Bandeau « jardin d'exemple » : un seul bandeau à la fois (file d'attente), jamais pendant un placement.
  const demoWants = !!garden && !parcours && isDemoGarden(garden) && !guide.demoHidden && tab !== 'accueil'
  const demoTurn = useBanner('exemple', demoWants)
  useEffect(() => {
    if (tasks.length) notifyDailyTasks(tasks, { weatherReady }).catch(() => undefined)
  }, [tasks, weatherReady])

  // Messages de démarrage : données corrigées, rappel d'export mensuel.
  useEffect(() => {
    if (!loaded) return
    if (getLoadWarnings().length > 0) showToast({ message: 'Certaines données ont été corrigées au démarrage. Le détail est dans Réglages.' })
    if (consumeExportReminder(getState().plants.length > 0, Date.now(), getState().plants.length)) {
      showToast({
        message: 'Pensez à faire une sauvegarde de vos données.',
        actionLabel: 'Faire une sauvegarde',
        onAction: () => {
          exportCurrentState()
          showToast({ message: 'Sauvegarde faite. Le fichier est dans vos téléchargements.' })
        },
        durationMs: 30000,
      })
    }
  }, [loaded])

  // Rien d'enregistré pour le parcours d'accueil : on l'initialise d'après les données. Un utilisateur qui a déjà un jardin et des plantes
  // est marqué « terminé » : aucun accueil forcé. L'état va dans l'état d'interface (localStorage), jamais dans IndexedDB.
  const gardenId = garden?.id
  useEffect(() => {
    if (loaded && garden && getUi().guide.onboarding === undefined) {
      setGuide({ onboarding: deriveOnboarding({ hasGarden: true, demo: isDemoGarden(garden), plantCount }) })
    }
    // Une seule fois par chargement : plantCount ne doit pas relancer le choix.
  }, [loaded, gardenId]) // eslint-disable-line react-hooks/exhaustive-deps
  // Mémorise les écrans déjà ouverts (alimente la jauge de conseil de l'accueil).
  useEffect(() => {
    if (loaded && gardenId) noteVisit(tab, gardenId)
  }, [loaded, gardenId, tab])

  // Titre de la page, et focus sur le contenu à chaque changement d'écran (lecteurs d'écran, clavier).
  useEffect(() => {
    document.title = garden ? `${TAB_LABEL[tab]} – PermaJardin` : 'PermaJardin'
  }, [tab, garden])
  useEffect(() => {
    if (!loaded || !garden) return
    if (firstPaint.current) {
      firstPaint.current = false
      return
    }
    mainRef.current?.focus({ preventScroll: true })
    // Seul le changement d'écran compte.
  }, [tab]) // eslint-disable-line react-hooks/exhaustive-deps

  const startNewGarden = () => openParcours('adresse')

  if (!loaded) {
    return (
      <div className="hero">
        <span className="spinner" role="status" aria-label="Chargement en cours" />
      </div>
    )
  }
  // Nouvel utilisateur (aucun jardin) ou parcours d'accueil ouvert : plein écran, sans barre de navigation.
  if (!garden || parcours) {
    return (
      <>
        <div className="overlay-stack">
          <StorageBanner />
        </div>
        <Parcours garden={garden} />
        <ToastHost />
        <LegalModal />
        {garden && scanOpen && (
          <Suspense fallback={null}>
            <ScanHost />
          </Suspense>
        )}
      </>
    )
  }

  const full = tab === 'carte' || tab === '3d'
  const rayon = rayonOfTab(tab)
  const tabs = subTabs(rayon)
  const rayons = visibleRayons(neighborsEnabled)
  const taskBadge = `${open} tâche${open > 1 ? 's' : ''} à faire`
  const phead = PHEAD_TABS.includes(tab)
  const pheadTitle: Record<string, string> = {
    carte: 'Ma carte',
    '3d': 'Vue 3D',
    plantes: `Mes plantes (${plantCount})`,
    planter: 'Où planter ?',
    catalogue: `Catalogue (${Object.keys(SPECIES_BY_ID).length})`,
    voisins: 'Voisins',
    reglages: 'Mon compte et réglages',
  }
  const placing = !!(placingSpeciesId || movingPlantId)

  return (
    <div className={'app' + (tab === 'accueil' || tab === 'entretien' || phead ? ' has-pagehead' : '') + (phead ? ' has-phead' : '') + (placing ? ' is-placing' : '') + (tab === 'accueil' && shouldShowRoute(onboarding.state, onboarding.neighbors) ? ' route-open' : '')}>
      <a
        className="skip-link"
        href="#main-panel"
        onClick={(e) => {
          e.preventDefault()
          mainRef.current?.focus()
        }}
      >
        Aller au contenu
      </a>
      <header className="topbar">
        <button className="brand brand-btn" aria-label="Accueil : que voulez-vous faire ?" aria-current={tab === 'accueil' ? 'page' : undefined} onClick={() => setUi({ tab: 'accueil' })}>
          <img src="/icon.svg" alt="" />
          <span>PermaJardin</span>
        </button>
        <div className="spacer" />
        <span className="garden-name" title={garden.name}>
          {garden.name}
        </span>
        <button className="btn help-btn" aria-haspopup="dialog" aria-label="Aide" onClick={openHelp}>
          <span className="help-mark" aria-hidden>
            ?
          </span>
          <span className="help-label">Aide</span>
        </button>
        <button className="btn profile-btn" aria-label="Mon compte et réglages" aria-current={tab === 'reglages' ? 'page' : undefined} onClick={() => setUi({ tab: 'reglages' })}>
          <Icon name="user" />
          <span className="hide-mobile">Mon compte</span>
        </button>
      </header>
      {phead && (
        <div className="phead-slot">
          <PageHead title={pheadTitle[tab]} compact home={tab !== 'reglages'} current={tab === 'reglages'} />
        </div>
      )}
      <div className="modebar">
        {tabs.length > 0 && <SubTabs tabs={tabs} current={tab} label={rayon === 'jardin' ? 'Écrans de Mon jardin' : 'Écrans de Planter'} />}
        {demoWants && demoTurn && (
          <div className="alert info demo-banner" role="status">
            <span>
              <strong>Ceci est un jardin d’exemple.</strong>
            </span>
            <button className="btn small primary" onClick={startNewGarden}>
              Créer mon vrai jardin
            </button>
            <button className="btn small ghost demo-close" aria-label="Fermer ce bandeau" onClick={() => setGuide({ demoHidden: true })}>
              <Icon name="x" size={16} />
            </button>
          </div>
        )}
      </div>
      <nav className="sidenav" aria-label="Navigation principale">
        <button className="navbtn" aria-current={tab === 'accueil' ? 'page' : undefined} onClick={() => setUi({ tab: 'accueil' })}>
          <Icon name="home" />
          Accueil
        </button>
        {rayons.map((r) => (
          <button key={r} className="navbtn" aria-current={rayon === r ? 'page' : undefined} onClick={() => goRayon(r)}>
            <Icon name={RAYON_ICON[r]} />
            {RAYON_LABEL[r]}
            {r === 'afaire' && open > 0 && (
              <span className="sr-only">{`, ${taskBadge}`}</span>
            )}
            {r === 'voisins' && <NewsBadge count={newsCount} />}
          </button>
        ))}
        <div className="sidenav-invite hide-mobile">
          <InviteButton className="btn small" label="Faire connaître l’appli" copyLabel="Copier le lien de l’appli" />
        </div>
      </nav>
      <main id="main-panel" ref={mainRef} tabIndex={-1} aria-label={TAB_LABEL[tab]} className={'main' + (full ? ' full' : '')}>
        <ErrorBoundary inline resetKey={tab}>
          {tab === 'accueil' && <Accueil garden={garden} openTasks={open} newsCount={newsCount} />}
          {tab === 'carte' && (
            <Suspense fallback={<Loading label="Chargement de la carte…" />}>
              <MapView garden={garden} />
            </Suspense>
          )}
          {tab === '3d' && (
            <ErrorBoundary inline resetKey={tab}>
              <Suspense fallback={<Loading label="Chargement de la Vue 3D…" />}>
                <View3D garden={garden} />
              </Suspense>
            </ErrorBoundary>
          )}
          {tab === 'plantes' && <PlantsPage garden={garden} />}
          {tab === 'entretien' && <TasksPage garden={garden} />}
          {tab === 'planter' && <PlantingPage garden={garden} />}
          {tab === 'catalogue' && <CataloguePage garden={garden} />}
          {tab === 'reglages' && <SettingsPage garden={garden} />}
          {tab === 'voisins' && neighborsEnabled && (
            <Suspense fallback={<Loading label="Chargement de l’entraide…" />}>
              <NeighborsPage garden={garden} />
            </Suspense>
          )}
        </ErrorBoundary>
      </main>
      <div className="overlay-stack">
        <UpdateBanner />
        <StorageBanner />
      </div>
      <ToastHost />
      <PurchaseDialog />
      <LegalModal />
      {scanOpen && (
        <Suspense fallback={null}>
          <ScanHost />
        </Suspense>
      )}
      {panoOpen && (
        <Suspense fallback={null}>
          <PanoHost />
        </Suspense>
      )}
      {helpOpen && <HelpSheet tab={tab} onClose={() => setHelpOpen(false)} />}
    </div>
  )
}

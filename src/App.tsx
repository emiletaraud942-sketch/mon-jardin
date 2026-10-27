import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { notifyDailyTasks } from './lib/notify'
import { Icon } from './components/Icon'
import { ErrorBoundary } from './components/ErrorBoundary'
import { HelpSheet } from './components/HelpSheet'
import { SubTabs } from './components/SubTabs'
import { StorageBanner } from './components/StorageBanner'
import { ToastHost } from './components/Toast'
import { UpdateBanner } from './components/UpdateBanner'
import { consumeExportReminder, exportCurrentState } from './lib/backup'
import { getLoadWarnings, getState, useActiveGarden, useGardenPlants, useStore } from './lib/store'
import { showToast } from './lib/toast'
import { RAYON_LABEL, TAB_LABEL, getUi, goRayon, noteVisit, openParcours, rayonOfTab, setGuide, setUi, subTabs, useUi, visibleRayons, type Rayon } from './lib/ui'
import { deriveOnboarding } from './lib/onboarding'
import { Parcours } from './features/onboarding/Parcours'
import { Accueil } from './features/onboarding/Accueil'
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

const View3D = lazy(() => import('./features/garden3d/View3D'))
const NeighborsPage = lazy(() => import('./features/neighbors/NeighborsPage').then((m) => ({ default: m.NeighborsPage })))
const ScanHost = lazy(() => import('./features/scan/ScanHost'))
const MapView = lazy(() => import('./features/map/MapView').then((m) => ({ default: m.MapView })))

const Loading = ({ label }: { label: string }) => (
  <div className="empty">
    <span className="spinner" /> {label}
  </div>
)

const RAYON_ICON: Record<Rayon, string> = { jardin: 'leaf', afaire: 'check', planter: 'sprout', voisins: 'users' }

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
  const { tab, guide, parcours } = useUi()
  const plantCount = useGardenPlants(garden?.id).length
  const { tasks, weather, weatherLoading } = useTasks(garden)
  const { voisins } = useConsents()
  const newsCount = useNeighborsBadge(neighborsEnabled && voisins, readRadius)
  // Alertes de nouveaux messages : le service worker prévient l'appli ouverte (pastille, clic sur l'alerte).
  useEffect(() => (neighborsEnabled && voisins ? startPushBridge() : undefined), [voisins])
  const scanOpen = !!useScanUi().screen
  const [helpOpen, setHelpOpen] = useState(false)
  const mainRef = useRef<HTMLElement>(null)
  const firstPaint = useRef(true)
  const open = tasks.filter((t) => !t.blockedBy && !t.done).length
  const weatherReady = !weatherLoading && !!weather
  useEffect(() => {
    if (tasks.length) notifyDailyTasks(tasks, { weatherReady }).catch(() => undefined)
  }, [tasks, weatherReady])

  // Messages de démarrage : données corrigées, rappel d'export mensuel.
  useEffect(() => {
    if (!loaded) return
    if (getLoadWarnings().length > 0) showToast({ message: 'Certaines données ont été corrigées au démarrage. Le détail est dans Réglages.' })
    if (consumeExportReminder(getState().plants.length > 0)) {
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

  return (
    <div className="app">
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
        <button className="btn help-btn" aria-haspopup="dialog" aria-label="Aide" onClick={() => setHelpOpen(true)}>
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
      <div className="modebar">
        {tabs.length > 0 && <SubTabs tabs={tabs} current={tab} label={rayon === 'jardin' ? 'Écrans de Mon jardin' : 'Écrans de Planter'} />}
        {isDemoGarden(garden) && !guide.demoHidden && tab !== 'accueil' && (
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
        {rayons.map((r) => (
          <button key={r} className="navbtn" aria-current={rayon === r ? 'page' : undefined} onClick={() => goRayon(r)}>
            <Icon name={RAYON_ICON[r]} />
            {RAYON_LABEL[r]}
            {r === 'afaire' && open > 0 && (
              <span className="badge count" aria-label={taskBadge}>
                {open}
              </span>
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
      <LegalModal />
      {scanOpen && (
        <Suspense fallback={null}>
          <ScanHost />
        </Suspense>
      )}
      {helpOpen && <HelpSheet tab={tab} onClose={() => setHelpOpen(false)} />}
    </div>
  )
}

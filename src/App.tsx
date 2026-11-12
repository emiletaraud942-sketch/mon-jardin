import { lazy, Suspense, useEffect, useMemo, useRef } from 'react'
import { notifyDailyTasks } from './lib/notify'
import { Icon } from './components/Icon'
import { PageHead } from './components/PageHead'
import { SPECIES_BY_ID } from './data/species'
import { ErrorBoundary } from './components/ErrorBoundary'
import { HelpSheet } from './components/HelpSheet'
import { ToutFaire } from './features/aide/ToutFaire'
import { FeatureHost } from './features/aide/FeatureHost'
import { LostButton, LostSheet } from './features/aide/Perdu'
import { Guide } from './features/aide/Guide'
import { Visite } from './features/aide/Visite'
import { tourSeen } from './lib/featureTour'
import { conseilsOpen, ennuisOpen, guideOpen, leconsOpen, lostSheet, rotationOpen, toutFaire, tourOpen } from './lib/overlays'
import { SubTabs, type SubTabExtra } from './components/SubTabs'
import { FEATURES } from './lib/features'
import { StorageBanner } from './components/StorageBanner'
import { ToastHost } from './components/Toast'
import { UpdateBanner } from './components/UpdateBanner'
import { OfflineChip } from './components/OfflineChip'
import { consumeExportReminder, exportCurrentState } from './lib/backup'
import { historyKeyHandler } from './lib/history'
import { PurchaseDialog } from './features/plants/PurchaseDialog'
import { getLoadWarnings, getState, useActiveGarden, useGardenPlants, useStore } from './lib/store'
import { showToast } from './lib/toast'
import { useAutoSyncState } from './lib/autoSync'
import { RAYON_LABEL, RAYON_SHORT, TAB_LABEL, getUi, goRayon, noteVisit, openHelp, openParcours, rayonOfTab, setGuide, setHelpOpen, setUi, subTabs, useHelpOpen, useUi, visibleRayons, type Rayon, type Tab } from './lib/ui'
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
import { TasksProvider } from './features/tasks/TasksProvider'
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
import './styles/facile.css'

const NeighborsPage = lazy(() => import('./features/neighbors/NeighborsPage').then((m) => ({ default: m.NeighborsPage })))
const ScanHost = lazy(() => import('./features/scan/ScanHost'))
const PanoHost = lazy(() => import('./features/panorama/PanoHost'))
const EnnuisScreen = lazy(() => import('./features/ravageurs/EnnuisScreen'))
const ConseilsScreen = lazy(() => import('./features/conseils/ConseilsScreen'))
const LeconsScreen = lazy(() => import('./features/lecons/LeconsScreen'))
const RotationScreen = lazy(() => import('./features/rotation/RotationScreen'))
const MapView = lazy(() => import('./features/map/MapView').then((m) => ({ default: m.MapView })))

const Loading = ({ label }: { label: string }) => (
  <div className="empty">
    <span className="spinner" /> {label}
  </div>
)

/** Écrans qui, sur téléphone, ont l'en-tête minimal (titre en serif et une seule action : le profil, 52 px) à la place de la barre du haut.
 *  Plus de petite phrase ni de « ? » : l'aide est dans la feuille du jardin, les options de la carte et Réglages. */
/** « Mon jardin » : la visite en photos, à côté de la carte et des plantes (même fonction que le bouton de l'accueil). */
const PHOTOS_EXTRA: SubTabExtra = {
  label: 'Photos',
  name: 'Visiter mon jardin en photos',
  feat: 'sous-onglet-photos',
  onClick: () => FEATURES.find((f) => f.id === 'visite-photos')?.run(),
}

const PHEAD_TABS: Tab[] = ['carte', 'plantes', 'planter', 'catalogue', 'voisins', 'reglages']

const RAYON_ICON: Record<Rayon, string> = { jardin: 'map', afaire: 'check', planter: 'leaf', voisins: 'users' }

/** Pastille de nouveautés de l'entraide (rien tant qu'il n'y a rien de nouveau). */
const NewsBadge = ({ count }: { count: number }) =>
  count > 0 ? (
    <span className="badge count" aria-label={badgeAria(count)}>
      {badgeLabel(count)}
    </span>
  ) : null

export function App() {
  const garden = useActiveGarden()
  return (
    <TasksProvider garden={garden}>
      <AppShell />
    </TasksProvider>
  )
}

const SYNC_CONFIGURED = !!import.meta.env.VITE_SUPABASE_URL && !!import.meta.env.VITE_SUPABASE_ANON_KEY

function AppShell() {
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
  const toutOpen = toutFaire.use()
  const lostOpen = lostSheet.use()
  const guideShown = guideOpen.use()
  const tourShown = tourOpen.use()
  const ennuisShown = ennuisOpen.use()
  const conseilsShown = conseilsOpen.use()
  const leconsShown = leconsOpen.use()
  const rotationShown = rotationOpen.use()
  const mainRef = useRef<HTMLElement>(null)
  const firstPaint = useRef(true)
  const open = tasks.filter((t) => !t.blockedBy && !t.done).length
  const weatherReady = !weatherLoading && !!weather
  // Alertes de jardin actives (canicule, sécheresse, vent fort) : une phrase sur l'accueil.
  const alertKinds = useMemo(() => tasks.flatMap((t) => (t.alert && !t.blockedBy && !t.done ? [t.alert] : [])), [tasks])
  // Bandeau « jardin d'exemple » : un seul bandeau à la fois (file d'attente), jamais pendant un placement.
  const demoWants = !!garden && !parcours && isDemoGarden(garden) && !guide.demoHidden && tab !== 'accueil'
  const demoTurn = useBanner('exemple', demoWants)
  useEffect(() => {
    if (tasks.length) notifyDailyTasks(tasks, { weatherReady }).catch(() => undefined)
  }, [tasks, weatherReady])

  // Une plante vient d'être ajoutée alors que l'appareil n'est pas connecté à la copie en ligne : on le dit une fois par lancement (« Plus tard » sur l'accueil
  // fait taire aussi ce rappel). Sans cela, on découvre trop tard que rien n'a été sauvegardé en ligne.
  const autoState = useAutoSyncState()
  const lastPlantTotal = useRef<number>()
  const remindedSync = useRef(false)
  const plantTotal = useStore((s) => s.plants.length)
  useEffect(() => {
    if (!loaded) return
    const prev = lastPlantTotal.current
    lastPlantTotal.current = plantTotal
    if (prev === undefined || plantTotal <= prev || remindedSync.current) return
    if (!SYNC_CONFIGURED || autoState.status !== 'inactif' || (guide.syncNudgeUntil ?? 0) > Date.now()) return
    if (garden && isDemoGarden(garden)) return
    remindedSync.current = true
    showToast({
      message: 'Cette plante n’est pas encore sauvegardée en ligne.',
      actionLabel: 'Me connecter',
      onAction: () => FEATURES.find((f) => f.id === 'synchro')?.run(),
      durationMs: 12000,
    })
  }, [plantTotal, loaded]) // eslint-disable-line react-hooks/exhaustive-deps

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
    // Après une flèche ←/→ dans les onglets, le focus reste sur l'onglet : on ne le prend pas.
    if (document.activeElement?.closest('[role="tablist"]')) return
    mainRef.current?.focus({ preventScroll: true })
    // Seul le changement d'écran compte.
  }, [tab]) // eslint-disable-line react-hooks/exhaustive-deps

  // Visite des fonctions : une seule fois, sur l'accueil, une fois le jardin créé (jamais pendant le parcours de départ).
  useEffect(() => {
    if (!loaded || !gardenId || parcours || tab !== 'accueil' || tourSeen()) return
    const t = window.setTimeout(() => {
      if (!tourSeen()) tourOpen.set(true)
    }, 700)
    return () => window.clearTimeout(t)
  }, [loaded, gardenId, parcours, tab])

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

  const full = tab === 'carte'
  const rayon = rayonOfTab(tab)
  const tabs = subTabs(rayon)
  const rayons = visibleRayons(neighborsEnabled)
  const taskBadge = `${open} tâche${open > 1 ? 's' : ''} à faire`
  const phead = PHEAD_TABS.includes(tab)
  const pheadTitle: Record<string, string> = {
    carte: 'Ma carte',
    plantes: `Mes plantes (${plantCount})`,
    planter: 'Où planter ?',
    catalogue: `Catalogue (${Object.keys(SPECIES_BY_ID).length})`,
    voisins: 'Voisins',
    reglages: 'Mon compte et réglages',
  }
  const placing = !!(placingSpeciesId || movingPlantId)

  return (
    <div data-tab={tab} className={'app' + (tab === 'accueil' || tab === 'entretien' || phead ? ' has-pagehead' : '') + (phead ? ' has-phead' : '') + (placing ? ' is-placing' : '') + (tab === 'accueil' && shouldShowRoute(onboarding.state, onboarding.neighbors) ? ' route-open' : '')}>
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
        <button className="btn help-btn tout-btn" aria-haspopup="dialog" aria-label="Tout ce que je peux faire" onClick={() => toutFaire.set(true)}>
          <Icon name="list" />
          <span className="help-label" aria-hidden>
            Tout
          </span>
        </button>
        <button className="btn help-btn" aria-haspopup="dialog" aria-label="Aide" onClick={openHelp}>
          <Icon name="help" />
          <span className="help-label" aria-hidden>
            Aide
          </span>
        </button>
        <button className="btn profile-btn" aria-label="Compte et réglages" aria-current={tab === 'reglages' ? 'page' : undefined} onClick={() => setUi({ tab: 'reglages' })}>
          <Icon name="user" />
          <span aria-hidden>Compte</span>
        </button>
      </header>
      {phead && (
        <div className="phead-slot">
          <PageHead title={pheadTitle[tab]} compact home={tab !== 'reglages'} current={tab === 'reglages'} onHelp={openHelp} />
        </div>
      )}
      <div className="modebar">
        {tabs.length > 0 && <SubTabs tabs={tabs} current={tab} label={rayon === 'jardin' ? 'Écrans de Mon jardin' : 'Écrans de Planter'} extra={rayon === 'jardin' ? PHOTOS_EXTRA : undefined} />}
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
            {RAYON_SHORT[r] ? (
              <>
                <span className="nav-long">{RAYON_LABEL[r]}</span>
                <span className="nav-short">{RAYON_SHORT[r]}</span>
              </>
            ) : (
              RAYON_LABEL[r]
            )}
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
          {tab === 'accueil' && <Accueil garden={garden} openTasks={open} newsCount={newsCount} alerts={alertKinds} />}
          {tab === 'carte' && (
            <Suspense fallback={<Loading label="Chargement de la carte…" />}>
              <MapView garden={garden} />
            </Suspense>
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
      <OfflineChip />
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
      <FeatureHost />
      {lostOpen && <LostSheet />}
      {toutOpen && <ToutFaire />}
      {guideShown && <Guide />}
      {ennuisShown && (
        <Suspense fallback={null}>
          <EnnuisScreen initialId={ennuisShown.id} />
        </Suspense>
      )}
      {conseilsShown && (
        <Suspense fallback={null}>
          <ConseilsScreen initialId={conseilsShown.id} />
        </Suspense>
      )}
      {leconsShown && (
        <Suspense fallback={null}>
          <LeconsScreen initialId={leconsShown.id} />
        </Suspense>
      )}
      {rotationShown && (
        <Suspense fallback={null}>
          <RotationScreen />
        </Suspense>
      )}
      {tourShown && <Visite />}
      <LostButton />
    </div>
  )
}

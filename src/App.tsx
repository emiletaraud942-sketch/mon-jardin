import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { notifyDailyTasks } from './lib/notify'
import { Icon } from './components/Icon'
import { ErrorBoundary } from './components/ErrorBoundary'
import { HelpSheet } from './components/HelpSheet'
import { Modal } from './components/Modal'
import { ModeSwitch } from './components/ModeSwitch'
import { ProgressCard } from './components/ProgressCard'
import { StorageBanner } from './components/StorageBanner'
import { ToastHost } from './components/Toast'
import { UpdateBanner } from './components/UpdateBanner'
import { consumeExportReminder, exportCurrentState } from './lib/backup'
import { getLoadWarnings, getState, setActiveGarden, useActiveGarden, useGardenPlants, useStore } from './lib/store'
import { showToast } from './lib/toast'
import { ALWAYS_TABS, MODE_TABS, TAB_LABEL, applyDefaultMode, noteVisit, setUi, useUi, type Mode, type Tab } from './lib/ui'
import { Onboarding } from './features/settings/Onboarding'
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
import { readRadius } from './features/neighbors/prefs'
import { useConsents } from './lib/consent'
import { InviteButton } from './components/InviteButton'

const View3D = lazy(() => import('./features/garden3d/View3D'))
const NeighborsPage = lazy(() => import('./features/neighbors/NeighborsPage').then((m) => ({ default: m.NeighborsPage })))
const MapView = lazy(() => import('./features/map/MapView').then((m) => ({ default: m.MapView })))

const Loading = ({ label }: { label: string }) => (
  <div className="empty">
    <span className="spinner" /> {label}
  </div>
)

const NAV_ICON: Record<Tab, string> = {
  carte: 'map',
  '3d': 'cube',
  plantes: 'leaf',
  entretien: 'check',
  planter: 'sprout',
  catalogue: 'book',
  reglages: 'settings',
  voisins: 'users',
}
const NAV: Record<Tab, { label: string; icon: string }> = Object.fromEntries((Object.keys(TAB_LABEL) as Tab[]).map((t) => [t, { label: TAB_LABEL[t], icon: NAV_ICON[t] }])) as Record<Tab, { label: string; icon: string }>
/** Libellés plus longs du menu. « Sauvegarde et réglages » passe en tête : c'est ce que l'on cherche le plus. */
const MORE_LABEL: Partial<Record<Tab, string>> = { catalogue: 'Catalogue des plantes', reglages: 'Sauvegarde et réglages', voisins: 'Entraide entre voisins' }
const MORE_FIRST: Tab[] = ['reglages']

/** Catalogue et Réglages restent accessibles dans tous les modes : barre du bas si le mode les contient, sinon menu. */
const extraTabs = (mode: Mode) => ALWAYS_TABS.filter((t) => !MODE_TABS[mode].includes(t) && (t !== 'voisins' || neighborsEnabled))
const menuTabs = (mode: Mode) => [...extraTabs(mode)].sort((a, b) => Number(MORE_FIRST.includes(b)) - Number(MORE_FIRST.includes(a)))

const NEW_GARDEN = '__new'

/** Pastille de nouveautés de l'entraide (rien tant qu'il n'y a rien de nouveau). */
const NewsBadge = ({ count }: { count: number }) =>
  count > 0 ? (
    <span className="badge count" aria-label={badgeAria(count)}>
      {badgeLabel(count)}
    </span>
  ) : null

function MoreSheet({ onClose, onNewGarden, newsCount }: { onClose: () => void; onNewGarden: () => void; newsCount: number }) {
  const { tab, mode } = useUi()
  const go = (t: Tab) => {
    onClose()
    setUi({ tab: t })
  }
  return (
    <Modal title="Menu" sheet onClose={onClose}>
      <div className="stack more-list">
        {menuTabs(mode).map((t) => (
          <button key={t} className="btn more-item" aria-current={tab === t ? 'page' : undefined} onClick={() => go(t)}>
            <Icon name={NAV[t].icon} /> {MORE_LABEL[t] ?? NAV[t].label}
            {t === 'voisins' && <NewsBadge count={newsCount} />}
          </button>
        ))}
        <button
          className="btn more-item"
          onClick={() => {
            onClose()
            onNewGarden()
          }}
        >
          <Icon name="plus" /> Nouveau jardin
        </button>
        <InviteButton className="btn more-item" label="Faire connaître l’appli" copyLabel="Copier le lien de l’appli" />
      </div>
    </Modal>
  )
}

export function App() {
  const loaded = useStore((s) => s.loaded)
  const gardens = useStore((s) => s.gardens)
  const garden = useActiveGarden()
  const { tab, mode, placingSpeciesId } = useUi()
  const plantCount = useGardenPlants(garden?.id).length
  const { tasks, weather, weatherLoading } = useTasks(garden)
  const { voisins } = useConsents()
  const newsCount = useNeighborsBadge(neighborsEnabled && voisins, readRadius)
  const [moreOpen, setMoreOpen] = useState(false)
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

  // Premier lancement sans mode mémorisé : « Mon jardin » s'il y a peu de plantes, sinon « Entretenir ».
  const gardenId = garden?.id
  useEffect(() => {
    if (loaded && gardenId) applyDefaultMode(plantCount)
    // Une seule fois par chargement : plantCount ne doit pas relancer le choix.
  }, [loaded, gardenId]) // eslint-disable-line react-hooks/exhaustive-deps
  // Mémorise les écrans déjà ouverts (alimente la jauge et le mode conseillé).
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

  const startNewGarden = () => setUi({ tab: 'reglages', newGarden: true })

  if (!loaded) {
    return (
      <div className="hero">
        <span className="spinner" role="status" aria-label="Chargement en cours" />
      </div>
    )
  }
  if (!garden) {
    return (
      <>
        <div className="overlay-stack">
          <StorageBanner />
        </div>
        <Onboarding />
        <ToastHost />
        <LegalModal />
      </>
    )
  }

  const full = tab === 'carte' || tab === '3d'

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
        <div className="brand">
          <img src="/icon.svg" alt="" />
          <span>PermaJardin</span>
        </div>
        <div className="spacer" />
        {gardens.length > 1 ? (
          <select
            className="input garden-select"
            aria-label="Jardin affiché"
            value={garden.id}
            onChange={(e) => (e.target.value === NEW_GARDEN ? startNewGarden() : setActiveGarden(e.target.value))}
          >
            {gardens.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
            <option value={NEW_GARDEN}>+ Nouveau jardin…</option>
          </select>
        ) : (
          <span className="garden-name" title={garden.name}>
            {garden.name}
          </span>
        )}
        <button className="btn small hide-mobile" onClick={startNewGarden}>
          <Icon name="plus" size={16} /> Nouveau jardin
        </button>
        <button className="btn help-btn" aria-haspopup="dialog" onClick={() => setHelpOpen(true)}>
          <span className="help-mark" aria-hidden>
            ?
          </span>{' '}
          Aide
        </button>
      </header>
      <div className="modebar">
        <ModeSwitch mode={mode} openTasks={open} />
        {mode === 'jardin' && MODE_TABS.jardin.includes(tab) && !placingSpeciesId && (
          <div className="guide">
            <ProgressCard garden={garden} />
          </div>
        )}
        {isDemoGarden(garden) && (
          <div className="alert info demo-banner" role="status">
            <span>
              <strong>Ceci est un jardin d’exemple.</strong>
            </span>
            <button className="btn small primary" onClick={startNewGarden}>
              Créer mon vrai jardin
            </button>
          </div>
        )}
      </div>
      <nav className="sidenav" aria-label="Navigation principale">
        {MODE_TABS[mode].map((t) => (
          <button key={t} className="navbtn" aria-current={tab === t ? 'page' : undefined} onClick={() => setUi({ tab: t })}>
            <Icon name={NAV[t].icon} />
            {NAV[t].label}
            {t === 'entretien' && open > 0 && (
              <span className="badge count" aria-label={`${open} tâche${open > 1 ? 's' : ''} à faire`}>
                {open}
              </span>
            )}
          </button>
        ))}
        {extraTabs(mode).map((t) => (
          <button key={t} className="navbtn hide-mobile" aria-current={tab === t ? 'page' : undefined} onClick={() => setUi({ tab: t })}>
            <Icon name={NAV[t].icon} />
            {NAV[t].label}
            {t === 'voisins' && <NewsBadge count={newsCount} />}
          </button>
        ))}
        <div className="sidenav-invite hide-mobile">
          <InviteButton className="btn small" label="Faire connaître l’appli" copyLabel="Copier le lien de l’appli" />
        </div>
        <button
          className="navbtn show-mobile"
          aria-haspopup="dialog"
          aria-current={extraTabs(mode).includes(tab) ? 'page' : undefined}
          onClick={() => setMoreOpen(true)}
        >
          <Icon name="menu" />
          Menu
          {extraTabs(mode).includes('voisins') && <NewsBadge count={newsCount} />}
        </button>
      </nav>
      <main id="main-panel" ref={mainRef} tabIndex={-1} aria-label={TAB_LABEL[tab]} className={'main' + (full ? ' full' : '')}>
        <ErrorBoundary inline resetKey={tab}>
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
      {helpOpen && <HelpSheet tab={tab} onClose={() => setHelpOpen(false)} />}
      {moreOpen && <MoreSheet onClose={() => setMoreOpen(false)} onNewGarden={startNewGarden} newsCount={newsCount} />}
    </div>
  )
}

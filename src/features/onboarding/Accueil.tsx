import { Icon } from '../../components/Icon'
import { InstallHint } from '../../components/InstallButton'
import { StepButton } from '../../components/StepButton'
import { useProgress } from '../../components/useProgress'
import { badgeAria, badgeLabel } from '../../lib/neighbors/news'
import { activeSteps, chezTitle, currentStep, percentDone, settledCount, shouldShowRoute, stepStatus, STEP_HINT, STEP_TITLE } from '../../lib/onboarding'
import { suggestedMode } from '../../lib/progress'
import { useGardenPlants } from '../../lib/store'
import { goRayon, hideOnboardingRoute, openParcours, setUi, visibleRayons, RAYON_LABEL, type Rayon } from '../../lib/ui'
import type { Garden } from '../../types'
import { isDemoGarden } from '../settings/demo'
import { useOnboarding } from './useOnboarding'

const RAYON_ICON: Record<Rayon, string> = { jardin: 'leaf', afaire: 'check', planter: 'sprout', voisins: 'users' }
const RAYON_TEXT: Record<Rayon, string> = {
  jardin: 'Carte, vue 3D, mes plantes',
  afaire: 'Entretien et météo',
  planter: 'Où planter, catalogue',
  voisins: 'Dons, questions, événements',
}

/** « Votre jardin en 5 étapes » : jauge, étape en cours, reprise à tout moment. */
function RouteCard() {
  const { state, neighbors } = useOnboarding()
  const steps = activeSteps(neighbors)
  const done = settledCount(state, neighbors)
  const current = currentStep(state, neighbors)
  return (
    <section className="card route" aria-label={`Votre jardin en ${steps.length} étapes`}>
      <h2>Votre jardin en {steps.length} étapes</h2>
      <p className="route-count">
        {done} étape{done > 1 ? 's' : ''} faite{done > 1 ? 's' : ''} sur {steps.length}
      </p>
      <span className="gauge route-gauge" role="progressbar" aria-label="Étapes faites" aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={done}>
        <span style={{ width: `${percentDone(state, neighbors)}%` }} />
      </span>
      <ol className="route-list">
        {steps.map((id, k) => {
          const st = stepStatus(state, id)
          return (
            <li key={id} className={(id === current ? 'current ' : '') + st}>
              <button className="route-step" onClick={() => openParcours(id)}>
                <span className="route-num" aria-hidden>
                  {st === 'done' ? '✓' : st === 'skipped' ? '–' : k + 1}
                </span>
                <span className="route-text">
                  <strong>{STEP_TITLE[id]}</strong>
                  <span className="muted small">{st === 'skipped' ? 'Passée. Touchez pour la faire.' : STEP_HINT[id]}</span>
                </span>
                <span className="sr-only">{st === 'done' ? ' : fait' : st === 'skipped' ? ' : passée' : ' : à faire'}</span>
              </button>
            </li>
          )
        })}
      </ol>
      <div className="stack" style={{ gap: 8 }}>
        <button className="btn primary big" onClick={() => openParcours(current ?? 'auto')}>
          Continuer
        </button>
        <button className="btn ghost" onClick={hideOnboardingRoute}>
          Passer et découvrir l’appli
        </button>
      </div>
    </section>
  )
}

/** Écran « Que voulez-vous faire ? » : 4 grosses cartes, le résumé du jardin et, au début, la carte de route. */
export function Accueil({ garden, openTasks, newsCount }: { garden: Garden; openTasks: number; newsCount: number }) {
  const { state, neighbors } = useOnboarding()
  const plants = useGardenPlants(garden.id)
  const progress = useProgress(garden)
  const route = shouldShowRoute(state, neighbors)
  const advice = suggestedMode(progress) === 'entretenir' && !isDemoGarden(garden)
  const tip = !route ? progress.next : undefined
  const tasksText = openTasks === 0 ? 'rien à faire' : `${openTasks} chose${openTasks > 1 ? 's' : ''} à faire`

  return (
    <div className="page accueil">
      {route && <RouteCard />}
      <h1>Que voulez-vous faire ?</h1>
      <button className="card chez" onClick={() => setUi({ tab: 'carte' })}>
        <span className="chez-title">{chezTitle(garden.name)}</span>
        <span className="chez-sum">
          {plants.length} plante{plants.length > 1 ? 's' : ''} · {tasksText}
        </span>
      </button>
      <div className="rayons">
        {visibleRayons().map((r) => (
          <button key={r} className="rayon-card" onClick={() => goRayon(r)}>
            <span className="rayon-icon" aria-hidden>
              <Icon name={RAYON_ICON[r]} size={28} />
            </span>
            <span className="rayon-text">
              <strong>{RAYON_LABEL[r]}</strong>
              <span className="muted">{RAYON_TEXT[r]}</span>
            </span>
            {r === 'afaire' && openTasks > 0 && (
              <span className="badge count" aria-label={`${openTasks} tâche${openTasks > 1 ? 's' : ''} à faire`}>
                {openTasks}
              </span>
            )}
            {r === 'afaire' && advice && <span className="badge green">Conseillé</span>}
            {r === 'voisins' && newsCount > 0 && (
              <span className="badge count" aria-label={badgeAria(newsCount)}>
                {badgeLabel(newsCount)}
              </span>
            )}
          </button>
        ))}
      </div>
      {tip && (
        <div className="card next-step">
          <span className="small">
            <span className="muted">Conseil :</span> <strong>{tip.label}</strong>
          </span>
          <StepButton step={tip} garden={garden} />
        </div>
      )}
      <InstallHint />
    </div>
  )
}

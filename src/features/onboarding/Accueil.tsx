import { Icon } from '../../components/Icon'
import { PageHead } from '../../components/PageHead'
import { PlantPot } from '../../components/illustrations'
import { InstallHint } from '../../components/InstallButton'
import { StepButton } from '../../components/StepButton'
import { useProgress } from '../../components/useProgress'
import { badgeAria, badgeLabel } from '../../lib/neighbors/news'
import { activeSteps, chezTitle, currentStep, settledCount, shouldShowRoute, stepStatus, STEP_HINT, STEP_TITLE } from '../../lib/onboarding'
import { suggestedMode } from '../../lib/progress'
import { useGardenPlants } from '../../lib/store'
import { goRayon, hideOnboardingRoute, openParcours, setUi, visibleRayons, RAYON_LABEL, type Rayon } from '../../lib/ui'
import type { Garden } from '../../types'
import { isDemoGarden } from '../settings/demo'
import { useOnboarding } from './useOnboarding'

const RAYON_ICON: Record<Rayon, string> = { jardin: 'map', afaire: 'check', planter: 'leaf', voisins: 'users' }
const RAYON_TEXT: Record<Rayon, string> = {
  jardin: 'Carte, vue 3D, mes plantes',
  afaire: 'Entretien et météo',
  planter: 'Où planter, catalogue',
  voisins: 'Dons, questions, événements',
}

/** Prénom lu dans « Chez Marie » (rien si le nom du jardin n'a pas cette forme). */
const firstName = (gardenName: string) => gardenName.trim().match(/^chez\s+(.+)$/i)?.[1]

/** « Votre jardin en 5 étapes » : jauge, fil des étapes, étape en cours dans une carte, reprise à tout moment. */
function RouteCard({ garden }: { garden: Garden }) {
  const { state, neighbors } = useOnboarding()
  const steps = activeSteps(neighbors)
  const done = settledCount(state, neighbors)
  const current = currentStep(state, neighbors)
  const who = firstName(garden.name)
  return (
    <section className="route" aria-label={`Votre jardin en ${steps.length} étapes`}>
      <p className="pagehead-kicker">{who ? `Bienvenue, ${who}` : 'Bienvenue'}</p>
      <h2>Votre jardin en {steps.length} étapes</h2>
      <span className="gauge route-gauge" role="progressbar" aria-label="Étapes faites" aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={done}>
        {steps.map((id, k) => (
          <i key={id} className={k < done ? 'on' : undefined} />
        ))}
      </span>
      <p className="route-count">
        {done} étape{done > 1 ? 's' : ''} faite{done > 1 ? 's' : ''} sur {steps.length}
      </p>
      <ol className="route-list">
        {steps.map((id, k) => {
          const st = stepStatus(state, id)
          const now = id === current
          const num = (
            <span className="route-num" aria-hidden>
              {st === 'done' ? <Icon name="check" size={20} weight={2.4} /> : st === 'skipped' ? '–' : k + 1}
            </span>
          )
          return (
            <li key={id} className={(now ? 'current ' : '') + st}>
              {num}
              {now ? (
                <div className="route-now">
                  <h3>{STEP_TITLE[id]}</h3>
                  <p>{STEP_HINT[id]}</p>
                  <button className="route-go" onClick={() => openParcours(id)}>
                    Continuer
                  </button>
                </div>
              ) : (
                <button className="route-step" onClick={() => openParcours(id)}>
                  <span className="route-text">
                    <strong>{STEP_TITLE[id]}</strong>
                    <span>{st === 'skipped' ? 'Passée. Touchez pour la faire.' : STEP_HINT[id]}</span>
                  </span>
                  <span className="sr-only">{st === 'done' ? ' : fait' : st === 'skipped' ? ' : passée' : ' : à faire'}</span>
                </button>
              )}
            </li>
          )
        })}
      </ol>
      <button className="route-skip" onClick={hideOnboardingRoute}>
        Passer et découvrir l’appli
      </button>
    </section>
  )
}

/** Écran « Que voulez-vous faire ? » : 4 grosses cartes, le résumé du jardin et, au début, la carte de route. */
export function Accueil({ garden, openTasks, newsCount, onHelp }: { garden: Garden; openTasks: number; newsCount: number; onHelp?: () => void }) {
  const { state, neighbors } = useOnboarding()
  const plants = useGardenPlants(garden.id)
  const progress = useProgress(garden)
  const route = shouldShowRoute(state, neighbors)
  const advice = suggestedMode(progress) === 'entretenir' && !isDemoGarden(garden)
  const tip = !route ? progress.next : undefined
  const who = firstName(garden.name)
  const tasksText = openTasks === 0 ? 'rien à faire' : `${openTasks} chose${openTasks > 1 ? 's' : ''} à faire`

  return (
    <div className="page accueil">
      {route && <RouteCard garden={garden} />}
      <PageHead kicker={who ? `Bonjour ${who}` : 'Bonjour'} title="Que voulez-vous faire ?" />
      <button className="chez" onClick={() => setUi({ tab: 'carte' })}>
        <span className="chez-title">{chezTitle(garden.name)}</span>
        <span className="chez-sum">
          <span>
            {plants.length} plante{plants.length > 1 ? 's' : ''}
          </span>
          <span>{tasksText}</span>
        </span>
        <PlantPot size={150} className="chez-art" />
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
      {onHelp && (
        <button className="accueil-help" aria-haspopup="dialog" onClick={onHelp}>
          Besoin d’aide ?
        </button>
      )}
    </div>
  )
}

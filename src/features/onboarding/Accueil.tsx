import { Icon } from '../../components/Icon'
import { PageHead } from '../../components/PageHead'
import { PlantPot } from '../../components/illustrations'
import { PlaceAction } from '../../components/PlaceAction'
import { useProgress } from '../../components/useProgress'
import { nextStep, type NextStep } from '../../lib/progress'
import { isDemoGarden } from '../settings/demo'
import { useRefreshGarden } from '../settings/useRefreshGarden'
import { badgeAria, badgeLabel } from '../../lib/neighbors/news'
import { activeSteps, chezTitle, currentStep, settledCount, shouldShowRoute, stepStatus, STEP_HINT, STEP_TITLE, type OnboardingStepId } from '../../lib/onboarding'
import { useGardenPlants } from '../../lib/store'
import { goRayon, hideOnboardingRoute, openParcours, setUi, visibleRayons, RAYON_LABEL, type Rayon } from '../../lib/ui'
import type { Garden } from '../../types'
import { useOnboarding } from './useOnboarding'

const RAYON_ICON: Record<Rayon, string> = { jardin: 'map', afaire: 'check', planter: 'leaf', voisins: 'users' }
const RAYON_TEXT: Record<Rayon, string> = {
  jardin: 'Carte, vue 3D, mes plantes',
  afaire: 'Entretien et météo',
  planter: 'Conseils et catalogue',
  voisins: 'Dons, questions, événements',
}

/** Prénom lu dans « Chez Marie » (rien si le nom du jardin n'a pas cette forme). */
const firstName = (gardenName: string) => gardenName.trim().match(/^chez\s+(.+)$/i)?.[1]

/** Phrase d'une étape faite : le résultat (« Trouvée : 12 rue des Lilas »), sinon la phrase d'invitation. */
function doneHint(id: OnboardingStepId, garden: Garden): string {
  if (id === 'adresse') {
    const street = garden.address.split(/\s\d{5}\b/)[0].trim()
    if (street) return `Trouvée : ${street}`
  }
  if (id === 'terrain') return 'Photo et limites vérifiées'
  return STEP_HINT[id]
}

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
                    <span>{st === 'skipped' ? 'Passée. Touchez pour la faire.' : st === 'done' ? doneHint(id, garden) : STEP_HINT[id]}</span>
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

/**
 * « Prochaine étape » : une seule suggestion, calculée par `nextStep` d'après le jardin (jamais bloquante).
 * Carte discrète : un titre, une phrase, un bouton. Rien quand il n'y a rien à proposer.
 */
function NextStepCard({ garden, openTasks }: { garden: Garden; openTasks: number }) {
  const progress = useProgress(garden)
  const refresh = useRefreshGarden(garden)
  const step: NextStep | undefined = nextStep(progress, { demo: isDemoGarden(garden), openTasks })
  if (!step) return null
  const cls = 'btn small primary nextstep-btn'
  return (
    <section className="nextstep" aria-label="Prochaine étape">
      <span className="nextstep-icon" aria-hidden>
        <Icon name="leaf" size={22} />
      </span>
      <div className="nextstep-text">
        <p className="pagehead-kicker">Prochaine étape</p>
        <h2>{step.title}</h2>
        <p className="nextstep-why">{step.text}</p>
      </div>
      {step.kind === 'placer' ? (
        <PlaceAction className={cls}>{step.action}</PlaceAction>
      ) : (
        <button
          className={cls}
          disabled={step.kind === 'donnees' && refresh.busy}
          onClick={() => {
            if (step.kind === 'creer') openParcours('adresse')
            else if (step.kind === 'sol') setUi({ tab: 'reglages' })
            else if (step.kind === 'taches') setUi({ tab: 'entretien' })
            else void refresh.refresh()
          }}
        >
          {step.kind === 'donnees' && refresh.busy ? <span className="spinner" /> : null} {step.action}
        </button>
      )}
    </section>
  )
}

/** Écran « Que voulez-vous faire ? » : 4 grosses cartes, le résumé du jardin et, au début, la carte de route. */
export function Accueil({ garden, openTasks, newsCount }: { garden: Garden; openTasks: number; newsCount: number }) {
  const { state, neighbors } = useOnboarding()
  const plants = useGardenPlants(garden.id)
  const route = shouldShowRoute(state, neighbors)
  const who = firstName(garden.name)
  const tasksText = openTasks === 0 ? 'rien à faire' : `${openTasks} chose${openTasks > 1 ? 's' : ''} à faire`

  return (
    <div className="page accueil">
      {route && <RouteCard garden={garden} />}
      <PageHead compact kicker={who ? `Bonjour ${who}` : 'Bonjour'} title="Que voulez-vous faire ?" />
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
      {!route && <NextStepCard garden={garden} openTasks={openTasks} />}
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
            {r === 'voisins' && newsCount > 0 && (
              <span className="badge count" aria-label={badgeAria(newsCount)}>
                {badgeLabel(newsCount)}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}

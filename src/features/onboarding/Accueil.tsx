import { Icon } from '../../components/Icon'
import { ALERT_ICON, alertHomeSentence, type AlertKind } from '../../engine/alerts'
import { climateSummary } from '../../engine/climate'
import { PageHead } from '../../components/PageHead'
import { PlantPot } from '../../components/illustrations'
import { PlaceAction } from '../../components/PlaceAction'
import { useProgress } from '../../components/useProgress'
import { nextStep, type NextStep } from '../../lib/progress'
import { demoHomeTitle, isDemoGarden } from '../settings/demo'
import { useRefreshGarden } from '../settings/useRefreshGarden'
import { badgeAria, badgeLabel } from '../../lib/neighbors/news'
import { activeSteps, chezTitle, currentStep, settledCount, shouldShowRoute, stepStatus, STEP_HINT, STEP_TITLE, type OnboardingStepId } from '../../lib/onboarding'
import { useGardenPlants } from '../../lib/store'
import { hideOnboardingRoute, openHelp, openParcours, setGuide, setUi, useUi } from '../../lib/ui'
import { FEATURES, visibleFeatures } from '../../lib/features'
import { HOME_ACTIONS, HOME_HELPERS, type HomeAction } from '../../lib/homeActions'
import { guideOpen, lostSheet, toutFaire } from '../../lib/overlays'
import type { Garden } from '../../types'
import { useOnboarding } from './useOnboarding'

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
  const { guide } = useUi()
  const noTree = !!guide.noTree?.includes(garden.id)
  const step: NextStep | undefined = nextStep(progress, { demo: isDemoGarden(garden), openTasks, noTree })
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
      {step.noTreeChoice && (
        <button className="nextstep-skip" onClick={() => setGuide({ noTree: [...(guide.noTree ?? []), garden.id] })}>
          Je n’ai pas d’arbre
        </button>
      )}
    </section>
  )
}

/** Lance un gros bouton : une fonction du registre, ou une page d'aide. Un seul appui depuis l'accueil. */
export function runHomeAction(a: HomeAction) {
  if (a.special === 'tout') toutFaire.set(true)
  else if (a.special === 'guide') guideOpen.set(true)
  else if (a.special === 'perdu') lostSheet.set(true)
  else FEATURES.find((f) => f.id === a.featureId)?.run()
}

/** Un gros bouton de l'accueil : une icône, un verbe, une phrase. Le nom accessible est le texte écrit. */
function HomeButton({ a, badge }: { a: HomeAction; badge?: number }) {
  return (
    <button className={'home-btn' + (a.primary ? ' primary' : '')} data-home={a.id} onClick={() => runHomeAction(a)}>
      <span className="home-btn-icon" aria-hidden>
        <Icon name={a.icon} size={24} />
      </span>
      <span className="home-btn-text">
        <strong>{a.mot}</strong>
        <span>{a.phrase}</span>
      </span>
      {badge ? (
        <span className="badge count" aria-label={badgeAria(badge)}>
          {badgeLabel(badge)}
        </span>
      ) : null}
    </button>
  )
}

/** Écran « Que voulez-vous faire ? » : le résumé du jardin, la prochaine étape, puis de gros boutons étiquetés, dans un ordre fixe. */
export function Accueil({ garden, openTasks, newsCount, alerts = [] }: { garden: Garden; openTasks: number; newsCount: number; alerts?: AlertKind[] }) {
  const { state, neighbors } = useOnboarding()
  const plants = useGardenPlants(garden.id)
  const route = shouldShowRoute(state, neighbors)
  const who = firstName(garden.name)
  const tasksText = openTasks === 0 ? 'rien à faire' : `${openTasks} chose${openTasks > 1 ? 's' : ''} à faire`
  const shown = new Set(visibleFeatures().map((f) => f.id))
  const actions = HOME_ACTIONS.filter((a) => !a.featureId || shown.has(a.featureId))
  const climate = climateSummary(garden, { short: true })
  const alertText = alertHomeSentence(alerts)

  return (
    <div className="page accueil">
      {route && <RouteCard garden={garden} />}
      <PageHead compact kicker={who ? `Bonjour ${who}` : 'Bonjour'} title="Que voulez-vous faire ?" onHelp={openHelp} />
      <button className={'chez' + (climate ? ' has-climate' : '')} onClick={() => setUi({ tab: 'carte' })}>
        <span className="chez-title">{demoHomeTitle(garden, chezTitle(garden.name))}</span>
        <span className="chez-sum">
          {plants.length} plante{plants.length > 1 ? 's' : ''}
          {'\u00a0· '}
          {tasksText}
        </span>
        {climate && <span className="chez-climate">{climate}</span>}
        <PlantPot size={64} className="chez-art" />
      </button>
      {alertText && (
        <button className="home-alert" data-home-alert onClick={() => setUi({ tab: 'entretien' })}>
          <Icon name={alerts.length > 1 ? 'alert' : ALERT_ICON[alerts[0]]} size={20} />
          <span>{alertText}</span>
          <Icon name="forward" size={18} />
        </button>
      )}
      {!route && <NextStepCard garden={garden} openTasks={openTasks} />}
      <div className="home-grid" role="group" aria-label="Que voulez-vous faire ?">
        {actions.map((a) => (
          <HomeButton key={a.id} a={a} badge={a.id === 'voisins' ? newsCount : undefined} />
        ))}
        {HOME_HELPERS.map((a) => (
          <HomeButton key={a.id} a={a} />
        ))}
      </div>
    </div>
  )
}

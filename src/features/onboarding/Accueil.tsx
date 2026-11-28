import { Icon } from '../../components/Icon'
import { ALERT_ICON, alertHomeSentence, type AlertKind } from '../../engine/alerts'
import { PlantPot } from '../../components/illustrations'
import { PlaceAction } from '../../components/PlaceAction'
import { useProgress } from '../../components/useProgress'
import { nextStep, type NextStep } from '../../lib/progress'
import { isDemoGarden } from '../settings/demo'
import { useRefreshGarden } from '../settings/useRefreshGarden'
import { badgeAria, badgeLabel } from '../../lib/neighbors/news'
import { activeSteps, currentStep, settledCount, shouldShowRoute, stepStatus, STEP_HINT, STEP_TITLE, type OnboardingStepId } from '../../lib/onboarding'
import { useGardenPlants } from '../../lib/store'
import { PageHead } from '../../components/PageHead'
import { hideOnboardingRoute, openHelp, openParcours, setGuide, setUi, useUi } from '../../lib/ui'
import { FEATURES, visibleFeatures } from '../../lib/features'
import { HOME_ACTIONS, HOME_HELPERS, type HomeAction } from '../../lib/homeActions'
import { guideOpen, homeHub, homeHubStart, lostSheet, openLecon, toutFaire } from '../../lib/overlays'
import { hubById } from '../../lib/hubs'
import { HubPage, LeafHome } from './HubScreens'
import { countDone, doneSentence, nextLesson, totalLessons } from '../lecons/progress'
import { useLessonsDone } from '../lecons/useDone'
import type { Garden } from '../../types'
import { useOnboarding } from './useOnboarding'
import { autoSyncMessage, autoSyncReconcile, useAutoSyncState } from '../../lib/autoSync'
import { useEffect, useState } from 'react'

const syncConfigured = !!import.meta.env.VITE_SUPABASE_URL && !!import.meta.env.VITE_SUPABASE_ANON_KEY
const SYNC_NUDGE_SNOOZE_MS = 2 * 24 * 3600 * 1000

/**
 * Invitation à mettre ses jardins (et ses photos) en sécurité en ligne : la copie se met alors à jour toute seule à chaque modification.
 * Seulement si la synchro existe, si l'appareil n'est pas connecté (ou n'a pas donné son accord), hors jardin d'exemple et hors parcours de départ.
 * « Plus tard » la cache 7 jours. Attend 3 s avant de s'afficher : au démarrage la synchro vérifie d'abord si l'appareil est déjà connecté.
 */
function SyncNudge({ garden }: { garden: Garden }) {
  const auto = useAutoSyncState()
  const { guide } = useUi()
  const plants = useGardenPlants(garden.id)
  const [ready, setReady] = useState(false)
  useEffect(() => {
    const t = window.setTimeout(() => setReady(true), 3000)
    return () => window.clearTimeout(t)
  }, [])
  // Connecté : une petite ligne d'état permanente (à jour, en cours, hors ligne, échec avec « Réessayer », conflit).
  if (syncConfigured && auto.status !== 'inactif') {
    const bad = auto.status === 'erreur' || auto.status === 'conflit'
    return (
      <div className="home-sync" data-status={auto.status} data-feat="synchro-etat" role="status">
        <Icon name={bad ? 'alert' : 'check'} size={16} />
        <span>{autoSyncMessage(auto)}</span>
        {auto.status === 'erreur' && (
          <button className="btn small ghost" onClick={() => autoSyncReconcile()}>
            Réessayer
          </button>
        )}
        {auto.status === 'conflit' && (
          <button className="btn small ghost" onClick={() => FEATURES.find((f) => f.id === 'synchro')?.run()}>
            Choisir
          </button>
        )}
      </div>
    )
  }
  if (!syncConfigured || !ready || auto.status !== 'inactif' || (plants.length === 0 && !(garden.panoramas?.length)) || isDemoGarden(garden)) return null
  if ((guide.syncNudgeUntil ?? 0) > Date.now()) return null
  return (
    <section className="nextstep syncnudge" aria-label="Copie en ligne" data-feat="synchro-invite">
      <span className="nextstep-icon" aria-hidden>
        <Icon name="share" size={22} />
      </span>
      <div className="nextstep-text">
        <h2>Gardez vos jardins en sécurité</h2>
        <p className="nextstep-why">Avec votre e-mail, plantes et photos se copient en ligne toutes seules. Retrouvez-les sur un autre appareil.</p>
      </div>
      <div className="syncnudge-actions">
        <button className="btn small primary" onClick={() => FEATURES.find((f) => f.id === 'synchro')?.run()}>
          Me connecter
        </button>
        <button className="btn small ghost" onClick={() => setGuide({ syncNudgeUntil: Date.now() + SYNC_NUDGE_SNOOZE_MS })}>
          Plus tard
        </button>
      </div>
    </section>
  )
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
  const { guide } = useUi()
  const noTree = !!guide.noTree?.includes(garden.id)
  const lessonsDone = useLessonsDone()
  const step: NextStep | undefined = nextStep(progress, { demo: isDemoGarden(garden), openTasks, noTree, nextLesson: nextLesson(lessonsDone) })
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
            else if (step.kind === 'lecon') openLecon(step.lessonId)
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

/** Sous « Apprendre à jardiner » : la phrase d'origine au départ, puis où on en est (jamais plus de 36 caractères). */
export function lessonsPhrase(done: readonly string[]): string | undefined {
  const n = countDone(done)
  if (n === 0) return undefined
  if (n >= totalLessons()) return 'Tout est fait. Bravo !'
  return `${doneSentence(done)}. On continue ?`
}

/** Les quatre actions du quotidien, en tuiles (refonte du 16 nov.). Libellé court à l'écran ; le nom accessible reste le mot complet du registre (il le contient). */
const TILE_IDS = ['ajouter', 'carte', 'afaire', 'planter']

function HomeTile({ a }: { a: HomeAction }) {
  return (
    <button className={'home-tile' + (a.primary ? ' primary' : '')} data-home={a.id} aria-label={a.mot} onClick={() => runHomeAction(a)}>
      <span className="home-tile-icon" aria-hidden>
        <Icon name={a.icon} size={24} />
      </span>
      <span className="home-tile-text">
        <span className="home-tile-label">{a.mot}</span>
        <span className="home-tile-sub">{a.phrase}</span>
      </span>
      <span className="home-tile-chev" aria-hidden>
        <span style={{ display: 'inline-flex', transform: 'rotate(-90deg)' }}>
          <Icon name="chevron" size={16} />
        </span>
      </span>
    </button>
  )
}

/** « À la une » : une grande carte vert profond (leçons), avec l'illustration du pot. Toute la carte est le bouton. */
function HomeFeature({ a, phrase }: { a: HomeAction; phrase?: string }) {
  return (
    <button className="home-feature" data-home={a.id} onClick={() => runHomeAction(a)}>
      <img className="home-feature-photo" src="/plantes/lavande.jpg" alt="" loading="lazy" onError={(e) => (e.currentTarget.style.display = 'none')} />
      <span className="home-feature-kicker">À la une</span>
      <strong className="home-feature-title">{a.mot}</strong>
      <span className="home-feature-text">{phrase ?? a.phrase}</span>
      <span className="home-feature-pill" aria-hidden>
        Commencer
      </span>
      <PlantPot size={104} className="home-feature-art" />
    </button>
  )
}

/** Un gros bouton de l'accueil : une icône, un verbe, une phrase. Le nom accessible est le texte écrit. */
function HomeButton({ a, badge, phrase }: { a: HomeAction; badge?: number; phrase?: string }) {
  return (
    <button className={'home-btn' + (a.primary ? ' primary' : '') + (a.featured ? ' featured' : '')} data-home={a.id} onClick={() => runHomeAction(a)}>
      <span className="home-btn-icon" aria-hidden>
        <Icon name={a.icon} size={24} />
      </span>
      <span className="home-btn-text">
        <strong>{a.mot}</strong>
        <span>{phrase ?? a.phrase}</span>
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
  const route = shouldShowRoute(state, neighbors)
  const who = firstName(garden.name)
  const shown = new Set(visibleFeatures().map((f) => f.id))
  const actions = HOME_ACTIONS.filter((a) => !a.featureId || shown.has(a.featureId))
  const alertText = alertHomeSentence(alerts)
  const lessonsDone = useLessonsDone()
  const byId = (id: string) => actions.find((a) => a.id === id)
  const tiles = TILE_IDS.map(byId).filter((a): a is HomeAction => !!a)
  const partage = byId('partage')
  const feature = byId('apprendre')
  const rest = actions.filter((a) => !TILE_IDS.includes(a.id) && a.id !== 'partage' && a.id !== 'apprendre')

  const hub = homeHub.use()
  if (hub === 'cultiver' || hub === 'entretenir' || hub === 'consommer') return <HubPage hub={hubById(hub)} garden={garden} />
  if (hub !== 'plus') {
    return (
      <div className="page accueil accueil-leaf">
        <LeafHome who={who} alertText={alertText} onAlert={() => setUi({ tab: 'entretien' })} onHelp={openHelp} />
        {route && <RouteCard garden={garden} />}
        {!route && <SyncNudge garden={garden} />}
        {!route && <NextStepCard garden={garden} openTasks={openTasks} />}
      </div>
    )
  }

  // « Plus de choses » : trois gros choix, puis toutes les actions derrière « Toutes les actions » (ouvert pour les recettes : `pj.homePlus`).
  const more = [
    { id: 'compte', mot: 'Mon compte et réglages', phrase: 'Texte, sauvegardes, jardins, vie privée.', icon: 'user', run: () => setUi({ tab: 'reglages' }) },
    { id: 'guide', mot: 'Je ne sais pas par où commencer', phrase: 'Quelques questions, une à la fois.', icon: 'help', run: () => guideOpen.set(true) },
    { id: 'tout', mot: 'Tout ce que je peux faire', phrase: 'Chaque fonction, avec recherche.', icon: 'list', run: () => toutFaire.set(true) },
  ]
  return (
    <div className="page accueil accueil-plus">
      <button className="hub-back" onClick={() => homeHub.set(undefined)}>
        <span style={{ display: 'inline-flex', transform: 'rotate(90deg)' }}>
          <Icon name="chevron" size={20} />
        </span>
        Accueil
      </button>
      <PageHead compact title="Plus de choses" onHelp={openHelp} />
      {alertText && (
        <button className="home-alert" data-home-alert onClick={() => setUi({ tab: 'entretien' })}>
          <Icon name={alerts.length > 1 ? 'alert' : ALERT_ICON[alerts[0]]} size={20} />
          <span>{alertText}</span>
          <Icon name="forward" size={18} />
        </button>
      )}
      <div className="hub-cards">
        {more.map((m) => (
          <button key={m.id} className="hub-card" data-more-card={m.id} onClick={m.run}>
            <span className="hub-card-icon" aria-hidden>
              <Icon name={m.icon} size={26} />
            </span>
            <span className="hub-card-text">
              <strong>{m.mot}</strong>
              <span>{m.phrase}</span>
            </span>
          </button>
        ))}
      </div>
      <details className="np-details home-all" open={homeHubStart() === 'plus'}>
        <summary>Toutes les actions</summary>
        <div className="home-tiles" role="group" aria-label="Les actions du quotidien">
          {tiles.map((a) => (
            <HomeTile key={a.id} a={a} />
          ))}
        </div>
        {partage && (
          <div className="home-grid home-grid-solo">
            <HomeButton a={partage} />
          </div>
        )}
        {feature && <HomeFeature a={feature} phrase={lessonsPhrase(lessonsDone)} />}
        <div className="home-grid" role="group" aria-label="Que voulez-vous faire ?">
          {rest.map((a) => (
            <HomeButton key={a.id} a={a} badge={a.id === 'voisins' ? newsCount : undefined} />
          ))}
          {HOME_HELPERS.map((a) => (
            <HomeButton key={a.id} a={a} />
          ))}
        </div>
      </details>
    </div>
  )
}

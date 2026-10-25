import { NUDGE_SNOOZE_MS, setGuide, setMode, useUi } from '../lib/ui'
import { suggestedMode } from '../lib/progress'
import { FirstSteps } from './FirstSteps'
import { Icon } from './Icon'
import { StepButton } from './StepButton'
import { useProgress } from './useProgress'
import type { Garden } from '../types'

/**
 * Jauge « Mon jardin : 3 étapes sur 5 » en haut de « Mon jardin ». Une ligne ; elle déplie (par-dessus l'écran, sans le redimensionner)
 * la prochaine étape et la checklist « Premiers pas ». Propose discrètement de passer à l'entretien quand le jardin est prêt.
 */
export function ProgressCard({ garden }: { garden: Garden }) {
  const { guide } = useUi()
  const progress = useProgress(garden)
  const open = guide.progressOpen
  const nudge = suggestedMode(progress) === 'entretenir' && Date.now() >= guide.nudgeUntil
  return (
    <section
      className="progresscard"
      aria-label="Avancement de votre jardin"
      onKeyDown={(e) => {
        if (e.key === 'Escape' && open) {
          e.stopPropagation()
          setGuide({ progressOpen: false })
        }
      }}
    >
      <button className="guide-toggle" aria-expanded={open} aria-controls="progress-body" onClick={() => setGuide({ progressOpen: !open })}>
        <span className="gauge-label">
          Mon jardin : <strong>{progress.doneCount} étapes sur {progress.total}</strong>
        </span>
        <span className="gauge" role="progressbar" aria-label="Étapes faites" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.doneCount}>
          <span style={{ width: `${progress.percent}%` }} />
        </span>
        <span className={'chev' + (open ? ' up' : '')} aria-hidden>
          <Icon name="chevron" size={18} />
        </span>
      </button>
      {nudge && (
        <div className="nudge" role="status">
          <span className="small">Votre jardin est bien avancé. Passer à l’entretien ?</span>
          <div className="row">
            <button className="btn small primary" onClick={() => setMode('entretenir')}>
              Entretenir
            </button>
            <button className="btn small ghost" onClick={() => setGuide({ nudgeUntil: Date.now() + NUDGE_SNOOZE_MS })}>
              Plus tard
            </button>
          </div>
        </div>
      )}
      {open && (
        <div id="progress-body" className="progress-body">
          {progress.next ? (
            <div className="next-step">
              <span className="small">
                <span className="muted">Prochaine étape :</span> <strong>{progress.next.label}</strong>
              </span>
              <StepButton step={progress.next} garden={garden} />
            </div>
          ) : (
            <p style={{ margin: 0 }}>
              Toutes les étapes sont faites. Bravo !
            </p>
          )}
          <FirstSteps garden={garden} />
        </div>
      )}
    </section>
  )
}

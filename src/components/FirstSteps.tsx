import { firstSteps } from '../lib/progress'
import { setGuide, useUi } from '../lib/ui'
import { Icon } from './Icon'
import { StepButton } from './StepButton'
import { useProgress } from './useProgress'
import type { Garden } from '../types'

/**
 * Checklist « Premiers pas » : cases cochées d'après l'avancement réel. Repliable ; « Masquer pour l'instant »
 * la cache (elle revient depuis l'aide). Purement facultative.
 */
export function FirstSteps({ garden }: { garden: Garden }) {
  const { guide } = useUi()
  const progress = useProgress(garden)
  if (guide.stepsHidden) return null
  const steps = firstSteps(progress)
  const done = steps.filter((s) => s.done).length
  const nextId = steps.find((s) => !s.done)?.id
  const open = guide.stepsOpen
  return (
    <section className="firststeps" aria-label="Premiers pas">
      <button className="guide-toggle" aria-expanded={open} aria-controls="firststeps-list" onClick={() => setGuide({ stepsOpen: !open })}>
        <strong>Premiers pas en 3 étapes</strong>
        <span className="muted small">
          {done} sur {steps.length}
        </span>
        <span className={'chev' + (open ? ' up' : '')} aria-hidden>
          <Icon name="chevron" size={18} />
        </span>
      </button>
      {open && (
        <>
          <ul className="steps-list" id="firststeps-list">
            {steps.map((s) => (
              <li key={s.id} className={s.done ? 'done' : undefined}>
                <span className="check" aria-hidden>
                  {s.done ? '✓' : ''}
                </span>
                <span className="steps-text">
                  <span className="steps-label">
                    {s.label}
                    <span className="sr-only">{s.done ? ' : fait' : ' : à faire'}</span>
                  </span>
                  {s.id === nextId && <span className="muted small">{s.hint}</span>}
                </span>
                <StepButton step={s} />
              </li>
            ))}
          </ul>
          <div className="row guide-foot">
            <span className="muted small" style={{ flex: 1 }}>
              Facultatif : passez ce qui ne vous sert pas.
            </span>
            <button className="btn small ghost" onClick={() => setGuide({ stepsHidden: true })}>
              Masquer pour l’instant
            </button>
          </div>
        </>
      )}
    </section>
  )
}

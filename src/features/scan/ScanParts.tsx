import { TechDetails } from '../../components/ErrorNote'
import { gpsMessage, QUALITY_HELP, QUALITY_LABEL, type GpsProblem, gpsQualityOf } from './gps'
import type { GpsState } from './useGps'

/** Problème de position, en une phrase, avec ce qu'il faut faire et « Détails » replié. */
export function GpsProblemNote({ problem }: { problem: GpsProblem }) {
  const m = gpsMessage(problem)
  return (
    <div className="alert error small" role="alert">
      <span>
        <strong>{m.message}</strong>
        {m.help && <> {m.help}</>}
      </span>
      <TechDetails detail={m.detail} />
    </div>
  )
}

const TONE = { bonne: 'green', moyenne: 'warn', faible: 'danger' } as const

/** Jauge de mesure : avancement, puis qualité du signal (texte et couleur, jamais la couleur seule). */
export function GpsMeter({ state, hideWhenDone }: { state: GpsState; hideWhenDone?: boolean }) {
  if (state.status === 'repos' || state.status === 'erreur' || (hideWhenDone && state.status === 'ok')) return null
  const pct = Math.round(state.progress * 100)
  const q = state.accuracy !== undefined ? gpsQualityOf(state.accuracy) : undefined
  return (
    <div className="scan-meter" role="status" aria-live="polite">
      <div className="gauge" role="progressbar" aria-label="Mesure de la position" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
        <span style={{ width: `${pct}%` }} />
      </div>
      <p className="small" style={{ margin: 0 }}>
        {state.status === 'mesure' ? 'Mesure en cours. Restez immobile.' : 'Mesure terminée.'}{' '}
        {q ? (
          <>
            <span className={'badge ' + TONE[q]}>{QUALITY_LABEL[q]}</span> <span className="muted">{QUALITY_HELP[q]}</span>
          </>
        ) : (
          <span className="muted">En attente du signal…</span>
        )}
      </p>
    </div>
  )
}

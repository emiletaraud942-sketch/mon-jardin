import { dismissToast, pauseToast, resumeToast, runToastAction, useToasts, type Toast } from '../lib/toast'
import { useUi } from '../lib/ui'
import { Icon } from './Icon'

function ToastItem({ t }: { t: Toast }) {
  const pause = () => pauseToast(t.id)
  const resume = () => resumeToast(t.id)
  return (
    <div
      className={'toast' + (t.tone === 'error' ? ' error' : '')}
      // Le compte à rebours s'arrête tant qu'on lit, qu'on survole ou qu'on touche le message.
      onMouseEnter={pause}
      onMouseLeave={resume}
      onFocus={pause}
      onBlur={resume}
      onPointerDown={pause}
      onPointerUp={(e) => e.pointerType === 'mouse' || resume()}
      onPointerCancel={resume}
    >
      <span className="toast-msg">{t.message}</span>
      {t.actionLabel && (
        <button className="btn small toast-action" onClick={() => runToastAction(t.id)}>
          {t.actionLabel}
        </button>
      )}
      <button className="btn ghost small icon-btn" aria-label="Fermer le message" onClick={() => dismissToast(t.id)}>
        <Icon name="x" size={18} />
      </button>
    </div>
  )
}

/**
 * Zone d'affichage des messages (une seule, montée dans App). Un seul message d'information à la fois, le plus récent :
 * les autres attendent leur tour (ils ne cachent plus la barre du bas ni la feuille du jardin). Les erreurs sont annoncées tout de suite et restent affichées.
 */
export function ToastHost() {
  const toasts = useToasts()
  const { placingSpeciesId, movingPlantId } = useUi()
  // Pendant un placement, la consigne (Valider, Annuler) reste libre : les messages d'information attendent la fin.
  const info = placingSpeciesId || movingPlantId ? [] : toasts.filter((t) => t.tone !== 'error')
  const current = info[info.length - 1]
  return (
    <div className="toast-host">
      <div className="toast-list" role="status" aria-live="polite" aria-atomic="false">
        {current && <ToastItem key={current.id} t={current} />}
      </div>
      <div className="toast-list" role="alert" aria-atomic="false">
        {toasts
          .filter((t) => t.tone === 'error')
          .map((t) => (
            <ToastItem key={t.id} t={t} />
          ))}
      </div>
    </div>
  )
}

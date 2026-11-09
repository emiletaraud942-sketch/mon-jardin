import { useEffect, useRef } from 'react'
import { useModalOpen } from '../lib/modalOpen'
import { dismissToast, getToasts, pauseToast, resumeToast, runToastAction, useToasts, type Toast } from '../lib/toast'
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
  const { placingSpeciesId, movingPlantId, tab } = useUi()
  // Changer d'écran ferme les messages d'information ; ceux qui ont « Annuler » et les erreurs restent.
  const lastTab = useRef(tab)
  useEffect(() => {
    if (lastTab.current === tab) return
    lastTab.current = tab
    for (const t of getToasts()) if (t.tone !== 'error' && !t.actionLabel) dismissToast(t.id)
  }, [tab])
  // Une boîte de dialogue est ouverte (ex. « Comment l'avez-vous achetée ? ») : les messages se cachent et leur compte à rebours s'arrête ;
  // ils reviennent à la fermeture, avec leur « Annuler » (dessous, ils étaient à moitié cachés et inatteignables).
  const modal = useModalOpen()
  const pausedByModal = useRef(new Set<number>())
  useEffect(() => {
    if (modal) {
      for (const t of toasts) {
        if (!pausedByModal.current.has(t.id)) {
          pausedByModal.current.add(t.id)
          pauseToast(t.id)
        }
      }
    } else {
      for (const id of pausedByModal.current) resumeToast(id)
      pausedByModal.current.clear()
    }
  }, [modal, toasts])
  // Pendant un placement, la consigne (Valider, Annuler) reste libre : les messages d'information attendent la fin.
  const info = modal || placingSpeciesId || movingPlantId ? [] : toasts.filter((t) => t.tone !== 'error')
  const current = info[info.length - 1]
  // Marge basse : tant qu'un message est affiché, la page garde de la place pour ne pas cacher « Fait ».
  const errors = modal ? [] : toasts.filter((t) => t.tone === 'error')
  const showing = !!current || errors.length > 0
  useEffect(() => {
    document.documentElement.toggleAttribute('data-toast', showing)
    return () => document.documentElement.removeAttribute('data-toast')
  }, [showing])
  return (
    <div className="toast-host">
      <div className="toast-list" role="status" aria-live="polite" aria-atomic="false">
        {current && <ToastItem key={current.id} t={current} />}
      </div>
      <div className="toast-list" role="alert" aria-atomic="false">
        {errors.map((t) => (
          <ToastItem key={t.id} t={t} />
        ))}
      </div>
    </div>
  )
}

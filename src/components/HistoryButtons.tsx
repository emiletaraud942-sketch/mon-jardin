import { redoWithToast, undoWithToast, useHistory } from '../lib/history'

/** Boutons ↶ ↷ (annuler / rétablir), toujours là, grisés quand il n'y a rien à faire. */
export function HistoryButtons({ className = '' }: { className?: string }) {
  const history = useHistory()
  return (
    <span className={`history-btns ${className}`.trim()} role="group" aria-label="Historique">
      <button
        className="btn small icon-btn"
        disabled={!history.canUndo}
        aria-label={history.canUndo ? `Annuler : ${history.undoLabel}` : 'Annuler (rien à annuler)'}
        title="Annuler (Ctrl+Z)"
        onClick={undoWithToast}
      >
        <span aria-hidden>↶</span>
      </button>
      <button
        className="btn small icon-btn"
        disabled={!history.canRedo}
        aria-label={history.canRedo ? `Rétablir : ${history.redoLabel}` : 'Rétablir (rien à rétablir)'}
        title="Rétablir (Ctrl+Maj+Z)"
        onClick={redoWithToast}
      >
        <span aria-hidden>↷</span>
      </button>
    </span>
  )
}

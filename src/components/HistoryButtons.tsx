import { redoWithToast, undoWithToast, useHistory } from '../lib/history'
import { Icon } from './Icon'

/** Boutons « Annuler » et « Rétablir », toujours là, grisés quand il n'y a rien à faire. Le mot est écrit à côté de la flèche. */
export function HistoryButtons({ className = '' }: { className?: string }) {
  const history = useHistory()
  return (
    <span className={`history-btns ${className}`.trim()} role="group" aria-label="Annuler ou rétablir" data-feat="historique">
      <button
        className="btn small history-btn"
        disabled={!history.canUndo}
        aria-label={history.canUndo ? `Annuler : ${history.undoLabel}` : 'Annuler (rien à annuler)'}
        title="Annuler (Ctrl+Z)"
        onClick={undoWithToast}
      >
        <Icon name="undo" size={18} />
        <span aria-hidden>Annuler</span>
      </button>
      <button
        className="btn small history-btn"
        disabled={!history.canRedo}
        aria-label={history.canRedo ? `Rétablir : ${history.redoLabel}` : 'Rétablir (rien à rétablir)'}
        title="Rétablir (Ctrl+Maj+Z)"
        onClick={redoWithToast}
      >
        <Icon name="redo" size={18} />
        <span aria-hidden>Rétablir</span>
      </button>
    </span>
  )
}

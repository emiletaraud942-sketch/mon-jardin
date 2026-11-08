import { useState } from 'react'
import { Icon } from '../../components/Icon'
import { Modal } from '../../components/Modal'
import { goHome } from '../../lib/goHome'
import { undoWithToast, useHistory } from '../../lib/history'
import { ReadScreenButton } from '../../components/ReadScreenButton'
import { helpExtraNow, HELP_EXTRA, helpFor } from '../../lib/help'
import { guideOpen, lostSheet, toutFaire } from '../../lib/overlays'
import { getUi, openHelp } from '../../lib/ui'
import { RUN_DELAY_MS } from './ToutFaire'

/** Petit bouton fixe, toujours visible : « Je suis perdu ». */
export function LostButton() {
  return (
    <button className="lost-fab" aria-haspopup="dialog" onClick={() => lostSheet.set(true)}>
      <Icon name="help" size={20} />
      <span>Je suis perdu</span>
    </button>
  )
}

/** Feuille d'aide : trois gros boutons, puis « Tout ce que je peux faire ». */
export function LostSheet() {
  const history = useHistory()
  // L'écran dessous la feuille : le même texte que l'aide de cet écran.
  const [help] = useState(() => {
    const extra = helpExtraNow()
    return extra ? HELP_EXTRA[extra] : helpFor(getUi().tab)
  })
  /** Ferme la feuille, puis agit (le Retour d'Android a fini de retirer l'entrée d'historique de la feuille). */
  const then = (action: () => void) => {
    lostSheet.set(false)
    window.setTimeout(action, RUN_DELAY_MS)
  }
  return (
    <Modal title="Vous êtes perdu ?" sheet feat="perdu" onClose={() => lostSheet.set(false)}>
      <div className="stack lost-body">
        <p className="muted" style={{ margin: 0 }}>
          Pas de souci. Touchez ce qu’il vous faut.
        </p>
        <button className="btn primary lost-big" onClick={() => then(goHome)}>
          <Icon name="home" /> Retour à l’accueil
        </button>
        <button className="btn lost-big" disabled={!history.canUndo} onClick={() => then(undoWithToast)}>
          <Icon name="undo" /> Annuler mon dernier geste
        </button>
        {!history.canUndo && (
          <p className="small muted" style={{ margin: '-4px 0 0' }}>
            Il n’y a rien à annuler pour le moment.
          </p>
        )}
        {history.canUndo && history.undoLabel && (
          <p className="small muted" style={{ margin: '-4px 0 0' }}>
            Dernier geste : {history.undoLabel}.
          </p>
        )}
        <button className="btn lost-big" onClick={() => then(openHelp)}>
          <Icon name="help" /> Ce que je peux faire ici
        </button>
        <ReadScreenButton help={help} />
        <button className="btn lost-big" onClick={() => then(() => guideOpen.set(true))}>
          <Icon name="forward" /> Je ne sais pas par où commencer
        </button>
        <button className="btn lost-big" onClick={() => then(() => toutFaire.set(true))}>
          <Icon name="list" /> Tout ce que je peux faire
        </button>
      </div>
    </Modal>
  )
}

import { useEffect, useRef, type ReactNode } from 'react'
import { Icon } from './Icon'
import { goHome } from '../lib/goHome'
import { closeLayer, openLayer } from '../lib/ui'

/**
 * Boîte de dialogue native (`<dialog>`) : piège le focus, se ferme avec Échap, rend le focus à l'élément
 * qui l'a ouverte. `onClose` n'est appelée qu'une fois, quelle que soit la façon de fermer.
 * `sheet` : sur mobile, la boîte se colle en bas de l'écran.
 * `full` : sur mobile, la boîte prend tout l'écran (écrans de scan : carte en haut, consignes dessous) ; un bouton « Accueil » ramène à l'accueil en un appui.
 * `feat` : repère `data-feat` de la fonction que la boîte porte (« Tout ce que je peux faire » l'attend à l'arrivée).
 */
export function Modal({ title, onClose, children, sheet, full, feat }: { title: string; onClose: () => void; children: ReactNode; sheet?: boolean; full?: boolean; feat?: string }) {
  const ref = useRef<HTMLDialogElement>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    const d = ref.current
    const opener = document.activeElement as HTMLElement | null
    if (d && !d.open) d.showModal()
    // Retour (Android) ferme la boîte au lieu de quitter l'écran.
    const layer = openLayer(() => ref.current?.close())
    return () => {
      closeLayer(layer)
      // Le démontage retire le <dialog> du DOM : on rend le focus à l'élément d'origine.
      if (opener && opener.isConnected && typeof opener.focus === 'function') opener.focus()
    }
  }, [])

  const titleId = useRef('modal-' + Math.random().toString(36).slice(2, 8)).current
  return (
    <dialog
      ref={ref}
      className={'modal' + (sheet ? ' sheet' : '') + (full ? ' full' : '')}
      aria-labelledby={titleId}
      aria-modal="true"
      data-feat={feat}
      onClose={() => onCloseRef.current()}
      onClick={(e) => {
        // Clic sur le fond (hors du contenu) : ferme.
        if (e.target === ref.current) ref.current?.close()
      }}
    >
      <div className="modal-head">
        <h2 id={titleId}>{title}</h2>
        {full && (
          <button className="btn ghost small close-btn modal-home" onClick={goHome}>
            <Icon name="home" size={18} /> Accueil
          </button>
        )}
        <button className="btn ghost small close-btn" onClick={() => ref.current?.close()}>
          <Icon name="x" size={18} /> Fermer
        </button>
      </div>
      <div className="modal-body">{children}</div>
    </dialog>
  )
}

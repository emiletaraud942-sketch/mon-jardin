import { useEffect, useRef, type ReactNode } from 'react'
import { Icon } from './Icon'

/**
 * Boîte de dialogue native (`<dialog>`) : piège le focus, se ferme avec Échap, rend le focus à l'élément
 * qui l'a ouverte. `onClose` n'est appelée qu'une fois, quelle que soit la façon de fermer.
 * `sheet` : sur mobile, la boîte se colle en bas de l'écran.
 * `full` : sur mobile, la boîte prend tout l'écran (écrans de scan : carte en haut, consignes dessous).
 */
export function Modal({ title, onClose, children, sheet, full }: { title: string; onClose: () => void; children: ReactNode; sheet?: boolean; full?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    const d = ref.current
    const opener = document.activeElement as HTMLElement | null
    if (d && !d.open) d.showModal()
    return () => {
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
      onClose={() => onCloseRef.current()}
      onClick={(e) => {
        // Clic sur le fond (hors du contenu) : ferme.
        if (e.target === ref.current) ref.current?.close()
      }}
    >
      <div className="modal-head">
        <h2 id={titleId}>{title}</h2>
        <button className="btn ghost small close-btn" onClick={() => ref.current?.close()}>
          <Icon name="x" size={18} /> Fermer
        </button>
      </div>
      <div className="modal-body">{children}</div>
    </dialog>
  )
}

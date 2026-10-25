import { useRef, type ReactNode } from 'react'
import { Icon } from './Icon'
import { useIsMobile } from './useMedia'

export type SheetSnap = 'min' | 'mid' | 'max'
const ORDER: SheetSnap[] = ['min', 'mid', 'max']

/**
 * Feuille du bas partagée (carte, 3D, Où planter ?, Catalogue). Trois hauteurs : réduite (≈ 90 px), mi-hauteur, grande.
 * On change de hauteur en touchant ou en faisant glisser la poignée, ou avec les boutons Agrandir / Réduire.
 * Au-dessus de 760 px : panneau latéral habituel (sans poignée).
 */
export function BottomSheet({
  title,
  summary,
  snap,
  onSnap,
  children,
  fixed,
  label = 'Panneau',
}: {
  title: ReactNode
  summary?: ReactNode
  snap: SheetSnap
  onSnap: (s: SheetSnap) => void
  children: ReactNode
  /** Fixée au bas de l'écran, au-dessus de la barre de navigation (pages qui défilent). Sinon : posée sur le bas de son conteneur. */
  fixed?: boolean
  label?: string
}) {
  const mobile = useIsMobile()
  const start = useRef<number | null>(null)
  const i = ORDER.indexOf(snap)
  const go = (d: number) => onSnap(ORDER[Math.max(0, Math.min(2, i + d))])

  if (!mobile) return <aside className="sidepanel">{children}</aside>

  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('.sheet-btn')) return
    start.current = e.clientY
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }
  const onUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (start.current === null) return
    const dy = e.clientY - start.current
    start.current = null
    if (dy < -24) go(1)
    else if (dy > 24) go(-1)
    else onSnap(ORDER[(i + 1) % 3]) // simple toucher : hauteur suivante
  }
  return (
    <aside className={'bsheet' + (fixed ? ' fixed' : '')} data-snap={snap} aria-label={label}>
      <div className="sheet-head" onPointerDown={onDown} onPointerUp={onUp} onPointerCancel={() => (start.current = null)}>
        <button
          className="sheet-handle"
          aria-label={snap === 'max' ? 'Réduire le panneau' : 'Agrandir le panneau'}
          onClick={(e) => {
            if (e.detail === 0) onSnap(ORDER[(i + 1) % 3]) // clavier
          }}
        >
          <span aria-hidden />
        </button>
        <div className="sheet-title">
          <div className="sheet-title-text">
            <strong>{title}</strong>
            {summary && <span className="muted small">{summary}</span>}
          </div>
          <button className="btn ghost icon-btn sheet-btn" aria-label="Réduire le panneau" disabled={i === 0} onClick={() => go(-1)}>
            <span style={{ display: 'inline-flex', transform: 'rotate(0deg)' }}><Icon name="chevron" size={20} /></span>
          </button>
          <button className="btn ghost icon-btn sheet-btn" aria-label="Agrandir le panneau" disabled={i === 2} onClick={() => go(1)}>
            <span style={{ display: 'inline-flex', transform: 'rotate(180deg)' }}><Icon name="chevron" size={20} /></span>
          </button>
        </div>
      </div>
      <div className="sheet-body" {...(snap === 'min' ? ({ inert: '' } as object) : {})}>
        {children}
      </div>
    </aside>
  )
}

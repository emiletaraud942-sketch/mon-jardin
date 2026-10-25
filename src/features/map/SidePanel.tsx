import { useEffect, useState, type ReactNode } from 'react'

const SNAPS = ['38', '70', '100'] as const
type Snap = (typeof SNAPS)[number]
const NEXT_LABEL: Record<Snap, string> = { '38': 'Agrandir le panneau', '70': 'Agrandir le panneau en plein écran', '100': 'Réduire le panneau' }

/**
 * Panneau latéral (bureau) ou volet du bas extensible (mobile) : poignée à 3 hauteurs, 38 %, 70 %, 100 %.
 * Sur bureau la poignée est masquée et la hauteur ne compte pas.
 */
export function SidePanel({ children, tall, collapse }: { children: ReactNode; tall?: boolean; collapse?: boolean }) {
  const [snap, setSnap] = useState<Snap>('38')
  // Une fiche plante vient de s'ouvrir : on repart de la hauteur de base.
  useEffect(() => {
    setSnap('38')
  }, [tall])
  // Placement ou déplacement en cours : le volet se rabaisse pour laisser voir la carte.
  useEffect(() => {
    if (collapse) setSnap('38')
  }, [collapse])
  return (
    <aside className="sidepanel" data-snap={snap}>
      <button className="sheet-handle" aria-label={NEXT_LABEL[snap]} onClick={() => setSnap(SNAPS[(SNAPS.indexOf(snap) + 1) % SNAPS.length])}>
        <span aria-hidden />
      </button>
      {children}
    </aside>
  )
}

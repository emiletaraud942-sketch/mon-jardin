import { useEffect, useState, type ReactNode } from 'react'
import { BottomSheet, type SheetSnap } from '../../components/BottomSheet'

/**
 * Panneau latéral (bureau) ou feuille du bas (téléphone).
 * Réduite par défaut ; mi-hauteur quand une plante est sélectionnée ; réduite pendant un placement.
 */
export function SidePanel({ children, tall, collapse, title, summary }: { children: ReactNode; tall?: boolean; collapse?: boolean; title: ReactNode; summary?: ReactNode }) {
  const [snap, setSnap] = useState<SheetSnap>('min')
  useEffect(() => {
    setSnap(tall ? 'mid' : 'min')
  }, [tall])
  useEffect(() => {
    if (collapse) setSnap('min')
  }, [collapse])
  return (
    <BottomSheet title={title} summary={summary} snap={snap} onSnap={setSnap} label="Plantes du jardin">
      {children}
    </BottomSheet>
  )
}

import { useEffect, useState, type ReactNode } from 'react'
import { BottomSheet, type SheetSnap } from '../../components/BottomSheet'
import { Icon } from '../../components/Icon'
import { PlaceAction } from '../../components/PlaceAction'
import { useIsMobile } from '../../components/useMedia'
import { useActiveGarden, useGardenPlants } from '../../lib/store'

/**
 * Panneau latéral (bureau) ou feuille du bas (téléphone).
 * Réduite par défaut ; mi-hauteur quand une plante est sélectionnée ; réduite pendant un placement.
 * Téléphone : tant que la feuille est réduite, un gros bouton « Ajouter une plante » reste visible au-dessus d'elle (plus de fonction cachée).
 */
export function SidePanel({ children, tall, collapse, title, summary }: { children: ReactNode; tall?: boolean; collapse?: boolean; title: ReactNode; summary?: ReactNode }) {
  const [snap, setSnap] = useState<SheetSnap>('min')
  const mobile = useIsMobile()
  const garden = useActiveGarden()
  const count = useGardenPlants(garden?.id).length
  useEffect(() => {
    setSnap(tall ? 'mid' : 'min')
  }, [tall])
  useEffect(() => {
    if (collapse) setSnap('min')
  }, [collapse])
  // Plus de gros bouton flottant sur la carte (il recouvrait les plantes) : un petit bouton discret dans l'en-tête de la feuille, et « Où planter ? » dans son
  // contenu, où l'on trouve les conseils de lieu. Jardin vide : la carte a déjà sa grande carte d'invitation. Placement en cours : la consigne prend la place.
  const action =
    mobile && !collapse && !tall && count > 0 ? (
      <PlaceAction className="btn ghost small sheet-add" title="Quelle plante ajouter ?">
        <Icon name="plus" size={16} /> Ajouter
      </PlaceAction>
    ) : undefined
  return (
    <>
      <BottomSheet title={title} summary={summary} snap={snap} onSnap={setSnap} label="Plantes du jardin" action={action}>
        {children}
      </BottomSheet>
    </>
  )
}

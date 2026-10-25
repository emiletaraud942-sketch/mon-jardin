import { useState, type ReactNode } from 'react'
import { startPlacing } from '../lib/ui'
import { UNKNOWN_SPECIES_ID } from '../lib/customName'
import { SpeciesPicker } from './SpeciesPicker'

/** Bouton qui ouvre le choix d'une plante (ou « Ma plante n'est pas dans la liste »), puis lance le placement sur la carte. */
export function PlaceAction({ children, className = 'btn primary', title = 'Quelle plante ajouter ?' }: { children: ReactNode; className?: string; title?: string }) {
  const [picking, setPicking] = useState(false)
  return (
    <>
      <button className={className} onClick={() => setPicking(true)}>
        {children}
      </button>
      {picking && (
        <SpeciesPicker
          title={title}
          onClose={() => setPicking(false)}
          onPick={(s) => {
            setPicking(false)
            startPlacing(s.id)
          }}
          onPickCustom={(name) => {
            setPicking(false)
            startPlacing(UNKNOWN_SPECIES_ID, { customName: name })
          }}
        />
      )}
    </>
  )
}

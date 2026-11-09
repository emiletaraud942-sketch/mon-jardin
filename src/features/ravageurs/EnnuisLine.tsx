import { useEffect, useState } from 'react'
import type { Ennui } from '../../data/ravageurs/types'
import { openEnnui } from '../../lib/overlays'
import { ennuisForSpecies } from './filter'
import '../../styles/ennuis.css'
import '../../styles/novice-pages.css'

/** Les fiches du guide qui touchent une espèce. Les fiches se chargent à la demande : elles n'alourdissent pas l'écran d'entrée. */
export function useEnnuisFor(speciesId: string): Ennui[] {
  const [list, setList] = useState<Ennui[]>([])
  useEffect(() => {
    let alive = true
    setList([])
    import('../../data/ravageurs')
      .then((m) => alive && setList(ennuisForSpecies(m.ENNUIS, speciesId)))
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [speciesId])
  return list
}

/** « Ennuis fréquents » : une pastille par fiche du guide ; rien s'il n'y en a pas. */
export function EnnuisLine({ speciesId }: { speciesId: string }) {
  const list = useEnnuisFor(speciesId)
  if (list.length === 0) return null
  return (
    <section className="ennuis-line" aria-label="Ennuis fréquents">
      <h3>Ennuis fréquents</h3>
      <ul className="ennui-chips">
        {list.map((e) => (
          <li key={e.id}>
            <button className="btn chip-filter ennui-chip" onClick={() => openEnnui(e.id)}>
              {e.nom}
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

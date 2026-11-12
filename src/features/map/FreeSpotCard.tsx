import { useMemo } from 'react'
import { Icon } from '../../components/Icon'
import { measureRuler } from '../../lib/snap'
import { useGardenPlants } from '../../lib/store'
import { setUi, useUi } from '../../lib/ui'
import type { Garden } from '../../types'
import { rulerSummary } from './placeAids'
import { usePeekReserve } from './PlantPeek'
import { SiteNoteAt } from './SiteNote'

/**
 * Carte d'infos d'un ENDROIT touché sur la carte (aucune plante choisie) : distances (limite, maison, plantes voisines), soleil, pente et humidité
 * estimée, et un seul geste utile : « Que planter ici ? » (ouvre « Où planter ? » avec cet endroit déjà choisi). Se ferme d'un appui, ou en
 * touchant une plante, en commençant un placement ou en quittant la carte. Téléphone et ordinateur.
 */
export function FreeSpotCard({ garden }: { garden: Garden }) {
  const { freeSpot, selectedPlantId, placingSpeciesId, movingPlantId } = useUi()
  const plants = useGardenPlants(garden.id)
  const reserveRef = usePeekReserve()
  const point = freeSpot && freeSpot.gardenId === garden.id ? freeSpot.point : undefined
  const summary = useMemo(() => {
    if (!point) return ''
    const others = plants.filter((p) => p.status !== 'mort' && p.status !== 'recoltee').map((p) => p.position)
    return rulerSummary(measureRuler(point, { parcel: garden.parcel, buildings: (garden.buildings ?? []).map((b) => b.ring), plants: others }), 3)
  }, [point, plants, garden.parcel, garden.buildings])
  if (!point || selectedPlantId || placingSpeciesId || movingPlantId) return null
  return (
    <div className="floating free-spot-card" role="region" aria-label="Cet endroit du jardin" ref={reserveRef}>
      <div className="free-spot-head">
        <strong className="free-spot-title">Cet endroit</strong>
        <button className="btn ghost small free-spot-close" aria-label="Fermer : ne plus regarder cet endroit" onClick={() => setUi({ freeSpot: undefined })}>
          <Icon name="x" size={18} />
        </button>
      </div>
      {summary && <div className="small free-spot-dist">{summary}</div>}
      <SiteNoteAt garden={garden} point={point} />
      <button className="btn primary free-spot-go" onClick={() => setUi({ planting: { gardenId: garden.id, spot: point, cat: '' }, tab: 'planter' })}>
        Que planter ici ?
      </button>
    </div>
  )
}

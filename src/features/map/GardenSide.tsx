import { useState } from 'react'
import { SPECIES_BY_ID } from '../../data/species'
import { STATUS_LABEL } from '../../data/labels'
import { Icon } from '../../components/Icon'
import { SpeciesPicker } from '../../components/SpeciesPicker'
import { UNKNOWN_SPECIES_ID, yourPlant } from '../../lib/customName'
import { useGardenPlants, useStore } from '../../lib/store'
import { closePlantSheet, setUi, startPlacing, stopPlacing, useUi } from '../../lib/ui'
import type { Garden } from '../../types'
import { PlantPanel, plantName } from '../plants/PlantPanel'

const MAX_LISTED = 60

/** Panneau latéral partagé par la carte et la 3D. */
export function GardenSide({ garden, hint }: { garden: Garden; hint: string }) {
  const plants = useGardenPlants(garden.id)
  const { selectedPlantId } = useUi()
  const [picking, setPicking] = useState(false)
  const selected = plants.find((p) => p.id === selectedPlantId)

  if (selected) return <PlantPanel garden={garden} plant={selected} onClose={closePlantSheet} />

  return (
    <div className="stack" style={{ gap: 12 }}>
      <div>
        <h2 style={{ marginBottom: 2 }}>{garden.name}</h2>
        <div className="muted small">
          {garden.areaM2 ? `${garden.areaM2} m² · ` : ''}
          {plants.length} plante{plants.length > 1 ? 's' : ''}
        </div>
      </div>
      <button className="btn primary" onClick={() => setPicking(true)}>
        <Icon name="plus" /> Ajouter une plante au jardin
      </button>
      <p className="muted small">{hint}</p>
      {plants.length > 0 && (
        <ul className="list small">
          {plants.slice(0, MAX_LISTED).map((p) => {
            const s = SPECIES_BY_ID[p.speciesId]
            return (
              <li key={p.id}>
                <button className="btn ghost small tall" style={{ width: '100%', justifyContent: 'flex-start' }} onClick={() => setUi({ selectedPlantId: p.id, focusPlantId: p.id })}>
                  <span className="dot" style={{ background: s?.couleurAccent ?? s?.couleur ?? 'var(--accent-2)' }} /> {plantName(p)}
                  {p.status !== 'en-place' && <span className="badge">{STATUS_LABEL[p.status]}</span>}
                </button>
              </li>
            )
          })}
          {plants.length > MAX_LISTED && (
            <li className="muted">
              + {plants.length - MAX_LISTED} autres : voir l’écran « Plantes ».
            </li>
          )}
        </ul>
      )}
      {picking && (
        <SpeciesPicker
          title="Quelle plante ajouter ?"
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
    </div>
  )
}

/** Consigne affichée tant qu'une plante est à placer ou à déplacer : grande, sur deux lignes, avec « Annuler ». */
export function PlacingBanner() {
  const { tab, placingSpeciesId, placingCustomName, placingSeries, movingPlantId } = useUi()
  const moving = useStore((s) => (movingPlantId ? s.plants.find((p) => p.id === movingPlantId) : undefined))
  // En Vue 3D, la scène affiche sa propre consigne : une seule bannière.
  if (tab === '3d' || (!placingSpeciesId && !movingPlantId)) return null
  const name = movingPlantId
    ? moving
      ? plantName(moving)
      : 'plante'
    : placingCustomName || (placingSpeciesId && placingSpeciesId !== UNKNOWN_SPECIES_ID ? SPECIES_BY_ID[placingSpeciesId]?.nomCommun : undefined) || 'plante'
  return (
    <div className="floating placing-banner" role="status">
      <Icon name={movingPlantId ? 'move' : 'pin'} size={24} />
      <span className="placing-text">
        <strong>{movingPlantId ? `Touchez sur la carte le nouvel emplacement de ${yourPlant(name)}.` : `Touchez sur la carte l’endroit où se trouve ${yourPlant(name)}.`}</strong>
        {placingSeries && placingSeries.count > 0 && <span className="small muted" style={{ display: 'block' }}>{placingSeries.count} plante{placingSeries.count > 1 ? 's' : ''} placée{placingSeries.count > 1 ? 's' : ''}. Touchez encore pour en ajouter.</span>}
      </span>
      <button className={'btn' + (placingSeries ? ' primary' : '')} onClick={stopPlacing}>
        {placingSeries ? 'Terminé' : 'Annuler'}
      </button>
    </div>
  )
}

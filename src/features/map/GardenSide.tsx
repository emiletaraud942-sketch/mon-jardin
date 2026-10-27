import { useState } from 'react'
import { createPortal } from 'react-dom'
import { SPECIES_BY_ID } from '../../data/species'
import { STATUS_LABEL } from '../../data/labels'
import { Icon } from '../../components/Icon'
import { SpeciesPicker } from '../../components/SpeciesPicker'
import { UNKNOWN_SPECIES_ID, yourPlant } from '../../lib/customName'
import { useGardenPlants, useStore } from '../../lib/store'
import { closePlantSheet, openHelp, setUi, startPlacing, stopPlacing, useUi } from '../../lib/ui'
import type { Garden } from '../../types'
import { PlantPanel, plantName } from '../plants/PlantPanel'
import { openScan } from '../scan/scanUi'
import { openPanorama } from '../panorama/panoUi'
import { useIsMobile } from '../../components/useMedia'
import { confirmBeforePlacing, placeAtAim, usePlacingInfo } from './aimBridge'

const MAX_LISTED = 60

/** Titre et résumé de l'en-tête de la feuille du bas : la plante choisie, sinon le jardin et le nombre de plantes. */
export function useSheetHead(garden: Garden): { title: string; summary: string } {
  const plants = useGardenPlants(garden.id)
  const { selectedPlantId } = useUi()
  const sel = plants.find((p) => p.id === selectedPlantId)
  if (sel) return { title: plantName(sel), summary: STATUS_LABEL[sel.status] }
  return { title: garden.name, summary: `${plants.length} plante${plants.length > 1 ? 's' : ''}` }
}

/** Panneau latéral partagé par la carte et la 3D. */
export function GardenSide({ garden, hint }: { garden: Garden; hint: string }) {
  const plants = useGardenPlants(garden.id)
  const { selectedPlantId, movingPlantId, placingSpeciesId } = useUi()
  const [picking, setPicking] = useState(false)
  const mobile = useIsMobile()
  const selected = plants.find((p) => p.id === selectedPlantId)

  // Téléphone : la fiche prend tout l'écran, comme depuis la liste des plantes (maquette). Pendant un déplacement ou un placement, la carte reste visible.
  if (selected && mobile) {
    if (movingPlantId || placingSpeciesId) return null
    return createPortal(
      <div className="fiche-overlay">
        <PlantPanel garden={garden} plant={selected} onClose={closePlantSheet} fiche onShowOnMap={() => setUi({ tab: 'carte', focusPlantId: selected.id, selectedPlantId: undefined })} />
      </div>,
      document.body,
    )
  }
  if (selected) return <PlantPanel garden={garden} plant={selected} onClose={closePlantSheet} />

  return (
    <div className="stack plants-ui" style={{ gap: 12 }}>
      <div className="gs-head">
        <h2 style={{ marginBottom: 2 }}>{garden.name}</h2>
        <div className="muted small">
          {garden.areaM2 ? `${garden.areaM2} m² · ` : ''}
          {plants.length} plante{plants.length > 1 ? 's' : ''}
        </div>
      </div>
      <button className="btn primary" onClick={() => setPicking(true)}>
        <Icon name="plus" /> Ajouter une plante au jardin
      </button>
      <button className="btn" aria-haspopup="dialog" onClick={() => openPanorama('home')}>
        <Icon name="camera" /> Photos du jardin{(garden.panoramas?.length ?? 0) > 0 ? ` (${garden.panoramas!.length})` : ''}
      </button>
      <details className="np-details">
        <summary>Autres façons d’ajouter</summary>
        <button className="btn" onClick={() => openScan('menu')}>
          <Icon name="camera" /> Scanner mon jardin
        </button>
      </details>
      <p className="muted small">{hint}</p>
      <button className="btn ghost small" aria-haspopup="dialog" onClick={openHelp}>
        Aide sur cet écran
      </button>
      {plants.length > 0 && (
        <ul className="list small">
          {plants.slice(0, MAX_LISTED).map((p) => {
            const s = SPECIES_BY_ID[p.speciesId]
            return (
              <li key={p.id}>
                <button className="btn ghost small tall plant-row" style={{ width: '100%', justifyContent: 'flex-start' }} onClick={() => setUi({ selectedPlantId: p.id, focusPlantId: p.id })}>
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
          onScan={() => {
            setPicking(false)
            openScan('menu')
          }}
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

/**
 * Consigne affichée tant qu'une plante est à placer ou à déplacer : grande, avec « Valider » et « Annuler » toujours visibles.
 * Trois gestes : « Ajouter une plante » (2 touchers pour la choisir), toucher la carte (ou viser), « Valider ».
 */
export function PlacingBanner() {
  const { tab, placingSpeciesId, placingCustomName, placingSeries, movingPlantId, aim, placingSpot } = useUi()
  const moving = useStore((s) => (movingPlantId ? s.plants.find((p) => p.id === movingPlantId) : undefined))
  const info = usePlacingInfo()
  // En Vue 3D, la scène affiche sa propre consigne : une seule bannière.
  if (tab === '3d' || (!placingSpeciesId && !movingPlantId)) return null
  const name = movingPlantId
    ? moving
      ? plantName(moving)
      : 'plante'
    : placingCustomName || (placingSpeciesId && placingSpeciesId !== UNKNOWN_SPECIES_ID ? SPECIES_BY_ID[placingSpeciesId]?.nomCommun : undefined) || 'plante'
  const confirm = aim || confirmBeforePlacing()
  const ready = aim || !!placingSpot
  const text = aim
    ? `Déplacez la carte : la croix doit être sur l’endroit de ${yourPlant(name)}.`
    : ready
      ? 'C’est bien là ? Touchez Valider. Pour corriger, touchez un autre endroit.'
      : movingPlantId
        ? `Touchez sur la carte le nouvel endroit de ${yourPlant(name)}.`
        : `Touchez sur la carte l’endroit où se trouve ${yourPlant(name)}.`
  return (
    <div className="floating placing-banner" role="status">
      <Icon name={movingPlantId ? 'move' : 'pin'} size={28} />
      <span className="placing-text">
        <strong>{text}</strong>
        {placingSeries && placingSeries.count > 0 && (
          <span className="small muted" style={{ display: 'block' }}>
            {placingSeries.count} plante{placingSeries.count > 1 ? 's' : ''} placée{placingSeries.count > 1 ? 's' : ''}. Touchez encore pour en ajouter.
          </span>
        )}
        {info.summary && <span className="small placing-dist">{info.summary}</span>}
        {info.note && <span className="small placing-note">{info.note}</span>}
        {confirm && !aim && !ready && !info.note && <span className="small muted placing-hint">Pour viser : maintenez le doigt (loupe) ou touchez Viser.</span>}
      </span>
      <span className="placing-actions">
        {confirm && (
          <button className="btn primary placing-ok" disabled={!ready} onClick={placeAtAim}>
            <Icon name="check" size={20} /> Valider
          </button>
        )}
        <button className={'btn placing-cancel' + (placingSeries && placingSeries.count > 0 ? ' primary' : '')} onClick={stopPlacing}>
          {placingSeries && placingSeries.count > 0 ? 'Terminé' : 'Annuler'}
        </button>
      </span>
    </div>
  )
}

import { useCallback, useMemo, useRef } from 'react'
import { Icon } from '../../components/Icon'
import { useIsMobile } from '../../components/useMedia'
import { STATUS_LABEL } from '../../data/labels'
import { SPECIES_BY_ID } from '../../data/species'
import { legalDistance } from '../../engine/planting'
import { measureRuler } from '../../lib/snap'
import { useGardenPlants } from '../../lib/store'
import { closePlantSheet, openFiche, startMoving, useUi } from '../../lib/ui'
import type { Garden } from '../../types'
import { plantName } from '../plants/PlantPanel'
import { usePlacingPoint } from './aimBridge'
import { rulerSummary } from './placeAids'
import { SiteNoteAt } from './SiteNote'

/** Hauteur de la petite carte (px) posée dans `--peek-h` : l'échelle et l'attribution de la carte remontent d'autant. À brancher en `ref`. */
function usePeekReserve() {
  const stop = useRef<(() => void) | null>(null)
  return useCallback((el: HTMLElement | null) => {
    stop.current?.()
    stop.current = null
    const wrap = el?.closest<HTMLElement>('.canvas-wrap') ?? null
    if (!el || !wrap) return
    const set = () => wrap.style.setProperty('--peek-h', `${Math.ceil(el.offsetHeight)}px`)
    set()
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(set)
    ro?.observe(el)
    stop.current = () => {
      ro?.disconnect()
      wrap.style.removeProperty('--peek-h')
    }
  }, [])
}

/**
 * Petite carte d'infos de la plante CHOISIE sur la carte (téléphone) : sa place (limite, maison, voisines, art. 671), soleil, pente et humidité
 * estimée, et trois gestes : glisser la plante, « Déplacer » au viseur (précis), « Fiche » (la fiche complète ne s'ouvre jamais toute seule).
 * Pendant un glissement, le point suivi par la carte (`usePlacingPoint`) met les distances à jour en direct.
 */
export function PlantPeek({ garden }: { garden: Garden }) {
  const mobile = useIsMobile()
  const { selectedPlantId, movingPlantId, placingSpeciesId, ficheOpenId } = useUi()
  const plants = useGardenPlants(garden.id)
  const live = usePlacingPoint()
  const reserveRef = usePeekReserve()
  const plant = plants.find((p) => p.id === selectedPlantId)
  const species = plant ? SPECIES_BY_ID[plant.speciesId] : undefined
  const point = live ?? plant?.position
  const dragging = !!live
  const info = useMemo(() => {
    if (!plant || !point) return undefined
    const legal = species ? legalDistance(species, point, garden.parcel) : undefined
    const others = plants.filter((p) => p.id !== plant.id && p.status !== 'mort' && p.status !== 'recoltee').map((p) => p.position)
    const ruler = measureRuler(point, { parcel: garden.parcel, buildings: (garden.buildings ?? []).map((b) => b.ring), plants: others, legalM: legal?.requiredM })
    return { summary: rulerSummary(ruler, 3), warn: legal && !legal.ok && legal.actualM !== undefined ? legal.summary : undefined }
  }, [plant, point, species, garden.parcel, garden.buildings, plants])

  if (!mobile || !plant || !point || !info || movingPlantId || placingSpeciesId || ficheOpenId === plant.id) return null
  return (
    <div className="floating plant-peek" role="region" aria-label={`Place de ${plantName(plant)}`} aria-description="Glissez la plante pour la déplacer." ref={reserveRef} data-feat="plante-choisie">
      <div className="plant-peek-head">
        <span className="dot" style={{ background: species?.couleurAccent ?? species?.couleur ?? 'var(--accent-2)' }} aria-hidden="true" />
        <strong className="plant-peek-name">{plantName(plant)}</strong>
        {plant.status !== 'en-place' && <span className="badge">{STATUS_LABEL[plant.status]}</span>}
        <button className="btn ghost small plant-peek-close" aria-label="Fermer : ne plus choisir cette plante" onClick={closePlantSheet}>
          <Icon name="x" size={18} />
        </button>
      </div>
      <div className="small plant-peek-dist">{info.summary || (dragging ? 'Lâchez pour poser la plante ici.' : 'Glissez la plante pour la déplacer.')}</div>
      {info.warn && (
        <div className="small plant-peek-warn" role="status">
          ⚠ {info.warn}
        </div>
      )}
      <SiteNoteAt garden={garden} point={point} />
      <div className="plant-peek-actions">
        <button className="btn" onClick={() => startMoving(plant.id)}>
          <Icon name="move" size={18} /> Déplacer précisément
        </button>
        <button className="btn primary" onClick={() => openFiche(plant.id)}>
          Fiche
        </button>
      </div>
    </div>
  )
}

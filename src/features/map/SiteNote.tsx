import { useEffect, useMemo, useState } from 'react'
import { SPECIES_BY_ID } from '../../data/species'
import { obstaclesFor, seasonalSunHours } from '../../engine/sun'
import { useActiveGarden, useGardenPlants } from '../../lib/store'
import { useLidarScene } from '../../lib/useLidar'
import type { Garden, XY } from '../../types'
import { usePlacingPoint } from './aimBridge'
import { siteLines, type SiteLine } from './siteNote'

const ICON: Record<SiteLine['kind'], string> = { soleil: '☀', pente: '⛰', eau: '💧' }
/** Attente après le dernier mouvement du viseur avant de calculer le soleil (lancer de rayons : pas à chaque image). */
const DEBOUNCE_MS = 350

/** Fiche « Ici » pour un point donné (la plante choisie, ou l'endroit visé). */
export function SiteNoteAt({ garden, point }: { garden: Garden; point: XY }) {
  const plants = useGardenPlants(garden.id)
  const lidar = useLidarScene(garden, plants)
  const obstacles = useMemo(() => obstaclesFor(garden, plants, SPECIES_BY_ID, new Date(), lidar.trees), [garden, plants, lidar.trees])
  const [sunHours, setSunHours] = useState<number>()
  useEffect(() => {
    const t = window.setTimeout(() => {
      try {
        setSunHours(seasonalSunHours(point, garden, obstacles).moyenne)
      } catch {
        setSunHours(undefined)
      }
    }, DEBOUNCE_MS)
    return () => window.clearTimeout(t)
  }, [point, garden, obstacles])
  const lines = useMemo(
    () => siteLines({ sunHours, terrain: lidar.terrain ?? garden.terrain, point, sol: garden.sol, rainMmPerYear: garden.rainMmPerYear }),
    [sunHours, lidar.terrain, garden.terrain, garden.sol, garden.rainMmPerYear, point],
  )
  return (
    <details className="site-note" data-feat="fiche-ici">
      <summary>
        <span className="site-note-text">
          <span className="site-note-title">Ici :</span> {lines.map((l) => l.short).join(' · ')}
        </span>
      </summary>
      <ul>
        {lines.map((l) => (
          <li key={l.kind}>
            <span aria-hidden="true">{ICON[l.kind]}</span> {l.text}
            {l.detail && <span className="muted"> ({l.detail})</span>}
          </li>
        ))}
      </ul>
    </details>
  )
}

/** Fiche « Ici » : soleil, pente et humidité estimée de l'endroit visé, sur une ligne, détail au toucher. */
export function SiteNote() {
  const point = usePlacingPoint()
  const garden = useActiveGarden()
  if (!point || !garden) return null
  return <SiteNoteAt garden={garden} point={point} />
}

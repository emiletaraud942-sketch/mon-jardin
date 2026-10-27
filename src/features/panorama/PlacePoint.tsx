import { useState } from 'react'
import { Icon } from '../../components/Icon'
import { frMeters } from '../../lib/format'
import { useGardenPlants } from '../../lib/store'
import type { Garden, XY } from '../../types'
import { gpsCircleRadiusM } from '../map/placeAids'
import { proposePosition } from '../scan/capture'
import { GpsMeter, GpsProblemNote } from '../scan/ScanParts'
import { ScanMap, type MapCircle, type MapDot } from '../scan/ScanMap'
import { useGps } from '../scan/useGps'
import { panoramasOf } from './panoData'
import { openPanorama } from './panoUi'
import { pointName } from './geometry'

/** Choix de l'endroit : toucher la carte, ou « Je suis ici » (GPS recalé si le jardin l'est). */
export function PlacePoint({ garden, mode }: { garden: Garden; mode: 'guide' | 'import' }) {
  const plants = useGardenPlants(garden.id)
  const gps = useGps(garden.center)
  const [spot, setSpot] = useState<XY>()
  const [note, setNote] = useState('')
  const [circle, setCircle] = useState<MapCircle>()
  const points = panoramasOf(garden)

  async function here() {
    setNote('')
    const sample = await gps.start(5000)
    if (!sample) return
    const prop = proposePosition(sample, garden.calibration)
    setSpot({ x: Math.round(prop.position.x * 100) / 100, y: Math.round(prop.position.y * 100) / 100 })
    setCircle({ center: prop.position, radiusM: gpsCircleRadiusM(prop.accuracyM) })
    setNote(`Position à ± ${frMeters(Math.max(0.5, prop.accuracyM))} près. Touchez la carte pour la corriger.`)
  }

  const dots: MapDot[] = [
    ...points.map((p, i) => ({ id: p.id, pos: { x: p.x, y: p.y }, label: String(i + 1), aria: pointName(i), tone: 'ref' as const })),
    ...(spot ? [{ id: 'spot', pos: spot, label: '●', aria: 'Votre point', tone: 'choix' as const }] : []),
  ]

  return (
    <div className="pano-page">
      <div className="pano-bar">
        <button className="btn pano-pill" onClick={() => openPanorama('home')}>
          <Icon name="back" size={18} /> Retour
        </button>
        <h2 className="pano-h">Où êtes-vous ?</h2>
      </div>
      <div className="pano-scroll pano-place">
        <div className="scan-layout">
          <ScanMap
            garden={garden}
            plants={plants}
            label="Carte du jardin : touchez l’endroit où vous prenez les photos"
            dots={dots}
            circles={circle ? [circle] : []}
            onTap={(p) => {
              setSpot({ x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100 })
              setCircle(undefined)
              setNote('')
            }}
          />
          <div className="scan-panel stack">
            <p style={{ margin: 0 }}>{spot ? 'C’est bien là ? Touchez un autre endroit pour corriger.' : 'Touchez la carte à l’endroit où vous allez prendre les photos.'}</p>
            <button className="btn" disabled={gps.state.status === 'mesure'} onClick={() => void here()}>
              <Icon name="pin" /> Je suis ici
            </button>
            <GpsMeter state={gps.state} hideWhenDone />
            {gps.state.status === 'erreur' && gps.state.problem && <GpsProblemNote problem={gps.state.problem} />}
            {note && (
              <p className="small muted" role="status" style={{ margin: 0 }}>
                {note}
              </p>
            )}
            <button className="btn primary big" disabled={!spot} onClick={() => spot && openPanorama(mode === 'import' ? 'import' : 'capture', { spot, mode })}>
              Continuer
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

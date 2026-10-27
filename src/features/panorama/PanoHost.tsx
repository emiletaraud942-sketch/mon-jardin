import { useEffect, useRef } from 'react'
import { useActiveGarden } from '../../lib/store'
import { Capture } from './Capture'
import { Home } from './Home'
import { ImportPano } from './ImportPano'
import { PlacePoint } from './PlacePoint'
import { Viewer } from './Viewer'
import { closePanorama, usePanoUi } from './panoUi'
import { panoramasOf } from './panoData'

/** Écrans de « Photos du jardin », en plein écran comme la fiche d'une plante. */
export default function PanoHost() {
  const ui = usePanoUi()
  const garden = useActiveGarden()
  const root = useRef<HTMLDivElement>(null)
  const screen = ui.screen

  // Focus sur l'écran à chaque changement (lecteurs d'écran, clavier) ; Échap ferme, sauf en pleine prise de vue.
  useEffect(() => {
    root.current?.focus({ preventScroll: true })
  }, [screen])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('dialog[open]') && screen !== 'capture') closePanorama()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [screen])

  if (!screen || !garden) return null
  const spot = ui.spot ?? (ui.pointId ? panoramasOf(garden).find((p) => p.id === ui.pointId) : undefined)
  let body
  if (screen === 'view' && ui.pointId) body = <Viewer key={garden.id} garden={garden} pointId={ui.pointId} />
  else if (screen === 'place') body = <PlacePoint garden={garden} mode={ui.mode ?? 'guide'} />
  else if (screen === 'capture' && spot) body = <Capture key={ui.pointId ?? 'new'} garden={garden} spot={{ x: spot.x, y: spot.y }} redoId={ui.pointId} />
  else if (screen === 'import' && spot) body = <ImportPano key={ui.pointId ?? 'new'} garden={garden} spot={{ x: spot.x, y: spot.y }} redoId={ui.pointId} />
  else body = <Home garden={garden} />
  return (
    <div ref={root} className="pano-overlay" role="dialog" aria-label="Photos du jardin" tabIndex={-1}>
      {body}
    </div>
  )
}

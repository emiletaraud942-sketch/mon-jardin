import { useEffect, useMemo, useRef, useState } from 'react'
import { Fold } from '../../components/Fold'
import { useOffline } from '../../components/OfflineChip'
import { frNumber } from '../../lib/format'
import { roomFor } from '../../lib/space'
import { TILE_CACHE, countCached, downloadMessage, downloadTiles, estimateBytes, planZone, type DownloadProgress } from '../../lib/tileDownload'
import type { Garden } from '../../types'

type Phase = 'repos' | 'en-cours' | 'fini'

/** Le navigateur sait-il garder des fichiers hors ligne ? (Cache API) */
function canCache(): boolean {
  return typeof caches !== 'undefined' && typeof caches.open === 'function'
}

/** « Télécharger ma zone » : garde la photo aérienne autour du jardin pour la voir sans internet. */
export function OfflineZoneCard({ garden }: { garden: Garden }) {
  const offline = useOffline()
  const plan = useMemo(() => planZone({ center: garden.center, parcel: garden.parcel }), [garden.center, garden.parcel])
  const [phase, setPhase] = useState<Phase>('repos')
  const [progress, setProgress] = useState<DownloadProgress>({ done: 0, total: plan.tiles.length, kept: 0 })
  const [message, setMessage] = useState('')
  const [already, setAlready] = useState<number>()
  const ctrl = useRef<AbortController>()
  const supported = canCache()
  const mo = Math.max(1, Math.round(estimateBytes(plan.tiles.length) / (1024 * 1024)))

  // Combien de tuiles de cette zone sont déjà gardées (rien n'est demandé au réseau).
  useEffect(() => {
    if (!supported) return
    let stop = false
    void (async () => {
      try {
        const cache = await caches.open(TILE_CACHE)
        const n = await countCached(plan.tiles, cache)
        if (!stop) setAlready(n)
      } catch {
        /* cache illisible : pas d'indication */
      }
    })()
    return () => {
      stop = true
    }
  }, [plan, supported, phase])

  useEffect(() => () => ctrl.current?.abort(), [])

  async function start() {
    if (offline || !supported) return
    setMessage('')
    if (!(await roomFor(estimateBytes(plan.tiles.length)))) {
      setMessage('Pas assez de place sur cet appareil pour garder la carte. Libérez de l’espace et réessayez.')
      return
    }
    try {
      await navigator.storage?.persist?.() // demande de garder les fichiers même si l'appareil manque de place
    } catch {
      /* refus sans gravité */
    }
    const c = new AbortController()
    ctrl.current = c
    setProgress({ done: 0, total: plan.tiles.length, kept: 0 })
    setPhase('en-cours')
    try {
      const cache = await caches.open(TILE_CACHE)
      const r = await downloadTiles(plan.tiles, { cache, signal: c.signal, onProgress: setProgress })
      setMessage(downloadMessage(r))
    } catch {
      setMessage('La carte n’a pas pu être gardée. Réessayez dans un instant.')
    } finally {
      ctrl.current = undefined
      setPhase('fini')
    }
  }

  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0
  return (
    <Fold title="Carte sans internet" feat="zone-hors-ligne">
      <div className="stack" style={{ gap: 8 }}>
        <p className="small muted" style={{ margin: 0 }}>
          Garde la photo aérienne autour de votre terrain (environ {plan.marginM} m de plus). Compter environ {frNumber(mo, 0)} Mo.
        </p>
        {phase === 'en-cours' ? (
          <>
            <div className="zone-bar" role="progressbar" aria-label="Téléchargement de la carte" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
              <span style={{ width: `${pct}%` }} />
            </div>
            <p className="small muted" role="status" aria-live="polite" style={{ margin: 0 }}>
              {progress.done} sur {progress.total} morceaux de carte
            </p>
            <button className="btn" onClick={() => ctrl.current?.abort()}>
              Annuler
            </button>
          </>
        ) : (
          <>
            <button className="btn" onClick={() => void start()} disabled={offline || !supported}>
              Télécharger ma zone
            </button>
            {offline && <p className="small muted" style={{ margin: 0 }}>Disponible quand vous êtes en ligne.</p>}
            {!supported && <p className="small muted" style={{ margin: 0 }}>Ce navigateur ne peut pas garder la carte hors ligne.</p>}
            {already !== undefined && already > 0 && phase === 'repos' && !message && (
              <p className="small muted" style={{ margin: 0 }}>
                {already} morceaux de carte sur {plan.tiles.length} déjà gardés.
              </p>
            )}
          </>
        )}
        <p className="small muted" role="status" aria-live="polite" style={{ margin: 0 }}>
          {phase !== 'en-cours' ? message : ''}
        </p>
        <p className="small muted" style={{ margin: 0 }}>
          L’IGN limite le débit de ses services : l’appli demande 4 morceaux de carte à la fois, 150 au plus par zone.
        </p>
      </div>
    </Fold>
  )
}

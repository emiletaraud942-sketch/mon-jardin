import { useEffect, useMemo, useState } from 'react'
import { Icon } from '../../components/Icon'
import { PlantScene } from '../../components/illustrations'
import { getPhoto } from '../../lib/photos'
import type { Garden } from '../../types'
import { canAddPoint, MAX_BYTES, MAX_POINTS, photoDateLabel, pointName, refusalMessage, sizeLabel } from './geometry'
import { pointBytes, panoramasOf } from './panoData'
import { closePanorama, openPanorama } from './panoUi'

interface Info {
  url?: string
  bytes: number
}

/** Liste des points de vue du jardin, ou explication quand il n'y en a pas encore. */
export function Home({ garden }: { garden: Garden }) {
  const points = panoramasOf(garden)
  const [info, setInfo] = useState<Record<string, Info>>({})
  const [refusal, setRefusal] = useState('')
  const key = points.map((p) => p.id + p.shots.map((s) => s.photoId).join('')).join('|')

  useEffect(() => {
    let cancelled = false
    const urls: string[] = []
    void (async () => {
      const next: Record<string, Info> = {}
      for (const p of points) {
        const bytes = await pointBytes(p)
        let url: string | undefined
        for (const s of p.shots) {
          const blob = await getPhoto(s.photoId)
          if (blob) {
            url = URL.createObjectURL(blob)
            urls.push(url)
            break
          }
        }
        next[p.id] = { url, bytes }
      }
      if (!cancelled) setInfo(next)
    })()
    return () => {
      cancelled = true
      urls.forEach((u) => URL.revokeObjectURL(u))
    }
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps

  const total = useMemo(() => points.reduce((s, p) => s + (info[p.id]?.bytes ?? 0), 0), [points, info])

  function start(mode: 'guide' | 'import') {
    const ok = canAddPoint(points.length, total)
    if (!ok.ok) {
      setRefusal(refusalMessage(ok.reason))
      return
    }
    setRefusal('')
    openPanorama('place', { mode })
  }

  return (
    <div className="pano-page">
      <div className="pano-bar">
        <button className="btn pano-pill" onClick={closePanorama}>
          <Icon name="back" size={18} /> Fermer
        </button>
        <h2 className="pano-h">Photos du jardin</h2>
      </div>
      <div className="pano-scroll stack">
        {points.length === 0 ? (
          <div className="pano-empty">
            <PlantScene size={96} variant="house" />
            <p className="pano-lead">Promenez-vous dans votre jardin avec de vraies photos.</p>
            <ol className="pano-steps">
              <li>Choisissez un endroit du jardin.</li>
              <li>Tournez sur vous-même : l’appli prend 8 à 12 photos.</li>
              <li>Retrouvez-les ici et sur la carte. Les noms de vos plantes s’affichent dessus.</li>
            </ol>
          </div>
        ) : (
          <ul className="pano-list" aria-label="Points de vue">
            {points.map((p, i) => (
              <li key={p.id} className="pano-card">
                <button className="pano-card-main" onClick={() => openPanorama('view', { pointId: p.id, back: 'home' })} aria-label={`Voir ${pointName(i).toLowerCase()}`}>
                  <span className="pano-thumb">{info[p.id]?.url ? <img src={info[p.id].url} alt="" /> : <Icon name="camera" size={24} />}</span>
                  <span className="pano-card-text">
                    <strong>{pointName(i)}</strong>
                    <span className="small muted">
                      {photoDateLabel(p.takenAt)} · {p.kind === 'import' ? 'photo large' : `${p.shots.length} photo${p.shots.length > 1 ? 's' : ''}`}
                      {info[p.id] ? ` · ${sizeLabel(info[p.id].bytes)}` : ''}
                    </span>
                  </span>
                  <Icon name="forward" size={20} />
                </button>
              </li>
            ))}
          </ul>
        )}

        {refusal && (
          <p className="alert warn small" role="alert">
            {refusal}
          </p>
        )}
        <button className="btn primary big" onClick={() => start('guide')}>
          <Icon name="camera" /> Prendre un point de vue
        </button>
        <button className="btn" onClick={() => start('import')}>
          <Icon name="upload" /> Importer un panorama
        </button>

        <p className="small muted pano-foot">
          {points.length > 0 && (
            <>
              {points.length} point{points.length > 1 ? 's' : ''} sur {MAX_POINTS} · {sizeLabel(total)} sur {sizeLabel(MAX_BYTES)}.
              <br />
            </>
          )}
          Ces photos restent sur ce téléphone et ne sont jamais envoyées en ligne. Elles ne sont pas dans la sauvegarde simple ; la « Sauvegarde avec photos » (Réglages) les contient.
        </p>
      </div>
    </div>
  )
}

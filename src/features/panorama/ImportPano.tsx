import { useEffect, useRef, useState } from 'react'
import { Icon } from '../../components/Icon'
import { uid } from '../../lib/geo'
import { savePhoto } from '../../lib/photos'
import type { Garden, Panorama, XY } from '../../types'
import { compassWord, defaultSpan, IMPORT_BYTES, IMPORT_SIDE, normDeg, sizeLabel } from './geometry'
import { discardPhotos, savePoint } from './panoData'
import { openPanorama } from './panoUi'
import { createSensor, type Sensor, type SensorStatus } from './sensors'

const SPANS: { deg: 120 | 180 | 360; label: string }[] = [
  { deg: 360, label: 'Tour complet (360°)' },
  { deg: 180, label: 'Grand (180°)' },
  { deg: 120, label: 'Moyen (120°)' },
]

/** Import d'une photo large faite avec le mode Panorama du téléphone : cap du centre, largeur couverte. */
export function ImportPano({ garden, spot, redoId }: { garden: Garden; spot: XY; redoId?: string }) {
  const [file, setFile] = useState<File>()
  const [url, setUrl] = useState('')
  const [span, setSpan] = useState<120 | 180 | 360>(360)
  const [heading, setHeading] = useState(0)
  const [known, setKnown] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState<SensorStatus>('repos')
  const [live, setLive] = useState(false)
  const sensor = useRef<Sensor>()

  useEffect(() => () => sensor.current?.stop(), [])
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url)
    },
    [url],
  )

  // Boussole : le cap suit la direction du téléphone tant que « Utiliser la boussole » est actif.
  useEffect(() => {
    if (!live) return
    const t = setInterval(() => {
      const s = sensor.current
      if (s?.status === 'ok' && s.latest.heading !== undefined && s.latest.absolute) {
        setHeading(Math.round(s.latest.heading))
        setKnown(true)
      }
    }, 200)
    return () => clearInterval(t)
  }, [live])

  async function pick(f: File) {
    setError('')
    setFile(f)
    setUrl(URL.createObjectURL(f))
    try {
      const bmp = await createImageBitmap(f)
      setSpan(defaultSpan(bmp.width, bmp.height))
      bmp.close?.()
    } catch {
      setError('Ce fichier n’est pas une photo lisible. Utilisez une photo JPEG ou PNG.')
    }
  }

  async function toggleCompass() {
    if (live) {
      sensor.current?.stop()
      setLive(false)
      return
    }
    sensor.current ??= createSensor(setStatus)
    const r = await sensor.current.start()
    if (r === 'refuse' || r === 'absent') return
    setLive(true)
  }

  async function save() {
    if (!file || busy) return
    setBusy(true)
    setError('')
    let photoId: string | undefined
    try {
      photoId = await savePhoto(file, { maxSide: IMPORT_SIDE, targetBytes: IMPORT_BYTES })
      const pano: Panorama = { id: redoId ?? uid(), x: spot.x, y: spot.y, takenAt: new Date().toISOString(), shots: [{ photoId, headingDeg: normDeg(heading), fovDeg: span }], kind: 'import' }
      if (!known) pano.northOk = false
      savePoint(garden.id, pano)
      openPanorama('view', { pointId: pano.id, yaw: heading, back: 'home' })
    } catch (e) {
      if (photoId) discardPhotos([photoId])
      setError(e instanceof Error ? e.message : 'La photo n’a pas pu être enregistrée.')
      setBusy(false)
    }
  }

  const sensorNote = status === 'refuse' ? 'La boussole est refusée. Utilisez le curseur.' : status === 'absent' ? 'Pas de boussole sur cet appareil. Utilisez le curseur.' : ''

  return (
    <div className="pano-page">
      <div className="pano-bar">
        <button className="btn pano-pill" onClick={() => (redoId ? openPanorama('view', { pointId: redoId, back: 'home' }) : openPanorama('home'))}>
          <Icon name="back" size={18} /> Retour
        </button>
        <h2 className="pano-h">Importer un panorama</h2>
      </div>
      <div className="pano-scroll stack">
        <p className="pano-lead">Choisissez une photo faite avec le mode « Panorama » de votre téléphone.</p>
        <label className="btn primary big">
          <Icon name="upload" /> {file ? 'Choisir une autre photo' : 'Choisir la photo'}
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (f) void pick(f)
            }}
          />
        </label>
        {url && <img className="pano-preview" src={url} alt="Aperçu de la photo choisie" />}
        {file && (
          <>
            <fieldset className="pano-fieldset">
              <legend>Largeur de la photo</legend>
              {SPANS.map((s) => (
                <label key={s.deg} className="pano-radio">
                  <input type="radio" name="span" checked={span === s.deg} onChange={() => setSpan(s.deg)} /> {s.label}
                </label>
              ))}
            </fieldset>
            <div className="stack">
              <label htmlFor="pano-heading">
                <strong>Vers où regarde le centre de la photo ?</strong>
              </label>
              <input
                id="pano-heading"
                className="pano-range"
                type="range"
                min={0}
                max={359}
                value={heading}
                onChange={(e) => {
                  setHeading(Number(e.target.value))
                  setKnown(true)
                }}
              />
              <p className="small" style={{ margin: 0 }} aria-live="polite">
                {known ? `${heading}° : vers le ${compassWord(heading)}.` : 'Nord inconnu. Les noms des plantes ne seront pas affichés.'}
              </p>
              <button className={'btn' + (live ? ' primary' : '')} aria-pressed={live} onClick={() => void toggleCompass()}>
                <Icon name="move" size={18} /> {live ? 'Boussole active : visez le centre' : 'Utiliser la boussole'}
              </button>
              <p className="small muted" style={{ margin: 0 }}>
                {sensorNote || 'Pour la boussole : placez-vous au point de la prise de vue et visez le centre de la photo.'}
              </p>
            </div>
          </>
        )}
        {error && (
          <p className="alert error small" role="alert">
            {error}
          </p>
        )}
        <button className="btn primary big" disabled={!file || busy} onClick={() => void save()}>
          {busy ? 'Enregistrement…' : 'Enregistrer ce panorama'}
        </button>
        {file && <p className="small muted">La photo sera réduite à environ {sizeLabel(IMPORT_BYTES)} au plus.</p>}
      </div>
    </div>
  )
}

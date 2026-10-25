import { useState } from 'react'
import { Modal } from '../../components/Modal'
import { Icon } from '../../components/Icon'
import { identifyPlant, type Identification } from '../../lib/plantnet'
import { deletePhoto, getPhoto, savePhoto } from '../../lib/photos'
import { PhotoThumb } from '../../components/PhotoThumb'
import { startPlacing } from '../../lib/ui'
import { hasConsent } from '../../lib/consent'
import { ConsentDialog } from '../legal/ConsentDialog'
import { ErrorNote } from '../../components/ErrorNote'
import { confidenceLabel, listLabel } from './identifyLabels'

const ORGANS = [
  ['auto', 'Je ne sais pas'],
  ['leaf', 'Feuille'],
  ['flower', 'Fleur'],
  ['fruit', 'Fruit'],
  ['bark', 'Écorce'],
] as const

export function IdentifyDialog({ onClose }: { onClose: () => void }) {
  const [photos, setPhotos] = useState<string[]>([])
  const [organ, setOrgan] = useState<(typeof ORGANS)[number][0]>('auto')
  const [results, setResults] = useState<Identification[]>()
  const [error, setError] = useState<unknown>()
  const [busy, setBusy] = useState(false)
  const [asking, setAsking] = useState(false)

  async function add(input: HTMLInputElement) {
    const files = Array.from(input.files ?? []).slice(0, 5 - photos.length)
    input.value = ''
    if (!files.length) return
    setError(undefined)
    const ids: string[] = []
    let failed = 0
    for (const f of files) {
      try {
        ids.push(await savePhoto(f))
      } catch (e) {
        failed++
        console.warn('Photo non enregistrée', e)
      }
    }
    if (failed) setError(new Error(failed === files.length ? 'Photo illisible. Essayez une autre photo (JPEG ou PNG).' : `${failed} photo(s) illisible(s) mises de côté.`))
    if (ids.length) {
      setPhotos((p) => [...p, ...ids])
      setResults(undefined)
    }
  }

  /** Rien ne part vers Pl@ntNet sans accord : première utilisation = demande de consentement. */
  function start() {
    if (hasConsent('plantnet')) void run()
    else setAsking(true)
  }

  async function run() {
    setBusy(true)
    setError(undefined)
    try {
      const blobs = (await Promise.all(photos.map(getPhoto))).filter((b): b is Blob => !!b)
      if (blobs.length === 0) throw new Error('Les photos ne sont plus là. Reprenez-les.')
      setResults(await identifyPlant(blobs, organ))
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }

  function close() {
    photos.forEach(deletePhoto)
    onClose()
  }

  function choose(r: Identification) {
    const keep = photos
    setPhotos([])
    onClose()
    if (r.species) startPlacing(r.species.id, { photos: keep })
    else startPlacing('inconnue', { customName: r.commonNames[0] ?? r.latin, photos: keep })
  }

  return (
    <Modal title="Identifier une plante" onClose={close}>
      <p className="muted">Prenez 1 à 5 photos nettes de la même plante : feuille, fleur ou fruit.</p>
      <div className="row photo-row" style={{ marginBottom: 12 }}>
        {photos.map((id) => (
          <PhotoThumb key={id} id={id} zoomable />
        ))}
        {photos.length < 5 && (
          <label className="btn photo-add">
            <Icon name="camera" />
            <span className="small">Ajouter une photo</span>
            <input className="sr-only" type="file" accept="image/*" multiple onChange={(e) => void add(e.target)} />
          </label>
        )}
      </div>
      <label className="field" style={{ marginBottom: 12 }}>
        <span>Que montre la photo ?</span>
        <select className="input" value={organ} onChange={(e) => setOrgan(e.target.value as typeof organ)}>
          {ORGANS.map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </label>
      <div className="stack" style={{ marginBottom: 12 }}>
        <button className="btn primary" disabled={photos.length === 0 || busy} onClick={start}>
          {busy ? <span className="spinner" /> : <Icon name="search" />} Identifier la plante
        </button>
        {photos.length === 0 && <p className="small muted" style={{ margin: 0 }}>Ajoutez une photo pour continuer.</p>}
      </div>
      {error !== undefined && <ErrorNote error={error} />}
      {results && results.length === 0 && <div className="alert small">Aucune plante reconnue. Essayez une photo plus nette d’une feuille ou d’une fleur.</div>}
      {results && results.length > 0 && (
        <ul className="list">
          {results.map((r) => (
            <li key={r.latin} className="row" style={{ justifyContent: 'space-between', flexWrap: 'nowrap', alignItems: 'flex-start' }}>
              <div style={{ minWidth: 0 }}>
                <strong>{r.commonNames[0] ?? r.latin}</strong> <span className="muted small"><i>{r.latin}</i></span>
                <div className="small">
                  {confidenceLabel(r.score)}
                  <span className={'badge ' + (r.species ? 'green' : '')} style={{ marginLeft: 6 }}>
                    {listLabel(!!r.species, r.approx)}
                  </span>
                  {r.species && !r.approx && <span className="muted"> : {r.species.nomCommun}</span>}
                </div>
              </div>
              <button className="btn small" onClick={() => choose(r)}>
                Ajouter au jardin
              </button>
            </li>
          ))}
        </ul>
      )}
      {asking && (
        <ConsentDialog
          id="plantnet"
          onAccept={() => {
            setAsking(false)
            void run()
          }}
          onRefuse={() => setAsking(false)}
        />
      )}
    </Modal>
  )
}

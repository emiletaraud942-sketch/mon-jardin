import { useState } from 'react'
import { Icon } from '../../components/Icon'
import { Modal } from '../../components/Modal'
import { ErrorNote } from '../../components/ErrorNote'
import { hasConsent } from '../../lib/consent'
import { getPhoto } from '../../lib/photos'
import { identifyPlant, type Organ } from '../../lib/plantnet'
import { rerank } from '../../lib/identifyRank'
import { ConsentDialog } from '../legal/ConsentDialog'
import { applyResults, type ScanItem } from './queue'
import { rankContext, verdictOf } from '../../lib/rankContext'
import { toSuggestions, updateQueue } from './queueStore'
import { cropCenter } from './crop'
import { CLOSE_UPS } from './winter'

/**
 * « Préciser avec des gros plans » : quand Pl@ntNet n'est pas sûr (surtout en hiver), on lui envoie l'écorce et une branche
 * de près, avec le bon organe, plus l'image déjà prise. Rien n'est gardé : les gros plans ne servent qu'à l'identification.
 */
export function CloseUps({ item, onClose }: { item: ScanItem; onClose: () => void }) {
  const [shots, setShots] = useState<Record<string, Blob>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>()
  const [asking, setAsking] = useState(false)
  const [done, setDone] = useState<string>()

  function take(key: string, input: HTMLInputElement) {
    const f = input.files?.[0]
    input.value = ''
    if (f) setShots((s) => ({ ...s, [key]: f }))
  }

  async function run() {
    setBusy(true)
    setError(undefined)
    try {
      const blobs: Blob[] = []
      const organs: Organ[] = []
      for (const c of CLOSE_UPS) {
        const b = shots[c.key]
        if (b) {
          blobs.push(b)
          organs.push(c.organ)
        }
      }
      if (blobs.length === 0) throw new Error('Prenez au moins un gros plan.')
      const own = await getPhoto(item.photoId)
      if (own && blobs.length < 5) {
        blobs.push(item.from === 'video' ? await cropCenter(own) : own)
        organs.push('auto')
      }
      const ctx = rankContext(item.gardenId, item.accuracyM < 99 ? item.position : undefined)
      const results = rerank(await identifyPlant(blobs, organs), ctx)
      const verdict = verdictOf(results, ctx)
      updateQueue((q) => applyResults(q, item.id, toSuggestions(results), verdict))
      setDone(verdict.uncertain ? 'Toujours pas sûr. Choisissez dans la liste, ou laissez « à nommer » et décidez au printemps.' : 'Voilà qui est plus clair : le nom proposé est choisi, vérifiez-le.')
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }

  function start() {
    if (hasConsent('plantnet')) void run()
    else setAsking(true)
  }

  return (
    <Modal title="Préciser avec des gros plans" onClose={onClose}>
      <p className="muted">Sans feuilles, l’écorce et les bourgeons aident beaucoup. Les photos servent seulement à chercher le nom : elles ne sont pas gardées.</p>
      <div className="stack">
        {CLOSE_UPS.map((c) => (
          <label key={c.key} className="btn photo-add" style={{ justifyContent: 'flex-start' }}>
            <Icon name={shots[c.key] ? 'check' : 'camera'} />
            <span>
              <strong>{c.title}</strong>
              <span className="small muted" style={{ display: 'block' }}>{shots[c.key] ? 'Photo prise. Touchez pour la refaire.' : c.help}</span>
            </span>
            <input className="sr-only" type="file" accept="image/*" capture="environment" onChange={(e) => take(c.key, e.target)} />
          </label>
        ))}
        <button className="btn primary" disabled={busy || Object.keys(shots).length === 0} onClick={start}>
          {busy ? <span className="spinner" /> : <Icon name="search" />} Chercher le nom
        </button>
      </div>
      {error !== undefined && <ErrorNote error={error} />}
      {done && (
        <div className="alert small" role="status">
          {done}
        </div>
      )}
      {done && (
        <button className="btn" onClick={onClose}>
          Fermer
        </button>
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

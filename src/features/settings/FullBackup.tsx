import { useEffect, useState } from 'react'
import { Icon } from '../../components/Icon'
import { buildFullBackup, downloadFullBackup, lastFullExportAt, measurePhotos, noteFullExport, photoRefs, planFull, sizeText, type Measure } from '../../lib/fullBackup'
import { getState, useStore } from '../../lib/store'
import { plural } from '../../lib/format'
import { isQuotaError, STORAGE_FULL_MESSAGE } from '../../lib/space'
import { showToast } from '../../lib/toast'

const photoCount = () => {
  const refs = photoRefs(getState())
  return refs.plants.length + refs.panoramas.length
}

/** Avertissement tant que les photos ne sont dans aucune sauvegarde complète. */
export function useUnsavedPhotos(): boolean {
  const gardens = useStore((s) => s.gardens)
  const plants = useStore((s) => s.plants)
  const [at, setAt] = useState(lastFullExportAt())
  useEffect(() => {
    const on = () => setAt(lastFullExportAt())
    window.addEventListener('pj-full-backup', on)
    return () => window.removeEventListener('pj-full-backup', on)
  }, [])
  void gardens
  void plants
  return photoCount() > 0 && !at
}

/**
 * Sauvegarde complète : un fichier avec les données et les photos. La taille est dite AVANT de créer le fichier ;
 * les photos du jardin (panoramas, jusqu'à 25 Mo par jardin) peuvent rester dehors.
 */
export function FullBackupSection() {
  const gardens = useStore((s) => s.gardens)
  const plants = useStore((s) => s.plants)
  const [measure, setMeasure] = useState<Measure>()
  const [wantPano, setWantPano] = useState(true)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string }>()

  useEffect(() => {
    let alive = true
    void measurePhotos(photoRefs({ gardens, plants })).then((m) => alive && setMeasure(m))
    return () => {
      alive = false
    }
  }, [gardens, plants])

  if (!measure || measure.count + measure.missing === 0) return null
  const plan = planFull(measure, wantPano)
  const hasPano = measure.panoramasBytes > 0

  async function run() {
    if (!plan.ok) return
    setBusy(true)
    setMsg(undefined)
    try {
      const { gardens, plants, tasksDone } = getState()
      const built = await buildFullBackup({ gardens, plants, tasksDone }, { panoramas: plan.withPanoramas })
      downloadFullBackup(built)
      noteFullExport()
      window.dispatchEvent(new Event('pj-full-backup'))
      const text = `Sauvegarde complète faite : ${plural(built.photos, 'photo')}, ${sizeText(built.blob.size)}.${built.missing > 0 ? ` ${plural(built.missing, 'photo')} ${built.missing > 1 ? 'manquent' : 'manque'} sur cet appareil.` : ''}`
      setMsg({ ok: true, text })
      showToast({ message: 'Sauvegarde complète faite. Le fichier est dans vos téléchargements.' })
    } catch (e) {
      setMsg({
        ok: false,
        text: isQuotaError(e)
          ? `${STORAGE_FULL_MESSAGE} Libérez de la place, puis recommencez.`
          : 'La sauvegarde complète n’a pas pu être créée. Il manque peut-être de la mémoire. Faites la sauvegarde sans photos.',
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="stack full-backup" style={{ gap: 8, marginTop: 12 }}>
      <strong>Sauvegarde complète, avec les photos</strong>
      <p className="small muted" style={{ margin: 0 }}>
        {plural(measure.count, 'photo')} sur cet appareil, {sizeText(measure.plantsBytes + measure.panoramasBytes)}.
        {plan.ok ? ` Le fichier fera environ ${sizeText(plan.fileBytes)}.` : ''}
      </p>
      {hasPano && (
        <label className="check" style={{ minHeight: 44, display: 'flex', alignItems: 'center', gap: 8 }}>
          <input type="checkbox" checked={wantPano} onChange={(e) => setWantPano(e.target.checked)} />
          <span>Inclure les photos du jardin ({sizeText(measure.panoramasBytes)})</span>
        </label>
      )}
      {plan.ok && wantPano && hasPano && !plan.withPanoramas && (
        <p className="alert warn small" role="status">
          Les photos du jardin sont trop lourdes pour un seul fichier. Elles restent hors de la sauvegarde.
        </p>
      )}
      {!plan.ok && (
        <p className="alert warn small" role="alert">
          Les photos des plantes pèsent {sizeText(plan.bytes)} : trop pour un seul fichier. Faites la sauvegarde sans photos.
        </p>
      )}
      <button className="btn" disabled={busy || !plan.ok} onClick={() => void run()}>
        {busy ? <span className="spinner" /> : <Icon name="download" />} {busy ? 'Préparation du fichier…' : 'Faire la sauvegarde complète'}
      </button>
      {msg && (
        <p className={msg.ok ? 'small' : 'alert error small'} role={msg.ok ? 'status' : 'alert'} style={{ margin: 0 }}>
          {msg.text}
        </p>
      )}
    </div>
  )
}

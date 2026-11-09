import { useState } from 'react'
import { Icon } from '../../components/Icon'
import { PhotoThumb } from '../../components/PhotoThumb'
import { isoDate } from '../../lib/dates'
import { recordWithToast } from '../../lib/history'
import { agoText, cleanNote, isDay, journalEntries, JOURNAL_NOTE_MAX, pruneMeta, withPhotoMeta, type JournalEntry } from '../../lib/journal'
import { isFullError, MESSAGE_FULL, savePhoto } from '../../lib/photos'
import { LIMITS } from '../../lib/security/limits'
import { getState, updatePlant } from '../../lib/store'
import type { PhotoMeta, Plant } from '../../types'
import { BeforeAfter, dayLabel } from './BeforeAfter'
import '../../styles/journal.css'

type Meta = Record<string, PhotoMeta> | undefined

/** Modification de la date et de la note d'une photo. Une date vide veut dire « date inconnue ». */
function EntryEditor({ entry, today, onSave, onCancel }: { entry: JournalEntry; today: string; onSave: (at: string | null, note: string) => void; onCancel: () => void }) {
  const [at, setAt] = useState(entry.at ?? '')
  const [note, setNote] = useState(entry.note ?? '')
  const bad = at !== '' && !isDay(at)
  return (
    <form
      className="journal-edit stack"
      onSubmit={(e) => {
        e.preventDefault()
        if (!bad) onSave(at === '' ? null : at, note)
      }}
    >
      <label className="field">
        <span>Date de la photo</span>
        <input className="input" type="date" max={today} value={at} onChange={(e) => setAt(e.target.value)} />
      </label>
      <label className="field">
        <span>Note (facultatif)</span>
        <input className="input" value={note} maxLength={JOURNAL_NOTE_MAX} autoComplete="off" onChange={(e) => setNote(e.target.value)} />
      </label>
      {bad && (
        <p className="alert error small" role="alert" style={{ margin: 0 }}>
          Cette date n’existe pas. Choisissez-en une autre, ou videz le champ.
        </p>
      )}
      <div className="journal-actions">
        <button type="submit" className="btn small primary" disabled={bad}>
          <Icon name="check" size={16} /> Enregistrer
        </button>
        <button type="button" className="btn small" onClick={onCancel}>
          Annuler
        </button>
      </div>
    </form>
  )
}

/** La frise : une entrée par photo, les plus récentes d'abord. Présentation seule (les actions viennent de `PlantJournal`). */
export function JournalList({
  entries,
  today,
  editingId,
  onEdit,
  onSave,
  onRemove,
}: {
  entries: readonly JournalEntry[]
  today: string
  editingId?: string
  onEdit: (id: string | undefined) => void
  onSave: (id: string, at: string | null, note: string) => void
  onRemove: (id: string) => void
}) {
  return (
    <ol className="journal-list">
      {entries.map((e) => {
        const ago = agoText(e.at, today)
        const label = e.at ? `du ${dayLabel(e.at)}` : '(date inconnue)'
        return (
          <li key={e.id} className={'journal-item' + (editingId === e.id ? ' editing' : '')}>
            <PhotoThumb id={e.id} zoomable />
            <div className="journal-body">
              {editingId === e.id ? (
                <EntryEditor entry={e} today={today} onSave={(at, note) => onSave(e.id, at, note)} onCancel={() => onEdit(undefined)} />
              ) : (
                <>
                  <p className="journal-date">
                    <strong>{dayLabel(e.at)}</strong>
                    {ago && <span className="muted small journal-ago">{ago}</span>}
                  </p>
                  {e.note && <p className="journal-note">{e.note}</p>}
                  {!e.at && <p className="small muted journal-hint">Photo ancienne : touchez « Modifier » pour ajouter sa date.</p>}
                  <div className="journal-actions">
                    <button type="button" className="btn small" aria-label={`Modifier la date et la note de la photo ${label}`} onClick={() => onEdit(e.id)}>
                      Modifier
                    </button>
                    <button type="button" className="btn small" aria-label={`Supprimer la photo ${label}`} onClick={() => onRemove(e.id)}>
                      Supprimer
                    </button>
                  </div>
                </>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

/** Journal d'une plante : photos datées, notes, comparaison avant / après. Les photos restent sur l'appareil. */
export function PlantJournal({ plant }: { plant: Plant }) {
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [editingId, setEditingId] = useState<string>()
  const today = isoDate()
  const entries = journalEntries(plant.photos, plant.photoMeta)
  const full = plant.photos.length >= LIMITS.photosPerPlant

  const current = () => getState().plants.find((p) => p.id === plant.id) ?? plant

  async function addPhotos(input: HTMLInputElement) {
    let files = Array.from(input.files ?? [])
    input.value = '' // permet de rechoisir la même photo
    if (!files.length) return
    const room = LIMITS.photosPerPlant - current().photos.length
    if (room <= 0) {
      setError(`Une plante garde ${LIMITS.photosPerPlant} photos au plus. Supprimez-en une pour en ajouter.`)
      return
    }
    const tooMany = files.length > room
    files = files.slice(0, room)
    setBusy(true)
    setError(undefined)
    const ids: string[] = []
    let failed = 0
    let spaceFull = false
    for (const f of files) {
      try {
        ids.push(await savePhoto(f))
      } catch (e) {
        failed++
        if (isFullError(e)) spaceFull = true
        console.warn('Photo non enregistrée', e)
      }
    }
    if (ids.length) {
      const cur = current()
      // La date est celle du jour (jamais celle du fichier : l'EXIF est retiré) ; elle se change ensuite avec « Modifier ».
      const clean = cleanNote(note)
      let meta: Meta = cur.photoMeta
      for (const id of ids) meta = withPhotoMeta(meta, id, { at: today, note: clean || undefined })
      updatePlant(plant.id, { photos: [...cur.photos, ...ids], photoMeta: meta })
      setNote('')
    }
    if (failed && spaceFull) setError(MESSAGE_FULL)
    else if (failed) setError(failed === files.length ? 'La photo n’a pas pu être enregistrée. Essayez une autre photo, ou libérez de la place sur l’appareil.' : `${failed} photo(s) sur ${files.length} n’ont pas pu être enregistrées.`)
    else if (tooMany) setError(`Une plante garde ${LIMITS.photosPerPlant} photos au plus : les premières ont été ajoutées.`)
    setBusy(false)
  }

  function save(id: string, at: string | null, text: string) {
    const before = current().photoMeta
    const next = withPhotoMeta(before, id, { at, note: text })
    setEditingId(undefined)
    const set = (photoMeta: Meta) => updatePlant(plant.id, { photoMeta })
    set(next)
    recordWithToast({ label: 'Changement de la date ou de la note d’une photo', undo: () => set(before), redo: () => set(next) }, 'Photo mise à jour.')
  }

  function remove(id: string) {
    const cur = current()
    const photos = cur.photos.filter((x) => x !== id)
    const before = { photos: cur.photos, photoMeta: cur.photoMeta }
    const after = { photos, photoMeta: pruneMeta(cur.photoMeta, photos) }
    const set = (v: { photos: string[]; photoMeta: Meta }) => updatePlant(plant.id, v)
    set(after)
    recordWithToast({ label: 'Suppression d’une photo', undo: () => set(before), redo: () => set(after) }, 'Photo supprimée.')
  }

  return (
    <section className="journal" data-feat="journal" aria-label="Journal de la plante">
      <h3>Journal</h3>
      <p className="small muted journal-intro">Chaque photo garde sa date. Reprenez-en de temps en temps pour voir votre plante grandir.</p>
      <div className="journal-add stack" data-feat="photos-plante">
        <label className="field">
          <span>Note pour la prochaine photo (facultatif)</span>
          <input className="input" value={note} maxLength={JOURNAL_NOTE_MAX} autoComplete="off" placeholder="Première fleur, après la taille…" onChange={(e) => setNote(e.target.value)} />
        </label>
        <label className={'btn photo-add journal-add-btn' + (full ? ' disabled' : '')}>
          {busy ? <span className="spinner" /> : <Icon name="camera" />}
          <span>Ajouter une photo au journal</span>
          <input className="sr-only" type="file" accept="image/*" multiple disabled={busy || full} onChange={(e) => void addPhotos(e.target)} />
        </label>
        {full && <p className="small muted">Une plante garde {LIMITS.photosPerPlant} photos au plus. Supprimez-en une pour en ajouter.</p>}
        {error && (
          <p className="alert error small" role="alert" style={{ margin: 0 }}>
            {error}
          </p>
        )}
      </div>
      {entries.length === 0 ? (
        <p className="small muted journal-empty">Aucune photo pour l’instant. La première sera datée d’aujourd’hui.</p>
      ) : (
        <JournalList entries={entries} today={today} editingId={editingId} onEdit={setEditingId} onSave={save} onRemove={remove} />
      )}
      {entries.length >= 2 && <BeforeAfter entries={entries} today={today} />}
    </section>
  )
}

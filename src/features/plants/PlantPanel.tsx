import { SPECIES_BY_ID } from '../../data/species'
import { CATEGORY_LABEL, STATUS_LABEL, TASK_ICON } from '../../data/labels'
import { Icon } from '../../components/Icon'
import { PhotoThumb } from '../../components/PhotoThumb'
import { deletePhoto, savePhoto } from '../../lib/photos'
import { addPlant, getState, removePlant, updatePlant, useGardenPlants } from '../../lib/store'
import { showToast } from '../../lib/toast'
import { cleanCustomName } from '../../lib/customName'
import { frMeters, frNumber } from '../../lib/format'
import { openScan } from '../scan/scanUi'
import { closePlantSheet, openSpecies, setUi, startMoving, startPlacing } from '../../lib/ui'
import { plantAgeYears, plantSizeAt } from '../../engine/growth'
import { companionReport, legalDistance } from '../../engine/planting'
import type { Garden, Plant, PlantStatus } from '../../types'
import { useEffect, useState } from 'react'
import { useTasks } from '../tasks/useTasks'

export function plantName(p: Plant): string {
  return p.customName || SPECIES_BY_ID[p.speciesId]?.nomCommun || 'Plante inconnue'
}

export function PlantPanel({ garden, plant, onClose }: { garden: Garden; plant: Plant; onClose?: () => void }) {
  const plants = useGardenPlants(garden.id)
  const species = SPECIES_BY_ID[plant.speciesId]
  const { tasks } = useTasks(garden)
  const myTasks = tasks.filter((t) => t.plantIds.includes(plant.id) && !t.done)
  const now = new Date()
  const size = species ? plantSizeAt(plant, species, now) : undefined
  const report = species ? companionReport(plant, plants, SPECIES_BY_ID) : { amis: [], ennemis: [] }
  const legal = species ? legalDistance(species, plant.position, garden.parcel) : undefined

  const [name, setName] = useState(plant.customName ?? '')
  useEffect(() => setName(plant.customName ?? ''), [plant.id, plant.customName])
  const [photoBusy, setPhotoBusy] = useState(false)
  const [photoError, setPhotoError] = useState<string>()

  async function addPhotos(input: HTMLInputElement) {
    const files = Array.from(input.files ?? [])
    input.value = '' // permet de rechoisir la même photo
    if (!files.length) return
    setPhotoBusy(true)
    setPhotoError(undefined)
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
    if (ids.length) updatePlant(plant.id, { photos: [...(getState().plants.find((p) => p.id === plant.id)?.photos ?? plant.photos), ...ids] })
    if (failed) setPhotoError(failed === files.length ? "La photo n’a pas pu être enregistrée. Essayez une autre photo, ou libérez de la place sur l’appareil." : `${failed} photo(s) sur ${files.length} n’ont pas pu être enregistrées.`)
    setPhotoBusy(false)
  }

  function removePhoto(id: string) {
    updatePlant(plant.id, { photos: plant.photos.filter((x) => x !== id) })
    showToast({
      message: 'Photo supprimée.',
      actionLabel: 'Annuler',
      onAction: () => {
        const cur = getState().plants.find((p) => p.id === plant.id)
        if (cur && !cur.photos.includes(id)) updatePlant(plant.id, { photos: [...cur.photos, id] })
      },
      onExpire: () => {
        // Supprimée pour de bon, sauf si elle a été remise entre-temps.
        const cur = getState().plants.find((p) => p.id === plant.id)
        if (!cur?.photos.includes(id)) void deletePhoto(id)
      },
    })
  }

  function remove() {
    const name = plantName(plant)
    removePlant(plant.id, { keepPhotos: true })
    closePlantSheet()
    showToast({
      message: `« ${name} » est supprimée du jardin.`,
      actionLabel: 'Annuler',
      onAction: () => addPlant(plant),
      // Les photos ne sont effacées qu'une fois le délai d'annulation passé.
      onExpire: () => {
        if (!getState().plants.some((p) => p.id === plant.id)) plant.photos.forEach((id) => void deletePhoto(id))
      },
    })
  }

  const ageYears = plantAgeYears(plant, now)

  return (
    <div className="stack plants-ui" style={{ gap: 12 }}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'nowrap' }}>
        <div style={{ minWidth: 0 }}>
          <h2 style={{ marginBottom: 2 }}>{plantName(plant)}</h2>
          {species && (
            <div className="muted small">
              <i>{species.nomLatin}</i> · {CATEGORY_LABEL[species.categorie]}
            </div>
          )}
        </div>
        {onClose && (
          <button className="btn ghost small close-btn" onClick={onClose}>
            <Icon name="x" size={18} /> Fermer
          </button>
        )}
      </div>

      {!species && (
        <label className="field">
          <span>Nom de la plante</span>
          <input
            className="input"
            value={name}
            maxLength={80}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => {
              const clean = cleanCustomName(name)
              if (clean && clean !== plant.customName) updatePlant(plant.id, { customName: clean })
              setName(clean || (plant.customName ?? ''))
            }}
          />
        </label>
      )}

      <div className="grid cols-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 11rem), 1fr))', gap: 8 }}>
        <label className="field">
          <span>Où en est-elle ?</span>
          <select className="input" value={plant.status} onChange={(e) => updatePlant(plant.id, { status: e.target.value as PlantStatus })}>
            {Object.entries(STATUS_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>{plant.status === 'projet' ? 'Prévue le' : 'Plantée le'}</span>
          <input className="input" type="date" value={plant.plantedAt.slice(0, 10)} onChange={(e) => e.target.value && updatePlant(plant.id, { plantedAt: e.target.value })} />
        </label>
        {species?.vivace && (
          <label className="field">
            <span>Âge à la plantation (ans)</span>
            <input className="input" type="number" min={0} max={50} inputMode="decimal" placeholder="0" value={plant.ageAtPlanting ?? ''} onChange={(e) => updatePlant(plant.id, { ageAtPlanting: e.target.value === '' ? undefined : Math.max(0, Number(e.target.value) || 0) })} />
          </label>
        )}
      </div>
      {size && species && (
        <p className="small" style={{ margin: 0 }}>
          <strong>Aujourd’hui :</strong> {frMeters(size.heightM)} de haut, {frMeters(size.spreadM)} de large ({frNumber(ageYears)} {ageYears >= 2 ? 'ans' : 'an'}).
          <span className="muted" style={{ display: 'block' }}>
            Adulte : {frMeters(species.hauteurAdulteM)} de haut, {frMeters(species.envergureAdulteM)} de large.
          </span>
        </p>
      )}

      {myTasks.length > 0 && (
        <div>
          <h3>À faire</h3>
          <ul className="list small">
            {myTasks.map((t) => (
              <li key={t.key}>
                {TASK_ICON[t.type]} <strong>{t.title}</strong>
                {t.blockedBy && <span className="badge warn" style={{ marginLeft: 6 }}>{t.blockedBy}</span>}
                <div className="muted">{t.howTo}</div>
              </li>
            ))}
          </ul>
          <button className="btn small" onClick={() => setUi({ tab: 'entretien' })}>Voir toutes les tâches</button>
        </div>
      )}

      {legal && (
        <div className={'alert small ' + (legal.ok ? 'info' : '')}>
          <strong>Distance avec le voisin :</strong> {legal.message}
        </div>
      )}
      {(report.amis.length > 0 || report.ennemis.length > 0) && (
        <div className="small stack">
          {report.amis.length > 0 && (
            <p style={{ margin: 0 }}>
              <span className="badge green">Bonnes plantes voisines</span> {Array.from(new Set(report.amis.map(plantName))).join(', ')}
            </p>
          )}
          {report.ennemis.length > 0 && (
            <p style={{ margin: 0 }}>
              <span className="badge danger">Plantes à éviter à côté</span> {Array.from(new Set(report.ennemis.map(plantName))).join(', ')}
            </p>
          )}
        </div>
      )}

      <div>
        <h3>Photos</h3>
        <div className="row photo-row">
          {plant.photos.map((id) => (
            <div key={id} style={{ position: 'relative' }}>
              <PhotoThumb id={id} zoomable />
              <button className="photo-remove" aria-label="Supprimer cette photo" onClick={() => removePhoto(id)}>
                <span aria-hidden>
                  <Icon name="x" size={14} />
                </span>
              </button>
            </div>
          ))}
          <label className="btn small photo-add">
            {photoBusy ? <span className="spinner" /> : <Icon name="camera" />}
            <span className="small">Ajouter une photo</span>
            <input className="sr-only" type="file" accept="image/*" multiple disabled={photoBusy} onChange={(e) => void addPhotos(e.target)} />
          </label>
        </div>
        {photoError && <p className="alert error small" role="alert" style={{ marginTop: 8 }}>{photoError}</p>}
      </div>

      <label className="field">
        <span>Notes</span>
        <textarea className="input" rows={3} value={plant.notes ?? ''} onChange={(e) => updatePlant(plant.id, { notes: e.target.value })} placeholder="Variété, où vous l’avez achetée, observations…" />
      </label>

      <div className="stack panel-actions">
        <button className="btn" onClick={() => startMoving(plant.id)}>
          <Icon name="move" size={16} /> Déplacer cette plante
        </button>
        <button className="btn" onClick={() => openScan('mesures', { kind: 'plant', plantId: plant.id })}>
          <Icon name="pin" size={16} /> Placer par mesures
        </button>
        <button className="btn" onClick={() => startPlacing(plant.speciesId, { customName: plant.customName, series: true })}>
          <Icon name="plus" size={16} /> Ajouter une autre « {plantName(plant)} »
        </button>
        {species && (
          <button className="btn" onClick={() => openSpecies(species.id)}>
            <Icon name="book" size={16} /> Tout savoir sur cette espèce
          </button>
        )}
      </div>
      <div className="danger-zone">
        <button className="btn danger" onClick={remove}>
          <Icon name="trash" size={16} /> Supprimer cette plante
        </button>
      </div>
    </div>
  )
}

import { SPECIES_BY_ID } from '../../data/species'
import { CATEGORY_LABEL, STATUS_LABEL, SUN_LABEL, TASK_ICON, WATER_LABEL } from '../../data/labels'
import { Icon } from '../../components/Icon'
import { Blob, PlantPot, PlantScene } from '../../components/illustrations'
import { PhotoThumb } from '../../components/PhotoThumb'
import { RiskNotes } from '../../components/RiskNotes'
import { savePhoto } from '../../lib/photos'
import { addPlant, getState, removePlant, updatePlant, useGardenPlants } from '../../lib/store'
import { recordWithToast } from '../../lib/history'
import { cleanCustomName } from '../../lib/customName'
import { frMeters, frNumber } from '../../lib/format'
import { openScan } from '../scan/scanUi'
import { closePlantSheet, openSpecies, setUi, startMoving, startPlacing } from '../../lib/ui'
import { plantAgeYears, plantSizeAt } from '../../engine/growth'
import { companionReport, legalDistance } from '../../engine/planting'
import type { Garden, Plant, PlantStatus } from '../../types'
import { Fragment, useEffect, useState, type ComponentType, type ReactNode } from 'react'
import { MeasureSection } from './MeasureSection'
import { PurchaseSummary } from './PurchaseDialog'
import { NoteAssist } from './NoteAssist'
import { useTasks } from '../tasks/useTasks'

/** Note de position (distance à la limite, art. 671) : une phrase bien visible, le détail dessous. */
function PositionNote({ legal }: { legal: { ok: boolean; summary: string; message: string } }) {
  return (
    <section className={'position-note ' + (legal.ok ? 'ok' : 'warn')} aria-label="Position par rapport à la limite">
      <p className="position-note-main">
        <span aria-hidden>{legal.ok ? '✓' : '⚠'}</span> {legal.summary}
      </p>
      <details>
        <summary>En savoir plus</summary>
        <p className="small">{legal.message}</p>
      </details>
    </section>
  )
}

export function plantName(p: Plant): string {
  return p.customName || SPECIES_BY_ID[p.speciesId]?.nomCommun || 'Plante inconnue'
}

/** « plantée le 12 mai » / « prévue le 3 mars » (sans l'année : la fiche donne l'âge à côté). */
function plantedLabel(plant: Plant): string {
  const d = new Date(plant.plantedAt)
  if (Number.isNaN(d.getTime())) return ''
  const day = d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })
  return plant.status === 'projet' ? `prévue le ${day}` : `plantée le ${day}`
}

/**
 * Fiche d'une plante. `fiche` : plein écran de la maquette (grande illustration, feuille blanche, pastilles, deux boutons).
 * Sans `fiche` : panneau compact (feuille du bas de la carte, colonne de droite sur grand écran).
 */
export function PlantPanel({ garden, plant, onClose, fiche, onShowOnMap }: { garden: Garden; plant: Plant; onClose?: () => void; fiche?: boolean; onShowOnMap?: () => void }) {
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
    const before = plant.photos
    updatePlant(plant.id, { photos: plant.photos.filter((x) => x !== id) })
    const set = (photos: string[]) => updatePlant(plant.id, { photos })
    recordWithToast({ label: 'Suppression d’une photo', undo: () => set(before), redo: () => set(before.filter((x) => x !== id)) }, 'Photo supprimée.')
  }

  function remove() {
    const name = plantName(plant)
    removePlant(plant.id, { keepPhotos: true }) // les photos restent : purgées au démarrage suivant seulement si la plante n'est pas revenue
    closePlantSheet()
    recordWithToast(
      { label: `Suppression de « ${name} »`, undo: () => addPlant(plant), redo: () => removePlant(plant.id, { keepPhotos: true }) },
      `« ${name} » est supprimée du jardin.`,
    )
  }

  const ageYears = plantAgeYears(plant, now)
  // Fiche : le haut reproduit la maquette (premier écran) ; le reste (champs, photos, actions) vient dessous.
  const Top = (fiche ? 'div' : Fragment) as ComponentType<{ className?: string; children?: ReactNode }>

  const nameField = !species && (
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
  )
  const fields = (
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
  )
  const now_ = size && species && (
    <div className={'plant-now' + (fiche ? ' plant-now-fiche' : '')}>
      {fiche ? (
        <>
          <strong>Dans mon jardin</strong>
          <span>
            {frMeters(size.heightM)} de haut · {frMeters(size.spreadM)} de large · {frNumber(ageYears)} {ageYears >= 2 ? 'ans' : 'an'}
          </span>
        </>
      ) : (
        <p className="small" style={{ margin: 0 }}>
          <strong>Aujourd’hui :</strong> {frMeters(size.heightM)} de haut, {frMeters(size.spreadM)} de large ({frNumber(ageYears)} {ageYears >= 2 ? 'ans' : 'an'}).
          <span className="muted" style={{ display: 'block' }}>
            Adulte : {frMeters(species.hauteurAdulteM)} de haut, {frMeters(species.envergureAdulteM)} de large.
          </span>
        </p>
      )}
    </div>
  )

  return (
    <div className={fiche ? 'fiche plants-ui' : 'stack plants-ui'} style={fiche ? undefined : { gap: 12 }}>
      {fiche && (
        <div className="fiche-hero">
          <Blob size={330} height={280} className="fh-blob" />
          <PlantPot size={200} className="fh-plant" />
          {onClose && (
            <button className="fiche-back" onClick={onClose} aria-label="Fermer la fiche et revenir à la liste">
              <Icon name="back" size={22} />
            </button>
          )}
        </div>
      )}
      <div className={fiche ? 'fiche-sheet stack' : 'stack'} style={fiche ? undefined : { gap: 12 }}>
      <Top {...(fiche ? { className: 'fiche-top stack' } : {})}>
      {fiche ? (
        <div>
          <h2 className="fiche-name">{plantName(plant)}</h2>
          {species && (
            <p className="fiche-latin">
              {species.nomLatin} · {plantedLabel(plant)}
            </p>
          )}
        </div>
      ) : (
      <div className="row plant-head" style={{ justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'nowrap' }}>
        <PlantScene size={76} className="plant-head-art" />
        <div style={{ minWidth: 0, flex: 1 }}>
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
      )}

      {fiche && species && (
        <ul className="fiche-chips">
          <li>
            <Icon name="sun" size={22} />
            <span>{species.soleil.map((x) => SUN_LABEL[x]).join(' ou ')}</span>
          </li>
          <li>
            <Icon name="drop" size={22} />
            <span>{WATER_LABEL[species.eau]}</span>
          </li>
          <li>
            <Icon name="snow" size={22} />
            <span>Jusqu’à {species.rusticiteC.toLocaleString('fr-FR')} °C</span>
          </li>
        </ul>
      )}
      {fiche && now_}
      {fiche && (
        <div className="fiche-actions">
          {onShowOnMap && (
            <button className="fiche-btn primary" onClick={onShowOnMap}>
              Voir sur la carte
            </button>
          )}
          <button className="fiche-btn" aria-label="Mesurer pour placer la plante" onClick={() => openScan('mesures', { kind: 'plant', plantId: plant.id })}>
            Mesurer
          </button>
        </div>
      )}
      </Top>

      {fiche && size && species && (
        <p className="small muted" style={{ margin: 0 }}>
          Taille adulte : {frMeters(species.hauteurAdulteM)} de haut, {frMeters(species.envergureAdulteM)} de large.
        </p>
      )}
      {species && <RiskNotes species={species} />}
      {nameField}
      {!fiche && now_}
      {legal && <PositionNote legal={legal} />}

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

      <details className="np-details plant-details">
        <summary>Détails</summary>
        <div className="stack" style={{ gap: 12 }}>
      {fields}
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

      {species && <PurchaseSummary plantId={plant.id} />}
      {species && <MeasureSection plant={plant} species={species} name={plantName(plant)} />}

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
      <NoteAssist plant={plant} species={species} />

      <div className="stack panel-actions">
        <button className="btn" onClick={() => startMoving(plant.id)}>
          <Icon name="move" size={16} /> Déplacer cette plante
        </button>
        {!fiche && (
          <button className="btn" onClick={() => openScan('mesures', { kind: 'plant', plantId: plant.id })}>
            <Icon name="pin" size={16} /> Placer par mesures
          </button>
        )}
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
      </details>
      </div>
    </div>
  )
}

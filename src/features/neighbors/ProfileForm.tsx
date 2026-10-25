import { useState } from 'react'
import { Modal } from '../../components/Modal'
import { saveProfile } from '../../lib/neighbors/api'
import { isValidCoord, roundCell } from '../../lib/neighbors/cell'
import { CELL_SIZE_CHOICES, CELL_SIZE_EXPLAIN, cellPreview, cellSizeLabel, gardenNeighborhoodText, neighborhoodText } from '../../lib/neighbors/logic'
import { NEIGHBORS_LIMITS, type CellSize, type Profile } from '../../lib/neighbors/types'
import type { Garden } from '../../types'
import { ErrorBox } from './common'
import { errorText } from './hooks'

/**
 * Pseudo + quartier. Le quartier vient du centre du jardin actif, arrondi ICI (environ 2 km, ou environ 5 km au choix),
 * après confirmation. Seule la cellule arrondie est envoyée : jamais l'adresse ni la position exacte.
 * Aucune coordonnée en degrés n'est montrée.
 */
export function ProfileForm({ initial, garden, online, onSaved, onCancel }: { initial?: Profile; garden: Garden; online: boolean; onSaved: (p: Profile) => void; onCancel?: () => void }) {
  const [pseudo, setPseudo] = useState(initial?.pseudo ?? '')
  const [size, setSize] = useState<CellSize>(initial?.cellSize ?? 'standard')
  // Point de départ du quartier : le centre du jardin (après accord), ou la cellule déjà enregistrée. Jamais envoyé tel quel :
  // saveProfile l'arrondit sur la grille de la taille choisie.
  const [source, setSource] = useState<{ lat: number; lon: number } | undefined>(initial?.cell)
  const cell = source ? roundCell(source.lat, source.lon, size) : undefined
  const [asking, setAsking] = useState(false)
  const [confirmChange, setConfirmChange] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  const gardenOk = isValidCoord(garden.center.lat, garden.center.lon)
  const preview = gardenOk ? cellPreview(garden.center.lat, garden.center.lon, size) : undefined
  const pseudoOk = pseudo.trim().length >= NEIGHBORS_LIMITS.pseudoMin

  // Le quartier enregistré est celui du jardin ? Alors un changement de taille repart du jardin, pas de l'ancienne cellule.
  function chooseSize(next: CellSize) {
    if (next === size) return
    if (gardenOk && initial && source && source === initial.cell) {
      const g = roundCell(garden.center.lat, garden.center.lon, initial.cellSize)
      if (g.lat === initial.cell.lat && g.lon === initial.cell.lon) setSource(garden.center)
    }
    setSize(next)
  }

  const changed = !!initial && !!cell && (size !== initial.cellSize || cell.lat !== initial.cell.lat || cell.lon !== initial.cell.lon)

  async function save() {
    if (!cell || !source) return
    setConfirmChange(false)
    setBusy(true)
    setError(undefined)
    try {
      onSaved(await saveProfile({ pseudo, lat: source.lat, lon: source.lon, cellSize: size }))
    } catch (e) {
      setError(errorText(e))
      setBusy(false)
    }
  }

  return (
    <>
      <form
        className="card stack"
        onSubmit={(e) => {
          e.preventDefault()
          if (!pseudoOk || !cell || busy) return
          if (changed) setConfirmChange(true)
          else void save()
        }}
      >
        <h2>{initial ? 'Mon profil' : 'Créez votre profil'}</h2>
        {!initial && <p style={{ margin: 0 }}>Les voisins verront seulement votre pseudo et votre commune.</p>}
        <label className="field">
          <span>Pseudo (3 à 24 lettres)</span>
          <input className="input" value={pseudo} maxLength={NEIGHBORS_LIMITS.pseudoMax} autoComplete="nickname" onChange={(e) => setPseudo(e.target.value)} placeholder="Jardinier du coin" />
        </label>
        <div className="stack">
          <strong>Quartier</strong>
          {cell ? (
            <p style={{ margin: 0 }}>
              <span className="badge green">{neighborhoodText(cell, garden, size)}</span> <span className="small muted">(zone d’{cellSizeLabel(size)})</span>
            </p>
          ) : (
            <p className="small muted" style={{ margin: 0 }}>
              Pas encore choisi.
            </p>
          )}
          <fieldset className="nb-fieldset">
            <legend>Taille de la zone</legend>
            {CELL_SIZE_CHOICES.map((c) => (
              <label key={c.id} className="nb-radio nb-size">
                <input type="radio" name="cell-size" checked={size === c.id} onChange={() => chooseSize(c.id)} />
                <span>
                  <strong>{c.title}</strong>
                  <span className="small muted" style={{ display: 'block' }}>
                    {c.help}
                  </span>
                </span>
              </label>
            ))}
            <p className="small muted" style={{ margin: '6px 0 0' }}>
              {CELL_SIZE_EXPLAIN}
            </p>
          </fieldset>
          <button type="button" className="btn" disabled={!gardenOk} onClick={() => setAsking(true)}>
            {cell ? 'Prendre à nouveau' : 'Utiliser'} l’emplacement de « {garden.name} »
          </button>
          <p className="small muted" style={{ margin: 0 }}>
            Votre position est arrondie. Votre adresse n’est jamais envoyée.
          </p>
        </div>
        {error && <ErrorBox message={error} />}
        {!online && <p className="small warn-text" style={{ margin: 0 }}>Pas de réseau : reconnectez-vous pour enregistrer.</p>}
        <div className="row">
          <button className="btn primary" type="submit" disabled={!pseudoOk || !cell || busy || !online}>
            {busy && <span className="spinner" />} Enregistrer
          </button>
          {onCancel && (
            <button type="button" className="btn ghost" onClick={onCancel} disabled={busy}>
              Annuler
            </button>
          )}
        </div>
      </form>
      {confirmChange && cell && (
        <Modal title="Changer votre quartier ?" onClose={() => setConfirmChange(false)}>
          <div className="stack">
            <p style={{ margin: 0 }}>
              Les voisins verront : <strong>{neighborhoodText(cell, garden, size)}</strong>. C’est une zone d’{cellSizeLabel(size)}.
            </p>
            <p className="small muted" style={{ margin: 0 }}>
              Vos anciennes annonces gardent leur ancienne zone. Les nouvelles prendront celle-ci.
            </p>
            <div className="row consent-actions">
              <button type="button" className="btn" onClick={() => setConfirmChange(false)}>
                Annuler
              </button>
              <button type="button" className="btn primary" onClick={() => void save()}>
                C’est d’accord
              </button>
            </div>
          </div>
        </Modal>
      )}
      {asking && preview && (
        <Modal title="Votre quartier" onClose={() => setAsking(false)}>
          <div className="stack">
            <p style={{ margin: 0 }}>
              Les voisins verront : <strong>{gardenNeighborhoodText(garden)}</strong>. C’est une zone d’{cellSizeLabel(size)}.
            </p>
            <p className="small muted" style={{ margin: 0 }}>
              Votre adresse et la position exacte de votre jardin restent sur votre appareil.
            </p>
            <div className="row consent-actions">
              <button type="button" className="btn" onClick={() => setAsking(false)}>
                Annuler
              </button>
              <button
                type="button"
                className="btn primary"
                onClick={() => {
                  setSource(garden.center)
                  setAsking(false)
                }}
              >
                C’est d’accord
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}

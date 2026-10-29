import { useState } from 'react'
import { Icon } from '../../components/Icon'
import { yourPlant } from '../../lib/customName'
import { isoDate } from '../../lib/dates'
import { formatDay, frMeters } from '../../lib/format'
import {
  MAX_HEIGHT_M,
  MAX_SPREAD_M,
  addMeasurement,
  compareSentence,
  differs,
  expectedVsAdjusted,
  parseMeasure,
  remindersEnabled,
  removeMeasurement,
  setRemindersEnabled,
} from '../../lib/measure'
import { measureAdvice } from '../../lib/purchase'
import { getState, updatePlant } from '../../lib/store'
import { showToast } from '../../lib/toast'
import { plantSizeAt } from '../../engine/growth'
import type { Plant, PlantMeasurement, Species } from '../../types'

/** « Mesurer ma plante » : hauteur et largeur du jour, comparées à la prévue ; la courbe de croissance se recale. */
export function MeasureSection({ plant, species, name }: { plant: Plant; species: Species; name: string }) {
  const [h, setH] = useState('')
  const [w, setW] = useState('')
  const [error, setError] = useState<string>()
  const [remind, setRemind] = useState(remindersEnabled)
  const now = new Date()
  const list = plant.measurements ?? []
  const latest = list[0]
  const advice = remind ? measureAdvice(plant, now) : undefined

  const save = () => {
    const heightM = h.trim() ? parseMeasure(h, MAX_HEIGHT_M) : undefined
    const spreadM = w.trim() ? parseMeasure(w, MAX_SPREAD_M) : undefined
    if ((h.trim() && heightM === undefined) || (w.trim() && spreadM === undefined)) {
      setError('Écrivez un nombre en mètres, par exemple 1,5.')
      return
    }
    if (heightM === undefined && spreadM === undefined) {
      setError('Saisissez la hauteur, la largeur, ou les deux.')
      return
    }
    setError(undefined)
    const m: PlantMeasurement = { at: isoDate(), ...(heightM !== undefined ? { heightM } : {}), ...(spreadM !== undefined ? { spreadM } : {}) }
    const cur = getState().plants.find((p) => p.id === plant.id)?.measurements
    updatePlant(plant.id, { measurements: addMeasurement(cur, m) })
    setH('')
    setW('')
  }

  const remove = (m: PlantMeasurement) => {
    const cur = getState().plants.find((p) => p.id === plant.id)?.measurements
    updatePlant(plant.id, { measurements: removeMeasurement(cur, m.at) })
    showToast({
      message: 'Mesure supprimée.',
      actionLabel: 'Annuler',
      onAction: () => updatePlant(plant.id, { measurements: addMeasurement(getState().plants.find((p) => p.id === plant.id)?.measurements, m) }),
    })
  }

  // Comparaison pour la dernière mesure : prévision du calendrier à sa date, sans les mesures.
  let compare: { lines: string[]; adjusted: string } | undefined
  if (latest) {
    const at = new Date(latest.at.length === 10 ? `${latest.at}T12:00:00` : latest.at)
    const exp = plantSizeAt({ ...plant, measurements: undefined }, species, at)
    const lines: string[] = []
    if (latest.heightM !== undefined) lines.push(compareSentence(yourPlant(name), exp.heightM, latest.heightM))
    if (latest.spreadM !== undefined) lines.push(compareSentence(yourPlant(name), exp.spreadM, latest.spreadM, 'de large'))
    const { expected, adjusted } = expectedVsAdjusted(plant, species, now)
    const moved = differs(expected.heightM, adjusted.heightM) || differs(expected.spreadM, adjusted.spreadM)
    compare = {
      lines,
      adjusted: moved
        ? `La prévision est ajustée : aujourd’hui ${frMeters(adjusted.heightM)} de haut, ${frMeters(adjusted.spreadM)} de large (au lieu de ${frMeters(expected.heightM)} et ${frMeters(expected.spreadM)}).`
        : 'La prévision est proche de la réalité : rien à ajuster.',
    }
  }

  return (
    <div className="stack measure-box" style={{ gap: 8 }}>
      <h3>Mesurer ma plante</h3>
      <p className="muted small" style={{ margin: 0 }}>
        Mesurez au mètre ruban ou en comptant vos pas.
      </p>
      {advice && (
        <p className={'small ' + (advice.due ? 'alert info' : 'muted')} role="status" style={{ margin: 0 }}>
          {advice.text}
        </p>
      )}
      <p className="muted small" style={{ margin: 0 }}>
        Hauteur : du sol au sommet. Largeur : à l’endroit le plus large.
      </p>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 9rem), 1fr))', gap: 8 }}>
        <label className="field">
          <span>Hauteur (m)</span>
          <input className="input" inputMode="decimal" autoComplete="off" placeholder="1,5" value={h} onChange={(e) => setH(e.target.value)} />
        </label>
        <label className="field">
          <span>Largeur (m)</span>
          <input className="input" inputMode="decimal" autoComplete="off" placeholder="1,2" value={w} onChange={(e) => setW(e.target.value)} />
        </label>
      </div>
      {error && (
        <p className="alert error small" role="alert" style={{ margin: 0 }}>
          {error}
        </p>
      )}
      <button className="btn" onClick={save}>
        <Icon name="check" size={16} /> Enregistrer la mesure
      </button>
      {compare && (
        <div className="alert info small measure-compare" role="status">
          {compare.lines.map((l) => (
            <p key={l} style={{ margin: 0 }}>
              {l}
            </p>
          ))}
          <p style={{ margin: 0 }}>
            <strong>{compare.adjusted}</strong>
          </p>
        </div>
      )}
      {list.length > 0 && (
        <ul className="list small measure-list" aria-label="Mesures enregistrées">
          {list.map((m) => (
            <li key={m.at} className="row" style={{ justifyContent: 'space-between', flexWrap: 'nowrap', gap: 8 }}>
              <span>
                {formatDay(m.at, { year: true })} : {m.heightM !== undefined ? `${frMeters(m.heightM, 2)} de haut` : ''}
                {m.heightM !== undefined && m.spreadM !== undefined ? ', ' : ''}
                {m.spreadM !== undefined ? `${frMeters(m.spreadM, 2)} de large` : ''}
              </span>
              <button className="btn ghost small" aria-label={`Supprimer la mesure du ${formatDay(m.at, { year: true })}`} onClick={() => remove(m)}>
                <Icon name="trash" size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <label className="row small" style={{ gap: 8, minHeight: 44, alignItems: 'center', flexWrap: 'nowrap' }}>
        <input
          type="checkbox"
          checked={remind}
          onChange={(e) => {
            setRemind(e.target.checked)
            setRemindersEnabled(e.target.checked)
          }}
        />
        <span>Me rappeler de mesurer une fois par an</span>
      </label>
    </div>
  )
}

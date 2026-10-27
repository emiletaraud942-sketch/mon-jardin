import { useMemo, useState } from 'react'
import { SPECIES, matchesSpecies } from '../data/species'
import { CATEGORY_LABEL } from '../data/labels'
import type { Category, Species } from '../types'
import { cleanCustomName } from '../lib/customName'
import { Icon } from './Icon'
import { Modal } from './Modal'

export function normalize(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

export function searchSpecies(q: string, category?: Category | ''): Species[] {
  return SPECIES.filter((s) => (!category || s.categorie === category) && matchesSpecies(s, q))
}

/**
 * Choix d'une plante dans la liste. Avec `onPickCustom`, un bouton « Ma plante n'est pas dans la liste »
 * demande un nom et le renvoie tel quel (la plante est placée sans fiche).
 */
export function SpeciesPicker({
  title = 'Choisir une plante',
  onPick,
  onPickCustom,
  onScan,
  onClose,
}: {
  title?: string
  onPick: (s: Species) => void
  onPickCustom?: (name: string) => void
  /** Bouton « Scanner mon jardin » (recalage, photos, mesures). */
  onScan?: () => void
  onClose: () => void
}) {
  const [q, setQ] = useState('')
  const [custom, setCustom] = useState<string>()
  const [cat, setCat] = useState<Category | ''>('')
  const list = useMemo(() => searchSpecies(q, cat), [q, cat])
  return (
    <Modal title={title} onClose={onClose}>
      <div className="plants-ui">
      {custom === undefined && (
      <div className="row" style={{ marginBottom: 12 }}>
        <input className="input" style={{ flex: 2, minWidth: 160 }} autoFocus placeholder="Rechercher (pommier, tomate…)" aria-label="Rechercher une plante" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input" style={{ flex: 1, minWidth: 140 }} value={cat} onChange={(e) => setCat(e.target.value as Category | '')} aria-label="Type de plante">
          <option value="">Toutes</option>
          {Object.entries(CATEGORY_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </div>
      )}
      {onScan && custom === undefined && (
        <button className="btn custom-open" onClick={onScan}>
          <Icon name="camera" /> Scanner mon jardin
        </button>
      )}
      {onPickCustom && custom === undefined && (
        <button className="btn custom-open" onClick={() => setCustom(cleanCustomName(q))}>
          <Icon name="plus" /> Ma plante n’est pas dans la liste
        </button>
      )}
      {onPickCustom && custom !== undefined && (
        <form
          className="stack custom-form"
          onSubmit={(e) => {
            e.preventDefault()
            const name = cleanCustomName(custom)
            if (name) onPickCustom(name)
          }}
        >
          <label className="field">
            <span>Comment s’appelle votre plante ?</span>
            <input className="input" autoFocus value={custom} maxLength={80} placeholder="ex. Rosier de grand-mère" onChange={(e) => setCustom(e.target.value)} />
          </label>
          <div className="row">
            <button className="btn primary" type="submit" disabled={!cleanCustomName(custom)}>
              Continuer
            </button>
            <button className="btn" type="button" onClick={() => setCustom(undefined)}>
              Retour à la liste
            </button>
          </div>
          {!cleanCustomName(custom) && <p className="small muted" style={{ margin: 0 }}>Écrivez un nom pour continuer.</p>}
        </form>
      )}
      {custom === undefined && (
      <ul className="list">
        {list.map((s) => (
          <li key={s.id}>
            <button className="btn ghost" style={{ width: '100%', justifyContent: 'flex-start', gap: 10 }} onClick={() => onPick(s)}>
              <span className="dot" style={{ background: s.couleurAccent ?? s.couleur }} />
              <span style={{ textAlign: 'left' }}>
                {s.nomCommun} <span className="muted small"><i>{s.nomLatin}</i> · {CATEGORY_LABEL[s.categorie]}</span>
              </span>
            </button>
          </li>
        ))}
        {list.length === 0 && <li className="muted">Aucune plante ne correspond.</li>}
      </ul>
      )}
      </div>
    </Modal>
  )
}

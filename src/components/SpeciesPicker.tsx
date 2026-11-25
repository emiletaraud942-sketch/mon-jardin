import { useMemo, useState } from 'react'
import { SPECIES, SPECIES_BY_ID, matchesSpecies, sortByRelevance } from '../data/species'
import { useActiveGarden, useGardenPlants } from '../lib/store'
import { CATEGORY_LABEL } from '../data/labels'
import type { Category, Species, Sun } from '../types'
import { RiskBadges } from './RiskNotes'
import { cleanCustomName } from '../lib/customName'
import { invasiveWarning } from '../data/species/invasives'
import { Icon } from './Icon'
import { Modal } from './Modal'

export function normalize(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

export interface SpeciesFilters {
  category?: Category | ''
  /** Ne garde que les plantes qui acceptent cette exposition. */
  sun?: Sun | ''
  /** Ne garde que les plantes comestibles. */
  edible?: boolean
  /** Ne garde que les plantes sans risque connu (ni toxique, ni envahissante, ni épineuse…). */
  safe?: boolean
}

export function filterSpecies(q: string, f: SpeciesFilters = {}): Species[] {
  const found = SPECIES.filter(
    (s) =>
      (!f.category || s.categorie === f.category) &&
      (!f.sun || s.soleil.includes(f.sun)) &&
      (!f.edible || s.comestible) &&
      (!f.safe || !s.avertissements?.length) &&
      matchesSpecies(s, q),
  )
  return sortByRelevance(found, q) // exact, alias, début, contient
}

export function searchSpecies(q: string, category?: Category | ''): Species[] {
  return filterSpecies(q, { category })
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
  feat,
}: {
  feat?: string
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
  // La liste complète n'est plus montrée d'emblée : la grosse barre de recherche d'abord ; sans saisie, au plus 6 plantes déjà dans le jardin.
  const garden = useActiveGarden()
  const gardenPlants = useGardenPlants(garden?.id ?? '')
  const searching = q.trim().length >= 1 || cat !== ''
  const suggestions = useMemo(() => {
    const seen = new Set<string>()
    const out: Species[] = []
    for (const p of gardenPlants) {
      if (p.status === 'projet' || p.status === 'mort' || p.status === 'recoltee' || seen.has(p.speciesId)) continue
      const sp = SPECIES_BY_ID[p.speciesId]
      if (!sp) continue
      seen.add(p.speciesId)
      out.push(sp)
      if (out.length >= 6) break
    }
    return out
  }, [gardenPlants])
  const list = useMemo(() => (searching ? searchSpecies(q, cat) : suggestions), [q, cat, searching, suggestions])
  return (
    <Modal title={title} feat={feat} onClose={onClose}>
      <div className="plants-ui">
      {custom === undefined && (
      <div className="species-search-wrap">
        <input className="input species-search" type="text" inputMode="search" enterKeyHint="search" autoFocus autoComplete="off" placeholder="Chercher une plante…" aria-label="Rechercher une plante" value={q} onChange={(e) => setQ(e.target.value)} />
        <p className="small muted species-search-hint">Tapez un nom : pommier, tomate, lavande…</p>
        <details className="np-details species-cat">
          <summary>Filtrer par type de plante</summary>
          <select className="input" value={cat} onChange={(e) => setCat(e.target.value as Category | '')} aria-label="Type de plante">
            <option value="">Toutes</option>
            {Object.entries(CATEGORY_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </details>
      </div>
      )}
      {custom === undefined && <InvasiveNote query={q} />}
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
          <InvasiveNote query={custom} />
          {!cleanCustomName(custom) && <p className="small muted" style={{ margin: 0 }}>Écrivez un nom pour continuer.</p>}
        </form>
      )}
      {custom === undefined && !searching && suggestions.length > 0 && <p className="small muted species-sugg-title">Déjà dans votre jardin</p>}
      {custom === undefined && (searching || suggestions.length > 0) && (
      <ul className="list">
        {list.map((s) => (
          <li key={s.id}>
            <button className="btn ghost" style={{ width: '100%', justifyContent: 'flex-start', gap: 10 }} onClick={() => onPick(s)}>
              <span className="dot" style={{ background: s.couleurAccent ?? s.couleur }} />
              <span style={{ textAlign: 'left' }}>
                {s.nomCommun} <span className="muted small"><i>{s.nomLatin}</i> · {CATEGORY_LABEL[s.categorie]}</span> <RiskBadges species={s} />
              </span>
            </button>
          </li>
        ))}
        {searching && list.length === 0 && (
          <li className="muted">
            Aucune plante ne correspond.
            {onPickCustom && cleanCustomName(q) && (
              <button className="btn custom-open" style={{ marginTop: 8, width: '100%' }} onClick={() => onPickCustom(cleanCustomName(q))}>
                <Icon name="plus" /> Ajouter « {cleanCustomName(q)} » comme plante personnalisée
              </button>
            )}
          </li>
        )}
      </ul>
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
      </div>
    </Modal>
  )
}

/** Alerte douce : la Métropole Rouen Normandie déconseille de planter ces espèces (buddleia, renouée du Japon). */
function InvasiveNote({ query }: { query: string }) {
  const w = invasiveWarning(query)
  if (!w) return null
  return (
    <p className="alert small" role="note" data-feat="invasive-note">
      <strong>{w.titre} : à ne pas planter.</strong> {w.texte}
    </p>
  )
}

import { useEffect, useMemo, useRef, useState } from 'react'
import { SPECIES_BY_ID } from '../../data/species'
import { CATEGORY_LABEL, SUN_LABEL } from '../../data/labels'
import { filterSpecies } from '../../components/SpeciesPicker'
import { RiskBadges } from '../../components/RiskNotes'
import { Icon } from '../../components/Icon'
import { MetroNote } from '../../components/MetroNote'
import { useIsMobile } from '../../components/useMedia'
import { setUi, useUi } from '../../lib/ui'
import type { Category, Garden, Month, Sun } from '../../types'
import { SpeciesSheet } from './SpeciesSheet'
import { applyFilters, FILTERS, type FilterId } from './catalogueFilters'
import '../../styles/novice-pages.css'

export function CataloguePage({ garden }: { garden: Garden }) {
  const { speciesId } = useUi()
  const mobile = useIsMobile()
  const [q, setQ] = useState('')
  const [cat, setCat] = useState<Category | ''>('')
  const sheetRef = useRef<HTMLDivElement>(null)
  const [sun, setSun] = useState<Sun | ''>('')
  const [filters, setFilters] = useState<FilterId[]>([])
  const month = (new Date().getMonth() + 1) as Month
  const list = useMemo(() => applyFilters(filterSpecies(q, { category: cat, sun }), filters, garden, month), [q, cat, sun, filters, garden, month])
  const toggle = (id: FilterId) => setFilters((f) => (f.includes(id) ? f.filter((x) => x !== id) : [...f, id]))
  const selected = speciesId ? SPECIES_BY_ID[speciesId] : undefined

  // Ordinateur : la fiche s'ouvre à côté de la liste, on la ramène à l'écran.
  useEffect(() => {
    if (!speciesId || mobile) return
    sheetRef.current?.scrollIntoView({ block: 'nearest' })
  }, [speciesId, mobile])

  const listCard = (
    <div className="card catalogue-list">
      <ul className="list">
        {list.map((s) => (
          <li key={s.id} style={{ padding: 0 }}>
            <button
              className="btn ghost"
              style={{ width: '100%', justifyContent: 'flex-start', minHeight: 48, background: s.id === speciesId ? 'var(--accent-soft)' : undefined }}
              aria-current={s.id === speciesId ? 'true' : undefined}
              onClick={() => setUi({ speciesId: s.id })}
            >
              <span className="dot" style={{ background: s.couleurAccent ?? s.couleur }} />
              <span style={{ textAlign: 'left' }}>
                {s.nomCommun}
                <span className="muted small" style={{ display: 'block' }}>
                  {CATEGORY_LABEL[s.categorie]} <RiskBadges species={s} />
                </span>
              </span>
            </button>
          </li>
        ))}
        {list.length === 0 && (
          <li className="muted" style={{ padding: 8 }}>
            Aucune plante ne correspond.
            {filters.length > 0 && (
              <>
                {' '}
                <button className="btn small" onClick={() => setFilters([])}>
                  Retirer les filtres
                </button>
              </>
            )}
          </li>
        )}
      </ul>
    </div>
  )

  const sheetCard = (
    <div className="card sheet-card" ref={sheetRef}>
      {selected ? <SpeciesSheet species={selected} garden={garden} /> : <p className="muted">Choisissez une plante dans la liste.</p>}
    </div>
  )

  // Téléphone : la fiche prend tout l'écran, comme dans « Mes plantes » ; « Retour à la liste » ramène à la liste.
  if (selected && mobile) {
    return (
      <div className="page np-page plants-ui species-full">
        <button className="btn species-back" onClick={() => setUi({ speciesId: undefined })}>
          <Icon name="back" size={18} /> Retour à la liste
        </button>
        {sheetCard}
      </div>
    )
  }

  return (
    <div className="page np-page plants-ui">
      <h1>Catalogue des plantes ({list.length})</h1>
      <MetroNote garden={garden} />
      <div className="row" style={{ margin: '8px 0 16px' }}>
        <input
          className="input"
          type="search"
          style={{ flex: '2 1 220px' }}
          aria-label="Rechercher une plante"
          placeholder="Pommier, Malus, tomate…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select className="input" style={{ flex: '1 1 160px' }} value={cat} onChange={(e) => setCat(e.target.value as Category | '')} aria-label="Catégorie">
          <option value="">Toutes les catégories</option>
          {Object.entries(CATEGORY_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </div>
      <div className="row catalogue-filters" role="group" aria-label="Filtres" style={{ margin: '-8px 0 16px', alignItems: 'center' }}>
        <select className="input" style={{ flex: '1 1 160px' }} value={sun} onChange={(e) => setSun(e.target.value as Sun | '')} aria-label="Exposition">
          <option value="">Toutes les expositions</option>
          {Object.entries(SUN_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </div>
      <div className="row chip-filters" role="group" aria-label="Filtres">
        {FILTERS.map((f) => (
          <button key={f.id} className={'btn chip-filter' + (filters.includes(f.id) ? ' primary' : '')} aria-pressed={filters.includes(f.id)} title={f.help} onClick={() => toggle(f.id)}>
            {filters.includes(f.id) && <Icon name="check" size={16} />}
            {f.label}
          </button>
        ))}
      </div>
      <p className={filters.length > 0 ? 'small muted' : 'sr-only'} role="status" aria-live="polite" style={filters.length > 0 ? { margin: '0 0 8px' } : undefined}>
        {list.length} plante{list.length > 1 ? 's' : ''}
        {filters.length > 0 ? ' avec ces filtres.' : ''}
      </p>
      <div className="grid catalogue-grid">
        {listCard}
        {!mobile && sheetCard}
      </div>
    </div>
  )
}

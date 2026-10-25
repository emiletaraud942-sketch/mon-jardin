import { useEffect, useMemo, useRef, useState } from 'react'
import { SPECIES_BY_ID } from '../../data/species'
import { CATEGORY_LABEL } from '../../data/labels'
import { searchSpecies } from '../../components/SpeciesPicker'
import { BottomSheet, type SheetSnap } from '../../components/BottomSheet'
import { useIsMobile } from '../../components/useMedia'
import { setUi, useUi } from '../../lib/ui'
import type { Category, Garden } from '../../types'
import { SpeciesSheet } from './SpeciesSheet'
import '../../styles/novice-pages.css'

export function CataloguePage({ garden }: { garden: Garden }) {
  const { speciesId } = useUi()
  const mobile = useIsMobile()
  const [q, setQ] = useState('')
  const [cat, setCat] = useState<Category | ''>('')
  const [snap, setSnap] = useState<SheetSnap>(speciesId ? 'min' : 'mid')
  const sheetRef = useRef<HTMLDivElement>(null)
  const list = useMemo(() => searchSpecies(q, cat), [q, cat])
  const selected = speciesId ? SPECIES_BY_ID[speciesId] : undefined

  // La fiche s'ouvre sous la liste (ou au-dessus sur mobile) : on la ramène à l'écran.
  useEffect(() => {
    if (!speciesId) return
    sheetRef.current?.scrollIntoView({ block: mobile ? 'start' : 'nearest' })
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
              onClick={() => {
                setUi({ speciesId: s.id })
                if (mobile) setSnap('min')
              }}
            >
              <span className="dot" style={{ background: s.couleurAccent ?? s.couleur }} />
              <span style={{ textAlign: 'left' }}>
                {s.nomCommun}
                <span className="muted small" style={{ display: 'block' }}>
                  {CATEGORY_LABEL[s.categorie]}
                </span>
              </span>
            </button>
          </li>
        ))}
        {list.length === 0 && <li className="muted" style={{ padding: 8 }}>Aucune plante ne correspond.</li>}
      </ul>
    </div>
  )

  const sheetCard = (
    <div className="card sheet-card" ref={sheetRef}>
      {selected && mobile && (
        <button
          className="btn"
          style={{ marginBottom: 10 }}
          onClick={() => {
            setUi({ speciesId: undefined })
            setSnap('mid')
          }}
        >
          ‹ Retour à la liste
        </button>
      )}
      {selected ? <SpeciesSheet species={selected} garden={garden} /> : <p className="muted">Choisissez une plante dans la liste pour voir sa fiche : quand la planter, comment l’entretenir, ses voisines.</p>}
    </div>
  )

  return (
    <div className="page np-page">
      <h1>Catalogue des plantes ({list.length})</h1>
      <div className="row" style={{ margin: '8px 0 16px' }}>
        <input
          className="input"
          type="search"
          style={{ flex: '2 1 220px' }}
          aria-label="Rechercher une plante"
          placeholder="Pommier, Malus, tomate…"
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            if (mobile) setSnap('mid')
          }}
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
      {mobile ? (
        <>
          {sheetCard}
          <div style={{ height: 96 }} aria-hidden />
          <BottomSheet fixed label="Liste des plantes" title="Catalogue" summary={`${list.length} plante${list.length > 1 ? 's' : ''}`} snap={snap} onSnap={setSnap}>
            <div id="catalogue-liste">{listCard}</div>
          </BottomSheet>
        </>
      ) : (
        <div className="grid catalogue-grid">
          {listCard}
          {sheetCard}
        </div>
      )}
    </div>
  )
}

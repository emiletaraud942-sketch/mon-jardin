import { useEffect, useMemo, useRef, useState } from 'react'
import { SPECIES_BY_ID } from '../../data/species'
import { CATEGORY_LABEL, STATUS_LABEL, formatDate } from '../../data/labels'
import { Icon } from '../../components/Icon'
import { SpeciesPicker, normalize } from '../../components/SpeciesPicker'
import { PlaceAction } from '../../components/PlaceAction'
import { PhotoThumb } from '../../components/PhotoThumb'
import { useGardenPlants } from '../../lib/store'
import { UNKNOWN_SPECIES_ID } from '../../lib/customName'
import { closePlantSheet, setUi, startPlacing, useUi } from '../../lib/ui'
import type { Garden, PlantStatus } from '../../types'
import { PlantPanel, plantName } from './PlantPanel'
import { IdentifyDialog } from './IdentifyDialog'
import { openScan } from '../scan/scanUi'
import { PlantScene } from '../../components/illustrations'
import { useIsMobile } from '../../components/useMedia'

export function PlantsPage({ garden }: { garden: Garden }) {
  const plants = useGardenPlants(garden.id)
  const { selectedPlantId } = useUi()
  const [q, setQ] = useState('')
  const [status, setStatus] = useState<PlantStatus | ''>('')
  const [picking, setPicking] = useState(false)
  const [identifying, setIdentifying] = useState(false)
  const selected = plants.find((p) => p.id === selectedPlantId)
  const mobile = useIsMobile()
  // Sur téléphone la fiche s'ouvre sous la liste : on y amène l'écran, sinon rien ne semble se passer.
  const sheetRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (selected) sheetRef.current?.scrollIntoView({ block: 'start' })
  }, [selected?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const groups = useMemo(() => {
    const n = normalize(q)
    const list = plants.filter((p) => (!status || p.status === status) && (!n || normalize(plantName(p)).includes(n)))
    const by = new Map<string, typeof list>()
    for (const p of list) {
      const cat = SPECIES_BY_ID[p.speciesId] ? CATEGORY_LABEL[SPECIES_BY_ID[p.speciesId].categorie] : 'Autres'
      by.set(cat, [...(by.get(cat) ?? []), p])
    }
    return [...by.entries()].sort((a, b) => a[0].localeCompare(b[0], 'fr'))
  }, [plants, q, status])

  // Téléphone : la fiche prend tout l'écran (maquette) ; le bouton rond ramène à la liste.
  if (selected && mobile) {
    return <PlantPanel garden={garden} plant={selected} onClose={closePlantSheet} fiche onShowOnMap={() => setUi({ tab: 'carte', focusPlantId: selected.id, selectedPlantId: undefined })} />
  }

  return (
    <div className="page plants-ui">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h1>Mes plantes ({plants.length})</h1>
        <div className="row">
          <button className="btn" onClick={() => openScan('menu')}>
            <Icon name="camera" /> Scanner mon jardin
          </button>
          <button className="btn" onClick={() => setIdentifying(true)}>
            <Icon name="camera" /> Identifier par photo
          </button>
          <button className="btn primary" onClick={() => setPicking(true)}>
            <Icon name="plus" /> Ajouter une plante
          </button>
        </div>
      </div>
      <div className="row" style={{ margin: '8px 0 16px' }}>
        <input className="input" style={{ flex: '2 1 200px' }} type="search" aria-label="Rechercher une plante" placeholder="Rechercher une plante" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input" style={{ flex: '1 1 180px' }} value={status} onChange={(e) => setStatus(e.target.value as PlantStatus | '')} aria-label="Où en sont-elles ?">
          <option value="">Toutes les plantes</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </div>
      <div className="grid cols-2" style={{ alignItems: 'start' }}>
        <div className="card">
          {plants.length === 0 && (
            <div className="empty">
              <PlantScene size={132} />
              <p>
                <strong>Vous n’avez pas encore ajouté de plante.</strong>
              </p>
              <p>Ajoutez-les sur la carte, ou reconnaissez une plante grâce à une photo.</p>
              <div className="row empty-actions">
                <PlaceAction>
                  <Icon name="plus" /> Ajouter une plante
                </PlaceAction>
                <button className="btn" onClick={() => setIdentifying(true)}>
                  <Icon name="camera" /> Identifier par photo
                </button>
              </div>
            </div>
          )}
          {groups.map(([cat, list]) => (
            <div key={cat} style={{ marginBottom: 12 }}>
              <h3>{cat}</h3>
              <ul className="list">
                {list.map((p) => {
                  const s = SPECIES_BY_ID[p.speciesId]
                  return (
                    <li key={p.id}>
                      <button
                        className="btn ghost plant-row"
                        style={{ width: '100%', justifyContent: 'flex-start', gap: 10, background: p.id === selectedPlantId ? 'var(--accent-soft)' : undefined }}
                        onClick={() => setUi({ selectedPlantId: p.id })}
                      >
                        {p.photos[0] ? <PhotoThumb id={p.photos[0]} /> : <span className="dot" style={{ width: 16, height: 16, background: s?.couleurAccent ?? s?.couleur ?? 'var(--accent-2)' }} />}
                        <span style={{ textAlign: 'left', flex: 1 }}>
                          <strong>{plantName(p)}</strong>
                          <span className="muted small" style={{ display: 'block' }}>
                            {p.status === 'projet' ? `Prévue pour le ${formatDate(p.plantedAt)}` : `${p.status === 'en-place' ? '' : STATUS_LABEL[p.status] + ' · '}Plantée le ${formatDate(p.plantedAt)}`}
                          </span>
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>
        {selected && (
          <div className="card" ref={sheetRef} style={{ scrollMarginTop: 8 }}>
            <PlantPanel garden={garden} plant={selected} onClose={closePlantSheet} />
            <button className="btn" style={{ marginTop: 8 }} onClick={() => setUi({ tab: 'carte', focusPlantId: selected.id })}>
              <Icon name="map" size={16} /> Voir sur la carte
            </button>
          </div>
        )}
      </div>
      {picking && (
        <SpeciesPicker
          title="Quelle plante ajouter ?"
          onClose={() => setPicking(false)}
          onPick={(s) => {
            setPicking(false)
            startPlacing(s.id)
          }}
          onPickCustom={(name) => {
            setPicking(false)
            startPlacing(UNKNOWN_SPECIES_ID, { customName: name })
          }}
        />
      )}
      {identifying && <IdentifyDialog onClose={() => setIdentifying(false)} />}
    </div>
  )
}

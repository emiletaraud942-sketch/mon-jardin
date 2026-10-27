import { lazy, Suspense, useMemo, useState } from 'react'
import { BottomSheet, type SheetSnap } from '../../components/BottomSheet'
import { useIsMobile } from '../../components/useMedia'
import { SPECIES, SPECIES_BY_ID } from '../../data/species'
import { CATEGORY_LABEL } from '../../data/labels'
import { useGardenPlants } from '../../lib/store'
import { useLidarScene } from '../../lib/useLidar'
import { openSpecies, setUi, useUi } from '../../lib/ui'
import { PlaceAction } from '../../components/PlaceAction'
import { aspectLabel, slopeAt } from '../../lib/terrain'
import { doyToLabel } from '../../lib/weather'
import { obstaclesFor, seasonalSunHours } from '../../engine/sun'
import { recommendSpecies } from '../../engine/planting'
import { MONTH_NAMES, whatToSowNow } from '../../engine/calendar'
import type { Category, Garden, Month, Species, XY } from '../../types'
import { placePlant } from '../map/placing'
import { scoreLabel, slopePhrase, sunPhrase } from './scoreLabel'
import '../../styles/novice-pages.css'

const SpotPicker = lazy(() => import('./SpotPicker').then((m) => ({ default: m.SpotPicker })))

function SpeciesChips({ list }: { list: Species[] }) {
  if (list.length === 0) return <p className="muted small">Rien à faire ce mois-ci.</p>
  return (
    <div className="row">
      {list.map((s) => (
        <button key={s.id} className="btn small" onClick={() => openSpecies(s.id)}>
          <span className="dot" style={{ background: s.couleurAccent ?? s.couleur }} /> {s.nomCommun}
        </button>
      ))}
    </div>
  )
}

function SowNow({ garden }: { garden: Garden }) {
  const { sowMonth } = useUi()
  const month = (sowMonth ?? new Date().getMonth() + 1) as Month
  const setMonth = (m: Month) => setUi({ sowMonth: m })
  const now = useMemo(() => whatToSowNow(SPECIES, garden, month), [garden, month])
  return (
    <div className="card">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2>Ce que vous pouvez faire en</h2>
        <select className="input" style={{ width: 'auto' }} value={month} onChange={(e) => setMonth(Number(e.target.value) as Month)} aria-label="Mois">
          {MONTH_NAMES.map((m, i) => (
            <option key={m} value={i + 1}>
              {m}
            </option>
          ))}
        </select>
      </div>
      <details className="np-details">
        <summary>Détails</summary>
        {garden.lastFrostDoy ? (
          <p className="small muted">
            Chez vous, dernières gelées vers le {doyToLabel(garden.lastFrostDoy)}
            {garden.firstFrostDoy ? `, premières vers le ${doyToLabel(garden.firstFrostDoy)}` : ''} (moyenne sur 5 ans).
          </p>
        ) : (
          <p className="small muted">Dates de gel inconnues : conseils valables pour toute la France.</p>
        )}
        <p className="small muted">« À l’abri » : dans la maison, une serre ou un châssis.</p>
      </details>
      <h3>Semer à l’abri</h3>
      <SpeciesChips list={now.semisAbri} />
      <h3 style={{ marginTop: 12 }}>Semer en pleine terre</h3>
      <SpeciesChips list={now.semisPleineTerre} />
      <h3 style={{ marginTop: 12 }}>Planter</h3>
      <SpeciesChips list={now.plantation} />
      <h3 style={{ marginTop: 12 }}>Récolter</h3>
      <SpeciesChips list={now.recolte} />
    </div>
  )
}

function BestForSpot({ garden }: { garden: Garden }) {
  const plants = useGardenPlants(garden.id)
  // Emplacement et catégorie vivent dans l'état d'interface : ils survivent à la visite d'une fiche espèce.
  const { planting } = useUi()
  const mine = planting?.gardenId === garden.id ? planting : undefined
  const spot: XY | undefined = mine?.spot
  const cat: Category | '' = mine?.cat ?? ''
  const setSpot = (p: XY) => setUi({ planting: { gardenId: garden.id, spot: p, cat } })
  const mobile = useIsMobile()
  const [snap, setSnap] = useState<SheetSnap>('mid')
  const setCat = (c: Category | '') => setUi({ planting: { gardenId: garden.id, spot, cat: c } })

  // Arbres des environs (LiDAR HD, s'il est disponible) : leur ombre compte ; sinon comportement habituel.
  const lidar = useLidarScene(garden, plants)
  const analysis = useMemo(() => {
    if (!spot) return undefined
    const obstacles = obstaclesFor(garden, plants, SPECIES_BY_ID, new Date(), lidar.trees)
    const sun = seasonalSunHours(spot, garden, obstacles)
    const slope = lidar.terrain ? slopeAt(lidar.terrain, spot) : undefined
    const ctx = { garden, plants, speciesById: SPECIES_BY_ID, spot, sunHours: sun.moyenne, slopePct: slope?.pct }
    const recos = recommendSpecies(SPECIES, ctx, { categories: cat ? [cat] : undefined, limit: 15 })
    return { sun, slope, recos }
  }, [spot, garden, plants, cat, lidar.trees, lidar.terrain])

  const results = analysis && spot && (
    <>
      <div className="stack" style={{ gap: 6, margin: '8px 0' }}>
        <div>
          ☀ {sunPhrase(analysis.sun.moyenne)}
        </div>
        {analysis.slope && (
          <div>
            ⛰ {slopePhrase(analysis.slope.pct)}
            {analysis.slope.pct > 2 ? `, orientée ${aspectLabel(analysis.slope.aspectDeg)}` : ''}
          </div>
        )}
        <details className="np-details">
          <summary>Détails du soleil</summary>
          <p className="small muted" style={{ margin: 0 }}>
            En juin : {analysis.sun.juin.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} h. En mars : {analysis.sun.mars.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} h. En décembre :{' '}
            {analysis.sun.decembre.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} h. Ombre des maisons voisines et des arbres comprise.
          </p>
        </details>
        <label className="field">
          <span>Type de plante</span>
          <select className="input" value={cat} onChange={(e) => setCat(e.target.value as Category | '')}>
            <option value="">Toutes</option>
            {Object.entries(CATEGORY_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
      </div>
      {analysis.recos.length === 0 && (
        <p className="alert small" style={{ marginTop: 8 }}>
          Aucune plante ne convient à cet endroit{cat ? ' dans ce type' : ''}. Essayez un autre endroit{cat ? ' ou « Toutes »' : ''}.
        </p>
      )}
      {analysis.recos.length > 0 && (
        <ol className="np-steps" start={2} style={{ marginTop: 8 }}>
          <li>
            <span className="np-num" aria-hidden>2</span>
            <strong>Touchez « Prévoir ici » pour garder une plante.</strong>
          </li>
        </ol>
      )}
      <ul className="list" style={{ marginTop: 8 }}>
        {analysis.recos.map((r) => {
          const label = scoreLabel(r.score)
          const pros = r.factors.filter((f) => f.points > 0).slice(0, 4)
          const cons = r.factors.filter((f) => f.points < 0).slice(0, 4)
          return (
            <li key={r.species.id} className="np-reco">
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <button className="btn ghost" style={{ padding: '0 4px' }} onClick={() => openSpecies(r.species.id)}>
                  <span className="dot" style={{ background: r.species.couleurAccent ?? r.species.couleur }} /> {r.species.nomCommun}
                </button>
                <span className={'np-fit ' + (label.tone === 'green' ? 'green' : label.tone === 'danger' ? 'danger' : '')}>
                  <span aria-hidden>{label.icon}</span> {label.text}
                </span>
              </div>
              {r.warnings.length > 0 && <div className="small warn-text">Attention : {r.warnings.join(' · ')}</div>}
              <div className="row" style={{ marginTop: 6 }}>
                <button className="btn" onClick={() => placePlant(garden, r.species.id, spot, 'projet', { tab: 'carte' })}>
                  Prévoir ici
                </button>
              </div>
              <details className="np-details">
                <summary>Pourquoi ?</summary>
                <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
                  {pros.map((f) => (
                    <li key={'p' + f.label}>Pour : {f.label}</li>
                  ))}
                  {cons.map((f) => (
                    <li key={'c' + f.label}>Contre : {f.label}</li>
                  ))}
                  {pros.length + cons.length === 0 && <li>Rien de particulier.</li>}
                </ul>
              </details>
            </li>
          )
        })}
      </ul>
    </>
  )

  return (
    <div className="card">
      <h2>Quelle plante pour cet endroit ?</h2>
      <ol className="np-steps" style={{ marginBottom: 8 }}>
        <li>
          <span className="np-num" aria-hidden>1</span>
          <span>
            <strong>Touchez un endroit sur la carte.</strong>
            <span className="small muted" style={{ display: 'block' }}>L’appli calcule le soleil, la pente et les voisins.</span>
          </span>
        </li>
      </ol>
      <Suspense fallback={<div className="spot-map empty"><span className="spinner" /> Chargement de la carte…</div>}>
        <SpotPicker garden={garden} plants={plants} spot={spot} onPick={setSpot} />
      </Suspense>
      {analysis && spot && (mobile ? (
        <>
          <div style={{ height: 96 }} aria-hidden />
          <BottomSheet fixed label="Plantes conseillées" title="Plantes conseillées" summary={`${analysis.recos.length} idée${analysis.recos.length > 1 ? 's' : ''}`} snap={snap} onSnap={setSnap}>
            <div>{results}</div>
          </BottomSheet>
        </>
      ) : (
        <div style={{ marginTop: 12 }}>{results}</div>
      ))}
    </div>
  )
}

/** Explication quand le jardin n'est pas encore bien décrit : le calcul marche quand même, en moins précis. */
function ModelHint({ garden }: { garden: Garden }) {
  const plants = useGardenPlants(garden.id)
  const noParcel = !garden.parcel?.length
  const noPlants = plants.length === 0
  if (!noParcel && !noPlants) return null
  return (
    <div className="card empty-hint">
      <p style={{ marginTop: 0 }}>
        <strong>Plus votre jardin est décrit, plus le conseil est précis.</strong>
      </p>
      <details className="np-details">
        <summary>Détails</summary>
        <p className="small" style={{ margin: 0 }}>
          {noParcel ? 'Sans le contour du terrain, les distances aux voisins ne sont pas vérifiées. ' : ''}
          {noPlants ? 'Sans plantes placées, le soleil ignore l’ombre de vos arbres. ' : ''}
          C’est facultatif : vous pouvez commencer maintenant.
        </p>
      </details>
      <div className="row">
        <PlaceAction>Placer une plante</PlaceAction>
      </div>
    </div>
  )
}

export function PlantingPage({ garden }: { garden: Garden }) {
  return (
    <div className="page np-page">
      <h1>Où planter ?</h1>
      <ModelHint garden={garden} />
      <div className="grid cols-2" style={{ alignItems: 'start' }}>
        <BestForSpot garden={garden} />
        <SowNow garden={garden} />
      </div>
    </div>
  )
}

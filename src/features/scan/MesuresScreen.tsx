import { useMemo, useState } from 'react'
import { Icon } from '../../components/Icon'
import { Modal } from '../../components/Modal'
import { SpeciesPicker } from '../../components/SpeciesPicker'
import { UNKNOWN_SPECIES_ID } from '../../lib/customName'
import { distance as dist } from '../../lib/geo'
import { getUi, setUi } from '../../lib/ui'
import { getState, updatePlant, useGardenPlants } from '../../lib/store'
import { showToast } from '../../lib/toast'
import { placePlant } from '../map/placing'
import { updateQueue } from './queueStore'
import { moveItem } from './queue'
import { plantName } from '../plants/PlantPanel'
import type { Garden, XY } from '../../types'
import { proposePosition } from './capture'
import { GpsMeter, GpsProblemNote } from './ScanParts'
import { ScanMap, type MapCircle, type MapDot } from './ScanMap'
import { closeScan, openScan, type MeasureTarget } from './scanUi'
import { useGps } from './useGps'
import { circleIntersections, intersectionPrecisionM, nearestPoint, parseMeters, pointOnCircle, precisionText, singleCirclePrecisionM } from './trilat'

type Kind = 'coin' | 'moi' | 'plante' | 'carte'
const KIND_LABEL: Record<Kind, string> = { coin: 'Un coin de maison ou de terrain', moi: 'Ma position (recalée)', plante: 'Une autre plante', carte: 'Un point touché sur la carte' }

interface Ref {
  kind: Kind
  pos?: XY
  note?: string
  plantId?: string
  distance: string
}

const emptyRef = (): Ref => ({ kind: 'coin', distance: '' })

/** Coin de maison ou de terrain le plus proche du point touché (à 5 m au plus). */
export function snapCorner(garden: Garden, p: XY, maxM = 5): XY | undefined {
  const corners: XY[] = [...(garden.parcel ?? []), ...(garden.buildings ?? []).flatMap((b) => b.ring)]
  const c = nearestPoint(corners, p)
  return c && dist(c, p) <= maxM ? c : undefined
}

export function MesuresScreen({ garden, target }: { garden: Garden; target?: MeasureTarget }) {
  const plants = useGardenPlants(garden.id)
  const [refs, setRefs] = useState<Ref[]>([emptyRef()])
  const [active, setActive] = useState(0)
  const [chosen, setChosen] = useState<XY>()
  const [picking, setPicking] = useState(false)
  const gps = useGps(garden.center)

  const patch = (i: number, p: Partial<Ref>) => {
    setRefs((r) => r.map((x, k) => (k === i ? { ...x, ...p } : x)))
    setChosen(undefined)
  }
  const radius = (r: Ref) => parseMeters(r.distance)
  const ready = refs.map((r) => (r.pos && radius(r) ? { c: r.pos, r: radius(r) as number } : undefined))
  const circles: MapCircle[] = ready.flatMap((x) => (x ? [{ center: x.c, radiusM: x.r }] : []))
  const allReady = ready.every(Boolean)

  const inter = useMemo(() => (refs.length === 2 && ready[0] && ready[1] ? circleIntersections(ready[0].c, ready[0].r, ready[1].c, ready[1].r) : undefined), [refs]) // eslint-disable-line react-hooks/exhaustive-deps

  // Point trouvé
  let found: XY | undefined
  let precision: number | undefined
  if (allReady) {
    if (refs.length === 1 && ready[0] && chosen) {
      found = pointOnCircle(ready[0].c, ready[0].r, chosen)
      precision = singleCirclePrecisionM(ready[0].r)
    } else if (refs.length === 2 && ready[0] && ready[1] && inter && inter.length > 0) {
      found = inter.length === 1 ? inter[0] : chosen ? nearestPoint(inter, chosen) : undefined
      if (found) precision = intersectionPrecisionM(ready[0].c, ready[1].c, found)
    }
  }

  function onTap(p: XY) {
    const r = refs[active]
    if (r && !r.pos && (r.kind === 'coin' || r.kind === 'carte')) {
      if (r.kind === 'coin') {
        const c = snapCorner(garden, p)
        patch(active, { pos: c ?? p, note: c ? 'Coin trouvé près de votre toucher.' : 'Aucun coin proche. Le point touché est utilisé.' })
      } else patch(active, { pos: p, note: undefined })
      return
    }
    if (allReady) setChosen(p)
  }

  async function measureMe(i: number) {
    const s = await gps.start(5000)
    if (s) patch(i, { pos: proposePosition(s, garden.calibration).position, note: `Position mesurée à ${precisionText(s.accuracyM)} près.` })
  }

  const dots: MapDot[] = [
    ...refs.flatMap((r, i) => (r.pos ? [{ id: 'r' + i, pos: r.pos, label: String(i + 1), aria: `Repère ${i + 1}`, tone: 'ref' as const }] : [])),
    ...(inter && inter.length === 2 ? inter.map((p, i) => ({ id: 'i' + i, pos: p, label: 'AB'[i], aria: `Point possible ${'AB'[i]}`, tone: 'choix' as const })) : []),
    ...(found ? [{ id: 'f', pos: found, label: '✓', aria: 'Point trouvé', tone: 'verite' as const }] : []),
  ]

  function place(pos: XY) {
    const rounded = { x: Math.round(pos.x * 100) / 100, y: Math.round(pos.y * 100) / 100 }
    if (target?.kind === 'plant') {
      const before = getState().plants.find((p) => p.id === target.plantId)
      if (!before) return
      updatePlant(target.plantId, { position: rounded })
      setUi({ selectedPlantId: target.plantId, tab: 'carte', focusPlantId: target.plantId })
      showToast({ message: `« ${plantName(before)} » placée.`, actionLabel: 'Annuler', onAction: () => updatePlant(before.id, { position: before.position }) })
      closeScan()
      return
    }
    if (target?.kind === 'item') {
      // Plante scannée à valider : sa position est affinée, elle reste à valider.
      updateQueue((q) => moveItem(q, target.itemId, rounded, precision ?? 1))
      showToast({ message: 'Position affinée. La plante reste à valider.' })
      closeScan()
      return
    }
    const ui = getUi()
    if (ui.placingSpeciesId) {
      placePlant(garden, ui.placingSpeciesId, rounded)
      closeScan()
      return
    }
    setPicking(true)
  }

  const secondDisabled = refs.length >= 2 || !allReady

  return (
    <Modal title="Placer par mesures" full onClose={closeScan}>
      <div className="scan-layout">
        <ScanMap
          garden={garden}
          plants={plants}
          label="Carte du jardin : repères, cercles et point trouvé"
          dots={dots}
          circles={circles}
          onTap={onTap}
          fitTo={circles.length ? [...circles.flatMap((c) => [{ x: c.center.x - c.radiusM, y: c.center.y - c.radiusM }, { x: c.center.x + c.radiusM, y: c.center.y + c.radiusM }])] : refs.flatMap((r) => (r.pos ? [r.pos] : []))}
        />
        <div className="scan-panel stack">
          {refs.map((r, i) => (
            <fieldset key={i} className={'scan-ref' + (i === active ? ' active' : '')}>
              <legend>Repère {i + 1}</legend>
              <label className="field">
                <span>Mesurer depuis</span>
                <select
                  className="input"
                  value={r.kind}
                  onFocus={() => setActive(i)}
                  onChange={(e) => patch(i, { kind: e.target.value as Kind, pos: undefined, plantId: undefined, note: undefined })}
                >
                  {(Object.keys(KIND_LABEL) as Kind[]).map((k) => (
                    <option key={k} value={k}>
                      {KIND_LABEL[k]}
                    </option>
                  ))}
                </select>
              </label>
              {r.kind === 'plante' && (
                <label className="field">
                  <span>Quelle plante ?</span>
                  <select
                    className="input"
                    value={r.plantId ?? ''}
                    onChange={(e) => {
                      const p = plants.find((x) => x.id === e.target.value)
                      patch(i, { plantId: p?.id, pos: p?.position, note: undefined })
                    }}
                  >
                    <option value="">Choisir…</option>
                    {plants.filter((p) => p.id !== (target?.kind === 'plant' ? target.plantId : '')).map((p) => (
                      <option key={p.id} value={p.id}>
                        {plantName(p)}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {r.kind === 'moi' && (
                <>
                  <button className="btn" disabled={gps.state.status === 'mesure'} onClick={() => void measureMe(i)}>
                    {gps.state.status === 'mesure' ? <span className="spinner" /> : <Icon name="pin" />} Mesurer ma position
                  </button>
                  <GpsMeter state={gps.state} />
                  {gps.state.status === 'erreur' && gps.state.problem && <GpsProblemNote problem={gps.state.problem} />}
                </>
              )}
              {(r.kind === 'coin' || r.kind === 'carte') && !r.pos && i === active && (
                <p className="small" style={{ margin: 0 }} role="status">
                  {r.kind === 'coin' ? 'Touchez sur la carte le coin de maison ou de terrain.' : 'Touchez sur la carte le point de départ.'}
                </p>
              )}
              {r.pos && (
                <p className="small muted" style={{ margin: 0 }}>
                  ✓ Repère placé. {r.note}{' '}
                  {r.kind !== 'plante' && r.kind !== 'moi' && (
                    <button className="btn small" onClick={() => { patch(i, { pos: undefined, note: undefined }); setActive(i) }}>
                      Le changer
                    </button>
                  )}
                </p>
              )}
              <label className="field">
                <span>Distance entre ce repère et la plante (en mètres)</span>
                <input
                  className="input"
                  inputMode="decimal"
                  placeholder="3,5"
                  value={r.distance}
                  aria-invalid={r.distance !== '' && !radius(r)}
                  onFocus={() => setActive(i)}
                  onChange={(e) => patch(i, { distance: e.target.value })}
                />
              </label>
              {r.distance !== '' && !radius(r) && <p className="small" style={{ margin: 0 }} role="alert">Écrivez un nombre de mètres entre 0,1 et 200, par exemple 3,5.</p>}
              {i === 1 && (
                <button className="btn small" onClick={() => { setRefs((x) => x.slice(0, 1)); setActive(0); setChosen(undefined) }}>
                  Retirer ce repère
                </button>
              )}
            </fieldset>
          ))}

          {refs.length === 1 && (
            <button className="btn" disabled={secondDisabled} onClick={() => { setRefs((r) => [...r, emptyRef()]); setActive(1); setChosen(undefined) }}>
              <Icon name="plus" /> Ajouter un 2e repère (plus précis)
            </button>
          )}

          <div className="stack scan-result">
          {allReady && refs.length === 1 && !found && (
            <p className="alert info small" role="status">
              Le cercle montre où peut être la plante. Touchez la carte sur le cercle, à l’endroit voulu.
            </p>
          )}
          {inter && inter.length === 0 && (
            <p className="alert error small" role="alert">
              Les deux cercles ne se touchent pas. Vérifiez les distances ou les repères.
            </p>
          )}
          {inter && inter.length === 2 && !found && (
            <p className="alert info small" role="status">
              Deux points sont possibles : A et B. Touchez la carte près du bon.
            </p>
          )}

          {found && precision !== undefined && (
            <div className="alert info small" role="status">
              <strong>Point trouvé. Précision estimée : {precisionText(precision)}.</strong>
              {refs.length === 1 && <> Ajoutez un 2e repère pour être plus précis.</>}
            </div>
          )}
          <button className="btn primary big" disabled={!found} onClick={() => found && place(found)}>
            <Icon name="check" /> {target?.kind === 'plant' ? 'Placer la plante ici' : target?.kind === 'item' ? 'Affiner la position' : 'Utiliser ce point'}
          </button>
          </div>
          <button className="btn ghost" onClick={() => openScan('menu')}>
            Retour au menu du scan
          </button>
        </div>
      </div>
      {picking && found && (
        <SpeciesPicker
          title="Quelle plante placer ici ?"
          onClose={() => setPicking(false)}
          onPick={(s) => {
            const id = placePlant(garden, s.id, found, 'en-place', { silent: true })
            setUi({ selectedPlantId: id, tab: 'carte' })
            closeScan()
          }}
          onPickCustom={(name) => {
            const id = placePlant(garden, UNKNOWN_SPECIES_ID, found, 'en-place', { silent: true, customName: name })
            setUi({ selectedPlantId: id, tab: 'carte' })
            closeScan()
          }}
        />
      )}
    </Modal>
  )
}

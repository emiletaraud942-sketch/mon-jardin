import { useEffect, useMemo, useRef, useState } from 'react'
import { Icon } from '../../components/Icon'
import { Modal } from '../../components/Modal'
import { PhotoThumb } from '../../components/PhotoThumb'
import { SpeciesPicker } from '../../components/SpeciesPicker'
import { ErrorNote } from '../../components/ErrorNote'
import { hasConsent } from '../../lib/consent'
import { uid } from '../../lib/geo'
import { savePhoto } from '../../lib/photos'
import { removePlant, useGardenPlants } from '../../lib/store'
import { showToast } from '../../lib/toast'
import { UNKNOWN_SPECIES_ID } from '../../lib/customName'
import { ConsentDialog } from '../legal/ConsentDialog'
import { confidenceLabel } from '../plants/identifyLabels'
import { placePlant } from '../map/placing'
import type { Garden, XY } from '../../types'
import { proposePosition, compassName, type Offset } from './capture'
import { geolocationPermission, useGps } from './useGps'
import { useHeading } from './useHeading'
import { GpsMeter, GpsProblemNote } from './ScanParts'
import { ScanMap, type PendingDot } from './ScanMap'
import { closeScan, openScan } from './scanUi'
import { parseMeters, precisionText } from './trilat'
import {
  MAX_ITEMS, canValidate, choiceOf, chooseSpecies, enqueue, finish, forGarden, itemName, markIgnored, markUnvalidated, markValidated, moveItem, newItem, resetRetry, setPlantStatus, summary, summaryText, waitingText,
  type ScanItem,
} from './queue'
import { dropPhotoOf, getQueue, loadQueue, processQueue, startRetryLoop, updateQueue, useScanQueue } from './queueStore'
import { VideoScanSection } from './VideoScan'

export function ScannerScreen({ garden }: { garden: Garden }) {
  const all = useScanQueue()
  const items = useMemo(() => forGarden(all, garden.id), [all, garden.id])
  const plants = useGardenPlants(garden.id)
  const [selectedId, setSelectedId] = useState<string>()
  const [fit, setFit] = useState<XY[]>()
  const gps = useGps(garden.center)
  const [perm, setPerm] = useState<'ok' | 'inconnu' | 'refuse' | 'passe'>('inconnu')
  const [busy, setBusy] = useState<string>()
  const [error, setError] = useState<unknown>()
  const [asking, setAsking] = useState(false)
  const [offsetOn, setOffsetOn] = useState(false)
  const [distance, setDistance] = useState('3')
  const [locked, setLocked] = useState<number>()
  const { supported, heading, denied: headingDenied, request } = useHeading(offsetOn)
  const sampling = useRef<Promise<import('./gps').Sample | undefined>>()
  const [picking, setPicking] = useState<string>()
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    void loadQueue()
    const stop = startRetryLoop()
    const tick = window.setInterval(() => setNow(Date.now()), 5000)
    void geolocationPermission().then((p) => setPerm(p === 'granted' ? 'ok' : p === 'denied' ? 'refuse' : 'inconnu'))
    return () => {
      stop()
      window.clearInterval(tick)
    }
  }, [])

  const dist = parseMeters(distance)
  const offset: Offset | undefined = offsetOn && locked !== undefined && dist ? { headingDeg: locked, distanceM: dist } : undefined

  async function allow() {
    const s = await gps.start(2000)
    setPerm(s ? 'ok' : 'refuse')
  }

  function startSampling() {
    // Le GPS se mesure pendant que le téléphone ouvre l'appareil photo : la personne est devant la plante.
    if (perm === 'ok') sampling.current = gps.start(5000)
  }

  async function onFile(input: HTMLInputElement) {
    const file = input.files?.[0]
    input.value = ''
    if (!file) {
      gps.cancel()
      return
    }
    setError(undefined)
    if (items.filter((i) => i.status !== 'validee' && i.status !== 'ignoree').length >= MAX_ITEMS) {
      setError(new Error('Il y a déjà beaucoup de plantes à revoir. Validez-les ou ignorez-les avant d’en scanner d’autres.'))
      return
    }
    setBusy('Préparation de la photo…')
    let photoId: string
    try {
      photoId = await savePhoto(file)
    } catch (e) {
      setError(e)
      setBusy(undefined)
      return
    }
    let sample = perm === 'ok' ? await sampling.current : undefined
    if (!sample && perm === 'ok') {
      setBusy('Mesure de la position…')
      sample = await gps.start(5000)
    }
    sampling.current = undefined
    const p = sample ? proposePosition(sample, garden.calibration, offset) : { position: { x: 0, y: 0 }, accuracyM: 99 }
    const id = uid()
    updateQueue((q) => enqueue(q, newItem({ id, gardenId: garden.id, photoId, position: p.position, accuracyM: p.accuracyM })))
    setSelectedId(id)
    setFit([p.position])
    setBusy(undefined)
    setLocked(undefined)
    if (hasConsent('plantnet')) void processQueue()
    else setAsking(true)
  }

  const live = items.filter((i) => i.status === 'a-valider' || i.status === 'en-attente')
  const sum = summary(items)
  const pending: PendingDot[] = live.map((i, n) => ({ id: i.id, pos: i.position, label: String(n + 1), aria: `${itemName(i)}, à valider`, selected: i.id === selectedId }))

  function select(id: string) {
    setSelectedId(id)
    const it = getQueue().find((i) => i.id === id)
    if (it) setFit([it.position])
  }

  function validate(i: ScanItem) {
    if (!canValidate(i) || !i.speciesId) return
    const plantId = placePlant(garden, i.speciesId, i.position, i.plantStatus, { silent: true, customName: i.customName, photos: [i.photoId] })
    updateQueue((q) => markValidated(q, i.id, plantId))
    setSelectedId(undefined)
    showToast({
      message: `« ${itemName(i)} » est ajoutée au jardin.`,
      actionLabel: 'Annuler',
      onAction: () => {
        removePlant(plantId, { keepPhotos: true })
        updateQueue((q) => markUnvalidated(q, i.id))
      },
    })
  }

  function end() {
    const { kept, ignoredPhotos } = finish(getQueue().filter((i) => i.gardenId === garden.id))
    ignoredPhotos.forEach(dropPhotoOf)
    updateQueue((q) => q.filter((i) => i.gardenId !== garden.id).concat(kept))
    closeScan()
  }

  const needsConsent = live.some((i) => i.why === 'consentement')

  return (
    <Modal title="Scanner les plantes" full onClose={closeScan}>
      <div className="scan-layout">
        <ScanMap
          garden={garden}
          plants={plants}
          label="Carte du jardin avec les plantes à valider"
          pending={pending}
          onSelectPending={select}
          onMovePending={(id, pos) => updateQueue((q) => moveItem(q, id, pos, 3))}
          fitTo={fit}
        />
        <div className="scan-panel stack">
          {!garden.calibration && (
            <div className="alert info small">
              <span>La carte n’est pas recalée. Les positions seront moins précises.</span>
              <button className="btn small" style={{ marginTop: 6 }} onClick={() => openScan('recaler')}>
                Recaler la carte
              </button>
            </div>
          )}

          {perm === 'inconnu' && (
            <div className="alert small">
              <span>
                <strong>Pour placer les plantes, l’appli utilise votre position.</strong> Elle reste sur votre téléphone. Le téléphone va vous demander l’accord.
              </span>
              <div className="row" style={{ marginTop: 8 }}>
                <button className="btn primary" onClick={() => void allow()} disabled={gps.state.status === 'mesure'}>
                  {gps.state.status === 'mesure' ? <span className="spinner" /> : <Icon name="pin" />} Autoriser la position
                </button>
                <button className="btn" onClick={() => setPerm('passe')}>
                  Je placerai à la main
                </button>
              </div>
            </div>
          )}
          {(perm === 'refuse' || gps.state.status === 'erreur') && <GpsProblemNote problem={gps.state.problem ?? 'refuse'} />}
          {perm === 'passe' && <p className="small muted" style={{ margin: 0 }}>Sans position, chaque plante arrive au centre du jardin. Glissez-la à sa place.</p>}

          <details className="scan-offset">
            <summary>La plante n’est pas à mes pieds (facultatif)</summary>
            {!supported ? (
              <p className="small muted">La boussole n’est pas disponible sur cet appareil.</p>
            ) : (
              <div className="stack">
                <label className="field">
                  <span>La plante est à environ … m devant moi</span>
                  <input className="input" inputMode="decimal" value={distance} onChange={(e) => setDistance(e.target.value)} aria-invalid={!dist} />
                </label>
                {!dist && <p className="small" style={{ margin: 0 }}>Écrivez une distance en mètres, par exemple 3,5.</p>}
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={offsetOn}
                    onChange={async (e) => {
                      const on = e.target.checked
                      if (on && !(await request())) return
                      setOffsetOn(on)
                      setLocked(undefined)
                    }}
                  />{' '}
                  Utiliser la boussole
                </label>
                {headingDenied && <p className="small" style={{ margin: 0 }}>Accès à la boussole refusé. Le décalage n’est pas utilisé.</p>}
                {offsetOn && (
                  <>
                    <p className="small" style={{ margin: 0 }} aria-live="polite">
                      {heading === undefined ? 'La boussole ne répond pas. Le décalage n’est pas utilisé.' : `Vous visez : ${compassName(heading)} (${Math.round(heading)}°).`}
                    </p>
                    <button className="btn" disabled={heading === undefined} onClick={() => setLocked(heading)}>
                      Fixer la direction
                    </button>
                    {locked !== undefined && (
                      <p className="small" style={{ margin: 0 }}>
                        Direction fixée : {compassName(locked)}. Prenez maintenant la photo.
                      </p>
                    )}
                  </>
                )}
              </div>
            )}
          </details>

          <label className={'btn primary big scan-photo' + (busy || perm === 'inconnu' ? ' is-disabled' : '')}>
            {busy ? <span className="spinner" /> : <Icon name="camera" />} Photographier une plante
            <input
              className="sr-only"
              type="file"
              accept="image/*"
              disabled={!!busy || perm === 'inconnu'}
              onClick={startSampling}
              onChange={(e) => void onFile(e.target)}
            />
          </label>
          {perm === 'inconnu' && <p className="small muted" style={{ margin: 0 }}>Répondez d’abord à la question sur la position.</p>}
          <p className="small muted" style={{ margin: 0 }}>Vous pouvez aussi choisir une photo dans votre galerie.</p>
          {busy && (
            <p className="small" role="status" style={{ margin: 0 }}>
              {busy}
            </p>
          )}
          <GpsMeter state={gps.state} hideWhenDone />
          {error !== undefined && <ErrorNote error={error} />}

          <VideoScanSection garden={garden} onDone={(id) => id && select(id)} />

          {needsConsent && (
            <button className="btn" onClick={() => setAsking(true)}>
              Autoriser l’envoi des photos
            </button>
          )}

          {live.length > 0 && <h3 style={{ margin: '4px 0 0' }}>À valider</h3>}
          <ul className="list scan-list">
            {live.map((i, n) => (
              <li key={i.id}>
                <ItemRow
                  item={i}
                  n={n + 1}
                  open={i.id === selectedId}
                  now={now}
                  onSelect={() => (i.id === selectedId ? setSelectedId(undefined) : select(i.id))}
                  onValidate={() => validate(i)}
                  onIgnore={() => {
                    updateQueue((q) => markIgnored(q, i.id))
                    setSelectedId(undefined)
                  }}
                  onPick={() => setPicking(i.id)}
                />
              </li>
            ))}
          </ul>

          <div className="scan-summary" role="status" aria-live="polite">
            <strong>{summaryText(sum)}</strong>
            {sum.ignored > 0 && <span className="muted small"> · {sum.ignored} ignorée{sum.ignored > 1 ? 's' : ''}</span>}
          </div>
          <button className="btn" onClick={end}>
            Terminer
          </button>
        </div>
      </div>
      {asking && (
        <ConsentDialog
          id="plantnet"
          onAccept={() => {
            setAsking(false)
            updateQueue((q) => resetRetry(q))
            void processQueue()
          }}
          onRefuse={() => setAsking(false)}
        />
      )}
      {picking && (
        <SpeciesPicker
          title="Quelle plante est-ce ?"
          onClose={() => setPicking(undefined)}
          onPick={(s) => {
            updateQueue((q) => chooseSpecies(q, picking, { speciesId: s.id }))
            setPicking(undefined)
          }}
          onPickCustom={(name) => {
            updateQueue((q) => chooseSpecies(q, picking, { speciesId: UNKNOWN_SPECIES_ID, customName: name }))
            setPicking(undefined)
          }}
        />
      )}
    </Modal>
  )
}

function ItemRow({
  item: i, n, open, now, onSelect, onValidate, onIgnore, onPick,
}: {
  item: ScanItem
  n: number
  open: boolean
  now: number
  onSelect: () => void
  onValidate: () => void
  onIgnore: () => void
  onPick: () => void
}) {
  const waiting = i.status === 'en-attente'
  const chosen = i.speciesId
  return (
    <div className={'scan-item' + (open ? ' open' : '')}>
      <button className="scan-item-head" aria-expanded={open} onClick={onSelect}>
        <span className="scan-num" aria-hidden>
          {n}
        </span>
        <PhotoThumb id={i.photoId} />
        <span className="scan-item-text">
          <strong>{itemName(i)}</strong>
          <span className="small muted">{waiting ? waitingText(i, now) : i.suggestions[0] && chosen === (i.suggestions[0].speciesId ?? UNKNOWN_SPECIES_ID) ? confidenceLabel(i.suggestions[0].score) : 'À valider'}</span>
        </span>
      </button>
      {open && (
        <div className="stack scan-item-body">
          <p className="small muted" style={{ margin: 0 }}>
            {i.accuracyM >= 99 ? 'Position inconnue. Glissez la pastille sur la carte.' : `Position à ${precisionText(i.accuracyM)} près. Glissez la pastille pour la corriger.`}
          </p>
          {waiting && (
            <div className="row">
              {i.why !== 'consentement' && (
                <button
                  className="btn"
                  onClick={() => {
                    updateQueue((q) => resetRetry(q, i.id))
                    void processQueue()
                  }}
                >
                  Réessayer maintenant
                </button>
              )}
            </div>
          )}
          {i.suggestions.length > 0 && (
            <div role="group" aria-label="Autres noms possibles" className="row scan-alts">
              {i.suggestions.map((s) => {
                const c = choiceOf(s)
                const on = c.speciesId === i.speciesId && (c.customName ?? '') === (i.customName ?? '')
                return (
                  <button key={s.latin} className={'btn small' + (on ? ' primary' : '')} aria-pressed={on} onClick={() => updateQueue((q) => chooseSpecies(q, i.id, c))}>
                    {s.name} · {Math.round(s.score * 100)} %
                  </button>
                )
              })}
            </div>
          )}
          <button className="btn" onClick={onPick}>
            Changer de plante
          </button>
          <div role="group" aria-label="État de la plante" className="row">
            <button className={'btn small' + (i.plantStatus === 'en-place' ? ' primary' : '')} aria-pressed={i.plantStatus === 'en-place'} onClick={() => updateQueue((q) => setPlantStatus(q, i.id, 'en-place'))}>
              Déjà plantée
            </button>
            <button className={'btn small' + (i.plantStatus === 'projet' ? ' primary' : '')} aria-pressed={i.plantStatus === 'projet'} onClick={() => updateQueue((q) => setPlantStatus(q, i.id, 'projet'))}>
              Prévue
            </button>
          </div>
          <div className="row">
            <button className="btn primary" disabled={!canValidate(i)} onClick={onValidate}>
              <Icon name="check" /> Valider
            </button>
            <button className="btn" onClick={onIgnore}>
              Ignorer
            </button>
          </div>
          {!canValidate(i) && <p className="small muted" style={{ margin: 0 }}>Choisissez une plante pour valider.</p>}
        </div>
      )}
    </div>
  )
}

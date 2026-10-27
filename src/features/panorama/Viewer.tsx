import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Icon } from '../../components/Icon'
import { ConfirmModal } from '../../components/ConfirmModal'
import { plantSizeAt } from '../../engine/growth'
import { SPECIES_BY_ID } from '../../data/species'
import { frMeters } from '../../lib/format'
import { useGardenPlants } from '../../lib/store'
import { showToast } from '../../lib/toast'
import type { Garden } from '../../types'
import { plantName } from '../plants/PlantPanel'
import { angleDelta, clamp, inView, layoutRows, maxPitch, neighborsOf, normDeg, photoDateLabel, plantsSeenFrom, pointName, screenX, screenY, smoothAngle, viewFov, type PlantInput } from './geometry'
import { openPanorama, closePanorama, usePanoUi } from './panoUi'
import { removePoint, panoramasOf } from './panoData'
import { createSensor, type Sensor, type SensorStatus } from './sensors'
import { buildStrip, PPD, type Strip } from './strip'

const ZOOM_MAX = 2.5
const LABEL_ROW_PX = 28

function cssColor(name: string, fallback: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback
}

/** Visionneuse : on est au centre du cylindre de photos. Glisser, pincer, ou capteur du téléphone. */
export function Viewer({ garden, pointId }: { garden: Garden; pointId: string }) {
  const ui = usePanoUi()
  const points = panoramasOf(garden)
  const [currentId, setCurrentId] = useState(pointId)
  const point = points.find((p) => p.id === currentId) ?? points.find((p) => p.id === pointId)
  const index = point ? points.indexOf(point) : 0
  const plants = useGardenPlants(garden.id)

  const wrap = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const size = useRef({ w: 360, h: 600, dpr: 1 })
  const stripRef = useRef<Strip>()
  const cache = useRef(new Map<string, { strip: Strip; missing: number }>())
  const view = useRef({ yaw: ui.yaw ?? point?.shots[0]?.headingDeg ?? 0, pitch: 0, zoom: 1, offset: 0, pitchOffset: 0 })
  const dirty = useRef(true)
  const sensor = useRef<Sensor>()
  const gyro = useRef(false)
  const labelEls = useRef(new Map<string, HTMLElement>())
  const arrowEls = useRef(new Map<string, HTMLElement>())

  const [loading, setLoading] = useState(true)
  const [missing, setMissing] = useState(0)
  const [failed, setFailed] = useState(false)
  const [gyroOn, setGyroOn] = useState(false)
  const [sensorStatus, setSensorStatus] = useState<SensorStatus>('repos')
  const [names, setNames] = useState(true)
  const namesRef = useRef(names)
  namesRef.current = names
  const [confirmDelete, setConfirmDelete] = useState(false)

  const northOk = !!point && point.northOk !== false
  const seen = useMemo(() => {
    if (!point || !northOk) return []
    const now = new Date()
    const list: PlantInput[] = plants.map((p) => {
      const sp = SPECIES_BY_ID[p.speciesId]
      return { id: p.id, name: plantName(p), pos: p.position, heightM: sp ? plantSizeAt(p, sp, now).heightM : 1 }
    })
    return plantsSeenFrom(point, list)
  }, [point, plants, northOk])
  const neighbors = useMemo(() => (point ? neighborsOf(point, points) : []), [point, points])
  const seenRef = useRef(seen)
  seenRef.current = seen
  const neighborsRef = useRef(neighbors)
  neighborsRef.current = neighbors

  // ----- Chargement des photos et construction de la bande (une par point, gardée en mémoire) -----
  useEffect(() => {
    if (!point) return
    let cancelled = false
    const hit = cache.current.get(point.id)
    if (hit) {
      stripRef.current = hit.strip
      setMissing(hit.missing)
      setFailed(false)
      setLoading(false)
      dirty.current = true
      return
    }
    setLoading(true)
    setFailed(false)
    void (async () => {
      try {
        // Laisse l'écran se peindre avant le calcul (quelques dizaines de ms sur un téléphone modeste).
        await new Promise((r) => setTimeout(r, 30))
        const built = await buildStrip(point, () => cancelled)
        if (cancelled) return
        if (!built) {
          stripRef.current = undefined
          setMissing(point.shots.length)
          setFailed(true)
          setLoading(false)
          return
        }
        cache.current.set(point.id, built)
        while (cache.current.size > 2) cache.current.delete(cache.current.keys().next().value as string)
        stripRef.current = built.strip
        setMissing(built.missing)
        setLoading(false)
        dirty.current = true
      } catch {
        if (cancelled) return
        stripRef.current = undefined
        setFailed(true)
        setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [point?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Les bandes en cache d'un point supprimé ou refait ne servent plus.
  useEffect(() => {
    const ids = new Set(points.map((p) => p.id + ':' + p.shots.map((s) => s.photoId).join(',')))
    for (const k of [...cache.current.keys()]) {
      const p = points.find((x) => x.id === k)
      if (!p || !ids.has(p.id + ':' + p.shots.map((s) => s.photoId).join(','))) cache.current.delete(k)
    }
  }, [points])

  // ----- Dessin -----
  const draw = useCallback(() => {
    const cv = canvas.current
    const ctx = cv?.getContext('2d')
    if (!cv || !ctx) return
    const { w, h, dpr } = size.current
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    const sky = ctx.createLinearGradient(0, 0, 0, h)
    sky.addColorStop(0, cssColor('--surface-2', '#eef0e3'))
    sky.addColorStop(0.5, cssColor('--track', '#e4e8d6'))
    sky.addColorStop(1, cssColor('--surface-2', '#eef0e3'))
    ctx.fillStyle = sky
    ctx.fillRect(0, 0, w, h)
    const strip = stripRef.current
    const v = view.current
    const hfov = viewFov(w, v.zoom)
    const ppdS = w / hfov
    // Pour les tests et les lecteurs d'écran : cap et zoom courants.
    if (wrap.current) {
      wrap.current.dataset.yaw = String(Math.round(v.yaw))
      wrap.current.dataset.zoom = v.zoom.toFixed(2)
    }
    if (strip) {
      const s = ppdS / PPD
      const sw = strip.canvas.width
      const dh = strip.canvas.height * s
      const dy = h / 2 + v.pitch * ppdS - dh / 2
      const sx0 = normDeg(v.yaw - hfov / 2) * PPD
      const srcW = hfov * PPD
      ctx.imageSmoothingQuality = 'high'
      if (sx0 + srcW <= sw) ctx.drawImage(strip.canvas, sx0, 0, srcW, strip.canvas.height, 0, dy, w, dh)
      else {
        const first = sw - sx0
        const dw = first * s
        ctx.drawImage(strip.canvas, sx0, 0, first, strip.canvas.height, 0, dy, dw, dh)
        ctx.drawImage(strip.canvas, 0, 0, srcW - first, strip.canvas.height, dw, dy, w - dw, dh)
      }
    }
    // Noms des plantes et flèches vers les points voisins : recalculés à chaque image, posés sans repeindre React.
    const items = namesRef.current ? seenRef.current : []
    const vis = items.filter((it) => inView(it.bearing, v.yaw, hfov, w, 60))
    const rows = layoutRows(
      vis.map((it) => ({ x: screenX(it.bearing, v.yaw, hfov, w), w: it.name.length * 7.5 + 24 })),
      4,
    )
    const shown = new Map<string, { x: number; y: number }>()
    vis.forEach((it, i) => {
      if (rows[i] < 0) return
      const y = clamp(screenY(it.elevDeg, v.pitch, hfov, w, h), 100, Math.max(140, h * 0.5)) + rows[i] * LABEL_ROW_PX
      shown.set(it.id, { x: screenX(it.bearing, v.yaw, hfov, w), y })
    })
    for (const [id, el] of labelEls.current) {
      const at = shown.get(id)
      if (!at) {
        el.style.display = 'none'
        continue
      }
      el.style.display = ''
      el.style.transform = `translate(${Math.round(at.x)}px, ${Math.round(at.y)}px) translate(-50%, 0)`
    }
    for (const n of neighborsRef.current) {
      const el = arrowEls.current.get(n.id)
      if (!el) continue
      if (!inView(n.bearing, v.yaw, hfov, w, 40)) {
        el.style.display = 'none'
        continue
      }
      el.style.display = ''
      el.style.transform = `translate(${Math.round(screenX(n.bearing, v.yaw, hfov, w))}px, ${Math.round(h * 0.6 + v.pitch * ppdS)}px) translate(-50%, -50%)`
    }
  }, [])

  // Taille du canvas (suit la fenêtre et la rotation de l'écran).
  useEffect(() => {
    const el = wrap.current
    const cv = canvas.current
    if (!el || !cv) return
    const fit = () => {
      const r = el.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      size.current = { w: Math.max(1, r.width), h: Math.max(1, r.height), dpr }
      cv.width = Math.round(r.width * dpr)
      cv.height = Math.round(r.height * dpr)
      dirty.current = true
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const clampView = useCallback(() => {
    const v = view.current
    v.zoom = clamp(v.zoom, 1, ZOOM_MAX)
    v.yaw = normDeg(v.yaw)
    const strip = stripRef.current
    const { w, h } = size.current
    const hfov = viewFov(w, v.zoom)
    const viewV = (h / w) * hfov
    v.pitch = clamp(v.pitch, -maxPitch(strip?.coverVfovDeg ?? 0, viewV), maxPitch(strip?.coverVfovDeg ?? 0, viewV))
  }, [])

  // Boucle d'affichage : ne dessine que si quelque chose a changé.
  useEffect(() => {
    let raf = 0
    const tick = () => {
      raf = requestAnimationFrame(tick)
      const s = sensor.current
      if (gyro.current && s && s.latest.heading !== undefined) {
        const v = view.current
        const target = normDeg(s.latest.heading + v.offset)
        const next = smoothAngle(v.yaw, target, 0.35)
        if (Math.abs(angleDelta(v.yaw, next)) > 0.02) {
          v.yaw = next
          if (s.latest.pitch !== undefined) v.pitch += (s.latest.pitch + v.pitchOffset - v.pitch) * 0.35
          dirty.current = true
        }
      }
      if (!dirty.current) return
      dirty.current = false
      clampView()
      draw()
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [draw, clampView])

  // Redessine aussi quand les noms ou les voisins changent.
  useEffect(() => {
    dirty.current = true
  }, [names, seen, neighbors, loading])

  useEffect(
    () => () => {
      sensor.current?.stop()
    },
    [],
  )

  // ----- Gestes : un doigt tourne, deux doigts zooment, molette et clavier aussi -----
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const pinch = useRef(0)
  const onDown = (e: React.PointerEvent) => {
    wrap.current?.setPointerCapture?.(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      pinch.current = Math.hypot(a.x - b.x, a.y - b.y)
    }
  }
  const onMove = (e: React.PointerEvent) => {
    const prev = pointers.current.get(e.pointerId)
    if (!prev) return
    const cur = { x: e.clientX, y: e.clientY }
    pointers.current.set(e.pointerId, cur)
    const v = view.current
    const { w } = size.current
    if (pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()]
      const d = Math.hypot(a.x - b.x, a.y - b.y)
      if (pinch.current > 0 && d > 0) v.zoom = clamp(v.zoom * (d / pinch.current), 1, ZOOM_MAX)
      pinch.current = d
    } else {
      const ppdS = w / viewFov(w, v.zoom)
      const dYaw = -(cur.x - prev.x) / ppdS
      v.yaw = normDeg(v.yaw + dYaw)
      if (gyro.current) v.offset = normDeg(v.offset + dYaw)
      v.pitch += (cur.y - prev.y) / ppdS
    }
    dirty.current = true
  }
  const onUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId)
    pinch.current = 0
  }
  const zoomBy = (f: number) => {
    view.current.zoom = clamp(view.current.zoom * f, 1, ZOOM_MAX)
    dirty.current = true
  }
  const turnBy = (deg: number) => {
    view.current.yaw = normDeg(view.current.yaw + deg)
    if (gyro.current) view.current.offset = normDeg(view.current.offset + deg)
    dirty.current = true
  }
  const onWheel = (e: React.WheelEvent) => zoomBy(Math.exp(-clamp(e.deltaY, -300, 300) * 0.0015))
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft') turnBy(-10)
    else if (e.key === 'ArrowRight') turnBy(10)
    else if (e.key === 'ArrowUp') (view.current.pitch += 5), (dirty.current = true)
    else if (e.key === 'ArrowDown') (view.current.pitch -= 5), (dirty.current = true)
    else if (e.key === '+' || e.key === '=') zoomBy(1.2)
    else if (e.key === '-') zoomBy(1 / 1.2)
    else return
    e.preventDefault()
  }

  // ----- Capteur du téléphone -----
  async function toggleGyro() {
    if (gyroOn) {
      gyro.current = false
      setGyroOn(false)
      sensor.current?.stop()
      return
    }
    sensor.current ??= createSensor((s) => setSensorStatus(s))
    const s = sensor.current
    const first = await s.start() // geste de l'utilisateur : la demande iPhone doit partir d'ici
    if (first === 'refuse' || first === 'absent') return
    gyro.current = true
    setGyroOn(true)
  }
  // Pas de boussole sur cet appareil : le bouton ne reste pas enfoncé pour rien.
  useEffect(() => {
    if (gyroOn && sensorStatus === 'absent') {
      gyro.current = false
      setGyroOn(false)
    }
  }, [gyroOn, sensorStatus])
  // Dès que la première mesure arrive : on cale la vue sur la direction du téléphone.
  useEffect(() => {
    const s = sensor.current
    if (!gyroOn || !s || sensorStatus !== 'ok' || s.latest.heading === undefined) return
    const v = view.current
    // Boussole fiable : la vue suit le vrai nord. Sinon : on garde la vue actuelle et on mesure l'écart.
    v.offset = s.latest.absolute ? 0 : normDeg(v.yaw - s.latest.heading)
    v.pitchOffset = s.latest.absolute ? 0 : v.pitch - (s.latest.pitch ?? 0)
    dirty.current = true
  }, [gyroOn, sensorStatus])

  const go = (id: string) => {
    if (id === currentId) return
    setCurrentId(id)
  }

  if (!point) {
    return (
      <div className="pano-center">
        <p>Ce point n’existe plus.</p>
        <button className="btn primary" onClick={() => openPanorama('home')}>
          Retour aux photos
        </button>
      </div>
    )
  }

  const sensorNote =
    sensorStatus === 'refuse'
      ? 'La boussole est refusée. Glissez le doigt pour tourner.'
      : sensorStatus === 'absent'
        ? 'Pas de boussole sur cet appareil. Glissez le doigt pour tourner.'
        : sensorStatus === 'attente' && gyroOn
          ? 'Recherche de la boussole…'
          : sensorStatus === 'ok' && gyroOn && sensor.current && !sensor.current.latest.absolute
            ? 'Boussole non fiable : la vue suit seulement vos mouvements.'
            : sensorStatus === 'ok' && gyroOn
              ? 'La vue suit votre téléphone. Bougez-le doucement.'
              : ''

  const redo = () => {
    openPanorama(point.kind === 'import' ? 'import' : 'capture', { pointId: point.id, spot: { x: point.x, y: point.y }, mode: point.kind })
  }
  const back = () => (ui.back === 'home' ? openPanorama('home') : closePanorama())

  return (
    <div className="pano-view">
      <div className="pano-top">
        <button className="btn pano-pill" onClick={back}>
          <Icon name="back" size={18} /> Fermer
        </button>
        <div className="pano-title" aria-live="polite">
          <strong>{pointName(index)}</strong>
          <span>{photoDateLabel(point.takenAt)}</span>
        </div>
      </div>

      <div
        ref={wrap}
        className="pano-stage"
        tabIndex={0}
        role="img"
        aria-label={`Vue panoramique, ${pointName(index)}. Glissez le doigt pour tourner, pincez pour zoomer. Les flèches du clavier tournent la vue.`}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onWheel={onWheel}
        onKeyDown={onKey}
      >
        <canvas ref={canvas} className="pano-canvas" />
        <div className="pano-overlay-items" aria-hidden={false}>
          {seen.map((it) => (
            <span key={it.id} className="pano-label" ref={(el) => (el ? labelEls.current.set(it.id, el) : labelEls.current.delete(it.id))} style={{ display: 'none' }}>
              {it.name}
            </span>
          ))}
          {neighbors.map((n) => {
            const target = points.find((p) => p.id === n.id)!
            return (
              <button
                key={n.id}
                className="pano-arrow"
                ref={(el) => (el ? arrowEls.current.set(n.id, el) : arrowEls.current.delete(n.id))}
                style={{ display: 'none' }}
                aria-label={`Aller au ${pointName(points.indexOf(target)).toLowerCase()}, à ${frMeters(n.distM)}`}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => go(n.id)}
              >
                <span className="pano-arrow-icon">
                  <Icon name="chevron" size={22} weight={2.2} />
                </span>
                <span className="pano-arrow-text">
                  {pointName(points.indexOf(target))} · {frMeters(n.distM)}
                </span>
              </button>
            )
          })}
        </div>
        {loading && (
          <div className="pano-wait" role="status">
            <span className="spinner" /> Chargement des photos…
          </div>
        )}
        {failed && !loading && (
          <div className="pano-wait" role="alert">
            <p>Les photos de ce point ne sont plus sur ce téléphone.</p>
            <button className="btn" onClick={() => setConfirmDelete(true)}>
              <Icon name="trash" size={18} /> Supprimer ce point
            </button>
          </div>
        )}
        <div className="pano-zoom" onPointerDown={(e) => e.stopPropagation()}>
          <button className="btn pano-round" aria-label="Zoom avant" onClick={() => zoomBy(1.25)}>
            <Icon name="plus" size={20} />
          </button>
          <button className="btn pano-round" aria-label="Zoom arrière" onClick={() => zoomBy(1 / 1.25)}>
            <span aria-hidden className="pano-minus" />
          </button>
        </div>
      </div>

      <div className="pano-bottom">
        {neighbors.length > 0 && (
          <div className="pano-chips" role="group" aria-label="Aller à un autre point">
            {points.map((p, i) => (
              <button key={p.id} className={'btn small pano-chip' + (p.id === point.id ? ' primary' : '')} aria-current={p.id === point.id ? 'true' : undefined} onClick={() => go(p.id)}>
                {pointName(i)}
              </button>
            ))}
          </div>
        )}
        {(!northOk || missing > 0 || sensorNote) && (
          <p className="pano-note small" role="status">
            {!northOk && 'Le nord n’est pas connu pour ce point : les noms des plantes sont masqués. '}
            {missing > 0 && `${missing} photo${missing > 1 ? 's' : ''} manque${missing > 1 ? 'nt' : ''} sur ce téléphone. `}
            {sensorNote}
          </p>
        )}
        <div className="pano-actions">
          <button className={'btn' + (gyroOn ? ' primary' : '')} aria-pressed={gyroOn} title="Tourner la vue en bougeant le téléphone" onClick={() => void toggleGyro()}>
            <Icon name="move" size={18} /> Boussole
          </button>
          {northOk && (
            <button className={'btn' + (names ? ' primary' : '')} aria-pressed={names} onClick={() => setNames((n) => !n)}>
              <Icon name="leaf" size={18} /> Noms
            </button>
          )}
          <button className="btn" onClick={redo}>
            <Icon name="camera" size={18} /> Refaire ce point
          </button>
          <button className="btn" onClick={() => setConfirmDelete(true)}>
            <Icon name="trash" size={18} /> Supprimer
          </button>
        </div>
      </div>

      {confirmDelete && (
        <ConfirmModal
          title="Supprimer ce point ?"
          confirmLabel="Supprimer ce point"
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => {
            setConfirmDelete(false)
            removePoint(garden.id, point.id)
            showToast({ message: `${pointName(index)} est supprimé. Ses photos sont effacées de ce téléphone.` })
            openPanorama('home')
          }}
        >
          <p style={{ margin: 0 }}>Les {point.shots.length} photo{point.shots.length > 1 ? 's' : ''} du {pointName(index).toLowerCase()} seront effacées de ce téléphone.</p>
        </ConfirmModal>
      )}
    </div>
  )
}


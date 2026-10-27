import { useCallback, useEffect, useRef, useState } from 'react'
import { Icon } from '../../components/Icon'
import { uid } from '../../lib/geo'
import { getPhoto, savePhoto } from '../../lib/photos'
import { showToast } from '../../lib/toast'
import type { Garden, Panorama, PanoramaShot, XY } from '../../types'
import { angleDelta, compassWord, COMPASS_POINTS, fovFromSize, MANUAL_START_DEG, nextTarget, normDeg, planShots, readyToShoot, sizeLabel, SHOT_BYTES, SHOT_QUALITIES, SHOT_SIDE, smoothAngle, turnHint } from './geometry'
import { discardPhotos, savePoint } from './panoData'
import { openPanorama } from './panoUi'
import { createSensor, type Sensor, type SensorStatus } from './sensors'

type Phase = 'intro' | 'live' | 'review'
interface Taken extends PanoramaShot {
  url: string
  bytes: number
}

/** Temps pendant lequel le téléphone doit rester immobile et bien orienté avant la prise automatique. */
const HOLD_MS = 600
const TICK_MS = 100

/** Prise de vue guidée : tourner sur soi-même, une photo tous les 30 à 45° environ. */
export function Capture({ garden, spot, redoId }: { garden: Garden; spot: XY; redoId?: string }) {
  const [phase, setPhase] = useState<Phase>('intro')
  const [cam, setCam] = useState<'live' | 'file'>('live')
  const [camNote, setCamNote] = useState('')
  const [shots, setShots] = useState<Taken[]>([])
  const [plan, setPlan] = useState(() => planShots(60))
  const [heading, setHeading] = useState<number>()
  const [tilted, setTilted] = useState(false)
  const [sensorStatus, setSensorStatus] = useState<SensorStatus>('repos')
  const [hold, setHold] = useState(0)
  const [flash, setFlash] = useState(false)
  const [busy, setBusy] = useState(false)
  const [startDeg, setStartDeg] = useState<number>()
  const [northKnown, setNorthKnown] = useState(true)
  const [manualAsked, setManualAsked] = useState(false)

  const video = useRef<HTMLVideoElement>(null)
  const stream = useRef<MediaStream>()
  const sensor = useRef<Sensor>()
  const shotsRef = useRef<Taken[]>([])
  shotsRef.current = shots
  const saved = useRef(false)
  const busyRef = useRef(false)
  const holdRef = useRef(0)
  const smooth = useRef<{ h?: number; speed: number; t: number }>({ speed: 0, t: 0 })
  const planRef = useRef(plan)
  planRef.current = plan
  const startRef = useRef<number>()
  startRef.current = startDeg
  const northRef = useRef(true)
  northRef.current = northKnown

  const stopCamera = useCallback(() => {
    stream.current?.getTracks().forEach((t) => t.stop())
    stream.current = undefined
  }, [])

  // Sortie sans enregistrer : on libère la caméra, le capteur et les photos déjà stockées.
  useEffect(
    () => () => {
      stopCamera()
      sensor.current?.stop()
      for (const s of shotsRef.current) URL.revokeObjectURL(s.url)
      if (!saved.current) discardPhotos(shotsRef.current.map((s) => s.photoId))
    },
    [stopCamera],
  )

  // Branche le flux dès que l'écran de prise de vue est affiché.
  useEffect(() => {
    if (phase !== 'live' || cam !== 'live' || !stream.current || !video.current) return
    const v = video.current
    v.srcObject = stream.current
    void v.play().catch(() => undefined)
  }, [phase, cam])

  const sensorOk = sensorStatus === 'ok' && heading !== undefined
  const taken = shots.length
  const target = startDeg !== undefined ? nextTarget(startDeg, plan.count, taken) : undefined

  /** Le geste de l'utilisateur lance tout : capteur d'abord (la demande iPhone doit partir d'ici), puis caméra. */
  async function begin() {
    sensor.current ??= createSensor((s) => setSensorStatus(s))
    void sensor.current.start()
    if (!navigator.mediaDevices?.getUserMedia) {
      setCam('file')
      setCamNote('La caméra n’est pas disponible dans l’appli. Prenez chaque photo avec l’appareil photo du téléphone.')
      setPhase('live')
      return
    }
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false })
      setCam('live')
    } catch (e) {
      setCam('file')
      setCamNote(
        e instanceof DOMException && e.name === 'NotAllowedError'
          ? 'La caméra est refusée. Vous pouvez prendre chaque photo avec l’appareil photo du téléphone.'
          : 'La caméra ne répond pas. Prenez chaque photo avec l’appareil photo du téléphone.',
      )
    }
    setPhase('live')
  }

  // Lecture de la boussole : lissage, vitesse de rotation, déclenchement automatique.
  const shootRef = useRef<(source?: Blob) => Promise<void>>(async () => undefined)
  useEffect(() => {
    if (phase !== 'live') return
    const timer = setInterval(() => {
      const s = sensor.current
      const raw = s?.latest.heading
      const now = Date.now()
      const sm = smooth.current
      if (raw === undefined || !s || s.status !== 'ok' || now - s.latest.t > 1500) {
        sm.h = undefined
        holdRef.current = 0
        setHeading(undefined)
        setHold(0)
        return
      }
      const prev = sm.h
      sm.h = smoothAngle(prev, raw, 0.5)
      const dt = Math.max(0.05, (now - (sm.t || now - TICK_MS)) / 1000)
      sm.speed = prev === undefined ? 0 : sm.speed * 0.5 + (Math.abs(angleDelta(prev, sm.h)) / dt) * 0.5
      sm.t = now
      setHeading(sm.h)
      setTilted(s.latest.pitch !== undefined && Math.abs(s.latest.pitch) > 25)
      const tgt = startRef.current !== undefined ? nextTarget(startRef.current, planRef.current.count, shotsRef.current.length) : undefined
      if (tgt !== undefined && !busyRef.current && readyToShoot(sm.h, tgt, sm.speed)) {
        holdRef.current += TICK_MS
        setHold(holdRef.current)
        if (holdRef.current >= HOLD_MS) {
          holdRef.current = 0
          setHold(0)
          void shootRef.current()
        }
      } else {
        holdRef.current = 0
        setHold(0)
      }
    }, TICK_MS)
    return () => clearInterval(timer)
  }, [phase])

  async function grabFrame(): Promise<{ blob: Blob; fov: number } | undefined> {
    const v = video.current
    if (!v || !v.videoWidth) return undefined
    const c = document.createElement('canvas')
    c.width = v.videoWidth
    c.height = v.videoHeight
    c.getContext('2d')?.drawImage(v, 0, 0)
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/jpeg', 0.95))
    return blob ? { blob, fov: fovFromSize(c.width, c.height) } : undefined
  }

  /** Prend une photo (flux caméra, ou fichier choisi) et la range. */
  async function shoot(file?: Blob) {
    if (busyRef.current) return
    const list = shotsRef.current
    if (list.length >= planRef.current.count) return
    busyRef.current = true
    setBusy(true)
    try {
      let blob: Blob | undefined
      let fov = 60
      if (file) {
        blob = file
        try {
          const bmp = await createImageBitmap(file)
          fov = fovFromSize(bmp.width, bmp.height)
          bmp.close?.()
        } catch {
          /* le format sera refusé par savePhoto, avec un message clair */
        }
      } else {
        const f = await grabFrame()
        blob = f?.blob
        fov = f?.fov ?? 60
      }
      if (!blob) {
        showToast({ message: 'La photo n’a pas pu être prise. Réessayez.', tone: 'error' })
        return
      }
      const photoId = await savePhoto(blob, { maxSide: SHOT_SIDE, targetBytes: SHOT_BYTES, qualities: SHOT_QUALITIES })
      const stored = await getPhoto(photoId)
      const live = sensor.current?.latest.heading !== undefined && sensor.current.status === 'ok' ? smooth.current.h : undefined
      let headingDeg: number
      if (list.length === 0) {
        headingDeg = live ?? startRef.current ?? MANUAL_START_DEG
        setStartDeg(headingDeg)
        startRef.current = headingDeg
        setPlan(planShots(fov))
        planRef.current = planShots(fov)
        // Boussole absolue : le nord est connu. Sinon, seulement si l'utilisateur a indiqué son orientation.
        if (live !== undefined) setNorthKnown(!!sensor.current?.latest.absolute)
        else if (!manualAsked) setNorthKnown(false)
      } else {
        headingDeg = live ?? normDeg((startRef.current ?? 0) + list.length * planRef.current.stepDeg)
      }
      const url = stored ? URL.createObjectURL(stored) : ''
      const next = [...list, { photoId, headingDeg: normDeg(headingDeg), fovDeg: fov, url, bytes: stored?.size ?? 0 }]
      shotsRef.current = next
      setShots(next)
      setFlash(true)
      setTimeout(() => setFlash(false), 180)
      if (next.length >= planRef.current.count) {
        stopCamera()
        sensor.current?.stop()
        setPhase('review')
      }
    } catch (e) {
      showToast({ message: e instanceof Error ? e.message : 'La photo n’a pas pu être enregistrée.', tone: 'error' })
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }
  shootRef.current = shoot

  async function restart() {
    discardPhotos(shotsRef.current.map((s) => s.photoId))
    for (const s of shotsRef.current) URL.revokeObjectURL(s.url)
    shotsRef.current = []
    setShots([])
    setStartDeg(undefined)
    startRef.current = undefined
    setManualAsked(false)
    setNorthKnown(true)
    smooth.current = { speed: 0, t: 0 }
    await begin()
  }

  function finish() {
    const list = shotsRef.current
    if (list.length === 0) return
    const pano: Panorama = {
      id: redoId ?? uid(),
      x: spot.x,
      y: spot.y,
      takenAt: new Date().toISOString(),
      shots: list.map(({ photoId, headingDeg, fovDeg }) => ({ photoId, headingDeg, fovDeg })),
      kind: 'guide',
    }
    if (!northRef.current) pano.northOk = false
    saved.current = true
    savePoint(garden.id, pano)
    openPanorama('view', { pointId: pano.id, back: 'home' })
  }

  const cancel = () => {
    if (redoId) openPanorama('view', { pointId: redoId, back: 'home' })
    else openPanorama('home')
  }

  // ----- Écrans -----
  if (phase === 'intro') {
    return (
      <div className="pano-page">
        <div className="pano-bar">
          <button className="btn pano-pill" onClick={cancel}>
            <Icon name="back" size={18} /> Retour
          </button>
          <h2 className="pano-h">{redoId ? 'Refaire ce point' : 'Prendre les photos'}</h2>
        </div>
        <div className="pano-scroll stack">
          <p className="pano-lead">Tenez le téléphone droit. Tournez doucement sur vous-même, vers la droite.</p>
          <ol className="pano-steps">
            <li>Touchez « Prendre la 1re photo ».</li>
            <li>Tournez lentement. L’appli prend les photos suivantes toute seule.</li>
            <li>Environ 8 à 12 photos font le tour complet.</li>
          </ol>
          <p className="small muted">L’appli va demander la caméra, puis la boussole. Les photos restent sur ce téléphone.</p>
          <button className="btn primary big" onClick={() => void begin()}>
            <Icon name="camera" /> Ouvrir la caméra
          </button>
        </div>
      </div>
    )
  }

  if (phase === 'review') {
    const total = shots.reduce((s, x) => s + x.bytes, 0)
    return (
      <div className="pano-page">
        <div className="pano-bar">
          <button className="btn pano-pill" onClick={cancel}>
            <Icon name="x" size={18} /> Annuler
          </button>
          <h2 className="pano-h">Tour terminé</h2>
        </div>
        <div className="pano-scroll stack">
          <p className="pano-lead">
            {shots.length} photos, {sizeLabel(total)}. Elles restent sur ce téléphone.
          </p>
          <ul className="pano-thumbs" aria-label="Photos du tour">
            {shots.map((s, i) => (
              <li key={s.photoId}>
                {s.url && <img src={s.url} alt={`Photo ${i + 1}, vers ${compassWord(s.headingDeg)}`} />}
              </li>
            ))}
          </ul>
          {!northKnown && <p className="alert small">Le nord est inconnu pour ce point. Les noms des plantes ne seront pas affichés.</p>}
          <button className="btn primary big" onClick={finish}>
            <Icon name="check" /> Enregistrer ce point
          </button>
          <button className="btn" onClick={() => void restart()}>
            Tout reprendre
          </button>
        </div>
      </div>
    )
  }

  // phase === 'live'
  const hint = target !== undefined && sensorOk ? turnHint(heading!, target) : undefined
  const needNorthChoice = taken === 0 && (sensorStatus === 'absent' || sensorStatus === 'refuse')
  const waitingCompass = taken === 0 && sensorStatus === 'attente'
  let guide: string
  if (tilted) guide = 'Tenez le téléphone bien droit, pas penché.'
  else if (taken === 0) guide = sensorOk ? 'Visez la première direction, puis touchez « Prendre la 1re photo ».' : sensorStatus === 'attente' ? 'Recherche de la boussole…' : 'Touchez « Prendre la 1re photo » quand vous êtes prêt.'
  else if (hint) guide = hint.dir === 'ici' ? (hold > 0 ? 'Ne bougez plus…' : 'Bien. Ne bougez plus.') : `Tournez vers la ${hint.dir}, de ${hint.deg}°.`
  else guide = `Tournez vers la droite, d’environ ${Math.round(plan.stepDeg)}°, puis touchez « Photo suivante ».`

  return (
    <div className="pano-page pano-capture">
      <div className="pano-bar">
        <button className="btn pano-pill" onClick={cancel}>
          <Icon name="x" size={18} /> Annuler
        </button>
        <h2 className="pano-h" aria-live="polite">
          Photo {Math.min(taken + 1, plan.count)} sur {plan.count}
        </h2>
      </div>
      <div className="pano-cam">
        {cam === 'live' ? <video ref={video} playsInline muted autoPlay aria-label="Ce que voit la caméra" /> : <div className="pano-nocam">{camNote}</div>}
        {cam === 'live' && <div className="pano-cross" aria-hidden />}
        {cam === 'live' && <div className="pano-horizon" aria-hidden />}
        {flash && <div className="pano-flash" aria-hidden />}
        <div className="pano-guide" role="status">
          {guide}
          {hold > 0 && <span className="pano-hold" style={{ width: `${Math.min(100, (hold / HOLD_MS) * 100)}%` }} />}
        </div>
      </div>
      <div className="pano-controls">
        {needNorthChoice && !manualAsked && (
          <div className="stack pano-north">
            <p className="small" style={{ margin: 0 }}>
              <strong>{sensorStatus === 'refuse' ? 'Boussole refusée.' : 'Pas de boussole.'}</strong> Vers où regardez-vous pour la 1re photo ?
            </p>
            <div className="pano-dirs">
              {COMPASS_POINTS.map((w, i) => (
                <button
                  key={w}
                  className="btn small"
                  onClick={() => {
                    setStartDeg(i * 45)
                    startRef.current = i * 45
                    setManualAsked(true)
                    setNorthKnown(true)
                  }}
                >
                  {w}
                </button>
              ))}
              <button
                className="btn small"
                onClick={() => {
                  setManualAsked(true)
                  setNorthKnown(false)
                }}
              >
                Je ne sais pas
              </button>
            </div>
          </div>
        )}
        <Dots count={plan.count} done={taken} />
        {cam === 'live' ? (
          <button className="btn primary big pano-shoot" disabled={busy || waitingCompass || (needNorthChoice && !manualAsked)} onClick={() => void shoot()}>
            <Icon name="camera" /> {taken === 0 ? 'Prendre la 1re photo' : 'Photo suivante'}
          </button>
        ) : (
          <label className={'btn primary big pano-shoot' + (busy || waitingCompass || (needNorthChoice && !manualAsked) ? ' disabled' : '')}>
            <Icon name="camera" /> {taken === 0 ? 'Prendre la 1re photo' : 'Photo suivante'}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0]
                e.target.value = ''
                if (f) void shoot(f)
              }}
            />
          </label>
        )}
        {taken > 0 && taken < plan.count && !sensorOk && <p className="small muted pano-order">Sans boussole, tournez vers la droite d’environ {Math.round(plan.stepDeg)}° entre deux photos.</p>}
      </div>
    </div>
  )
}

/** Anneau de points : un point par photo, plein quand elle est prise. */
function Dots({ count, done }: { count: number; done: number }) {
  const r = 17
  return (
    <svg className="pano-dots" viewBox="0 0 48 48" width="48" height="48" role="img" aria-label={`${done} photo${done > 1 ? 's' : ''} prise${done > 1 ? 's' : ''} sur ${count}`}>
      {Array.from({ length: count }, (_, i) => {
        const a = (i / count) * 2 * Math.PI - Math.PI / 2
        return <circle key={i} cx={24 + r * Math.cos(a)} cy={24 + r * Math.sin(a)} r={3.2} className={i < done ? 'on' : i === done ? 'next' : ''} />
      })}
    </svg>
  )
}


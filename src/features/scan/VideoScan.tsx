import { useEffect, useMemo, useRef, useState } from 'react'
import { ErrorNote } from '../../components/ErrorNote'
import { Icon } from '../../components/Icon'
import { Modal } from '../../components/Modal'
import { hasConsent } from '../../lib/consent'
import { uid } from '../../lib/geo'
import { savePhoto } from '../../lib/photos'
import type { Garden } from '../../types'
import { ConsentDialog } from '../legal/ConsentDialog'
import { gpsSupport, type GpsProblem } from './gps'
import { extractFrames, grabFrame, type Skipped } from './extract'
import { startJournal, type Journal } from './journal'
import { GpsProblemNote } from './ScanParts'
import { enqueue, forGarden, MAX_ITEMS, newItem, resetRetry } from './queue'
import { mergedCount } from './dedupe'
import { processQueue, updateQueue, useScanQueue } from './queueStore'
import { addUsed, DAILY_LIMIT, quotaText, readQuota, remaining } from './quota'
import { openScan } from './scanUi'
import { useHeading } from './useHeading'
import { DEFAULT_DISTANCE_M, positionForFrame } from './videoLog'
import { parseMeters } from './trilat'

/** Une image gardée, avec l'instant où elle a été prise (flux direct) ou sa place dans la vidéo. */
interface Kept {
  t: number
  blob: Blob
}

const LIVE_EVERY_MS = 2000
const LIVE_MAX_MS = 4 * 60 * 1000

/** Ligne d'entrée dans l'écran « Scanner les plantes ». */
export function VideoScanSection({ garden, onDone }: { garden: Garden; onDone: (firstId?: string) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button className="btn big" onClick={() => setOpen(true)}>
        <Icon name="camera" /> Scanner en filmant
      </button>
      {open && (
        <VideoScanDialog
          garden={garden}
          onClose={(firstId) => {
            setOpen(false)
            onDone(firstId)
          }}
        />
      )}
    </>
  )
}

type Step = 'intro' | 'live' | 'tri' | 'fin'

function VideoScanDialog({ garden, onClose }: { garden: Garden; onClose: (firstId?: string) => void }) {
  const [step, setStep] = useState<Step>('intro')
  const [quota, setQuota] = useState(() => readQuota())
  const [distance, setDistance] = useState(String(DEFAULT_DISTANCE_M).replace('.', ','))
  const [error, setError] = useState<unknown>()
  const [problem, setProblem] = useState<GpsProblem>()
  const [kept, setKept] = useState(0)
  const [skipped, setSkipped] = useState<Record<Skipped, number>>({ floue: 0, 'sans-plante': 0 })
  const [progress, setProgress] = useState<{ label: string; done: number; total: number }>()
  const [batch, setBatch] = useState<string[]>([])
  const [located, setLocated] = useState(true)
  const [compass, setCompass] = useState(true)
  const [asking, setAsking] = useState(false)
  const all = useScanQueue()
  const videoRef = useRef<HTMLVideoElement>(null)
  const stream = useRef<MediaStream>()
  const journal = useRef<Journal>()
  const timer = useRef<number>()
  const frames = useRef<Kept[]>([])
  const busy = useRef(false)
  const startedAt = useRef(0)
  const skippedRef = useRef<Record<Skipped, number>>({ floue: 0, 'sans-plante': 0 })
  const { request: askCompass } = useHeading(false)

  const dist = parseMeters(distance) ?? DEFAULT_DISTANCE_M
  const room = Math.max(0, MAX_ITEMS - forGarden(all, garden.id).filter((i) => i.status === 'a-valider' || i.status === 'en-attente').length)
  const cap = Math.min(remaining(quota), 30, room)
  const support = gpsSupport({ secure: window.isSecureContext, hasGeolocation: 'geolocation' in navigator })

  function releaseCamera() {
    window.clearInterval(timer.current)
    timer.current = undefined
    journal.current?.stop()
    stream.current?.getTracks().forEach((t) => t.stop())
    stream.current = undefined
  }
  useEffect(() => releaseCamera, [])

  async function startLive() {
    setError(undefined)
    setProblem(undefined)
    if (!navigator.mediaDevices?.getUserMedia) {
      setError(new Error('Cet appareil ne permet pas de filmer depuis l’appli. Choisissez une vidéo déjà filmée.'))
      return
    }
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } }, audio: false })
      stream.current = s
    } catch (e) {
      setError(e instanceof DOMException && e.name === 'NotAllowedError' ? new Error('La caméra est refusée. Autorisez-la dans les réglages du navigateur, ou choisissez une vidéo déjà filmée.') : e)
      return
    }
    await askCompass()
    frames.current = []
    skippedRef.current = { floue: 0, 'sans-plante': 0 }
    setKept(0)
    setSkipped({ floue: 0, 'sans-plante': 0 })
    if (!support) journal.current = undefined
    else journal.current = startJournal(garden.center, setProblem)
    startedAt.current = Date.now()
    setStep('live')
  }

  // Le flux est branché une fois l'écran « live » affiché.
  useEffect(() => {
    if (step !== 'live' || !stream.current || !videoRef.current) return
    const v = videoRef.current
    v.srcObject = stream.current
    void v.play().catch(() => undefined)
    timer.current = window.setInterval(async () => {
      if (busy.current) return
      if (frames.current.length >= cap || Date.now() - startedAt.current > LIVE_MAX_MS) {
        void finishLive()
        return
      }
      busy.current = true
      try {
        const c = await grabFrame(v, Date.now(), (why) => {
          skippedRef.current = { ...skippedRef.current, [why]: skippedRef.current[why] + 1 }
          setSkipped(skippedRef.current)
        })
        if (c) {
          frames.current.push({ t: c.t, blob: c.blob })
          setKept(frames.current.length)
        }
      } finally {
        busy.current = false
      }
    }, LIVE_EVERY_MS)
    return () => window.clearInterval(timer.current)
  }, [step]) // eslint-disable-line react-hooks/exhaustive-deps

  async function finishLive() {
    const j = journal.current
    const track = j ? [...j.track] : []
    const heads = j ? [...j.heads] : []
    releaseCamera()
    setLocated(track.length > 0)
    setCompass(heads.length > 0)
    await store(frames.current, (f) => positionForFrame(f.t, track, heads, garden.calibration, dist))
  }

  async function importFile(input: HTMLInputElement) {
    const file = input.files?.[0]
    input.value = ''
    if (!file) return
    setError(undefined)
    setStep('tri')
    setProgress({ label: 'Lecture de la vidéo…', done: 0, total: 1 })
    try {
      const r = await extractFrames(file, { max: cap, onProgress: (done, total) => setProgress({ label: 'Choix des images…', done, total }) })
      setSkipped(r.skipped)
      setLocated(false)
      setCompass(false)
      if (r.frames.length === 0) {
        setProgress(undefined)
        setKept(0)
        setStep('fin')
        return
      }
      await store(r.frames.map((f) => ({ t: f.t, blob: f.blob })), () => undefined)
    } catch (e) {
      setError(e)
      setProgress(undefined)
      setStep('intro')
    }
  }

  /** Enregistre les images gardées, les met en file et lance l'identification (une à une, avec pause). */
  async function store(list: Kept[], place: (f: Kept) => { position: { x: number; y: number }; accuracyM: number } | undefined) {
    setStep('tri')
    const chosen = list.slice(0, cap)
    const ids: string[] = []
    setKept(chosen.length)
    for (let n = 0; n < chosen.length; n++) {
      setProgress({ label: 'Enregistrement des images…', done: n, total: chosen.length })
      try {
        const photoId = await savePhoto(chosen[n].blob)
        const p = place(chosen[n])
        // Sans position connue : petite grille près du centre, que l'on glisse ensuite à la main.
        const position = p?.position ?? { x: (n % 5) * 1.5 - 3, y: -Math.floor(n / 5) * 1.5 }
        const id = uid()
        ids.push(id)
        updateQueue((q) => enqueue(q, newItem({ id, gardenId: garden.id, photoId, position, accuracyM: p?.accuracyM ?? 99, from: 'video' })))
      } catch (e) {
        console.warn('Image non enregistrée', e)
      }
    }
    setQuota(addUsed(ids.length))
    setBatch(ids)
    setProgress(undefined)
    setStep('fin')
    if (ids.length === 0) return
    if (hasConsent('plantnet')) void processQueue()
    else setAsking(true)
  }

  const mine = useMemo(() => all.filter((i) => batch.includes(i.id)), [all, batch])
  const identified = mine.filter((i) => i.status !== 'en-attente').length
  const found = mine.filter((i) => i.status === 'a-valider' || i.status === 'validee').length
  const doubles = mergedCount(all.filter((i) => batch.includes(i.id) || batch.includes(i.mergedInto ?? '')), garden.id)
  const waiting = mine.some((i) => i.status === 'en-attente')
  const firstId = mine.find((i) => i.status === 'a-valider')?.id

  return (
    <Modal title="Scanner en filmant" full onClose={() => (releaseCamera(), onClose())}>
      <div className="scan-layout">
        {step === 'live' && (
          <div className="scan-video-wrap">
            <video ref={videoRef} className="scan-video" muted playsInline autoPlay aria-label="Ce que voit la caméra" />
          </div>
        )}
        <div className="scan-panel stack">
          {step === 'intro' && (
            <>
              <ol className="scan-steps">
                <li>
                  <strong>Marchez lentement</strong> le long de vos plantes, en filmant devant vous.
                </li>
                <li>
                  <strong>L’appli garde une image toutes les 2 secondes</strong>, sans les images floues ni sans plante.
                </li>
                <li>
                  <strong>Vous validez ensuite chaque plante</strong> sur la carte.
                </li>
              </ol>
              <p className="small muted" style={{ margin: 0 }}>La vidéo reste sur votre téléphone. Seules les images gardées partent à Pl@ntNet, avec votre accord.</p>
              {!garden.calibration && (
                <div className="alert info small">
                  <span>La carte n’est pas recalée. Recalez-la d’abord : les plantes seront mieux placées.</span>
                  <button className="btn small" style={{ marginTop: 6 }} onClick={() => openScan('recaler')}>
                    Recaler la carte
                  </button>
                </div>
              )}
              <p className="small" style={{ margin: 0 }} aria-live="polite">
                <strong>{quotaText(quota)}</strong>. {remaining(quota) === 0 ? 'Reprenez demain.' : `Il en reste ${remaining(quota)}.`}
              </p>
              {room === 0 && <p className="alert small">Trop de plantes à revoir. Validez-les ou ignorez-les d’abord.</p>}
              <label className="field">
                <span>Distance entre vous et les plantes (en mètres)</span>
                <input className="input" inputMode="decimal" value={distance} onChange={(e) => setDistance(e.target.value)} aria-invalid={!parseMeters(distance)} />
              </label>
              {!parseMeters(distance) && <p className="small" style={{ margin: 0 }}>Écrivez une distance comme 3 ou 2,5. Sinon 3 m sera utilisé.</p>}
              {support && <GpsProblemNote problem={support} />}
              {error !== undefined && <ErrorNote error={error} />}
              {problem && <GpsProblemNote problem={problem} />}
              <button className="btn primary big" disabled={cap === 0} onClick={() => void startLive()}>
                <Icon name="camera" /> Filmer en marchant
              </button>
              <label className={'btn big scan-photo' + (cap === 0 ? ' is-disabled' : '')}>
                Choisir une vidéo déjà filmée
                <input className="sr-only" type="file" accept="video/*" disabled={cap === 0} onChange={(e) => void importFile(e.target)} />
              </label>
              <p className="small muted" style={{ margin: 0 }}>Avec une vidéo déjà filmée, la position n’est pas connue. Vous placerez chaque plante à la main.</p>
            </>
          )}

          {step === 'live' && (
            <>
              <p style={{ margin: 0 }} role="status" aria-live="polite">
                <strong>Filmage en cours.</strong> Marchez lentement. Images gardées : {kept} sur {cap}.
              </p>
              <p className="small muted" style={{ margin: 0 }}>
                Écartées : {skipped.floue} floue{skipped.floue > 1 ? 's' : ''}, {skipped['sans-plante']} sans plante.
              </p>
              {problem && <GpsProblemNote problem={problem} />}
              <button className="btn primary big" onClick={() => void finishLive()}>
                <Icon name="check" /> Terminer
              </button>
            </>
          )}

          {step === 'tri' && (
            <div role="status" aria-live="polite" className="stack">
              <p style={{ margin: 0 }}>
                <span className="spinner" /> <strong>{progress?.label ?? 'Un instant…'}</strong>
              </p>
              {progress && (
                <div className="gauge" role="progressbar" aria-label="Avancement" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.done}>
                  <span style={{ width: `${Math.round((progress.done / Math.max(1, progress.total)) * 100)}%` }} />
                </div>
              )}
              <p className="small muted" style={{ margin: 0 }}>Images écartées : {skipped.floue} floue{skipped.floue > 1 ? 's' : ''}, {skipped['sans-plante']} sans plante.</p>
            </div>
          )}

          {step === 'fin' && (
            <>
              {mine.length === 0 ? (
                <div className="alert small" role="status">
                  <strong>Aucune image utilisable.</strong> Elles étaient floues ou sans plante. Filmez plus lentement, plus près du feuillage.
                </div>
              ) : (
                <>
                  <p style={{ margin: 0 }} role="status" aria-live="polite">
                    <strong>
                      Identification : {identified} sur {mine.length}.
                    </strong>
                  </p>
                  <div className="gauge" role="progressbar" aria-label="Identification" aria-valuemin={0} aria-valuemax={mine.length} aria-valuenow={identified}>
                    <span style={{ width: `${Math.round((identified / mine.length) * 100)}%` }} />
                  </div>
                  <p style={{ margin: 0 }}>
                    {mine.length} image{mine.length > 1 ? 's' : ''} gardée{mine.length > 1 ? 's' : ''}. {found} plante{found > 1 ? 's' : ''} à revoir.
                    {doubles > 0 && ` ${doubles} doublon${doubles > 1 ? 's' : ''} regroupé${doubles > 1 ? 's' : ''}.`}
                  </p>
                  {waiting && <p className="small muted" style={{ margin: 0 }}>Les images qui restent seront envoyées dès que possible. Vous pouvez fermer cet écran.</p>}
                  {!located && <p className="alert small">Pas de trace de marche. Glissez chaque plante à sa place sur la carte.</p>}
                  {located && !compass && <p className="alert small">La boussole ne répond pas. Chaque plante est placée à votre position, sans décalage devant vous.</p>}
                </>
              )}
              <p className="small muted" style={{ margin: 0 }}>{quotaText(quota)}.</p>
              {waiting && !hasConsent('plantnet') && (
                <button className="btn" onClick={() => setAsking(true)}>
                  Autoriser l’envoi des images
                </button>
              )}
              {waiting && hasConsent('plantnet') && (
                <button
                  className="btn"
                  onClick={() => {
                    updateQueue((q) => resetRetry(q))
                    void processQueue()
                  }}
                >
                  Réessayer maintenant
                </button>
              )}
              <button className="btn primary big" onClick={() => onClose(firstId)}>
                Revoir les plantes
              </button>
              <p className="small muted" style={{ margin: 0 }}>Limite : {DAILY_LIMIT} images par jour, pour ménager le service gratuit.</p>
            </>
          )}
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
    </Modal>
  )
}

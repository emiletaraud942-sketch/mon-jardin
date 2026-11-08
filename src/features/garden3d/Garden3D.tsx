// Vue 3D du jardin : relief + orthophoto, bâtiments, plantes, soleil réel et ombres.
// Repère : x = est, y = nord (m) ; Three.js : X = est, Y = haut, Z = -nord.
import { Component, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Canvas, type RootState } from '@react-three/fiber'
import type { Garden, Plant, Species, TerrainGrid, XY } from '../../types'
import { Scene } from './Scene'
import { dateFromDoy, dayOfYear, daysInYearOf, doyOf, formatInGarden, sunState, zonedParts } from './sun'
import { EMPTY_GARDEN_TEXT, describeSunShort, formatClock, gardenSummary, walkHelpShort, yearsLabel } from './labels'
import { disposeBuildingMaterial, heatmapRange, rampColor } from './Ground'
import { disposePlantMaterials } from './Plants'
import { disposePartGeometries } from './plantModel'
import { disposeGrassDetailTexture } from './groundDetail'
import { NO_INSETS, gardenFrame, type Insets, type Rect, type ViewMode } from './framing'
import { createWalkShared } from './walk'
import { disposeNeighborTrees } from './NeighborTrees'
import { disposeContactShadows } from './ContactShadows'
import { isTouchDevice } from './touch'
import type { DetectedTree } from '../../lib/lidar'
import { LIDAR_ATTRIBUTION } from '../../lib/lidar'
import { GotoPanel, Joystick, MiniMap, WalkButtons } from './WalkUI'
import { Fallback3D } from './Garden3DGate'
import { HELP_SEEN_KEY, HOP_PREF_KEY, parseHopPref } from './walkNav'
import { plantLabel } from './plantModel'
import { QUALITY_PREFS, TIER_LABEL, useQuality3D } from './quality'
import { SeasonPicker } from '../../components/SeasonPicker'
import { seasonDate, type SeasonChoice } from '../../engine/season'
import { goHome } from '../../lib/goHome'
import { useIntent } from '../../lib/overlays'
import { setUi, useUi } from '../../lib/ui'
import './garden3d.css'

export interface Garden3DProps {
  garden: Garden
  plants: Plant[]
  speciesById: Record<string, Species>
  selectedPlantId?: string
  onSelectPlant: (id: string | undefined) => void
  onMovePlant: (id: string, position: XY) => void
  /** Si défini, un clic au sol place une nouvelle plante de cette espèce. */
  placingSpeciesId?: string
  onPlace?: (position: XY) => void
  /** Carte d'ensoleillement optionnelle (heures de soleil), calculée par l'appelant. Ordre : sud→nord puis ouest→est. */
  sunHeatmap?: { halfSizeM: number; n: number; values: number[] }
  /** Calcul de la carte d'ensoleillement en cours (l'appelant le sait). */
  sunComputing?: boolean
  /** Demande (ou retire, avec undefined) la carte d'ensoleillement pour ce jour : l'interrupteur de la vue. */
  onSunMapRequest?: (date: Date | undefined) => void
  /** Demi-côté du carré de sol / orthophoto (m). Par défaut : emprise de la parcelle + 25 m de voisinage (30 à 100 m). */
  halfSizeM?: number
  /** Mode de vue au démarrage (perspective par défaut). */
  defaultView?: ViewMode
  /** Arbres des environs mesurés par le LiDAR HD (IGN), déjà filtrés. Vide ou absent : rien n'est affiché. */
  neighborTrees?: DetectedTree[]
  /** Hauteurs LiDAR HD (MNH) : hauteur et toit des bâtiments. Absent : hauteurs BD TOPO, toits plats. */
  canopy?: TerrainGrid
}

const HOUR_MIN = 5
const HOUR_MAX = 22
/** Durée (ms) d'une journée complète en lecture. */
const PLAY_DURATION_MS = 12000

/** Libère les ressources GPU partagées entre visites (géométries, matériaux, texture d'herbe) ; recréées à la demande. */
function disposeSharedResources() {
  disposePartGeometries()
  disposePlantMaterials()
  disposeBuildingMaterial()
  disposeGrassDetailTexture()
  disposeNeighborTrees()
  disposeContactShadows()
}

/** Repli si la 3D ne peut pas démarrer (WebGL absent, mémoire insuffisante) : message utile et « Réessayer ». */
class CanvasErrorBoundary extends Component<{ children: ReactNode; onFail: (failed: boolean) => void }, { error: boolean; detail: string }> {
  state = { error: false, detail: '' }
  static getDerivedStateFromError(err: unknown) {
    return { error: true, detail: err instanceof Error ? err.message : String(err ?? '') }
  }
  componentDidCatch(err: unknown) {
    console.warn('[garden3d] rendu 3D impossible', err)
    this.props.onFail(true)
  }
  retry = () => {
    this.props.onFail(false)
    this.setState({ error: false, detail: '' })
  }
  render() {
    if (this.state.error) return <Fallback3D verdict="error" detail={this.state.detail} onRetry={this.retry} />
    return this.props.children
  }
}

/** Vrai si l'utilisateur demande moins d'animations (pas d'inertie de caméra). */
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    if (!mq) return
    const on = () => setReduced(mq.matches)
    mq.addEventListener?.('change', on)
    return () => mq.removeEventListener?.('change', on)
  }, [])
  return reduced
}

// Le nom accessible d'un bouton est son texte visible (étiquette dans le nom) ; la description détaillée va dans `title`.
const MODES: { id: ViewMode; label: string; title: string }[] = [
  { id: 'dessus', label: 'Dessus', title: 'Vue de dessus : voir le jardin d’en haut, comme un plan' },
  { id: 'perspective', label: 'Perspective', title: 'Vue en perspective : voir le jardin en biais, comme en volant' },
  { id: 'promenade', label: 'Se promener', title: 'Se promener dans le jardin, à hauteur d’yeux' },
]

function readPref(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
function writePref(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* mémoire indisponible : le choix ne dure que pour cette session */
  }
}

const formatHour = formatClock

function RecenterIcon() {
  return (
    <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
      <circle cx="10" cy="10" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M10 1.5v3.5M10 15v3.5M1.5 10H5M15 10h3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
      <circle cx="10" cy="10" r="7.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M10 5.5V10l3 2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function GearIcon() {
  return (
    <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
      <circle cx="10" cy="10" r="2.8" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M10 1.8v2.6M10 15.6v2.6M1.8 10h2.6M15.6 10h2.6M4.2 4.2l1.9 1.9M13.9 13.9l1.9 1.9M15.8 4.2l-1.9 1.9M6.1 13.9l-1.9 1.9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function HomeIcon() {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
      <path d="M2.5 9.5 10 3l7.5 6.5M4.5 8.5V17h11V8.5M8.5 17v-5h3v5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function SunIcon() {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
      <circle cx="10" cy="10" r="3.6" fill="currentColor" />
      <path d="M10 1.8v2.4M10 15.8v2.4M1.8 10h2.4M15.8 10h2.4M4.2 4.2l1.7 1.7M14.1 14.1l1.7 1.7M15.8 4.2l-1.7 1.7M5.9 14.1l-1.7 1.7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function PinIcon() {
  return (
    <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
      <path d="M10 18s5.5-5.2 5.5-9.3a5.5 5.5 0 0 0-11 0C4.5 12.8 10 18 10 18z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <circle cx="10" cy="8.6" r="2" fill="currentColor" />
    </svg>
  )
}

function initialHour(center: Garden['center']): number {
  const now = zonedParts(new Date()) // heure légale du jardin, pas celle de l'appareil
  const h = Math.min(HOUR_MAX, Math.max(HOUR_MIN, now.hour + Math.round(now.minute / 15) / 4))
  const alt = sunState(dateFromDoy(now.year, doyOf(now.year, now.month, now.day), h), center).altitudeDeg
  return alt > 1 ? h : 14
}

export function Garden3D({
  garden,
  plants,
  speciesById,
  selectedPlantId,
  onSelectPlant,
  onMovePlant,
  placingSpeciesId,
  onPlace,
  sunHeatmap,
  sunComputing,
  onSunMapRequest,
  halfSizeM: halfSizeProp,
  defaultView = 'perspective',
  neighborTrees,
  canopy,
}: Garden3DProps) {
  const today = useMemo(() => new Date(), [])
  const year = zonedParts(today).year
  const [doy, setDoy] = useState(() => dayOfYear(today))
  const [hour, setHour] = useState(() => initialHour(garden.center))
  const [yearsAhead, setYearsAhead] = useState(0)
  const [mode, setMode] = useState<ViewMode>(defaultView)
  const [fitNonce, setFitNonce] = useState(0)
  const [gotoNonce, setGotoNonce] = useState(0)
  const [atLimit, setAtLimit] = useState(false)
  const [failed, setFailed] = useState(false)
  // Perte du contexte WebGL : 'lost' = reprise automatique en cours, 'stuck' = la reprise tarde (bouton « Réessayer »).
  const [ctx, setCtx] = useState<'ok' | 'lost' | 'stuck'>('ok')
  const [canvasKey, setCanvasKey] = useState(0)
  const ctxCleanup = useRef<(() => void) | null>(null)
  const [walkHelpOpen, setWalkHelpOpen] = useState(false)
  const [gotoOpen, setGotoOpen] = useState(false)
  const [announcement, setAnnouncement] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)
  const walkShared = useMemo(() => createWalkShared(), [])
  const reducedMotion = usePrefersReducedMotion()
  // Mouvement réduit (bonds) : choix enregistré, sinon la préférence « réduire les animations » du système.
  const [hop, setHop] = useState(() => parseHopPref(readPref(HOP_PREF_KEY), reducedMotion))
  const toggleHop = useCallback(() => {
    setHop((h) => {
      writePref(HOP_PREF_KEY, h ? '0' : '1')
      return !h
    })
  }, [])
  const coarse = useMemo(() => isTouchDevice(), [])
  const [running, setRunning] = useState(false)
  const walking = mode === 'promenade'

  // Emprise du jardin (parcelle, sinon plantes, sinon ±15 m) : cadrage et taille du sol.
  const hasParcel = !!garden.parcel && garden.parcel.length > 2
  // Avec une parcelle, l'emprise ne dépend pas des plantes : on ne la recalcule pas à chaque déplacement.
  const frame = useMemo(() => gardenFrame(garden.parcel, plants), [garden.parcel, hasParcel ? null : plants])
  const halfSizeM = halfSizeProp ?? frame.halfSizeM
  // Autre jardin : la promenade repart de l'entrée. L'emprise, elle, ne déplace jamais le promeneur.
  useEffect(() => {
    walkShared.saved = false
  }, [garden.id, walkShared])

  // Libère les ressources GPU partagées à la sortie de l'onglet 3D (elles sont recréées à la visite suivante).
  useEffect(
    () => () => {
      ctxCleanup.current?.()
      ctxCleanup.current = null
      disposeSharedResources()
    },
    [],
  )

  // Perte / reprise du contexte WebGL (mémoire, changement d'application sur mobile) : la scène revient seule.
  // Three.js recrée lui-même ses programmes et ses tampons ; il reste à redessiner (rendu à la demande).
  const onCreated = useCallback((state: RootState) => {
    ctxCleanup.current?.()
    const el = state.gl.domElement
    let stuckTimer = 0
    let kick = 0
    const onLost = (e: Event) => {
      e.preventDefault() // sans cela le navigateur ne tentera jamais de restaurer le contexte
      setCtx('lost')
      window.clearTimeout(stuckTimer)
      stuckTimer = window.setTimeout(() => setCtx((c) => (c === 'lost' ? 'stuck' : c)), 6000)
    }
    const onRestored = () => {
      window.clearTimeout(stuckTimer)
      setCtx('ok')
      state.invalidate()
      kick = window.setTimeout(() => state.invalidate(), 120) // une seconde image, le temps que Three.js ait réinitialisé son état
    }
    el.addEventListener('webglcontextlost', onLost)
    el.addEventListener('webglcontextrestored', onRestored)
    ctxCleanup.current = () => {
      window.clearTimeout(stuckTimer)
      window.clearTimeout(kick)
      el.removeEventListener('webglcontextlost', onLost)
      el.removeEventListener('webglcontextrestored', onRestored)
    }
  }, [])

  /** Hauteur des bandeaux de l'interface, pour cadrer dans la zone réellement visible. */
  const getInsets = useCallback((): Insets => {
    const root = rootRef.current
    if (!root) return NO_INSETS
    const rr = root.getBoundingClientRect()
    const bottom = root.querySelector('.g3d-bottom')
    const info = root.querySelector('.g3d-info')
    const compass = root.querySelector('.g3d-compass')
    const rect = (el: Element | null): Rect[] => {
      if (!el) return []
      const r = el.getBoundingClientRect()
      return [{ x0: r.left - rr.left - 6, y0: r.top - rr.top - 6, x1: r.right - rr.left + 6, y1: r.bottom - rr.top + 6 }]
    }
    return {
      top: info ? Math.max(0, info.getBoundingClientRect().bottom - rr.top) + 6 : 0,
      bottom: bottom ? Math.max(0, rr.bottom - bottom.getBoundingClientRect().top) + 6 : 0,
      left: 0,
      right: 0,
      corners: [...rect(info), ...rect(compass)],
    }
  }, [])

  // Aide de la Promenade : s'ouvre à la première visite et reste affichée jusqu'à « Compris » (ou « ? »). Ensuite, seul « Aide » la rouvre.
  const [hourOpen, setHourOpen] = useState(false)
  const [panelOpen, setPanelOpen] = useState(false)
  // « Tout ce que je peux faire » : entre dans la promenade, ouvre « Aller à », le panneau de l'heure ou les réglages 3D.
  useIntent('3d:promenade', () => setMode('promenade'))
  useIntent('3d:aller-a', () => {
    setMode('promenade')
    setGotoOpen(true)
  })
  useIntent('3d:heure', () => {
    setMode((m) => (m === 'promenade' ? 'perspective' : m))
    setPanelOpen(true)
  })
  useIntent('3d:reglages', () => {
    setMode((m) => (m === 'promenade' ? 'perspective' : m))
    setPanelOpen(true)
    setCollapsed(false)
  })
  useEffect(() => {
    if (!walking) {
      setWalkHelpOpen(false)
      setHourOpen(false)
      setGotoOpen(false)
      setAtLimit(false)
      setAnnouncement('')
      walkShared.run = false
      setRunning(false)
      return
    }
    setWalkHelpOpen(readPref(HELP_SEEN_KEY) !== '1')
  }, [walking, walkShared])
  const closeWalkHelp = useCallback(() => {
    setWalkHelpOpen(false)
    writePref(HELP_SEEN_KEY, '1')
  }, [])
  // Promenade immersive : l'application cache ses bandeaux (voir app.css) et la page ne défile ni ne zoome pendant les gestes.
  useEffect(() => {
    if (!walking) return
    const root = document.documentElement
    root.dataset.immersive = '1'
    const noGesture = (e: Event) => e.preventDefault() // pincement iOS
    document.addEventListener('gesturestart', noGesture)
    document.addEventListener('gesturechange', noGesture)
    return () => {
      delete root.dataset.immersive
      document.removeEventListener('gesturestart', noGesture)
      document.removeEventListener('gesturechange', noGesture)
    }
  }, [walking])
  const [showHeatmap, setShowHeatmap] = useState(false)
  const [showTrees, setShowTrees] = useState(true)
  const treeCount = neighborTrees?.length ?? 0
  const treesShown = showTrees && treeCount > 0
  const [playing, setPlaying] = useState(false)
  // Sur petit écran (ou écran peu haut), le panneau démarre replié : seul le curseur d'heure reste visible
  // et le jardin dispose de plus de place.
  const [collapsed, setCollapsed] = useState(() => typeof window !== 'undefined' && (window.innerWidth < 480 || window.innerHeight < 900))
  const compassRef = useRef<HTMLDivElement>(null)
  const hourRef = useRef(hour)
  const hourStart = useRef(hour)
  hourStart.current = hour

  // Lecture : anime l'heure de 5 h à 22 h.
  useEffect(() => {
    if (!playing) return
    hourRef.current = hourStart.current
    let raf = 0
    let last = performance.now()
    let acc = 0
    const tick = (t: number) => {
      acc += t - last
      last = t
      if (acc >= 33) {
        const dh = (acc / PLAY_DURATION_MS) * (HOUR_MAX - HOUR_MIN)
        acc = 0
        hourRef.current = Math.min(HOUR_MAX, hourRef.current + dh)
        setHour(hourRef.current)
        if (hourRef.current >= HOUR_MAX) {
          setPlaying(false)
          return
        }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing])

  const togglePlay = () => {
    if (!playing && hour >= HOUR_MAX - 0.01) setHour(HOUR_MIN)
    setPlaying((p) => !p)
  }

  // L'heure du curseur est l'heure légale du jardin (Europe/Paris), quel que soit le fuseau de l'appareil.
  const sunDate = useMemo(() => dateFromDoy(year, doy, hour), [year, doy, hour])
  const sun = useMemo(() => sunState(sunDate, garden.center), [sunDate, garden.center])
  // Âge des plantes : aujourd'hui + N ans. Saison (feuilles, fleurs, fruits) : le jour choisi, N ans plus tard.
  const growthTime = useMemo(() => {
    const d = new Date(today)
    d.setFullYear(d.getFullYear() + yearsAhead)
    return d.getTime()
  }, [today, yearsAhead])
  const seasonTime = useMemo(() => dateFromDoy(year + yearsAhead, doy, 12).getTime(), [year, yearsAhead, doy])
  const quality = useQuality3D()

  // Saison choisie (boutons, ou depuis la carte) : le curseur de jour suit ; un curseur déplacé à la main n'en désigne aucune.
  const seasonChoice = useUi().season
  const seasonDoy = (c: SeasonChoice | undefined) => dayOfYear(seasonDate(c, today))
  const seasonShown = seasonChoice && seasonDoy(seasonChoice) === doy ? seasonChoice : doy === dayOfYear(today) ? 'aujourdhui' : undefined
  const chooseSeason = (c: SeasonChoice) => {
    setUi({ season: c })
    setDoy(seasonDoy(c))
  }
  useEffect(() => {
    if (seasonChoice) setDoy(dayOfYear(seasonDate(seasonChoice, today)))
  }, [seasonChoice, today])
  const daysInYear = daysInYearOf(year)
  const dateLabel = formatInGarden(sunDate, { day: 'numeric', month: 'long' })
  const dateShort = formatInGarden(sunDate, { day: 'numeric', month: 'short' })

  const heatRange = useMemo(() => (sunHeatmap ? heatmapRange(sunHeatmap.values) : null), [sunHeatmap])
  const heatGradient = useMemo(
    () =>
      `linear-gradient(to right, ${[0, 0.25, 0.5, 0.75, 1].map((t) => '#' + rampColor(t).getHexString()).join(', ')})`,
    [],
  )

  // Interrupteur d'ensoleillement : l'appelant calcule la carte pour le jour choisi (attente de 0,6 s après le curseur).
  const sunRequest = useRef(onSunMapRequest)
  sunRequest.current = onSunMapRequest
  useEffect(() => {
    if (!sunRequest.current) return
    if (!showHeatmap) {
      sunRequest.current(undefined)
      return
    }
    const t = window.setTimeout(() => sunRequest.current?.(dateFromDoy(year, doy, 12)), 600)
    return () => window.clearTimeout(t)
  }, [showHeatmap, doy, year])

  const summary = useMemo(() => gardenSummary(garden.name, plants.length, garden.buildings?.length ?? 0), [garden.name, plants.length, garden.buildings])
  // Points de photos du jardin (Photos du jardin) : destinations de « Aller à » et repères de la mini-carte.
  const panoIds = useMemo(() => (garden.panoramas ?? []).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y)).map((p) => p.id), [garden.panoramas])
  const photoPoints = useMemo(() => (garden.panoramas ?? []).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y)).map((p) => ({ x: p.x, y: p.y })), [garden.panoramas])
  const gotoPoints = useMemo(() => photoPoints.map((p, i) => ({ ...p, id: panoIds[i], label: `Point photo ${i + 1}` })), [photoPoints, panoIds])
  const placingName = placingSpeciesId ? speciesById[placingSpeciesId]?.nomCommun ?? 'la plante' : undefined
  const selectedPlant = selectedPlantId ? plants.find((p) => p.id === selectedPlantId) : undefined
  const selectedName = selectedPlant ? selectedPlant.customName || speciesById[selectedPlant.speciesId]?.nomCommun || 'Plante' : ''

  /** Heure : curseur, lecture de la journée et (hors Promenade) bouton Réglages, sur une seule ligne. */
  const hourRow = (withSettings: boolean) => (
    <div className="g3d-hourrow" data-feat="heure">
      <label className="g3d-hourfield">
        <span className="g3d-field-label">
          Heure <b>{formatHour(hour)}</b>
        </span>
        <input
          type="range"
          min={HOUR_MIN}
          max={HOUR_MAX}
          step={0.25}
          value={hour}
          aria-valuetext={formatHour(hour)}
          onChange={(e) => {
            setPlaying(false)
            setHour(Number(e.target.value))
          }}
        />
      </label>
      <button
        type="button"
        className="g3d-btn g3d-btn--label"
        aria-label={playing ? 'Pause' : 'Animer la journée'}
        aria-pressed={playing}
        onClick={togglePlay}
        title={playing ? 'Pause' : 'Voir le soleil se déplacer de 5 h à 22 h'}
      >
        {playing ? (
          <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
            <rect x="4" y="3" width="4" height="14" rx="1" fill="currentColor" />
            <rect x="12" y="3" width="4" height="14" rx="1" fill="currentColor" />
          </svg>
        ) : (
          <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
            <path d="M5 3l12 7-12 7z" fill="currentColor" />
          </svg>
        )}
        <span aria-hidden="true">{playing ? 'Pause' : 'Animer'}</span>
      </button>
      {withSettings && (
        <button
          type="button"
          className="g3d-btn g3d-btn--label"
          onClick={() => setCollapsed((c) => !c)}
          aria-expanded={!collapsed}
          aria-label="Réglages 3D"
          title={collapsed ? 'Afficher le jour, la qualité et la croissance des plantes' : 'Masquer ces réglages'}
        >
          <GearIcon />
          <span aria-hidden="true">Réglages 3D</span>
        </button>
      )}
    </div>
  )
  const compass = (
    <div className="g3d-compass" title="La flèche rouge montre le nord" aria-label="Flèche du nord">
      <div ref={compassRef} className="g3d-compass-needle">
        <svg viewBox="0 0 40 40" width="30" height="30" aria-hidden="true">
          <polygon className="g3d-needle-north" points="20,3 27,21 20,17 13,21" />
          <polygon points="20,37 27,19 20,23 13,19" fill="currentColor" opacity="0.45" />
        </svg>
      </div>
      <span className="g3d-compass-label">N</span>
    </div>
  )

  return (
    <div className="g3d-root" ref={rootRef} data-mode={mode} data-failed={failed || undefined} data-feat="vue-3d">
      <CanvasErrorBoundary onFail={setFailed}>
        <Canvas
          key={canvasKey}
          className="g3d-canvas"
          shadows
          dpr={[1, quality.tier === 0 ? 1.5 : 2]}
          frameloop="demand"
          role="img"
          aria-label={summary}
          gl={{ antialias: true, powerPreference: 'high-performance' }}
          onCreated={onCreated}
          onPointerMissed={(e) => {
            if (e.type === 'click' && !placingSpeciesId) onSelectPlant(undefined)
          }}
        >
          <Scene
            garden={garden}
            plants={plants}
            speciesById={speciesById}
            selectedPlantId={selectedPlantId}
            onSelectPlant={onSelectPlant}
            onMovePlant={onMovePlant}
            placingSpeciesId={placingSpeciesId}
            onPlace={onPlace}
            sunHeatmap={sunHeatmap}
            showHeatmap={showHeatmap}
            halfSizeM={halfSizeM}
            mode={mode}
            frame={frame}
            fitNonce={fitNonce}
            gotoNonce={gotoNonce}
            onWalkLimit={setAtLimit}
            getInsets={getInsets}
            walkShared={walkShared}
            reducedMotion={reducedMotion}
            sun={sun}
            growthTime={growthTime}
            seasonTime={seasonTime}
            tier={quality.tier}
            canopy={canopy}
            compassRef={compassRef}
            neighborTrees={treesShown ? neighborTrees : undefined}
            hop={hop}
            onAnnounce={setAnnouncement}
          />
        </Canvas>
      </CanvasErrorBoundary>

      <div className="g3d-overlay">
        {walking ? (
          <div className="g3d-top g3d-top--walk" data-feat="promenade-ui">
            <div className="g3d-left">
              <div className="g3d-walkrow">
                <button type="button" className="g3d-btn g3d-quit" onClick={() => setMode('perspective')} title="Quitter la promenade et revenir à la vue en perspective">
                  <span aria-hidden="true">✕</span> Quitter
                </button>
                <button
                  type="button"
                  className="g3d-btn g3d-datepill"
                  aria-expanded={hourOpen}
                  aria-controls="g3d-hour-panel"
                  title={`Régler l’heure : le soleil et les ombres suivent (${dateShort})`}
                  onClick={() => setHourOpen((v) => !v)}
                >
                  <ClockIcon />
                  Heure <b>{formatHour(hour)}</b>
                </button>
              </div>
              {hourOpen && <div className="g3d-panel g3d-panel--walk" id="g3d-hour-panel">{hourRow(false)}</div>}
              <button type="button" className="g3d-minibtn" aria-expanded={gotoOpen} aria-controls="g3d-goto" aria-label="Aller à : ouvrir la carte et la liste des endroits" title="Toucher la carte pour aller quelque part" onClick={() => setGotoOpen((v) => !v)}>
                <MiniMap
                  shared={walkShared}
                  parcel={garden.parcel}
                  buildings={garden.buildings}
                  plants={plants}
                  speciesById={speciesById}
                  selectedPlantId={selectedPlantId}
                  bounds={frame.bounds}
                  size={76}
                  points={photoPoints}
                />
                <span className="g3d-minibtn-word" aria-hidden="true">
                  Aller à
                </span>
              </button>
            </div>
            <div className="g3d-tools">
              {compass}
              <button type="button" className="g3d-btn g3d-btn--label" aria-expanded={gotoOpen} aria-controls="g3d-goto" title="Aller à une plante, à un point photo, ou toucher la carte" onClick={() => setGotoOpen((v) => !v)}>
                <PinIcon /> Aller à
              </button>
              <button type="button" className="g3d-btn g3d-btn--label" aria-expanded={walkHelpOpen} aria-controls="g3d-walk-help" title="Comment se promener ?" onClick={() => (walkHelpOpen ? closeWalkHelp() : setWalkHelpOpen(true))}>
                <b aria-hidden="true">?</b> Aide
              </button>
              <button type="button" className="g3d-btn g3d-btn--label" title="Revenir à l’entrée du jardin" onClick={() => setFitNonce((n) => n + 1)}>
                <RecenterIcon /> Recentrer
              </button>
              <button type="button" className="g3d-btn g3d-btn--label g3d-home" title="Quitter la 3D et revenir à l’accueil" onClick={goHome}>
                <HomeIcon /> Accueil
              </button>
            </div>
          </div>
        ) : (
          <div className="g3d-top">
            <div className="g3d-left">
              <div className="g3d-chip g3d-info" aria-live="polite">
                <strong>{dateShort}</strong>
                <span className="g3d-sun">{describeSunShort(hour, sun.altitudeDeg, sun.azimuthDeg)}</span>
                {yearsAhead > 0 && <span className="g3d-sun g3d-sun--years">{yearsLabel(yearsAhead).toLowerCase()}</span>}
              </div>
              {(sunHeatmap || onSunMapRequest) && (
                <button
                  type="button"
                  className="g3d-btn g3d-sunbtn"
                  data-feat="ensoleillement"
                  aria-pressed={showHeatmap}
                  onClick={() => setShowHeatmap((v) => !v)}
                  title="Colorier le terrain selon le soleil qu’il reçoit le jour choisi"
                >
                  <SunIcon />
                  {showHeatmap ? 'Masquer l’ensoleillement' : 'Voir l’ensoleillement'}
                </button>
              )}
              {treesShown && <span className="g3d-attrib">Arbres des environs : {LIDAR_ATTRIBUTION.replace(' (Licence Ouverte)', '')}</span>}
            </div>
            <div className="g3d-tools">{compass}</div>
          </div>
        )}

        {walking && gotoOpen && (
          <GotoPanel
            shared={walkShared}
            parcel={garden.parcel}
            buildings={garden.buildings}
            plants={plants}
            speciesById={speciesById}
            selectedPlantId={selectedPlantId}
            bounds={frame.bounds}
            labelOf={(p) => plantLabel(p, speciesById[p.speciesId])}
            points={gotoPoints}
            hop={hop}
            onToggleHop={toggleHop}
            onClose={() => setGotoOpen(false)}
          />
        )}
        {walking && (
          <div className="g3d-sr-only" role="status" aria-live="polite" aria-atomic="true">
            {announcement}
          </div>
        )}

        {ctx !== 'ok' && (
          <div className="g3d-chip g3d-hint g3d-notice" role="status">
            {ctx === 'lost' ? (
              'L’affichage s’est interrompu. Il revient tout seul…'
            ) : (
              <>
                L’affichage s’est interrompu.{' '}
                <button type="button" className="g3d-btn g3d-btn--small" onClick={() => { setCtx('ok'); setCanvasKey((k) => k + 1) }}>
                  Réessayer
                </button>
              </>
            )}
          </div>
        )}
        {placingName && <div className="g3d-chip g3d-hint">Touchez le sol pour placer : {placingName}</div>}
        <div className="g3d-bottom">
          {showHeatmap && sunComputing && (
            <div className="g3d-chip g3d-legend" role="status">
              Calcul de l’ensoleillement…
            </div>
          )}
          {showHeatmap && heatRange && !sunComputing && (
            <div className="g3d-chip g3d-legend">
              <span className="g3d-legend-title">Plus la zone est claire, plus elle reçoit de soleil</span>
              <span className="g3d-legend-bar" style={{ background: heatGradient }} />
              <span className="g3d-legend-scale">
                <span>{heatRange[0].toLocaleString('fr-FR', { maximumFractionDigits: 1 })} h</span>
                <span>{heatRange[1].toLocaleString('fr-FR', { maximumFractionDigits: 1 })} h de soleil</span>
              </span>
            </div>
          )}

          {plants.length === 0 && !placingName && (
            <div className="g3d-chip g3d-hint g3d-empty" role="status">
              {EMPTY_GARDEN_TEXT}
            </div>
          )}

          {walking ? (
            <>
              {atLimit && (
                <div className="g3d-chip g3d-hint g3d-hint--walk" role="status">
                  Limite du jardin
                </div>
              )}
              {walkHelpOpen && (
                <div className="g3d-chip g3d-hint g3d-hint--walk g3d-helpchip" id="g3d-walk-help" role="status">
                  <span>{walkHelpShort(coarse)}</span>
                  <button type="button" className="g3d-btn g3d-btn--small" onClick={closeWalkHelp}>
                    Compris
                  </button>
                </div>
              )}
              {selectedPlant && (
                <div className="g3d-chip g3d-selchip">
                  <strong className="g3d-selname">{selectedName}</strong>
                  <button type="button" className="g3d-btn g3d-btn--small" title="Se placer près de cette plante, en la regardant" onClick={() => setGotoNonce((n) => n + 1)}>
                    <PinIcon /> Aller
                  </button>
                  <button type="button" className="g3d-btn g3d-btn--small" title="Quitter la promenade et ouvrir la fiche de la plante" onClick={() => setMode('perspective')}>
                    Fiche
                  </button>
                  <button type="button" className="g3d-btn g3d-btn--small g3d-btn--icon" aria-label="Désélectionner la plante" onClick={() => onSelectPlant(undefined)}>
                    <span aria-hidden="true">✕</span>
                  </button>
                </div>
              )}
              {coarse && (
                <div className="g3d-walkbar">
                  <Joystick shared={walkShared} />
                  <WalkButtons
                    shared={walkShared}
                    running={running}
                    onToggleRun={() => {
                      walkShared.run = !running
                      setRunning(!running)
                    }}
                  />
                </div>
              )}
            </>
          ) : (
            <>
              {panelOpen && (
              <div className="g3d-panel" id="g3d-time-panel">
                {hourRow(true)}
                {/* Les saisons restent visibles même panneau réduit (téléphone) : c'est ce qu'on cherche pour voir son jardin fleuri en hiver. */}
                <div data-feat="saison">
                  <SeasonPicker className="g3d-shortcuts" buttonClass="g3d-btn g3d-btn--small" value={seasonShown} onChange={chooseSeason} />
                </div>
                {!collapsed && (
                  <>
                    <label className="g3d-field">
                      <span className="g3d-field-label">
                        Jour <b>{dateLabel}</b>
                      </span>
                      <input type="range" min={1} max={daysInYear} step={1} value={doy} aria-valuetext={dateLabel} onChange={(e) => setDoy(Number(e.target.value))} />
                      <span className="g3d-help">Glissez pour changer de saison.</span>
                    </label>
                    {treeCount > 0 && (
                      <label className="g3d-check">
                        <input type="checkbox" checked={showTrees} onChange={(e) => setShowTrees(e.target.checked)} />
                        <span>Arbres des environs (IGN) : {treeCount}</span>
                      </label>
                    )}
                    <div className="g3d-field" data-feat="qualite">
                      <span className="g3d-field-label">
                        Qualité 3D <b>{quality.pref === 'auto' ? `Auto (${TIER_LABEL[quality.tier]})` : QUALITY_PREFS.find((q) => q.id === quality.pref)?.label}</b>
                      </span>
                      <div className="g3d-shortcuts" role="group" aria-label="Qualité 3D">
                        {QUALITY_PREFS.map((q) => (
                          <button key={q.id} type="button" className="g3d-btn g3d-btn--small g3d-quality" aria-pressed={quality.pref === q.id} title={q.title} onClick={() => quality.setPref(q.id)}>
                            {q.label}
                          </button>
                        ))}
                      </div>
                      <span className="g3d-help">« Simple » si votre téléphone ralentit.</span>
                    </div>
                    <label className="g3d-field" data-feat="annees">
                      <span className="g3d-field-label">
                        <b>{yearsLabel(yearsAhead)}</b>
                      </span>
                      <input
                        type="range"
                        min={0}
                        max={20}
                        step={1}
                        value={yearsAhead}
                        aria-label="Dans combien d’années"
                        aria-valuetext={yearsLabel(yearsAhead)}
                        onChange={(e) => setYearsAhead(Number(e.target.value))}
                      />
                      <span className="g3d-help">Glissez pour voir vos plantes grandir.</span>
                    </label>
                  </>
                )}
              </div>
              )}
              <div className="g3d-bar">
                <div className="g3d-seg" role="group" aria-label="Mode de vue">
                  {MODES.map((m) => (
                    <button key={m.id} type="button" className="g3d-seg-btn" aria-pressed={mode === m.id} title={m.title} onClick={() => setMode(m.id)}>
                      {m.label}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className="g3d-btn g3d-btn--label"
                  aria-label="Heure et réglages"
                  aria-expanded={panelOpen}
                  aria-controls="g3d-time-panel"
                  title="Régler l’heure, le jour et la croissance des plantes"
                  onClick={() => setPanelOpen((v) => !v)}
                >
                  <ClockIcon />
                  <span aria-hidden="true">Heure</span>
                </button>
                <button type="button" className="g3d-btn g3d-btn--label g3d-recenter" aria-label="Recentrer" title="Cadrer de nouveau tout le jardin" onClick={() => setFitNonce((n) => n + 1)}>
                  <RecenterIcon />
                  <span aria-hidden="true">Recentrer</span>
                </button>
              </div>

            </>
          )}
        </div>
      </div>
    </div>
  )
}

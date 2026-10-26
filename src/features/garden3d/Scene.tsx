// Contenu du canvas : lumière solaire, caméra, sol, bâtiments, plantes et interactions.
import type { DetectedTree } from '../../lib/lidar'
import { NeighborTrees } from './NeighborTrees'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentRef, type RefObject } from 'react'
import * as THREE from 'three'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { Html, OrbitControls, OrthographicCamera, PerspectiveCamera } from '@react-three/drei'
import type { Garden, Plant, Species, XY } from '../../types'
import { Buildings, Ground, HeatmapLayer, ParcelOutline, type SunHeatmap } from './Ground'
import { Plants, type PlantPointerHandlers, type PlantsHandle } from './Plants'
import { buildPlantScene } from './plantModel'
import { SkyDome } from './SkyDome'
import { enableOnDemandShadows, markShadowsDirty } from './shadows'
import { TRIANGLE_CAP, reportFrameInterval, type QualityTier } from './quality'
import type { TerrainGrid } from '../../types'
import { makeHeightSampler } from './terrain'
import type { SunState } from './sun'
import { fitOrtho, fitPerspective, orthoPixels, viewResetToken, walkResetToken, type Frame, type Insets, type ViewMode } from './framing'
import { dragThresholdPx, groundPointOnRay } from './drag'
import { DEBUG_3D } from './debug'
import { makeColliders, type DetailLevel, type WalkShared } from './walk'
import { WalkRig } from './Walk'

export interface SceneProps {
  garden: Garden
  plants: Plant[]
  speciesById: Record<string, Species>
  selectedPlantId?: string
  onSelectPlant: (id: string | undefined) => void
  onMovePlant: (id: string, position: XY) => void
  placingSpeciesId?: string
  onPlace?: (position: XY) => void
  sunHeatmap?: SunHeatmap
  showHeatmap: boolean
  halfSizeM: number
  /** Mode de vue : dessus (orthographique), perspective ou promenade (à hauteur d'yeux). */
  mode: ViewMode
  /** Emprise de la parcelle (cadrage) et clé de recadrage automatique. */
  frame: Frame
  /** Incrémenté par « Recentrer » (cadrage, ou retour à l'entrée en Promenade). */
  fitNonce: number
  /** Incrémenté par « Aller à cette plante » (Promenade). */
  gotoNonce: number
  /** Vrai tant que la limite du jardin retient le promeneur. */
  onWalkLimit?: (limited: boolean) => void
  /** Mesure les bandeaux de l'interface (px) pour cadrer dans la zone réellement visible. */
  getInsets: () => Insets
  walkShared: WalkShared
  reducedMotion: boolean
  sun: SunState
  /** Date (ms) utilisée pour la croissance des plantes (âge). */
  growthTime: number
  /** Date (ms) qui fixe la saison (feuilles, fleurs, fruits, teinte d'automne). */
  seasonTime: number
  /** Niveau de détail maximal des plantes (qualité 3D). */
  tier: QualityTier
  /** Hauteur de canopée / bâtiments LiDAR (MNH), si disponible : hauteur des bâtiments. */
  canopy?: TerrainGrid
  /** Mois affiché (1–12) pour les fruits en saison. */
  month?: number
  compassRef: RefObject<HTMLDivElement>
  /** Arbres des environs (LiDAR HD) à dessiner ; absent ou vide = rien. */
  neighborTrees?: DetectedTree[]
}

type OrbitControlsImpl = ComponentRef<typeof OrbitControls>

const TOP_MOUSE = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN }
const TOP_TOUCH = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_PAN }

// ---------- Soleil, ciel, ambiance ----------

const COARSE_POINTER = typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches
/** Seuil de glisser d'une plante : 12 px en tactile, 6 px à la souris. */
const DRAG_THRESHOLD_PX = dragThresholdPx(COARSE_POINTER)

function SunAndSky({ sun, halfSizeM, walking, tier }: { sun: SunState; halfSizeM: number; walking: boolean; tier: QualityTier }) {
  const scene = useThree((s) => s.scene)
  const gl = useThree((s) => s.gl)
  const invalidate = useThree((s) => s.invalidate)
  const lightRef = useRef<THREE.DirectionalLight>(null)
  const dist = halfSizeM * 3
  // Ombres limitées : 1024² sur écran tactile ou en qualité simple, 2048² sinon. Calculées à la demande (voir shadows.ts).
  const shadowSize = COARSE_POINTER || tier === 0 ? 1024 : 2048

  useEffect(() => {
    enableOnDemandShadows(gl)
    return () => {
      gl.shadowMap.autoUpdate = true
    }
  }, [gl])

  useLayoutEffect(() => {
    const l = lightRef.current
    if (!l) return
    const cam = l.shadow.camera
    const r = halfSizeM * 1.45 // couvre la diagonale du carré quelle que soit l'orientation
    cam.left = -r
    cam.right = r
    cam.top = r
    cam.bottom = -r
    cam.near = 0.5
    cam.far = dist * 2.2
    cam.updateProjectionMatrix()
    markShadowsDirty(gl)
  }, [halfSizeM, dist, shadowSize, gl])

  useEffect(() => {
    // Repli si le dôme ne s'affiche pas : fond et brume à la couleur de l'horizon.
    const c = new THREE.Color(sun.horizon)
    if (scene.background instanceof THREE.Color) scene.background.copy(c)
    else scene.background = c
    // Brume légère en vue d'ensemble ; à hauteur d'yeux, elle fond le sol dans le ciel (pas de ligne d'horizon abrupte).
    const near = walking ? 45 : halfSizeM * 3.5
    const far = walking ? Math.min(halfSizeM * 6, 260) : halfSizeM * 11
    if (scene.fog instanceof THREE.Fog) {
      scene.fog.color.copy(c)
      scene.fog.near = near
      scene.fog.far = far
    } else scene.fog = new THREE.Fog(c, near, far)
    invalidate()
  }, [scene, sun.horizon, halfSizeM, walking, invalidate])
  useEffect(
    () => () => {
      scene.fog = null
    },
    [scene],
  )

  const [dx, dy, dz] = sun.dir
  const y = Math.max(0.03, dy)
  useEffect(() => {
    markShadowsDirty(gl)
    invalidate()
  }, [dx, dy, dz, gl, invalidate])
  return (
    <>
      <SkyDome sun={sun} />
      <directionalLight
        key={shadowSize}
        ref={lightRef}
        castShadow
        position={[dx * dist, y * dist, dz * dist]}
        intensity={2.5 * sun.daylight}
        color={sun.light}
        shadow-mapSize={[shadowSize, shadowSize]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.04}
        shadow-radius={3}
      />
      {/* Remplissage plus fort : les ombres restent douces, jamais noires. */}
      <hemisphereLight color={sun.sky} groundColor="#566a3b" intensity={0.35 + 0.85 * sun.daylight} />
      <ambientLight color="#8fa3d9" intensity={0.12 + 0.08 * (1 - sun.daylight)} />
    </>
  )
}

// ---------- Caméra et contrôles (dessus / perspective) ----------

function CameraRig({
  mode,
  gardenId,
  frame,
  nonce,
  halfSizeM,
  getInsets,
  centerY,
  reducedMotion,
  compassRef,
}: {
  mode: 'dessus' | 'perspective'
  gardenId: string
  frame: Frame
  nonce: number
  halfSizeM: number
  getInsets: () => Insets
  centerY: number
  reducedMotion: boolean
  compassRef: RefObject<HTMLDivElement>
}) {
  const size = useThree((s) => s.size)
  const camera = useThree((s) => s.camera)
  const controls = useThree((s) => s.controls) as unknown as OrbitControlsImpl | null
  const invalidate = useThree((s) => s.invalidate)
  const top = mode === 'dessus'
  const touched = useRef(false)
  const applied = useRef({ token: '', w: 0, h: 0 })
  // La caméra ne se recadre que si ce jeton change : « Recentrer », autre jardin, autre mode.
  // L'emprise (frame.key) n'en fait pas partie : une plante qui sort des bornes ne doit pas faire perdre sa vue à l'utilisateur.
  const token = viewResetToken({ mode, gardenId, nonce })

  // Cadrage calculé sur l'emprise de la parcelle et la zone visible du canvas.
  // Recalculé quand l'emprise ou la taille change (il fixe aussi les limites de zoom), mais sans déplacer la caméra.
  const fit = useMemo(() => {
    const insets = getInsets()
    return top
      ? { ortho: fitOrtho(frame.bounds, size.width, size.height, insets), persp: null }
      : { ortho: null, persp: fitPerspective(frame.bounds, size.width, size.height, insets, { groundY: centerY }) }
    // frame.key résume frame.bounds (l'objet, lui, change à chaque liste de plantes). `nonce` force un
    // nouveau calcul sur « Recentrer », avec les bandeaux d'interface tels qu'ils sont à ce moment.
  }, [top, frame.key, size.width, size.height, centerY, getInsets, nonce])
  // Valeurs de départ des caméras : figées tant que le jeton ne change pas (ni zoom ni position réinitialisés).
  const initRef = useRef<{ token: string; fit: typeof fit } | null>(null)
  if (!initRef.current || initRef.current.token !== token) initRef.current = { token, fit }
  const init = initRef.current.fit

  // (Re)cadrage : à l'ouverture, au changement de mode ou de parcelle, et sur « Recentrer ».
  // Tant que l'utilisateur n'a pas touché à la vue, un redimensionnement du canvas recadre aussi.
  useEffect(() => {
    if (!controls || controls.object !== camera) return
    if (!!(camera as THREE.OrthographicCamera).isOrthographicCamera !== top) return
    const a = applied.current
    const same = a.token === token
    if (same && (touched.current || (a.w === size.width && a.h === size.height))) return
    if (fit.ortho && (camera as THREE.OrthographicCamera).isOrthographicCamera) {
      const [tx, , tz] = fit.ortho.target
      const cam = camera as THREE.OrthographicCamera
      cam.zoom = fit.ortho.zoom
      cam.position.set(tx, halfSizeM * 4, tz + 0.001)
      cam.updateProjectionMatrix()
      controls.target.set(tx, 0, tz)
    } else if (fit.persp && (camera as THREE.PerspectiveCamera).isPerspectiveCamera) {
      camera.position.set(...fit.persp.position)
      controls.target.set(...fit.persp.target)
    } else return
    controls.update()
    applied.current = { token, w: size.width, h: size.height }
    if (!same) touched.current = false
    invalidate()
  }, [controls, camera, top, token, fit, size.width, size.height, halfSizeM, invalidate])

  useEffect(() => {
    if (!controls) return
    const onStart = () => {
      touched.current = true
    }
    controls.addEventListener('start', onStart)
    return () => controls.removeEventListener('start', onStart)
  }, [controls])

  useFrame(() => {
    const c = controls
    const el = compassRef.current
    if (c && el && c.object === camera) el.style.transform = `rotate(${c.getAzimuthalAngle()}rad)`
  })

  const clampTarget = useCallback(() => {
    const c = controls
    if (!c) return
    const t = c.target
    const cx = Math.max(-halfSizeM, Math.min(halfSizeM, t.x))
    const cz = Math.max(-halfSizeM, Math.min(halfSizeM, t.z))
    const dx = cx - t.x
    const dz = cz - t.z
    // En perspective la cible reste à la hauteur du relief : seul le plan horizontal est borné.
    if (dx || dz || (top && t.y !== 0)) {
      const dy = top ? -t.y : 0
      t.set(cx, top ? 0 : t.y, cz)
      c.object.position.x += dx
      c.object.position.y += dy
      c.object.position.z += dz
    }
  }, [controls, halfSizeM, top])

  if (top && init.ortho && fit.ortho) {
    const [tx, , tz] = init.ortho.target
    return (
      <>
        {/* Légèrement décalée vers le sud (+Z) : l'azimut vaut 0, le nord est en haut de l'écran. */}
        <OrthographicCamera key="ortho" makeDefault position={[tx, halfSizeM * 4, tz + 0.001]} zoom={init.ortho.zoom} near={0.1} far={halfSizeM * 20} />
        <OrbitControls
          key="ctl-top"
          makeDefault
          target={init.ortho.target}
          enableRotate={false}
          enableDamping={!reducedMotion}
          dampingFactor={0.15}
          screenSpacePanning
          minZoom={fit.ortho.zoom * 0.5}
          maxZoom={fit.ortho.zoom * 40}
          mouseButtons={TOP_MOUSE}
          touches={TOP_TOUCH}
          onChange={clampTarget}
        />
      </>
    )
  }
  if (!top && init.persp && fit.persp) {
    return (
      <>
        <PerspectiveCamera key="persp" makeDefault position={init.persp.position} fov={45} near={0.1} far={halfSizeM * 20} />
        <OrbitControls
          key="ctl-persp"
          makeDefault
          target={init.persp.target}
          enableDamping={!reducedMotion}
          dampingFactor={0.12}
          minDistance={fit.persp.minDistance}
          maxDistance={fit.persp.maxDistance}
          maxPolarAngle={Math.PI / 2 - 0.08}
          onChange={clampTarget}
        />
      </>
    )
  }
  return null
}

// ---------- Scène ----------

export function Scene(props: SceneProps) {
  const {
    garden,
    plants,
    speciesById,
    selectedPlantId,
    placingSpeciesId,
    sunHeatmap,
    showHeatmap,
    halfSizeM,
    mode,
    frame,
    fitNonce,
    gotoNonce,
    onWalkLimit,
    getInsets,
    walkShared,
    reducedMotion,
    sun,
    growthTime,
    seasonTime,
    tier,
    canopy,
    compassRef,
    neighborTrees,
  } = props
  const walking = mode === 'promenade'
  const get = useThree((s) => s.get)
  const invalidate = useThree((s) => s.invalidate)
  const gl = useThree((s) => s.gl)

  // Callbacks toujours à jour pour les écouteurs posés sur window pendant un glisser.
  const cb = useRef(props)
  cb.current = props

  const sample = useMemo(() => makeHeightSampler(garden.terrain), [garden.terrain])
  const plantsRef = useRef<PlantsHandle>(null)
  /** Groupe de la plante sélectionnée (anneau + étiquette) : suit la plante pendant un glisser. */
  const selRef = useRef<THREE.Group>(null)

  const [hoverId, setHoverId] = useState<string | undefined>()
  // Incrémenté après un glisser validé : reconstruit les instances depuis les données (remet tout en cohérence).
  const [rebuild, setRebuild] = useState(0)
  // Niveaux de détail des plantes proches du promeneur (calculés par WalkRig).
  const [lod, setLod] = useState<Record<string, DetailLevel>>({})
  useEffect(() => {
    if (!walking) setLod({})
  }, [walking])
  const colliders = useMemo(() => makeColliders(garden.buildings), [garden.buildings])

  const builds = useRef(0)
  const { parts, visuals, triangles, tiers } = useMemo(
    () => {
      builds.current++
      return buildPlantScene({
        plants,
        speciesById,
        at: new Date(growthTime),
        seasonAt: new Date(seasonTime),
        sample,
        lod: walking ? lod : undefined,
        tier,
        triangleCap: TRIANGLE_CAP[tier],
      })
    },
    // `rebuild` n'est pas lu : il force un nouveau calcul après un glisser (voir plus haut).
    [plants, speciesById, growthTime, seasonTime, sample, lod, walking, tier, rebuild],
  )
  const planStats = useRef({ triangles, tiers })
  planStats.current = { triangles, tiers }

  // Fréquence d'images mesurée (Auto abaisse le niveau si le téléphone peine) : intervalle entre images consécutives.
  const lastFrame = useRef(0)
  useFrame(() => {
    const now = performance.now()
    if (lastFrame.current) reportFrameInterval(now - lastFrame.current)
    lastFrame.current = now
  })
  const visualsRef = useRef(visuals)
  visualsRef.current = visuals
  // Mesures de développement (?debug=1) : projection d'une plante à l'écran, compteurs de rendu et de reconstruction.
  useEffect(() => {
    if (!DEBUG_3D) return
    const w = window as unknown as { __g3d?: unknown }
    w.__g3d = {
      project: (id: string) => {
        const v = visualsRef.current[id]
        if (!v) return null
        const { camera, gl: renderer } = get()
        const r = renderer.domElement.getBoundingClientRect()
        const p = new THREE.Vector3(v.base[0], v.base[1] + v.heightM * 0.4, v.base[2]).project(camera)
        return { x: r.left + ((p.x + 1) / 2) * r.width, y: r.top + ((1 - p.y) / 2) * r.height }
      },
      base: (id: string) => visualsRef.current[id]?.base ?? null,
      // Cadre une plante de près (recette visuelle) : caméra à `dist` m, légèrement en hauteur, vers le sud-ouest.
      focus: (id: string, k = 1.1, lift = 0.5) => {
        const v = visualsRef.current[id]
        const { camera, controls } = get() as unknown as { camera: THREE.Camera; controls: { target: THREE.Vector3; update: () => void } | null }
        if (!v || !controls) return false
        const [x, y, z] = v.base
        const dist = Math.max(2.2, (v.heightM + v.spreadM) * k)
        const ty = y + v.heightM * 0.45
        camera.position.set(x + dist * 0.55, ty + lift + dist * 0.25, z + dist * 0.85)
        controls.target.set(x, ty, z)
        controls.update()
        invalidate()
        return true
      },
      camera: () => {
        const c = get().camera as THREE.OrthographicCamera & THREE.PerspectiveCamera
        return { position: c.position.toArray(), zoom: c.zoom, ortho: !!c.isOrthographicCamera }
      },
      stats: () => ({ builds: builds.current, plantTriangles: planStats.current.triangles, tiers: planStats.current.tiers, calls: gl.info.render.calls, triangles: gl.info.render.triangles, frames: gl.info.render.frame, geometries: gl.info.memory.geometries, textures: gl.info.memory.textures }),
    }
    return () => {
      delete w.__g3d
    }
  }, [get, gl])
  const sampleRef = useRef(sample)
  sampleRef.current = sample
  const centerY = useMemo(() => sample((frame.bounds.minX + frame.bounds.maxX) / 2, (frame.bounds.minY + frame.bounds.maxY) / 2), [sample, frame.bounds])

  // ----- Sol sous le pointeur pendant un glisser : calcul (plan + relief), sans raycast sur le maillage -----
  const picker = useMemo(() => ({ rc: new THREE.Raycaster(), ndc: new THREE.Vector2() }), [])
  const clampXY = useCallback(
    (p: XY): XY => ({
      x: Math.max(-halfSizeM, Math.min(halfSizeM, p.x)),
      y: Math.max(-halfSizeM, Math.min(halfSizeM, p.y)),
    }),
    [halfSizeM],
  )
  const groundAt = useCallback(
    (clientX: number, clientY: number, startHeight: number): XY | null => {
      const { camera, gl: renderer } = get()
      const rect = renderer.domElement.getBoundingClientRect()
      if (!rect.width || !rect.height) return null
      picker.ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1)
      picker.rc.setFromCamera(picker.ndc, camera)
      const p = groundPointOnRay(picker.rc.ray.origin, picker.rc.ray.direction, sampleRef.current, startHeight)
      return p ? clampXY(p) : null
    },
    [get, picker, clampXY],
  )

  // ----- Glisser-déposer d'une plante -----
  const dragCleanup = useRef<(() => void) | null>(null)
  useEffect(() => () => dragCleanup.current?.(), [])

  const setControlsEnabled = useCallback(
    (on: boolean) => {
      const c = get().controls as unknown as { enabled: boolean } | null
      if (c) c.enabled = on
    },
    [get],
  )

  const startDrag = useCallback(
    (id: string, ne: PointerEvent) => {
      dragCleanup.current?.()
      const v0 = visualsRef.current[id]
      if (!v0) return
      const origin = v0.base
      const start = { x: ne.clientX, y: ne.clientY }
      let moved = false
      let last: XY | null = null
      setControlsEnabled(false)
      /** Pendant le glisser, seules les matrices de cette plante (et son anneau) bougent : rien n'est reconstruit. */
      const place = (x: number, h: number, z: number) => {
        plantsRef.current?.offsetOwner(id, x - origin[0], h - origin[1], z - origin[2])
        if (cb.current.selectedPlantId === id) selRef.current?.position.set(x, h, z)
        invalidate()
      }
      const move = (ev: PointerEvent) => {
        if (ev.pointerId !== ne.pointerId) return
        if (!moved && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < DRAG_THRESHOLD_PX) return
        moved = true
        gl.domElement.style.cursor = 'grabbing'
        const p = groundAt(ev.clientX, ev.clientY, origin[1])
        if (p) {
          last = p
          place(p.x, sampleRef.current(p.x, p.y), -p.y)
        }
      }
      const finish = (commit: boolean) => (ev: PointerEvent) => {
        if (ev.pointerId !== ne.pointerId) return
        cleanup()
        if (commit && moved && last) {
          const dropped = last
          cb.current.onMovePlant(id, dropped)
          // Si la donnée n'a pas suivi (déplacement refusé par l'appelant), on reconstruit pour revenir à la vérité.
          window.setTimeout(() => {
            const b = visualsRef.current[id]?.base
            if (!b || Math.abs(b[0] - dropped.x) > 1e-6 || Math.abs(b[2] + dropped.y) > 1e-6) setRebuild((n) => n + 1)
          }, 120)
        } else if (moved) {
          place(origin[0], origin[1], origin[2]) // annulé : la plante revient où elle était
        }
      }
      const up = finish(true)
      const cancel = finish(false)
      const cleanup = () => {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
        window.removeEventListener('pointercancel', cancel)
        setControlsEnabled(true)
        gl.domElement.style.cursor = ''
        dragCleanup.current = null
      }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
      window.addEventListener('pointercancel', cancel)
      dragCleanup.current = cleanup
    },
    [gl, groundAt, setControlsEnabled, invalidate],
  )

  const handlers = useMemo<PlantPointerHandlers>(
    () => ({
      onDown: (id, e) => {
        if (cb.current.placingSpeciesId) return // en mode plantation, le clic va au sol
        if (cb.current.mode === 'promenade') return // promenade : pas de glisser-déposer, le glisser sert à regarder
        if (e.nativeEvent.isPrimary === false) return
        e.stopPropagation()
        cb.current.onSelectPlant(id)
        startDrag(id, e.nativeEvent)
      },
      onClick: (id, e) => {
        if (cb.current.placingSpeciesId) return
        e.stopPropagation() // n'atteint pas le sol (désélection)
        // Promenade : un toucher / clic (sans glisser) sélectionne la plante.
        if (cb.current.mode === 'promenade' && e.delta <= DRAG_THRESHOLD_PX) cb.current.onSelectPlant(id)
      },
      onOver: (id, e) => {
        if (cb.current.mode === 'promenade') return
        e.stopPropagation()
        setHoverId(id)
        if (!cb.current.placingSpeciesId && !dragCleanup.current) gl.domElement.style.cursor = 'grab'
      },
      onOut: (id) => {
        if (cb.current.mode === 'promenade') return
        setHoverId((h) => (h === id ? undefined : h))
        if (!dragCleanup.current) gl.domElement.style.cursor = cb.current.placingSpeciesId ? 'crosshair' : ''
      },
    }),
    [startDrag, gl],
  )

  // ----- Mode plantation : curseur fantôme -----
  const ghostRef = useRef<THREE.Group>(null)
  const placingSpecies = placingSpeciesId ? speciesById[placingSpeciesId] : undefined
  const ghostR = Math.max(0.2, (placingSpecies?.envergureAdulteM ?? 0.6) / 2)
  useEffect(() => {
    gl.domElement.style.cursor = placingSpeciesId ? 'crosshair' : ''
    if (ghostRef.current) ghostRef.current.visible = false
    invalidate()
  }, [placingSpeciesId, gl, invalidate])

  const moveGhost = (e: ThreeEvent<PointerEvent>) => {
    const g = ghostRef.current
    if (!cb.current.placingSpeciesId || !g) return
    const p = clampXY({ x: e.point.x, y: -e.point.z })
    g.position.set(p.x, sample(p.x, p.y) + 0.06, -p.y)
    g.visible = true
    invalidate()
  }

  const onGroundClick = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > DRAG_THRESHOLD_PX) return // c'était une rotation / un panoramique
    const { placingSpeciesId: placing, onPlace, onSelectPlant } = cb.current
    if (placing) {
      if (onPlace) onPlace(clampXY({ x: e.point.x, y: -e.point.z }))
    } else onSelectPlant(undefined)
  }

  const selected = selectedPlantId ? visuals[selectedPlantId] : undefined
  // Après un glisser (ou son annulation), l'anneau reprend la position issue des données.
  useLayoutEffect(() => {
    if (selRef.current && selected) selRef.current.position.set(selected.base[0], selected.base[1], selected.base[2])
  }, [selected])
  const hovered = hoverId && hoverId !== selectedPlantId ? visuals[hoverId] : undefined

  return (
    <>
      <SunAndSky sun={sun} halfSizeM={halfSizeM} walking={walking} tier={tier} />
      {walking ? (
        <WalkRig
          shared={walkShared}
          parcel={garden.parcel}
          bounds={frame.bounds}
          colliders={colliders}
          sample={sample}
          visuals={visuals}
          selectedPlantId={selectedPlantId}
          resetToken={walkResetToken({ gardenId: garden.id, nonce: fitNonce })}
          gotoToken={gotoNonce}
          halfSizeM={halfSizeM}
          compassRef={compassRef}
          onLod={setLod}
          onLimit={onWalkLimit}
        />
      ) : (
        <CameraRig
          mode={mode as 'dessus' | 'perspective'}
          gardenId={garden.id}
          frame={frame}
          nonce={fitNonce}
          halfSizeM={halfSizeM}
          getInsets={getInsets}
          centerY={centerY}
          reducedMotion={reducedMotion}
          compassRef={compassRef}
        />
      )}

      <Ground
        center={garden.center}
        terrain={garden.terrain}
        halfSizeM={halfSizeM}
        px={orthoPixels(halfSizeM)}
        walking={walking}
        sample={sample}
        onPointerMove={placingSpeciesId ? moveGhost : undefined}
        onClick={onGroundClick}
      />
      {showHeatmap && sunHeatmap && <HeatmapLayer map={sunHeatmap} sample={sample} />}
      {garden.parcel && garden.parcel.length > 2 && <ParcelOutline ring={garden.parcel} sample={sample} />}
      {garden.buildings && garden.buildings.length > 0 && <Buildings buildings={garden.buildings} sample={sample} canopy={canopy} />}

      {neighborTrees && neighborTrees.length > 0 && <NeighborTrees trees={neighborTrees} sample={sample} />}

      <Plants ref={plantsRef} parts={parts} handlers={handlers} cardShadows={tier === 2} />

      {/* Anneau et étiquette de la plante sélectionnée : un groupe qu'on déplace tel quel pendant un glisser. */}
      {selected && (
        <group ref={selRef} position={selected.base}>
          <mesh position-y={0.05} rotation-x={-Math.PI / 2} scale={Math.max(0.3, selected.spreadM / 2 + 0.2)} renderOrder={5}>
            <ringGeometry args={[0.86, 1, 48]} />
            <meshBasicMaterial color="#ffd84d" transparent opacity={0.95} depthTest={false} toneMapped={false} />
          </mesh>
          <Html position={[0, walking ? Math.min(selected.heightM + 0.35, 2.5) : selected.heightM + 0.35, 0]} center zIndexRange={[5, 0]} style={{ pointerEvents: 'none' }}>
            <div className="g3d-label g3d-label--selected">{selected.label}</div>
          </Html>
        </group>
      )}
      {hovered && (
        <Html
          key={hovered.id}
          position={[hovered.base[0], hovered.base[1] + (walking ? Math.min(hovered.heightM + 0.35, 2.5) : hovered.heightM + 0.35), hovered.base[2]]}
          center
          zIndexRange={[5, 0]}
          style={{ pointerEvents: 'none' }}
        >
          <div className="g3d-label">{hovered.label}</div>
        </Html>
      )}

      <group ref={ghostRef} visible={false}>
        <mesh rotation-x={-Math.PI / 2} scale={ghostR} renderOrder={4}>
          <circleGeometry args={[1, 40]} />
          <meshBasicMaterial color={placingSpecies?.couleur ?? '#7fd06b'} transparent opacity={0.35} depthTest={false} toneMapped={false} />
        </mesh>
        <mesh rotation-x={-Math.PI / 2} scale={ghostR} renderOrder={4}>
          <ringGeometry args={[0.92, 1, 40]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.9} depthTest={false} toneMapped={false} />
        </mesh>
        <mesh position-y={0.5} renderOrder={4}>
          <cylinderGeometry args={[0.03, 0.03, 1, 6]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.8} />
        </mesh>
      </group>
    </>
  )
}

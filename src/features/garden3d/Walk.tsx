// Mode Promenade : caméra à hauteur d'yeux (1,65 m), clavier / souris / joystick, niveaux de détail et étiquettes.
// Tourne dans le canvas ; l'interface (joystick, mini-carte) est dans WalkUI.tsx et partage `WalkShared`.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { Html, PerspectiveCamera } from '@react-three/drei'
import type { XY } from '../../types'
import type { Bounds } from './framing'
import type { HeightSampler } from './terrain'
import type { PlantVisual } from './plantModel'
import { DEBUG_3D } from './debug'
import {
  EYE_SETTLE_M,
  lookDelta,
  WALK_FOV_DEG,
  createFramePacer,
  entrancePose,
  eyeHeightAt,
  lodFor,
  pickLabelIds,
  poseNearPlant,
  stepWalker,
  walkKeyBlocked,
  walkNeedsFrames,
  type KeyTarget,
  type Collider,
  type DetailLevel,
  type WalkInput,
  type WalkShared,
  type Walker,
} from './walk'

/** Radians par pixel de glisser (souris et doigt). */
const LOOK_SENS = 0.0042
/** Période (s) de mise à jour des niveaux de détail, étiquettes et données de contrôle. */
const SLOW_TICK_S = 0.25
/** Plafond d'images par seconde en mouvement : 60, ou 45 sur écran tactile (économie de batterie). */
const MAX_FPS = 60
const MAX_FPS_COARSE = 45
const COARSE = typeof window !== 'undefined' && (!!window.matchMedia?.('(pointer: coarse)').matches || navigator.maxTouchPoints > 0)

const KEY_MAP: Record<string, 'forward' | 'back' | 'left' | 'right' | 'turnLeft' | 'turnRight'> = {
  z: 'forward',
  w: 'forward',
  arrowup: 'forward',
  s: 'back',
  arrowdown: 'back',
  q: 'left',
  a: 'left',
  d: 'right',
  arrowleft: 'turnLeft',
  arrowright: 'turnRight',
}

export interface WalkRigProps {
  shared: WalkShared
  parcel?: XY[]
  bounds: Bounds
  colliders: Collider[]
  sample: HeightSampler
  visuals: Record<string, PlantVisual>
  selectedPlantId?: string
  /** Change quand l'utilisateur demande « Recentrer » (retour à l'entrée) ou change de jardin. Jamais avec l'emprise. */
  resetToken: string
  /** Incrémenté par « Aller à cette plante » : place le promeneur près de la plante sélectionnée. */
  gotoToken: number
  /** Demi-côté (m) du sol texturé : la marche s'arrête à son bord. */
  halfSizeM: number
  compassRef: RefObject<HTMLDivElement>
  onLod: (lod: Record<string, DetailLevel>) => void
  /** Vrai tant que la limite du jardin retient le promeneur. */
  onLimit?: (limited: boolean) => void
}

export function WalkRig({ shared, parcel, bounds, colliders, sample, visuals, selectedPlantId, resetToken, gotoToken, halfSizeM, compassRef, onLod, onLimit }: WalkRigProps) {
  const camRef = useRef<THREE.PerspectiveCamera>(null)
  const gl = useThree((s) => s.gl)
  const invalidate = useThree((s) => s.invalidate)
  const size = useThree((s) => s.size)
  const keys = useRef({ forward: false, back: false, left: false, right: false, turnLeft: false, turnRight: false, shift: false })
  const look = useRef<{ id: number; x: number; y: number } | null>(null)
  const lodRef = useRef<Record<string, DetailLevel>>({})
  const tick = useRef(0)
  const lastReset = useRef<string | null>(null)
  const [labelIds, setLabelIds] = useState<string[]>([])
  const live = useRef({ parcel, bounds, colliders, sample, visuals, selectedPlantId })
  live.current = { parcel, bounds, colliders, sample, visuals, selectedPlantId }

  // Rendu à la demande : une image seulement quand quelque chose bouge (touche, joystick, regard, lissage de hauteur).
  // La simulation tourne à chaque passage de la boucle ; le dessin, lui, est plafonné (60 images/s, 45 en tactile)
  // par le rendu manuel plus bas : trop tôt → on saute le dessin et on redemande une passe au vsync suivant.
  const pacer = useMemo(() => createFramePacer(COARSE ? MAX_FPS_COARSE : MAX_FPS), [])
  const wasActive = useRef(false)
  const limitHit = useRef(false)
  const limitShown = useRef(false)
  const onLimitRef = useRef(onLimit)
  onLimitRef.current = onLimit
  useEffect(() => {
    shared.wake = invalidate // le joystick réveille la boucle
    return () => {
      shared.wake = undefined
    }
  }, [shared, invalidate])

  const applyPose = useCallback(
    (w: Walker, pitch: number) => {
      shared.pose = { ...w, pitch }
      shared.eyeY = eyeHeightAt(live.current.sample, w)
      shared.saved = true
      lodRef.current = {}
      tick.current = SLOW_TICK_S // force une mise à jour immédiate des détails
      invalidate()
    },
    [shared, invalidate],
  )

  // Pose de départ : près de la plante sélectionnée, sinon reprise de la dernière position, sinon entrée de la parcelle.
  // Ensuite, seul « Recentrer » ou un autre jardin (resetToken) ramène à l'entrée : l'emprise ne déplace jamais le promeneur.
  useLayoutEffect(() => {
    const { parcel: pc, bounds: b, colliders: cols, visuals: vis, selectedPlantId: sel } = live.current
    if (lastReset.current === resetToken) return // double exécution (mode strict) : déjà appliqué
    const initial = lastReset.current === null
    lastReset.current = resetToken
    const entrance = entrancePose(pc, b, cols)
    if (!initial) {
      applyPose(entrance, 0) // « Recentrer » ou autre jardin
      return
    }
    const resume = shared.saved
    const from: XY = resume ? { x: shared.pose.x, y: shared.pose.y } : entrance
    const v = sel ? vis[sel] : undefined
    if (v) applyPose(poseNearPlant({ x: v.base[0], y: -v.base[2] }, from, 3, cols), 0.04)
    else if (resume) applyPose({ x: shared.pose.x, y: shared.pose.y, yaw: shared.pose.yaw }, shared.pose.pitch)
    else applyPose(entrance, 0)
  }, [resetToken, shared, applyPose])

  // « Aller à cette plante » : se place près de la plante sélectionnée, en la regardant.
  const gotoSeen = useRef(gotoToken)
  useLayoutEffect(() => {
    if (gotoSeen.current === gotoToken) return
    gotoSeen.current = gotoToken
    const { colliders: cols, visuals: vis, selectedPlantId: sel } = live.current
    const v = sel ? vis[sel] : undefined
    if (!v) return
    applyPose(poseNearPlant({ x: v.base[0], y: -v.base[2] }, { x: shared.pose.x, y: shared.pose.y }, 3, cols), 0.04)
  }, [gotoToken, shared, applyPose])

  // Clavier. Seuls les champs de texte gardent leurs touches ; un curseur (range) garde ses flèches, mais ZQSD marchent.
  useEffect(() => {
    const k = keys.current
    const onKey = (down: boolean) => (e: KeyboardEvent) => {
      k.shift = e.shiftKey
      const action = KEY_MAP[e.key.toLowerCase()]
      if (!action) return
      if (!down) {
        // Le relâchement compte toujours : sinon une touche resterait « enfoncée » si le focus change entre-temps.
        if (k[action]) {
          k[action] = false
          invalidate()
        }
        return
      }
      if (e.ctrlKey || e.metaKey || e.altKey || walkKeyBlocked(e.target as KeyTarget | null, e.key)) return
      k[action] = true
      e.preventDefault()
      invalidate()
    }
    const down = onKey(true)
    const up = onKey(false)
    const clear = () => {
      k.forward = k.back = k.left = k.right = k.turnLeft = k.turnRight = k.shift = false
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', clear)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', clear)
      clear()
    }
  }, [invalidate])

  // Regarder en glissant (souris ou doigt) ; un simple clic / toucher reste une sélection.
  useEffect(() => {
    const el = gl.domElement
    const prevCursor = el.style.cursor
    el.style.cursor = 'grab'
    el.style.touchAction = 'none' // le glisser sert à regarder, pas à faire défiler la page
    const onDown = (e: PointerEvent) => {
      if (look.current) return
      look.current = { id: e.pointerId, x: e.clientX, y: e.clientY }
      try {
        el.setPointerCapture(e.pointerId)
      } catch {
        /* capture indisponible : on continue sans */
      }
    }
    const onMove = (e: PointerEvent) => {
      if (!look.current || look.current.id !== e.pointerId) return
      const p = shared.pose
      const dx = e.clientX - look.current.x
      const dy = e.clientY - look.current.y
      look.current.x = e.clientX
      look.current.y = e.clientY
      const n = lookDelta(p.yaw, p.pitch, dx, dy, LOOK_SENS)
      p.yaw = n.yaw
      p.pitch = n.pitch
      el.style.cursor = 'grabbing'
      invalidate()
    }
    const onUp = (e: PointerEvent) => {
      if (!look.current || look.current.id !== e.pointerId) return
      look.current = null
      el.style.cursor = 'grab'
      try {
        el.releasePointerCapture(e.pointerId)
      } catch {
        /* déjà relâché */
      }
      tick.current = SLOW_TICK_S // étiquettes et détails à jour pour la direction finale du regard
      invalidate()
    }
    const noMenu = (e: Event) => e.preventDefault()
    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
    el.addEventListener('pointercancel', onUp)
    el.addEventListener('contextmenu', noMenu)
    return () => {
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointercancel', onUp)
      el.removeEventListener('contextmenu', noMenu)
      el.style.cursor = prevCursor
      look.current = null
    }
  }, [gl, shared, invalidate])

  // Quitte le mode : repasse en rendu à la demande après une dernière image.
  useEffect(() => () => invalidate(), [invalidate])

  const input = useRef<WalkInput>({ forward: 0, strafe: 0, turn: 0, run: false })
  const targets = useRef<{ id: string; x: number; y: number }[]>([])

  useFrame((_, delta) => {
    const cam = camRef.current
    if (!cam) return
    const k = keys.current
    const { colliders: cols, bounds: b, sample: smp, visuals: vis } = live.current
    const inp = input.current
    inp.forward = Math.max(-1, Math.min(1, (k.forward ? 1 : 0) - (k.back ? 1 : 0) + shared.joy.y + shared.pad.y))
    inp.strafe = Math.max(-1, Math.min(1, (k.right ? 1 : 0) - (k.left ? 1 : 0) + shared.joy.x + shared.pad.x))
    inp.turn = Math.max(-1, Math.min(1, (k.turnLeft ? 1 : 0) - (k.turnRight ? 1 : 0) + shared.pad.turn))
    inp.run = k.shift || shared.run
    // Après un arrêt, la première image arrive longtemps après la précédente : pas de saut.
    const dt = wasActive.current ? delta : Math.min(delta, 1 / 30)
    const p = shared.pose
    const next = stepWalker(p, inp, dt, { colliders: cols, bounds: b, groundHalfM: halfSizeM - 1 })
    p.x = next.x
    p.y = next.y
    p.yaw = next.yaw
    if (next.limited) limitHit.current = true

    // Hauteur des yeux : relief + 1,65 m, légèrement lissée pour gommer les arêtes de la grille d'altitudes.
    const target = eyeHeightAt(smp, p)
    if (Math.abs(target - shared.eyeY) <= EYE_SETTLE_M) shared.eyeY = target
    else shared.eyeY += (target - shared.eyeY) * (1 - Math.exp(-14 * Math.min(Math.max(dt, 0), 0.1))) // dt borné : jamais négatif
    cam.position.set(p.x, shared.eyeY, -p.y)
    cam.rotation.set(p.pitch, p.yaw, 0, 'YXZ')
    if (compassRef.current) compassRef.current.style.transform = `rotate(${p.yaw}rad)`

    // Encore des images à produire ? Oui si on bouge ou si la hauteur des yeux n'a pas convergé. Sinon la scène reste figée.
    const active = walkNeedsFrames(inp, target - shared.eyeY)
    const justStopped = wasActive.current && !active
    wasActive.current = active

    // Tâches lentes : niveaux de détail, étiquettes, limite du jardin. Une dernière passe à l'arrêt.
    tick.current += dt
    if (tick.current >= SLOW_TICK_S || justStopped) {
      tick.current = 0
      const prev = lodRef.current
      const nextLod: Record<string, DetailLevel> = {}
      let changed = false
      let n = 0
      const list = targets.current
      list.length = 0
      for (const id in vis) {
        const v = vis[id]
        const vx = v.base[0]
        const vy = -v.base[2]
        list.push({ id, x: vx, y: vy })
        const lvl = lodFor(Math.hypot(vx - p.x, vy - p.y), prev[id] ?? 0)
        if (lvl > 0) {
          nextLod[id] = lvl
          n++
        }
        if (lvl !== (prev[id] ?? 0)) changed = true
      }
      if (changed) {
        lodRef.current = nextLod
        onLod(nextLod)
      }
      const halfFov = Math.min(1.25, Math.atan(Math.tan((WALK_FOV_DEG * Math.PI) / 360) * (size.width / Math.max(1, size.height))) + 0.15)
      const ids = pickLabelIds(p, p.yaw, list, { rangeM: 8, max: 8, halfFovRad: halfFov })
      setLabelIds((old) => (old.length === ids.length && old.every((v, i) => v === ids[i]) ? old : ids))
      if (limitHit.current !== limitShown.current) {
        limitShown.current = limitHit.current
        onLimitRef.current?.(limitHit.current)
      }
      limitHit.current = false
      if (DEBUG_3D) {
        const root = gl.domElement.closest('.g3d-root') as HTMLElement | null
        if (root) {
          root.dataset.walkX = p.x.toFixed(2)
          root.dataset.walkY = p.y.toFixed(2)
          root.dataset.walkYaw = p.yaw.toFixed(3)
          root.dataset.eyeY = shared.eyeY.toFixed(3)
          root.dataset.groundY = smp(p.x, p.y).toFixed(3)
          root.dataset.detailPlants = String(n)
          root.dataset.drawCalls = String(gl.info.render.calls)
          root.dataset.triangles = String(gl.info.render.triangles)
          root.dataset.frames = String(gl.info.render.frame)
        }
      }
    }
    if (active) invalidate()
  }, -1)

  // Dessin manuel (priorité > 0 : R3F ne dessine plus lui-même) avec plafond d'images par seconde.
  useFrame((state) => {
    const now = performance.now()
    if (!pacer.due(now)) {
      state.invalidate() // trop tôt : on réessaie au vsync suivant
      return
    }
    pacer.mark(now)
    state.gl.render(state.scene, state.camera)
  }, 1)

  return (
    <>
      <PerspectiveCamera
        ref={camRef}
        makeDefault
        fov={WALK_FOV_DEG}
        near={0.05}
        far={halfSizeM * 20}
        rotation-order="YXZ"
        position={[shared.pose.x, shared.eyeY, -shared.pose.y]}
      />
      {labelIds.map((id) => {
        const v = live.current.visuals[id]
        if (!v || id === live.current.selectedPlantId) return null
        return (
          <Html key={id} position={[v.base[0], v.base[1] + Math.min(v.heightM + 0.3, 2.3), v.base[2]]} center zIndexRange={[4, 0]} style={{ pointerEvents: 'none' }}>
            <div className="g3d-label">{v.label}</div>
          </Html>
        )
      })}
    </>
  )
}

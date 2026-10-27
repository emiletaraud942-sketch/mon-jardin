// Interface de la Promenade : joystick virtuel, boutons Tourner / Courir et mini-carte (canvas 2D).
import { useEffect, useRef } from 'react'
import type { Building, Plant, Species, XY } from '../../types'
import type { Bounds } from './framing'
import { forwardOf, joystickVector, type WalkShared } from './walk'

const STICK_TRAVEL_PX = 32

/** Joystick virtuel (déplacement) : zone tactile de 112 px, bouton central de 48 px. Un seul doigt à la fois ; le regard reste libre pour l'autre main. */
export function Joystick({ shared }: { shared: WalkShared }) {
  const baseRef = useRef<HTMLDivElement>(null)
  const knobRef = useRef<HTMLDivElement>(null)
  const pointer = useRef<number | null>(null)

  /** (kx, ky) : position du bouton en px ; (vx, vy) : commande envoyée au promeneur, zone morte comprise. */
  const set = (kx: number, ky: number, vx = 0, vy = 0) => {
    shared.joy.x = vx
    shared.joy.y = vy
    shared.wake?.() // rendu à la demande : réveille la boucle de la Promenade
    if (knobRef.current) knobRef.current.style.transform = `translate(${kx}px, ${ky}px)`
  }
  const move = (e: React.PointerEvent) => {
    const base = baseRef.current
    if (!base) return
    const r = base.getBoundingClientRect()
    const dx = e.clientX - (r.left + r.width / 2)
    const dy = e.clientY - (r.top + r.height / 2)
    const len = Math.hypot(dx, dy)
    const k = len > 0 ? Math.min(1, len / STICK_TRAVEL_PX) / len : 0
    const v = joystickVector(dx, dy, STICK_TRAVEL_PX)
    set(dx * k, dy * k, v.x, v.y)
  }
  useEffect(
    () => () => {
      shared.joy.x = 0
      shared.joy.y = 0
    },
    [shared],
  )

  return (
    <div
      ref={baseRef}
      className="g3d-joy"
      role="group"
      aria-label="Joystick de déplacement : glissez pour avancer, reculer ou aller sur le côté"
      onPointerDown={(e) => {
        if (pointer.current != null) return
        e.preventDefault()
        pointer.current = e.pointerId
        e.currentTarget.setPointerCapture(e.pointerId)
        move(e)
      }}
      onPointerMove={(e) => {
        if (pointer.current === e.pointerId) move(e)
      }}
      onPointerUp={(e) => {
        if (pointer.current !== e.pointerId) return
        pointer.current = null
        set(0, 0)
      }}
      onPointerCancel={(e) => {
        if (pointer.current !== e.pointerId) return
        pointer.current = null
        set(0, 0)
      }}
      onLostPointerCapture={(e) => {
        if (pointer.current !== e.pointerId) return
        pointer.current = null
        set(0, 0)
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div ref={knobRef} className="g3d-joy-knob" />
    </div>
  )
}

type PadAxis = 'forward' | 'back' | 'left' | 'right' | 'turnLeft' | 'turnRight'
const PAD_VALUES: Record<PadAxis, [keyof WalkShared['pad'], number]> = {
  forward: ['y', 1],
  back: ['y', -1],
  left: ['x', -1],
  right: ['x', 1],
  turnLeft: ['turn', 1],
  turnRight: ['turn', -1],
}

/** Bouton à maintenir enfoncé (pas de côté, avancer, tourner). Au moins 56 px. */
function PadButton({ shared, axis, label, className, children }: { shared: WalkShared; axis: PadAxis; label: string; className?: string; children: React.ReactNode }) {
  const [key, v] = PAD_VALUES[axis]
  const press = (on: boolean) => {
    shared.pad[key] = on ? v : 0
    shared.wake?.()
  }
  useEffect(
    () => () => {
      shared.pad[key] = 0
    },
    [shared, key],
  )
  return (
    <button
      type="button"
      className={'g3d-btn g3d-padbtn ' + (className ?? '')}
      aria-label={label}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture?.(e.pointerId)
        press(true)
      }}
      onPointerUp={() => press(false)}
      onPointerCancel={() => press(false)}
      onLostPointerCapture={() => press(false)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          press(true)
        }
      }}
      onKeyUp={() => press(false)}
      onBlur={() => press(false)}
      onContextMenu={(e) => e.preventDefault()}
    >
      {children}
    </button>
  )
}

/** Boutons de la main droite : tourner (maintenir), « Courir » (bascule). Les flèches restent au clavier. */
export function WalkButtons({ shared, running, onToggleRun }: { shared: WalkShared; running: boolean; onToggleRun: () => void }) {
  return (
    <div className="g3d-pad" role="group" aria-label="Tourner et courir">
      <PadButton shared={shared} axis="turnLeft" label="Tourner à gauche (maintenir)" className="g3d-turn">
        <span aria-hidden="true">↺</span>
      </PadButton>
      <button type="button" className="g3d-btn g3d-padbtn g3d-pad-run" aria-pressed={running} onClick={onToggleRun} title="Courir : environ 3 m/s au lieu de 1,4 m/s">
        Courir
      </button>
      <PadButton shared={shared} axis="turnRight" label="Tourner à droite (maintenir)" className="g3d-turn">
        <span aria-hidden="true">↻</span>
      </PadButton>
    </div>
  )
}

interface MiniMapProps {
  shared: WalkShared
  parcel?: XY[]
  buildings?: Building[]
  plants: Plant[]
  speciesById: Record<string, Species>
  selectedPlantId?: string
  bounds: Bounds
  /** Diamètre (px). */
  size?: number
}

/** Petit plan rond vu du dessus (nord en haut) : parcelle, bâtiments, plantes, position et direction du promeneur. */
export function MiniMap({ shared, parcel, buildings, plants, speciesById, selectedPlantId, bounds, size: SIZE = 84 }: MiniMapProps) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    canvas.width = canvas.height = Math.round(SIZE * dpr)
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const css = getComputedStyle(canvas)
    const col = (name: string) => css.getPropertyValue(name).trim() || css.color
    const surface = col('--g3d-surface')
    const text = col('--g3d-text')
    const muted = col('--g3d-muted')
    const accent = col('--g3d-accent')
    const border = col('--g3d-border')

    const cx = (bounds.minX + bounds.maxX) / 2
    const cy = (bounds.minY + bounds.maxY) / 2
    const worldR = Math.max(10, 0.5 * Math.hypot(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY) * 1.1)
    const s = (SIZE / 2 - 6) / worldR
    const toPx = (p: XY): [number, number] => [SIZE / 2 + (p.x - cx) * s, SIZE / 2 - (p.y - cy) * s]

    // Couche statique, redessinée seulement quand les données changent.
    const back = document.createElement('canvas')
    back.width = back.height = canvas.width
    const b = back.getContext('2d')
    if (!b) return
    b.scale(dpr, dpr)
    b.beginPath()
    b.arc(SIZE / 2, SIZE / 2, SIZE / 2 - 1, 0, Math.PI * 2)
    b.fillStyle = surface
    b.fill()
    b.save()
    b.clip()
    b.globalAlpha = 0.92
    const path = (ring: XY[]) => {
      ring.forEach((p, i) => {
        const [x, y] = toPx(p)
        if (i) b.lineTo(x, y)
        else b.moveTo(x, y)
      })
      b.closePath()
    }
    if (parcel && parcel.length > 2) {
      b.beginPath()
      path(parcel)
      b.globalAlpha = 0.16
      b.fillStyle = accent
      b.fill()
      b.globalAlpha = 1
      b.lineWidth = 1.5
      b.strokeStyle = accent
      b.stroke()
    }
    b.fillStyle = muted
    b.globalAlpha = 0.75
    for (const bd of buildings ?? []) {
      if (bd.ring.length < 3) continue
      b.beginPath()
      path(bd.ring)
      b.fill()
    }
    b.globalAlpha = 1
    for (const pl of plants) {
      const sp = speciesById[pl.speciesId]
      const [x, y] = toPx(pl.position)
      const sel = pl.id === selectedPlantId
      b.beginPath()
      b.arc(x, y, sel ? 4 : 2.6, 0, Math.PI * 2)
      b.fillStyle = sp?.couleurAccent ?? sp?.couleur ?? accent
      b.fill()
      b.lineWidth = sel ? 1.8 : 0.8
      b.strokeStyle = sel ? text : surface
      b.stroke()
    }
    b.restore()
    b.beginPath()
    b.arc(SIZE / 2, SIZE / 2, SIZE / 2 - 1, 0, Math.PI * 2)
    b.lineWidth = 2
    b.strokeStyle = border
    b.stroke()
    // « N » du nord
    b.fillStyle = text
    b.font = `600 ${Math.round(SIZE / 8)}px system-ui, sans-serif`
    b.textAlign = 'center'
    b.fillText('N', SIZE / 2, Math.round(SIZE / 8) + 4)

    const draw = () => {
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(back, 0, 0)
      ctx.scale(dpr, dpr)
      const p = shared.pose
      let [x, y] = toPx(p)
      const dx = x - SIZE / 2
      const dy = y - SIZE / 2
      const dist = Math.hypot(dx, dy)
      const lim = SIZE / 2 - 8
      if (dist > lim) {
        x = SIZE / 2 + (dx / dist) * lim
        y = SIZE / 2 + (dy / dist) * lim
      }
      const f = forwardOf(p.yaw)
      const ang = Math.atan2(-f.y, f.x) // y inversé à l'écran
      ctx.save()
      ctx.translate(x, y)
      ctx.rotate(ang)
      ctx.beginPath()
      ctx.moveTo(8, 0)
      ctx.lineTo(-5, 5)
      ctx.lineTo(-2.5, 0)
      ctx.lineTo(-5, -5)
      ctx.closePath()
      ctx.fillStyle = accent
      ctx.fill()
      ctx.lineWidth = 1.5
      ctx.strokeStyle = surface
      ctx.stroke()
      ctx.restore()
    }
    draw()
    const timer = window.setInterval(() => {
      if (!document.hidden) draw()
    }, 100)
    return () => window.clearInterval(timer)
  }, [shared, parcel, buildings, plants, speciesById, selectedPlantId, bounds, SIZE])

  return (
    <canvas
      ref={ref}
      className="g3d-minimap"
      width={SIZE}
      height={SIZE}
      style={{ width: SIZE, height: SIZE }}
      role="img"
      aria-label="Mini-carte du jardin, vue du dessus, nord en haut. Le triangle indique votre position et la direction de votre regard."
    />
  )
}

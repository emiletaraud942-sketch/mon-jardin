// Cadrage de la vue 3D sur la parcelle : emprise, taille de la scène, zoom orthographique, distance en perspective.
// Fonctions pures (testées). Repère local : x = est, y = nord (m) ; Three.js : X = est, Y = haut, Z = -nord.
import * as THREE from 'three'
import type { XY } from '../../types'

export type ViewMode = 'dessus' | 'perspective'

export interface Bounds {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

/** Repli quand ni parcelle ni plante : carré de ±15 m. */
export const DEFAULT_HALF_EXTENT_M = 15
/** Marge ajoutée autour des plantes quand la parcelle est inconnue. */
export const PLANTS_MARGIN_M = 4
/** Voisinage visible autour de la parcelle (sol + orthophoto). */
export const CONTEXT_M = 25
/** Marge de cadrage autour de l'emprise (fraction). */
export const FRAMING_MARGIN = 0.15
export const MIN_HALF_SIZE_M = 30
export const MAX_HALF_SIZE_M = 100

export function ringBounds(ring: XY[] | undefined): Bounds | null {
  if (!ring || ring.length === 0) return null
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const p of ring) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue
    if (p.x < minX) minX = p.x
    if (p.x > maxX) maxX = p.x
    if (p.y < minY) minY = p.y
    if (p.y > maxY) maxY = p.y
  }
  if (!Number.isFinite(minX)) return null
  return { minX, maxX, minY, maxY }
}

export interface Frame {
  bounds: Bounds
  source: 'parcelle' | 'plantes' | 'defaut'
  /** Demi-côté (m) du carré de sol / orthophoto centré sur l'origine du jardin. */
  halfSizeM: number
  /** Clé stable : change seulement quand la parcelle (donc le cadrage) change vraiment. */
  key: string
}

const snapOut = (b: Bounds, step: number): Bounds => ({
  minX: Math.floor(b.minX / step) * step,
  maxX: Math.ceil(b.maxX / step) * step,
  minY: Math.floor(b.minY / step) * step,
  maxY: Math.ceil(b.maxY / step) * step,
})

/** Demi-côté du carré de scène (centré sur l'origine) : emprise + voisinage, borné. */
export function sceneHalfSizeFor(bounds: Bounds, contextM = CONTEXT_M): number {
  const reach = Math.max(Math.abs(bounds.minX), Math.abs(bounds.maxX), Math.abs(bounds.minY), Math.abs(bounds.maxY))
  const h = Math.ceil(reach + contextM)
  return Math.min(MAX_HALF_SIZE_M, Math.max(MIN_HALF_SIZE_M, h))
}

/**
 * Emprise du jardin : parcelle si elle existe, sinon plantes + marge, sinon ±15 m.
 * En repli « plantes », l'emprise est arrondie vers l'extérieur par pas de 5 m
 * pour que la clé (et donc le recadrage automatique) ne bouge pas à chaque plante déplacée.
 */
export function gardenFrame(parcel: XY[] | undefined, plants: { position: XY }[] = []): Frame {
  const pb = parcel && parcel.length > 2 ? ringBounds(parcel) : null
  let bounds: Bounds
  let source: Frame['source']
  if (pb) {
    bounds = pb
    source = 'parcelle'
  } else {
    const plb = ringBounds(plants.map((p) => p.position))
    if (plb) {
      bounds = snapOut(
        {
          minX: plb.minX - PLANTS_MARGIN_M,
          maxX: plb.maxX + PLANTS_MARGIN_M,
          minY: plb.minY - PLANTS_MARGIN_M,
          maxY: plb.maxY + PLANTS_MARGIN_M,
        },
        5,
      )
      // Une seule plante : on garde au moins un petit jardin autour.
      if (bounds.maxX - bounds.minX < 10 || bounds.maxY - bounds.minY < 10) {
        const cx = (bounds.minX + bounds.maxX) / 2
        const cy = (bounds.minY + bounds.maxY) / 2
        bounds = { minX: cx - 5, maxX: cx + 5, minY: cy - 5, maxY: cy + 5 }
      }
      source = 'plantes'
    } else {
      bounds = { minX: -DEFAULT_HALF_EXTENT_M, maxX: DEFAULT_HALF_EXTENT_M, minY: -DEFAULT_HALF_EXTENT_M, maxY: DEFAULT_HALF_EXTENT_M }
      source = 'defaut'
    }
  }
  const r = (v: number) => v.toFixed(1)
  return {
    bounds,
    source,
    halfSizeM: sceneHalfSizeFor(bounds),
    key: `${source}:${r(bounds.minX)},${r(bounds.maxX)},${r(bounds.minY)},${r(bounds.maxY)}`,
  }
}

/** Résolution demandée au serveur d'orthophotos : ~15 cm/pixel visés, entre 1024 et 2048 px (plafond IGN). */
export function orthoPixels(halfSizeM: number): number {
  const wanted = (2 * halfSizeM) / 0.15
  return Math.min(2048, Math.max(1024, Math.ceil(wanted / 256) * 256))
}

/** Rectangle en pixels du canvas (x vers la droite, y vers le bas). */
export interface Rect {
  x0: number
  y0: number
  x1: number
  y1: number
}

export interface Insets {
  top: number
  right: number
  bottom: number
  left: number
  /**
   * Petits éléments posés dans un coin (bulle d'info, boussole) : ils ne réduisent la zone utile
   * que si l'emprise passerait réellement dessous (vue de dessus).
   */
  corners?: Rect[]
}
export const NO_INSETS: Insets = { top: 0, right: 0, bottom: 0, left: 0 }

/** Zone réellement visible du canvas (hors bandeaux), bornée pour rester utilisable. */
function usable(width: number, height: number, insets: Insets) {
  const l = Math.max(0, insets.left)
  const r = Math.max(0, insets.right)
  const t = Math.max(0, insets.top)
  const b = Math.max(0, insets.bottom)
  const w = Math.max(width * 0.4, width - l - r)
  const h = Math.max(height * 0.4, height - t - b)
  // Décalage du centre de la zone utile par rapport au centre du canvas (px, y vers le bas).
  return { w, h, ox: (l - r) / 2, oy: (t - b) / 2 }
}

export interface OrthoFit {
  zoom: number
  /** Cible de la caméra, repère Three.js (Y = 0). */
  target: [number, number, number]
}

/**
 * Vue de dessus : zoom (pixels par mètre) pour que l'emprise + marge remplisse la zone utile,
 * et cible décalée pour que l'emprise soit centrée dans cette zone (pas sous les bandeaux).
 */
export function fitOrtho(bounds: Bounds, width: number, height: number, insets: Insets = NO_INSETS, margin = FRAMING_MARGIN): OrthoFit {
  const corners = insets.corners ?? []
  if (corners.length && insets.top > 0) {
    // Essai sans bandeau du haut : retenu seulement si l'emprise ne passe sous aucun élément de coin.
    const free = fitOrthoBasic(bounds, width, height, { ...insets, top: 0, corners: undefined }, margin)
    const x0 = width / 2 + free.zoom * (bounds.minX - free.target[0])
    const x1 = width / 2 + free.zoom * (bounds.maxX - free.target[0])
    const y0 = height / 2 + free.zoom * (-bounds.maxY - free.target[2])
    const y1 = height / 2 + free.zoom * (-bounds.minY - free.target[2])
    const hit = corners.some((c) => x0 < c.x1 && x1 > c.x0 && y0 < c.y1 && y1 > c.y0)
    if (!hit) return free
  }
  return fitOrthoBasic(bounds, width, height, insets, margin)
}

function fitOrthoBasic(bounds: Bounds, width: number, height: number, insets: Insets, margin: number): OrthoFit {
  const extW = Math.max(1, bounds.maxX - bounds.minX) * (1 + margin)
  const extH = Math.max(1, bounds.maxY - bounds.minY) * (1 + margin)
  const u = usable(Math.max(1, width), Math.max(1, height), insets)
  const zoom = Math.max(0.01, Math.min(u.w / extW, u.h / extH))
  const cx = (bounds.minX + bounds.maxX) / 2
  const cz = -(bounds.minY + bounds.maxY) / 2
  return { zoom, target: [cx - u.ox / zoom, 0, cz - u.oy / zoom] }
}

export interface PerspectiveFit {
  position: [number, number, number]
  target: [number, number, number]
  distance: number
  minDistance: number
  maxDistance: number
}

export const PERSPECTIVE_FOV_DEG = 45
export const PERSPECTIVE_ELEVATION_DEG = 38

/**
 * Vue en perspective depuis le sud, inclinée : distance minimale pour que les quatre coins de
 * l'emprise (+ marge) tiennent dans la zone utile du canvas (recherche par dichotomie).
 */
export function fitPerspective(
  bounds: Bounds,
  width: number,
  height: number,
  insets: Insets = NO_INSETS,
  opts: { fovDeg?: number; elevationDeg?: number; margin?: number; groundY?: number } = {},
): PerspectiveFit {
  const fov = opts.fovDeg ?? PERSPECTIVE_FOV_DEG
  const el = ((opts.elevationDeg ?? PERSPECTIVE_ELEVATION_DEG) * Math.PI) / 180
  const margin = opts.margin ?? FRAMING_MARGIN
  const gy = opts.groundY ?? 0
  const W = Math.max(1, width)
  const H = Math.max(1, height)
  const u = usable(W, H, insets)
  const aspect = W / H
  const cx = (bounds.minX + bounds.maxX) / 2
  const cz = -(bounds.minY + bounds.maxY) / 2
  const hx = (Math.max(1, bounds.maxX - bounds.minX) / 2) * (1 + margin)
  const hz = (Math.max(1, bounds.maxY - bounds.minY) / 2) * (1 + margin)
  const dir = new THREE.Vector3(0, Math.sin(el), Math.cos(el)) // du point visé vers la caméra (sud et haut)

  const cam = new THREE.PerspectiveCamera(fov, aspect, 0.1, 5000)
  const corners = [
    new THREE.Vector3(cx - hx, gy, cz - hz),
    new THREE.Vector3(cx + hx, gy, cz - hz),
    new THREE.Vector3(cx - hx, gy, cz + hz),
    new THREE.Vector3(cx + hx, gy, cz + hz),
  ]
  const aim = new THREE.Vector3(cx, gy, cz)
  const v = new THREE.Vector3()
  const limX = u.w / W
  const limY = u.h / H
  const fits = (d: number) => {
    cam.position.copy(aim).addScaledVector(dir, d)
    cam.lookAt(aim)
    cam.updateMatrixWorld(true)
    cam.updateProjectionMatrix()
    for (const c of corners) {
      v.copy(c).project(cam)
      if (Math.abs(v.x) > limX || Math.abs(v.y) > limY) return false
    }
    return true
  }
  let lo = 1
  let hi = 2000
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2
    if (fits(mid)) hi = mid
    else lo = mid
  }
  const d = hi

  // Recentrage dans la zone utile : on déplace le point visé sur le sol (approximation locale).
  const tanV = Math.tan((fov * Math.PI) / 360)
  const tanH = tanV * aspect
  const ndcX = u.ox / (W / 2) // décalage souhaité du centre de l'emprise à l'écran (NDC, x vers la droite)
  const ndcY = -u.oy / (H / 2) // y vers le haut
  const shiftX = -ndcX * d * tanH
  const shiftZ = (ndcY * d * tanV) / Math.max(0.2, Math.sin(el))
  const target: [number, number, number] = [cx + shiftX, gy, cz + shiftZ]
  const position: [number, number, number] = [target[0] + dir.x * d, target[1] + dir.y * d, target[2] + dir.z * d]
  return { position, target, distance: d, minDistance: 1.5, maxDistance: Math.max(60, d * 3) }
}

/**
 * Jeton de recadrage de la caméra. La caméra ne se recadre que si ce jeton change :
 * « Recentrer » (nonce), autre jardin, autre mode de vue. L'emprise (`frame.key`) n'en fait PAS partie :
 * sans parcelle elle bouge quand une plante sort des bornes, et cela ne doit pas faire perdre son zoom à l'utilisateur.
 */
export function viewResetToken(args: { mode: ViewMode; gardenId: string; nonce: number }): string {
  return `${args.mode}|${args.gardenId}|${args.nonce}`
}

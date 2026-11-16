// Dossier du jardin collectif : le plan en dessin vectoriel (noir sur blanc, pour le papier) et les lignes du tableau des plantes.
// Pur : aucune lecture du navigateur. Le nord est en haut ; y local (nord) devient -y à l'écran.
import { plotAt } from '../../engine/collectif'
import type { Garden, Plant, Plot, XY } from '../../types'

export interface PlanGeometry {
  viewBox: string
  /** Coin haut-gauche de la zone dessinée. */
  minX: number
  minY: number
  width: number
  height: number
  parcel?: string
  buildings: string[]
  plots: { n: number; x: number; y: number; w: number; h: number; holder?: string }[]
  plants: { n: number; cx: number; cy: number }[]
  /** Barre d'échelle : longueur en mètres, en haut à gauche de la zone dessinée. */
  scale: { meters: number; x: number; y: number }
}

const f = (n: number) => Math.round(n * 100) / 100
const path = (ring: XY[]) => ring.map((p, i) => `${i ? 'L' : 'M'}${f(p.x)} ${f(-p.y)}`).join(' ') + ' Z'
const NICE = [1, 2, 5, 10, 20, 50, 100]
export const MAX_LABELED = 99

export function planGeometry(garden: Pick<Garden, 'parcel' | 'buildings' | 'plots'>, plants: Pick<Plant, 'position'>[]): PlanGeometry {
  const pts: XY[] = [...(garden.parcel ?? []), ...(garden.plots ?? []).flatMap((q) => [{ x: q.x, y: q.y }, { x: q.x + q.w, y: q.y + q.h }]), ...plants.map((p) => p.position)]
  let [minX, maxX, minY, maxY] = pts.length ? [Infinity, -Infinity, Infinity, -Infinity] : [-10, 10, -10, 10]
  for (const p of pts) {
    minX = Math.min(minX, p.x)
    maxX = Math.max(maxX, p.x)
    minY = Math.min(minY, p.y)
    maxY = Math.max(maxY, p.y)
  }
  const margin = 3
  minX -= margin
  maxX += margin
  minY -= margin
  maxY += margin
  // Les bâtiments qui touchent la zone seulement (les maisons voisines lointaines n'agrandissent pas le plan).
  const buildings = (garden.buildings ?? []).filter((b) => b.ring.some((p) => p.x >= minX - 10 && p.x <= maxX + 10 && p.y >= minY - 10 && p.y <= maxY + 10)).map((b) => path(b.ring))
  const width = maxX - minX
  const height = maxY - minY
  const target = width / 5
  const meters = [...NICE].reverse().find((m) => m <= target) ?? 1
  return {
    viewBox: `${f(minX)} ${f(-maxY)} ${f(width)} ${f(height)}`,
    minX: f(minX),
    minY: f(-maxY),
    width: f(width),
    height: f(height),
    parcel: garden.parcel && garden.parcel.length >= 3 ? path(garden.parcel) : undefined,
    buildings,
    plots: (garden.plots ?? []).map((q) => ({ n: q.n, x: f(q.x), y: f(-(q.y + q.h)), w: q.w, h: q.h, holder: q.holder })),
    plants: plants.slice(0, MAX_LABELED).map((p, i) => ({ n: i + 1, cx: f(p.position.x), cy: f(-p.position.y) })),
    scale: { meters, x: f(minX + 1), y: f(-minY - 1) },
  }
}

export interface PlantRow {
  n: number
  name: string
  plot?: number
  holder?: string
  planted: string
}

/** Lignes du tableau : numérotées comme sur le plan, triées par nom. Au-delà de MAX_LABELED, les plantes restent dans le tableau sans numéro de plan. */
export function plantRows(plants: Plant[], nameOf: (p: Plant) => string, plots: readonly Plot[] | undefined): { rows: PlantRow[]; ordered: Plant[] } {
  const ordered = [...plants].sort((a, b) => nameOf(a).localeCompare(nameOf(b), 'fr') || a.id.localeCompare(b.id))
  const rows = ordered.map((p, i): PlantRow => {
    const q = plotAt(p.position, plots)
    return { n: i + 1, name: nameOf(p), plot: q?.n, holder: q?.holder, planted: p.plantedAt }
  })
  return { rows, ordered }
}

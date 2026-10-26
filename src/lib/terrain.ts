import type { TerrainGrid, XY } from '../types'

/** Altitude relative interpolée (bilinéaire) en un point local. */
export function heightAt(g: TerrainGrid, p: XY): number {
  const step = (2 * g.size) / (g.n - 1)
  const fx = Math.max(0, Math.min(g.n - 1.0001, (p.x + g.size) / step))
  const fy = Math.max(0, Math.min(g.n - 1.0001, (p.y + g.size) / step))
  const i = Math.floor(fx)
  const j = Math.floor(fy)
  const tx = fx - i
  const ty = fy - j
  const h = (ii: number, jj: number) => g.heights[jj * g.n + ii] ?? 0
  return (h(i, j) * (1 - tx) + h(i + 1, j) * tx) * (1 - ty) + (h(i, j + 1) * (1 - tx) + h(i + 1, j + 1) * tx) * ty
}

/** Pente (%) et orientation de la pente (direction descendante, en degrés depuis le nord). */
export function slopeAt(g: TerrainGrid, p: XY): { pct: number; aspectDeg: number } {
  const d = 2
  const dzdx = (heightAt(g, { x: p.x + d, y: p.y }) - heightAt(g, { x: p.x - d, y: p.y })) / (2 * d)
  const dzdy = (heightAt(g, { x: p.x, y: p.y + d }) - heightAt(g, { x: p.x, y: p.y - d })) / (2 * d)
  const pct = Math.hypot(dzdx, dzdy) * 100
  const aspectDeg = (Math.atan2(-dzdx, -dzdy) * 180) / Math.PI
  return { pct, aspectDeg: (aspectDeg + 360) % 360 }
}

export function aspectLabel(deg: number): string {
  return ['nord', 'nord-est', 'est', 'sud-est', 'sud', 'sud-ouest', 'ouest', 'nord-ouest'][Math.round(deg / 45) % 8]
}

// ---------- Choix du relief d'affichage (RGE ALTI stocké ou LiDAR HD en mémoire) ----------

/** Dénivelé maximal jugé plausible sur une emprise de quelques dizaines de mètres (au-delà : donnée corrompue). */
const MAX_SPAN_M = 150
const MAX_ABS_M = 400

/** Pas de la grille (m). Infini si la grille est inutilisable. */
export function gridStep(g: TerrainGrid | undefined): number {
  return g && g.n >= 2 && g.size > 0 ? (2 * g.size) / (g.n - 1) : Infinity
}

/** Grille de même forme que Garden.terrain, sans NaN, avec des altitudes relatives plausibles. */
export function isValidTerrain(g: unknown): g is TerrainGrid {
  const t = g as TerrainGrid | null | undefined
  if (!t || !Number.isInteger(t.n) || t.n < 2 || t.n > 1024 || !(t.size > 0) || !Number.isFinite(t.size)) return false
  if (!Array.isArray(t.heights) || t.heights.length !== t.n * t.n) return false
  let min = Infinity
  let max = -Infinity
  for (const h of t.heights) {
    if (typeof h !== 'number' || !Number.isFinite(h) || Math.abs(h) > MAX_ABS_M) return false
    if (h < min) min = h
    if (h > max) max = h
  }
  return max - min <= MAX_SPAN_M
}

/**
 * Relief à afficher et à utiliser pour les pentes : le LiDAR HD (calculé en mémoire, jamais écrit dans le jardin)
 * seulement s'il est valide, couvre au moins l'emprise de l'existant et est nettement plus fin (pas < 70 % de l'ancien).
 * Sinon on garde le relief RGE ALTI du jardin (ou rien).
 */
export function chooseTerrain(existing: TerrainGrid | undefined, lidar: TerrainGrid | undefined): { grid: TerrainGrid | undefined; source: 'rge' | 'lidar' | 'none' } {
  const base = existing && isValidTerrain(existing) ? existing : undefined
  if (lidar && isValidTerrain(lidar)) {
    if (!base) return { grid: lidar, source: 'lidar' }
    if (lidar.size >= base.size * 0.99 && gridStep(lidar) < gridStep(base) * 0.7) return { grid: lidar, source: 'lidar' }
  }
  return existing ? { grid: existing, source: 'rge' } : { grid: undefined, source: 'none' }
}

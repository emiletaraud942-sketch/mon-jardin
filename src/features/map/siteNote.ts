// Fiche « Ici » : ce que l'appli peut dire de l'endroit visé (soleil, pente, humidité estimée, sol).
// Module PUR (testé dans siteNote.test.ts). L'humidité n'est PAS mesurée : c'est une estimation à partir du relief,
// du sol indiqué par l'utilisateur et de la pluie de sa zone. Elle est toujours présentée comme telle.
import type { SoilTexture, TerrainGrid, XY } from '../../types'
import { aspectLabel, heightAt, slopeAt } from '../../lib/terrain'
import { slopePhrase, sunPhrase } from '../planting/scoreLabel'
import { sunCategory } from '../../engine/planting'

/** Rayon (m) autour du point pour juger s'il est dans un creux ou sur une butte. */
export const RELIEF_RADIUS_M = 6
/** Écart d'altitude (m) à partir duquel on parle de creux ou de butte. */
export const RELIEF_STEP_M = 0.25

export type Humidity = 'sec' | 'moyen' | 'frais' | 'humide'

export interface HumidityEstimate {
  level: Humidity
  /** « Sol plutôt frais » : mots simples, sans chiffre. */
  text: string
  /** Pourquoi, en mots : « creux du terrain », « sol argileux ». Vide : aucun indice (donc « moyen »). */
  reasons: string[]
}

/** Altitude moyenne sur un anneau autour du point, moins l'altitude du point : positif = le point est dans un creux. */
export function reliefDelta(terrain: TerrainGrid, p: XY, radiusM = RELIEF_RADIUS_M): number {
  let sum = 0
  const n = 8
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 2 * Math.PI
    sum += heightAt(terrain, { x: p.x + radiusM * Math.cos(a), y: p.y + radiusM * Math.sin(a) })
  }
  return sum / n - heightAt(terrain, p)
}

const SOIL_SCORE: Record<SoilTexture, number> = { argileux: 1, humifere: 1, limoneux: 0, calcaire: -0.5, sableux: -1 }
const SOIL_WORD: Record<SoilTexture, string> = { argileux: 'sol argileux, qui retient l’eau', humifere: 'sol riche en humus, qui retient l’eau', limoneux: '', calcaire: 'sol calcaire, qui sèche assez vite', sableux: 'sol sableux, qui sèche vite' }

/** Estime l'humidité du sol : relief (creux / butte), sol de l'utilisateur, pluie de sa zone. Sans aucun indice : « moyen ». */
export function humidityEstimate(args: { terrain?: TerrainGrid; point: XY; sol?: SoilTexture; rainMmPerYear?: number }): HumidityEstimate {
  const { terrain, point, sol, rainMmPerYear } = args
  let score = 0
  const reasons: string[] = []
  if (terrain) {
    const d = reliefDelta(terrain, point)
    if (Number.isFinite(d)) {
      if (d >= 2 * RELIEF_STEP_M) {
        score += 2
        reasons.push('creux du terrain : l’eau s’y accumule')
      } else if (d >= RELIEF_STEP_M) {
        score += 1
        reasons.push('léger creux : l’eau y reste un peu')
      } else if (d <= -2 * RELIEF_STEP_M) {
        score -= 2
        reasons.push('butte : l’eau s’écoule')
      } else if (d <= -RELIEF_STEP_M) {
        score -= 1
        reasons.push('légère hauteur : l’eau s’écoule un peu')
      }
    }
  }
  if (sol) {
    score += SOIL_SCORE[sol] ?? 0
    if (SOIL_WORD[sol]) reasons.push(SOIL_WORD[sol])
  }
  if (typeof rainMmPerYear === 'number' && Number.isFinite(rainMmPerYear)) {
    if (rainMmPerYear >= 900) {
      score += 1
      reasons.push('région plutôt pluvieuse')
    } else if (rainMmPerYear > 0 && rainMmPerYear < 600) {
      score -= 1
      reasons.push('région plutôt sèche')
    }
  }
  const level: Humidity = score >= 2.5 ? 'humide' : score >= 1 ? 'frais' : score <= -1 ? 'sec' : 'moyen'
  const text = level === 'humide' ? 'Sol plutôt humide' : level === 'frais' ? 'Sol plutôt frais' : level === 'sec' ? 'Sol plutôt sec' : 'Humidité moyenne'
  return { level, text, reasons }
}

export interface SiteLine {
  /** Repère de l'icône : soleil, pente, eau. */
  kind: 'soleil' | 'pente' | 'eau'
  /** Très court, pour la ligne repliée : « Plein soleil », « Terrain plat », « Sol plutôt frais ». */
  short: string
  /** Texte principal, en mots simples. */
  text: string
  /** Précision facultative (« orientée sud », « estimation : creux du terrain »). */
  detail?: string
}

/** Les lignes de la fiche « Ici ». Une ligne manque quand la donnée manque (pas de relief : ni pente ni humidité de relief). */
export function siteLines(args: { sunHours?: number; terrain?: TerrainGrid; point: XY; sol?: SoilTexture; rainMmPerYear?: number }): SiteLine[] {
  const lines: SiteLine[] = []
  if (args.sunHours !== undefined && Number.isFinite(args.sunHours)) {
    const cat = sunCategory(args.sunHours)
    lines.push({ kind: 'soleil', short: cat === 'plein-soleil' ? 'Plein soleil' : cat === 'mi-ombre' ? 'Mi-ombre' : 'Ombre', text: sunPhrase(args.sunHours), detail: cat === 'plein-soleil' ? 'plein soleil' : cat === 'mi-ombre' ? 'mi-ombre' : 'ombre' })
  }
  if (args.terrain) {
    const s = slopeAt(args.terrain, args.point)
    if (Number.isFinite(s.pct)) lines.push({ kind: 'pente', short: slopePhrase(s.pct), text: slopePhrase(s.pct), detail: s.pct > 2 ? `descend vers le ${aspectLabel((s.aspectDeg + 360) % 360)}` : undefined })
  }
  const h = humidityEstimate(args)
  lines.push({ kind: 'eau', short: h.text, text: h.text, detail: h.reasons.length ? `estimation : ${h.reasons.slice(0, 2).join(', ')}` : 'estimation : sans indice, valeur moyenne' })
  return lines
}

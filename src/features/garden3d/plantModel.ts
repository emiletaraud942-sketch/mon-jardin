// Modèle des plantes pour la 3D : état à la date de la scène (moteur de croissance), puis pièces instanciées
// produites par les générateurs procéduraux de plantGen.ts, dans un plafond de triangles.
import * as THREE from 'three'
import type { Plant, Species, XY } from '../../types'
import { plantStateAt, type PlantState } from '../../engine/growth'
import type { HeightSampler } from './terrain'
import type { DetailLevel } from './walk'
import { archetypeOf, generatePlant, type GenTier, type PlantLook } from './plantGen'
import { disposePartGeometries as disposeGeometries, estimateTriangles, type PlantPart } from './plantParts'

export { PART_KINDS, partGeometries, estimateTriangles, partTriangles, type PartKind, type PlantPart } from './plantParts'
export { archetypeOf, type Archetype } from './plantGen'

export type PlantShape = 'tree' | 'shrub' | 'climber' | 'herb' | 'ground' | 'generic'

export interface PlantVisual {
  id: string
  shape: PlantShape
  heightM: number
  spreadM: number
  base: [number, number, number]
  label: string
}

const GENERIC = new THREE.Color('#5f9a45')

export function shapeOf(species: Species | undefined): PlantShape {
  if (!species) return 'generic'
  switch (species.strate) {
    case 'canopee':
    case 'arbre-bas':
      return 'tree'
    case 'arbuste':
      return 'shrub'
    case 'grimpante':
      return 'climber'
    case 'couvre-sol':
      return 'ground'
    default:
      if (species.categorie === 'arbre' || species.categorie === 'fruitier') return 'tree'
      if (species.categorie === 'haie') return 'shrub'
      return 'herb'
  }
}

export function plantLabel(plant: Plant, species: Species | undefined): string {
  const name = plant.customName || species?.nomCommun || 'Plante inconnue'
  const st = plant.status === 'projet' ? ' (projet)' : plant.status === 'malade' ? ' (malade)' : plant.status === 'mort' ? ' (morte)' : ''
  return name + st
}

const isoLocal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/**
 * État de la plante pour le rendu. `growthAt` fixe l'âge (taille, stade) ; `seasonAt` fixe la saison (feuilles, fleurs, fruits,
 * teinte d'automne). Sans `seasonAt`, une seule date pilote tout. Les annuelles sont ressemées chaque année :
 * leur cycle suit la saison choisie, y compris dans les années futures.
 */
export function renderState(plant: Plant, species: Species | undefined, growthAt: Date, seasonAt: Date = growthAt): PlantState {
  const grown = plantStateAt(plant, species, growthAt)
  if (grown.dead || seasonAt.getTime() === growthAt.getTime() || plant.status === 'projet') return grown
  if (species && !species.vivace) {
    // ressemis : l'année de plantation devient celle de la saison affichée
    const planted = new Date(plant.plantedAt)
    const y = seasonAt.getFullYear()
    if (Number.isFinite(planted.getTime()) && y > planted.getFullYear()) {
      const shifted = new Date(planted)
      shifted.setFullYear(y)
      return plantStateAt({ ...plant, plantedAt: isoLocal(shifted), ageAtPlanting: 0, measurements: undefined }, species, seasonAt)
    }
    return plantStateAt(plant, species, seasonAt)
  }
  // Vivace : même âge qu'à growthAt, vu à la saison choisie.
  const start = new Date(seasonAt.getTime() - grown.ageYears * 365.25 * 86400000)
  const s = plantStateAt({ ...plant, plantedAt: isoLocal(start), ageAtPlanting: 0, measurements: undefined }, species, seasonAt)
  return { ...s, heightM: grown.heightM, spreadM: grown.spreadM, ageYears: grown.ageYears, stage: grown.stage }
}

export function plantSize(plant: Plant, species: Species | undefined, at: Date) {
  const s = plantStateAt(plant, species, at)
  return { heightM: Math.max(0.05, s.heightM), spreadM: Math.max(0.08, s.spreadM) }
}

export function lookOf(plant: Plant, sp: Species | undefined, st: PlantState): PlantLook {
  return {
    id: plant.id,
    archetype: archetypeOf(sp),
    H: Math.max(0.05, st.heightM),
    S: Math.max(0.08, st.spreadM),
    adultH: sp?.hauteurAdulteM ?? 1.5,
    leaf: st.leafCover,
    flower: st.flowering,
    fruit: st.fruiting,
    tint: st.autumnTint,
    vigor: st.vigor,
    dead: st.dead || plant.status === 'mort',
    sick: plant.status === 'malade',
    ghost: plant.status === 'projet',
    root: sp?.strate === 'racine',
    foliage: sp ? new THREE.Color(sp.couleur || '#5f9a45') : GENERIC.clone(),
    accent: sp?.couleurAccent ? new THREE.Color(sp.couleurAccent) : undefined,
  }
}

// Les pièces d'une plante ne dépendent que de son aspect et du niveau : on les garde d'une reconstruction à l'autre
// (curseur de date, niveaux de détail de la Promenade). Aucune ressource GPU ici : simple mémoire.
const CACHE_MAX = 1500
const cache = new Map<string, PlantPart[]>()
const f3 = (n: number) => n.toFixed(3)
function generateCached(look: PlantLook, tier: GenTier, o: [number, number, number]): PlantPart[] {
  const key = [look.id, tier, look.archetype, f3(look.H), f3(look.S), f3(look.adultH), f3(look.leaf), f3(look.flower), f3(look.fruit), f3(look.tint), f3(look.vigor), look.dead, look.sick, look.ghost, look.root, look.foliage.getHexString(), look.accent?.getHexString() ?? '', f3(o[0]), f3(o[1]), f3(o[2])].join('|')
  let parts = cache.get(key)
  if (!parts) {
    if (cache.size >= CACHE_MAX) cache.clear()
    parts = generatePlant(look, tier, o)
    cache.set(key, parts)
  }
  return parts
}

/** Libère les géométries partagées (au démontage de la vue 3D) et la mémoire des pièces ; recréées au prochain besoin. */
export function disposePartGeometries(): void {
  cache.clear()
  disposeGeometries()
}

export interface BuildArgs {
  plants: Plant[]
  speciesById: Record<string, Species>
  /** Date qui fixe l'âge des plantes (taille). */
  at: Date
  /** Date qui fixe la saison (feuilles, fleurs, fruits) ; absente = `at`. */
  seasonAt?: Date
  /** Conservé pour compatibilité : la saison vient de `seasonAt`. */
  month?: number
  sample: HeightSampler
  override?: { id: string; position: XY }
  /** Niveau de détail par plante (Promenade) ; absent = niveau de qualité. */
  lod?: Record<string, DetailLevel>
  /** Niveau de détail maximal (qualité 3D) : 0 simple, 1 moyen, 2 détaillé. */
  tier?: GenTier
  /** Plafond de triangles pour l'ensemble des plantes. */
  triangleCap?: number
}

export interface PlantScene {
  parts: PlantPart[]
  visuals: Record<string, PlantVisual>
  /** Triangles estimés (une passe de rendu). */
  triangles: number
  /** Nombre de plantes par niveau de détail retenu. */
  tiers: [number, number, number]
}

export function buildPlantScene({ plants, speciesById, at, seasonAt, sample, override, lod, tier = 1, triangleCap = 150000 }: BuildArgs): PlantScene {
  const visuals: Record<string, PlantVisual> = {}
  const looks: { look: PlantLook; origin: [number, number, number]; weight: number }[] = []
  for (const plant of plants) {
    const sp = speciesById[plant.speciesId]
    const pos = override && override.id === plant.id ? override.position : plant.position
    const st = renderState(plant, sp, at, seasonAt)
    const look = lookOf(plant, sp, st)
    const origin: [number, number, number] = [pos.x, sample(pos.x, pos.y), -pos.y]
    visuals[plant.id] = { id: plant.id, shape: shapeOf(sp), heightM: look.H, spreadM: look.S, base: origin, label: plantLabel(plant, sp) }
    looks.push({ look, origin, weight: look.H * look.S })
  }
  // 1) tout au niveau simple ; 2) la Promenade monte les plantes proches ; 3) on monte les plus visibles tant que le plafond tient.
  const cur: GenTier[] = looks.map(() => 0)
  const parts: PlantPart[][] = looks.map((l) => generateCached(l.look, 0, l.origin))
  const tris = parts.map((p) => estimateTriangles(p))
  let total = tris.reduce((a, b) => a + b, 0)
  const upgrade = (i: number, to: GenTier, force: boolean) => {
    const p = generateCached(looks[i].look, to, looks[i].origin)
    const t = estimateTriangles(p)
    if (!force && total - tris[i] + t > triangleCap) return false
    total += t - tris[i]
    parts[i] = p
    tris[i] = t
    cur[i] = to
    return true
  }
  if (lod) {
    for (let i = 0; i < looks.length; i++) {
      const l = lod[looks[i].look.id] ?? 0
      if (l > 0) upgrade(i, l as GenTier, true)
    }
  }
  if (tier > 0) {
    const order = looks.map((_, i) => i).sort((a, b) => looks[b].weight - looks[a].weight || (looks[a].look.id < looks[b].look.id ? -1 : 1))
    for (const i of order) {
      if (cur[i] >= tier) continue
      if (!upgrade(i, tier, false) && tier === 2 && cur[i] < 1) upgrade(i, 1, false)
    }
  }
  const tiers: [number, number, number] = [0, 0, 0]
  for (const t of cur) tiers[t]++
  return { parts: parts.flat(), visuals, triangles: total, tiers }
}

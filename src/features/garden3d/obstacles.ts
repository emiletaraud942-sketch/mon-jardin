// Obstacles de la Promenade tirés des plantes et des arbres des environs : troncs (cercles), haies (boîtes).
// Pur : prend les `visuals` calculés par plantModel et la liste d'arbres LiDAR ; renvoie des `Collider` (voir walk.ts).
import type { DetectedTree } from '../../lib/lidar'
import type { PlantVisual } from './plantModel'
import { MAX_NEIGHBOR_TREES, treeTrunkRadius } from './neighborLayout'
import { boxCollider, circleCollider, trunkRadiusM, type Collider } from './walk'

/** En dessous de cette hauteur (m), une plante se enjambe : pas d'obstacle. */
export const MIN_SOLID_HEIGHT_M = 0.6
const MIN_HEDGE_HEIGHT_M = 0.4

/**
 * Troncs des arbres et gros arbustes (cercle de 0,15 à 0,5 m selon la taille), haies taillées (boîte).
 * Ni les plantes en projet, ni les herbacées, couvre-sols et grimpantes : on marche dedans comme dans un massif.
 */
export function plantColliders(visuals: Record<string, PlantVisual>): Collider[] {
  const out: Collider[] = []
  for (const id in visuals) {
    const v = visuals[id]
    if (!v || v.ghost) continue
    const x = v.base[0]
    const y = -v.base[2]
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue
    if (v.archetype === 'hedge') {
      if (v.heightM < MIN_HEDGE_HEIGHT_M) continue
      // Même gabarit que la haie dessinée (plantGen : largeur S, profondeur 0,72 S, feuillage rempli à 55-100 %).
      out.push(boxCollider(x, y, Math.max(0.3, v.spreadM * 0.85), Math.max(0.3, v.spreadM * 0.55)))
    } else if (v.shape === 'tree') {
      if (v.heightM >= MIN_SOLID_HEIGHT_M) out.push(circleCollider(x, y, trunkRadiusM(v.heightM)))
    } else if (v.shape === 'shrub' && v.heightM >= MIN_SOLID_HEIGHT_M + 0.2) {
      out.push(circleCollider(x, y, Math.min(0.5, Math.max(0.15, v.spreadM * 0.2))))
    }
  }
  return out
}

/** Troncs des arbres des environs (mêmes arbres que ceux dessinés : 80 au plus). */
export function treeColliders(trees: DetectedTree[] | undefined): Collider[] {
  const out: Collider[] = []
  for (const t of trees ?? []) {
    if (out.length >= MAX_NEIGHBOR_TREES) break
    if (![t.x, t.y, t.heightM, t.radiusM].every(Number.isFinite)) continue
    out.push(circleCollider(t.x, t.y, treeTrunkRadius(t)))
  }
  return out
}

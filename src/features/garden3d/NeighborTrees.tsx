// Arbres des environs détectés par le LiDAR HD (IGN) : formes simples, deux maillages instanciés (troncs, houppiers).
// Légers pour les téléphones modestes : 2 appels de dessin, 80 arbres au plus, géométries de 60 à 100 triangles.
// Non cliquables (raycast désactivé) : ils ne gênent ni la sélection des plantes ni le placement.
import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useThree } from '@react-three/fiber'
import type { DetectedTree } from '../../lib/lidar'
import type { HeightSampler } from './terrain'

/** Plafond d'arbres dessinés (le détecteur en renvoie déjà 80 au plus). */
export const MAX_NEIGHBOR_TREES = 80
/** Couleurs de scène (exception assumée : la 3D n'utilise pas les variables CSS). */
const CROWN_COLOR = '#58814a'
const TRUNK_COLOR = '#6e5a46'

let shared: { trunk: THREE.CylinderGeometry; crown: THREE.SphereGeometry; trunkMat: THREE.MeshLambertMaterial; crownMat: THREE.MeshLambertMaterial } | null = null
function getShared() {
  if (!shared)
    shared = {
      trunk: new THREE.CylinderGeometry(0.6, 1, 1, 6),
      crown: new THREE.SphereGeometry(1, 10, 8),
      trunkMat: new THREE.MeshLambertMaterial({ color: TRUNK_COLOR }),
      crownMat: new THREE.MeshLambertMaterial({ color: CROWN_COLOR }),
    }
  return shared
}
export function disposeNeighborTrees(): void {
  if (!shared) return
  shared.trunk.dispose()
  shared.crown.dispose()
  shared.trunkMat.dispose()
  shared.crownMat.dispose()
  shared = null
}

/** Dimensions dessinées d'un arbre : tronc jusqu'à la moitié de la hauteur, houppier ellipsoïde au-dessus (même modèle que l'ombre calculée). */
export function treeShape(t: DetectedTree) {
  const h = Math.max(2, t.heightM)
  const r = Math.max(0.5, t.radiusM)
  const crownBottom = h * 0.35
  return { trunkH: h * 0.55, trunkR: Math.min(0.5, Math.max(0.12, r * 0.07)), crownR: r, crownHalfH: (h - crownBottom) / 2, crownY: crownBottom + (h - crownBottom) / 2 }
}

export function NeighborTrees({ trees, sample }: { trees: DetectedTree[]; sample: HeightSampler }) {
  const list = useMemo(() => trees.filter((t) => [t.x, t.y, t.heightM, t.radiusM].every(Number.isFinite)).slice(0, MAX_NEIGHBOR_TREES), [trees])
  const invalidate = useThree((s) => s.invalidate)
  const trunkRef = useRef<THREE.InstancedMesh>(null)
  const crownRef = useRef<THREE.InstancedMesh>(null)
  const g = getShared()

  useLayoutEffect(() => {
    const trunk = trunkRef.current
    const crown = crownRef.current
    if (!trunk || !crown) return
    const o = new THREE.Object3D()
    list.forEach((t, i) => {
      const s = treeShape(t)
      const y0 = sample(t.x, t.y)
      o.rotation.set(0, 0, 0)
      o.position.set(t.x, y0 + s.trunkH / 2, -t.y)
      o.scale.set(s.trunkR, s.trunkH, s.trunkR)
      o.updateMatrix()
      trunk.setMatrixAt(i, o.matrix)
      o.position.set(t.x, y0 + s.crownY, -t.y)
      o.scale.set(s.crownR, s.crownHalfH, s.crownR)
      o.updateMatrix()
      crown.setMatrixAt(i, o.matrix)
    })
    trunk.count = crown.count = list.length
    trunk.instanceMatrix.needsUpdate = crown.instanceMatrix.needsUpdate = true
    trunk.computeBoundingSphere()
    crown.computeBoundingSphere()
    invalidate()
  }, [list, sample, invalidate])

  if (list.length === 0) return null
  const noRay = () => null
  return (
    <group name="arbres-environs">
      <instancedMesh ref={trunkRef} args={[g.trunk, g.trunkMat, MAX_NEIGHBOR_TREES]} castShadow raycast={noRay} frustumCulled={false} />
      <instancedMesh ref={crownRef} args={[g.crown, g.crownMat, MAX_NEIGHBOR_TREES]} castShadow raycast={noRay} frustumCulled={false} />
    </group>
  )
}

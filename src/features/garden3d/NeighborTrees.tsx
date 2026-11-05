// Arbres des environs détectés par le LiDAR HD (IGN) : trois maillages instanciés (troncs, masses de feuillage, branches d'hiver).
// Légers pour les téléphones modestes : 3 appels de dessin, 80 arbres au plus ; masses = « touffe » bruitée de plantModel (80 triangles),
// 1 à 3 par arbre, teintes variées par instance (instanceColor), couleur de la saison, branches nues l'hiver (voir neighborLayout.ts).
// Non cliquables (raycast désactivé) : ils ne gênent ni la sélection des plantes ni le placement.
import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useThree } from '@react-three/fiber'
import type { DetectedTree } from '../../lib/lidar'
import type { HeightSampler } from './terrain'
import { partGeometries } from './plantParts'
import { MAX_NEIGHBOR_TREES, deciduousSeason, layoutNeighborTrees } from './neighborLayout'

export { MAX_NEIGHBOR_TREES, treeShape } from './neighborLayout'

/** Couleurs de scène (exception assumée : la 3D n'utilise pas les variables CSS). */
const TRUNK_COLOR = '#6e5a46'
const BRANCH_COLOR = '#5d4d3c'
/** Une masse par arbre au plus 3 ; une branche nue : 5 par arbre. */
const MAX_LOBES = MAX_NEIGHBOR_TREES * 3
const MAX_BRANCHES = MAX_NEIGHBOR_TREES * 5

let shared: { trunk: THREE.CylinderGeometry; trunkMat: THREE.MeshLambertMaterial; crownMat: THREE.MeshLambertMaterial; branchMat: THREE.MeshLambertMaterial } | null = null
function getShared() {
  if (!shared)
    shared = {
      trunk: new THREE.CylinderGeometry(0.6, 1, 1, 6),
      trunkMat: new THREE.MeshLambertMaterial({ color: TRUNK_COLOR }),
      // Les géométries de masse et de branche viennent de plantModel (partagées, libérées avec elles) : ici, seulement les matériaux.
      crownMat: new THREE.MeshLambertMaterial({ color: '#ffffff', vertexColors: true }),
      branchMat: new THREE.MeshLambertMaterial({ color: BRANCH_COLOR, vertexColors: true, side: THREE.DoubleSide }),
    }
  return shared
}
export function disposeNeighborTrees(): void {
  if (!shared) return
  shared.trunk.dispose()
  shared.trunkMat.dispose()
  shared.crownMat.dispose()
  shared.branchMat.dispose()
  shared = null
}

const WHITE = new THREE.Color('#ffffff')

export function NeighborTrees({ trees, sample, seasonTime }: { trees: DetectedTree[]; sample: HeightSampler; seasonTime: number }) {
  const invalidate = useThree((s) => s.invalidate)
  const trunkRef = useRef<THREE.InstancedMesh>(null)
  const crownRef = useRef<THREE.InstancedMesh>(null)
  const branchRef = useRef<THREE.InstancedMesh>(null)
  const g = getShared()
  const geos = partGeometries()
  const layout = useMemo(() => layoutNeighborTrees(trees, deciduousSeason(new Date(seasonTime)), sample), [trees, seasonTime, sample])

  useLayoutEffect(() => {
    const trunk = trunkRef.current
    const crown = crownRef.current
    const branch = branchRef.current
    if (!trunk || !crown || !branch) return
    const o = new THREE.Object3D()
    const col = new THREE.Color()
    layout.trunks.forEach((t, i) => {
      o.rotation.set(0, 0, 0)
      o.position.set(t.x, t.y + t.h / 2, t.z)
      o.scale.set(t.r, t.h, t.r)
      o.updateMatrix()
      trunk.setMatrixAt(i, o.matrix)
    })
    layout.lobes.forEach((l, i) => {
      o.rotation.set(0, l.rotY, 0)
      o.position.set(l.x, l.y, l.z)
      o.scale.set(l.rx, l.ry, l.rz)
      o.updateMatrix()
      crown.setMatrixAt(i, o.matrix)
      crown.setColorAt(i, col.set(l.color))
    })
    if (!crown.instanceColor) crown.setColorAt(0, WHITE) // crée le tampon de couleurs avant la compilation du shader, même sans masse
    const up = new THREE.Vector3(0, 1, 0)
    const a = new THREE.Vector3()
    const b = new THREE.Vector3()
    layout.branches.forEach((br, i) => {
      a.set(...br.from)
      b.set(...br.to).sub(a)
      const len = b.length() || 1
      o.position.copy(a)
      o.quaternion.setFromUnitVectors(up, b.normalize())
      o.scale.set(br.r, len, br.r)
      o.updateMatrix()
      branch.setMatrixAt(i, o.matrix)
    })
    trunk.count = layout.trunks.length
    crown.count = layout.lobes.length
    branch.count = layout.branches.length
    trunk.instanceMatrix.needsUpdate = crown.instanceMatrix.needsUpdate = branch.instanceMatrix.needsUpdate = true
    if (crown.instanceColor) crown.instanceColor.needsUpdate = true
    trunk.computeBoundingSphere()
    crown.computeBoundingSphere()
    branch.computeBoundingSphere()
    invalidate()
  }, [layout, invalidate])

  if (layout.trees === 0) return null
  const noRay = () => null
  return (
    <group name="arbres-environs">
      <instancedMesh ref={trunkRef} args={[g.trunk, g.trunkMat, MAX_NEIGHBOR_TREES]} castShadow raycast={noRay} frustumCulled={false} />
      <instancedMesh ref={crownRef} args={[geos.clump, g.crownMat, MAX_LOBES]} castShadow receiveShadow raycast={noRay} frustumCulled={false} />
      <instancedMesh ref={branchRef} args={[geos.branch, g.branchMat, MAX_BRANCHES]} raycast={noRay} frustumCulled={false} />
    </group>
  )
}

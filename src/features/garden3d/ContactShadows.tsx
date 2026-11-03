// Dessin des ombres de contact : une seule InstancedMesh (un appel de dessin), plan de 2 triangles, texture dégradée de 64 px.
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useThree } from '@react-three/fiber'
import type { Building } from '../../types'
import type { DetectedTree } from '../../lib/lidar'
import type { PlantVisual } from './plantModel'
import type { HeightSampler } from './terrain'
import { MAX_CONTACT_SHADOWS, contactShadowInstances } from './contactShadows'

let tex: THREE.CanvasTexture | null = null
let geo: THREE.PlaneGeometry | null = null
let mat: THREE.MeshBasicMaterial | null = null

/** Dégradé radial 64 px : noyau sombre, bord transparent (sans bord dur). */
function shadowTexture(): THREE.CanvasTexture {
  if (tex) return tex
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const ctx = c.getContext('2d')
  if (ctx) {
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
    g.addColorStop(0, 'rgba(0,0,0,0.95)')
    g.addColorStop(0.35, 'rgba(0,0,0,0.6)')
    g.addColorStop(0.7, 'rgba(0,0,0,0.18)')
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 64, 64)
  }
  tex = new THREE.CanvasTexture(c)
  tex.minFilter = THREE.LinearFilter
  tex.generateMipmaps = false
  tex.needsUpdate = true
  return tex
}

function getParts() {
  if (!geo) geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2) // à plat, face vers le haut
  if (!mat)
    mat = new THREE.MeshBasicMaterial({
      map: shadowTexture(),
      color: '#141c0e',
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    })
  return { geo, mat }
}

/** Libère la texture, la géométrie et le matériau (recréés à la demande). */
export function disposeContactShadows(): void {
  tex?.dispose()
  geo?.dispose()
  mat?.dispose()
  tex = geo = mat = null
}

export function ContactShadows({ visuals, trees, buildings, sample }: { visuals: Record<string, PlantVisual>; trees?: DetectedTree[]; buildings?: Building[]; sample: HeightSampler }) {
  const invalidate = useThree((s) => s.invalidate)
  const ref = useRef<THREE.InstancedMesh>(null)
  const { geo: g, mat: m } = getParts()
  const insts = useMemo(() => contactShadowInstances({ visuals, trees, buildings, sample }), [visuals, trees, buildings, sample])
  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    const o = new THREE.Object3D()
    for (let i = 0; i < insts.length; i++) {
      const s = insts[i]
      o.position.set(s.x, s.y, s.z)
      o.rotation.set(0, s.rotY, 0)
      o.scale.set(s.sx, 1, s.sz)
      o.updateMatrix()
      mesh.setMatrixAt(i, o.matrix)
    }
    mesh.count = insts.length
    mesh.instanceMatrix.needsUpdate = true
    invalidate()
  }, [insts, invalidate])
  useEffect(() => () => void ref.current?.dispose(), [])
  return <instancedMesh ref={ref} name="ombres-de-contact" args={[g, m, MAX_CONTACT_SHADOWS]} renderOrder={1} frustumCulled={false} raycast={() => null} />
}

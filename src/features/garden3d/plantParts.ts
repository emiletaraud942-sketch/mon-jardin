// Pièces instanciées des plantes : types, géométries unitaires partagées (mémoïsées) et coût en triangles.
// Pur (aucun accès au DOM) : les textures et matériaux vivent dans Plants.tsx.
import * as THREE from 'three'
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

// trunk : fût d'écorce ; branch : branche / tige fine ; blob : masse de feuillage ; clump : petite touffe de feuillage ;
// cone : étage de conifère ; cyl : disque / butte ; dot : fleur ou fruit ; tuft : touffe de brins ;
// card : carte de feuilles (alpha-test) ; box : bloc taillé (haie, butte, support).
export type PartKind = 'trunk' | 'branch' | 'blob' | 'cone' | 'cyl' | 'dot' | 'clump' | 'tuft' | 'card' | 'box'
export const PART_KINDS: PartKind[] = ['trunk', 'branch', 'blob', 'cone', 'cyl', 'dot', 'clump', 'tuft', 'card', 'box']

export interface PlantPart {
  owner: string
  kind: PartKind
  transparent: boolean
  matrix: THREE.Matrix4
  color: THREE.Color
}

export function rng(seed: number) {
  let a = Math.floor(seed * 4294967296) >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Hachage déterministe d'une chaîne vers [0, 1[ (graine de chaque plante). */
export function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return (h >>> 0) / 4294967296
}

/** Bruit lisse déterministe de la position : les sommets dupliqués d'un polyèdre restent soudés. */
function bump(x: number, y: number, z: number): number {
  return (
    0.55 * Math.sin(3.1 * x + 1.7) * Math.sin(2.7 * y + 0.4) * Math.sin(3.3 * z + 2.2) +
    0.3 * Math.sin(6.3 * x + 0.5 * y + 4.1) * Math.sin(5.9 * z - 1.3 * y + 0.7) +
    0.15 * Math.sin(11.7 * x + 9.1 * z + 2.9 * y)
  )
}

/** Dégradé de teinte sommet par sommet (sombre en bas, clair en haut) : donne du volume sans lumière supplémentaire. */
function paint(g: THREE.BufferGeometry, lo: number, hi: number, y0: number, y1: number) {
  const pos = g.attributes.position
  const col = new Float32Array(pos.count * 3)
  for (let i = 0; i < pos.count; i++) {
    const t = Math.min(1, Math.max(0, (pos.getY(i) - y0) / (y1 - y0)))
    const k = lo + (hi - lo) * t
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = k
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3))
  return g
}

function noisyBlob(detail: number, amp: number): THREE.BufferGeometry {
  // Sommets soudés : les normales sont lissées (aspect de feuillage doux), pas de facettes.
  const raw = new THREE.IcosahedronGeometry(1, detail)
  raw.deleteAttribute('normal')
  raw.deleteAttribute('uv')
  const g = mergeVertices(raw, 1e-4)
  raw.dispose()
  const p = g.attributes.position as THREE.BufferAttribute
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i)
    const y = p.getY(i)
    const z = p.getZ(i)
    const k = 1 + amp * bump(x, y, z)
    p.setXYZ(i, x * k, y * k * 0.94, z * k)
  }
  g.computeVertexNormals()
  return paint(g, 0.66, 1.08, -1, 1)
}

/** Brins en touffe : 9 lames triangulaires inclinées vers l'extérieur (hauteur 1, rayon ~0,6). */
function tuftGeometry(): THREE.BufferGeometry {
  const r = rng(0.4242)
  const geos: THREE.BufferGeometry[] = []
  const n = 9
  for (let i = 0; i < n; i++) {
    const h = 0.62 + 0.38 * r()
    const g = new THREE.ConeGeometry(0.07, h, 3, 1, true).translate(0, h / 2, 0)
    const tilt = 0.18 + 0.4 * r()
    const a = (i / n) * Math.PI * 2 + r() * 0.5
    g.rotateZ(-tilt)
    g.translate(0.12 + 0.12 * r(), 0, 0)
    g.rotateY(a)
    geos.push(g.index ? g.toNonIndexed() : g)
  }
  const merged = mergeGeometries(geos)
  geos.forEach((g) => g.dispose())
  merged.computeVertexNormals()
  return paint(merged, 0.55, 1.1, 0, 1)
}

/** Tronc légèrement irrégulier (écorce) : rayon perturbé de façon déterministe. */
function barkGeometry(): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(0.7, 1, 1, 9, 4, true)
  const pos = g.attributes.position as THREE.BufferAttribute
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    const z = pos.getZ(i)
    const a = Math.atan2(z, x)
    const k = 1 + 0.09 * Math.sin(a * 5 + y * 7) + 0.05 * Math.sin(a * 11 - y * 13)
    pos.setX(i, x * k)
    pos.setZ(i, z * k)
  }
  g.translate(0, 0.5, 0)
  g.computeVertexNormals()
  return paint(g, 0.85, 1, 0, 1)
}

/** Carte de feuilles : deux plans croisés (4 triangles), centrés, de côté 2. */
function cardGeometry(): THREE.BufferGeometry {
  const a = new THREE.PlaneGeometry(2, 2)
  const b = new THREE.PlaneGeometry(2, 2).rotateY(Math.PI / 2)
  const g = mergeGeometries([a, b])
  a.dispose()
  b.dispose()
  return paint(g, 0.7, 1.05, -1, 1)
}

let shared: Record<PartKind, THREE.BufferGeometry> | null = null
/** Géométries unitaires partagées (base à y = 0 sauf sphères et cartes centrées). */
export function partGeometries(): Record<PartKind, THREE.BufferGeometry> {
  if (shared) return shared
  shared = {
    trunk: barkGeometry(),
    branch: paint(new THREE.CylinderGeometry(0.55, 1, 1, 5, 1, true).translate(0, 0.5, 0), 0.85, 1, 0, 1),
    blob: noisyBlob(2, 0.2),
    cone: paint(new THREE.ConeGeometry(1, 1, 8, 1, true).translate(0, 0.5, 0), 0.7, 1.05, 0, 1),
    cyl: paint(new THREE.CylinderGeometry(1, 1, 1, 10).translate(0, 0.5, 0), 0.9, 1, 0, 1),
    dot: paint(new THREE.IcosahedronGeometry(1, 0), 0.85, 1.1, -1, 1),
    clump: noisyBlob(1, 0.28),
    tuft: tuftGeometry(),
    card: cardGeometry(),
    box: paint(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), 0.8, 1.05, 0, 1),
  }
  return shared
}

/** Libère les géométries partagées (au démontage de la vue 3D) ; elles sont recréées au prochain besoin. */
export function disposePartGeometries(): void {
  if (!shared) return
  for (const k of PART_KINDS) shared[k].dispose()
  shared = null
  trisCache = null
}

// ---------- Coût en triangles ----------

let trisCache: Record<PartKind, number> | null = null
/** Triangles dessinés par instance de chaque type de pièce (lus sur les vraies géométries). */
export function partTriangles(): Record<PartKind, number> {
  if (trisCache) return trisCache
  const g = partGeometries()
  const out = {} as Record<PartKind, number>
  for (const k of PART_KINDS) out[k] = Math.round((g[k].index ? g[k].index!.count : g[k].attributes.position.count) / 3)
  trisCache = out
  return out
}

export function estimateTriangles(parts: readonly { kind: PartKind }[]): number {
  const t = partTriangles()
  let n = 0
  for (const p of parts) n += t[p.kind]
  return n
}

// Arbres des environs (LiDAR HD) : mise en forme pure. Le LiDAR ne donne que position, hauteur et rayon de houppier :
// on en tire une silhouette irrégulière (1 à 3 masses de feuillage), une teinte parmi quelques-unes, la couleur de la saison,
// et des branches nues l'hiver. Déterministe (même arbre = même rendu) ; aucun accès au DOM ni à three.
import type { DetectedTree } from '../../lib/lidar'

/** Plafond d'arbres dessinés (le détecteur en renvoie déjà 80 au plus). */
export const MAX_NEIGHBOR_TREES = 80

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x))

/** Dimensions de base : tronc jusqu'à 55 % de la hauteur, houppier ellipsoïde au-dessus (même modèle que l'ombre calculée). */
export function treeShape(t: DetectedTree) {
  const h = Math.max(2, t.heightM)
  const r = Math.max(0.5, t.radiusM)
  const crownBottom = h * 0.35
  return { trunkH: h * 0.55, trunkR: Math.min(0.5, Math.max(0.12, r * 0.07)), crownR: r, crownHalfH: (h - crownBottom) / 2, crownY: crownBottom + (h - crownBottom) / 2 }
}

/** Rayon du tronc pour les collisions (m) : au moins 0,2 m (le promeneur ne passe pas « dans » le tronc dessiné). */
export function treeTrunkRadius(t: DetectedTree): number {
  return Math.max(0.2, treeShape(t).trunkR)
}

// ---------- Saison ----------

export interface TreeSeason {
  /** 0 = nu, 1 = plein feuillage. */
  leaf: number
  /** 0 = vert, 1 = pleine couleur d'automne. */
  tint: number
}

type Nodes = ReadonlyArray<readonly [number, number]>
// Mêmes courbes que le moteur de croissance des plantes (src/engine/growth.ts) pour un arbre caduc : les arbres des environs
// et les plantes du jardin changent de saison ensemble. Copie volontaire (le moteur n'exporte pas ses courbes).
const LEAF: Nodes = [[0, 0], [2.95, 0], [3.5, 0.35], [4.3, 1], [9.8, 1], [10, 0.85], [10.8, 0.1], [11.1, 0], [12, 0]]
const TINT: Nodes = [[0, 0], [8.9, 0], [9.6, 0.8], [10.3, 1], [10.9, 0.5], [11.2, 0], [12, 0]]

function interp(nodes: Nodes, pos: number): number {
  if (pos <= nodes[0][0]) return nodes[0][1]
  for (let i = 1; i < nodes.length; i++) {
    const [x1, y1] = nodes[i]
    if (pos <= x1) {
      const [x0, y0] = nodes[i - 1]
      return x1 === x0 ? y1 : y0 + ((y1 - y0) * (pos - x0)) / (x1 - x0)
    }
  }
  return nodes[nodes.length - 1][1]
}

/** Feuillage d'un arbre caduc à la date de la scène (hémisphère nord). Date invalide : plein été. */
export function deciduousSeason(date: Date): TreeSeason {
  if (!Number.isFinite(date.getTime())) return { leaf: 1, tint: 0 }
  const dim = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
  const pos = date.getMonth() + (date.getDate() - 1) / dim
  return { leaf: interp(LEAF, pos), tint: interp(TINT, pos) }
}

// ---------- Couleurs ----------

/** Quatre teintes de feuillage d'été (vert tilleul, chêne, charme, peuplier) et leurs couleurs d'automne. */
const SUMMER = ['#4f7a40', '#5d8b48', '#3f6c3a', '#6b9350']
const AUTUMN = ['#c58b2c', '#b0562a', '#d1aa3e', '#8f6a2c']
const SPRING = '#8bb552'
const CONIFER = '#2f5a3a'
const CONIFER_ALT = '#3a6842'

function hexToRgb(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
function mix(a: string, b: string, t: number): [number, number, number] {
  const A = hexToRgb(a)
  const B = hexToRgb(b)
  const k = clamp(t, 0, 1)
  return [A[0] + (B[0] - A[0]) * k, A[1] + (B[1] - A[1]) * k, A[2] + (B[2] - A[2]) * k]
}
const toHex = (c: [number, number, number], shade: number): string => {
  const k = 1 + shade
  const h = (v: number) => clamp(Math.round(v * k), 0, 255).toString(16).padStart(2, '0')
  return '#' + h(c[0]) + h(c[1]) + h(c[2])
}

/** Couleur du feuillage : `tone` (0..3) = teinte de l'arbre, `shade` (-0,1..0,1) = écart propre à chaque masse. */
export function foliageColor(tone: number, season: TreeSeason, evergreen: boolean, shade = 0): string {
  const i = ((Math.floor(tone) % 4) + 4) % 4
  if (evergreen) return toHex(hexToRgb(i % 2 ? CONIFER_ALT : CONIFER), shade)
  // Jeunes feuilles plus claires au printemps, puis teinte d'automne.
  const spring = mix(SUMMER[i], SPRING, season.tint < 0.05 ? (1 - season.leaf) * 0.7 : 0)
  const withAutumn: [number, number, number] = [0, 0, 0]
  const fall = hexToRgb(AUTUMN[i])
  for (let c = 0; c < 3; c++) withAutumn[c] = spring[c] + (fall[c] - spring[c]) * clamp(season.tint, 0, 1)
  return toHex(withAutumn, shade)
}

// ---------- Mise en forme ----------

function rng(seed: number) {
  let a = (Math.floor(seed) ^ 0x9e3779b9) >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
/** Graine stable d'un arbre : sa position au décimètre près. */
export function treeSeed(t: DetectedTree): number {
  return Math.imul(Math.round(t.x * 10) + 40000, 73856093) ^ Math.imul(Math.round(t.y * 10) + 40000, 19349663)
}

export interface TrunkInst {
  /** Position de la base, repère Three.js. */
  x: number
  y: number
  z: number
  h: number
  r: number
}
export interface LobeInst {
  x: number
  y: number
  z: number
  rx: number
  ry: number
  rz: number
  rotY: number
  color: string
}
export interface BranchInst {
  from: [number, number, number]
  to: [number, number, number]
  r: number
}
export interface NeighborLayout {
  trunks: TrunkInst[]
  lobes: LobeInst[]
  branches: BranchInst[]
  /** Arbres dessinés (au plus MAX_NEIGHBOR_TREES). */
  trees: number
  /** Arbres sans feuilles à cette date. */
  bare: number
  evergreen: number
}

/** Part de conifères / persistants parmi les arbres détectés (le LiDAR ne distingue pas les espèces). */
export const EVERGREEN_SHARE = 0.2
/** En dessous de ce feuillage, l'arbre caduc est dessiné nu. */
export const BARE_LEAF = 0.2

export function layoutNeighborTrees(trees: DetectedTree[], season: TreeSeason, sample: (x: number, y: number) => number): NeighborLayout {
  const list = trees.filter((t) => [t.x, t.y, t.heightM, t.radiusM].every(Number.isFinite)).slice(0, MAX_NEIGHBOR_TREES)
  const out: NeighborLayout = { trunks: [], lobes: [], branches: [], trees: list.length, bare: 0, evergreen: 0 }
  for (const t of list) {
    const s = treeShape(t)
    const r = rng(treeSeed(t))
    const evergreen = r() < EVERGREEN_SHARE
    const tone = Math.floor(r() * 4)
    const y0 = sample(t.x, t.y)
    const z = -t.y
    const h = Math.max(2, t.heightM)
    const bare = !evergreen && season.leaf < BARE_LEAF
    if (evergreen) out.evergreen++
    if (bare) out.bare++

    if (bare) {
      // Tronc jusqu'aux trois quarts de la hauteur, puis 5 branches qui s'écartent.
      const top = h * 0.72
      out.trunks.push({ x: t.x, y: y0, z, h: top, r: s.trunkR })
      const n = 5
      const a0 = r() * Math.PI * 2
      for (let i = 0; i < n; i++) {
        const a = a0 + (i / n) * Math.PI * 2 + (r() - 0.5) * 0.5
        const reach = s.crownR * (0.7 + 0.3 * r())
        const baseY = y0 + top * (0.62 + 0.2 * r())
        out.branches.push({
          from: [t.x, baseY, z],
          to: [t.x + Math.cos(a) * reach, y0 + Math.min(h, top + (h - top) * (0.5 + 0.5 * r())), z - Math.sin(a) * reach],
          r: Math.max(0.05, s.trunkR * 0.45),
        })
      }
      continue
    }

    out.trunks.push({ x: t.x, y: y0, z, h: s.trunkH, r: s.trunkR })
    // Feuillage partiel au printemps / en automne : les masses rétrécissent un peu quand les feuilles tombent.
    const fill = evergreen ? 1 : 0.55 + 0.45 * clamp(season.leaf, 0, 1)
    if (evergreen) {
      // Conifère : trois étages qui s'affinent vers le haut.
      for (let i = 0; i < 3; i++) {
        const f = [0.42, 0.64, 0.84][i]
        const k = [1, 0.74, 0.5][i]
        out.lobes.push({
          x: t.x,
          y: y0 + h * f,
          z,
          rx: s.crownR * 0.8 * k,
          ry: h * 0.17,
          rz: s.crownR * 0.8 * k,
          rotY: r() * 6.28,
          color: foliageColor(tone, season, true, (r() - 0.5) * 0.12),
        })
      }
      continue
    }
    // Feuillu : masse principale + deux masses décalées (silhouette irrégulière).
    out.lobes.push({
      x: t.x,
      y: y0 + s.crownY,
      z,
      rx: s.crownR * fill,
      ry: s.crownHalfH * fill,
      rz: s.crownR * fill,
      rotY: r() * 6.28,
      color: foliageColor(tone, season, false, (r() - 0.5) * 0.12),
    })
    for (let i = 0; i < 2; i++) {
      const a = r() * Math.PI * 2
      const d = s.crownR * (0.35 + 0.2 * r())
      const k = 0.55 + 0.2 * r()
      out.lobes.push({
        x: t.x + Math.cos(a) * d,
        y: y0 + s.crownY + (r() - 0.35) * s.crownHalfH * 0.7,
        z: z - Math.sin(a) * d,
        rx: s.crownR * k * fill,
        ry: s.crownHalfH * k * fill,
        rz: s.crownR * k * fill,
        rotY: r() * 6.28,
        color: foliageColor(tone, season, false, (r() - 0.5) * 0.14),
      })
    }
  }
  return out
}

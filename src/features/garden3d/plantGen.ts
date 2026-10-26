// Générateurs procéduraux des plantes, un par archétype. Purs et déterministes : même graine (hachage de l'identifiant),
// mêmes formes. Chaque générateur produit des « pièces » instanciées (voir plantParts.ts).
// Croissance continue : le nombre de tirages aléatoires et de pièces ne dépend que du niveau de détail, jamais de la taille ;
// seules les dimensions changent, donc la forme grandit sans saut. Les caducs perdent leurs feuilles (échelle -> 0) et
// laissent voir le squelette de branches.
import * as THREE from 'three'
import type { Species } from '../../types'
import { hash, rng, type PartKind, type PlantPart } from './plantParts'

export type Archetype = 'tree' | 'fruit' | 'conifer' | 'shrub' | 'hedge' | 'perennial' | 'grass' | 'climber' | 'veg' | 'ground' | 'generic'
/** 0 = simple, 1 = moyen, 2 = détaillé. */
export type GenTier = 0 | 1 | 2

const CONIFER = /(^|-)(pin|sapin|epicea|cedre|cypres|thuya|genevrier|if|douglas|meleze)($|-)/

export function archetypeOf(sp: Species | undefined): Archetype {
  if (!sp) return 'generic'
  if (CONIFER.test(sp.id)) return 'conifer'
  switch (sp.strate) {
    case 'canopee':
    case 'arbre-bas':
      return sp.categorie === 'fruitier' ? 'fruit' : 'tree'
    case 'arbuste':
      return sp.categorie === 'haie' && sp.hauteurAdulteM <= 4.5 && sp.envergureAdulteM >= 1.5 ? 'hedge' : 'shrub'
    case 'grimpante':
      return 'climber'
    case 'couvre-sol':
      return 'ground'
    default:
      if (/^poac/i.test(sp.famille) || sp.id === 'ciboulette') return 'grass'
      if (sp.categorie === 'legume' || sp.categorie === 'engrais-vert') return 'veg'
      if (sp.categorie === 'arbre') return 'tree'
      if (sp.categorie === 'fruitier') return 'fruit'
      if (sp.categorie === 'haie') return 'shrub'
      return 'perennial'
  }
}

export interface PlantLook {
  id: string
  archetype: Archetype
  /** Hauteur et envergure actuelles (m). */
  H: number
  S: number
  /** Hauteur adulte (m) : fixe la taille des supports des grimpantes. */
  adultH: number
  leaf: number
  flower: number
  fruit: number
  tint: number
  vigor: number
  dead: boolean
  sick: boolean
  /** Plante en projet : fantôme transparent, sans détail fin. */
  ghost: boolean
  /** Racine (carotte, radis) : feuillage en touffe. */
  root: boolean
  foliage: THREE.Color
  accent?: THREE.Color
}

const TRUNK = new THREE.Color('#6b4a2b')
const DEAD = new THREE.Color('#8b8b86')
const DEAD_HERB = new THREE.Color('#9a8a66')
const SICK = new THREE.Color('#cdb53c')
const SOIL = new THREE.Color('#5a4331')
const WOOD = new THREE.Color('#8a6a45')
const WIRE = new THREE.Color('#9a9a96')
const STRAW = new THREE.Color('#d8c98a')
const WHITE = new THREE.Color('#ffffff')
const AUTUMN = ['#d9a521', '#d2691e', '#b5331f', '#c9b02a'].map((c) => new THREE.Color(c))

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const smooth = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a), 0, 1)
  return t * t * (3 - 2 * t)
}

type V3 = [number, number, number]

const _p = new THREE.Vector3()
const _q = new THREE.Quaternion()
const _s = new THREE.Vector3()
const _e = new THREE.Euler()
const _a = new THREE.Vector3()
const _b = new THREE.Vector3()
const UP = new THREE.Vector3(0, 1, 0)

/** Émetteur de pièces : repère local de la plante (lacet global, inclinaison du fût) vers le monde. */
class Emitter {
  parts: PlantPart[] = []
  private cy: number
  private sy: number
  constructor(
    private owner: string,
    private ghost: boolean,
    private o: V3,
    private yaw: number,
    private lean: [number, number],
    private href: number,
  ) {
    this.cy = Math.cos(yaw)
    this.sy = Math.sin(yaw)
  }
  /** Point local -> monde. */
  pt(x: number, y: number, z: number): V3 {
    const rx = x * this.cy - z * this.sy
    const rz = x * this.sy + z * this.cy
    const f = Math.max(0, y / this.href)
    const k = f * f
    return [this.o[0] + rx + this.lean[0] * k, this.o[1] + y, this.o[2] + rz + this.lean[1] * k]
  }
  add(kind: PartKind, x: number, y: number, z: number, sx: number, sy: number, sz: number, color: THREE.Color, yaw = 0, tx = 0, tz = 0) {
    const w = this.pt(x, y, z)
    _e.set(tx, yaw + this.yaw, tz, 'YXZ')
    _q.setFromEuler(_e)
    this.parts.push({ owner: this.owner, kind, transparent: this.ghost, matrix: new THREE.Matrix4().compose(_p.set(w[0], w[1], w[2]), _q, _s.set(sx, sy, sz)), color })
  }
  /** Cylindre effilé de a vers b (coordonnées locales), rayon de base r. */
  limb(kind: PartKind, a: V3, b: V3, r: number, color: THREE.Color) {
    const wa = this.pt(a[0], a[1], a[2])
    const wb = this.pt(b[0], b[1], b[2])
    _a.set(wa[0], wa[1], wa[2])
    _b.set(wb[0], wb[1], wb[2]).sub(_a)
    const len = _b.length()
    if (len < 1e-5) return
    _q.setFromUnitVectors(UP, _b.divideScalar(len))
    this.parts.push({ owner: this.owner, kind, transparent: this.ghost, matrix: new THREE.Matrix4().compose(_a, _q, _s.set(r, len, r)), color })
  }
}

interface Ctx {
  em: Emitter
  r: () => number
  /** Flux aléatoire dédié aux fleurs et fruits : leurs positions ne dépendent pas du feuillage. */
  rd: () => number
  look: PlantLook
  tier: GenTier
  H: number
  S: number
  /** Échelle du feuillage (0 = absent, 1 = plein). */
  lf: number
  foliage: THREE.Color
  trunk: THREE.Color
  accent?: THREE.Color
  blossom?: THREE.Color
  /** Teinte variée d'une pièce de feuillage. */
  shade: (amount?: number) => THREE.Color
}

const lerpColor = (a: THREE.Color, b: THREE.Color, t: number) => a.clone().lerp(b, clamp(t, 0, 1))

interface Lump {
  x: number
  y: number
  z: number
  r: number
}

/** Fleurs / fruits : petites sphères réparties à la surface des touffes. */
function dotsOn(c: Ctx, lumps: Lump[], n: number, size: number, color: THREE.Color | undefined, intensity: number, below = false) {
  if (!color || intensity < 0.03 || !lumps.length || size <= 0) return
  const sz = size * (0.35 + 0.65 * intensity)
  for (let i = 0; i < n; i++) {
    const l = lumps[i % lumps.length]
    const a = c.rd() * 6.283
    const e = below ? -0.2 - c.rd() * 0.7 : -0.3 + c.rd() * 1.1
    const ce = Math.cos(e)
    const k = l.r * 0.96
    const col = color.clone().offsetHSL(0, (c.rd() - 0.5) * 0.06, (c.rd() - 0.5) * 0.1)
    c.em.add('dot', l.x + Math.cos(a) * ce * k, l.y + Math.sin(e) * k, l.z + Math.sin(a) * ce * k, sz, sz, sz, col)
  }
}

const TIERED = <T,>(t: GenTier, a: T, b: T, d: T): T => (t === 0 ? a : t === 1 ? b : d)

// ---------- Arbres feuillus et fruitiers ----------

function broadleaf(c: Ctx, fruit: boolean) {
  const { em, r, H, S, tier } = c
  const trunkH = H * (fruit ? 0.27 : 0.34) * (0.9 + 0.2 * r())
  const crownBottom = trunkH * 0.85
  const ry = Math.max(0.05, (H - crownBottom) / 2)
  const rx = Math.max(0.05, S / 2)
  const cy = crownBottom + ry
  const tr = clamp(H * 0.03 * (0.85 + 0.3 * r()), 0.02, 0.5)
  const a0 = r() * 6.283
  const amp = 0.1 + 0.15 * r()
  const asym = (a: number) => 1 + amp * Math.cos(a - a0)
  const crown = (a: number, e: number, f: number): V3 => [Math.cos(a) * Math.cos(e) * rx * f * asym(a), cy + Math.sin(e) * ry * f, Math.sin(a) * Math.cos(e) * rx * f * asym(a)]

  // Fût (courbé par l'inclinaison de la plante) : pied évasé puis tronc.
  if (tier >= 1) {
    em.limb('trunk', [0, -0.04, 0], [0, trunkH * 0.35, 0], tr * 1.3, c.trunk)
    em.limb('trunk', [0, trunkH * 0.33, 0], [0, trunkH, 0], tr * 0.92, c.trunk)
  } else em.limb('branch', [0, 0, 0], [0, trunkH, 0], tr, c.trunk)

  // Charpentières puis rameaux (récursion limitée à 3 niveaux).
  const n1 = TIERED(tier, 2, 4, 4)
  const maxL = TIERED(tier, 1, 2, 3)
  const top: V3 = [0, trunkH, 0]
  const rl = rx * TIERED(tier, 0.55, 0.4, 0.33) * (fruit ? 0.9 : 1)
  const tips: V3[] = []
  for (let i = 0; i < n1; i++) {
    const a = a0 + (i / n1) * 6.283 + (r() - 0.5) * 0.8
    const e = (fruit ? 0.1 : 0.2) + 0.5 * r()
    const t1 = crown(a, e, maxL === 1 ? 0.62 : 0.5)
    // tirages toujours consommés, quel que soit le niveau : formes stables entre niveaux
    const j1 = r()
    const j2 = r()
    if (maxL === 1) {
      em.limb('branch', top, t1, tr * 0.55, c.trunk)
      tips.push(t1)
      continue
    }
    const mid: V3 = [top[0] + (t1[0] - top[0]) * 0.8, top[1] + (t1[1] - top[1]) * 0.8, top[2] + (t1[2] - top[2]) * 0.8]
    em.limb('branch', top, mid, tr * 0.6, c.trunk)
    for (let j = 0; j < 2; j++) {
      const a2 = a + (j ? 1 : -1) * (0.35 + 0.3 * j1)
      const e2 = e + (j2 - 0.4) * 0.5 + (j ? 0.1 : -0.05)
      const t2 = crown(a2, e2, 0.78)
      em.limb('branch', mid, t2, tr * 0.36, c.trunk)
      if (maxL === 3) {
        for (let k = 0; k < 2; k++) {
          const t3: V3 = [t2[0] + (r() - 0.5) * rl * 1.1, t2[1] + (r() - 0.2) * rl * 0.9, t2[2] + (r() - 0.5) * rl * 1.1]
          em.limb('branch', t2, t3, tr * 0.18, c.trunk)
          tips.push(t3)
        }
      } else tips.push(t2)
    }
  }

  // Feuillage : masse centrale + touffes aux extrémités (échelle -> 0 quand l'arbre est nu).
  const s = c.lf
  const vs = clamp(ry / rx, 0.55, 1.3) * 0.92
  const lumps: Lump[] = []
  const ca = tier === 0 ? 'clump' : 'blob'
  if (s > 0.04) {
    const cr = rx * (fruit ? 0.45 : 0.62) * s
    em.add(ca, 0, cy, 0, cr, cr * vs * 1.1, cr, c.shade(0.1), r() * 6.283)
    lumps.push({ x: 0, y: cy, z: 0, r: cr })
    for (const t of tips) {
      const rr = rl * s * (0.85 + 0.3 * r())
      em.add('clump', t[0], t[1], t[2], rr, rr * vs, rr, c.shade(0.14), r() * 6.283, (r() - 0.5) * 0.5, (r() - 0.5) * 0.5)
      lumps.push({ x: t[0], y: t[1], z: t[2], r: rr })
      if (tier === 2 && !c.look.ghost) {
        for (let k = 0; k < 2; k++) {
          const ox = (r() - 0.5) * rr * 1.5
          const oy = (r() - 0.2) * rr
          const oz = (r() - 0.5) * rr * 1.5
          const cs = rr * 0.95
          em.add('card', t[0] + ox, t[1] + oy, t[2] + oz, cs, cs, cs, c.shade(0.2), r() * 6.283, (r() - 0.5) * 0.8, (r() - 0.5) * 0.8)
        }
      }
    }
  }
  // Fleurs (autour des extrémités, même sans feuilles) et fruits.
  const nd = TIERED(tier, 4, 10, 22)
  const fr = clamp(S * 0.012 + 0.02, 0.025, 0.09)
  if (c.blossom && c.look.flower > 0.03) {
    const around = tips.map((t) => ({ x: t[0], y: t[1], z: t[2], r: rl * 0.75 }))
    dotsOn(c, [{ x: 0, y: cy, z: 0, r: rx * 0.5 }, ...around], nd + 4, fr * 0.8, c.blossom, c.look.flower)
  }
  if (c.accent && c.look.fruit > 0.03 && s > 0.3) dotsOn(c, lumps, nd, fr, c.accent, c.look.fruit, true)
}

// ---------- Conifère ----------

function conifer(c: Ctx) {
  const { em, r, H, S, tier } = c
  const rx = Math.max(0.05, S / 2)
  const n = TIERED(tier, 1, 3, 5)
  em.limb('branch', [0, 0, 0], [0, H * 0.4, 0], clamp(H * 0.02, 0.02, 0.3), c.trunk)
  const s = Math.max(0.55, c.lf)
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : i / (n - 1)
    const y0 = H * (n === 1 ? 0.08 : 0.06 + 0.5 * t)
    const hc = n === 1 ? H * 0.92 : H * (0.5 - 0.1 * t) + (i === n - 1 ? H * 0.06 : 0)
    const rb = rx * (n === 1 ? 1 : 1 - 0.7 * t) * s * (0.95 + 0.1 * r())
    em.add('cone', (r() - 0.5) * rx * 0.08, y0, (r() - 0.5) * rx * 0.08, rb, Math.min(hc, H - y0), rb, lerpColor(c.shade(0.1), new THREE.Color('#2f4a35'), 0.25), r() * 6.283)
  }
}

// ---------- Arbuste buissonnant (rosier, groseillier, etc.) ----------

function shrub(c: Ctx) {
  const { em, r, H, S, tier } = c
  const rx = Math.max(0.04, S / 2)
  const n = TIERED(tier, 2, 5, 8)
  const thick = clamp(H * 0.014, 0.006, 0.04)
  const a0 = r() * 6.283
  const rl = rx * TIERED(tier, 0.62, 0.42, 0.34)
  const vs = clamp(H / (2 * rx), 0.5, 1.4) * 0.85
  const lumps: Lump[] = []
  const s = c.lf
  const tops: V3[] = []
  for (let i = 0; i < n; i++) {
    const a = a0 + (i / n) * 6.283 + (r() - 0.5) * 0.6
    const top: V3 = [Math.cos(a) * rx * (0.4 + 0.3 * r()), H * (0.7 + 0.3 * r()), Math.sin(a) * rx * (0.4 + 0.3 * r())]
    em.limb('branch', [Math.cos(a) * rx * 0.1, 0, Math.sin(a) * rx * 0.1], top, thick, c.trunk)
    tops.push(top)
    r()
  }
  if (s > 0.04) {
    const cr = rx * 0.7 * s
    em.add(tier === 0 ? 'clump' : 'blob', 0, H * 0.45, 0, cr, H * 0.4 * s, cr, c.shade(0.1), r() * 6.283)
    lumps.push({ x: 0, y: H * 0.45, z: 0, r: Math.max(cr, H * 0.42 * s) * 0.9 })
    const count = TIERED(tier, 2, n, n + 2)
    for (let i = 0; i < count; i++) {
      const t = tops[i % tops.length]
      const mid = i >= tops.length
      const x = t[0] * (mid ? 1.15 : 1)
      const y = mid ? H * 0.35 : t[1] * 0.92
      const z = t[2] * (mid ? 1.15 : 1)
      const rr = rl * s * (0.85 + 0.3 * r())
      em.add('clump', x, y, z, rr, rr * vs, rr, c.shade(0.14), r() * 6.283, (r() - 0.5) * 0.5, (r() - 0.5) * 0.5)
      lumps.push({ x, y, z, r: rr })
      if (tier === 2 && !c.look.ghost) em.add('card', x + (r() - 0.5) * rr, y + rr * 0.3, z + (r() - 0.5) * rr, rr * 0.9, rr * 0.9, rr * 0.9, c.shade(0.2), r() * 6.283, (r() - 0.5) * 0.8, 0)
    }
  }
  const size = clamp(S * 0.035, 0.02, 0.07)
  const nd = TIERED(tier, 5, 12, 24)
  if (c.accent && c.look.flower > 0.03) dotsOn(c, lumps, nd, size * 1.15, c.accent, c.look.flower)
  if (c.accent && c.look.fruit > 0.03) dotsOn(c, lumps, nd, size, c.accent, c.look.fruit, true)
}

// ---------- Haie taillée ----------

function hedge(c: Ctx) {
  const { em, r, H, S, tier } = c
  const n = TIERED(tier, 3, 6, 10)
  const w = Math.max(0.2, S)
  const d = Math.max(0.2, S * 0.72)
  for (let i = 0; i < n; i++) {
    const x = ((i + 0.5) / n - 0.5) * w * 0.8
    const z = (r() - 0.5) * d * 0.4
    em.limb('branch', [x, 0, z], [x + (r() - 0.5) * 0.1 * H, H * (0.82 + 0.18 * r()), z], clamp(H * 0.012, 0.006, 0.03), c.trunk)
  }
  const s = c.lf
  if (s <= 0.04) return
  em.add('box', 0, 0, 0, w * (0.55 + 0.45 * s), H * (0.45 + 0.55 * s) * 0.97, d * (0.55 + 0.45 * s), c.shade(0.06), (r() - 0.5) * 0.12)
  const lumps: Lump[] = []
  const k = TIERED(tier, 0, 3, 6)
  for (let i = 0; i < k; i++) {
    const x = ((i + 0.5) / k - 0.5) * w * 0.8
    const rr = Math.min(w, d) * 0.3 * s
    em.add('clump', x, H * 0.95, (r() - 0.5) * d * 0.5, rr, rr * 0.6, rr, c.shade(0.14), r() * 6.283)
    lumps.push({ x, y: H * 0.95, z: 0, r: rr })
    if (tier === 2 && !c.look.ghost) em.add('card', x, H * 0.98, (r() - 0.5) * d * 0.5, rr, rr, rr, c.shade(0.2), r() * 6.283, 0.4, 0)
  }
  const size = clamp(S * 0.03, 0.02, 0.06)
  if (c.accent && c.look.flower > 0.03) dotsOn(c, [{ x: 0, y: H * 0.5, z: d * 0.5, r: Math.max(w, H) * 0.35 }, ...lumps], TIERED(tier, 5, 10, 18), size, c.accent, c.look.flower)
  if (c.accent && c.look.fruit > 0.03) dotsOn(c, [{ x: 0, y: H * 0.55, z: d * 0.5, r: Math.max(w, H) * 0.35 }, ...lumps], TIERED(tier, 5, 10, 18), size, c.accent, c.look.fruit)
}

// ---------- Vivace en touffe et graminée ----------

function tufted(c: Ctx, grass: boolean) {
  const { em, r, H, S, tier } = c
  const n = TIERED(tier, 2, 4, 7)
  const dormant = c.look.dead ? 0.3 : 0.18 + 0.82 * c.lf
  const tall = c.look.adultH > 0.9 && !grass
  const rad = Math.max(0.04, S / 2)
  const w = rad * (grass ? 0.9 : 1.0) * (n > 3 ? 0.8 : 1)
  const tops: Lump[] = []
  for (let i = 0; i < n; i++) {
    const a = r() * 6.283
    const d = rad * 0.45 * Math.sqrt(r())
    const hh = (tall ? H * 0.5 : H) * (0.72 + 0.28 * r()) * dormant
    const x = Math.cos(a) * d
    const z = Math.sin(a) * d
    em.add('tuft', x, 0, z, w, Math.max(0.02, hh), w, c.shade(0.16), r() * 6.283, (r() - 0.5) * 0.25, (r() - 0.5) * 0.25)
    tops.push({ x, y: Math.max(0.02, hh) * 0.95, z, r: 0.01 })
  }
  const fl = c.look.flower
  const heads = grass ? c.accent ?? STRAW : c.accent
  if (!heads || c.look.dead) return
  const hs = clamp(S * (grass ? 0.08 : 0.07), 0.015, 0.05)
  const ns = TIERED(tier, 2, 4, 8)
  if (fl > 0.04 || (grass && c.look.fruit > 0.04)) {
    const inten = Math.max(fl, grass ? c.look.fruit : 0)
    for (let i = 0; i < ns; i++) {
      const a = r() * 6.283
      const d = rad * 0.55 * Math.sqrt(r())
      const x = Math.cos(a) * d
      const z = Math.sin(a) * d
      const top = H * (0.85 + 0.15 * r()) * (0.4 + 0.6 * dormant)
      if (tall || grass) em.limb('branch', [x, 0, z], [x, top, z], 0.008 + hs * 0.08, c.shade(0.1).multiplyScalar(0.8))
      const sz = hs * (0.35 + 0.65 * inten)
      if (grass) em.add('dot', x, top, z, sz * 0.7, sz * 2.2, sz * 0.7, heads.clone().offsetHSL(0, 0, (r() - 0.5) * 0.1))
      else em.add('dot', x, tall ? top : Math.max(0.05, H * 0.85 * dormant), z, sz * 0.8, sz * 1.5, sz * 0.8, heads.clone().offsetHSL(0, (r() - 0.5) * 0.08, (r() - 0.5) * 0.12))
    }
  }
}

// ---------- Grimpante palissée ----------

function climber(c: Ctx) {
  const { em, r, H, S, tier } = c
  const wSup = clamp(S, 0.45, 2.4)
  const supH = clamp(c.look.adultH * 0.85, 0.9, 3)
  // Support : deux poteaux, une traverse et des fils.
  for (const sgn of [-1, 1]) em.limb('trunk', [sgn * wSup * 0.5, 0, 0], [sgn * wSup * 0.5, supH, 0], 0.035, WOOD)
  em.limb('branch', [-wSup * 0.5, supH, 0], [wSup * 0.5, supH, 0], 0.02, WOOD)
  if (tier >= 1) for (const f of [0.4, 0.7]) em.limb('branch', [-wSup * 0.5, supH * f, 0], [wSup * 0.5, supH * f, 0], 0.006, WIRE)
  // Tige principale sinueuse.
  const stemTop = Math.min(H, supH) * 0.95
  const segs = TIERED(tier, 1, 2, 3)
  let prev: V3 = [0, 0, 0.02]
  for (let i = 1; i <= segs; i++) {
    const p: V3 = [(r() - 0.5) * wSup * 0.4, (stemTop * i) / segs, 0.03]
    em.limb('branch', prev, p, 0.016, c.trunk)
    prev = p
  }
  const s = c.lf
  if (s <= 0.04) return
  const n = TIERED(tier, 3, 7, 12)
  const lumps: Lump[] = []
  const rl = clamp((Math.min(S, wSup * 1.1) / Math.sqrt(n)) * 0.75, 0.05, 0.36)
  for (let i = 0; i < n; i++) {
    const x = ((i + 0.5) / n - 0.5) * wSup * 0.95 + (r() - 0.5) * 0.1
    const y = Math.max(rl * 0.5, H * (0.12 + 0.82 * r())) * 0.97
    const rr = rl * s * (0.85 + 0.3 * r())
    em.add('clump', x, y, (r() - 0.5) * 0.12, rr, rr * 0.9, rr * 0.8, c.shade(0.14), r() * 6.283)
    lumps.push({ x, y, z: 0, r: rr })
    if (tier === 2 && !c.look.ghost) em.add('card', x + (r() - 0.5) * rr, y + rr * 0.3, 0.08, rr * 0.9, rr * 0.9, rr * 0.9, c.shade(0.2), r() * 6.283, 0, 0)
  }
  const size = clamp(S * 0.02 + 0.025, 0.025, 0.06)
  const nd = TIERED(tier, 4, 8, 14)
  if (c.accent && c.look.flower > 0.03) dotsOn(c, lumps, nd, size, c.accent, c.look.flower)
  if (c.accent && c.look.fruit > 0.03) dotsOn(c, lumps, nd, size * 1.2, c.accent, c.look.fruit, true)
}

// ---------- Potager : butte et petits plants en rang ----------

function veg(c: Ctx) {
  const { em, r, H, S, tier } = c
  const tall = c.look.adultH > 0.9
  const len = Math.max(0.45, S * 1.4)
  const wid = Math.max(0.3, Math.min(0.9, S * 1.1))
  em.add('box', 0, -0.02, 0, len, 0.1, wid, SOIL.clone().offsetHSL(0, 0, (c.r() - 0.5) * 0.04), (c.r() - 0.5) * 0.2)
  const n = tall ? TIERED(tier, 1, 2, 3) : TIERED(tier, 1, 3, 5)
  const s = c.look.dead ? 0.3 : 0.12 + 0.88 * c.lf
  const lumps: Lump[] = []
  const rad = Math.max(0.03, (S * 0.5) / Math.sqrt(n)) * (n === 1 ? 1.15 : 1.3)
  for (let i = 0; i < n; i++) {
    const x = n === 1 ? 0 : ((i + 0.5) / n - 0.5) * len * 0.85
    const z = (r() - 0.5) * wid * 0.25
    const hh = Math.max(0.03, H * s * (0.85 + 0.15 * r()))
    if (c.look.root) em.add('tuft', x, 0.03, z, rad * 1.1, hh, rad * 1.1, c.shade(0.14), r() * 6.283)
    else {
      em.add('clump', x, 0.03 + hh * 0.5, z, rad, hh * 0.5, rad, c.shade(0.14), r() * 6.283, (r() - 0.5) * 0.3, (r() - 0.5) * 0.3)
      lumps.push({ x, y: 0.03 + hh * 0.5, z, r: Math.max(rad, hh * 0.5) * 0.9 })
    }
    if (tall) em.limb('branch', [x, 0, z + rad * 0.3], [x, H * 1.02, z + rad * 0.3], 0.012, c.look.dead ? DEAD : WOOD)
  }
  const size = clamp(S * 0.06, 0.02, 0.07)
  if (c.accent && lumps.length) {
    dotsOn(c, lumps, TIERED(tier, 3, 6, 10), size * 0.8, c.accent, c.look.flower)
    dotsOn(c, lumps, TIERED(tier, 3, 6, 10), size * 1.2, c.accent, c.look.fruit, true)
  }
}

// ---------- Couvre-sol ----------

function ground(c: Ctx) {
  const { em, r, H, S, tier } = c
  const rad = Math.max(0.05, S / 2)
  const h = clamp(H, 0.04, 0.5)
  const s = c.look.dead ? 0.3 : 0.2 + 0.8 * c.lf
  em.add('cyl', 0, 0, 0, rad * 0.88, Math.max(0.01, h * 0.25 * s), rad * 0.88, c.shade(0.08).multiplyScalar(0.75))
  const n = TIERED(tier, 2, 5, 9)
  const lumps: Lump[] = []
  for (let i = 0; i < n; i++) {
    const a = r() * 6.283
    const d = rad * 0.65 * Math.sqrt(r())
    const rr = Math.max(0.04, rad * (n < 4 ? 0.55 : 0.4)) * (0.85 + 0.3 * r())
    const x = Math.cos(a) * d
    const z = Math.sin(a) * d
    em.add('clump', x, h * 0.35 * s, z, rr, Math.max(0.02, h * 0.45 * s), rr, c.shade(0.14), r() * 6.283)
    lumps.push({ x, y: h * 0.35 * s, z, r: Math.max(rr, h * 0.45) * 0.9 })
  }
  if (tier >= 1) {
    const k = TIERED(tier, 0, 2, 4)
    for (let i = 0; i < k; i++) {
      const a = r() * 6.283
      const d = rad * 0.6 * Math.sqrt(r())
      em.add('tuft', Math.cos(a) * d, 0, Math.sin(a) * d, rad * 0.3, Math.max(0.03, h * s), rad * 0.3, c.shade(0.16), r() * 6.283)
    }
  }
  const size = clamp(S * 0.045, 0.02, 0.12)
  dotsOn(c, lumps, TIERED(tier, 3, 6, 10), size * 0.7, c.accent, c.look.flower)
  dotsOn(c, lumps, TIERED(tier, 2, 4, 6), size * 1.3, c.accent, c.look.fruit)
}

// ---------- Point d'entrée ----------

/** Les ligneux perdent leurs feuilles ; les autres se réduisent. */
const WOODY: ReadonlySet<Archetype> = new Set(['tree', 'fruit', 'conifer', 'shrub', 'hedge', 'climber', 'generic'])

/**
 * Pièces d'une plante à l'origine `origin` (monde). `tier` : niveau de détail (0 simple, 1 moyen, 2 détaillé).
 * Déterministe : identique pour un même identifiant, des mêmes dimensions et un même niveau.
 */
export function generatePlant(look: PlantLook, tier: GenTier, origin: V3): PlantPart[] {
  const seed = hash(look.id)
  const r = rng(seed)
  const effTier = (look.ghost ? Math.min(tier, 1) : tier) as GenTier
  // Variation propre à la plante (tirages dans un ordre fixe).
  const nuance = look.foliage.clone().offsetHSL((r() - 0.5) * 0.03, (r() - 0.5) * 0.1, (r() - 0.5) * 0.08)
  const autumn = AUTUMN[Math.floor(r() * AUTUMN.length) % AUTUMN.length]
  const lean = clamp(look.H * 0.05, 0.02, 0.8)
  const lx = (r() - 0.5) * 2 * lean * (look.archetype === 'conifer' ? 0.2 : 1)
  const lz = (r() - 0.5) * 2 * lean * (look.archetype === 'conifer' ? 0.2 : 1)
  const yaw = r() * 6.283
  const woody = WOODY.has(look.archetype)
  const href = Math.max(0.3, look.H)

  let foliage = lerpColor(nuance, autumn, look.tint)
  if (look.sick) foliage = lerpColor(foliage, SICK, 0.5 * (1 - look.vigor) + 0.25)
  if (look.dead) foliage = look.archetype === 'tree' || woody ? DEAD.clone() : DEAD_HERB.clone()
  const trunk = look.dead ? DEAD.clone().multiplyScalar(0.8) : TRUNK.clone().offsetHSL(0, 0, (r() - 0.5) * 0.06)
  const accent = look.accent
  // Fleurs d'arbres fruitiers / arbustes : teinte claire de la couleur d'accent.
  const blossom = accent ? lerpColor(accent, WHITE, look.archetype === 'fruit' ? 0.6 : 0.15) : undefined

  const em = new Emitter(look.id, look.ghost, origin, yaw, [lx, lz], href)
  // Feuillage : 0 pour un ligneux mort, sinon échelle lissée (bourgeons -> plein) réduite par la maladie.
  const lf = look.dead && woody ? 0 : smooth(0.06, 0.9, look.leaf) * (0.6 + 0.4 * look.vigor)
  const c: Ctx = {
    em,
    r,
    rd: rng(seed + 0.3719 - Math.floor(seed + 0.3719)),
    look,
    tier: effTier,
    H: Math.max(0.03, look.H),
    S: Math.max(0.06, look.S),
    lf: look.dead && !woody ? 0.3 : lf,
    foliage,
    trunk,
    accent,
    blossom,
    shade: (amount = 0.12) => foliage.clone().offsetHSL((r() - 0.5) * 0.02, (r() - 0.5) * 0.08, (r() - 0.5) * amount),
  }
  switch (look.archetype) {
    case 'tree':
      broadleaf(c, false)
      break
    case 'fruit':
      broadleaf(c, true)
      break
    case 'conifer':
      conifer(c)
      break
    case 'hedge':
      hedge(c)
      break
    case 'perennial':
      tufted(c, false)
      break
    case 'grass':
      tufted(c, true)
      break
    case 'climber':
      climber(c)
      break
    case 'veg':
      veg(c)
      break
    case 'ground':
      ground(c)
      break
    default:
      shrub(c)
  }
  return em.parts
}

import type { Plant, Species, Strate } from '../types'

/**
 * Âge de la plante (années, décimal) à une date donnée.
 * Date de plantation ou date de référence invalide : 0 an (jamais NaN).
 */
export function plantAgeYears(plant: Plant, at: Date): number {
  const planted = localDate(plant.plantedAt).getTime()
  const now = at.getTime()
  if (!Number.isFinite(planted) || !Number.isFinite(now)) return 0
  const years = Math.max(0, (now - planted) / (365.25 * 86400000))
  const bought = Number.isFinite(plant.ageAtPlanting) ? Math.max(0, plant.ageAtPlanting ?? 0) : 0
  return years + bought
}

const clamp = (n: number, lo: number, hi: number) => (Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : lo)
const finite = (n: unknown, fallback: number) => (typeof n === 'number' && Number.isFinite(n) ? n : fallback)

/** Maturité d'une annuelle (années) : ~110 jours du semis à la taille adulte. */
const ANNUAL_MATURITY = 0.3
/** Fraction de la taille adulte au départ (plant « à l'achat »). */
const START_FRACTION = 0.12

const logistic = (t: number) => 1 / (1 + Math.exp(-5 * (t - 0.42)))

/**
 * Courbe de croissance douce 0..1 : 0 à t = 0, ≈ 0,95 à la maturité, ~1 au-delà (atteint à 2 × la maturité).
 * Lente au départ (installation), rapide au milieu, lente à l'approche de la taille adulte.
 * Monotone ; maturité invalide ou nulle : 1 an.
 */
export function growthCurve01(ageYears: number, maturityYears: number): number {
  const m = Number.isFinite(maturityYears) && maturityYears > 0 ? maturityYears : 1
  const a = Number.isFinite(ageYears) ? Math.max(0, ageYears) : 0
  const t = Math.min(2, a / m)
  const l0 = logistic(0)
  return clamp((logistic(t) - l0) / (logistic(2) - l0), 0, 1)
}

function maturityOf(species: Species): number {
  if (!species.vivace) return ANNUAL_MATURITY
  const y = finite(species.anneesMaturite, 1)
  return Math.max(1, y)
}

/** Taille sans recalage sur les mesures, pour un âge donné. */
function rawSizeForAge(species: Species, age: number): { heightM: number; spreadM: number } {
  const c = growthCurve01(age, maturityOf(species))
  const k = START_FRACTION + (1 - START_FRACTION) * c
  return { heightM: Math.max(0, finite(species.hauteurAdulteM, 0)) * k, spreadM: Math.max(0, finite(species.envergureAdulteM, 0)) * k }
}

/** « 2025-03-10 » -> minuit en heure locale ; sinon Date standard. NaN si invalide. */
function localDate(s: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(s)
}

/**
 * Recale la courbe de l'espèce sur les mesures saisies : facteur multiplicatif (hauteur, envergure) borné à [0,3 ; 3].
 * Moyenne géométrique des écarts mesure / modèle, pondérée vers les mesures récentes. Sans mesure : 1.
 */
export function fitMeasurements(plant: Plant, species: Species | undefined): { scaleHeight: number; scaleSpread: number } {
  const none = { scaleHeight: 1, scaleSpread: 1 }
  const list = plant.measurements
  if (!species || !Array.isArray(list) || list.length === 0) return none
  const pts = list
    .map((m) => ({ m, t: localDate(m?.at).getTime() }))
    .filter((x) => Number.isFinite(x.t))
    .sort((a, b) => a.t - b.t)
  if (pts.length === 0) return none
  const latest = pts[pts.length - 1].t
  const fit = (pick: (m: { heightM?: number; spreadM?: number }) => number | undefined, pickModel: (s: { heightM: number; spreadM: number }) => number): number => {
    let sumW = 0
    let sumLog = 0
    for (const { m, t } of pts) {
      const v = pick(m)
      if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) continue
      const model = pickModel(rawSizeForAge(species, plantAgeYears(plant, new Date(t))))
      if (!(model > 0.005)) continue
      const ratio = clamp(v / model, 0.3, 3)
      const w = 1 / (1 + (latest - t) / (365.25 * 86400000)) // une mesure vieille d'un an pèse moitié moins
      sumW += w
      sumLog += w * Math.log(ratio)
    }
    return sumW > 0 ? clamp(Math.exp(sumLog / sumW), 0.3, 3) : 1
  }
  return {
    scaleHeight: fit((m) => m.heightM, (s) => s.heightM),
    scaleSpread: fit((m) => m.spreadM, (s) => s.spreadM),
  }
}

/**
 * Taille estimée (hauteur, envergure en m) : courbe en S vers la taille adulte, recalée sur les mesures saisies.
 * Les annuelles suivent la saison (0 → adulte en ~4 mois).
 */
export function plantSizeAt(plant: Plant, species: Species, at: Date): { heightM: number; spreadM: number } {
  const raw = rawSizeForAge(species, plantAgeYears(plant, at))
  const { scaleHeight, scaleSpread } = fitMeasurements(plant, species)
  return { heightM: raw.heightM * scaleHeight, spreadM: raw.spreadM * scaleSpread }
}

// ---------- État complet à une date ----------

export type GrowthStage = 'semis' | 'jeune' | 'croissance' | 'mature' | 'ancien'

export interface PlantState {
  ageYears: number
  stage: GrowthStage
  heightM: number
  spreadM: number
  /** 0..1 fraction du feuillage présent (caducs : 0 en hiver, bourgeons au printemps ; persistants ~1) */
  leafCover: number
  /** 0..1 intensité de floraison à la date */
  flowering: number
  /** 0..1 fruits/récolte visibles */
  fruiting: number
  /** 0..1 teinte d'automne */
  autumnTint: number
  /** 0..1 vigueur (malade/morte : 0 pour morte) */
  vigor: number
  dead: boolean
}

type Nodes = ReadonlyArray<readonly [number, number]>

/** Interpolation linéaire par morceaux ; `pos` = position dans l'année en mois (0 = 1er janvier, 12 = fin décembre). */
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

/** Position dans l'année en mois décimaux d'après la date locale (29 février compris). */
function yearPos(d: Date): number {
  const y = d.getFullYear()
  const mo = d.getMonth()
  const dim = new Date(y, mo + 1, 0).getDate()
  return mo + (d.getDate() - 1) / dim
}

// Feuillage caduc : bourgeons début avril, plein en mai, jaunissement en octobre, nu fin novembre.
const LEAF_DECIDUOUS: Nodes = [[0, 0], [2.95, 0], [3.5, 0.35], [4.3, 1], [9.8, 1], [10, 0.85], [10.8, 0.1], [11.1, 0], [12, 0]]
// Vivaces herbacées : la touffe se réduit l'hiver sans disparaître.
const LEAF_HERB: Nodes = [[0, 0.1], [2.5, 0.1], [3.5, 0.5], [4.5, 1], [10, 0.9], [11, 0.3], [11.5, 0.1], [12, 0.1]]
const TINT: Nodes = [[0, 0], [8.9, 0], [9.6, 0.8], [10.3, 1], [10.9, 0.5], [11.2, 0], [12, 0]]
// Floraison : [mois début, pic, fin] en position d'année.
const BLOOM_EARLY: Nodes = [[0, 0], [1.8, 0], [2.4, 1], [3, 0.5], [3.4, 0], [12, 0]] // amandier, abricotier, pêcher…
const BLOOM_SPRING: Nodes = [[0, 0], [3.3, 0], [3.9, 1], [4.6, 0.7], [5.1, 0], [12, 0]] // fruitiers, arbres
const BLOOM_SUMMER: Nodes = [[0, 0], [4.8, 0], [5.8, 0.8], [6.8, 1], [8.3, 0.7], [9.2, 0], [12, 0]] // fleurs, aromatiques, vivaces
const EARLY_BLOOMERS: ReadonlySet<string> = new Set(['amandier', 'abricotier', 'pecher', 'noisetier', 'cornouiller-male'])
const EVERGREEN_IDS: ReadonlySet<string> = new Set(['olivier', 'laurier-sauce', 'romarin', 'thym', 'lavande', 'sauge', 'hysope', 'eleagnus', 'trefle-blanc', 'myrtillier-persistant'])
const EVERGREEN_TEXT = /persistant|toujours vert|sempervirent/i

const LIFESPAN: Record<Strate, number> = { canopee: 80, 'arbre-bas': 40, arbuste: 25, herbacee: 12, 'couvre-sol': 12, grimpante: 30, racine: 10 }
const WOODY: ReadonlySet<Strate> = new Set<Strate>(['canopee', 'arbre-bas', 'arbuste', 'grimpante'])

function isEvergreen(sp: Species): boolean {
  if (EVERGREEN_IDS.has(sp.id)) return true
  return EVERGREEN_TEXT.test([...(sp.fonctions ?? []), sp.entretien ?? ''].join(' '))
}

const smooth = (x: number) => {
  const t = clamp(x, 0, 1)
  return t * t * (3 - 2 * t)
}

/** Récolte visible (0..1) à la position `pos` d'après les mois de récolte : fruits verts 1,5 mois avant, pleins pendant, chute après. */
function harvestVisible(months: readonly number[], pos: number): number {
  let best = 0
  for (const r of months) {
    if (!Number.isInteger(r) || r < 1 || r > 12) continue
    const start = r - 1
    for (const off of [-12, 0, 12]) {
      const p = pos + off
      let v = 0
      if (p >= start && p < start + 1) v = 1
      else if (p >= start - 1.5 && p < start) v = 0.15 + 0.35 * ((p - (start - 1.5)) / 1.5)
      else if (p >= start + 1 && p < start + 1.3) v = 1 - (p - (start + 1)) / 0.3
      best = Math.max(best, v)
    }
  }
  return best
}

function stageOf(species: Species, age: number): GrowthStage {
  if (!species.vivace) {
    if (age < 0.05) return 'semis'
    if (age < 0.15) return 'jeune'
    if (age < 0.3) return 'croissance'
    if (age <= 0.6) return 'mature'
    return 'ancien'
  }
  const m = maturityOf(species)
  const ratio = age / m
  if (ratio < 0.08) return 'semis'
  if (ratio < 0.3) return 'jeune'
  if (ratio < 0.85) return 'croissance'
  if (age > LIFESPAN[species.strate] ) return 'ancien'
  return 'mature'
}

/** Espèce inconnue : arbuste caduc générique. */
const FALLBACK: Species = {
  id: '?', nomCommun: '', nomLatin: '', famille: '', categorie: 'haie', strate: 'arbuste', vivace: true, comestible: false, soleil: ['plein-soleil'],
  eau: 'moyen', rusticiteC: -15, hauteurAdulteM: 1.5, envergureAdulteM: 1.5, anneesMaturite: 4, espacementCm: 150, compagnons: [], antagonistes: [],
  taches: [], entretien: '', couleur: '#4a7',
}

/**
 * État complet d'une plante à une date : âge, stade, taille (recalée sur les mesures), feuillage, floraison, fruits, teinte, vigueur.
 * Hémisphère nord ; les mois viennent de la date locale. Toutes les valeurs sont finies (jamais NaN).
 * « projet » : pas encore planté, taille « à l'achat », ni fleurs ni fruits. « mort » : dead, vigueur 0, rien de vivant.
 */
export function plantStateAt(plant: Plant, species: Species | undefined, at: Date): PlantState {
  const sp = species ?? FALLBACK
  const validAt = Number.isFinite(at.getTime())
  const pos = validAt ? yearPos(at) : 6.5
  const planned = plant.status === 'projet'
  const dead = plant.status === 'mort'
  const bought = Number.isFinite(plant.ageAtPlanting) ? Math.max(0, plant.ageAtPlanting ?? 0) : 0
  const age = planned ? bought : plantAgeYears(plant, at)
  const stage = stageOf(sp, age)

  const raw = rawSizeForAge(sp, age)
  const scales = planned ? { scaleHeight: 1, scaleSpread: 1 } : fitMeasurements(plant, species)
  const heightM = raw.heightM * scales.scaleHeight
  const spreadM = raw.spreadM * scales.scaleSpread

  let leaf: number
  let tint = 0
  let flower = 0
  let fruit = 0
  const recolte = sp.recolte ?? []
  const fruitCapable = sp.strate !== 'racine'

  if (!sp.vivace) {
    // Annuelle : cycle court semis -> récolte -> fin de saison (≈ 0,45 à 0,65 an après le semis).
    const c = growthCurve01(age, ANNUAL_MATURITY)
    const senescence = smooth((age - 0.45) / 0.2)
    leaf = (0.1 + 0.9 * c) * (1 - senescence)
    tint = 0.5 * senescence * (1 - smooth((age - 0.65) / 0.2))
    const bloomPhase = interp([[0, 0], [0.15, 0], [0.3, 1], [0.5, 0.6], [0.65, 0], [10, 0]], age)
    flower = bloomPhase * (sp.categorie === 'fleur' || sp.categorie === 'engrais-vert' ? 1 : 0.6)
    const inHarvestWindow = age >= 0.25 && age <= 0.65 ? 1 : 0
    const seasonal = recolte.length > 0 ? harvestVisible(recolte, pos) : age >= 0.33 && age <= 0.65 ? 1 : 0
    fruit = fruitCapable ? seasonal * inHarvestWindow : 0
  } else {
    const woody = WOODY.has(sp.strate)
    const evergreen = isEvergreen(sp)
    if (evergreen) {
      leaf = 0.9 + 0.1 * interp(LEAF_DECIDUOUS, pos)
    } else if (woody) {
      leaf = interp(LEAF_DECIDUOUS, pos)
      tint = interp(TINT, pos)
    } else {
      leaf = interp(LEAF_HERB, pos)
      tint = 0.4 * interp(TINT, pos)
    }
    const ratio = age / maturityOf(sp)
    const fertile = woody ? smooth((ratio - 0.25) / 0.45) : smooth((ratio - 0.1) / 0.4)
    const bloom = EARLY_BLOOMERS.has(sp.id)
      ? BLOOM_EARLY
      : woody && (sp.categorie === 'fruitier' || sp.categorie === 'arbre' || sp.categorie === 'haie' || sp.categorie === 'petit-fruit')
        ? BLOOM_SPRING
        : BLOOM_SUMMER
    flower = interp(bloom, pos) * fertile
    fruit = fruitCapable && recolte.length > 0 ? harvestVisible(recolte, pos) * fertile : 0
  }

  // Feuillage minimal d'un jeune plant : jamais plus que ce que la taille permet.
  let vigor = 1
  if (!sp.vivace) vigor = 1 - 0.7 * smooth((age - 0.45) / 0.2)
  if (plant.status === 'malade') {
    vigor *= 0.5
    leaf *= 0.7
    flower *= 0.5
    fruit *= 0.4
  }
  if (planned) {
    flower = 0
    fruit = 0
  }
  if (dead) {
    return { ageYears: finite(age, 0), stage, heightM, spreadM, leafCover: 0, flowering: 0, fruiting: 0, autumnTint: 0, vigor: 0, dead: true }
  }
  return {
    ageYears: finite(age, 0),
    stage,
    heightM: finite(heightM, 0),
    spreadM: finite(spreadM, 0),
    leafCover: clamp(leaf, 0, 1),
    flowering: clamp(flower, 0, 1),
    fruiting: clamp(fruit, 0, 1),
    autumnTint: clamp(tint, 0, 1),
    vigor: clamp(vigor, 0, 1),
    dead: false,
  }
}

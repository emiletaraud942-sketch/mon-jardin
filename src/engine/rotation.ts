// Rotation des cultures du potager : ne pas remettre la même famille de légumes au même endroit trop tôt.
// Module pur : les espèces arrivent en paramètre, rien n'est stocké (zones et dates sont recalculées à chaque appel).
// Conseils généraux, jamais une promesse : le texte dit toujours « souvent ».
import type { Garden, Plant, Species, XY } from '../types'
import { localDate } from './growth'
import { annualHarvestEnd, isAnnualSpecies } from './tasks'

// ---------- Familles ----------

export type FamilyId =
  | 'solanacees'
  | 'cucurbitacees'
  | 'brassicacees'
  | 'apiacees'
  | 'fabacees'
  | 'asteracees'
  | 'alliacees'
  | 'chenopodiacees'
  | 'poacees'
  | 'rosacees'
  | 'lamiacees'
  | 'autres'

/** Place dans le cycle classique : feuilles, puis fruits, puis racines, puis pois et haricots. */
export type CropGroup = 'feuilles' | 'fruits' | 'racines' | 'legumineuses'

export interface FamilyInfo {
  id: FamilyId
  /** Nom de la famille (celui des fiches, au pluriel). */
  label: string
  /** La famille en mots simples. */
  simple: string
  /** Quelques légumes de la famille, ceux qu'un novice reconnaît (jamais plus de 4). */
  examples: string[]
  /**
   * Années d'attente avant de remettre la même famille au même endroit. Valeurs courantes des guides de jardinage
   * français, volontairement simples (« souvent N ans ») ; 0 = pas de règle connue, rien n'est dit.
   * - Brassicacées 4 : la hernie du chou reste longtemps dans le sol (souvent 4 ans, parfois plus).
   * - Solanacées 3 : mildiou, nématodes et maladies de la pomme de terre et de la tomate (souvent 3 à 4 ans).
   * - Apiacées 3 : carotte, panais, céleri partagent mouche et maladies (souvent 3 à 4 ans).
   * - Cucurbitacées 3 : oïdium et fusariose, souvent 2 à 3 ans : on prend le plus prudent.
   * - Alliacées 3 : rouille, pourriture blanche et mouche de l'oignon (souvent 2 à 3 ans, on prend 3).
   * - Chénopodiacées 3 : betterave, épinard, blette partagent les mêmes maladies (souvent 3 ans).
   * - Fabacées 2 et Astéracées 2 : pression plus faible (souvent 2 ans).
   * - Poacées 2 : maïs, souvent 2 ans.
   * - Rosacées 3 : « fatigue du sol » des arbres fruitiers et du fraisier ; sans effet ici (aucune annuelle).
   * - Lamiacées et autres 0 : basilic, menthe… pas de règle connue.
   */
  years: number
  group?: CropGroup
}

const FAMILIES: FamilyInfo[] = [
  { id: 'solanacees', label: 'Solanacées', simple: 'la famille de la tomate', examples: ['tomate', 'pomme de terre', 'aubergine', 'poivron'], years: 3, group: 'fruits' },
  { id: 'cucurbitacees', label: 'Cucurbitacées', simple: 'la famille de la courge', examples: ['courgette', 'courge', 'concombre', 'melon'], years: 3, group: 'fruits' },
  { id: 'brassicacees', label: 'Brassicacées', simple: 'la famille du chou', examples: ['chou', 'radis', 'navet', 'roquette'], years: 4, group: 'feuilles' },
  { id: 'apiacees', label: 'Apiacées', simple: 'la famille de la carotte', examples: ['carotte', 'panais', 'céleri', 'persil'], years: 3, group: 'racines' },
  { id: 'fabacees', label: 'Fabacées', simple: 'la famille du pois', examples: ['pois', 'haricot', 'fève'], years: 2, group: 'legumineuses' },
  { id: 'asteracees', label: 'Astéracées', simple: 'la famille de la laitue', examples: ['laitue', 'chicorée', 'salsifis'], years: 2, group: 'feuilles' },
  { id: 'alliacees', label: 'Liliacées et Alliacées', simple: 'la famille de l’oignon', examples: ['oignon', 'ail', 'poireau', 'échalote'], years: 3, group: 'racines' },
  { id: 'chenopodiacees', label: 'Chénopodiacées', simple: 'la famille de la betterave', examples: ['betterave', 'épinard', 'blette'], years: 3, group: 'racines' },
  { id: 'poacees', label: 'Poacées', simple: 'la famille du maïs', examples: ['maïs'], years: 2, group: 'fruits' },
  { id: 'rosacees', label: 'Rosacées', simple: 'la famille du pommier', examples: ['pommier', 'fraisier', 'rosier'], years: 3 },
  { id: 'lamiacees', label: 'Lamiacées', simple: 'la famille de la menthe', examples: ['basilic', 'menthe', 'sauge'], years: 0 },
  { id: 'autres', label: 'Autres familles', simple: 'une autre famille', examples: [], years: 0 },
]

export const FAMILY_INFO: Readonly<Record<FamilyId, FamilyInfo>> = Object.fromEntries(FAMILIES.map((f) => [f.id, f])) as Record<FamilyId, FamilyInfo>

/** Normalise un nom de famille : sans accent ni casse, sans « famille des », au singulier (« Solanacées » = « Solanacée »). */
function key(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .replace(/^famille\s+(?:des|du|de la|de l)\s*/, '')
    .replace(/[^a-z]/g, '')
    .replace(/s$/, '')
}

/** Variantes connues (latin, français, anciens noms), par famille canonique. */
const VARIANTS: [FamilyId, string[]][] = [
  ['solanacees', ['Solanacées', 'Solanaceae']],
  ['cucurbitacees', ['Cucurbitacées', 'Cucurbitaceae']],
  ['brassicacees', ['Brassicacées', 'Brassicaceae', 'Crucifères', 'Cruciferae']],
  ['apiacees', ['Apiacées', 'Apiaceae', 'Ombellifères', 'Umbelliferae']],
  ['fabacees', ['Fabacées', 'Fabaceae', 'Légumineuses', 'Leguminosae', 'Papilionacées']],
  ['asteracees', ['Astéracées', 'Asteraceae', 'Composées', 'Compositae']],
  ['alliacees', ['Alliacées', 'Alliaceae', 'Amaryllidacées', 'Amaryllidaceae', 'Liliacées', 'Liliaceae']],
  ['chenopodiacees', ['Chénopodiacées', 'Chenopodiaceae', 'Amaranthacées', 'Amaranthaceae']],
  ['poacees', ['Poacées', 'Poaceae', 'Graminées', 'Gramineae']],
  ['rosacees', ['Rosacées', 'Rosaceae']],
  ['lamiacees', ['Lamiacées', 'Lamiaceae', 'Labiées', 'Labiatae']],
]
const FAMILY_BY_KEY = new Map<string, FamilyId>(VARIANTS.flatMap(([id, list]) => list.map((v) => [key(v), id] as const)))

/**
 * Famille canonique d'une valeur de `Species.famille` (les fiches mélangent latin et français, accents, singulier et pluriel).
 * « Liliacées/Alliacées » ou « Solanacées, Solanaceae » : le premier nom connu l'emporte. Inconnu ou vide : « autres ».
 */
export function normalizeFamily(famille: string | undefined | null): FamilyId {
  if (!famille) return 'autres'
  for (const part of famille.split(/[/,;()]/)) {
    const id = FAMILY_BY_KEY.get(key(part))
    if (id) return id
  }
  return 'autres'
}

// ---------- Cultures de la rotation ----------

/** Rayon (m) d'une zone et de l'avertissement : une planche et ses voisines. Aucune zone n'est stockée. */
export const ZONE_RADIUS_M = 3

/**
 * Une plante entre dans la rotation si c'est une annuelle de potager (légume ou aromatique à semer chaque année).
 * Les vivaces, les arbres, les fleurs et les engrais verts sont ignorés.
 */
export function isRotationCrop(sp: Species | undefined): sp is Species {
  return !!sp && isAnnualSpecies(sp) && (sp.categorie === 'legume' || sp.categorie === 'aromatique')
}

interface Crop {
  plant: Plant
  sp: Species
  family: FamilyId
  /** Dernière année où la culture a occupé la terre (fin de sa récolte, ou cette année si elle y est encore). */
  year: number
}

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)

/** Cultures déjà plantées (en place, malade ou récoltée) dont la famille peut encore compter : leur « délai » n'est pas passé. */
function cropsOf(plants: Plant[], speciesById: Record<string, Species>, today: Date, garden?: Pick<Garden, 'id'>, ignoreId?: string): Crop[] {
  const out: Crop[] = []
  const thisYear = today.getFullYear()
  for (const p of plants) {
    if (garden && p.gardenId !== garden.id) continue
    if (p.id === ignoreId) continue
    if (p.status === 'projet' || p.status === 'mort') continue
    const sp = speciesById[p.speciesId]
    if (!isRotationCrop(sp)) continue
    if (!p.position || !Number.isFinite(p.position.x) || !Number.isFinite(p.position.y)) continue
    const planted = localDate(p.plantedAt)
    if (!Number.isFinite(planted.getTime())) continue
    const end = annualHarvestEnd(p, sp)
    const active = p.status === 'en-place' || p.status === 'malade'
    // Sans fenêtre de récolte : l'année de plantation, ou cette année tant que la plante est en place.
    const year = end ? end.getFullYear() : active ? Math.max(planted.getFullYear(), thisYear) : planted.getFullYear()
    const family = normalizeFamily(sp.famille)
    if (year + Math.max(1, FAMILY_INFO[family].years) <= thisYear) continue
    out.push({ plant: p, sp, family, year })
  }
  return out
}

const dist = (a: XY, b: XY) => Math.hypot(a.x - b.x, a.y - b.y)

// ---------- Avertissement dans « Où planter ? » ----------

export interface RotationWarning {
  family: FamilyId
  /** Nom du légume déjà cultivé tout près (au plus 3). */
  names: string[]
  lastYear: number
  years: number
  until: number
  /** Trois phrases courtes, en mots simples. */
  text: string
}

function listWords(list: string[]): string {
  if (list.length <= 1) return list.join('')
  return `${list.slice(0, -1).join(', ')} et ${list[list.length - 1]}`
}

/**
 * Dit si la même famille que `speciesId` a poussé à moins de 3 m ces dernières années (délai de la famille).
 * `null` si rien à dire : plante qui n'est pas de potager, famille sans règle, ou rien de tel tout près.
 * `ignorePlantId` : la plante qu'on est en train de déplacer.
 */
export function rotationWarning(speciesId: string, position: XY, plants: Plant[], speciesById: Record<string, Species>, today: Date, ignorePlantId?: string): RotationWarning | null {
  const sp = speciesById[speciesId]
  if (!isRotationCrop(sp)) return null
  const family = normalizeFamily(sp.famille)
  const info = FAMILY_INFO[family]
  if (info.years <= 0) return null
  const near = cropsOf(plants, speciesById, today, undefined, ignorePlantId).filter((c) => c.family === family && c.year + info.years > today.getFullYear() && dist(c.plant.position, position) <= ZONE_RADIUS_M)
  if (near.length === 0) return null
  const lastYear = Math.max(...near.map((c) => c.year))
  const names = [...new Set(near.filter((c) => c.year === lastYear).map((c) => lower(c.sp.nomCommun)))].sort().slice(0, 3)
  const until = lastYear + info.years
  const examples = info.examples.slice(0, 3)
  const text = [
    `Même famille déjà cultivée à moins de ${ZONE_RADIUS_M} m (${lastYear}) : ${listWords(names)}.`,
    `Souvent, on attend ${info.years} ans avant de la remettre au même endroit : pas avant ${until}.`,
    examples.length > 1 ? `${listWords(examples).replace(/^./, (c) => c.toUpperCase())} sont de la même famille.` : '',
  ]
    .filter(Boolean)
    .join(' ')
  return { family, names, lastYear, years: info.years, until, text }
}

// ---------- Rotation par zone ----------

export interface RotationBlock {
  family: FamilyId
  label: string
  simple: string
  /** Légumes de la zone qui sont de cette famille (dernière année). */
  names: string[]
  lastYear: number
  years: number
  /** Première année où l'on peut remettre cette famille ici. */
  until: number
  /** « Ne remettez pas ici la famille de la tomate avant 2029 (souvent 3 ans). » */
  text: string
  /** « Même famille : tomate, pomme de terre, aubergine, poivron. » */
  same: string
}

export interface RotationZone {
  id: string
  /** « Zone nord du jardin », « Centre du jardin »… */
  name: string
  center: XY
  /** Plantes de la zone (annuelles de potager), les plus récentes d'abord. */
  plants: { id: string; speciesId: string; name: string; family: FamilyId; year: number }[]
  lastYear: number
  /** « Dernière culture : tomate (2026). » */
  last: string
  blocks: RotationBlock[]
  /** Suite classique pour l'an prochain (absente si rien de simple à dire). */
  next?: { group: CropGroup; text: string }
}

/** Le cycle classique, en une phrase (affichée une fois sur l'écran). */
export const CYCLE_SENTENCE = 'Cycle classique : légumes-feuilles, puis légumes-fruits, puis légumes-racines, puis pois et haricots.'
/** Prudence affichée avec chaque conseil. */
export const ROTATION_CAUTION = 'Ce sont des conseils généraux : votre sol et votre climat peuvent demander autre chose.'
/** Ce qu'est une famille, avec un exemple. */
export const FAMILY_EXPLAIN = 'Une famille réunit des légumes cousins. La tomate, la pomme de terre et l’aubergine en font partie.'

const CYCLE: CropGroup[] = ['feuilles', 'fruits', 'racines', 'legumineuses']

const NEXT_CROPS: Record<CropGroup, { family: FamilyId; name: string }[]> = {
  feuilles: [
    { family: 'brassicacees', name: 'chou' },
    { family: 'asteracees', name: 'laitue' },
    { family: 'chenopodiacees', name: 'épinard' },
  ],
  fruits: [
    { family: 'solanacees', name: 'tomate' },
    { family: 'cucurbitacees', name: 'courgette' },
    { family: 'solanacees', name: 'poivron' },
  ],
  racines: [
    { family: 'apiacees', name: 'carotte' },
    { family: 'chenopodiacees', name: 'betterave' },
    { family: 'alliacees', name: 'oignon' },
  ],
  legumineuses: [{ family: 'fabacees', name: 'pois, haricot ou fève' }],
}

const GROUP_PHRASE: Record<CropGroup, (ex: string) => string> = {
  feuilles: (ex) => `des légumes-feuilles (${ex})`,
  fruits: (ex) => `des légumes-fruits (${ex})`,
  racines: (ex) => `des légumes-racines (${ex})`,
  legumineuses: () => 'des pois, des haricots ou des fèves : ils nourrissent le sol',
}

const POINTS = ['nord', 'nord-est', 'est', 'sud-est', 'sud', 'sud-ouest', 'ouest', 'nord-ouest']

function zoneName(c: XY): string {
  if (Math.hypot(c.x, c.y) < ZONE_RADIUS_M) return 'Centre du jardin'
  const angle = (Math.atan2(c.x, c.y) * 180) / Math.PI // 0 = nord, sens horaire (x = est, y = nord)
  return `Zone ${POINTS[(((Math.round(angle / 45) % 8) + 8) % 8)]} du jardin`
}

/** Regroupement simple : chaque culture va dans la zone dont la première culture est à 3 m au plus, sinon elle en ouvre une. */
function cluster(crops: Crop[]): Crop[][] {
  const sorted = [...crops].sort((a, b) => a.plant.position.x - b.plant.position.x || a.plant.position.y - b.plant.position.y || (a.plant.id < b.plant.id ? -1 : a.plant.id > b.plant.id ? 1 : 0))
  const zones: Crop[][] = []
  for (const c of sorted) {
    let best = -1
    let bestD = Infinity
    zones.forEach((z, i) => {
      const d = dist(z[0].plant.position, c.plant.position)
      if (d <= ZONE_RADIUS_M && d < bestD) {
        best = i
        bestD = d
      }
    })
    if (best >= 0) zones[best].push(c)
    else zones.push([c])
  }
  return zones
}

const round1 = (n: number) => Math.round(n * 10) / 10

function buildZone(members: Crop[], today: Date): Omit<RotationZone, 'name' | 'id'> {
  const center: XY = { x: round1(members.reduce((s, c) => s + c.plant.position.x, 0) / members.length), y: round1(members.reduce((s, c) => s + c.plant.position.y, 0) / members.length) }
  const thisYear = today.getFullYear()
  const plants = members
    .map((c) => ({ id: c.plant.id, speciesId: c.sp.id, name: c.sp.nomCommun, family: c.family, year: c.year }))
    .sort((a, b) => b.year - a.year || a.name.localeCompare(b.name, 'fr') || (a.id < b.id ? -1 : 1))
  const lastYear = plants[0].year
  const lastNames = [...new Set(plants.filter((p) => p.year === lastYear).map((p) => lower(p.name)))].slice(0, 3)

  const blocks: RotationBlock[] = []
  for (const info of FAMILIES) {
    if (info.years <= 0) continue
    const mine = members.filter((c) => c.family === info.id)
    if (mine.length === 0) continue
    const last = Math.max(...mine.map((c) => c.year))
    const until = last + info.years
    if (until <= thisYear) continue
    blocks.push({
      family: info.id,
      label: info.label,
      simple: info.simple,
      names: [...new Set(mine.filter((c) => c.year === last).map((c) => lower(c.sp.nomCommun)))].sort().slice(0, 3),
      lastYear: last,
      years: info.years,
      until,
      text: `Ne remettez pas ici ${info.simple} avant ${until} (souvent ${info.years} ans).`,
      same: `Même famille : ${info.examples.join(', ')}.`,
    })
  }
  blocks.sort((a, b) => b.until - a.until || FAMILIES.findIndex((f) => f.id === a.family) - FAMILIES.findIndex((f) => f.id === b.family))

  // Suite : après la culture la plus récente qui a une place dans le cycle, le groupe suivant dont une famille au moins est libre.
  let next: RotationZone['next']
  const blocked = new Set(blocks.map((b) => b.family))
  const lastCrop = [...members].filter((c) => FAMILY_INFO[c.family].group).sort((a, b) => b.year - a.year || FAMILIES.findIndex((f) => f.id === a.family) - FAMILIES.findIndex((f) => f.id === b.family))[0]
  if (lastCrop) {
    const from = CYCLE.indexOf(FAMILY_INFO[lastCrop.family].group!)
    for (let i = 1; i <= CYCLE.length && !next; i++) {
      const group = CYCLE[(from + i) % CYCLE.length]
      const free = NEXT_CROPS[group].filter((c) => !blocked.has(c.family))
      if (free.length === 0) continue
      next = { group, text: `Pour la suite, essayez ${GROUP_PHRASE[group](free.map((c) => c.name).join(', '))}.` }
    }
  }

  return { center, plants, lastYear, last: `Dernière culture : ${listWords(lastNames)} (${lastYear}).`, blocks, next }
}

/**
 * Conseils de rotation du potager : une entrée par zone (3 m autour d'une culture) qui a une culture récente ou en place.
 * Les vivaces, les arbres et les plantes sans fiche sont ignorés ; une plante `recoltee` compte comme « précédent culture ».
 * Aucune donnée ou rien de récent : liste vide. Résultat identique quel que soit l'ordre des plantes.
 * `garden` : si donné, seules les plantes de ce jardin comptent ; sert aussi à nommer les zones (position par rapport au centre).
 */
export function rotationAdvice(plants: Plant[], speciesById: Record<string, Species>, today: Date, garden?: Pick<Garden, 'id'>): RotationZone[] {
  const crops = cropsOf(plants, speciesById, today, garden)
  if (crops.length === 0) return []
  const zones = cluster(crops)
    .map((members) => buildZone(members, today))
    .sort((a, b) => b.center.y - a.center.y || a.center.x - b.center.x)
  const names = zones.map((z) => zoneName(z.center))
  const seen = new Map<string, number>()
  return zones.map((z, i) => {
    const total = names.filter((n) => n === names[i]).length
    const n = (seen.get(names[i]) ?? 0) + 1
    seen.set(names[i], n)
    return { ...z, id: `zone-${i + 1}`, name: total > 1 ? `${names[i]} (${n})` : names[i] }
  })
}

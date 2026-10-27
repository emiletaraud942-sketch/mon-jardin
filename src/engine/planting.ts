// « Où et quand planter » : note d'adéquation d'une espèce pour un emplacement du jardin.
import type { Category, Garden, Month, Plant, Species, Strate, Sun, XY } from '../types'
import { distance, distanceToRing, pointInRing } from '../lib/geo'
import { plantingCalendar, MONTH_NAMES } from './calendar'

export interface SpotContext {
  garden: Garden
  plants: Plant[]
  speciesById: Record<string, Species>
  spot: XY
  /** Moyenne saisonnière d'ensoleillement direct (h/j), fournie par l'appelant. */
  sunHours: number
  slopePct?: number
  /** Date de référence pour le bonus de saison (aujourd'hui par défaut). */
  today?: Date
}

export interface ScoreFactor {
  label: string
  points: number
}

const COMPANION_RADIUS_M = 3
const NITROGEN_RADIUS_M = 4
const BASE_SCORE = 50

const SUN_ORDER: Sun[] = ['ombre', 'mi-ombre', 'plein-soleil']

const fmt = (n: number, d = 1) => n.toFixed(d).replace('.', ',').replace(/,0+$/, '')

export function sunCategory(hours: number): Sun {
  if (hours >= 6) return 'plein-soleil'
  if (hours >= 3) return 'mi-ombre'
  return 'ombre'
}

const living = (p: Plant) => p.status !== 'mort'

/** Deux espèces sont amies si l'une cite l'autre comme compagnon (relation symétrisée). */
function areFriends(a: Species, b: Species): boolean {
  return a.compagnons.includes(b.id) || b.compagnons.includes(a.id)
}

function areEnemies(a: Species, b: Species): boolean {
  return a.antagonistes.includes(b.id) || b.antagonistes.includes(a.id)
}

/** Espèces gourmandes en azote : solanacées, cucurbitacées, choux, fruitiers, ou besoin en eau élevé. */
function isGourmande(sp: Species): boolean {
  const f = sp.famille.toLowerCase()
  return (
    /solan|cucurbit|brassic/.test(f) ||
    sp.categorie === 'fruitier' ||
    (sp.eau === 'eleve' && !sp.fixateurAzote)
  )
}

const TALL: Strate[] = ['canopee', 'arbre-bas']

/** Distance minimale souhaitable entre deux pieds (m), selon leurs strates. */
function requiredSpacing(a: Species, b: Species): number {
  const espA = a.espacementCm / 100
  const espB = b.espacementCm / 100
  if (a.id === b.id || a.strate === b.strate) return Math.max(espA, espB)
  if (TALL.includes(a.strate) && TALL.includes(b.strate)) {
    return Math.max(espA, espB, ((a.envergureAdulteM + b.envergureAdulteM) / 2) * 0.8)
  }
  // Strates différentes (forêt-jardin) : on tolère l'étagement, on garde juste un peu d'espace.
  return 0.5 * Math.min(espA, espB)
}

/**
 * Estimation grossière du froid hivernal à partir de la date moyenne de dernière gelée :
 * mi-février → ≈ -3 °C, mi-avril → ≈ -12 °C, mi-mai → ≈ -16 °C.
 */
function estimatedWinterMinC(lastFrostDoy: number): number {
  return Math.max(-25, Math.min(-2, -3 - (lastFrostDoy - 45) * 0.15))
}

export function legalDistance(
  species: Species,
  spot: XY,
  parcel?: XY[],
): { requiredM: number; actualM?: number; ok: boolean; message: string } {
  const tall = species.hauteurAdulteM > 2
  const requiredM = tall ? 2 : 0.5
  // Art. 671 : les règlements particuliers et les usages locaux passent d'abord ; 2 m et 0,5 m ne valent qu'à défaut.
  const rule = tall
    ? `Art. 671 du Code civil : à défaut de règlement ou d’usage local, une plantation de plus de 2 m de haut doit être à au moins 2 m de la limite séparative`
    : `Art. 671 du Code civil : à défaut de règlement ou d’usage local, une plantation de moins de 2 m doit être à au moins 0,5 m de la limite séparative`
  const local =
    'Des règlements particuliers (PLU, lotissement) ou des usages locaux constants et reconnus priment sur ces distances : renseignez-vous en mairie. Une limite en bordure de voirie n’est pas une limite séparative : l’art. 671 ne s’y applique pas.'
  const espalier = 'En espalier contre un mur séparatif, aucune distance n’est exigée, mais la plante ne doit pas dépasser la crête du mur. Art. 672 : le voisin peut exiger l’arrachage ou la réduction d’une plantation trop proche, sauf si elle a plus de 30 ans.'
  if (!parcel || parcel.length < 3) {
    return { requiredM, ok: true, message: `${rule} (limite de parcelle inconnue). ${local}` }
  }
  if (!pointInRing(spot, parcel)) {
    return { requiredM, actualM: 0, ok: false, message: `Emplacement hors de votre parcelle. ${rule}. ${local}` }
  }
  const actualM = distanceToRing(spot, parcel)
  const ok = actualM >= requiredM
  const prune = tall && !ok ? ' (ou la maintenir sous 2 m par la taille)' : ''
  const message = ok
    ? `Distance à la limite : ${fmt(actualM)} m, conforme à l’art. 671 du Code civil (minimum ${fmt(requiredM)} m). ${local}`
    : `${rule}${prune} : ici ${fmt(actualM)} m seulement. ${local} ${espalier}`
  return { requiredM, actualM, ok, message }
}

export function companionReport(
  plant: Plant,
  plants: Plant[],
  speciesById: Record<string, Species>,
  radiusM = COMPANION_RADIUS_M,
): { amis: Plant[]; ennemis: Plant[] } {
  const amis: Plant[] = []
  const ennemis: Plant[] = []
  const sp = speciesById[plant.speciesId]
  if (!sp) return { amis, ennemis }
  for (const other of plants) {
    if (other.id === plant.id || !living(other)) continue
    const os = speciesById[other.speciesId]
    if (!os || distance(plant.position, other.position) > radiusM) continue
    if (areEnemies(sp, os)) ennemis.push(other)
    else if (areFriends(sp, os)) amis.push(other)
  }
  return { amis, ennemis }
}

const names = (list: Species[]) => [...new Set(list.map((s) => s.nomCommun.toLowerCase()))].join(', ')

export function scoreSpecies(
  species: Species,
  ctx: SpotContext,
): { score: number; factors: ScoreFactor[]; warnings: string[]; blocking: boolean } {
  const factors: ScoreFactor[] = []
  const warnings: string[] = []
  const blocking = false // conservé pour compatibilité : plus aucun critère bloquant
  const { garden, spot } = ctx

  // 1. Soleil (fort poids)
  const cat = sunCategory(ctx.sunHours)
  const hLabel = `${fmt(ctx.sunHours)} h/j`
  if (species.soleil.includes(cat)) {
    factors.push({ label: `Ensoleillement adapté (${hLabel}, ${cat})`, points: 25 })
  } else {
    const gap = Math.min(...species.soleil.map((s) => Math.abs(SUN_ORDER.indexOf(s) - SUN_ORDER.indexOf(cat))))
    const pts = gap >= 2 ? -35 : -12
    factors.push({ label: `Ensoleillement peu adapté (${hLabel}, ${cat} ; aime : ${species.soleil.join(', ')})`, points: pts })
    warnings.push(
      gap >= 2
        ? `${species.nomCommun} demande ${species.soleil.join(' ou ')} : emplacement trop ${cat === 'ombre' ? 'ombragé' : 'ensoleillé'}.`
        : `Ensoleillement limite pour ${species.nomCommun.toLowerCase()} (${hLabel}).`,
    )
  }

  // 2. Voisinage : compagnons, antagonistes, espacement, fixateurs d'azote
  const friends: Species[] = []
  const enemies: Species[] = []
  const fixers: Species[] = []
  let spacingPts = 0
  for (const p of ctx.plants) {
    if (!living(p)) continue
    const os = ctx.speciesById[p.speciesId]
    if (!os) continue
    const d = distance(spot, p.position)
    if (d <= COMPANION_RADIUS_M) {
      if (areEnemies(species, os)) enemies.push(os)
      else if (areFriends(species, os)) friends.push(os)
    }
    if (os.fixateurAzote && d <= NITROGEN_RADIUS_M) fixers.push(os)
    const req = requiredSpacing(species, os)
    if (req > 0 && d < req) {
      spacingPts -= Math.max(5, Math.round(20 * (1 - d / req)))
      warnings.push(`Trop près : ${os.nomCommun.toLowerCase()} à ${fmt(d)} m (il faudrait ~${fmt(req)} m).`)
    }
  }
  if (friends.length) {
    factors.push({ label: `Compagnons à proximité : ${names(friends)}`, points: Math.min(15, 5 * friends.length) })
  }
  if (enemies.length) {
    factors.push({ label: `Mauvais voisins à moins de 3 m : ${names(enemies)}`, points: -Math.min(30, 10 * enemies.length) })
    warnings.push(`${species.nomCommun} ne s'entend pas avec : ${names(enemies)}.`)
  }
  if (spacingPts < 0) factors.push({ label: 'Espacement insuffisant avec les plantes voisines', points: Math.max(-30, spacingPts) })
  if (fixers.length && isGourmande(species) && !species.fixateurAzote) {
    factors.push({ label: `Fixateur d'azote à proximité : ${names(fixers)}`, points: 6 })
  }

  // 3. Distance légale (art. 671 du Code civil) : avertissement et malus, jamais bloquant.
  // Le contour de parcelle inclut parfois la voirie, qui n'est pas une limite séparative.
  if (garden.parcel && garden.parcel.length >= 3) {
    const legal = legalDistance(species, spot, garden.parcel)
    if (!legal.ok) {
      factors.push({ label: 'Proche de la limite de parcelle (art. 671 si c’est un voisin)', points: -25 })
      warnings.push(legal.message)
    }
  }

  // 4. Rusticité (seulement si on connaît les gelées locales, et pour les vivaces)
  if ((garden.minAbsC != null || garden.lastFrostDoy != null) && species.vivace) {
    // Froid observé sur 5 ans si on l'a ; sinon estimation d'après la date des dernières gelées.
    const observed = garden.minAbsC != null
    const tMin = observed ? garden.minAbsC! : estimatedWinterMinC(garden.lastFrostDoy!)
    const margin = species.rusticiteC - tMin
    if (margin > 0) {
      factors.push({ label: `Rusticité limite (${species.rusticiteC} °C, ${observed ? `hiver le plus froid observé ${Math.round(tMin)} °C` : `hivers ≈ ${Math.round(tMin)} °C estimés`})`, points: margin > 5 ? -20 : -10 })
      warnings.push(`${species.nomCommun} supporte ${species.rusticiteC} °C : prévoir une protection hivernale ou un pot rentré.`)
    } else if (margin <= -3) {
      factors.push({ label: 'Rustique dans votre climat', points: 5 })
    }
  }

  // 5. Sol
  if (garden.sol && species.solPrefere?.length) {
    if (species.solPrefere.includes(garden.sol)) {
      factors.push({ label: `Sol ${garden.sol} apprécié`, points: 8 })
    } else {
      factors.push({ label: `Sol ${garden.sol} peu adapté (préfère : ${species.solPrefere.join(', ')})`, points: -8 })
    }
  }

  // 6. Pente : défavorable aux annuelles (travail du sol, érosion)
  if (ctx.slopePct != null && ctx.slopePct > 15 && !species.vivace) {
    factors.push({ label: `Pente de ${Math.round(ctx.slopePct)} % : peu pratique pour une annuelle`, points: -10 })
  }

  // 7. Saison : bonus si on est dans la fenêtre de semis / plantation
  const month = ((ctx.today ?? new Date()).getMonth() + 1) as Month
  const cal = plantingCalendar(species, garden)
  const now = [
    cal.semisPleineTerre.includes(month) && 'semis en pleine terre',
    cal.plantation.includes(month) && 'plantation',
    cal.semisAbri.includes(month) && 'semis à l’abri',
  ].filter(Boolean)
  if (now.length) factors.push({ label: `C'est le moment : ${now.join(', ')} en ${MONTH_NAMES[month - 1]}`, points: 5 })

  const raw = BASE_SCORE + factors.reduce((s, f) => s + f.points, 0)
  return { score: Math.max(0, Math.min(100, Math.round(raw))), factors, warnings, blocking }
}

/**
 * Espèces les mieux adaptées à l'emplacement, de la meilleure à la moins bonne.
 * Les espèces marquées `blocking` (aucune aujourd'hui) seraient exclues.
 */
export function recommendSpecies(
  all: Species[],
  ctx: SpotContext,
  opts?: { categories?: Category[]; limit?: number },
): { species: Species; score: number; factors: ScoreFactor[]; warnings: string[] }[] {
  const cats = opts?.categories
  return all
    .filter((s) => !cats?.length || cats.includes(s.categorie))
    .map((species) => ({ species, ...scoreSpecies(species, ctx) }))
    .filter((r) => !r.blocking)
    .sort((a, b) => b.score - a.score || a.species.nomCommun.localeCompare(b.species.nomCommun, 'fr'))
    .slice(0, opts?.limit ?? 10)
    .map(({ species, score, factors, warnings }) => ({ species, score, factors, warnings }))
}

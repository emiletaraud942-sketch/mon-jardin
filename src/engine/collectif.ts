// Jardin collectif : calculs purs (bilan annuel des gestes, parcelles en grille, suivi de composteur, habitats).
// Aucune règle n'est inventée : les repères de compostage (retourner toutes les 4 à 6 semaines, mûr en 6 à 12 mois) viennent du mode d'emploi
// « Démarrer son compost » de la Métropole Rouen Normandie (2026), cités à titre indicatif.
import type { Composteur, Geste, GesteType, HabitatKind, Plot, XY } from '../types'

export const GESTE_LABEL: Record<GesteType, string> = {
  compost: 'Déchets mis au compost',
  broyat: 'Branchages broyés',
  tonte: 'Tontes laissées sur place ou en paillis',
  feuilles: 'Feuilles mortes réemployées',
  'eau-pluie': 'Eau de pluie récupérée',
}
export const GESTE_UNIT: Record<GesteType, 'kg' | 'L'> = { compost: 'kg', broyat: 'kg', tonte: 'kg', feuilles: 'kg', 'eau-pluie': 'L' }
export const GESTE_ORDER: GesteType[] = ['compost', 'broyat', 'tonte', 'feuilles', 'eau-pluie']
/** Les gestes qui comptent dans « déchets végétaux évités » (pas l'eau). */
const VEGETAL: ReadonlySet<GesteType> = new Set<GesteType>(['compost', 'broyat', 'tonte', 'feuilles'])

export interface Bilan {
  year: number
  /** Total par type de geste (kg ou L). */
  parType: Record<GesteType, number>
  /** Somme des gestes en kg : déchets végétaux évités ou réemployés. */
  dechetsEvitesKg: number
  eauLitres: number
  nombre: number
}

const round1 = (n: number) => Math.round(n * 10) / 10

export function bilanAnnuel(gestes: readonly Geste[] | undefined, year: number): Bilan {
  const parType = { compost: 0, broyat: 0, tonte: 0, feuilles: 0, 'eau-pluie': 0 } as Record<GesteType, number>
  let nombre = 0
  for (const g of gestes ?? []) {
    if (Number(g.date.slice(0, 4)) !== year) continue
    parType[g.type] += g.quantite
    nombre++
  }
  for (const t of GESTE_ORDER) parType[t] = round1(parType[t])
  const dechetsEvitesKg = round1(GESTE_ORDER.filter((t) => VEGETAL.has(t)).reduce((s, t) => s + parType[t], 0))
  return { year, parType, dechetsEvitesKg, eauLitres: parType['eau-pluie'], nombre }
}

/** Années pour lesquelles on a au moins un geste, de la plus récente à la plus ancienne ; l'année en cours est toujours proposée. */
export function bilanYears(gestes: readonly Geste[] | undefined, today: Date): number[] {
  const ys = new Set<number>([today.getFullYear()])
  for (const g of gestes ?? []) ys.add(Number(g.date.slice(0, 4)))
  return [...ys].sort((a, b) => b - a)
}

export interface GridOptions {
  cols: number
  rows: number
  /** Largeur et hauteur d'une parcelle (m). */
  w: number
  h: number
  /** Écart entre parcelles (m). */
  gap: number
  /** Coin sud-ouest de la première parcelle (m, repère local : x = est, y = nord). */
  origin: XY
  /** Numéro de la première parcelle. */
  first?: number
}
export const GRID_MAX = 200

/** Parcelles en grille, numérotées de gauche à droite puis de bas en haut. Refuse (liste vide) ce qui dépasse 200 parcelles ou des tailles absurdes. */
export function gridPlots(o: GridOptions, newId: () => string): Plot[] {
  const ok = Number.isInteger(o.cols) && Number.isInteger(o.rows) && o.cols >= 1 && o.rows >= 1 && o.cols * o.rows <= GRID_MAX
  if (!ok || !(o.w > 0 && o.w <= 500 && o.h > 0 && o.h <= 500) || !(o.gap >= 0 && o.gap <= 50)) return []
  const out: Plot[] = []
  let n = o.first ?? 1
  for (let r = 0; r < o.rows; r++)
    for (let c = 0; c < o.cols; c++) {
      out.push({ id: newId(), n: n++, x: round1(o.origin.x + c * (o.w + o.gap)), y: round1(o.origin.y + r * (o.h + o.gap)), w: o.w, h: o.h })
    }
  return out
}

/** La parcelle qui contient un point, s'il y en a une. */
export const plotAt = (p: XY, plots: readonly Plot[] | undefined): Plot | undefined => plots?.find((q) => p.x >= q.x && p.x <= q.x + q.w && p.y >= q.y && p.y <= q.y + q.h)

const DAY = 86_400_000
const dayMs = (iso: string) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)))
export const daysBetween = (fromIso: string, to: Date): number => Math.floor((Date.UTC(to.getFullYear(), to.getMonth(), to.getDate()) - dayMs(fromIso)) / DAY)

export interface CompostStatus {
  /** Jours depuis la mise en route. */
  age: number
  /** Jours depuis le dernier retournement (ou la mise en route). */
  sinceTurn: number
  /** « tourner » : à retourner ; « mur » : peut être mûr ; « ok » : rien à faire. */
  state: 'ok' | 'tourner' | 'mur'
  text: string
}
export const TURN_DAYS = 42 // 6 semaines : au plus tard
export const MATURE_DAYS = 183 // 6 mois : au plus tôt

export function compostStatus(c: Pick<Composteur, 'debut' | 'retourne'>, today: Date): CompostStatus {
  const age = daysBetween(c.debut, today)
  const sinceTurn = daysBetween(c.retourne ?? c.debut, today)
  if (age < 0) return { age, sinceTurn, state: 'ok', text: 'Ce composteur démarre bientôt.' }
  if (age >= MATURE_DAYS) return { age, sinceTurn, state: 'mur', text: 'Il peut être mûr : un compost mûr est brun, sent la forêt et ne montre plus les déchets d’origine. Sinon, laissez-le encore mûrir.' }
  if (sinceTurn >= TURN_DAYS) return { age, sinceTurn, state: 'tourner', text: `À retourner : cela fait ${Math.floor(sinceTurn / 7)} semaines. On le retourne toutes les 4 à 6 semaines.` }
  const left = Math.max(1, Math.ceil((28 - sinceTurn) / 7))
  return { age, sinceTurn, state: 'ok', text: sinceTurn >= 28 ? 'Vous pouvez le retourner dès maintenant.' : `Rien à faire. Prochain retournement dans environ ${left} semaine${left > 1 ? 's' : ''}.` }
}

export interface Habitat {
  id: HabitatKind
  label: string
  idea: string
}
export const HABITATS: Habitat[] = [
  { id: 'haie', label: 'Une haie de plusieurs espèces', idea: 'Elle abrite les oiseaux. Taillez-la avant le 15 mars ou après le 15 août pour ne pas déranger les nids.' },
  { id: 'mare', label: 'Une mare ou un point d’eau', idea: 'Même une soucoupe d’eau peu profonde aide les insectes, les oiseaux et les hérissons.' },
  { id: 'tas-bois', label: 'Un tas de bois ou de feuilles', idea: 'Un coin laissé tranquille abrite hérissons, insectes et petits animaux.' },
  { id: 'hotel', label: 'Un hôtel à insectes', idea: 'Il accueille abeilles solitaires et coccinelles, à l’abri de la pluie.' },
  { id: 'herisson', label: 'Un passage pour le hérisson', idea: 'Un trou d’environ 13 cm dans la clôture lui permet de passer d’un jardin à l’autre.' },
  { id: 'nichoir', label: 'Un nichoir', idea: 'Posez-le hors du soleil direct du midi et loin des passages de chats.' },
  { id: 'prairie', label: 'Un coin de prairie non tondu', idea: 'Fauchez une ou deux fois par an : les fleurs sauvages nourrissent les pollinisateurs.' },
]

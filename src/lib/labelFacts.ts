import { normalizeSearch } from '../data/species/search'
import { SPECIES } from '../data/species'
import type { Species } from '../types'
import { parseLabel, parseHeightCm, parsePriceEur, type LabelFacts } from './labelParse'
import { parseHarvestMonths, parseSeedText, type SeedFacts } from './seedParse'

// Une photo d'étiquette ou de sachet -> tout ce qu'on peut en lire, pour ne rien taper à la main.
// Pur et testé. Un OCR se trompe : tout est PROPOSÉ, rien n'est enregistré sans que la personne ait vu et corrigé.
// Règle : jamais inventer. Un champ non lu reste vide.

export type LabelKind = 'sachet' | 'plante' | 'autre'
export type Sun = 'soleil' | 'mi-ombre' | 'ombre'

export interface LabelExtras {
  /** Profondeur de semis, en cm (« 1 cm », « 0,5 à 1 cm » : le milieu). */
  profondeurCm?: number
  /** Distance entre plants ou entre lignes, en cm. */
  espacementCm?: number
  /** Jours avant la levée (« germination 8 à 12 jours » : le milieu). */
  leveeJours?: number
  /** Mois de récolte (1 à 12). */
  recolteMois: number[]
  soleil?: Sun
  hauteurCm?: number
  /** « 2 g », « 100 graines ». */
  contenu?: string
  prixEur?: number
}

export interface LabelScan {
  kind: LabelKind
  seed: SeedFacts
  label: LabelFacts
  extras: LabelExtras
  /** Espèce du catalogue reconnue (sachet ou étiquette), si une seule se détache. */
  species?: Species
}

const num = (s: string) => Number(s.replace(',', '.'))
const mid = (a: string, b?: string) => (b ? (num(a) + num(b)) / 2 : num(a))
const round1 = (n: number) => Math.round(n * 10) / 10

/** « profondeur de semis : 1 à 2 cm » -> 1,5. Accepte les mm. */
export function parseDepthCm(rawText: string): number | undefined {
  const t = normalizeSearch(rawText).replace(/,/g, '.')
  const after = /profondeur[^\d\n]{0,25}(\d+(?:\.\d+)?)(?:\s*(?:-|a|à)\s*(\d+(?:\.\d+)?))?\s*(cm|mm)/.exec(t)
  // « semer à 1 cm de profondeur », « enterrer à 0,5 cm », « recouvrir de 2 cm de terre »
  const before = /(?:semer|semez|enterrer|enterrez|recouvrir|recouvrez|couvrir|couvrez|enfouir|enfouissez|planter|plantez)[^\d.\n]{0,20}(\d+(?:\.\d+)?)(?:\s*(?:-|a|à)\s*(\d+(?:\.\d+)?))?\s*(cm|mm)\s*(?:de\s+(?:profondeur|terre|terreau)|sous)?/.exec(t)
  const m = before?.[0].includes('profondeur') ? before : (after ?? before)
  if (!m) return undefined
  const v = mid(m[1], m[2]) / (m[3] === 'mm' ? 10 : 1)
  return v > 0 && v <= 40 ? round1(v) : undefined
}

/** « distance entre les plants : 30 cm », « espacement 20-30 cm », « écartement 40 cm » -> cm. */
export function parseSpacingCm(rawText: string): number | undefined {
  const t = normalizeSearch(rawText).replace(/,/g, '.')
  const grid = /(?:distance|espacement|ecartement|plantation)[^\d\n]{0,30}(\d+(?:\.\d+)?)\s*(?:x|×|\*)\s*(\d+(?:\.\d+)?)\s*cm/.exec(t) // « 40 x 60 cm » : sur le rang, entre les rangs
  if (grid) return Math.round(Number(grid[1]))
  const m =
    /(?:distance|espacement|ecartement|espacer|espacez|ecarter|ecartez|eclaircir|eclaircissez)[^\d\n]{0,30}(\d+(?:\.\d+)?)(?:\s*(?:-|a|à)\s*(\d+(?:\.\d+)?))?\s*cm/.exec(t) ??
    /(\d+(?:\.\d+)?)(?:\s*(?:-|a|à)\s*(\d+(?:\.\d+)?))?\s*cm\s*(?:entre\s+(?:les|chaque|deux)\s+(?:plants?|pieds?|graines?|rangs?|lignes?)|d['’ ]ecart|d['’ ]espace)/.exec(t)
  if (!m) return undefined
  const v = mid(m[1], m[2])
  return v > 0 && v <= 500 ? Math.round(v) : undefined
}

/** « germination : 8 à 12 jours », « levée en 10 jours » -> jours. */
export function parseGerminationDays(rawText: string): number | undefined {
  const t = normalizeSearch(rawText).replace(/,/g, '.')
  const m = /(?:germination|levee)[^\d\n]{0,30}(\d+)(?:\s*(?:-|a|à)\s*(\d+))?\s*(jours?|j|semaines?|sem)\b/.exec(t)
  if (!m) return undefined
  const v = Math.round(mid(m[1], m[2]) * (/^s/.test(m[3]) ? 7 : 1))
  return v > 0 && v <= 365 ? v : undefined
}

export function parseSun(rawText: string): Sun | undefined {
  const t = normalizeSearch(rawText)
  if (/mi\s*[-–—_.]?\s*ombre|soleil\s*(?:ou|\/|et)\s*mi/.test(t)) return 'mi-ombre'
  if (/plein soleil|\bsoleil\b|ensoleille/.test(t)) return 'soleil'
  if (/\bombre\b|ombrage/.test(t)) return 'ombre'
  return undefined
}

/** Contenu du sachet : « 2 g », « poids net 5 g », « 100 graines ». */
export function parseContent(rawText: string): string | undefined {
  const t = normalizeSearch(rawText).replace(/,/g, '.')
  const g = /(?<![\d.])(\d{1,4}(?:\.\d)?)\s*(?:g|gr|grammes?)\b/.exec(t)
  if (g && Number(g[1]) > 0) return `${g[1].replace('.', ',')} g`
  const n = /(?<![\d.])(\d{2,5})\s*graines?\b/.exec(t)
  if (n) return `${n[1]} graines`
  return undefined
}

const SACHET_WORDS = /\b(?:graines?|sachet|semer|semis|semez|germination|levee|profondeur|poids net|eclaircir|repiquer|semences?|seeds?)\b/g
const PLANT_WORDS = /\b(?:godet|conteneur|container|racines? nues?|motte|rusticite|rustique|hauteur adulte|hauteur|variete|cultivar|porte[- ]greffe|scion|demi[- ]?tige|haute[- ]?tige|floraison|fructification|c ?\d{1,2}|pot)\b/g

/** Sachet de graines, étiquette de plante, ou autre fiche d'information : d'après les mots lus. */
export function classifyLabel(rawText: string): LabelKind {
  const t = normalizeSearch(rawText)
  const s = (t.match(SACHET_WORDS) ?? []).length
  const p = (t.match(PLANT_WORDS) ?? []).length
  if (s >= 2 && s >= p) return 'sachet'
  if (p >= 2 && p > s) return 'plante'
  if (s === 1 && p === 0) return 'sachet'
  if (p === 1 && s === 0) return 'plante'
  return 'autre'
}

/** Retire les lignes de profondeur, de distance et d'espacement avant de chercher une hauteur. */
function withoutSowingLines(rawText: string): string {
  return rawText
    .split(/\r?\n/)
    .filter((l) => !/profondeur|distance|espac|ecart|écart|enterrer|eclaircir|éclaircir|entre (?:les|chaque)/i.test(l))
    .join('\n')
}

export function parseLabelScan(rawText: string, now: Date = new Date(), species: readonly Species[] = SPECIES): LabelScan {
  const seed = parseSeedText(rawText, now, species)
  const label = parseLabel(rawText)
  const speciesId = seed.speciesId ?? label.speciesId
  const extras: LabelExtras = { recolteMois: parseHarvestMonths(rawText) }
  const depth = parseDepthCm(rawText)
  if (depth !== undefined) extras.profondeurCm = depth
  const spacing = parseSpacingCm(rawText)
  if (spacing !== undefined) extras.espacementCm = spacing
  const days = parseGerminationDays(rawText)
  if (days !== undefined) extras.leveeJours = days
  const sun = parseSun(rawText)
  if (sun) extras.soleil = sun
  // Une hauteur n'est lue que s'il y a le mot, ou sur une étiquette de plante : sur un sachet, « 50 cm » est une distance, pas une hauteur.
  const kind = classifyLabel(rawText)
  const height = kind === 'plante' || /\bhauteur\b|\bh\.?\s*\d/i.test(rawText) ? parseHeightCm(withoutSowingLines(rawText)) : undefined
  if (height !== undefined) extras.hauteurCm = height
  const content = parseContent(rawText)
  if (content) extras.contenu = content
  const price = parsePriceEur(rawText)
  if (price !== undefined) extras.prixEur = price
  return { kind, seed, label, extras, species: speciesId ? species.find((s) => s.id === speciesId) : undefined }
}

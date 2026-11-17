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
  const m = /profondeur[^\d]{0,25}(\d+(?:\.\d+)?)(?:\s*(?:-|a|à)\s*(\d+(?:\.\d+)?))?\s*(cm|mm)/.exec(t)
  if (!m) return undefined
  const v = mid(m[1], m[2]) / (m[3] === 'mm' ? 10 : 1)
  return v > 0 && v <= 40 ? round1(v) : undefined
}

/** « distance entre les plants : 30 cm », « espacement 20-30 cm », « écartement 40 cm » -> cm. */
export function parseSpacingCm(rawText: string): number | undefined {
  const t = normalizeSearch(rawText).replace(/,/g, '.')
  const m = /(?:distance|espacement|ecartement)[^\d]{0,30}(\d+(?:\.\d+)?)(?:\s*(?:-|a|à)\s*(\d+(?:\.\d+)?))?\s*cm/.exec(t)
  if (!m) return undefined
  const v = mid(m[1], m[2])
  return v > 0 && v <= 500 ? Math.round(v) : undefined
}

/** « germination : 8 à 12 jours », « levée en 10 jours » -> jours. */
export function parseGerminationDays(rawText: string): number | undefined {
  const t = normalizeSearch(rawText).replace(/,/g, '.')
  const m = /(?:germination|levee)[^\d]{0,30}(\d+)(?:\s*(?:-|a|à)\s*(\d+))?\s*(?:jours?|j)\b/.exec(t)
  if (!m) return undefined
  const v = Math.round(mid(m[1], m[2]))
  return v > 0 && v <= 365 ? v : undefined
}

export function parseSun(rawText: string): Sun | undefined {
  const t = normalizeSearch(rawText)
  if (/mi[- ]?ombre|soleil\s*(?:ou|\/)\s*mi/.test(t)) return 'mi-ombre'
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
  const height = parseHeightCm(rawText)
  if (height !== undefined) extras.hauteurCm = height
  const content = parseContent(rawText)
  if (content) extras.contenu = content
  const price = parsePriceEur(rawText)
  if (price !== undefined) extras.prixEur = price
  return { kind: classifyLabel(rawText), seed, label, extras, species: speciesId ? species.find((s) => s.id === speciesId) : undefined }
}

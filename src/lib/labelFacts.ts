import { normalizeSearch } from '../data/species/search'
import { SPECIES } from '../data/species'
import type { Species } from '../types'
import { parseLabel, parseHeightCm, parsePriceEur, type LabelFacts } from './labelParse'
import type { GridMonths } from './monthGrid'
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
  /** Des mois ont été lus dans un calendrier en grille (cases cochées ou colorées) : à vérifier de plus près. */
  fromGrid?: boolean
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
  const after = /(?:profondeur|depth)[^\d\n]{0,25}(\d+(?:\.\d+)?)(?:\s*(?:-|a|à|to)\s*(\d+(?:\.\d+)?))?\s*(cm|mm|inch(?:es)?|in\b|")/.exec(t)
  // « semer à 1 cm de profondeur », « enterrer à 0,5 cm », « recouvrir de 2 cm de terre »
  const before = /(?:semer|semez|enterrer|enterrez|recouvrir|recouvrez|couvrir|couvrez|enfouir|enfouissez|planter|plantez|sow|cover|bury)[^\d.\n]{0,20}(\d+(?:\.\d+)?)(?:\s*(?:-|a|à|to)\s*(\d+(?:\.\d+)?))?\s*(cm|mm|inch(?:es)?|in\b|")\s*(?:de\s+(?:profondeur|terre|terreau)|sous|deep|with)?/.exec(t)
  const m = before && /profondeur|deep/.test(before[0]) ? before : (after ?? before)
  if (!m) return undefined
  const v = (mid(m[1], m[2]) * (/^(?:in|")/.test(m[3]) ? 2.54 : m[3] === 'mm' ? 0.1 : 1))
  return v > 0 && v <= 40 ? round1(v) : undefined
}

/** « distance entre les plants : 30 cm », « espacement 20-30 cm », « écartement 40 cm » -> cm. */
export function parseSpacingCm(rawText: string): number | undefined {
  const t = normalizeSearch(rawText).replace(/,/g, '.')
  const grid = /(?:distance|espacement|ecartement|plantation|spacing)[^\d\n]{0,30}(\d+(?:\.\d+)?)\s*(?:x|×|\*)\s*(\d+(?:\.\d+)?)\s*cm/.exec(t) // « 40 x 60 cm » : sur le rang, entre les rangs
  if (grid) return Math.round(Number(grid[1]))
  const m =
    /(?:distance|espacement|ecartement|espacer|espacez|ecarter|ecartez|eclaircir|eclaircissez|spacing|space(?: plants)?|thin(?:ning)?(?: to)?)[^\d\n]{0,30}(\d+(?:\.\d+)?)(?:\s*(?:-|a|à|to)\s*(\d+(?:\.\d+)?))?\s*(cm|inch(?:es)?|in\b|")/.exec(t) ??
    /(\d+(?:\.\d+)?)(?:\s*(?:-|a|à|to)\s*(\d+(?:\.\d+)?))?\s*(cm)\s*(?:entre\s+(?:les|chaque|deux)\s+(?:plants?|pieds?|graines?|rangs?|lignes?)|d['’ ]ecart|d['’ ]espace|apart)/.exec(t)
  if (!m) return undefined
  const v = mid(m[1], m[2]) * (/^(?:in|")/.test(m[3] ?? '') ? 2.54 : 1)
  return v > 0 && v <= 500 ? Math.round(v) : undefined
}

/** « germination : 8 à 12 jours », « levée en 10 jours » -> jours. */
export function parseGerminationDays(rawText: string): number | undefined {
  const t = normalizeSearch(rawText).replace(/,/g, '.')
  const m = /(?:germination|germinates?|emergence|levee)[^\d\n]{0,30}(\d+)(?:\s*(?:-|a|à|to)\s*(\d+))?\s*(jours?|j|days?|semaines?|weeks?|sem)\b/.exec(t)
  if (!m) return undefined
  const v = Math.round(mid(m[1], m[2]) * (/^(?:s|w)/.test(m[3]) ? 7 : 1))
  return v > 0 && v <= 365 ? v : undefined
}

export function parseSun(rawText: string): Sun | undefined {
  const t = normalizeSearch(rawText)
  if (/mi\s*[-–—_.]?\s*ombre|soleil\s*(?:ou|\/|et)\s*mi|(?:part(?:ial)?|semi|half)[- ]?(?:shade|sun)|sun\s*(?:or|\/|and|to)\s*(?:part|semi|half)/.test(t)) return 'mi-ombre'
  if (/plein soleil|\bsoleil\b|ensoleille|full sun|\bsunny\b/.test(t)) return 'soleil'
  if (/\bombre\b|ombrage|\bshade\b|\bshady\b/.test(t)) return 'ombre'
  return undefined
}

/** Contenu du sachet : « 2 g », « poids net 5 g », « 100 graines ». */
export function parseContent(rawText: string): string | undefined {
  const t = normalizeSearch(rawText).replace(/,/g, '.')
  const g = /(?<![\d.])(\d{1,4}(?:\.\d)?)\s*(?:g|gr|grammes?|grams?)\b/.exec(t)
  if (g && Number(g[1]) > 0) return `${g[1].replace('.', ',')} g`
  const n = /(?<![\d.])(\d{2,5})\s*(?:graines?|seeds)\b/.exec(t)
  if (n) return `${n[1]} graines`
  return undefined
}

const SACHET_WORDS = /\b(?:graines?|sachet|semer|semis|semez|germination|levee|profondeur|poids net|eclaircir|repiquer|semences?|seeds?|sow|sowing|seed depth|net wt|harvest|spacing|packet)\b/g
const PLANT_WORDS = /\b(?:bare[- ]?roots?|potted|grafted|rootstock|hardy|godet|conteneur|container|racines? nues?|motte|rusticite|rustique|hauteur adulte|hauteur|variete|cultivar|porte[- ]greffe|scion|demi[- ]?tige|haute[- ]?tige|floraison|fructification|c ?\d{1,2}|pot)\b/g

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
    .filter((l) => !/profondeur|depth|distance|spacing|espac|ecart|écart|enterrer|eclaircir|éclaircir|entre (?:les|chaque)|apart/i.test(l))
    .join('\n')
}

export function parseLabelScan(rawText: string, now: Date = new Date(), species: readonly Species[] = SPECIES, grid?: GridMonths): LabelScan {
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
  const kind0 = classifyLabel(rawText)
  const height = kind0 === 'plante' || /\bhauteur\b|\bheight\b|\btall\b|\bh\.?\s*\d/i.test(rawText) ? parseHeightCm(withoutSowingLines(rawText)) : undefined
  if (height !== undefined) extras.hauteurCm = height
  const content = parseContent(rawText)
  if (content) extras.contenu = content
  const price = parsePriceEur(rawText)
  if (price !== undefined) extras.prixEur = price
  // Calendrier en grille : seulement ce que le texte n'a pas donné.
  let kind = classifyLabel(rawText)
  if (grid && kind !== 'sachet' && (grid.semis.length || grid.recolte.length) && !/\bhauteur\b|\bheight\b|godet|pot\b/i.test(rawText)) kind = 'sachet' // un calendrier de semis = un sachet
  if (grid) {
    if (!seed.sowMonths.length && grid.semis.length) {
      seed.sowMonths = grid.semis
      extras.fromGrid = true
    }
    if (!extras.recolteMois.length && grid.recolte.length) {
      extras.recolteMois = grid.recolte
      extras.fromGrid = true
    }
  }
  return { kind, seed, label, extras, species: speciesId ? species.find((s) => s.id === speciesId) : undefined }
}

/** Nombre de champs lus : sert à choisir quelle lecture fait foi quand les deux diffèrent. */
function filled(s: LabelScan): number {
  const e = s.extras
  return [s.seed.name, s.seed.sowMonths.length, e.recolteMois.length, e.profondeurCm, e.espacementCm, e.leveeJours, e.soleil, e.hauteurCm, e.contenu, e.prixEur, s.label.form, s.species].filter((v) => v !== undefined && v !== 0 && v !== '').length
}

/**
 * Deux lectures de la même photo (deux contrastes) : on garde celle qui a lu le plus de champs, et on complète ses trous avec l'autre.
 * Un champ lu dans les deux avec des valeurs différentes : la lecture principale l'emporte ; jamais de moyenne, jamais d'invention.
 */
export function mergeLabelScans(a: LabelScan, b: LabelScan | undefined): LabelScan {
  if (!b) return a
  const [p, q] = filled(b) > filled(a) ? [b, a] : [a, b]
  const extras: LabelExtras = { ...q.extras, ...Object.fromEntries(Object.entries(p.extras).filter(([, v]) => v !== undefined)) } as LabelExtras
  if (!p.extras.recolteMois.length) extras.recolteMois = q.extras.recolteMois
  const seed = { ...p.seed, name: p.seed.name ?? q.seed.name, speciesId: p.seed.speciesId ?? q.seed.speciesId, sowMonths: p.seed.sowMonths.length ? p.seed.sowMonths : q.seed.sowMonths, dates: p.seed.dates.length ? p.seed.dates : q.seed.dates }
  const label = { ...q.label, ...Object.fromEntries(Object.entries(p.label).filter(([, v]) => v !== undefined && !(Array.isArray(v) && v.length === 0))) } as LabelScan['label']
  const species = p.species ?? q.species
  return { kind: p.kind === 'autre' ? q.kind : p.kind, seed, label, extras, species }
}

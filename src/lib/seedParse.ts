import { SPECIES } from '../data/species'
import { normalizeSearch, searchRank } from '../data/species/search'
import type { Species } from '../types'
import { englishNamesOf } from './englishNames'

// Texte lu sur un sachet de graines (OCR) -> ce qu'on peut en proposer : un nom, une date, les mois de semis.
// Pur et testé. Un OCR se trompe : tout est proposé, rien n'est ajouté sans que la personne le voie et le corrige.
// Règle : jamais inventer. Sans date lisible, aucune date. Une année seule n'est jamais transformée en jour.

export type SeedDateKind = 'recolte' | 'emballage' | 'lot' | 'avant' | 'autre'

export interface SeedDate {
  kind: SeedDateKind
  precision: 'jour' | 'mois' | 'annee'
  year: number
  month?: number
  day?: number
  /** Date AAAA-MM-JJ : le jour lu, sinon le 1er du mois (précision « mois »). Absente pour une année seule. */
  iso?: string
  /** Phrase lisible : « récolte 2025 », « à semer avant mars 2027 ». */
  text: string
}

export interface SeedFacts {
  /** Nom proposé : une plante du catalogue, sinon la ligne la plus plausible du sachet. */
  name?: string
  /** Espèce du catalogue reconnue. */
  speciesId?: string
  /** Dates lues, la plus utile d'abord. */
  dates: SeedDate[]
  /** Mois de semis écrits sur le sachet (1 à 12) : information seulement. */
  sowMonths: number[]
}

const MONTHS = ['janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin', 'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre']
const MONTH_ALIASES: Record<string, number> = {
  janv: 1, fevr: 2, sept: 9, oct: 10, nov: 11, dec: 12, avr: 4, juil: 7,
  // Anglais (sachets importés) : noms entiers et abréviations
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9,
}
const MONTH_LABEL = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
const MONTH_RE = `(?:${[...MONTHS, ...Object.keys(MONTH_ALIASES)].sort((a, b) => b.length - a.length).join('|')})`

function monthOf(word: string): number | undefined {
  const w = word.replace(/\.$/, '')
  const i = MONTHS.indexOf(w)
  if (i >= 0) return i + 1
  return MONTH_ALIASES[w]
}

/** Bruit d'OCR dans les nombres : « 2O25 », « 1l/2025 » -> « 2025 », « 11/2025 ». Seulement dans les mots faits de chiffres et de ces lettres. */
export function fixDigits(text: string): string {
  return text.replace(/[0-9OoIl][0-9OoIl/.\-]{2,}/g, (tok) => ((tok.match(/\d/g) ?? []).length >= 2 ? tok.replace(/[Oo]/g, '0').replace(/[Il]/g, '1') : tok))
}

const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate()
const pad = (n: number) => String(n).padStart(2, '0')

/** Vrai jour du calendrier ? */
function realDay(y: number, m: number, d: number): boolean {
  return m >= 1 && m <= 12 && d >= 1 && d <= lastDay(y, m)
}

const FILLER = /^(?:[\s:.,;\-–—'°]|\b(?:de|en|le|la|du|au|a|vers|environ|preference|courant|mois|n)\b)+/
const KIND_WORDS: [SeedDateKind, RegExp][] = [
  ['recolte', /\brecolt\w*/g],
  ['emballage', /\b(?:emball|conditionn|ensach|embal)\w*/g],
  ['lot', /\blot\b/g],
  ['avant', /\b(?:avant|jusqu\w*|dluo|dlc)\b/g],
]
const KIND_PRIORITY: Record<SeedDateKind, number> = { recolte: 0, emballage: 1, lot: 2, autre: 3, avant: 4 }

function yearFrom(raw: string, twoDigits: boolean): number | undefined {
  if (raw.length === 4) return Number(raw)
  return twoDigits && raw.length === 2 ? 2000 + Number(raw) : undefined
}

/** Une date écrite au début de `s` (après des mots de liaison). `end` : où elle s'arrête, pour ne pas la relire. */
function dateAtStart(s: string, kind: SeedDateKind, anywhere = false): { d: Omit<SeedDate, 'text' | 'kind'> & { fin: boolean }; end: number } | undefined {
  let rest = s
  let fin = false
  let skipped = 0
  if (!anywhere) {
    const m = FILLER.exec(rest)
    if (m) {
      fin = /\bfin\b/.test(m[0])
      skipped = m[0].length
      rest = rest.slice(skipped)
    }
    const f = /^(fin|debut|mi)\b[\s\-]*/.exec(rest)
    if (f) {
      fin = fin || f[1] === 'fin'
      skipped += f[0].length
      rest = rest.slice(f[0].length)
    }
  }
  const lead = anywhere ? '' : '^'
  const twoOk = !anywhere // « 03/25 » seulement derrière un mot-clé
  const take = (m: RegExpExecArray | null, build: (m: RegExpExecArray) => (Omit<SeedDate, 'text' | 'kind'> & { fin: boolean }) | undefined) => {
    if (!m) return undefined
    const d = build(m)
    return d ? { d, end: skipped + m.index + m[0].length } : undefined
  }
  const attempts: (() => ReturnType<typeof take>)[] = [
    // 12/03/2025, 12.03.25
    () =>
      take(new RegExp(`${lead}(\\d{1,2})[/.\\-](\\d{1,2})[/.\\-](\\d{4}|\\d{2})(?!\\d)`).exec(rest), (m) => {
        const y = yearFrom(m[3], twoOk)
        const mo = Number(m[2])
        const da = Number(m[1])
        return y && realDay(y, mo, da) ? { precision: 'jour', year: y, month: mo, day: da, iso: `${y}-${pad(mo)}-${pad(da)}`, fin } : undefined
      }),
    // 2025-03-12
    () =>
      take(new RegExp(`${lead}(\\d{4})-(\\d{2})-(\\d{2})(?!\\d)`).exec(rest), (m) => {
        const y = Number(m[1])
        return realDay(y, Number(m[2]), Number(m[3])) ? { precision: 'jour', year: y, month: Number(m[2]), day: Number(m[3]), iso: `${y}-${m[2]}-${m[3]}`, fin } : undefined
      }),
    // 03/2025, 3.2025, 2025/03, 03/25
    () =>
      take(new RegExp(`${lead}(\\d{1,2})[/.\\-](\\d{4}|\\d{2})(?![\\d/])`).exec(rest), (m) => {
        const y = yearFrom(m[2], twoOk)
        const mo = Number(m[1])
        return y && mo >= 1 && mo <= 12 ? { precision: 'mois', year: y, month: mo, iso: `${y}-${pad(mo)}-01`, fin } : undefined
      }),
    () =>
      take(new RegExp(`${lead}(\\d{4})[/.](\\d{1,2})(?![\\d/])`).exec(rest), (m) => {
        const mo = Number(m[2])
        return mo >= 1 && mo <= 12 ? { precision: 'mois', year: Number(m[1]), month: mo, iso: `${m[1]}-${pad(mo)}-01`, fin } : undefined
      }),
    // 12 mars 2025, 1er mars 2025
    () =>
      take(new RegExp(`${lead}(\\d{1,2}|1er)\\s+(${MONTH_RE})\\.?\\s*(\\d{4})(?!\\d)`).exec(rest), (m) => {
        const mo = monthOf(m[2])
        const da = m[1] === '1er' ? 1 : Number(m[1])
        const y = Number(m[3])
        return mo && realDay(y, mo, da) ? { precision: 'jour', year: y, month: mo, day: da, iso: `${y}-${pad(mo)}-${pad(da)}`, fin } : undefined
      }),
    // mars 2025
    () =>
      take(new RegExp(`${lead}(${MONTH_RE})\\.?\\s*(\\d{4})(?!\\d)`).exec(rest), (m) => {
        const mo = monthOf(m[1])
        const y = Number(m[2])
        return mo ? { precision: 'mois', year: y, month: mo, iso: `${y}-${pad(mo)}-01`, fin } : undefined
      }),
  ]
  for (const a of attempts) {
    const r = a()
    if (r) return r
  }
  if (!anywhere) {
    const y = /^(\d{4})(?![\d/\-]|\.\d)/.exec(rest)
    if (y) return { d: { precision: 'annee', year: Number(y[1]), fin }, end: skipped + y[0].length }
    void kind
  }
  return undefined
}

const KIND_TEXT: Record<SeedDateKind, string> = { recolte: 'récolte', emballage: 'emballé en', lot: 'lot', avant: 'à semer avant', autre: 'date' }

function describe(kind: SeedDateKind, d: { precision: SeedDate['precision']; year: number; month?: number; day?: number }): string {
  const when = d.precision === 'annee' ? String(d.year) : `${d.precision === 'jour' ? `${d.day === 1 ? '1er' : d.day} ` : ''}${MONTH_LABEL[(d.month ?? 1) - 1]} ${d.year}`
  return `${KIND_TEXT[kind]} ${when}`
}

/** Les dates lues, la plus utile d'abord (récolte, emballage, lot, autre, puis « à semer avant »). Années plausibles seulement. */
export function parseSeedDates(rawText: string, now: Date = new Date()): SeedDate[] {
  const t = ` ${normalizeSearch(fixDigits(rawText.replace(/\r?\n/g, ' ')))} `
  const nowY = now.getFullYear()
  const found: SeedDate[] = []
  const used: [number, number][] = []
  const overlaps = (a: number, b: number) => used.some(([x, y]) => a < y && b > x)
  const accept = (kind: SeedDateKind, year: number) => (kind === 'avant' ? year >= nowY - 5 && year <= nowY + 15 : year >= nowY - 40 && year <= nowY)
  for (const [kind, re] of KIND_WORDS) {
    re.lastIndex = 0
    for (let m = re.exec(t); m; m = re.exec(t)) {
      const from = m.index + m[0].length
      const hit = dateAtStart(t.slice(from, from + 48), kind)
      if (!hit || !accept(kind, hit.d.year) || overlaps(from, from + hit.end)) continue
      let { iso } = hit.d
      // « avant fin mars 2027 » : le dernier jour du mois ; « avant 2027 » : pas de jour inventé.
      if (kind === 'avant' && hit.d.precision === 'mois' && iso) iso = `${hit.d.year}-${pad(hit.d.month!)}-${pad(lastDay(hit.d.year, hit.d.month!))}`
      const { fin: _fin, ...d } = hit.d
      void _fin
      found.push({ ...d, iso, kind, text: describe(kind, d) })
      used.push([m.index, from + hit.end])
    }
  }
  // Sans mot-clé : « mars 2025 » ou « 03/2025 » seuls (mois et année en toutes lettres ou en chiffres, 4 chiffres pour l'année).
  const loose = new RegExp(`(?<![\\d/])(?:(?:\\d{1,2}|1er)\\s+)?(?:${MONTH_RE}\\.?\\s*\\d{4}|\\d{1,2}[/.]\\d{4})(?!\\d)`, 'g')
  for (let m = loose.exec(t); m; m = loose.exec(t)) {
    if (overlaps(m.index, m.index + m[0].length)) continue
    const hit = dateAtStart(m[0], 'autre', true)
    if (!hit || !accept('autre', hit.d.year)) continue
    const { fin: _fin, ...d } = hit.d
    void _fin
    found.push({ ...d, kind: 'autre', text: describe('autre', d) })
    used.push([m.index, m.index + m[0].length])
  }
  return found.sort((a, b) => KIND_PRIORITY[a.kind] - KIND_PRIORITY[b.kind] || (b.precision === 'jour' ? 1 : 0) - (a.precision === 'jour' ? 1 : 0))
}

/** Mois écrits après un mot-clé (liste « avril, mai » ou plage « mars à juin »). Les dates « avant » sont écartées ; un chiffre ou un mot de la liste `cut` arrête la lecture. */
function monthsAfter(rawText: string, word: RegExp, cutWords: string): number[] {
  let t = ` ${normalizeSearch(rawText.replace(/\r?\n/g, ' \n '))} `
  // « à semer avant fin mars 2027 » n'est pas une période de semis.
  t = t.replace(new RegExp(`\\bavant\\b[^\\n]{0,40}?(?:\\d{4}|\\d{1,2}[/.]\\d{2,4})`, 'g'), ' ')
  const months = new Set<number>()
  const re = new RegExp(word.source, 'g')
  const cutRe = new RegExp(`\\n\\s*\\n|\\b(?:${cutWords})\\w*`)
  for (let m = re.exec(t); m; m = re.exec(t)) {
    let seg = t.slice(m.index + m[0].length, m.index + m[0].length + 90)
    const cut = seg.search(cutRe)
    if (cut >= 0) seg = seg.slice(0, cut)
    // Mois en chiffres : « semis : 03 à 05 », « récolte 9-11 » (jamais une mesure : cm, jours, g…).
    const numeric = /^\s*:?\s*(\d{1,2})\s*(?:a|au|à|-|–|—)\s*(\d{1,2})(?!\d)(?!\s*(?:cm|mm|jours?|j\b|g\b|gr|semaines?|sem\b|°|%|m\b|l\b))/.exec(seg)
    if (numeric) {
      const a = Number(numeric[1])
      const b = Number(numeric[2])
      if (a >= 1 && a <= 12 && b >= 1 && b <= 12) {
        for (let k = a; ; k = (k % 12) + 1) {
          months.add(k)
          if (k === b) break
        }
        continue
      }
    }
    // Un mois lu doit venir avant tout chiffre : « semis mars à mai 60 cm » s'arrête à « 60 ».
    const num = seg.search(/\d/)
    if (num >= 0) seg = seg.slice(0, num)
    const tokens = [...seg.matchAll(new RegExp(`\\b(${MONTH_RE})\\b\\.?|\\s(?:a|au|à|to|through|thru|until)\\s|[\\-–—/]`, 'g'))]
    let prev: number | undefined
    let range = false
    for (const tk of tokens) {
      const mo = tk[1] ? monthOf(tk[1]) : undefined
      if (mo) {
        if (range && prev) for (let k = prev; k !== mo; k = (k % 12) + 1) months.add(k)
        months.add(mo)
        prev = mo
        range = false
      } else range = prev !== undefined
    }
  }
  return [...months].sort((a, b) => a - b)
}

/** Mois de semis écrits après « semis » ou « semer ». */
export function parseSowMonths(rawText: string): number[] {
  return monthsAfter(rawText, /\b(?:sem(?:er|is|ez|ons|ailles?)|sow(?:ing)?)\b/, 'recolt|harvest|floraison|flowering|hauteur|height|distance|spacing|exposition|plantation|transplant|profondeur|depth|germination|sun|thin')
}

/** Mois de récolte écrits après « récolte » (ou « récolter »). */
export function parseHarvestMonths(rawText: string): number[] {
  return monthsAfter(rawText, /\b(?:recolt\w*|harvest\w*)/, 'sem|sow|floraison|flowering|hauteur|height|distance|spacing|exposition|plantation|transplant|profondeur|depth|germination|sun|thin')
}

const NOISE_LINE = /\b(?:sow|sowing|harvest|depth|spacing|net|wt|weight|seed|sun|shade|days|germination|height|organic|packet|season|plant|planting|semer|semis|semez|recolt\w*|sachet|poids|net|graines?|g|gr|bio|ab|www|http\w*|com|fr|avant|lot|date|conseils?|culture|exposition|profondeur|distance|arroser|eclaircir|germination|floraison|hauteur|origine|france|variete|cm|mm|approx\w*|contenu|environ|seeds?|samen|semillas|certifie|emball\w*|conditionn\w*|utiliser|preference|valable|mois|annee|ecocert|agriculture|biologique)\b|\d{3,}|[@/\\]/

const titleCase = (s: string) => {
  const t = s.toLowerCase()
  return t.charAt(0).toUpperCase() + t.slice(1)
}

const cleanLine = (l: string) => l.replace(/[|_~=*#<>{}[\]]/g, ' ').replace(/\s+/g, ' ').trim()

/** Nom d'espèce du catalogue le plus net dans les lignes : ligne exacte d'abord, puis nom entier dans une ligne ; égalité = la plus haute sur le sachet. */
export function findSeedSpecies(lines: string[], species: readonly Species[] = SPECIES): Species | undefined {
  const scores = new Map<Species, number>()
  const whole = ` ${normalizeSearch(lines.join(' '))} `
  lines.forEach((line, li) => {
    const n = normalizeSearch(line)
    if (n.length < 3 || n.length > 60) return
    const padded = ` ${n} `
    for (const s of species) {
      const names = [...[s.nomCommun, ...(s.alias ?? [])].map(normalizeSearch), ...englishNamesOf(s.id)]
      let score = 0
      const exact = searchRank(s, line) <= 1 && n.length <= 40
      if (exact) score = 200 + n.length
      for (const nm of names) {
        if (nm.length < 3) continue
        if (padded.includes(` ${nm} `) || padded.includes(` ${nm}s `) || padded.includes(` ${nm}x `)) score = Math.max(score, 50 + nm.length)
      }
      const latin = normalizeSearch(s.nomLatin)
      if (latin.length >= 8 && padded.includes(` ${latin} `)) score = Math.max(score, 60 + latin.length)
      // Un peu plus haut sur le sachet = un peu mieux (le titre est en tête).
      score = score ? score - li * 0.1 : 0
      if (score && score > (scores.get(s) ?? 0)) scores.set(s, score)
    }
  })
  // Variantes d'une même plante (« Haricot nain » / « Haricot à rames ») : le mot qui les distingue, lu ailleurs sur le sachet, tranche.
  let best: { s: Species; score: number } | undefined
  const top = Math.max(0, ...scores.values())
  for (const [s, base] of scores) {
    const extra = [...new Set([s.nomCommun, ...(s.alias ?? [])].flatMap((nm) => normalizeSearch(nm).split(' ')))].filter((w) => w.length >= 4 && !GENERIC_WORDS.has(w))
    const first = normalizeSearch(s.nomCommun).split(' ')[0]
    const bonus = base >= top - 1 && extra.some((w) => w !== first && whole.includes(` ${w} `)) ? 30 : 0
    const score = base + bonus
    if (!best || score > best.score) best = { s, score }
  }
  return best?.s
}
const GENERIC_WORDS = new Set(['vert', 'verte', 'rouge', 'blanc', 'blanche', 'petit', 'petite', 'grand', 'grande', 'commun', 'commune', 'doux', 'douce'])

/** Ligne la plus plausible comme nom, quand aucune plante du catalogue n'est reconnue : texte court, surtout des lettres, en tête du sachet. */
export function guessSeedName(lines: string[]): string | undefined {
  for (const raw of lines.slice(0, 8)) {
    const l = cleanLine(raw)
    if (l.length < 3 || l.length > 40) continue
    const letters = (l.match(/[A-Za-zÀ-ÿ]/g) ?? []).length
    if (letters < 3 || letters / l.length < 0.8) continue
    if (NOISE_LINE.test(normalizeSearch(l))) continue
    return titleCase(l.replace(/[^A-Za-zÀ-ÿ'’ \-]/g, '').trim())
  }
  return undefined
}

export function parseSeedText(rawText: string, now: Date = new Date(), species: readonly Species[] = SPECIES): SeedFacts {
  const lines = rawText
    .split(/\r?\n/)
    .map(cleanLine)
    .filter((l) => l.length >= 3)
  const sp = findSeedSpecies(lines, species)
  const facts: SeedFacts = { dates: parseSeedDates(rawText, now), sowMonths: parseSowMonths(rawText) }
  if (sp) {
    facts.name = sp.nomCommun
    facts.speciesId = sp.id
  } else {
    const guess = guessSeedName(lines)
    if (guess) facts.name = guess
  }
  return facts
}

/**
 * Ce que l'écran pré-remplit : la date (`at`) seulement si elle est un vrai jour ou un mois de récolte, d'emballage ou de lot ;
 * une année seule ou « à semer avant » va dans la note, jamais dans la date de récolte.
 */
export function seedProposal(facts: SeedFacts): { name?: string; at?: string; note?: string } {
  const out: { name?: string; at?: string; note?: string } = {}
  if (facts.name) out.name = facts.name
  const d = facts.dates[0]
  if (d) {
    if (d.kind !== 'avant' && d.precision !== 'annee' && d.iso) out.at = d.iso
    else out.note = d.text.charAt(0).toUpperCase() + d.text.slice(1)
  }
  return out
}

/** « mars, avril et mai » */
export function monthsText(months: readonly number[]): string {
  const names = months.map((m) => MONTH_LABEL[m - 1])
  return names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} et ${names[names.length - 1]}`
}

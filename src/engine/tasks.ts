// Moteur de tâches : quoi faire cette semaine (tailler, désherber, arroser, protéger…)
// à partir des règles des espèces, de la saison et de la météo.
import type {
  DailyWeather,
  Garden,
  GeneratedTask,
  Month,
  Plant,
  Species,
  TaskCondition,
  TaskDone,
  TaskRule,
  TaskType,
  WeatherBundle,
} from '../types'
import { isoDate } from '../lib/dates'
import { localDate, plantAgeYears } from './growth'
import { MONTH_NAMES, formatDoy, frostGate, plantingCalendar } from './calendar'

export interface TaskContext {
  garden: Garden
  plants: Plant[]
  speciesById: Record<string, Species>
  weather?: WeatherBundle
  today: Date
  tasksDone: TaskDone[]
}

const DAY_MS = 86400000
const TYPE_ORDER: TaskType[] = [
  'protection', 'arrosage', 'recolte', 'plantation', 'semis', 'taille', 'traitement',
  'desherbage', 'paillage', 'fertilisation', 'tuteurage', 'division',
]
const PRIORITY_ORDER = { haute: 0, normale: 1, basse: 2 } as const

/** Verbe à l'infinitif, pour « Bonne période pour … ». */
const TYPE_INFINITIVE: Record<TaskType, string> = {
  semis: 'semer', plantation: 'planter', taille: 'tailler', desherbage: 'désherber',
  arrosage: 'arroser', paillage: 'pailler', recolte: 'récolter', fertilisation: 'fertiliser',
  traitement: 'traiter', division: 'diviser', protection: 'protéger', tuteurage: 'tuteurer',
}

/** Verbe + forme d'article : « les » → les X / votre X ; « des » → des X / de votre X. */
const TYPE_VERB: Record<TaskType, [string, 'les' | 'des']> = {
  semis: ['Semer', 'les'], plantation: ['Planter', 'les'], taille: ['Tailler', 'les'],
  desherbage: ['Désherber au pied', 'des'], arrosage: ['Arroser', 'les'], paillage: ['Pailler', 'les'],
  recolte: ['Récolter', 'les'], fertilisation: ['Fertiliser', 'les'], traitement: ['Traiter', 'les'],
  division: ['Diviser', 'les'], protection: ['Protéger', 'les'], tuteurage: ['Tuteurer', 'les'],
}

const CONDITION_LABEL: Record<TaskCondition, string> = {
  'hors-gel': "À faire seulement s'il ne gèle pas.",
  'apres-pluie': 'Mieux vaut le faire après une pluie.',
  'temps-sec': 'Choisissez un temps sec.',
  chaleur: 'À faire par forte chaleur (plus de 25 °C).',
  'apres-recolte': 'À faire après la récolte.',
}

const WEEKDAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']

// ---------- Dates ----------

const pad = (n: number) => String(n).padStart(2, '0')

/** Semaine ISO 8601, ex. "2026-W42". */
export function weekKey(d: Date): string {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const dow = t.getUTCDay() || 7
  t.setUTCDate(t.getUTCDate() + 4 - dow) // jeudi de la même semaine
  const yearStart = Date.UTC(t.getUTCFullYear(), 0, 1)
  const week = Math.ceil(((t.getTime() - yearStart) / DAY_MS + 1) / 7)
  return `${t.getUTCFullYear()}-W${pad(week)}`
}

/** « aujourd'hui », « demain » ou le nom du jour. */
function dayLabel(date: string, todayIso: string): string {
  const [y, m, d] = date.split('-').map(Number)
  const [ty, tm, td] = todayIso.split('-').map(Number)
  const diff = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(ty, tm - 1, td)) / DAY_MS)
  if (diff === 0) return "aujourd'hui"
  if (diff === 1) return 'demain'
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]
}

const fmt = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',')
const fmtT = (n: number) => String(Math.round(n) || 0)

// ---------- Fenêtres de mois ----------

/** Découpe une liste de mois en fenêtres contiguës (circulaires : décembre → mars). */
function monthWindows(months: Month[]): { start: Month; end: Month }[] {
  const set = new Set(months)
  if (set.size >= 12) return [{ start: 1, end: 12 }]
  const out: { start: Month; end: Month }[] = []
  for (const m of [...set].sort((a, b) => a - b)) {
    const prev = (m === 1 ? 12 : m - 1) as Month
    if (set.has(prev)) continue
    let end = m
    for (let next = (end % 12) + 1; set.has(next as Month); next = (next % 12) + 1) end = next as Month
    out.push({ start: m, end })
  }
  return out
}

function monthsLabel(months: Month[]): string {
  const ws = monthWindows(months)
  if (ws.length === 1 && ws[0].start === 1 && ws[0].end === 12) return "toute l'année"
  return ws
    .map((w) => {
      const span = ((w.end - w.start + 12) % 12) + 1
      if (span === 1) return MONTH_NAMES[w.start - 1]
      if (span === 2) return `${MONTH_NAMES[w.start - 1]} et ${MONTH_NAMES[w.end - 1]}`
      return `de ${MONTH_NAMES[w.start - 1]} à ${MONTH_NAMES[w.end - 1]}`
    })
    .join(', puis ')
}

/** Clé de période d'une tâche saisonnière : année de début de la fenêtre (2026, ou 2026-09 s'il y a plusieurs fenêtres). */
function seasonKey(months: Month[], today: Date): string {
  const month = (today.getMonth() + 1) as Month
  const year = today.getFullYear()
  const ws = monthWindows(months)
  const w = ws.find((w) => (w.start <= w.end ? month >= w.start && month <= w.end : month >= w.start || month <= w.end))
  if (!w || (w.start === 1 && w.end === 12)) return String(year)
  const startYear = w.start > month ? year - 1 : year
  return ws.length > 1 ? `${startYear}-${pad(w.start)}` : String(startYear)
}

// ---------- Clés de tâches ----------
//
// Format : `période:espèce:type:règle[:plantes]`
//  - période : jour (fréquence < 7 j), semaine ISO (≥ 7 j) ou saison (tâche saisonnière) ;
//  - règle : identifiant dérivé du contenu (mois + condition), indépendant de l'ordre dans `sp.taches` ;
//  - plantes : étiquettes courtes (4 car.) des plantes concernées, triées, séparées par « . ».
//    Elles disent quelles plantes ont été couvertes : une plante ajoutée plus tard fait réapparaître la tâche.
// Anciennes clés (règle = index, pas de plantes) : encore reconnues, elles couvrent toutes les plantes.
// Alerte gel : `date-de-la-première-nuit:jardin:protection:gel`.

interface ParsedKey {
  prefix: string
  /** `espèce:type:règle` (ou `jardin:type:nom`). */
  base: string
  /** null = toutes les plantes (ancienne clé ou tâche du jardin). */
  tags: string[] | null
}

export function parseTaskKey(key: string): ParsedKey {
  const parts = key.split(':')
  if (parts.length < 4) return { prefix: parts[0], base: parts.slice(1).join(':'), tags: null }
  return { prefix: parts[0], base: parts.slice(1, 4).join(':'), tags: parts[4] ? parts[4].split('.') : null }
}

/** Étiquette courte et stable d'une plante (FNV-1a sur l'id, 4 caractères base 36). */
function plantTag(id: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return (h % 36 ** 4).toString(36).padStart(4, '0')
}

const tagsOf = (plants: Plant[]) => [...new Set(plants.map((p) => plantTag(p.id)))].sort()

/** Identifiant d'une règle d'après son contenu : `m1.2.3.12+hors-gel`. */
function ruleContentId(rule: TaskRule): string {
  const months = [...new Set(rule.months)].sort((a, b) => a - b).join('.')
  return `m${months}${rule.condition ? `+${rule.condition}` : ''}`
}

/** Identifiants des règles d'une espèce ; deux règles identiques sont distinguées par un rang (`-2`). */
function ruleIds(sp: Species): string[] {
  const seen = new Map<string, number>()
  return sp.taches.map((rule) => {
    const id = ruleContentId(rule)
    const n = (seen.get(id) ?? 0) + 1
    seen.set(id, n)
    return n > 1 ? `${id}-${n}` : id
  })
}

const FREQUENT_PREFIX = /^(\d{4}-\d{2}-\d{2}|\d{4}-W\d{2})$/

/**
 * Purge de l'historique des tâches faites (à appeler au chargement) :
 *  - supprime les entrées de plus de 400 jours ;
 *  - pour les tâches fréquentes (période = jour ou semaine), ne garde que la dernière entrée
 *    qui couvre chaque plante (les anciennes ne servent plus à rien) ;
 *  - garde les tâches saisonnières et les alertes de gel de moins de 400 jours.
 * Les entrées à date illisible sont conservées. Ne modifie pas l'entrée, garde l'ordre.
 */
export function purgeTasksDone(done: TaskDone[], now: Date): TaskDone[] {
  const limit = now.getTime() - 400 * DAY_MS
  const timeOf = (t: TaskDone) => {
    const at = new Date(t.doneAt).getTime()
    return Number.isFinite(at) ? at : null
  }
  const fresh = done.filter((t) => {
    const at = timeOf(t)
    return at == null || at >= limit
  })
  const state = new Map<string, { all: boolean; tags: Set<string> }>()
  const drop = new Set<TaskDone>()
  const newestFirst = [...fresh].sort((a, b) => (timeOf(b) ?? -Infinity) - (timeOf(a) ?? -Infinity))
  for (const t of newestFirst) {
    const k = parseTaskKey(t.taskKey)
    if (!FREQUENT_PREFIX.test(k.prefix) || k.base.startsWith('jardin:protection')) continue
    const id = `${t.gardenId ?? ''}|${k.base}`
    const st = state.get(id) ?? { all: false, tags: new Set<string>() }
    state.set(id, st)
    if (st.all) {
      drop.add(t)
    } else if (!k.tags) {
      st.all = true
    } else {
      const added = k.tags.filter((x) => !st.tags.has(x))
      if (!added.length) drop.add(t)
      for (const x of added) st.tags.add(x)
    }
  }
  return fresh.filter((t) => !drop.has(t))
}

// ---------- Noms ----------

const INVARIABLE = /[sxz]$/
const OU_X = new Set(['chou', 'genou', 'caillou', 'bijou', 'hibou', 'joujou', 'pou'])
const PREPOSITIONS = new Set(['de', 'des', 'du', "d'", 'à', 'au', 'aux', 'en', 'sur'])

function pluralWord(w: string): string {
  return w
    .split('-')
    .map((p) => {
      const l = p.toLowerCase()
      if (!p || INVARIABLE.test(l)) return p
      if (/(eau|au|eu)$/.test(l) && l !== 'pneu' && l !== 'bleu') return p + 'x'
      if (OU_X.has(l)) return p + 'x'
      return p + 's'
    })
    .join('-')
}

/** Pluriel simple d'un nom commun : « Tomate cerise » → « tomates cerises », « Fraisier des bois » → « fraisiers des bois ». */
export function pluralFr(name: string): string {
  const words = lowerFirst(name).split(' ')
  let stop = false
  return words
    .map((w) => {
      if (stop) return w
      if (PREPOSITIONS.has(w.toLowerCase()) || w.toLowerCase().startsWith("d'")) {
        stop = true
        return w
      }
      return pluralWord(w)
    })
    .join(' ')
}

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)

function taskTitle(type: TaskType, sp: Species, n: number): string {
  const [verb, art] = TYPE_VERB[type]
  if (n > 1) return `${verb} ${art} ${pluralFr(sp.nomCommun)} (${n})`
  return `${verb} ${art === 'des' ? 'de votre' : 'votre'} ${lowerFirst(sp.nomCommun)}`
}

// ---------- Météo ----------

const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0)
const round1 = (n: number) => Math.round(n * 10) / 10

interface WeatherView {
  past: DailyWeather[]
  upcoming: DailyWeather[]
}

function viewOf(weather: WeatherBundle, today?: Date): WeatherView {
  const byDate = (a: DailyWeather, b: DailyWeather) => a.date.localeCompare(b.date)
  const iso = today ? isoDate(today) : undefined
  const past = [...weather.past].filter((d) => !iso || d.date < iso).sort(byDate).slice(-7)
  let upcoming = [...weather.forecast].sort(byDate)
  if (iso) {
    const f = upcoming.filter((d) => d.date >= iso)
    if (f.length) upcoming = f
  }
  return { past, upcoming }
}

/**
 * Bilan hydrique sur les 7 derniers jours : ETP (et0) − pluie.
 * deficitMm négatif = excédent d'eau. forecastRain3 = pluie prévue sur les 3 prochains jours.
 */
export function waterBalance(
  weather: WeatherBundle,
  today?: Date,
): { rain7: number; et07: number; deficitMm: number; forecastRain3: number } {
  const { past, upcoming } = viewOf(weather, today)
  const rain7 = round1(sum(past.map((d) => d.rainMm)))
  const et07 = round1(sum(past.map((d) => d.et0Mm)))
  const forecastRain3 = round1(sum(upcoming.slice(0, 3).map((d) => d.rainMm)))
  return { rain7, et07, deficitMm: round1(et07 - rain7), forecastRain3 }
}

// ---------- Génération ----------

/** Règle applicable à une plante, avec son identifiant stable. */
interface RuleEntry {
  /** Identifiant dans la clé : contenu de la règle (explicite) ou `cal-…` (implicite). */
  id: string
  /** Ancienne clé (index dans `sp.taches`), pour reconnaître les tâches déjà cochées. */
  legacyId?: string
  rule: TaskRule
  /** Mois effectifs (après décalage par les gelées locales). */
  months: Month[]
  /** Mois où l'on est trop tôt par rapport aux dernières gelées (tâche affichée mais bloquée). */
  frostMonths: Set<Month>
}

interface Group {
  sp: Species
  entry: RuleEntry
  plants: Plant[]
}

const isActive = (p: Plant) => p.status === 'en-place' || p.status === 'malade'

/** Mois de grâce après la fin de la récolte d'une annuelle (arrachage, nettoyage) avant qu'elle ne génère plus rien. */
const ANNUAL_GRACE_DAYS = 30

/**
 * Une annuelle a fini sa saison : la fenêtre de récolte qui suit sa plantation est terminée depuis plus de 30 jours
 * (sans récolte connue : un an après la plantation). Elle ne génère alors plus de tâche (ni arrosage, ni désherbage,
 * ni alerte de gel) : à l'utilisateur de la retirer ou de la marquer « mort ». Les vivaces ne sont jamais concernées.
 */
export function annualSeasonOver(p: Plant, sp: Species, today: Date): boolean {
  if (sp.vivace || sp.anneesMaturite > 2 || !isActive(p)) return false
  const planted = localDate(p.plantedAt)
  if (!Number.isFinite(planted.getTime())) return false
  const harvest = new Set(sp.recolte ?? [])
  let end: Date | undefined
  if (harvest.size > 0 && harvest.size < 12) {
    // Premier mois, à partir de la plantation, qui est le dernier d'une fenêtre de récolte.
    for (let i = 0; i < 24 && !end; i++) {
      const d = new Date(planted.getFullYear(), planted.getMonth() + i, 1)
      const m = (d.getMonth() + 1) as Month
      const next = ((m % 12) + 1) as Month
      if (harvest.has(m) && !harvest.has(next)) end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59)
    }
  }
  end ??= new Date(planted.getFullYear() + 1, planted.getMonth(), planted.getDate())
  return today.getTime() > end.getTime() + ANNUAL_GRACE_DAYS * DAY_MS
}
const isSowing = (t: TaskType) => t === 'semis' || t === 'plantation'

const HOWTO_SEMIS = 'Semer en place dans un sol ameubli et désherbé, recouvrir de terre fine puis arroser en pluie fine.'
const HOWTO_PLANTATION = 'Creuser un trou deux fois plus large que la motte, planter sans enterrer le collet, arroser copieusement puis pailler.'
const HOWTO_RECOLTE = 'Cueillez à maturité, de préférence le matin ; ne laissez pas les fruits mûrs sur la plante.'
const HOWTO_ARROSAGE =
  "Arroser au pied, le matin ou le soir : 10 à 15 L par m² ou par jeune arbre, en une fois plutôt qu'un peu chaque jour. Pailler pour garder l'humidité."
const HOWTO_GEL =
  "Poser un voile d'hivernage sur les plantes basses et les jeunes arbres, pailler épais au pied, rentrer les pots à l'abri. Retirer le voile en journée."

/** Au-delà de cet âge (ans), une vivace est établie : plus d'arrosage météo (sauf espèces gourmandes en eau). */
const ESTABLISHED_YEARS = 3

/**
 * Âge minimal (ans) pour qu'une règle s'applique. `minAgeYears` explicite l'emporte.
 * Récolte d'une vivace à maturité lente (≥ 3 ans) : 60 % de la maturité, borné entre 2 et 8 ans.
 * Annuelles et vivaces à maturité rapide (menthe, fraisier…) : aucun seuil.
 */
export function harvestMinAgeYears(sp: Species, rule: TaskRule): number {
  if (rule.minAgeYears != null) return rule.minAgeYears
  if (rule.type !== 'recolte' || !sp.vivace || !(sp.anneesMaturite >= 3)) return 0
  return Math.max(2, Math.min(8, Math.round(0.6 * sp.anneesMaturite)))
}

/** Règles implicites tirées du calendrier de l'espèce : semis/plantation (projet), récolte (plante en place). */
function implicitRules(sp: Species, garden: Garden, status: Plant['status']): { id: string; rule: TaskRule }[] {
  const out: { id: string; rule: TaskRule }[] = []
  if (status === 'projet') {
    if (sp.taches.some((r) => isSowing(r.type))) return out
    const cal = plantingCalendar(sp, garden)
    const condition: TaskCondition | undefined = sp.rusticiteC > -2 ? 'hors-gel' : undefined
    if (cal.semisPleineTerre.length) {
      out.push({ id: 'cal-semis', rule: { type: 'semis', months: cal.semisPleineTerre, condition, howTo: HOWTO_SEMIS } })
    }
    if (cal.plantation.length) {
      out.push({ id: 'cal-plantation', rule: { type: 'plantation', months: cal.plantation, condition, howTo: HOWTO_PLANTATION } })
    }
  } else if (status === 'en-place' || status === 'malade') {
    // Seulement si l'espèce n'a aucune règle de récolte explicite (pas de doublon).
    if (sp.taches.some((r) => r.type === 'recolte')) return out
    const { recolte } = plantingCalendar(sp, garden)
    if (recolte.length) {
      out.push({ id: 'cal-recolte', rule: { type: 'recolte', months: recolte, frequencyDays: 7, howTo: HOWTO_RECOLTE } })
    }
  }
  return out
}

/** Le semis de ce mois est-il sous abri (donc non concerné par les gelées) ? */
const sownUnderCover = (sp: Species, m: Month) => !!sp.semisAbri?.includes(m) && !sp.semisPleineTerre?.includes(m)

/** Règles explicites d'une espèce : identifiants stables, mois décalés par les gelées locales. */
function explicitRules(sp: Species, garden: Garden): RuleEntry[] {
  const ids = ruleIds(sp)
  const gate = frostGate(sp, garden)
  return sp.taches.map((rule, i) => {
    let months = [...rule.months]
    const frostMonths = new Set<Month>()
    if (gate && isSowing(rule.type)) {
      for (const m of rule.months) {
        if (!gate.tooEarly(m) || (rule.type === 'semis' && sownUnderCover(sp, m))) continue
        frostMonths.add(m)
        months.push(gate.firstOk)
      }
      months = [...new Set(months)]
    }
    return { id: ids[i], legacyId: String(i), rule, months, frostMonths }
  })
}

/** Récolte en cours (ou à venir dans la fenêtre) : message de blocage pour `apres-recolte`. */
function harvestBlock(recolte: Month[], month: Month): { blockedBy: string; detail: string } | undefined {
  if (!recolte.includes(month)) return undefined
  const w = monthWindows(recolte).find((w) => (w.start <= w.end ? month >= w.start && month <= w.end : month >= w.start || month <= w.end))
  const end = w ? w.end : month
  return {
    blockedBy: 'Attendre : la récolte est en cours',
    detail: `Récolte en cours jusqu'en ${MONTH_NAMES[end - 1]} : attendez la fin.`,
  }
}

export function generateTasks(ctx: TaskContext): GeneratedTask[] {
  const { garden, plants, speciesById, weather, today } = ctx
  const month = (today.getMonth() + 1) as Month
  const todayIso = isoDate(today)
  const week = weekKey(today)

  // Historique des tâches faites, indexé par clé de base (sans période ni plantes).
  const done = ctx.tasksDone.filter((t) => !t.gardenId || t.gardenId === garden.id)
  const doneKeys = new Set(done.map((t) => t.taskKey))
  interface DoneEntry { prefix: string; at: number; tags: Set<string> | null }
  const doneByBase = new Map<string, DoneEntry[]>()
  for (const t of done) {
    const k = parseTaskKey(t.taskKey)
    const list = doneByBase.get(k.base) ?? []
    list.push({ prefix: k.prefix, at: new Date(t.doneAt).getTime(), tags: k.tags ? new Set(k.tags) : null })
    doneByBase.set(k.base, list)
  }
  /** Tâche de jardin (sans plantes) faite il y a moins de `days` jours ? */
  const recentlyDone = (base: string, days: number) =>
    (doneByBase.get(base) ?? []).some((e) => today.getTime() - e.at < days * DAY_MS)
  /** Cette plante est-elle déjà couverte par une tâche faite (période identique, ou récente si fréquente) ? */
  const covered = (bases: string[], prefix: string, freq: number | undefined, tag: string) =>
    bases.some((b) =>
      (doneByBase.get(b) ?? []).some(
        (e) => (!e.tags || e.tags.has(tag)) && (freq ? today.getTime() - e.at < freq * DAY_MS : e.prefix === prefix),
      ),
    )

  const wx = weather ? viewOf(weather, today) : undefined
  const balance = weather ? waterBalance(weather, today) : undefined
  const next3 = wx?.upcoming.slice(0, 3) ?? []
  const rainPast3 = wx ? round1(sum(wx.past.slice(-3).map((d) => d.rainMm))) : 0
  const rainNext2 = wx ? round1(sum(wx.upcoming.slice(0, 2).map((d) => d.rainMm))) : 0
  const frostSoon = next3.find((d) => d.tMin <= 0)
  const heavyRain = balance != null && balance.forecastRain3 > 5
  const deficitHigh = balance != null && balance.deficitMm > 10

  // Une vivace de plus de 3 ans (hors arrivée récente) est établie : elle ne compte plus dans l'arrosage météo.
  const established = (p: Plant, sp: Species) => {
    const planted = new Date(p.plantedAt).getTime()
    const inGround = Number.isFinite(planted) ? (today.getTime() - planted) / (365.25 * DAY_MS) : 0
    return sp.vivace && inGround >= 1 && plantAgeYears(p, today) > ESTABLISHED_YEARS
  }
  const meteoEligible = (p: Plant) => {
    const sp = speciesById[p.speciesId]
    return !!sp && (sp.eau === 'eleve' || !established(p, sp))
  }
  const plantById = new Map(plants.map((p) => [p.id, p]))
  const wateringPriority = (ids: string[]): GeneratedTask['priority'] =>
    ids.some((id) => {
      const p = plantById.get(id)
      const sp = p && speciesById[p.speciesId]
      return !p || !sp || !established(p, sp)
    })
      ? 'haute'
      : 'normale'

  const tasks: GeneratedTask[] = []

  // 1. Arrosage déclenché par le bilan hydrique
  let meteoWatering: GeneratedTask | undefined
  let meteoWateringHidden = false
  if (balance && deficitHigh) {
    const base = 'jardin:arrosage:meteo'
    const thirsty = plants.filter((p) => {
      const sp = speciesById[p.speciesId]
      if (!sp || !isActive(p) || !meteoEligible(p) || annualSeasonOver(p, sp, today)) return false
      const planted = new Date(p.plantedAt).getTime()
      const young = Number.isFinite(planted) && today.getTime() - planted < 365.25 * DAY_MS
      return sp.eau === 'moyen' || sp.eau === 'eleve' || young
    })
    meteoWateringHidden = recentlyDone(base, 3)
    if (thirsty.length && !meteoWateringHidden) {
      const detail =
        `Déficit en eau : ${fmt(balance.deficitMm)} mm sur 7 jours (pluie ${fmt(balance.rain7)} mm, évaporation ${fmt(balance.et07)} mm). ` +
        `Pluie prévue sous 3 jours : ${fmt(balance.forecastRain3)} mm.`
      const plantIds = thirsty.map((p) => p.id)
      meteoWatering = {
        key: `${todayIso}:${base}`,
        type: 'arrosage',
        title: `Arroser les plantes sensibles au sec (${thirsty.length})`,
        howTo: HOWTO_ARROSAGE,
        plantIds,
        priority: wateringPriority(plantIds),
        reason: heavyRain
          ? 'Pas assez de pluie ces 7 derniers jours, mais de la pluie arrive : inutile d\'arroser.'
          : "Pas assez de pluie ces 7 derniers jours : arrosez les jeunes plantations et les plantes qui aiment l'eau.",
        detail,
        ...(heavyRain ? { blockedBy: 'Attendre : pluie prévue' } : {}),
      }
      tasks.push(meteoWatering)
    }
  }
  const meteoWateringActive = deficitHigh && !heavyRain

  // 2. Alerte gel : plantes en place moins rustiques que la température prévue.
  // La clé est la date de la première nuit de gel (stable quand la prévision se précise).
  if (wx) {
    const frostDays = wx.upcoming.filter((d) => d.tMin <= 0)
    if (frostDays.length) {
      const first = frostDays[0]
      const coldest = frostDays.reduce((c, d) => (d.tMin < c.tMin ? d : c), first)
      const atRisk = plants.filter((p) => isActive(p) && speciesById[p.speciesId] && speciesById[p.speciesId].rusticiteC > coldest.tMin && !annualSeasonOver(p, speciesById[p.speciesId], today))
      const key = `${first.date}:jardin:protection:gel`
      if (atRisk.length && !doneKeys.has(key)) {
        const spNames = [...new Set(atRisk.map((p) => lowerFirst(speciesById[p.speciesId].nomCommun)))]
        const list = spNames.slice(0, 4).join(', ') + (spNames.length > 4 ? '…' : '')
        const verb = atRisk.length > 1 ? 'risquent' : 'risque'
        const stronger =
          coldest.date !== first.date ? `, jusqu'à ${fmtT(coldest.tMin)} °C ${dayLabel(coldest.date, todayIso)}` : ''
        tasks.push({
          key,
          type: 'protection',
          title: `Protéger du gel : ${list}${atRisk.length > 1 ? ` (${atRisk.length})` : ''}`,
          howTo: HOWTO_GEL,
          plantIds: atRisk.map((p) => p.id),
          priority: 'haute',
          reason: `Gel prévu ${dayLabel(first.date, todayIso)} (${fmtT(first.tMin)} °C${stronger}) : ${list} ${verb} de geler.`,
        })
      }
    }
  }

  // 3. Règles des espèces, regroupées par (espèce, règle)
  const groups = new Map<string, Group>()
  const explicitCache = new Map<string, RuleEntry[]>()
  for (const p of plants) {
    const sp = speciesById[p.speciesId]
    if (!sp || p.status === 'mort' || annualSeasonOver(p, sp, today)) continue
    let explicit = explicitCache.get(sp.id)
    if (!explicit) explicitCache.set(sp.id, (explicit = explicitRules(sp, garden)))
    const rules: RuleEntry[] = [
      ...explicit,
      ...implicitRules(sp, garden, p.status).map(({ id, rule }) => ({ id, rule, months: rule.months, frostMonths: new Set<Month>() })),
    ]
    const age = plantAgeYears(p, today)
    for (const entry of rules) {
      const { rule } = entry
      if (!entry.months.includes(month)) continue
      if (isSowing(rule.type) ? p.status !== 'projet' : !isActive(p)) continue
      if (age < harvestMinAgeYears(sp, rule)) continue
      if (rule.maxAgeYears != null && age > rule.maxAgeYears) continue
      const id = `${sp.id}:${entry.id}`
      const g = groups.get(id) ?? { sp, entry, plants: [] }
      g.plants.push(p)
      groups.set(id, g)
    }
  }

  for (const { sp, entry, plants: gp } of groups.values()) {
    const { rule } = entry
    const base = `${sp.id}:${rule.type}:${entry.id}`
    const bases = entry.legacyId ? [base, `${sp.id}:${rule.type}:${entry.legacyId}`] : [base]
    const freq = rule.frequencyDays
    const prefix = freq ? (freq < 7 ? todayIso : week) : seasonKey(rule.months, today)
    // Plantes pas encore couvertes par une tâche faite.
    let todo = gp.filter((p) => !covered(bases, prefix, freq, plantTag(p.id)))
    if (!todo.length) continue

    // L'arrosage météo couvre déjà les plantes concernées : on les y rattache.
    if (rule.type === 'arrosage' && meteoWateringActive && (meteoWatering || meteoWateringHidden)) {
      const mergeable = todo.filter(meteoEligible)
      if (meteoWatering) {
        for (const p of mergeable) if (!meteoWatering.plantIds.includes(p.id)) meteoWatering.plantIds.push(p.id)
        meteoWatering.title = `Arroser les plantes sensibles au sec (${meteoWatering.plantIds.length})`
        meteoWatering.priority = wateringPriority(meteoWatering.plantIds)
      }
      todo = todo.filter((p) => !meteoEligible(p))
      if (!todo.length) continue
    }

    const key = `${prefix}:${base}:${tagsOf(todo).join('.')}`
    const monthsShown = entry.months
    let reason = `Bonne période pour ${TYPE_INFINITIVE[rule.type]} : ${monthsLabel(monthsShown)}.`
    if (rule.condition) reason += ` ${CONDITION_LABEL[rule.condition]}`
    if (freq) reason += ` À refaire tous les ${freq} jours.`
    let priority: GeneratedTask['priority'] = 'normale'
    let blockedBy: string | undefined
    const details: string[] = []

    if (rule.type === 'traitement' && todo.some((p) => p.status === 'malade')) {
      priority = 'haute'
      reason += ' Une plante est signalée malade.'
    }

    switch (rule.condition) {
      case 'hors-gel':
        if (frostSoon) {
          blockedBy = 'Attendre : risque de gel'
          details.push(`Gel prévu ${dayLabel(frostSoon.date, todayIso)} (${fmtT(frostSoon.tMin)} °C).`)
        }
        break
      case 'apres-pluie':
        if (wx) {
          if (rainPast3 >= 2) {
            priority = 'haute'
            reason += ' Le sol est humide : désherbage facile.'
            details.push(`Pluie des 3 derniers jours : ${fmt(rainPast3)} mm.`)
          } else {
            reason += ' Le sol est sec : désherbage plus difficile.'
          }
        }
        break
      case 'temps-sec':
        if (rainNext2 > 1) {
          blockedBy = 'Attendre : pluie prévue'
          details.push(`Pluie prévue sous 48 h : ${fmt(rainNext2)} mm.`)
        }
        break
      case 'chaleur': {
        if (wx) {
          const hot = next3.find((d) => d.tMax > 25)
          if (!hot) continue // pas de chaleur prévue : rien à faire
          priority = 'haute'
          reason += ` Chaleur prévue ${dayLabel(hot.date, todayIso)}.`
          details.push(`${fmtT(hot.tMax)} °C prévus ${dayLabel(hot.date, todayIso)}.`)
        } else {
          priority = 'basse'
        }
        break
      }
      case 'apres-recolte':
        // Faisable dans la fenêtre de la règle, hors des mois de récolte (sans mois de récolte : jamais bloquée).
        {
          const hb = harvestBlock(plantingCalendar(sp, garden).recolte, month)
          if (hb) {
            blockedBy = hb.blockedBy
            details.push(hb.detail)
          }
        }
        break
      default:
        break
    }

    // Semis / plantation trop tôt pour les gelées locales.
    if (!blockedBy && entry.frostMonths.has(month)) {
      const gate = frostGate(sp, garden)
      if (gate) {
        blockedBy = 'Attendre : risque de gel au printemps'
        details.push(`Dernières gelées vers le ${formatDoy(gate.lastFrostDoy)} : attendez ${MONTH_NAMES[gate.firstOk - 1]}.`)
      }
    }

    if (rule.type === 'arrosage' && balance && !blockedBy) {
      if (heavyRain) {
        blockedBy = 'Attendre : pluie prévue'
        details.push(`Pluie prévue sous 3 jours : ${fmt(balance.forecastRain3)} mm.`)
      } else if (balance.deficitMm <= 0) {
        priority = 'basse'
        reason += ' Il a assez plu ces 7 derniers jours : arrosage peu utile.'
        details.push(`Pluie des 7 derniers jours : ${fmt(balance.rain7)} mm.`)
      }
    }
    // Des arbres établis ne déclenchent jamais de priorité haute pour l'arrosage.
    if (rule.type === 'arrosage' && priority === 'haute' && todo.every((p) => !meteoEligible(p))) priority = 'normale'

    tasks.push({
      key,
      type: rule.type,
      title: taskTitle(rule.type, sp, todo.length),
      howTo: rule.howTo,
      ...(rule.tool ? { tool: rule.tool } : {}),
      plantIds: todo.map((p) => p.id),
      speciesId: sp.id,
      priority,
      reason,
      ...(details.length ? { detail: details.join(' ') } : {}),
      ...(blockedBy ? { blockedBy } : {}),
    })
  }

  return tasks.sort(
    (a, b) =>
      Number(!!a.blockedBy) - Number(!!b.blockedBy) ||
      PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] ||
      TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type) ||
      a.title.localeCompare(b.title, 'fr'),
  )
}

/** Calendrier annuel : pour chaque mois, les tâches prévues par (type, espèce) et le nombre de plantes concernées. */
export function yearPlan(
  plants: Plant[],
  speciesById: Record<string, Species>,
): { month: Month; tasks: { type: TaskType; speciesId: string; count: number }[] }[] {
  const out = Array.from({ length: 12 }, (_, i) => ({
    month: (i + 1) as Month,
    tasks: [] as { type: TaskType; speciesId: string; count: number }[],
  }))
  const counts = out.map(() => new Map<string, { type: TaskType; speciesId: string; plants: Set<string> }>())
  for (const p of plants) {
    const sp = speciesById[p.speciesId]
    if (!sp || p.status === 'mort') continue
    for (const rule of sp.taches) {
      if (isSowing(rule.type) ? p.status !== 'projet' : !isActive(p)) continue
      for (const m of new Set(rule.months)) {
        const map = counts[m - 1]
        const id = `${rule.type}:${sp.id}`
        const e = map.get(id) ?? { type: rule.type, speciesId: sp.id, plants: new Set<string>() }
        e.plants.add(p.id)
        map.set(id, e)
      }
    }
  }
  counts.forEach((map, i) => {
    out[i].tasks = [...map.values()]
      .map((e) => ({ type: e.type, speciesId: e.speciesId, count: e.plants.size }))
      .sort((a, b) => TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type) || a.speciesId.localeCompare(b.speciesId))
  })
  return out
}

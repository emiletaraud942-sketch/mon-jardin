// Alertes de jardin nommées : canicule, sécheresse, vent fort.
// Module pur : il lit la météo déjà chargée (prévision + 7 jours passés + bilan hydrique) et ne touche ni aux plantes
// ni aux espèces. `generateTasks` (tasks.ts) en fait des tâches « Urgent » et décide qui est concerné.
// Donnée absente (hors ligne, ancien cache sans rafales, jours manquants) : l'alerte correspondante ne se déclenche pas.
import type { DailyWeather, WeatherBundle } from '../types'
import { isoDate } from '../lib/dates'

export type AlertKind = 'canicule' | 'secheresse' | 'vent'

/**
 * Seuils. Ils sont volontairement simples et lisibles ; ils ne remplacent pas la vigilance de Météo-France.
 * - Canicule : 32 °C de maximale, 3 jours de suite. Météo-France fixe un seuil par département (maximales de 31 à 36 °C,
 *   sur 3 jours et 3 nuits) ; 32 °C est un seuil unique, au milieu de cette fourchette, à partir duquel les jeunes plants
 *   et les légumes-feuilles souffrent. Trois jours : un pic isolé de 33 °C ne justifie pas une alerte.
 * - Sécheresse : manque d'eau de 30 mm sur 7 jours (évaporation moins pluie, le bilan de `waterBalance`), soit le triple du
 *   seuil de l'arrosage météo (10 mm) : en été l'évaporation est de 4 à 6 mm par jour, donc 30 mm = presque aucune pluie
 *   pendant une semaine chaude. Une semaine sèche ordinaire reste du ressort de l'arrosage météo ; ici c'est un état de sécheresse. Et moins de 5 mm de pluie
 *   prévue sous 5 jours (même 5 mm que « pluie qui arrive » pour l'arrosage) : si la pluie vient, inutile d'alerter.
 *   Il faut au moins 5 jours de passé connus pour parler de bilan.
 * - Vent fort : rafales de 60 km/h ou plus (Beaufort 8, « coup de vent » : les pots se couchent, les jeunes arbres plient),
 *   sur les 3 prochains jours seulement, car la prévision des rafales est peu fiable au-delà.
 */
export const ALERT_THRESHOLDS = {
  caniculeTmaxC: 32,
  caniculeDays: 3,
  secheresseDeficitMm: 30,
  secheresseRainMm: 5,
  secheresseRainDays: 5,
  secheresseMinPastDays: 5,
  secheresseMinForecastDays: 3,
  ventGustKmh: 60,
  ventDays: 3,
} as const

/** Le mot affiché à côté de l'icône. */
export const ALERT_LABEL: Record<AlertKind, string> = { canicule: 'Canicule', secheresse: 'Sécheresse', vent: 'Vent fort' }

/** Nom de l'icône (`Icon`) : toujours accompagnée du mot, jamais seule. */
export const ALERT_ICON: Record<AlertKind, string> = { canicule: 'sun', secheresse: 'drop', vent: 'wind' }

/** `jardin:type:nom` des clés de tâche : la clé complète est `date:` + cette base (voir « Clés de tâches », tasks.ts). */
export const ALERT_BASE: Record<AlertKind, string> = {
  canicule: 'jardin:protection:canicule',
  secheresse: 'jardin:arrosage:secheresse',
  vent: 'jardin:protection:vent',
}

/** Conseils (exportés pour le test de longueur : 6 phrases au plus, 20 mots au plus par phrase). */
export const HOWTO_CANICULE =
  "Arrosez le soir, au pied, quand la terre a refroidi. Paillez épais pour garder la fraîcheur. Ombrez les jeunes plants avec un voile ou une toile. Ne taillez pas pendant la chaleur. Mettez les pots à l'ombre."
export const HOWTO_SECHERESSE =
  "Arrosez en profondeur, mais moins souvent : 10 à 15 L par m² d'un coup. Arrosez tôt le matin ou le soir. Paillez épais pour garder l'humidité. Gardez l'eau pour les jeunes plantes et le potager."
export const HOWTO_VENT =
  "Tuteurez les jeunes arbres et les plantes hautes. Rentrez les pots ou couchez-les à l'abri. Fixez bien les voiles et les filets. Ne laissez rien traîner qui puisse s'envoler. Après le vent, vérifiez les attaches et les branches cassées."

export interface WeatherAlert {
  kind: AlertKind
  /** Date (YYYY-MM-DD) de la clé : 1er jour de chaleur ou de vent fort, aujourd'hui pour la sécheresse. */
  date: string
  title: string
  /** Pourquoi, en une phrase simple. */
  reason: string
  /** Chiffres, à la demande. */
  detail: string
  howTo: string
}

/** Clé de tâche complète, stable tant que la prévision ne change pas le premier jour. */
export const alertKey = (a: Pick<WeatherAlert, 'kind' | 'date'>) => `${a.date}:${ALERT_BASE[a.kind]}`

// ---------- Dates et mots ----------

const WEEKDAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']
const DAY_MS = 86400000

/** Jours entiers entre deux dates `YYYY-MM-DD` (calendrier : pas d'heure d'été, pas de décalage de mois). */
function dayDiff(from: string, to: string): number {
  const [y1, m1, d1] = from.split('-').map(Number)
  const [y2, m2, d2] = to.split('-').map(Number)
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / DAY_MS)
}

function weekday(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]
}

/** « aujourd'hui », « demain » ou le nom du jour. */
function dayWord(date: string, todayIso: string): string {
  const diff = dayDiff(todayIso, date)
  return diff === 0 ? "aujourd'hui" : diff === 1 ? 'demain' : weekday(date)
}

const byDate = (a: DailyWeather, b: DailyWeather) => a.date.localeCompare(b.date)
const deg = (n: number) => String(Math.round(n) || 0)
const fmt = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',')

// ---------- Canicule ----------

/** Jours de passé et de prévision, triés, sans doublon de date. */
function allDays(weather: WeatherBundle): DailyWeather[] {
  const seen = new Set<string>()
  return [...weather.past, ...weather.forecast]
    .sort(byDate)
    .filter((d) => (seen.has(d.date) ? false : (seen.add(d.date), true)))
}

/**
 * Première série de jours consécutifs (en dates réelles : un jour manquant la coupe) à 32 °C ou plus, d'au moins 3 jours,
 * dont un jour au moins est aujourd'hui ou à venir. Les jours déjà passés comptent : une canicule commencée il y a deux jours
 * et prévue encore deux jours est bien une canicule de 4 jours. La clé reste ainsi la même pendant toute la vague.
 */
function heatRun(weather: WeatherBundle, todayIso: string): DailyWeather[] | undefined {
  const runs: DailyWeather[][] = []
  let run: DailyWeather[] = []
  for (const d of allDays(weather)) {
    if (!(d.tMax >= ALERT_THRESHOLDS.caniculeTmaxC)) {
      run = []
      continue
    }
    const prev = run[run.length - 1]
    if (!prev || dayDiff(prev.date, d.date) !== 1) {
      run = []
      runs.push(run)
    }
    run.push(d)
  }
  return runs.find((r) => r.length >= ALERT_THRESHOLDS.caniculeDays && r[r.length - 1].date >= todayIso)
}

function caniculeAlert(weather: WeatherBundle, todayIso: string): WeatherAlert | undefined {
  const run = heatRun(weather, todayIso)
  if (!run) return undefined
  const first = run[0]
  const last = run[run.length - 1]
  const ahead = run.filter((d) => d.date >= todayIso)
  const max = Math.max(...ahead.map((d) => d.tMax))
  let when: string
  if (first.date >= todayIso) {
    const from = dayDiff(todayIso, first.date) === 0 ? "d'aujourd'hui" : dayDiff(todayIso, first.date) === 1 ? 'de demain' : `du ${weekday(first.date)}`
    // Une série dure 3 jours au moins : le dernier jour est toujours un nom de jour (« du jeudi au samedi », « de demain à samedi »).
    when = `prévue ${from} ${from.startsWith('du ') ? 'au' : 'à'} ${weekday(last.date)}`
  } else {
    const end = dayDiff(todayIso, last.date)
    when = `en cours, jusqu'à ${end === 0 ? 'ce soir' : end === 1 ? 'demain' : weekday(last.date)}`
  }
  return {
    kind: 'canicule',
    date: first.date,
    title: 'Canicule : protéger le jardin',
    reason: `Canicule ${when}. Maximum prévu : ${deg(max)} °C.`,
    detail:
      `Températures maximales : ${ahead.map((d) => `${dayWord(d.date, todayIso)} ${deg(d.tMax)} °C`).join(', ')}. ` +
      `Alerte à partir de ${ALERT_THRESHOLDS.caniculeTmaxC} °C pendant ${ALERT_THRESHOLDS.caniculeDays} jours de suite.`,
    howTo: HOWTO_CANICULE,
  }
}

// ---------- Sécheresse ----------

function secheresseAlert(
  weather: WeatherBundle,
  todayIso: string,
  balance: { rain7: number; et07: number; deficitMm: number } | undefined,
): WeatherAlert | undefined {
  if (!balance) return undefined
  const past = weather.past.filter((d) => d.date < todayIso)
  const ahead = [...weather.forecast].filter((d) => d.date >= todayIso).sort(byDate).slice(0, ALERT_THRESHOLDS.secheresseRainDays)
  if (past.length < ALERT_THRESHOLDS.secheresseMinPastDays || ahead.length < ALERT_THRESHOLDS.secheresseMinForecastDays) return undefined
  if (!(balance.deficitMm >= ALERT_THRESHOLDS.secheresseDeficitMm)) return undefined
  const rainAhead = Math.round(ahead.reduce((s, d) => s + d.rainMm, 0) * 10) / 10
  if (!(rainAhead < ALERT_THRESHOLDS.secheresseRainMm)) return undefined
  // Pas de chiffre dans la phrase (les mm sont dans `detail`), comme l'arrosage météo.
  const forecastWords = rainAhead < 1 ? `presque aucune pluie n'est prévue` : `peu de pluie est prévue`
  return {
    kind: 'secheresse',
    date: todayIso,
    title: 'Sécheresse : arroser en profondeur',
    reason: `Très peu de pluie depuis 7 jours, et ${forecastWords}. Le sol est très sec.`,
    detail:
      `Pluie des 7 derniers jours : ${fmt(balance.rain7)} mm. Eau évaporée : ${fmt(balance.et07)} mm. ` +
      `Pluie prévue sous ${ahead.length} jours : ${fmt(rainAhead)} mm. Alerte à partir de ${ALERT_THRESHOLDS.secheresseDeficitMm} mm de manque.`,
    howTo: HOWTO_SECHERESSE,
  }
}

// ---------- Vent fort ----------

function ventAlert(weather: WeatherBundle, todayIso: string): WeatherAlert | undefined {
  const next = [...weather.forecast].filter((d) => d.date >= todayIso).sort(byDate).slice(0, ALERT_THRESHOLDS.ventDays)
  const windy = next.filter((d) => d.gustKmh != null && d.gustKmh >= ALERT_THRESHOLDS.ventGustKmh)
  if (!windy.length) return undefined
  const first = windy[0]
  const strongest = windy.reduce((c, d) => (d.gustKmh! > c.gustKmh! ? d : c), first)
  const reason =
    strongest.date === first.date
      ? `Vent fort prévu ${dayWord(first.date, todayIso)} : rafales jusqu'à ${deg(first.gustKmh!)} km/h.`
      : `Vent fort prévu ${dayWord(first.date, todayIso)} (${deg(first.gustKmh!)} km/h), jusqu'à ${deg(strongest.gustKmh!)} km/h ${dayWord(strongest.date, todayIso)}.`
  return {
    kind: 'vent',
    date: first.date,
    title: 'Vent fort : protéger les plantes',
    reason,
    detail:
      `Rafales maximales : ${windy.map((d) => `${dayWord(d.date, todayIso)} ${deg(d.gustKmh!)} km/h`).join(', ')}. ` +
      `Alerte à partir de ${ALERT_THRESHOLDS.ventGustKmh} km/h, sur les ${ALERT_THRESHOLDS.ventDays} prochains jours.`,
    howTo: HOWTO_VENT,
  }
}

/**
 * Alertes de jardin actives. `balance` est le bilan hydrique de `waterBalance(weather, today)` (même calcul que l'arrosage météo).
 * Sans météo, rien. Ordre fixe : canicule, sécheresse, vent fort.
 */
export function detectAlerts(
  weather: WeatherBundle | undefined,
  today: Date,
  balance?: { rain7: number; et07: number; deficitMm: number },
): WeatherAlert[] {
  if (!weather) return []
  const todayIso = isoDate(today)
  return [caniculeAlert(weather, todayIso), secheresseAlert(weather, todayIso, balance), ventAlert(weather, todayIso)].filter(
    (a): a is WeatherAlert => !!a,
  )
}

// ---------- Phrase de l'accueil ----------

const HOME_ONE: Record<AlertKind, string> = {
  canicule: 'Canicule prévue : arrosez le soir.',
  secheresse: 'Sécheresse : arrosez en profondeur.',
  vent: 'Vent fort prévu : rentrez les pots.',
}

/** Une phrase courte pour l'accueil (rien s'il n'y a pas d'alerte). Plusieurs alertes : leurs noms, dans l'ordre. */
export function alertHomeSentence(kinds: readonly AlertKind[]): string | undefined {
  const list = [...new Set(kinds)]
  if (list.length === 0) return undefined
  if (list.length === 1) return HOME_ONE[list[0]]
  const names = list.map((k) => ALERT_LABEL[k].toLowerCase())
  return `Alertes : ${names.slice(0, -1).join(', ')} et ${names[names.length - 1]}.`
}

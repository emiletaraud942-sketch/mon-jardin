// Export du calendrier au format iCalendar (.ics), pour l'agenda du téléphone. Fonction pure : aucune donnée n'est envoyée.
// Les heures sont « flottantes » (sans fuseau) : 9 h reste 9 h où que l'on soit. Le rappel est un VALARM de l'agenda, sans serveur.
import type { TaskType } from '../types'

export interface IcsPlanMonth {
  month: number
  tasks: { type: TaskType; speciesId: string; count: number }[]
}

export interface IcsInput {
  /** Résultat de `yearPlan`. */
  plan: IcsPlanMonth[]
  /** Tâches de la semaine (titre et raison), pour le rappel quotidien. */
  week?: { title: string; reason: string }[]
  now: Date
  gardenName: string
  typeLabel: (t: TaskType) => string
  speciesName: (id: string) => string
  /** Heure du rappel (par défaut 9). */
  hour?: number
  /** Nombre de jours du rappel quotidien (par défaut 7). */
  dailyDays?: number
}

const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
const p2 = (n: number) => String(n).padStart(2, '0')

/** Texte iCalendar : barre oblique, point-virgule, virgule et saut de ligne protégés. */
export function escapeText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
}

/** Plie une ligne à 75 octets (UTF-8) au plus, la suite commence par une espace. Ne coupe jamais un caractère. */
export function foldLine(line: string): string {
  const enc = new TextEncoder()
  if (enc.encode(line).length <= 75) return line
  const parts: string[] = []
  let cur = ''
  let bytes = 0
  let limit = 75
  for (const ch of line) {
    const n = enc.encode(ch).length
    if (bytes + n > limit) {
      parts.push(cur)
      cur = ''
      bytes = 0
      limit = 74 // l'espace de continuation compte pour 1 octet
    }
    cur += ch
    bytes += n
  }
  parts.push(cur)
  return parts.join('\r\n ')
}

const stamp = (d: Date) => `${d.getUTCFullYear()}${p2(d.getUTCMonth() + 1)}${p2(d.getUTCDate())}T${p2(d.getUTCHours())}${p2(d.getUTCMinutes())}${p2(d.getUTCSeconds())}Z`
const local = (y: number, m: number, d: number, h: number) => `${y}${p2(m)}${p2(d)}T${p2(h)}0000`

/** Identifiant stable : le même fichier réimporté met à jour les rappels au lieu de les doubler. */
function uid(parts: string, host = 'permajardin.app') {
  const clean = parts.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase()
  return `${clean}@${host}`
}

function event(lines: { uid: string; start: string; summary: string; description: string; now: Date; rrule?: string; alarmText: string }): string[] {
  return [
    'BEGIN:VEVENT',
    `UID:${lines.uid}`,
    `DTSTAMP:${stamp(lines.now)}`,
    `DTSTART:${lines.start}`,
    // Durée d'un quart d'heure : un rappel, pas un rendez-vous.
    'DURATION:PT15M',
    ...(lines.rrule ? [`RRULE:${lines.rrule}`] : []),
    `SUMMARY:${escapeText(lines.summary)}`,
    `DESCRIPTION:${escapeText(lines.description)}`,
    'TRANSP:TRANSPARENT',
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapeText(lines.alarmText)}`,
    'TRIGGER:PT0S',
    'END:VALARM',
    'END:VEVENT',
  ]
}

/** Contenu du fichier .ics : un rappel par mois du calendrier (12 mois à partir d'aujourd'hui), plus un rappel quotidien. */
export function buildIcs(input: IcsInput): string {
  const { plan, week, now, gardenName, typeLabel, speciesName } = input
  const hour = input.hour ?? 9
  const days = input.dailyDays ?? 7
  const out: string[] = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//PermaJardin//Calendrier//FR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', `X-WR-CALNAME:${escapeText('PermaJardin : ' + gardenName)}`]

  const y0 = now.getFullYear()
  const m0 = now.getMonth() + 1
  for (let i = 0; i < 12; i++) {
    const m = ((m0 - 1 + i) % 12) + 1
    const y = y0 + Math.floor((m0 - 1 + i) / 12)
    const entry = plan.find((e) => e.month === m)
    if (!entry || entry.tasks.length === 0) continue
    // Mois en cours : le rappel tombe aujourd'hui, pas le 1er (déjà passé).
    const day = i === 0 ? now.getDate() : 1
    const list = entry.tasks.map((t) => `${typeLabel(t.type)} : ${speciesName(t.speciesId)}${t.count > 1 ? ` (${t.count})` : ''}`)
    out.push(
      ...event({
        uid: uid(`mois-${y}-${p2(m)}-${gardenName}`),
        start: local(y, m, day, hour),
        summary: `Jardin en ${MONTHS[m - 1]} : ${entry.tasks.length} tâche${entry.tasks.length > 1 ? 's' : ''}`,
        description: list.join('\n'),
        now,
        alarmText: `Jardin en ${MONTHS[m - 1]}`,
      }),
    )
  }

  if (week && week.length > 0) {
    const first = Math.min(week.length, 8)
    const text = week.slice(0, first).map((t) => `${t.title} (${t.reason})`).join('\n') + (week.length > first ? `\n… et ${week.length - first} autre${week.length - first > 1 ? 's' : ''}` : '')
    out.push(
      ...event({
        uid: uid(`jour-${y0}-${p2(m0)}-${p2(now.getDate())}-${gardenName}`),
        start: local(y0, m0, now.getDate(), hour),
        summary: 'Jardin : les tâches du jour',
        description: text + '\n\nOuvrez PermaJardin pour la liste à jour.',
        now,
        rrule: `FREQ=DAILY;COUNT=${days}`,
        alarmText: 'Regardez les tâches du jardin',
      }),
    )
  }

  out.push('END:VCALENDAR')
  return out.map(foldLine).join('\r\n') + '\r\n'
}

import { TASK_LABEL } from '../data/labels'
import type { Month, Plant, Species, TaskType } from '../types'
import { yearPlan } from '../engine/tasks'

// Export du calendrier de l'année au format iCalendar (.ics) : s'ouvre dans l'agenda du téléphone ou de l'ordinateur.
// Un événement « journée entière » par (tâche, plante, fenêtre de mois), répété chaque année. Aucune donnée n'est envoyée.

/** Échappe un texte de propriété iCalendar (RFC 5545 §3.3.11). */
export function icsEscape(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
}

/** Coupe une ligne à 75 octets UTF-8 (RFC 5545 §3.1) : les lignes suivantes commencent par une espace. */
export function icsFold(line: string): string {
  const enc = new TextEncoder()
  if (enc.encode(line).length <= 75) return line
  const out: string[] = []
  let cur = ''
  let bytes = 0
  const limit = () => (out.length === 0 ? 75 : 74) // la continuation compte son espace de tête
  for (const ch of line) {
    const n = enc.encode(ch).length
    if (bytes + n > limit()) {
      out.push(cur)
      cur = ''
      bytes = 0
    }
    cur += ch
    bytes += n
  }
  out.push(cur)
  return out.join('\r\n ')
}

const pad = (n: number) => String(n).padStart(2, '0')
const day = (y: number, m: number, d: number) => `${y}${pad(m)}${pad(d)}`

/** Fenêtres de mois contiguës (circulaires : novembre → février). */
function windows(months: Month[]): { start: Month; length: number }[] {
  const set = new Set(months)
  if (set.size === 0) return []
  if (set.size >= 12) return [{ start: 1, length: 12 }]
  const out: { start: Month; length: number }[] = []
  for (const m of [...set].sort((a, b) => a - b)) {
    if (set.has((m === 1 ? 12 : m - 1) as Month)) continue
    let length = 1
    for (let n = (m % 12) + 1; set.has(n as Month); n = (n % 12) + 1) length++
    out.push({ start: m, length })
  }
  return out
}

export interface IcsOptions {
  gardenName: string
  /** Année du premier événement (les suivants se répètent chaque année). */
  year: number
  now?: Date
}

/** Texte .ics du calendrier de l'année pour ces plantes. Vide de toute tâche : un calendrier sans événement. */
export function buildIcs(plants: Plant[], speciesById: Record<string, Species>, opts: IcsOptions): string {
  const now = opts.now ?? new Date()
  const stamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`
  const plan = yearPlan(plants, speciesById)
  // (type, espèce) → mois et nombre de plantes
  const byTask = new Map<string, { type: TaskType; speciesId: string; months: Month[]; count: number }>()
  for (const m of plan) {
    for (const t of m.tasks) {
      const key = `${t.type}:${t.speciesId}`
      const e = byTask.get(key) ?? { type: t.type, speciesId: t.speciesId, months: [], count: t.count }
      e.months.push(m.month)
      e.count = Math.max(e.count, t.count)
      byTask.set(key, e)
    }
  }
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//PermaJardin//Calendrier du jardin//FR',
    'CALSCALE:GREGORIAN',
    `X-WR-CALNAME:${icsEscape(`Jardin : ${opts.gardenName}`)}`,
  ]
  for (const e of byTask.values()) {
    const sp = speciesById[e.speciesId]
    if (!sp) continue
    const rule = sp.taches.find((r) => r.type === e.type)
    for (const w of windows(e.months)) {
      const endMonthIndex = w.start - 1 + w.length // mois suivant la fin (0 à 23)
      const endYear = opts.year + Math.floor(endMonthIndex / 12)
      const endMonth = (endMonthIndex % 12) + 1
      const summary = `${TASK_LABEL[e.type]} : ${sp.nomCommun}${e.count > 1 ? ` (${e.count})` : ''}`
      const description = [rule?.howTo, 'Période conseillée pour votre jardin. Calendrier PermaJardin.'].filter(Boolean).join('\n\n')
      lines.push(
        'BEGIN:VEVENT',
        `UID:${e.type}-${e.speciesId}-m${w.start}@permajardin.local`,
        `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${day(opts.year, w.start, 1)}`,
        `DTEND;VALUE=DATE:${day(endYear, endMonth, 1)}`,
        'RRULE:FREQ=YEARLY',
        `SUMMARY:${icsEscape(summary)}`,
        `DESCRIPTION:${icsEscape(description)}`,
        'TRANSP:TRANSPARENT',
        'END:VEVENT',
      )
    }
  }
  lines.push('END:VCALENDAR')
  return lines.map(icsFold).join('\r\n') + '\r\n'
}

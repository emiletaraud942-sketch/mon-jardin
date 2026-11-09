import type { GeneratedTask, Plant } from '../../types'

// « Ma semaine » : les lignes de la page imprimable et du texte à partager.
// Fonction pure : elle reçoit les tâches déjà calculées (`useTasks`), aucune règle métier nouvelle.

export interface WeekRow {
  /** Phrase d'action, déjà écrite par le moteur (« Tailler le pommier »). */
  title: string
  /** Noms des plantes concernées (« Pommier, Rosier »), vide pour une tâche du jardin entier. */
  plants: string
  /** Pourquoi maintenant, en une phrase. */
  reason: string
}

export interface WeekGroup {
  id: 'urgent' | 'semaine'
  title: string
  rows: WeekRow[]
}

export interface WeekSheet {
  title: string
  /** « Du lundi 9 au dimanche 15 novembre 2026 ». */
  range: string
  groups: WeekGroup[]
  /** Aucune tâche à faire. */
  empty: boolean
  /** « Jardin : Chez moi · édité le 9 novembre 2026 ». */
  footer: string
}

const MAX_NAMES = 6

/** Lundi et dimanche de la semaine de `now`, en toutes lettres. */
export function weekRange(now: Date): string {
  const mon = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7))
  const sun = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 6)
  const fr = (d: Date, o: Intl.DateTimeFormatOptions) => d.toLocaleDateString('fr-FR', o)
  const sameMonth = mon.getMonth() === sun.getMonth() && mon.getFullYear() === sun.getFullYear()
  const from = sameMonth ? fr(mon, { weekday: 'long', day: 'numeric' }) : fr(mon, { weekday: 'long', day: 'numeric', month: 'long' })
  const to = fr(sun, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  return `Du ${from} au ${to}`.replace(/\b1 (?=\p{L})/gu, '1er ')
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

function plantNames(task: GeneratedTask, plants: Plant[], speciesName: (id: string) => string | undefined): string {
  const names: string[] = []
  for (const id of task.plantIds) {
    const p = plants.find((x) => x.id === id)
    const n = p ? p.customName || speciesName(p.speciesId) : undefined
    if (n && !names.includes(cap(n))) names.push(cap(n))
  }
  if (names.length === 0 && task.speciesId) {
    const n = speciesName(task.speciesId)
    if (n) names.push(cap(n))
  }
  if (names.length <= MAX_NAMES) return names.join(', ')
  return `${names.slice(0, MAX_NAMES).join(', ')} et ${names.length - MAX_NAMES} autres`
}

export function buildWeekSheet(o: {
  tasks: GeneratedTask[]
  plants: Plant[]
  speciesName: (id: string) => string | undefined
  gardenName: string
  now: Date
}): WeekSheet {
  // Mêmes tâches que l'écran : celles qu'on peut faire (pas « à faire plus tard »), les urgentes d'abord.
  const open = o.tasks.filter((t) => !t.blockedBy)
  const row = (t: GeneratedTask): WeekRow => ({ title: t.title, plants: plantNames(t, o.plants, o.speciesName), reason: t.reason })
  const groups: WeekGroup[] = [
    { id: 'urgent' as const, title: 'Urgent', rows: open.filter((t) => t.priority === 'haute').map(row) },
    { id: 'semaine' as const, title: 'Cette semaine', rows: open.filter((t) => t.priority !== 'haute').map(row) },
  ].filter((g) => g.rows.length > 0)
  const day = o.now.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
  return {
    title: 'Ma semaine',
    range: weekRange(o.now),
    groups,
    empty: groups.length === 0,
    footer: `Jardin : ${o.gardenName} · édité le ${day}`,
  }
}

/** Le même contenu en texte, pour « Partager » (cases ☐ à cocher au stylo). */
export function weekSheetText(s: WeekSheet): string {
  const lines = [s.title, s.range, '']
  if (s.empty) lines.push('Rien à faire cette semaine : profitez du jardin.', '')
  for (const g of s.groups) {
    lines.push(`${g.title} (${g.rows.length})`)
    for (const r of g.rows) {
      lines.push(`☐ ${r.title}`)
      if (r.plants) lines.push(`   Plantes : ${r.plants}`)
      if (r.reason) lines.push(`   ${r.reason}`)
    }
    lines.push('')
  }
  lines.push(s.footer)
  return lines.join('\n')
}

// Liste de courses et de semis : les plantes « prévues » (statut projet), regroupées par espèce, avec la bonne période.
// Pur : reçoit les espèces en paramètre.
import { plantingCalendar } from '../../engine/calendar'
import { monthsPhrase } from '../../lib/monthPhrase'
import type { Garden, Month, Plant, Species } from '../../types'

export interface ShoppingItem {
  speciesId: string
  name: string
  count: number
  /** Une phrase par geste : « semis sous abri en mars et avril ». */
  windows: string[]
  /** Un geste est possible ce mois-ci. */
  now: boolean
  note?: string
}

/** Plantes prévues regroupées par espèce. Celles à faire ce mois-ci passent en premier, puis l'ordre alphabétique. */
export function buildShoppingList(plants: Plant[], speciesById: Record<string, Species>, garden: Garden, month: Month): ShoppingItem[] {
  const groups = new Map<string, { name: string; count: number; sp?: Species }>()
  for (const p of plants) {
    if (p.status !== 'projet') continue
    const sp = speciesById[p.speciesId]
    const id = sp ? sp.id : `libre:${p.customName?.trim().toLowerCase() || p.speciesId}`
    const g = groups.get(id) ?? { name: sp?.nomCommun ?? (p.customName?.trim() || 'Plante'), count: 0, sp }
    g.count++
    groups.set(id, g)
  }
  const items: ShoppingItem[] = []
  for (const [id, g] of groups) {
    if (!g.sp) {
      items.push({ speciesId: id, name: g.name, count: g.count, windows: [], now: false })
      continue
    }
    const cal = plantingCalendar(g.sp, garden)
    const windows: string[] = []
    if (cal.semisAbri.length) windows.push(`semis sous abri ${monthsPhrase(cal.semisAbri)}`)
    if (cal.semisPleineTerre.length) windows.push(`semis en pleine terre ${monthsPhrase(cal.semisPleineTerre)}`)
    if (cal.plantation.length) windows.push(`plantation ${monthsPhrase(cal.plantation)}`)
    const now = [...cal.semisAbri, ...cal.semisPleineTerre, ...cal.plantation].includes(month)
    items.push({ speciesId: g.sp.id, name: g.name, count: g.count, windows, now, ...(cal.note ? { note: cal.note } : {}) })
  }
  return items.sort((a, b) => Number(b.now) - Number(a.now) || a.name.localeCompare(b.name, 'fr'))
}

/** Une ligne par espèce : « 3 × Tomate : semis sous abri en mars ; plantation en mai. » */
export const itemWhen = (i: ShoppingItem): string => (i.windows.length ? i.windows.join(' ; ') : 'période : voir la fiche')

export function itemLine(i: ShoppingItem): string {
  return `${i.count} × ${i.name} : ${itemWhen(i)}.${i.now ? ' À faire ce mois-ci.' : ''}`
}

/** Texte à copier ou partager. */
export function shoppingText(items: ShoppingItem[], gardenName: string): string {
  const total = items.reduce((n, i) => n + i.count, 0)
  const head = `Liste de courses et de semis : ${gardenName} (${total} plante${total > 1 ? 's' : ''})`
  return [head, '', ...items.map((i) => '- ' + itemLine(i))].join('\n')
}

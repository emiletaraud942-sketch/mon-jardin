// « Que semer ce mois » : la feuille imprimable et le texte à partager (animateurs, bibliothèques, voisins).
// Fonction pure : elle reçoit les listes déjà calculées par `whatToSowNow`, aucune règle métier nouvelle.

export interface SowGroup {
  id: 'abri' | 'pleine-terre' | 'plantation' | 'recolte'
  title: string
  names: string[]
}

export interface SowSheet {
  title: string
  /** « Mois de novembre ». */
  subtitle: string
  groups: SowGroup[]
  /** Rien à indiquer ce mois-ci. */
  empty: boolean
  /** « Jardin : Chez moi · édité le 13 novembre 2026 ». */
  footer: string
}

/** Un nom par ligne, sans doublon, majuscule initiale. */
const uniq = (names: string[]) => [...new Set(names.map((n) => n.charAt(0).toUpperCase() + n.slice(1)))]

export function buildSowSheet(o: {
  monthName: string
  gardenName: string
  now: Date
  semisAbri: string[]
  semisPleineTerre: string[]
  plantation: string[]
  recolte: string[]
}): SowSheet {
  const groups: SowGroup[] = [
    { id: 'abri' as const, title: 'Semer à l’abri', names: uniq(o.semisAbri) },
    { id: 'pleine-terre' as const, title: 'Semer en pleine terre', names: uniq(o.semisPleineTerre) },
    { id: 'plantation' as const, title: 'Planter', names: uniq(o.plantation) },
    { id: 'recolte' as const, title: 'Récolter', names: uniq(o.recolte) },
  ].filter((g) => g.names.length > 0)
  const day = o.now.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
  return {
    title: 'Que semer et planter',
    subtitle: `Mois : ${o.monthName.toLowerCase()}`,
    groups,
    empty: groups.length === 0,
    footer: `Jardin : ${o.gardenName} · édité le ${day} · conseils généraux, à adapter à votre sol et votre climat`,
  }
}

/** Le même contenu en texte, pour « Partager » (cases ☐ à cocher au stylo). */
export function sowSheetText(s: SowSheet): string {
  const lines = [s.title, s.subtitle, '']
  if (s.empty) lines.push('Rien à indiquer ce mois-ci.', '')
  for (const g of s.groups) {
    lines.push(`${g.title} (${g.names.length})`)
    for (const n of g.names) lines.push(`☐ ${n}`)
    lines.push('')
  }
  lines.push(s.footer)
  return lines.join('\n')
}

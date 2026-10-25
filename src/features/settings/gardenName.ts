export const DEFAULT_GARDEN_NAME = 'Mon jardin'

/** Nom non vide et unique : « Mon jardin » si vide, puis « Mon jardin 2 », « Mon jardin 3 »… si déjà pris. */
export function uniqueGardenName(raw: string, others: string[]): string {
  const base = raw.trim().replace(/\s+/g, ' ') || DEFAULT_GARDEN_NAME
  const taken = new Set(others.map((n) => n.trim().toLowerCase()))
  if (!taken.has(base.toLowerCase())) return base
  const stem = base.replace(/\s+\d+$/, '') || DEFAULT_GARDEN_NAME
  for (let i = 2; ; i++) {
    const candidate = `${stem} ${i}`
    if (!taken.has(candidate.toLowerCase())) return candidate
  }
}

// Plafond de marqueurs interactifs sur la carte 2D : un `div` à `tabIndex` 0 par plante donnerait 500 nœuds DOM
// et 500 arrêts de Tab pour 500 plantes. On ne rend que ceux qui sont dans la vue, et au plus `MARKER_BUDGET`
// (les plus proches du centre). Les autres restent des points dessinés par la carte (couche `plant-dots`) et dans la liste « Mes plantes ».
// Module pur : des points en pixels d'écran, pas de DOM.

/** Nombre maximal de marqueurs interactifs (zone tactile de 44 px et arrêt de Tab) à l'écran. */
export const MARKER_BUDGET = 150
/** Marge hors écran (px) : un marqueur est prêt un peu avant d'entrer dans la vue. */
export const MARKER_MARGIN_PX = 48
/** Un marqueur déjà rendu garde sa place tant qu'un autre n'est pas nettement plus proche (évite le clignotement). */
const KEEP_BONUS = 0.85

export interface ScreenPoint {
  id: string
  /** Position en pixels, repère de la carte (0,0 = coin haut-gauche). */
  x: number
  y: number
}

export interface MarkerSelection {
  /** Identifiants à rendre en marqueurs interactifs. */
  ids: Set<string>
  /** Plantes dans la vue (marge comprise). */
  inView: number
  /** Plantes de la vue qui n'ont pas de marqueur interactif. */
  overflow: number
}

/**
 * Choisit les marqueurs à rendre.
 * - `keep` : toujours rendus, même hors vue (plante choisie, plante glissée, plante au focus clavier) ; ils comptent dans le plafond.
 * - Dans la vue : tous si leur nombre tient dans `budget`, sinon les plus proches du centre.
 * - `current` : ceux déjà rendus, légèrement favorisés au départage.
 */
export function selectMarkerIds(o: {
  points: ScreenPoint[]
  width: number
  height: number
  budget?: number
  margin?: number
  keep?: Iterable<string>
  current?: ReadonlySet<string>
}): MarkerSelection {
  const budget = Math.max(0, Math.floor(o.budget ?? MARKER_BUDGET))
  const margin = o.margin ?? MARKER_MARGIN_PX
  const keep = new Set(o.keep ?? [])
  const current = o.current ?? new Set<string>()
  const unbounded = !(o.width > 0 && o.height > 0) // carte pas encore mesurée : toute plante est candidate
  const cx = o.width / 2
  const cy = o.height / 2
  const ids = new Set<string>()
  const candidates: { id: string; d: number }[] = []
  let inView = 0
  let keptInView = 0
  for (const p of o.points) {
    const inside = unbounded || (p.x >= -margin && p.x <= o.width + margin && p.y >= -margin && p.y <= o.height + margin)
    if (inside) inView++
    if (keep.has(p.id)) {
      if (ids.size < budget || budget === 0) ids.add(p.id)
      if (inside) keptInView++
      continue
    }
    if (!inside) continue
    const d = Math.hypot(p.x - cx, p.y - cy)
    candidates.push({ id: p.id, d: current.has(p.id) ? d * KEEP_BONUS : d })
  }
  candidates.sort((a, b) => a.d - b.d || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  for (const c of candidates) {
    if (ids.size >= budget) break
    ids.add(c.id)
  }
  const renderedInView = Math.min(inView, candidates.filter((c) => ids.has(c.id)).length + keptInView)
  return { ids, inView, overflow: Math.max(0, inView - renderedInView) }
}

/** Mêmes identifiants des deux côtés ? */
export function sameIds(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size !== b.size) return false
  for (const id of a) if (!b.has(id)) return false
  return true
}

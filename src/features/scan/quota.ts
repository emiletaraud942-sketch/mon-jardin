// Quota d'identifications du scan en filmant. Pl@ntNet offre 500 identifications par jour à toute l'appli :
// ce scan se limite à 30 images par jour et par téléphone (pur, testé ; seul `read/add` touchent le stockage).

export const DAILY_LIMIT = 30
export const KEY = 'pj.scanQuota'

export interface Quota {
  /** Jour local, « AAAA-MM-JJ ». */
  day: string
  used: number
}

export function dayKey(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** Lecture sûre : un jour passé, ou une valeur abîmée, repart de zéro. */
export function normalizeQuota(raw: unknown, today: string): Quota {
  const r = raw as Partial<Quota> | null
  if (r && typeof r === 'object' && r.day === today && typeof r.used === 'number' && Number.isFinite(r.used) && r.used >= 0) return { day: today, used: Math.floor(r.used) }
  return { day: today, used: 0 }
}

export const remaining = (q: Quota, limit = DAILY_LIMIT) => Math.max(0, limit - q.used)
export const consume = (q: Quota, n: number): Quota => ({ ...q, used: q.used + Math.max(0, Math.floor(n)) })

/** « 12 images sur 30 aujourd'hui ». */
export function quotaText(q: Quota, limit = DAILY_LIMIT): string {
  return `${Math.min(q.used, limit)} image${q.used > 1 ? 's' : ''} sur ${limit} aujourd’hui`
}

export function readQuota(now: Date = new Date()): Quota {
  try {
    return normalizeQuota(JSON.parse(localStorage.getItem(KEY) ?? 'null'), dayKey(now))
  } catch {
    return normalizeQuota(null, dayKey(now))
  }
}

export function addUsed(n: number, now: Date = new Date()): Quota {
  const q = consume(readQuota(now), n)
  try {
    localStorage.setItem(KEY, JSON.stringify(q))
  } catch {
    /* stockage indisponible : le compteur ne dure que pour cette session */
  }
  return q
}

// Jardin collectif : validation des champs facultatifs d'un jardin (responsable, gestes, parcelles, composteurs, habitats).
// Appelé par `migrateState` pour toute donnée qui entre (stockage, import, synchro). Tout ce qui est invalide est retiré sans bruit :
// ces champs sont facultatifs et ne bloquent jamais le chargement du jardin.
import type { Collectif, Composteur, Garden, Geste, GesteType, HabitatKind, Plot } from '../types'
import { LIMITS } from './security/limits'
import { cleanLine, isSafeId } from './security/sanitize'

type Rec = Record<string, unknown>
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v)
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

export const GESTE_TYPES: ReadonlySet<string> = new Set<GesteType>(['compost', 'broyat', 'tonte', 'feuilles', 'eau-pluie'])
export const HABITAT_KINDS: ReadonlySet<string> = new Set<HabitatKind>(['haie', 'mare', 'tas-bois', 'hotel', 'herisson', 'nichoir', 'prairie'])
/** Quantité maximale d'un geste (kg ou litres) : au-delà, c'est une faute de frappe. */
export const GESTE_MAX = 100_000

/** « AAAA-MM-JJ » réel (le 31 février est refusé). */
function day(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v)
  if (!m) return undefined
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const t = new Date(Date.UTC(y, mo - 1, d))
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d && y >= 1990 && y <= 2200 ? v : undefined
}

const name = (v: unknown, max: number): string | undefined => (typeof v === 'string' ? cleanLine(v, max) || undefined : undefined)

export function sanitizeCollectifFields(raw: Rec, g: Garden): void {
  delete g.collectif
  delete g.gestes
  delete g.plots
  delete g.composteurs
  delete g.habitats

  if (isRec(raw.collectif)) {
    const c: Collectif = {}
    const coord = name(raw.collectif.coordinateur, 60)
    const asso = name(raw.collectif.association, 80)
    const charte = day(raw.collectif.charteAt)
    if (coord) c.coordinateur = coord
    if (asso) c.association = asso
    if (charte) c.charteAt = charte
    if (Object.keys(c).length > 0) g.collectif = c
  }

  if (Array.isArray(raw.gestes)) {
    const seen = new Set<string>()
    const out: Geste[] = []
    for (const r of raw.gestes.slice(0, LIMITS.gestesPerGarden)) {
      if (!isRec(r) || !isSafeId(r.id) || seen.has(r.id) || !day(r.date) || typeof r.type !== 'string' || !GESTE_TYPES.has(r.type)) continue
      if (!isNum(r.quantite) || r.quantite <= 0 || r.quantite > GESTE_MAX) continue
      seen.add(r.id)
      const note = name(r.note, 80)
      out.push({ id: r.id, date: r.date as string, type: r.type as GesteType, quantite: Math.round(r.quantite * 10) / 10, ...(note ? { note } : {}) })
    }
    if (out.length > 0) g.gestes = out
  }

  if (Array.isArray(raw.plots)) {
    const seen = new Set<string>()
    const out: Plot[] = []
    for (const r of raw.plots.slice(0, LIMITS.plotsPerGarden)) {
      if (!isRec(r) || !isSafeId(r.id) || seen.has(r.id)) continue
      if (![r.n, r.x, r.y, r.w, r.h].every(isNum)) continue
      const [n, x, y, w, h] = [r.n, r.x, r.y, r.w, r.h] as number[]
      if (!Number.isInteger(n) || n < 1 || n > 9999 || w <= 0 || h <= 0 || w > 500 || h > 500 || Math.abs(x) > LIMITS.coordM || Math.abs(y) > LIMITS.coordM) continue
      seen.add(r.id)
      const holder = name(r.holder, 30)
      out.push({ id: r.id, n, x, y, w, h, ...(holder ? { holder } : {}) })
    }
    if (out.length > 0) g.plots = out
  }

  if (Array.isArray(raw.composteurs)) {
    const seen = new Set<string>()
    const out: Composteur[] = []
    for (const r of raw.composteurs.slice(0, LIMITS.composteursPerGarden)) {
      if (!isRec(r) || !isSafeId(r.id) || seen.has(r.id) || !day(r.debut)) continue
      seen.add(r.id)
      const retourne = day(r.retourne)
      out.push({ id: r.id, nom: name(r.nom, 40) ?? 'Composteur', debut: r.debut as string, ...(retourne ? { retourne } : {}) })
    }
    if (out.length > 0) g.composteurs = out
  }

  if (Array.isArray(raw.habitats)) {
    const kinds = [...new Set(raw.habitats.filter((h): h is HabitatKind => typeof h === 'string' && HABITAT_KINDS.has(h)))]
    if (kinds.length > 0) g.habitats = kinds
  }
}

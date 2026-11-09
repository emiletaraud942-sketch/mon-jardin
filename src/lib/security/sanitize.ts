// Fonctions pures de nettoyage des données non fiables. Aucune dépendance : testées dans security.test.ts.
import { LIMITS } from './limits'

/** Clés qui, copiées telles quelles, permettent de modifier le prototype d'un objet. */
export const FORBIDDEN_KEYS: ReadonlySet<string> = new Set(['__proto__', 'constructor', 'prototype'])

export const isSafeKey = (k: string): boolean => !FORBIDDEN_KEYS.has(k)

/** Raccourcit un texte sans couper une paire de substitution (emoji). */
export function clipText(s: string, max: number): string {
  if (s.length <= max) return s
  let out = s.slice(0, max)
  const last = out.charCodeAt(out.length - 1)
  if (last >= 0xd800 && last <= 0xdbff) out = out.slice(0, -1)
  return out
}

/** Caractères de commande et de sens d'écriture (invisibles : ils servent à tromper l'affichage). */
const LINE_STRIP = /[\u0000-\u001f\u007f-\u009f\u061c\u200b\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]+/g

/** Texte d'une seule ligne : caractères invisibles et de commande retirés (retours à la ligne = espace), espaces réduits, borné à `max`. */
export function cleanLine(s: string, max: number): string {
  return clipText(s.replace(/[\r\n\t]+/g, ' ').replace(LINE_STRIP, '').replace(/\s+/g, ' ').trim(), max).trim()
}

/** Identifiant de photo valide : « photo: » suivi de lettres/chiffres. Évite de lire ou effacer une autre clé IndexedDB. */
export const PHOTO_ID_RE = /^photo:[A-Za-z0-9]{1,64}$/
export const isPhotoId = (v: unknown): v is string => typeof v === 'string' && PHOTO_ID_RE.test(v)

/** Identifiant d'objet (jardin, plante…) : texte non vide, borné, qui n'est pas un nom dangereux. */
export function isSafeId(v: unknown, max: number = LIMITS.idLength): v is string {
  return typeof v === 'string' && v.trim() !== '' && v.length <= max && !FORBIDDEN_KEYS.has(v)
}

export const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

function isPlain(v: object): boolean {
  const p = Object.getPrototypeOf(v)
  return p === Object.prototype || p === null
}

interface Budget {
  nodes: number
}

/**
 * Copie profonde d'une valeur JSON, bornée : sans clés dangereuses, textes et tableaux plafonnés, profondeur limitée.
 * Renvoie `undefined` pour ce qui n'est pas du JSON (fonction, symbole, bigint, nombre non fini, objet non simple)
 * ou si le budget de nœuds est épuisé : l'appelant écarte alors la clé.
 */
export function cleanJson(v: unknown, budget: Budget = { nodes: LIMITS.extraNodes }, depth = 0): unknown {
  if (--budget.nodes < 0) return undefined
  if (v === null || typeof v === 'boolean') return v
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined
  if (typeof v === 'string') return clipText(v, LIMITS.longText)
  if (typeof v !== 'object' || depth >= LIMITS.extraDepth) return undefined
  if (Array.isArray(v)) {
    const out: unknown[] = []
    for (const x of v.slice(0, LIMITS.extraArray)) {
      const c = cleanJson(x, budget, depth + 1)
      if (c !== undefined) out.push(c)
    }
    return out
  }
  if (!isPlain(v)) return undefined
  const out: Record<string, unknown> = {}
  let n = 0
  for (const k of Object.keys(v)) {
    if (!isSafeKey(k)) continue
    if (++n > LIMITS.extraKeys) break
    const c = cleanJson((v as Record<string, unknown>)[k], budget, depth + 1)
    if (c !== undefined) out[k] = c
  }
  return out
}

/** Champs d'un enregistrement que le code ne connaît pas : conservés (nettoyés) pour ne pas perdre les données d'une version future. */
export function cleanExtras(raw: Record<string, unknown>, known: ReadonlySet<string>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  const budget = { nodes: LIMITS.extraNodes }
  let n = 0
  for (const k of Object.keys(raw)) {
    if (known.has(k) || !isSafeKey(k)) continue
    if (++n > LIMITS.extraKeys) break
    const c = cleanJson(raw[k], budget)
    if (c !== undefined) out[k] = c
  }
  return out
}

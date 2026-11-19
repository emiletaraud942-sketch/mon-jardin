import { SPECIES } from '../data/species'
import type { Species } from '../types'
import { fetchWithTimeout } from './http'
import { compressToTarget, TARGET_BYTES } from './photos'

export interface Identification {
  score: number
  latin: string
  commonNames: string[]
  family?: string
  /** Espèce correspondante dans notre base, si elle existe. */
  species?: Species
  /** Vrai si la fiche n'est qu'un repli sur le même genre (autre espèce que celle identifiée). */
  approx: boolean
}

function genus(latin: string) {
  return latin.split(/\s+/)[0]?.toLowerCase()
}

/** Rapproche un nom scientifique Pl@ntNet d'une espèce de la base : espèce exacte, sinon même genre (`approx: true`). */
export function matchSpecies(latin: string): { species: Species; approx: boolean } | undefined {
  const l = latin.trim().toLowerCase().replace(/\s+(subsp|var|×|x)\.?\s.*$/, '')
  const words = l.split(/\s+/)
  const two = words.slice(0, 2).join(' ')
  if (words.length >= 2) {
    const exact = SPECIES.find((s) => {
      const n = s.nomLatin.toLowerCase()
      return n === two || n.startsWith(two + ' ')
    })
    if (exact) return { species: exact, approx: false }
  }
  const sameGenus = SPECIES.find((s) => genus(s.nomLatin) === genus(l))
  return sameGenus ? { species: sameGenus, approx: true } : undefined
}

async function toBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer())
  let s = ''
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000))
  return btoa(s)
}

/** Total des images en base64 au-delà duquel Vercel (4,5 Mo par requête) refuserait l'envoi. */
export const MAX_TOTAL_BASE64 = 4_000_000
const total = (list: string[]) => list.reduce((n, s) => n + s.length, 0)

/** Encode les photos en base64 ; si le total dépasse ~4 Mo, les ré-encode plus petites (qualité puis dimensions). */
export async function prepareImages(images: Blob[]): Promise<string[]> {
  let out = await Promise.all(images.map(toBase64))
  if (total(out) <= MAX_TOTAL_BASE64) return out
  // base64 = 4/3 de la taille binaire : on répartit le budget sur le nombre d'images.
  let target = Math.min(TARGET_BYTES, Math.floor(((MAX_TOTAL_BASE64 / Math.max(1, images.length)) * 3) / 4) - 2048)
  for (const side of [1280, 1024, 800, 640]) {
    const small = await Promise.all(images.map((b) => compressToTarget(b, { maxSide: side, targetBytes: target })))
    out = await Promise.all(small.map(toBase64))
    if (total(out) <= MAX_TOTAL_BASE64) return out
    target = Math.floor(target * 0.7)
  }
  throw new Error('Les photos sont trop lourdes pour être envoyées. Envoyez-en moins ou prenez-les en plus basse résolution.')
}

function parseResults(data: unknown): Omit<Identification, 'species' | 'approx'>[] {
  const results = (data as { results?: unknown } | null)?.results
  if (!Array.isArray(results)) throw new Error("L'identification a renvoyé une réponse illisible. Réessayez.")
  const out: Omit<Identification, 'species' | 'approx'>[] = []
  for (const x of results as Record<string, unknown>[]) {
    if (!x || typeof x.latin !== 'string' || typeof x.score !== 'number') continue
    out.push({
      score: x.score,
      latin: x.latin,
      commonNames: Array.isArray(x.commonNames) ? x.commonNames.filter((n): n is string => typeof n === 'string') : [],
      family: typeof x.family === 'string' ? x.family : undefined,
    })
  }
  return out
}

export type Organ = 'auto' | 'leaf' | 'flower' | 'fruit' | 'bark'

/**
 * Identification par photo via notre fonction serveur /api/identify (clé Pl@ntNet côté serveur).
 * `organ` : un organe pour toutes les photos, ou un organe par photo (écorce + branche + vue d'ensemble).
 */
export async function identifyPlant(images: Blob[], organ: Organ | Organ[] = 'auto'): Promise<Identification[]> {
  const prepared = await prepareImages(images)
  if (Array.isArray(organ) && organ.length !== images.length) throw new Error('Un organe par photo est attendu.')
  const body = Array.isArray(organ) ? { organs: organ, images: prepared } : { organ, images: prepared }
  // Délai de 30 s (comme la fonction serveur). On lit le corps nous-mêmes pour garder les messages en français du serveur (quota, photo illisible…).
  const r = await fetchWithTimeout('/api/identify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), timeoutMs: 30000 })
  const text = await r.text()
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    data = undefined
  }
  if (!r.ok) {
    const message = (data as { error?: unknown } | undefined)?.error
    if (typeof message === 'string' && message) throw new Error(message)
    if (r.status === 413) throw new Error('Les photos sont trop lourdes. Envoyez moins de photos ou des photos plus légères.')
    throw new Error(`Pl@ntNet a répondu une erreur (${r.status}).`)
  }
  if (data === undefined) throw new Error('Pl@ntNet a renvoyé une réponse illisible.')
  return parseResults(data).map((x) => {
    const m = matchSpecies(x.latin)
    return { ...x, species: m?.species, approx: m?.approx ?? false }
  })
}

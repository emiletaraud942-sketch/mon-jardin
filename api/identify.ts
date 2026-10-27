// Fonction serveur Vercel : relaie l'identification vers Pl@ntNet sans exposer la clé.
// Quota gratuit : 500 identifications/jour pour toute l'appli.
// La clé (PLANTNET_API_KEY) ne vit que dans les variables d'environnement Vercel : elle n'est ni renvoyée, ni journalisée.
// Sécurité : voir docs/SECURITE.md (menace → mesure → fichier). Ce fichier est volontairement AUTONOME : une fonction Vercel
// ne doit pas importer src/ (modules ES sans extension). Les fonctions d'image sont donc dupliquées de src/lib/security/image.ts
// (un test compare les deux).
import type { VercelRequest, VercelResponse } from './_vercel-types'

export const config = { maxDuration: 30 }

const ORGANS = new Set(['auto', 'leaf', 'flower', 'fruit', 'bark'])
/** Taille maximale du corps (JSON + base64). Vercel coupe à 4,5 Mo avec une erreur non JSON : on répond avant. */
export const MAX_BODY_BYTES = 4_200_000
const UPSTREAM_TIMEOUT_MS = 25_000

// ---------- Fonctions pures (testées dans identify.test.ts) ----------

/** Type MIME d'après les premiers octets (jamais d'après ce que dit le client). */
export function detectImageMime(buf: Uint8Array): 'image/jpeg' | 'image/png' | 'image/webp' | undefined {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg'
  if (buf.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => buf[i] === b)) return 'image/png'
  if (buf.length >= 12 && String.fromCharCode(...buf.subarray(0, 4)) === 'RIFF' && String.fromCharCode(...buf.subarray(8, 12)) === 'WEBP') return 'image/webp'
  return undefined
}

/** Plafonds d'une image envoyée à Pl@ntNet : le navigateur réduit déjà à 1280 px, donc ces valeurs ne gênent aucun usage normal. */
export const MAX_IMAGE_SIDE = 8000
export const MAX_IMAGE_PIXELS = 40_000_000

const u16 = (b: Uint8Array, o: number) => (b[o] << 8) | b[o + 1]
const u32 = (b: Uint8Array, o: number) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0
const ascii = (b: Uint8Array, o: number, n: number) => String.fromCharCode(...b.subarray(o, o + n))

/** Dimensions déclarées par l'en-tête (PNG, JPEG, WebP), sans décoder l'image. undefined si tronqué ou incohérent. */
export function imageSize(b: Uint8Array): { width: number; height: number } | undefined {
  if (b.length >= 24 && b[0] === 0x89 && ascii(b, 1, 3) === 'PNG' && ascii(b, 12, 4) === 'IHDR') return { width: u32(b, 16), height: u32(b, 20) }
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8) {
    let o = 2
    for (let guard = 0; o + 4 <= b.length && guard < 1000; guard++) {
      if (b[o] !== 0xff) return undefined
      const marker = b[o + 1]
      if (marker === 0xff) {
        o++
        continue
      }
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        o += 2
        continue
      }
      if (marker === 0xd9 || marker === 0xda) return undefined
      const len = u16(b, o + 2)
      if (len < 2) return undefined
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        if (o + 9 > b.length) return undefined
        return { height: u16(b, o + 5), width: u16(b, o + 7) }
      }
      o += 2 + len
    }
    return undefined
  }
  if (b.length >= 30 && ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WEBP') {
    const kind = ascii(b, 12, 4)
    if (kind === 'VP8X') return { width: 1 + (b[24] | (b[25] << 8) | (b[26] << 16)), height: 1 + (b[27] | (b[28] << 8) | (b[29] << 16)) }
    if (kind === 'VP8 ' && b[23] === 0x9d && b[24] === 0x01 && b[25] === 0x2a) return { width: (b[26] | (b[27] << 8)) & 0x3fff, height: (b[28] | (b[29] << 8)) & 0x3fff }
    if (kind === 'VP8L' && b[20] === 0x2f) {
      const bits = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24)
      return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >>> 14) & 0x3fff) }
    }
  }
  return undefined
}

/** Texte base64 (ou base64url) strict, avec préfixe « data:…, » facultatif. Renvoie les octets, ou undefined si ce n'est pas du base64. */
export function decodeBase64Image(input: string): Buffer | undefined {
  const raw = input.replace(/^data:[^,]{0,100},/, '')
  if (raw.length === 0 || !/^[A-Za-z0-9+/_-]*={0,2}$/.test(raw)) return undefined
  const bytes = Buffer.from(raw, 'base64')
  return bytes.length > 0 ? bytes : undefined
}

/**
 * Limiteur de débit en mémoire (fenêtre glissante par clé).
 * GARDE-FOU PAR INSTANCE : chaque instance serverless a sa propre mémoire et elle est perdue à l'arrêt, donc la limite
 * réelle est plus large que `max`. Un vrai limiteur partagé (règle de limitation du pare-feu Vercel, ou Vercel KV / Upstash)
 * est préférable dès que l'appli est publique.
 */
export function createRateLimiter(max: number, windowMs: number, now: () => number = Date.now, maxKeys = 10_000) {
  // Map = ordre d'insertion : à chaque accès la clé est réinsérée en dernier, donc la plus ancienne est en tête.
  // La mémoire est BORNÉE à `maxKeys` clés : un attaquant qui change de clé à chaque requête ne peut ni la saturer
  // ni ralentir le service (éviction d'une seule entrée par requête, coût constant).
  const hits = new Map<string, number[]>()
  return {
    size: () => hits.size,
    check(key: string): { allowed: boolean; retryAfterSec: number } {
      const t = now()
      const recent = (hits.get(key) ?? []).filter((x) => t - x < windowMs)
      hits.delete(key)
      if (recent.length >= max) {
        hits.set(key, recent)
        return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((recent[0] + windowMs - t) / 1000)) }
      }
      recent.push(t)
      hits.set(key, recent)
      while (hits.size > maxKeys) {
        const oldest = hits.keys().next().value as string
        hits.delete(oldest)
      }
      return { allowed: true, retryAfterSec: 0 }
    },
  }
}

type Headers = Record<string, string | string[] | undefined>
const header = (h: Headers, name: string): string | undefined => {
  const v = h[name]
  return Array.isArray(v) ? v[0] : v
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1'])
const hostnameOf = (hostWithPort: string) => hostWithPort.replace(/:\d+$/, '').toLowerCase()

/** Refuse les appels venant d'un autre site (Sec-Fetch-Site: cross-site, ou Origin/Referer qui ne correspond pas au Host). */
export function isAllowedOrigin(h: Headers): boolean {
  if (header(h, 'sec-fetch-site') === 'cross-site') return false
  const host = header(h, 'x-forwarded-host') ?? header(h, 'host')
  for (const name of ['origin', 'referer']) {
    const v = header(h, name)
    if (!v) continue
    let other: string
    try {
      other = new URL(v).host
    } catch {
      return false // « null » ou valeur illisible
    }
    if (!host) return false
    if (other.toLowerCase() === host.toLowerCase()) continue
    if (LOCAL_HOSTS.has(hostnameOf(other)) && LOCAL_HOSTS.has(hostnameOf(host))) continue // développement local (ports différents)
    return false
  }
  return true
}

/** Vrai si la requête porte une marque de navigateur : `Sec-Fetch-Site` ou `Origin`/`Referer`. Un `fetch` POST du site envoie toujours `Origin` ; curl ou un script, non. */
export function hasBrowserOrigin(h: Headers): boolean {
  const site = header(h, 'sec-fetch-site')
  return site === 'same-origin' || site === 'same-site' || !!header(h, 'origin') || !!header(h, 'referer')
}

/**
 * IP du client. Sur Vercel, `x-vercel-forwarded-for` et `x-real-ip` sont posés par la plateforme (la valeur envoyée par le client est écrasée).
 * `x-forwarded-for` n'est qu'un repli : on prend sa DERNIÈRE valeur (celle ajoutée par le proxy le plus proche), jamais la première,
 * que le client peut falsifier pour contourner la limite de débit.
 */
export function clientIp(h: Headers, fallback?: string): string {
  const xff = header(h, 'x-forwarded-for')?.split(',').map((x) => x.trim()).filter(Boolean)
  const first = (v: string | undefined) => v?.split(',')[0].trim() || undefined
  return first(header(h, 'x-vercel-forwarded-for')) || header(h, 'x-real-ip')?.trim() || xff?.[xff.length - 1] || fallback || 'inconnue'
}

/**
 * Clé de limitation de débit : l'adresse IPv4 telle quelle, mais un réseau IPv6 en entier (/64). Un abonné IPv6 reçoit au moins un /64
 * (2^64 adresses) : limiter par adresse complète lui laisserait contourner la limite par IP en changeant d'adresse à chaque requête.
 */
export function rateKey(ip: string): string {
  const v = ip.trim().toLowerCase().replace(/^\[|\]$/g, '').replace(/%.*$/, '')
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(v)
  if (mapped) return mapped[1]
  if (!v.includes(':')) return v
  let groups: string[]
  if (v.includes('::')) {
    const [a, b = ''] = v.split('::')
    const left = a ? a.split(':') : []
    const right = b ? b.split(':') : []
    groups = [...left, ...Array<string>(Math.max(0, 8 - left.length - right.length)).fill('0'), ...right]
  } else groups = v.split(':')
  if (groups.length !== 8 || groups.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return v
  return `${groups.slice(0, 4).map((g) => g.replace(/^0+(?=.)/, '')).join(':')}::/64`
}

/** Message d'erreur sans URL ni clé (un échec de `fetch` peut contenir l'URL avec `api-key=`). */
export function scrubError(e: unknown, secret?: string): string {
  const parts: string[] = []
  for (let cur: unknown = e, i = 0; cur && i < 3; i++) {
    const err = cur as { message?: unknown; cause?: unknown }
    parts.push(typeof err.message === 'string' ? err.message : String(cur))
    cur = err.cause
  }
  let s = parts.join(' | ')
  if (secret) s = s.split(secret).join('***').split(encodeURIComponent(secret)).join('***')
  return s.replace(/api-key=[^&\s"')]*/gi, 'api-key=***').replace(/https?:\/\/[^\s"')]+/gi, '[url]')
}

export interface PlantnetResult {
  score: number
  latin: string
  commonNames: string[]
  family?: string
}

/** Traduit la réponse brute de Pl@ntNet (statut + corps texte, pas forcément du JSON) en réponse pour notre client. */
export function interpretPlantnet(status: number, text: string): { status: number; body: { results: PlantnetResult[] } | { error: string } } {
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    json = undefined
  }
  const obj = (json && typeof json === 'object' ? json : {}) as { results?: unknown; message?: unknown }
  if (status === 404) return { status: 200, body: { results: [] } } // « espèce non trouvée »
  if (status === 429) return { status: 429, body: { error: 'Quota Pl@ntNet du jour atteint : réessayez demain.' } }
  if (status === 401 || status === 403) return { status: 502, body: { error: "Le service d'identification est mal configuré (clé refusée). Prévenez l'administrateur du site." } }
  if (status === 400 || status === 415 || status === 422) return { status: 400, body: { error: "Pl@ntNet n'a pas pu lire cette photo. Essayez-en une autre, plus nette." } }
  if (status < 200 || status >= 300) return { status: 502, body: { error: `Pl@ntNet a répondu une erreur (${status}). Réessayez plus tard.` } }
  if (json === undefined) return { status: 502, body: { error: 'Pl@ntNet a renvoyé une réponse illisible. Réessayez plus tard.' } }
  const raw = Array.isArray(obj.results) ? obj.results : []
  const results: PlantnetResult[] = []
  for (const x of raw as { score?: unknown; species?: { scientificNameWithoutAuthor?: unknown; commonNames?: unknown; family?: { scientificNameWithoutAuthor?: unknown } } }[]) {
    const latin = x?.species?.scientificNameWithoutAuthor
    if (typeof latin !== 'string' || typeof x.score !== 'number') continue
    const family = x.species?.family?.scientificNameWithoutAuthor
    results.push({
      score: x.score,
      latin,
      commonNames: Array.isArray(x.species?.commonNames) ? (x.species.commonNames as unknown[]).filter((n): n is string => typeof n === 'string') : [],
      family: typeof family === 'string' ? family : undefined,
    })
  }
  return { status: 200, body: { results } }
}

// ---------- Fonction ----------

const limiter = createRateLimiter(20, 10 * 60_000)
/** Plafond global par instance : limite la consommation du quota Pl@ntNet (500/jour pour toute l'appli) si de nombreuses adresses attaquent. */
const globalLimiter = createRateLimiter(150, 10 * 60_000, Date.now, 1)
/** Réponse Pl@ntNet : on n'en lit pas plus (réponse normale : quelques Ko). */
const MAX_UPSTREAM_CHARS = 1_000_000

function securityHeaders(res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'")
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin')
  res.setHeader('Referrer-Policy', 'no-referrer')
  res.setHeader('X-Frame-Options', 'DENY')
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  securityHeaders(res)
  try {
    return await handle(req, res)
  } catch (e) {
    // Dernier filet : jamais de trace d'exécution ni d'URL (donc de clé) dans la réponse ou les journaux.
    console.error('identify: erreur inattendue :', scrubError(e, process.env.PLANTNET_API_KEY))
    return res.status(500).json({ error: 'Erreur inattendue. Réessayez plus tard.' })
  }
}

async function handle(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Méthode non autorisée' })
  }
  if (!isAllowedOrigin(req.headers) || !hasBrowserOrigin(req.headers)) return res.status(403).json({ error: 'Origine non autorisée.' })

  const limit = limiter.check(rateKey(clientIp(req.headers, req.socket?.remoteAddress)))
  if (!limit.allowed) {
    res.setHeader('Retry-After', String(limit.retryAfterSec))
    return res.status(429).json({ error: 'Trop de demandes, réessayez dans quelques minutes.' })
  }

  // JSON obligatoire : un autre type (text/plain, formulaire) est la signature d'une requête « simple » inter-sites.
  if (!/^application\/json\s*(;|$)/i.test(header(req.headers, 'content-type') ?? '')) {
    return res.status(415).json({ error: 'Type de contenu non pris en charge (application/json attendu).' })
  }

  const key = process.env.PLANTNET_API_KEY
  if (!key) {
    return res.status(503).json({
      error: "L'identification n'est pas encore activée : ajoutez la variable PLANTNET_API_KEY (clé gratuite sur my.plantnet.org) dans Vercel.",
    })
  }

  const tooBig = { error: `Les photos sont trop lourdes (${(MAX_BODY_BYTES / 1_000_000).toFixed(1).replace('.', ',')} Mo maximum au total). Envoyez moins de photos ou des photos plus légères.` }
  if (Number(header(req.headers, 'content-length')) > MAX_BODY_BYTES) return res.status(413).json(tooBig)

  // `req.body` est une propriété paresseuse : un JSON invalide LÈVE une exception à la lecture.
  let body: unknown
  try {
    body = req.body
    if (typeof body === 'string') body = JSON.parse(body)
  } catch {
    return res.status(400).json({ error: 'Requête illisible.' })
  }
  const { images, organ = 'auto' } = (body && typeof body === 'object' && !Array.isArray(body) ? body : {}) as { images?: unknown; organ?: unknown }
  if (!Array.isArray(images) || images.length === 0 || images.length > 5) return res.status(400).json({ error: 'Envoyez 1 à 5 photos.' })
  if (typeof organ !== 'string' || !ORGANS.has(organ)) return res.status(400).json({ error: 'Organe inconnu.' })
  let total = 0
  for (const b64 of images) {
    if (typeof b64 !== 'string' || b64.length === 0) return res.status(400).json({ error: 'Photo illisible.' })
    total += b64.length
  }
  if (total > MAX_BODY_BYTES) return res.status(413).json(tooBig)

  const form = new FormData()
  for (const [i, b64] of (images as string[]).entries()) {
    const bytes = decodeBase64Image(b64)
    if (!bytes) return res.status(400).json({ error: 'Photo illisible.' })
    const mime = detectImageMime(bytes)
    if (!mime) return res.status(400).json({ error: 'Format de photo non pris en charge (JPEG, PNG ou WebP uniquement).' })
    const size = imageSize(bytes)
    if (!size || size.width < 1 || size.height < 1) return res.status(400).json({ error: 'Photo illisible.' })
    if (size.width > MAX_IMAGE_SIDE || size.height > MAX_IMAGE_SIDE || size.width * size.height > MAX_IMAGE_PIXELS) {
      return res.status(400).json({ error: 'Photo trop grande en dimensions (8 000 pixels maximum par côté). Réduisez-la.' })
    }
    form.append('images', new Blob([new Uint8Array(bytes)], { type: mime }), `photo-${i}.${mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg'}`)
    form.append('organs', organ)
  }

  // Plafond global : compté seulement pour une requête valide qui va réellement consommer le quota Pl@ntNet.
  const globalLimit = globalLimiter.check('tous')
  if (!globalLimit.allowed) {
    res.setHeader('Retry-After', String(globalLimit.retryAfterSec))
    return res.status(429).json({ error: 'Trop de demandes, réessayez dans quelques minutes.' })
  }

  const url = `https://my-api.plantnet.org/v2/identify/all?api-key=${encodeURIComponent(key)}&lang=fr&nb-results=5&include-related-images=false`
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), UPSTREAM_TIMEOUT_MS)
  try {
    const r = await fetch(url, { method: 'POST', body: form, signal: ctrl.signal, redirect: 'error' })
    const text = await r.text()
    if (text.length > MAX_UPSTREAM_CHARS) return res.status(502).json({ error: 'Pl@ntNet a renvoyé une réponse illisible. Réessayez plus tard.' })
    const out = interpretPlantnet(r.status, text)
    return res.status(out.status).json(out.body)
  } catch (e) {
    console.error('identify: échec de la requête Pl@ntNet :', scrubError(e, key))
    if ((e as Error)?.name === 'AbortError') return res.status(504).json({ error: 'Pl@ntNet met trop de temps à répondre. Réessayez dans un instant.' })
    return res.status(502).json({ error: 'Pl@ntNet est injoignable pour le moment. Réessayez plus tard.' })
  } finally {
    clearTimeout(timer)
  }
}

// Fonction Edge Supabase (Deno) : alerte NEUTRE quand un message privé arrive.
// Déclenchée par un webhook de base de données (insertion dans « messages »). Voir docs/ENTRAIDE.md pour la mise en place.
//
// Ce qui est envoyé : une alerte VIDE (aucun corps) au service d'alerte du navigateur de l'autre participant. Le texte
// « Vous avez un nouveau message » est écrit dans le service worker de l'appli (public/push-sw.js), qui ignore tout contenu reçu.
// Donc rien du message (ni texte, ni pseudo) ne passe jamais par Google, Mozilla, Apple ou Microsoft.
//
// Sécurité :
// - Le webhook doit porter l'en-tête x-webhook-secret (secret partagé NOTIFY_WEBHOOK_SECRET), comparé sans fuite de temps.
// - La fonction ne fait pas confiance au contenu du webhook : elle n'en retient que l'identifiant du message, puis relit
//   les faits en base (fonction SQL neighbors_push_facts, réservée à la clé « service_role »).
// - Les clés VAPID privées ne sont que dans l'environnement de la fonction (supabase secrets set), jamais dans le dépôt.
// - Les adresses d'abonnement doivent être celles d'un service d'alerte connu (liste fermée) : pas de requête vers un site au choix.
//
// Ce fichier est volontairement un SEUL fichier, sans dépendance : on peut le coller dans l'éditeur de fonctions du tableau de bord.
// Les fonctions pures sont exportées pour les tests (src/lib/neighbors/notifyMessage.test.ts).

// Seul identifiant propre à Deno ; absent sous Node (tests).
declare const Deno: { env: { get(name: string): string | undefined }; serve(handler: (req: Request) => Response | Promise<Response>): unknown } | undefined

// ---------- Outils purs ----------

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function b64urlEncode(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function b64urlDecode(text: string): Uint8Array {
  const pad = '='.repeat((4 - (text.length % 4)) % 4)
  const bin = atob(text.replace(/-/g, '+').replace(/_/g, '/') + pad)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

/** Services d'alerte des navigateurs : Google (Chrome, Edge, Brave, Opera…), Mozilla, Apple, Microsoft. Même liste que la contrainte SQL. */
const PUSH_ENDPOINT = /^https:\/\/(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)\/[!-~]+$/
export function isAllowedEndpoint(endpoint: unknown): endpoint is string {
  return typeof endpoint === 'string' && endpoint.length >= 20 && endpoint.length <= 700 && PUSH_ENDPOINT.test(endpoint)
}

/** Compare deux secrets sans révéler, par le temps de réponse, combien de caractères sont justes. */
export async function secretsMatch(given: string | null | undefined, expected: string | undefined): Promise<boolean> {
  if (!given || !expected || expected.length < 16) return false
  const enc = new TextEncoder()
  const [a, b] = await Promise.all([crypto.subtle.digest('SHA-256', enc.encode(given)), crypto.subtle.digest('SHA-256', enc.encode(expected))])
  const x = new Uint8Array(a)
  const y = new Uint8Array(b)
  let diff = 0
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i]
  return diff === 0
}

export type Webhook = { ok: true; messageId: string } | { ok: false; reason: string }

/** Webhook de base de données : on ne retient que l'identifiant d'un message qui vient d'être inséré. */
export function parseWebhook(body: unknown): Webhook {
  const b = (body ?? {}) as { type?: unknown; table?: unknown; schema?: unknown; record?: { id?: unknown } | null }
  if (b.type !== 'INSERT') return { ok: false, reason: 'type' }
  if (b.table !== 'messages') return { ok: false, reason: 'table' }
  if (b.schema !== undefined && b.schema !== 'public') return { ok: false, reason: 'schema' }
  const id = b.record && typeof b.record === 'object' ? b.record.id : undefined
  if (typeof id !== 'string' || !UUID.test(id)) return { ok: false, reason: 'id' }
  return { ok: true, messageId: id.toLowerCase() }
}

export interface PushTarget {
  id: string
  endpoint: string
  p256dh?: string
  auth?: string
}

/** Faits renvoyés par la fonction SQL neighbors_push_facts : identifiants, dates, indicateurs et appareils du DESTINATAIRE. Jamais de texte. */
export interface Facts {
  message_id: string
  sender: string
  recipient: string
  sent_at: string
  sender_banned: boolean
  recipient_banned: boolean
  blocked: boolean
  /** null : le destinataire n'a pas de ligne de préférences. */
  prefs_messages: boolean | null
  previous_at: string | null
  subscriptions: PushTarget[]
}

/** Deux messages du même expéditeur à moins de 2 minutes : une seule alerte (la pastille de l'appli compte les autres). */
export const MIN_GAP_MS = 2 * 60_000
/** Un webhook rejoué très tard n'a plus de sens. */
export const MAX_AGE_MS = 15 * 60_000

export type Decision = { send: false; reason: string } | { send: true; targets: PushTarget[] }

/** Décide si une alerte part, et vers quels appareils. Rien ne part sans abonnement ET case « messages » cochée. */
export function decide(facts: Facts | null, now: number = Date.now()): Decision {
  if (!facts || typeof facts !== 'object') return { send: false, reason: 'message_inconnu' }
  if (!facts.recipient || facts.recipient === facts.sender) return { send: false, reason: 'destinataire' }
  if (facts.sender_banned || facts.recipient_banned) return { send: false, reason: 'banni' }
  if (facts.blocked) return { send: false, reason: 'blocage' }
  if (facts.prefs_messages !== true) return { send: false, reason: 'preference' }
  const sent = Date.parse(facts.sent_at)
  if (Number.isFinite(sent) && now - sent > MAX_AGE_MS) return { send: false, reason: 'trop_ancien' }
  const targets = (Array.isArray(facts.subscriptions) ? facts.subscriptions : []).filter((s) => s && UUID.test(String(s.id)) && isAllowedEndpoint(s.endpoint))
  if (targets.length === 0) return { send: false, reason: 'aucun_appareil' }
  if (facts.previous_at) {
    const prev = Date.parse(facts.previous_at)
    if (Number.isFinite(prev) && Number.isFinite(sent) && sent - prev < MIN_GAP_MS) return { send: false, reason: 'rythme' }
  }
  return { send: true, targets }
}

// ---------- VAPID (RFC 8292) : jeton signé ES256 avec WebCrypto ----------

/** Clé publique VAPID : 65 octets (0x04, X, Y) en base64url. La privée est le scalaire D (32 octets) en base64url. */
export function vapidJwk(publicKey: string, privateKey: string): JsonWebKey {
  const pub = b64urlDecode(publicKey)
  if (pub.length !== 65 || pub[0] !== 4) throw new Error('clé publique VAPID invalide')
  const d = b64urlDecode(privateKey)
  if (d.length !== 32) throw new Error('clé privée VAPID invalide')
  return { kty: 'EC', crv: 'P-256', x: b64urlEncode(pub.slice(1, 33)), y: b64urlEncode(pub.slice(33, 65)), d: b64urlEncode(d), ext: true }
}

export async function importVapidKey(publicKey: string, privateKey: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('jwk', vapidJwk(publicKey, privateKey), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
}

/** Origine du service d'alerte (audience du jeton) : « https://fcm.googleapis.com ». */
export const audienceOf = (endpoint: string): string => new URL(endpoint).origin

export async function vapidToken(key: CryptoKey, audience: string, subject: string, nowSec: number): Promise<string> {
  const enc = new TextEncoder()
  const head = b64urlEncode(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  // 12 h : le maximum admis est 24 h.
  const claims = b64urlEncode(enc.encode(JSON.stringify({ aud: audience, exp: nowSec + 12 * 3600, sub: subject })))
  const data = `${head}.${claims}`
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(data)))
  return `${data}.${b64urlEncode(sig)}`
}

export interface VapidConfig {
  publicKey: string
  key: CryptoKey
  subject: string
}

export type SendKind = 'sent' | 'expired' | 'failed'

/** En-têtes d'une alerte vide. Aucun corps : rien du message n'est transmis. */
export async function pushHeaders(vapid: VapidConfig, endpoint: string, nowSec: number): Promise<Record<string, string>> {
  const jwt = await vapidToken(vapid.key, audienceOf(endpoint), vapid.subject, nowSec)
  return {
    Authorization: `vapid t=${jwt}, k=${vapid.publicKey}`,
    TTL: '21600',
    Urgency: 'normal',
    // Une alerte en attente est remplacée par la suivante, au lieu de s'empiler.
    Topic: 'nouveau-message',
  }
}

/** 201 (ou 200/202) : envoyée. 404 et 410 : l'abonnement n'existe plus. Le reste : échec passager, on garde l'abonnement. */
export function classifyStatus(status: number): SendKind {
  if (status === 404 || status === 410) return 'expired'
  if (status >= 200 && status < 300) return 'sent'
  return 'failed'
}

// ---------- Traitement d'une requête ----------

export interface Env {
  SUPABASE_URL?: string
  SUPABASE_SERVICE_ROLE_KEY?: string
  VAPID_PUBLIC_KEY?: string
  VAPID_PRIVATE_KEY?: string
  VAPID_SUBJECT?: string
  NOTIFY_WEBHOOK_SECRET?: string
}

export interface Deps {
  fetch: typeof fetch
  now: () => number
}

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })

const MAX_BODY = 16 * 1024
const SEND_TIMEOUT_MS = 8000

export async function handle(req: Request, env: Env, deps: Deps): Promise<Response> {
  if (req.method !== 'POST') return json(405, { error: 'méthode' })
  if (!(await secretsMatch(req.headers.get('x-webhook-secret'), env.NOTIFY_WEBHOOK_SECRET))) return json(401, { error: 'refusé' })

  const base = env.SUPABASE_URL?.replace(/\/+$/, '')
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY
  if (!base || !serviceKey || !env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY || !env.VAPID_SUBJECT) return json(500, { error: 'configuration' })
  if (!/^(mailto:|https:\/\/)/.test(env.VAPID_SUBJECT)) return json(500, { error: 'configuration' })

  let hook: Webhook
  try {
    const text = await req.text()
    if (text.length > MAX_BODY) return json(413, { error: 'trop gros' })
    hook = parseWebhook(JSON.parse(text))
  } catch {
    return json(400, { error: 'corps' })
  }
  if (!hook.ok) return json(400, { error: 'webhook', reason: hook.reason })

  let vapid: VapidConfig
  try {
    vapid = { publicKey: env.VAPID_PUBLIC_KEY, key: await importVapidKey(env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY), subject: env.VAPID_SUBJECT }
  } catch {
    return json(500, { error: 'configuration' })
  }

  const rest = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }
  const factsRes = await deps.fetch(`${base}/rest/v1/rpc/neighbors_push_facts`, {
    method: 'POST',
    headers: { ...rest, 'content-type': 'application/json' },
    body: JSON.stringify({ p_message_id: hook.messageId }),
    signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
  })
  if (!factsRes.ok) return json(502, { error: 'base' })
  const decision = decide((await factsRes.json()) as Facts | null, deps.now())
  if (!decision.send) return json(200, { sent: 0, removed: 0, skipped: decision.reason })

  const results = await Promise.all(
    decision.targets.map(async (t): Promise<{ id: string; kind: SendKind }> => {
      try {
        const res = await deps.fetch(t.endpoint, {
          method: 'POST',
          headers: await pushHeaders(vapid, t.endpoint, Math.floor(deps.now() / 1000)),
          // Jamais de suivi de redirection : une adresse d'alerte ne doit pas nous envoyer ailleurs.
          redirect: 'manual',
          signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
        })
        return { id: t.id, kind: classifyStatus(res.status) }
      } catch {
        return { id: t.id, kind: 'failed' }
      }
    }),
  )
  const expired = results.filter((r) => r.kind === 'expired').map((r) => r.id)
  if (expired.length) {
    // Abonnements disparus (404/410) : on les retire pour ne plus essayer.
    await deps
      .fetch(`${base}/rest/v1/push_subscriptions?id=in.(${expired.join(',')})`, { method: 'DELETE', headers: { ...rest, Prefer: 'return=minimal' }, signal: AbortSignal.timeout(SEND_TIMEOUT_MS) })
      .catch(() => undefined)
  }
  const summary = { sent: results.filter((r) => r.kind === 'sent').length, removed: expired.length, failed: results.filter((r) => r.kind === 'failed').length }
  // Journal sans donnée personnelle : seulement des compteurs.
  console.log(JSON.stringify(summary))
  return json(200, summary)
}

// Sous Deno : démarre le serveur. Sous Node (tests) : rien ne se lance.
if (typeof Deno !== 'undefined') {
  const d = Deno
  d.serve((req) =>
    handle(
      req,
      {
        SUPABASE_URL: d.env.get('SUPABASE_URL'),
        SUPABASE_SERVICE_ROLE_KEY: d.env.get('SUPABASE_SERVICE_ROLE_KEY'),
        VAPID_PUBLIC_KEY: d.env.get('VAPID_PUBLIC_KEY'),
        VAPID_PRIVATE_KEY: d.env.get('VAPID_PRIVATE_KEY'),
        VAPID_SUBJECT: d.env.get('VAPID_SUBJECT'),
        NOTIFY_WEBHOOK_SECRET: d.env.get('NOTIFY_WEBHOOK_SECRET'),
      },
      { fetch, now: () => Date.now() },
    ),
  )
}

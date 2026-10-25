// Fonction Edge notify-message : logique pure (webhook, décision d'alerte, jeton VAPID) et traitement complet avec un faux réseau.
import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  MAX_AGE_MS,
  MIN_GAP_MS,
  audienceOf,
  b64urlDecode,
  b64urlEncode,
  classifyStatus,
  decide,
  handle,
  importVapidKey,
  isAllowedEndpoint,
  parseWebhook,
  pushHeaders,
  secretsMatch,
  vapidJwk,
  vapidToken,
  type Deps,
  type Env,
  type Facts,
} from '../../../supabase/functions/notify-message/index'

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => undefined)
})

const read = (rel: string) => readFileSync(new URL(`../../../${rel}`, import.meta.url), 'utf8')

const MSG = '11111111-1111-4111-8111-111111111111'
const SUB1 = '22222222-2222-4222-8222-222222222221'
const SUB2 = '22222222-2222-4222-8222-222222222222'
const FCM = 'https://fcm.googleapis.com/fcm/send/abcdefghijklmnopqrstuvwxyz'
const MOZ = 'https://updates.push.services.mozilla.com/wpush/v2/abcdefghijklmnop'
const NOW = Date.parse('2026-10-25T12:00:00Z')

const facts = (over: Partial<Facts> = {}): Facts => ({
  message_id: MSG,
  sender: 'b0000000-0000-4000-8000-000000000002',
  recipient: 'a0000000-0000-4000-8000-000000000001',
  sent_at: '2026-10-25T11:59:50Z',
  sender_banned: false,
  recipient_banned: false,
  blocked: false,
  prefs_messages: true,
  previous_at: null,
  subscriptions: [
    { id: SUB1, endpoint: FCM, p256dh: 'x', auth: 'y' },
    { id: SUB2, endpoint: MOZ, p256dh: 'x', auth: 'y' },
  ],
  ...over,
})

async function keys() {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
  const pub = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey))
  const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey)
  return { publicKey: b64urlEncode(pub), privateKey: jwk.d as string, verifyKey: pair.publicKey }
}

describe('webhook de base de données', () => {
  it('retient seulement l’identifiant d’un message inséré', () => {
    expect(parseWebhook({ type: 'INSERT', table: 'messages', schema: 'public', record: { id: MSG, body: 'texte secret', sender: 'x' } })).toEqual({ ok: true, messageId: MSG })
    expect(parseWebhook({ type: 'INSERT', table: 'messages', record: { id: MSG.toUpperCase() } })).toEqual({ ok: true, messageId: MSG })
  })
  it('refuse tout le reste', () => {
    const bad: unknown[] = [
      null,
      'texte',
      {},
      { type: 'UPDATE', table: 'messages', record: { id: MSG } },
      { type: 'DELETE', table: 'messages', record: { id: MSG } },
      { type: 'INSERT', table: 'profiles', record: { id: MSG } },
      { type: 'INSERT', table: 'messages', schema: 'auth', record: { id: MSG } },
      { type: 'INSERT', table: 'messages', record: { id: 'pas-un-uuid' } },
      { type: 'INSERT', table: 'messages', record: { id: `${MSG}'; drop table x` } },
      { type: 'INSERT', table: 'messages', record: null },
      { type: 'INSERT', table: 'messages' },
    ]
    for (const b of bad) expect(parseWebhook(b).ok, JSON.stringify(b)).toBe(false)
  })
})

describe('secret du webhook', () => {
  const secret = 'un-secret-assez-long-0123456789'
  it('accepte le bon secret, refuse tout le reste', async () => {
    expect(await secretsMatch(secret, secret)).toBe(true)
    expect(await secretsMatch(secret + 'x', secret)).toBe(false)
    expect(await secretsMatch(secret.slice(0, -1), secret)).toBe(false)
    expect(await secretsMatch('', secret)).toBe(false)
    expect(await secretsMatch(null, secret)).toBe(false)
    expect(await secretsMatch(undefined, secret)).toBe(false)
  })
  it('refuse quand le secret n’est pas configuré ou trop court (jamais « vide égale vide »)', async () => {
    expect(await secretsMatch('', '')).toBe(false)
    expect(await secretsMatch('abc', 'abc')).toBe(false)
    expect(await secretsMatch('quelque chose', undefined)).toBe(false)
  })
})

describe('adresses des services d’alerte', () => {
  it('accepte Google, Mozilla, Apple, Microsoft', () => {
    for (const e of [FCM, MOZ, 'https://web.push.apple.com/QAbcdefghijklmnop', 'https://db5p.notify.windows.com/w/?token=abcdefghijk']) expect(isAllowedEndpoint(e), e).toBe(true)
  })
  it('refuse les autres sites, http, adresses internes, astuces d’URL', () => {
    const bad = [
      'http://fcm.googleapis.com/fcm/send/abcdefghijklmnop',
      'https://evil.example.com/fcm/send/abcdefghijklmnop',
      'https://169.254.169.254/latest/meta-data/abcdefgh',
      'https://localhost/abcdefghijklmnopqrstu',
      'https://fcm.googleapis.com@evil.example.com/abcdefghijk',
      'https://fcm.googleapis.com.evil.example.com/abcdefghijk',
      'https://evilfcm.googleapis.com/abcdefghijklmnopq',
      'https://fcm.googleapis.com:8443@evil.example.com/abcdefg',
      'https://fcm.googleapis.com/ab cd',
      'https://fcm.googleapis.com/' + 'a'.repeat(800),
      '',
      null,
      undefined,
      42,
    ]
    for (const e of bad) expect(isAllowedEndpoint(e), String(e)).toBe(false)
  })
  it('même liste que la contrainte SQL (v5)', () => {
    const sql = read('supabase/neighbors/migrations/20261025030000_neighbors_v5_push.sql')
    const m = /endpoint ~ '(\^https:\/\/\([^']+\$)'/.exec(sql)
    expect(m).not.toBeNull()
    const fn = read('supabase/functions/notify-message/index.ts')
    const js = /const PUSH_ENDPOINT = \/(.+)\/\n/.exec(fn)![1].replace(/\\\//g, '/')
    expect(js).toBe(m![1].replace(/\\\./g, '\\.'))
  })
})

describe('décision d’envoyer une alerte', () => {
  it('envoie à tous les appareils du destinataire quand tout est en règle', () => {
    const d = decide(facts(), NOW)
    expect(d.send).toBe(true)
    if (d.send) expect(d.targets.map((t) => t.id)).toEqual([SUB1, SUB2])
  })
  it('respecte la préférence : décochée ou absente = rien', () => {
    expect(decide(facts({ prefs_messages: false }), NOW)).toEqual({ send: false, reason: 'preference' })
    expect(decide(facts({ prefs_messages: null }), NOW)).toEqual({ send: false, reason: 'preference' })
    expect(decide(facts({ prefs_messages: 'true' as unknown as boolean }), NOW)).toEqual({ send: false, reason: 'preference' })
  })
  it('respecte le blocage dans les deux sens (la base le résume en un indicateur)', () => {
    expect(decide(facts({ blocked: true }), NOW)).toEqual({ send: false, reason: 'blocage' })
  })
  it('respecte le bannissement de l’expéditeur et du destinataire', () => {
    expect(decide(facts({ sender_banned: true }), NOW)).toEqual({ send: false, reason: 'banni' })
    expect(decide(facts({ recipient_banned: true }), NOW)).toEqual({ send: false, reason: 'banni' })
  })
  it('rien sans abonnement, ni avec des adresses non autorisées', () => {
    expect(decide(facts({ subscriptions: [] }), NOW)).toEqual({ send: false, reason: 'aucun_appareil' })
    expect(decide(facts({ subscriptions: [{ id: SUB1, endpoint: 'https://evil.example.com/abcdefghijklmnop' }] }), NOW)).toEqual({ send: false, reason: 'aucun_appareil' })
    expect(decide(facts({ subscriptions: [{ id: 'pas-un-uuid', endpoint: FCM }] }), NOW)).toEqual({ send: false, reason: 'aucun_appareil' })
  })
  it('écarte seulement les adresses non autorisées, garde les autres', () => {
    const d = decide(facts({ subscriptions: [{ id: SUB1, endpoint: 'https://evil.example.com/abcdefghijklmnop' }, { id: SUB2, endpoint: MOZ }] }), NOW)
    expect(d.send && d.targets.map((t) => t.id)).toEqual([SUB2])
  })
  it('une alerte à la fois : pas de seconde alerte si le message précédent date de moins de 2 minutes', () => {
    expect(decide(facts({ previous_at: new Date(Date.parse('2026-10-25T11:59:50Z') - MIN_GAP_MS + 1000).toISOString() }), NOW)).toEqual({ send: false, reason: 'rythme' })
    expect(decide(facts({ previous_at: new Date(Date.parse('2026-10-25T11:59:50Z') - MIN_GAP_MS - 1000).toISOString() }), NOW).send).toBe(true)
  })
  it('un webhook rejoué très tard n’alerte pas', () => {
    expect(decide(facts({ sent_at: new Date(NOW - MAX_AGE_MS - 1000).toISOString() }), NOW)).toEqual({ send: false, reason: 'trop_ancien' })
  })
  it('message inconnu ou incohérent', () => {
    expect(decide(null, NOW)).toEqual({ send: false, reason: 'message_inconnu' })
    expect(decide(facts({ recipient: 'a0000000-0000-4000-8000-000000000001', sender: 'a0000000-0000-4000-8000-000000000001' }), NOW)).toEqual({ send: false, reason: 'destinataire' })
  })
})

describe('jeton VAPID', () => {
  it('base64url : aller-retour', () => {
    const b = new Uint8Array([0, 250, 251, 252, 253, 254, 255, 1, 2])
    expect(Array.from(b64urlDecode(b64urlEncode(b)))).toEqual(Array.from(b))
    expect(b64urlEncode(b)).not.toMatch(/[+/=]/)
  })
  it('refuse des clés mal formées', async () => {
    const k = await keys()
    expect(() => vapidJwk('court', k.privateKey)).toThrow()
    expect(() => vapidJwk(k.publicKey, 'court')).toThrow()
    expect(() => vapidJwk(b64urlEncode(new Uint8Array(65)), k.privateKey)).toThrow()
  })
  it('signe un jeton ES256 que la clé publique vérifie, avec audience, expiration et contact', async () => {
    const k = await keys()
    const key = await importVapidKey(k.publicKey, k.privateKey)
    const jwt = await vapidToken(key, audienceOf(FCM), 'mailto:contact@exemple.fr', 1_000_000)
    const [h, c, s] = jwt.split('.')
    expect(JSON.parse(new TextDecoder().decode(b64urlDecode(h)))).toEqual({ typ: 'JWT', alg: 'ES256' })
    const claims = JSON.parse(new TextDecoder().decode(b64urlDecode(c)))
    expect(claims).toEqual({ aud: 'https://fcm.googleapis.com', exp: 1_000_000 + 12 * 3600, sub: 'mailto:contact@exemple.fr' })
    expect(claims.exp - 1_000_000).toBeLessThanOrEqual(24 * 3600)
    const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, k.verifyKey, b64urlDecode(s), new TextEncoder().encode(`${h}.${c}`))
    expect(ok).toBe(true)
    expect(b64urlDecode(s)).toHaveLength(64)
  })
  it('une alerte vide : en-têtes VAPID, Topic, TTL, aucun corps déclaré', async () => {
    const k = await keys()
    const h = await pushHeaders({ publicKey: k.publicKey, key: await importVapidKey(k.publicKey, k.privateKey), subject: 'mailto:c@exemple.fr' }, MOZ, 5000)
    expect(h.Authorization).toMatch(new RegExp(`^vapid t=[\\w-]+\\.[\\w-]+\\.[\\w-]+, k=${k.publicKey}$`))
    expect(h.Topic).toBe('nouveau-message')
    expect(Number(h.TTL)).toBeGreaterThan(0)
    expect(Object.keys(h).join()).not.toMatch(/content-type|content-encoding|content-length/i)
  })
  it('classe les réponses du service d’alerte', () => {
    expect([201, 200, 202].map(classifyStatus)).toEqual(['sent', 'sent', 'sent'])
    expect([404, 410].map(classifyStatus)).toEqual(['expired', 'expired'])
    expect([400, 401, 403, 413, 429, 500, 503, 301].map(classifyStatus)).toEqual(Array(8).fill('failed'))
  })
})

describe('traitement d’une requête', () => {
  const SECRET = 'secret-du-webhook-0123456789abcdef'
  async function setup(over: { facts?: Facts | null; statuses?: Record<string, number>; factsStatus?: number } = {}) {
    const k = await keys()
    const calls: { url: string; method: string; headers: Record<string, string>; body: unknown; redirect?: string }[] = []
    const env: Env = {
      SUPABASE_URL: 'https://projet.supabase.co/',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-key-de-test',
      VAPID_PUBLIC_KEY: k.publicKey,
      VAPID_PRIVATE_KEY: k.privateKey,
      VAPID_SUBJECT: 'mailto:contact@exemple.fr',
      NOTIFY_WEBHOOK_SECRET: SECRET,
    }
    const f: typeof fetch = async (input, init) => {
      const url = String(input)
      calls.push({ url, method: init?.method ?? 'GET', headers: (init?.headers ?? {}) as Record<string, string>, body: init?.body, redirect: init?.redirect })
      if (url.includes('/rpc/neighbors_push_facts')) return new Response(JSON.stringify(over.facts === undefined ? facts() : over.facts), { status: over.factsStatus ?? 200 })
      if (url.includes('/rest/v1/push_subscriptions')) return new Response(null, { status: 204 })
      return new Response(null, { status: over.statuses?.[url] ?? 201 })
    }
    const deps: Deps = { fetch: f, now: () => NOW }
    const post = (body: unknown, headers: Record<string, string> = { 'x-webhook-secret': SECRET }) =>
      new Request('https://fn.example/notify-message', { method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body) })
    const hook = { type: 'INSERT', table: 'messages', schema: 'public', record: { id: MSG, body: 'TEXTE SECRET', sender: 'x' } }
    return { env, deps, calls, post, hook }
  }

  it('envoie une alerte vide à chaque appareil, sans aucun contenu du message', async () => {
    const t = await setup()
    const res = await handle(t.post(t.hook), t.env, t.deps)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ sent: 2, removed: 0, failed: 0 })
    const pushes = t.calls.filter((c) => c.url === FCM || c.url === MOZ)
    expect(pushes).toHaveLength(2)
    for (const p of pushes) {
      expect(p.method).toBe('POST')
      expect(p.body).toBeUndefined()
      expect(p.redirect).toBe('manual')
      expect(JSON.stringify(p)).not.toMatch(/TEXTE SECRET|Bob|Alice/)
      expect(p.headers.Authorization).toMatch(/^vapid t=/)
    }
  })
  it('relit les faits en base avec la clé de service et ne garde que l’identifiant du webhook', async () => {
    const t = await setup()
    await handle(t.post(t.hook), t.env, t.deps)
    const call = t.calls[0]
    expect(call.url).toBe('https://projet.supabase.co/rest/v1/rpc/neighbors_push_facts')
    expect(JSON.parse(call.body as string)).toEqual({ p_message_id: MSG })
    expect(call.headers.apikey).toBe('service-role-key-de-test')
  })
  it('refuse sans le bon secret, sans rien lire en base ni envoyer', async () => {
    const t = await setup()
    for (const headers of [{} as Record<string, string>, { 'x-webhook-secret': 'faux' }, { 'x-webhook-secret': SECRET + 'x' }]) {
      const res = await handle(t.post(t.hook, headers), t.env, t.deps)
      expect(res.status).toBe(401)
    }
    expect(t.calls).toHaveLength(0)
  })
  it('refuse une méthode autre que POST', async () => {
    const t = await setup()
    expect((await handle(new Request('https://fn.example/', { method: 'GET', headers: { 'x-webhook-secret': SECRET } }), t.env, t.deps)).status).toBe(405)
    expect(t.calls).toHaveLength(0)
  })
  it('refuse un corps abîmé, trop gros ou qui n’est pas un message inséré', async () => {
    const t = await setup()
    expect((await handle(t.post('pas du json'), t.env, t.deps)).status).toBe(400)
    expect((await handle(t.post({ ...t.hook, table: 'profiles' }), t.env, t.deps)).status).toBe(400)
    expect((await handle(t.post('x'.repeat(20_000)), t.env, t.deps)).status).toBe(413)
    expect(t.calls).toHaveLength(0)
  })
  it('refuse sans configuration complète (sans révéler laquelle)', async () => {
    const t = await setup()
    const res = await handle(t.post(t.hook), { ...t.env, VAPID_PRIVATE_KEY: undefined }, t.deps)
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'configuration' })
    expect((await handle(t.post(t.hook), { ...t.env, VAPID_PRIVATE_KEY: 'pas une clé' }, t.deps)).status).toBe(500)
    expect((await handle(t.post(t.hook), { ...t.env, VAPID_SUBJECT: 'contact' }, t.deps)).status).toBe(500)
  })
  it('n’envoie rien si la préférence est décochée, en cas de blocage ou de bannissement', async () => {
    for (const over of [{ prefs_messages: false }, { prefs_messages: null }, { blocked: true }, { sender_banned: true }, { recipient_banned: true }, { subscriptions: [] }] as Partial<Facts>[]) {
      const t = await setup({ facts: facts(over) })
      const res = await handle(t.post(t.hook), t.env, t.deps)
      expect(res.status).toBe(200)
      expect(await res.json()).toMatchObject({ sent: 0 })
      expect(t.calls.filter((c) => c.url === FCM || c.url === MOZ)).toHaveLength(0)
    }
  })
  it('retire les abonnements expirés (404 et 410) et garde les échecs passagers', async () => {
    const t = await setup({ statuses: { [FCM]: 410, [MOZ]: 503 } })
    const res = await handle(t.post(t.hook), t.env, t.deps)
    expect(await res.json()).toEqual({ sent: 0, removed: 1, failed: 1 })
    const del = t.calls.find((c) => c.method === 'DELETE')!
    expect(del.url).toBe(`https://projet.supabase.co/rest/v1/push_subscriptions?id=in.(${SUB1})`)
  })
  it('un 404 retire aussi l’abonnement', async () => {
    const t = await setup({ statuses: { [MOZ]: 404 } })
    const res = await handle(t.post(t.hook), t.env, t.deps)
    expect(await res.json()).toEqual({ sent: 1, removed: 1, failed: 0 })
    expect(t.calls.find((c) => c.method === 'DELETE')!.url).toContain(SUB2)
  })
  it('ne contacte jamais une adresse hors de la liste, même si la base en contient une', async () => {
    const t = await setup({ facts: facts({ subscriptions: [{ id: SUB1, endpoint: 'https://169.254.169.254/latest/meta-data/abcdefghijk' }] }) })
    await handle(t.post(t.hook), t.env, t.deps)
    expect(t.calls.some((c) => c.url.includes('169.254'))).toBe(false)
  })
  it('base injoignable : erreur claire, aucune alerte', async () => {
    const t = await setup({ factsStatus: 500 })
    expect((await handle(t.post(t.hook), t.env, t.deps)).status).toBe(502)
  })
  it('la réponse ne contient aucune donnée personnelle', async () => {
    const t = await setup()
    const text = await (await handle(t.post(t.hook), t.env, t.deps)).text()
    expect(text).not.toMatch(/fcm|mozilla|a0000000|b0000000|TEXTE/)
  })
})

describe('secrets : rien dans le dépôt', () => {
  it('la fonction lit les clés privées dans l’environnement, jamais en dur', () => {
    const fn = read('supabase/functions/notify-message/index.ts')
    expect(fn).toContain("d.env.get('VAPID_PRIVATE_KEY')")
    expect(fn).toContain("d.env.get('NOTIFY_WEBHOOK_SECRET')")
    expect(fn).not.toMatch(/['"`][A-Za-z0-9_-]{43,}['"`]/)
  })
  it('aucune clé privée ni secret dans la migration, les docs ou les variables exposées au navigateur', () => {
    for (const rel of ['supabase/neighbors/migrations/20261025030000_neighbors_v5_push.sql', 'docs/ENTRAIDE.md', 'vite.config.ts', 'src/vite-env.d.ts']) {
      const t = read(rel)
      expect(t, rel).not.toMatch(/(VITE_|NEIGHBORS_)\w*(VAPID_PRIVATE|WEBHOOK_SECRET|SERVICE_ROLE)/)
      expect(t, rel).not.toMatch(/VAPID_PRIVATE_KEY\s*=\s*[A-Za-z0-9_-]{30,}/)
    }
  })
  it('le nom de la clé publique passe le contrôle de Vercel (ni KEY, ni TOKEN, ni SECRET)', () => {
    expect('NEIGHBORS_VAPID_PUBLIC').not.toMatch(/KEY|TOKEN|SECRET|PASSWORD/)
    expect(read('src/vite-env.d.ts')).toContain('NEIGHBORS_VAPID_PUBLIC')
  })
})

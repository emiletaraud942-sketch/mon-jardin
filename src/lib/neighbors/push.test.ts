// Alertes de nouveaux messages, côté appareil : détection du support, adresses, service worker, pont avec l'appli.
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isVapidPublicKey } from './env'
import { ALERT_TEXT, MAX_DEVICES, PERMISSION_TEXT, SUPPORT_TEXT, detectPushSupport, isIosDevice, isKnownPushEndpoint, sameBytes, toDeviceRow, urlBase64ToBytes, type PushEnv } from './push'
import { consumeOpenMessages, resetBridge, routeSwMessage, wantsMessages } from './pushBridge'
import { translateError } from './api'

// ui.ts demande un navigateur : seul setUi est utilisé par le pont, on le remplace.
vi.mock('../ui', () => ({ setUi: vi.fn() }))

// Même règle que src/lib/sentences.test.ts : 20 mots au plus par phrase.
const sentencesOf = (text: string) => text.replace(/\s+/g, ' ').split(/(?<=[.!?])\s+(?=[A-ZÀ-ÖØ-Þ«“"'])/).map((x) => x.trim()).filter(Boolean)
const wordCount = (sentence: string) => sentence.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length

const read = (rel: string) => readFileSync(new URL(`../../../${rel}`, import.meta.url), 'utf8')
const KEY = 'BH5wj5gJOedDwXwDnZodeCvLso8twzBy0Lu_At3ksNnwxNdXNMHXWVjMAcJ_8nWGVa5wvYQCNF2fAbUwX7tQkYY'

const env = (over: Partial<PushEnv> = {}): PushEnv => ({ hasServiceWorker: true, hasPushManager: true, hasNotification: true, isIos: false, standalone: false, vapidPublic: KEY, ...over })

describe('détection du support des alertes', () => {
  it('possible quand tout est là', () => {
    expect(detectPushSupport(env())).toEqual({ ok: true })
  })
  it('sans clé publique : fonction non ouverte', () => {
    expect(detectPushSupport(env({ vapidPublic: undefined }))).toEqual({ ok: false, reason: 'not-configured' })
  })
  it('un appareil sans service worker, sans PushManager ou sans Notification n’a pas les alertes', () => {
    expect(detectPushSupport(env({ hasServiceWorker: false }))).toEqual({ ok: false, reason: 'service-worker' })
    expect(detectPushSupport(env({ hasPushManager: false }))).toEqual({ ok: false, reason: 'push' })
    expect(detectPushSupport(env({ hasNotification: false }))).toEqual({ ok: false, reason: 'notification' })
  })
  it('iPhone et iPad : seulement si l’appli est sur l’écran d’accueil', () => {
    expect(detectPushSupport(env({ isIos: true, standalone: false, hasPushManager: false, hasNotification: false }))).toEqual({ ok: false, reason: 'ios-install' })
    expect(detectPushSupport(env({ isIos: true, standalone: true }))).toEqual({ ok: true })
  })
  it('reconnaît iPhone, iPad et iPad déguisé en Mac', () => {
    expect(isIosDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)', 'iPhone', 5)).toBe(true)
    expect(isIosDevice('Mozilla/5.0 (iPad; CPU OS 16_4 like Mac OS X)', 'iPad', 5)).toBe(true)
    expect(isIosDevice('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 'MacIntel', 5)).toBe(true)
    expect(isIosDevice('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 'MacIntel', 0)).toBe(false)
    expect(isIosDevice('Mozilla/5.0 (Linux; Android 14)', 'Linux armv8l', 5)).toBe(false)
  })
  it('chaque cas a une explication en français simple, avec le repli vers la pastille', () => {
    for (const [reason, text] of Object.entries(SUPPORT_TEXT)) {
      expect(text.length, reason).toBeGreaterThan(20)
      for (const s of sentencesOf(text)) expect(wordCount(s), s).toBeLessThanOrEqual(20)
    }
    expect(SUPPORT_TEXT['ios-install']).toMatch(/écran d’accueil/)
    expect(SUPPORT_TEXT['ios-install']).toMatch(/Partager/)
    for (const r of ['service-worker', 'push', 'notification', 'not-configured'] as const) expect(SUPPORT_TEXT[r]).toMatch(/quand vous ouvrez l’appli/)
  })
  it('l’état de l’autorisation est expliqué avec les mots de l’appli (« programme internet »)', () => {
    expect(Object.keys(PERMISSION_TEXT).sort()).toEqual(['default', 'denied', 'granted', 'unsupported'])
    for (const t of Object.values(PERMISSION_TEXT)) {
      expect(t).not.toMatch(/navigateur|push|endpoint/i)
      for (const s of sentencesOf(t)) expect(wordCount(s), s).toBeLessThanOrEqual(20)
    }
    expect(PERMISSION_TEXT.denied).toMatch(/réglages/)
  })
})

describe('clé publique VAPID', () => {
  it('accepte une clé de 65 octets en base64url', () => {
    expect(KEY).toHaveLength(87)
    expect(isVapidPublicKey(KEY)).toBe(true)
    expect(urlBase64ToBytes(KEY)).toHaveLength(65)
    expect(urlBase64ToBytes(KEY)[0]).toBe(4)
  })
  it('refuse le reste : vide, trop courte, mauvais caractères, mauvais premier octet', () => {
    for (const v of [undefined, null, '', 'abc', KEY.slice(1), KEY + 'A', KEY.replace('B', '+'), 'A'.repeat(87), 42]) expect(isVapidPublicKey(v), String(v)).toBe(false)
  })
  it('compare des octets', () => {
    expect(sameBytes(new Uint8Array([1, 2]).buffer, new Uint8Array([1, 2]))).toBe(true)
    expect(sameBytes(new Uint8Array([1, 2]), new Uint8Array([1, 3]))).toBe(false)
    expect(sameBytes(null, new Uint8Array([1]))).toBe(false)
  })
})

describe('abonnement du navigateur', () => {
  const p256dh = 'B'.repeat(87)
  const auth = 'a'.repeat(22)
  const sub = (j: unknown) => ({ toJSON: () => j })
  it('extrait adresse et clés', () => {
    const row = toDeviceRow(sub({ endpoint: 'https://fcm.googleapis.com/fcm/send/abcdefghijklmnop', keys: { p256dh, auth } }))
    expect(row).toEqual({ endpoint: 'https://fcm.googleapis.com/fcm/send/abcdefghijklmnop', p256dh, auth })
  })
  it('refuse une adresse inconnue, des clés absentes ou mal formées', () => {
    expect(toDeviceRow(null)).toBeNull()
    expect(toDeviceRow(sub({ endpoint: 'https://evil.example.com/abcdefghijklmnopq', keys: { p256dh, auth } }))).toBeNull()
    expect(toDeviceRow(sub({ endpoint: 'https://fcm.googleapis.com/fcm/send/abcdefghijklmnop' }))).toBeNull()
    expect(toDeviceRow(sub({ endpoint: 'https://fcm.googleapis.com/fcm/send/abcdefghijklmnop', keys: { p256dh: 'x', auth } }))).toBeNull()
    expect(toDeviceRow(sub({ endpoint: 'https://fcm.googleapis.com/fcm/send/abcdefghijklmnop', keys: { p256dh, auth: 'x' } }))).toBeNull()
  })
  it('services connus', () => {
    expect(isKnownPushEndpoint('https://updates.push.services.mozilla.com/wpush/v2/abcdefghijk')).toBe(true)
    expect(isKnownPushEndpoint('https://web.push.apple.com/QAbcdefghijklmnop')).toBe(true)
    expect(isKnownPushEndpoint('http://web.push.apple.com/QAbcdefghijklmnop')).toBe(false)
  })
  it('même plafond que la base', () => {
    expect(MAX_DEVICES).toBe(5)
    expect(read('supabase/neighbors/migrations/20261025030000_neighbors_v5_push.sql')).toMatch(/>= 5 then\s+raise exception 'push_limit'/)
  })
})

describe('messages d’erreur', () => {
  it('plafond de 5 appareils, adresse refusée, base pas encore mise à jour', () => {
    expect(translateError({ message: 'push_limit', code: 'P0001' })).toMatch(/5 appareils/)
    expect(translateError({ message: 'new row violates check constraint "push_subscriptions_endpoint_check"', code: '23514' })).toMatch(/ne peut pas recevoir/)
    expect(translateError({ message: "Could not find the table 'public.notification_prefs' in the schema cache", code: 'PGRST205' })).toMatch(/pas encore ouvertes/)
    expect(translateError({ message: 'quota_exceeded:push', code: 'P0001' })).toMatch(/limite/i)
  })
  it('aucune phrase trop longue', () => {
    for (const m of [translateError({ message: 'push_limit' }), translateError({ message: 'push_subscriptions_endpoint_check' })]) for (const s of sentencesOf(m)) expect(wordCount(s)).toBeLessThanOrEqual(20)
  })
})

// ----- service worker : on exécute public/push-sw.js dans un faux environnement -----
interface FakeClient {
  url: string
  focused: boolean
  posted: unknown[]
  focus(): Promise<void>
  postMessage(m: unknown): void
}
function loadSw(clients: { url: string; focusFails?: boolean }[] = []) {
  const listeners: Record<string, (e: unknown) => void> = {}
  const shown: { title: string; options: Record<string, unknown> }[] = []
  const opened: string[] = []
  const list: FakeClient[] = clients.map((c): FakeClient => ({
    url: c.url,
    focused: false,
    posted: [] as unknown[],
    focus() {
      if (c.focusFails) return Promise.reject(new Error('refusé'))
      this.focused = true
      return Promise.resolve()
    },
    postMessage(m: unknown) {
      this.posted.push(m)
    },
  }))
  const self = {
    location: { origin: 'https://permajardin.example' },
    addEventListener: (type: string, fn: (e: unknown) => void) => {
      listeners[type] = fn
    },
    registration: {
      showNotification: async (title: string, options: Record<string, unknown>) => {
        shown.push({ title, options })
      },
    },
    clients: { matchAll: async () => list, openWindow: async (u: string) => void opened.push(u) },
  }
  vm.runInNewContext(read('public/push-sw.js'), { self, URL })
  const fire = async (type: string, extra: Record<string, unknown> = {}) => {
    let pending: Promise<unknown> = Promise.resolve()
    const closed: boolean[] = []
    listeners[type]({ waitUntil: (p: Promise<unknown>) => (pending = p), notification: { close: () => closed.push(true) }, ...extra })
    await pending
    return closed
  }
  return { listeners, shown, opened, list, fire }
}

describe('service worker : alerte neutre', () => {
  it('ajoute seulement les gestionnaires push et notificationclick', () => {
    expect(Object.keys(loadSw().listeners).sort()).toEqual(['notificationclick', 'push'])
  })
  it('montre toujours le même texte, même si l’alerte reçue porte du texte', async () => {
    const sw = loadSw()
    await sw.fire('push', { data: { text: () => 'TEXTE SECRET du message de Bob', json: () => ({ body: 'TEXTE SECRET' }) } })
    await sw.fire('push')
    expect(sw.shown).toHaveLength(2)
    for (const n of sw.shown) {
      expect(n.title).toBe('PermaJardin')
      expect(n.options.body).toBe(ALERT_TEXT)
      expect(JSON.stringify(n)).not.toMatch(/SECRET|Bob/)
      expect(n.options.tag).toBe('permajardin-message')
      expect(n.options.lang).toBe('fr')
    }
  })
  it('le texte du service worker est celui de l’appli : « Vous avez un nouveau message »', () => {
    expect(ALERT_TEXT).toBe('Vous avez un nouveau message')
    expect(read('public/push-sw.js')).toContain(`'${ALERT_TEXT}'`)
    expect(read('public/push-sw.js')).not.toMatch(/event\.data|\.json\(\)|\.text\(\)/)
  })
  it('prévient l’appli ouverte pour mettre à jour la pastille', async () => {
    const sw = loadSw([{ url: 'https://permajardin.example/#entraide' }])
    await sw.fire('push')
    expect(sw.list[0].posted).toEqual([{ type: 'permajardin:nouveau-message' }])
  })
  it('un clic ferme l’alerte et ramène l’appli déjà ouverte aux messages', async () => {
    const sw = loadSw([{ url: 'https://autre-site.example/' }, { url: 'https://permajardin.example/#carte' }])
    const closed = await sw.fire('notificationclick')
    expect(closed).toEqual([true])
    expect(sw.list[0].posted).toEqual([])
    expect(sw.list[1].focused).toBe(true)
    expect(sw.list[1].posted).toEqual([{ type: 'permajardin:ouvrir-messages' }])
    expect(sw.opened).toEqual([])
  })
  it('un clic ouvre l’appli sur les messages quand elle est fermée', async () => {
    const sw = loadSw([{ url: 'https://autre-site.example/' }])
    await sw.fire('notificationclick')
    expect(sw.opened).toEqual(['/#entraide/messages'])
    expect(wantsMessages('/#entraide/messages'.slice(1))).toBe(true)
  })
  it('un clic marche même si la mise au premier plan est refusée', async () => {
    const sw = loadSw([{ url: 'https://permajardin.example/', focusFails: true }])
    await sw.fire('notificationclick')
    expect(sw.list[0].posted).toEqual([{ type: 'permajardin:ouvrir-messages' }])
  })
})

describe('configuration du service worker', () => {
  it('chargé par workbox (importScripts), mode « prompt » conservé, hors précache', () => {
    const cfg = read('vite.config.ts')
    expect(cfg).toContain("importScripts: ['push-sw.js']")
    expect(cfg).toContain("registerType: 'prompt'")
    expect(cfg).toMatch(/globIgnores: \['assets\/three-\*\.js', 'push-sw\.js', 'ocr\/\*\*'\]/) // le chunk 3D, le service worker des alertes et les modules de lecture d'étiquette restent hors précache
    expect(cfg).toContain('skipWaiting: false')
    expect(cfg).toContain("envPrefix: ['VITE_', 'NEIGHBORS_']")
  })
  it('jamais mis en cache durablement par l’hébergeur', () => {
    const v = JSON.parse(read('vercel.json')) as { headers: { source: string; headers: { key: string; value: string }[] }[] }
    const rule = v.headers.find((h) => h.source.includes('push-sw'))!
    expect(rule.headers).toContainEqual({ key: 'Cache-Control', value: 'no-cache' })
  })
  it('la politique de sécurité n’a pas besoin d’être élargie', () => {
    const csp = read('vercel.json')
    expect(csp).toContain("worker-src 'self' blob:")
    expect(csp).toContain("connect-src 'self' https://*.supabase.co")
  })
})

describe('pont entre le service worker et l’appli', () => {
  beforeEach(() => resetBridge())
  it('reconnaît seulement nos messages', () => {
    expect(routeSwMessage({ type: 'permajardin:nouveau-message' })).toBe('new-message')
    expect(routeSwMessage({ type: 'permajardin:ouvrir-messages' })).toBe('open-messages')
    for (const m of [null, undefined, 'texte', {}, { type: 'autre' }, { type: 42 }]) expect(routeSwMessage(m)).toBeNull()
  })
  it('l’adresse #entraide/messages ouvre les messages, une seule fois', () => {
    expect(wantsMessages('#entraide/messages')).toBe(true)
    expect(wantsMessages('#entraide')).toBe(false)
    expect(wantsMessages('')).toBe(false)
    expect(consumeOpenMessages('#entraide/messages')).toBe(true)
    expect(consumeOpenMessages('#entraide/messages')).toBe(false)
  })
  it('sans adresse ni clic, on commence par les nouveautés', () => {
    expect(consumeOpenMessages('#entraide')).toBe(false)
  })
})

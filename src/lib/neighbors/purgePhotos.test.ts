// Fonction Edge purge-neighbors-photos : secret, tri des chemins, effacement par l'API Storage avec un faux réseau.
import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BUCKET, CHUNK, MAX_FILES_PER_RUN, chunks, handle, secretsMatch, selectPaths, type Env } from '../../../supabase/functions/purge-neighbors-photos/index'

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => undefined)
})

const U1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const path = (n: number) => `${U1}/${(n + 0x10000000).toString(16)}-0000-4000-8000-000000000000.jpg`
const SECRET = 'un-secret-de-test-assez-long-0123456789'
const ENV: Env = { SUPABASE_URL: 'https://projet.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'SERVICE-KEY-DE-TEST', PURGE_SECRET: SECRET }

const req = (over: { method?: string; secret?: string | null } = {}) =>
  new Request('https://projet.supabase.co/functions/v1/purge-neighbors-photos', {
    method: over.method ?? 'POST',
    headers: over.secret === null ? {} : { 'x-purge-secret': over.secret ?? SECRET },
    body: (over.method ?? 'POST') === 'POST' ? '{}' : undefined,
  })

function fakeNetwork(orphans: unknown, opts: { purgeStatus?: number; deleteStatus?: number } = {}) {
  const calls: { url: string; method: string; body?: string; headers: Record<string, string> }[] = []
  const f = vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, method: String(init.method), body: init.body as string | undefined, headers: init.headers as Record<string, string> })
    if (url.endsWith('/rpc/neighbors_purge_expired')) return new Response('[]', { status: opts.purgeStatus ?? 200 })
    if (url.endsWith('/rpc/neighbors_orphan_photos')) return new Response(JSON.stringify(orphans), { status: 200 })
    if (url.includes('/storage/v1/object/')) {
      const prefixes = (JSON.parse(String(init.body)) as { prefixes: string[] }).prefixes
      return new Response(JSON.stringify(prefixes.map((name) => ({ name }))), { status: opts.deleteStatus ?? 200 })
    }
    return new Response('?', { status: 404 })
  })
  return { f: f as unknown as typeof fetch, calls }
}

describe('secretsMatch', () => {
  it('refuse vide, absent, trop court ou différent', async () => {
    expect(await secretsMatch(SECRET, SECRET)).toBe(true)
    expect(await secretsMatch(null, SECRET)).toBe(false)
    expect(await secretsMatch('', SECRET)).toBe(false)
    expect(await secretsMatch(SECRET, undefined)).toBe(false)
    expect(await secretsMatch('court', 'court')).toBe(false) // secret attendu de moins de 16 caractères = refus
    expect(await secretsMatch(SECRET + 'x', SECRET)).toBe(false)
  })
})

describe('selectPaths : seuls de vrais chemins de photos sont effacés', () => {
  it('garde <uuid>/<uuid>.jpg, écarte tout le reste, dédoublonne et plafonne', () => {
    const hostile = ['../autre/x.jpg', `${U1}/../x.jpg`, 'dossier/fichier.jpg', `${U1}/${U1}.html`, `${U1}/${U1}.jpg/`, `${U1}/sous/${U1}.jpg`, '', '*', U1 + '/', 42, null, { a: 1 }]
    const r = selectPaths([path(1), path(1), path(2), ...hostile])
    expect(r.paths).toEqual([path(1), path(2)])
    expect(r.ignored).toBe(hostile.length)
    expect(selectPaths(Array.from({ length: 800 }, (_, i) => path(i))).paths).toHaveLength(MAX_FILES_PER_RUN)
    expect(selectPaths('pas une liste')).toEqual({ paths: [], ignored: 0 })
    expect(selectPaths(null).paths).toEqual([])
  })
  it('découpe par paquets', () => {
    expect(chunks([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
    expect(CHUNK).toBeGreaterThan(0)
  })
})

describe('handle', () => {
  it('refuse sans secret, avec un mauvais secret, ou une autre méthode, sans aucun appel réseau', async () => {
    const { f, calls } = fakeNetwork([path(1)])
    expect((await handle(req({ secret: null }), ENV, { fetch: f })).status).toBe(401)
    expect((await handle(req({ secret: 'mauvais' }), ENV, { fetch: f })).status).toBe(401)
    expect((await handle(req({ method: 'GET' }), ENV, { fetch: f })).status).toBe(405)
    expect((await handle(req(), { ...ENV, PURGE_SECRET: undefined }, { fetch: f })).status).toBe(401)
    expect((await handle(req(), { ...ENV, PURGE_SECRET: 'court' }, { fetch: f })).status).toBe(401)
    expect(calls).toHaveLength(0)
  })

  it('500 sans configuration (adresse ou clé de service manquante, adresse non https)', async () => {
    const { f, calls } = fakeNetwork([])
    expect((await handle(req(), { ...ENV, SUPABASE_SERVICE_ROLE_KEY: undefined }, { fetch: f })).status).toBe(500)
    expect((await handle(req(), { ...ENV, SUPABASE_URL: undefined }, { fetch: f })).status).toBe(500)
    expect((await handle(req(), { ...ENV, SUPABASE_URL: 'http://projet.supabase.co' }, { fetch: f })).status).toBe(500)
    expect(calls).toHaveLength(0)
  })

  it('purge, liste les orphelins, efface par paquets dans le bon bucket avec la clé de service', async () => {
    const orphans = Array.from({ length: 230 }, (_, i) => path(i))
    const { f, calls } = fakeNetwork(orphans)
    const res = await handle(req(), ENV, { fetch: f })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ removed: 230, listed: 230, ignored: 0, capped: false })
    expect(calls[0].url).toBe('https://projet.supabase.co/rest/v1/rpc/neighbors_purge_expired')
    expect(calls[1].url).toBe('https://projet.supabase.co/rest/v1/rpc/neighbors_orphan_photos')
    const deletes = calls.filter((c) => c.method === 'DELETE')
    expect(deletes).toHaveLength(3) // 100 + 100 + 30
    for (const d of deletes) {
      expect(d.url).toBe(`https://projet.supabase.co/storage/v1/object/${BUCKET}`)
      expect(d.headers.Authorization).toBe('Bearer SERVICE-KEY-DE-TEST')
    }
    expect(BUCKET).toBe('neighbors-photos')
  })

  it('un chemin hostile renvoyé par la base n’est jamais transmis à Storage', async () => {
    const { f, calls } = fakeNetwork([path(1), '../../autre-bucket/secret.jpg', `${U1}/x.png`])
    const res = await handle(req(), ENV, { fetch: f })
    expect(await res.json()).toEqual({ removed: 1, listed: 1, ignored: 2, capped: false })
    const sent = calls.filter((c) => c.method === 'DELETE').map((c) => (JSON.parse(c.body ?? '{}') as { prefixes: string[] }).prefixes).flat()
    expect(sent).toEqual([path(1)])
  })

  it('aucun orphelin : aucun appel Storage', async () => {
    const { f, calls } = fakeNetwork([])
    const res = await handle(req(), ENV, { fetch: f })
    expect(res.status).toBe(200)
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false)
  })

  it('plafond par appel : 500 fichiers au plus, le reste attend le lendemain', async () => {
    const { f, calls } = fakeNetwork(Array.from({ length: 900 }, (_, i) => path(i)))
    const body = (await (await handle(req(), ENV, { fetch: f })).json()) as { removed: number; capped: boolean }
    expect(body).toMatchObject({ removed: MAX_FILES_PER_RUN, capped: true })
    expect(calls.filter((c) => c.method === 'DELETE')).toHaveLength(5)
  })

  it('échec de la purge SQL ou de Storage : 502 sans détail, rien d’autre n’est effacé', async () => {
    const a = fakeNetwork([path(1)], { purgeStatus: 500 })
    const r1 = await handle(req(), ENV, { fetch: a.f })
    expect(r1.status).toBe(502)
    expect(a.calls.some((c) => c.method === 'DELETE')).toBe(false)
    const b = fakeNetwork([path(1)], { deleteStatus: 500 })
    const r2 = await handle(req(), ENV, { fetch: b.f })
    expect(r2.status).toBe(502)
    const down = vi.fn(async () => {
      throw new TypeError('fetch failed https://projet.supabase.co SERVICE-KEY-DE-TEST')
    })
    const r3 = await handle(req(), ENV, { fetch: down as unknown as typeof fetch })
    expect(r3.status).toBe(502)
    expect(JSON.stringify(await r3.json())).not.toMatch(/supabase\.co|SERVICE-KEY/)
  })

  it('le journal ne contient que des compteurs (ni chemin, ni clé)', async () => {
    const { f } = fakeNetwork([path(1)])
    await handle(req(), ENV, { fetch: f })
    const logged = JSON.stringify(vi.mocked(console.log).mock.calls)
    expect(logged).not.toMatch(/aaaaaaaa|SERVICE-KEY|supabase/)
  })
})

describe('fichiers : aucun secret en dur', () => {
  const src = readFileSync(new URL('../../../supabase/functions/purge-neighbors-photos/index.ts', import.meta.url), 'utf8')
  const cron = readFileSync(new URL('../../../supabase/neighbors/cron.sql', import.meta.url), 'utf8')
  it('la fonction lit ses secrets dans l’environnement seulement', () => {
    expect(src).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}/) // jeton JWT
    expect(src).not.toMatch(/https:\/\/[a-z0-9]{15,}\.supabase\.co/)
    expect(src).toMatch(/d\.env\.get\('SUPABASE_SERVICE_ROLE_KEY'\)/)
    expect(src).toMatch(/d\.env\.get\('PURGE_SECRET'\)/)
  })
  it('cron.sql : toute instruction est en commentaire et aucun secret n’y figure', () => {
    const live = cron.split('\n').filter((l) => l.trim() && !l.trim().startsWith('--'))
    expect(live).toEqual([])
    expect(cron).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}|service_role_key\s*[:=]/i)
    expect(cron).toMatch(/cron\.schedule\('neighbors-purge-quotidienne'/)
    expect(cron).toMatch(/vault\.decrypted_secrets/)
  })
})

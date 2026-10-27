import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { VercelRequest, VercelResponse } from '../_vercel-types'
import handler, { clientIp, createRateLimiter, decodeBase64Image, detectImageMime, imageSize, interpretPlantnet, hasBrowserOrigin, isAllowedOrigin, MAX_BODY_BYTES, rateKey, scrubError } from '../identify'

/** JPEG minimal avec un segment SOF0 (dimensions déclarées). */
const jpeg = (w = 640, h = 480) => Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0x4a, 0x46, 0xff, 0xc0, 0, 17, 8, h >> 8, h & 255, w >> 8, w & 255, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1, 0xff, 0xd9])
const png = (w = 640, h = 480) => {
  const b = Buffer.alloc(33)
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]).copy(b)
  b.writeUInt32BE(w, 16)
  b.writeUInt32BE(h, 20)
  return b
}
const webp = () => {
  const b = Buffer.alloc(30)
  b.write('RIFF', 0)
  b.write('WEBP', 8)
  b.write('VP8X', 12)
  b.writeUIntLE(639, 24, 3)
  b.writeUIntLE(479, 27, 3)
  return b
}
const JPEG = jpeg()
const PNG = png()
const WEBP = webp()
const b64 = (b: Buffer) => b.toString('base64')

describe('detectImageMime', () => {
  it('reconnaît JPEG, PNG, WebP d’après les octets', () => {
    expect(detectImageMime(JPEG)).toBe('image/jpeg')
    expect(detectImageMime(PNG)).toBe('image/png')
    expect(detectImageMime(WEBP)).toBe('image/webp')
  })
  it('refuse le reste (HEIC, GIF, texte, vide)', () => {
    expect(detectImageMime(Buffer.from('GIF89a......'))).toBeUndefined()
    expect(detectImageMime(Buffer.from('\0\0\0\x18ftypheic'))).toBeUndefined()
    expect(detectImageMime(Buffer.from('<html>'))).toBeUndefined()
    expect(detectImageMime(new Uint8Array())).toBeUndefined()
    expect(detectImageMime(Buffer.from('RIFF....WAVE'))).toBeUndefined()
  })
})

describe('createRateLimiter', () => {
  it('bloque au-delà du maximum puis libère à la fin de la fenêtre', () => {
    let t = 0
    const l = createRateLimiter(3, 1000, () => t)
    expect([l.check('a').allowed, l.check('a').allowed, l.check('a').allowed]).toEqual([true, true, true])
    const blocked = l.check('a')
    expect(blocked.allowed).toBe(false)
    expect(blocked.retryAfterSec).toBe(1)
    expect(l.check('b').allowed).toBe(true) // autre IP
    t = 1001
    expect(l.check('a').allowed).toBe(true)
  })
  it('une requête refusée ne prolonge pas le blocage', () => {
    let t = 0
    const l = createRateLimiter(1, 1000, () => t)
    l.check('a')
    t = 500
    l.check('a')
    t = 1001
    expect(l.check('a').allowed).toBe(true)
  })
})

describe('createRateLimiter : mémoire bornée', () => {
  it('50 000 clés différentes (IP falsifiées) : la mémoire reste bornée et le coût reste faible', () => {
    const l = createRateLimiter(20, 600_000, Date.now, 1000)
    const t0 = Date.now()
    for (let i = 0; i < 50_000; i++) l.check('ip-' + i)
    expect(l.size()).toBeLessThanOrEqual(1000)
    expect(Date.now() - t0).toBeLessThan(1500)
  })
  it('une IP active n’est pas évincée par du bruit récent tant qu’elle reste dans les plus récentes', () => {
    const l = createRateLimiter(2, 600_000, Date.now, 100)
    l.check('a')
    l.check('a')
    expect(l.check('a').allowed).toBe(false)
    for (let i = 0; i < 50; i++) l.check('x' + i)
    expect(l.check('a').allowed).toBe(false)
  })
})

describe('imageSize / decodeBase64Image', () => {
  it('lit les dimensions déclarées', () => {
    expect(imageSize(jpeg(1280, 720))).toEqual({ width: 1280, height: 720 })
    expect(imageSize(png(30000, 40000))).toEqual({ width: 30000, height: 40000 })
    expect(imageSize(webp())).toEqual({ width: 640, height: 480 })
    expect(imageSize(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0x4a, 0x46]))).toBeUndefined() // tronqué
  })
  it('base64 strict', () => {
    expect(decodeBase64Image(b64(JPEG))?.length).toBe(JPEG.length)
    expect(decodeBase64Image('data:image/jpeg;base64,' + b64(JPEG))?.length).toBe(JPEG.length)
    for (const bad of ['', '***', 'abc def', '<script>', 'data:x,', 'AAAA=AAA', '\u0000AAAA']) expect(decodeBase64Image(bad)).toBeUndefined()
  })
})

describe('isAllowedOrigin', () => {
  const host = 'permajardin.vercel.app'
  it('accepte les appels du même site et ceux sans en-têtes de navigateur', () => {
    expect(isAllowedOrigin({ host })).toBe(true)
    expect(isAllowedOrigin({ host, origin: 'https://permajardin.vercel.app', 'sec-fetch-site': 'same-origin' })).toBe(true)
    expect(isAllowedOrigin({ host, referer: 'https://permajardin.vercel.app/#plantes' })).toBe(true)
  })
  it('refuse cross-site, Origin ou Referer d’un autre hôte, Origin « null »', () => {
    expect(isAllowedOrigin({ host, 'sec-fetch-site': 'cross-site' })).toBe(false)
    expect(isAllowedOrigin({ host, origin: 'https://evil.example' })).toBe(false)
    expect(isAllowedOrigin({ host, referer: 'https://evil.example/page' })).toBe(false)
    expect(isAllowedOrigin({ host, origin: 'null' })).toBe(false)
    expect(isAllowedOrigin({ host, origin: 'https://permajardin.vercel.app.evil.example' })).toBe(false)
  })
  it('autorise localhost en développement (ports différents)', () => {
    expect(isAllowedOrigin({ host: 'localhost:3000', origin: 'http://localhost:5173' })).toBe(true)
    expect(isAllowedOrigin({ host: 'localhost:3000', origin: 'http://127.0.0.1:5173' })).toBe(true)
    expect(isAllowedOrigin({ host: 'permajardin.vercel.app', origin: 'http://localhost:5173' })).toBe(false)
  })
  it('utilise x-forwarded-host quand il est présent', () => {
    expect(isAllowedOrigin({ host: 'interne', 'x-forwarded-host': host, origin: 'https://permajardin.vercel.app' })).toBe(true)
  })
})

describe('hasBrowserOrigin', () => {
  it('exige une marque de navigateur', () => {
    expect(hasBrowserOrigin({ host: 'permajardin.vercel.app' })).toBe(false)
    expect(hasBrowserOrigin({ 'user-agent': 'curl/8' })).toBe(false)
    expect(hasBrowserOrigin({ origin: 'https://permajardin.vercel.app' })).toBe(true)
    expect(hasBrowserOrigin({ referer: 'https://permajardin.vercel.app/' })).toBe(true)
    expect(hasBrowserOrigin({ 'sec-fetch-site': 'same-origin' })).toBe(true)
    expect(hasBrowserOrigin({ 'sec-fetch-site': 'none' })).toBe(false)
  })
})

describe('clientIp', () => {
  it('préfère les en-têtes posés par Vercel, puis la DERNIÈRE valeur de x-forwarded-for (la première est falsifiable)', () => {
    expect(clientIp({ 'x-vercel-forwarded-for': '9.9.9.9', 'x-real-ip': '8.8.8.8', 'x-forwarded-for': '6.6.6.6' })).toBe('9.9.9.9')
    expect(clientIp({ 'x-real-ip': '8.8.8.8', 'x-forwarded-for': '6.6.6.6' })).toBe('8.8.8.8')
    expect(clientIp({ 'x-forwarded-for': '6.6.6.6, 1.2.3.4' })).toBe('1.2.3.4') // « 6.6.6.6 » vient du client
    expect(clientIp({ 'x-forwarded-for': '1.2.3.4' })).toBe('1.2.3.4')
    expect(clientIp({ 'x-real-ip': '5.6.7.8' })).toBe('5.6.7.8')
    expect(clientIp({}, '9.9.9.9')).toBe('9.9.9.9')
    expect(clientIp({})).toBe('inconnue')
  })
})

describe('rateKey : un abonné IPv6 ne contourne pas la limite en changeant d’adresse', () => {
  it('regroupe tout un /64, garde l’IPv4 et normalise IPv4 mappée / crochets / zone', () => {
    const a = rateKey('2001:db8:85a3:1:aaaa:bbbb:cccc:dddd')
    expect(a).toBe('2001:db8:85a3:1::/64')
    expect(rateKey('2001:0db8:85a3:0001:0000:0000:0000:0001')).toBe(a)
    expect(rateKey('2001:db8:85a3:1::1')).toBe(a)
    expect(rateKey('[2001:DB8:85A3:1::ffff]')).toBe(a)
    expect(rateKey('2001:db8:85a3:2::1')).not.toBe(a) // autre /64
    expect(rateKey('fe80::1%eth0')).toBe('fe80:0:0:0::/64')
    expect(rateKey('::ffff:203.0.113.7')).toBe('203.0.113.7')
    expect(rateKey('203.0.113.7')).toBe('203.0.113.7')
    expect(rateKey('inconnue')).toBe('inconnue')
    expect(rateKey('n:importe:quoi:::')).toBe('n:importe:quoi:::') // illisible : tel quel
  })
  it('le limiteur voit une seule clé pour 1 000 adresses d’un même /64', () => {
    const lim = createRateLimiter(3, 60_000)
    let refused = 0
    for (let i = 0; i < 1000; i++) if (!lim.check(rateKey(`2001:db8:1:2:${i.toString(16)}::${i.toString(16)}`)).allowed) refused++
    expect(refused).toBe(997)
    expect(lim.size()).toBe(1)
  })
})

describe('scrubError', () => {
  it('masque la clé et les URL, y compris dans la cause', () => {
    const url = 'https://my-api.plantnet.org/v2/identify/all?api-key=SECRET123&lang=fr'
    const e = new Error(`fetch failed ${url}`, { cause: new Error(`connect ECONNREFUSED ${url}`) })
    const out = scrubError(e, 'SECRET123')
    expect(out).not.toContain('SECRET123')
    expect(out).not.toContain('plantnet.org')
    expect(out).toContain('[url]')
  })
  it('masque la clé hors URL et sa forme encodée', () => {
    expect(scrubError(new Error('mauvaise clé a b+c'), 'a b+c')).not.toContain('a b+c')
    expect(scrubError(new Error('x a%20b%2Bc y'), 'a b+c')).not.toContain('a%20b%2Bc')
    expect(scrubError('chaîne api-key=zzz&x=1')).toBe('chaîne api-key=***&x=1')
  })
})

describe('interpretPlantnet', () => {
  const ok = JSON.stringify({ results: [{ score: 0.9, species: { scientificNameWithoutAuthor: 'Malus domestica', commonNames: ['Pommier'], family: { scientificNameWithoutAuthor: 'Rosaceae' } } }] })
  it('met en forme un résultat valide', () => {
    expect(interpretPlantnet(200, ok)).toEqual({ status: 200, body: { results: [{ score: 0.9, latin: 'Malus domestica', commonNames: ['Pommier'], family: 'Rosaceae' }] } })
  })
  it('404 sans JSON = aucun résultat', () => {
    expect(interpretPlantnet(404, '<html>Not found</html>')).toEqual({ status: 200, body: { results: [] } })
  })
  it('429 sans JSON = quota', () => {
    const r = interpretPlantnet(429, 'Too Many Requests')
    expect(r.status).toBe(429)
    expect(JSON.stringify(r.body)).toMatch(/Quota/)
  })
  it('5xx sans JSON = 502 avec statut', () => {
    const r = interpretPlantnet(503, '<html>')
    expect(r.status).toBe(502)
    expect(JSON.stringify(r.body)).toMatch(/503/)
  })
  it('clé refusée = message générique sans détail', () => {
    expect(interpretPlantnet(401, '{"message":"Invalid api-key SECRET"}').body).toEqual({ error: expect.stringMatching(/mal configuré/) })
  })
  it('200 non JSON = 502 illisible', () => {
    const r = interpretPlantnet(200, 'oups')
    expect(r.status).toBe(502)
    expect(JSON.stringify(r.body)).toMatch(/illisible/)
  })
  it('results absent ou mal formé = liste vide, sans plantage', () => {
    expect(interpretPlantnet(200, '{}').body).toEqual({ results: [] })
    expect(interpretPlantnet(200, '{"results":"x"}').body).toEqual({ results: [] })
    expect(interpretPlantnet(200, '{"results":[null,{"score":1},{"score":"a","species":{"scientificNameWithoutAuthor":"X y"}}]}').body).toEqual({ results: [] })
  })
})

// ---------- Handler ----------

function call(opts: { method?: string; headers?: Record<string, string>; body?: unknown; bodyThrows?: boolean } = {}) {
  const headers: Record<string, string> = { host: 'permajardin.vercel.app', origin: 'https://permajardin.vercel.app', 'content-type': 'application/json', 'x-vercel-forwarded-for': `10.0.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`, ...opts.headers }
  const req = { method: opts.method ?? 'POST', headers, socket: { remoteAddress: '127.0.0.1' } } as Record<string, unknown>
  if (opts.bodyThrows) Object.defineProperty(req, 'body', { get: () => { throw new Error('Invalid JSON') } })
  else req.body = opts.body
  const out: { status?: number; json?: Record<string, unknown>; headers: Record<string, string> } = { headers: {} }
  const res = {
    setHeader: (k: string, v: string) => void (out.headers[k.toLowerCase()] = v),
    status: (s: number) => {
      out.status = s
      return res
    },
    json: (j: Record<string, unknown>) => {
      out.json = j
      return res
    },
  } as unknown as VercelResponse
  return handler(req as unknown as VercelRequest, res).then(() => out)
}

describe('handler', () => {
  beforeEach(() => {
    vi.stubEnv('PLANTNET_API_KEY', 'SECRET123')
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('refuse autre chose que POST, avec Cache-Control: no-store', async () => {
    const r = await call({ method: 'GET' })
    expect(r.status).toBe(405)
    expect(r.headers['cache-control']).toBe('no-store')
  })

  it('403 pour un appel cross-site', async () => {
    expect((await call({ headers: { 'sec-fetch-site': 'cross-site' }, body: { images: [b64(JPEG)] } })).status).toBe(403)
    expect((await call({ headers: { origin: 'https://evil.example' }, body: { images: [b64(JPEG)] } })).status).toBe(403)
  })

  it('403 pour un appel sans Origin, Referer ni Sec-Fetch-Site (curl, script)', async () => {
    expect((await call({ headers: { origin: '' }, body: { images: [b64(JPEG)] } })).status).toBe(403)
  })

  it('une photo invalide ne consomme pas le plafond global', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"results":[]}', { status: 200 })))
    for (let i = 0; i < 200; i++) await call({ body: { images: [Buffer.from('pas une image').toString('base64')] } })
    expect((await call({ body: { images: [b64(JPEG)] } })).status).toBe(200)
  })

  it('503 sans clé', async () => {
    vi.stubEnv('PLANTNET_API_KEY', '')
    expect((await call({ body: { images: [b64(JPEG)] } })).status).toBe(503)
  })

  it('400 pour un format non image', async () => {
    const r = await call({ body: { images: [Buffer.from('pas une image').toString('base64')] } })
    expect(r.status).toBe(400)
    expect(String(r.json?.error)).toMatch(/Format/)
  })

  it('400 pour un nombre de photos ou un organe invalide', async () => {
    expect((await call({ body: { images: [] } })).status).toBe(400)
    expect((await call({ body: {} })).status).toBe(400)
    expect((await call({ body: { images: [b64(JPEG)], organ: 'racine' } })).status).toBe(400)
    expect((await call({ body: { images: Array(6).fill(b64(JPEG)) } })).status).toBe(400)
  })

  it('413 JSON clair quand le corps dépasse 4,2 Mo', async () => {
    const big = 'A'.repeat(MAX_BODY_BYTES + 1)
    const r = await call({ body: { images: [big] } })
    expect(r.status).toBe(413)
    expect(String(r.json?.error)).toMatch(/trop lourdes/)
    const r2 = await call({ headers: { 'content-length': String(MAX_BODY_BYTES + 10) }, body: { images: [b64(JPEG)] } })
    expect(r2.status).toBe(413)
  })

  it('relaie à Pl@ntNet avec le bon type MIME et sans fuite de la clé', async () => {
    const fetchMock = vi.fn(async (_u: string, init: { body: FormData }) => {
      const file = init.body.get('images') as File
      expect(file.type).toBe('image/png')
      return new Response(JSON.stringify({ results: [{ score: 0.5, species: { scientificNameWithoutAuthor: 'Malus domestica' } }] }), { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)
    const r = await call({ body: { images: [b64(PNG)], organ: 'leaf' } })
    expect(r.status).toBe(200)
    expect(r.json).toEqual({ results: [{ score: 0.5, latin: 'Malus domestica', commonNames: [] }] })
    expect(JSON.stringify(r.json)).not.toContain('SECRET123')
  })

  it('une panne réseau ne divulgue ni la clé ni l’URL, ni dans la réponse ni dans les logs', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('fetch failed', { cause: new Error('connect ETIMEDOUT https://my-api.plantnet.org/v2/identify/all?api-key=SECRET123') })
    }))
    const r = await call({ body: { images: [b64(JPEG)] } })
    expect(r.status).toBe(502)
    expect(JSON.stringify(r.json)).not.toMatch(/SECRET123|plantnet\.org|api-key/)
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toMatch(/SECRET123|my-api\.plantnet\.org/)
  })

  it('transmet les erreurs Pl@ntNet non JSON proprement', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>Bad gateway</html>', { status: 502 })))
    const r = await call({ body: { images: [b64(JPEG)] } })
    expect(r.status).toBe(502)
    expect(String(r.json?.error)).toMatch(/502/)
    vi.stubGlobal('fetch', vi.fn(async () => new Response('slow down', { status: 429 })))
    expect((await call({ body: { images: [b64(JPEG)] } })).status).toBe(429)
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 404 })))
    const r404 = await call({ body: { images: [b64(JPEG)] } })
    expect(r404.status).toBe(200)
    expect(r404.json).toEqual({ results: [] })
  })

  it('limite le débit par IP (429 avec Retry-After)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"results":[]}', { status: 200 })))
    const headers = { 'x-vercel-forwarded-for': '203.0.113.7' }
    let last: Awaited<ReturnType<typeof call>> | undefined
    for (let i = 0; i < 21; i++) last = await call({ headers, body: { images: [b64(JPEG)] } })
    expect(last?.status).toBe(429)
    expect(String(last?.json?.error)).toMatch(/Trop de demandes/)
    expect(Number(last?.headers['retry-after'])).toBeGreaterThan(0)
    expect((await call({ headers: { 'x-vercel-forwarded-for': '203.0.113.8' }, body: { images: [b64(JPEG)] } })).status).toBe(200)
  })

  it('Allow: POST sur 405, et en-têtes de sécurité sur toutes les réponses', async () => {
    const r = await call({ method: 'OPTIONS' })
    expect(r.status).toBe(405)
    expect(r.headers.allow).toBe('POST')
    for (const res of [r, await call({ body: {} }), await call({ headers: { origin: 'https://evil.example' } })]) {
      expect(res.headers['cache-control']).toBe('no-store')
      expect(res.headers['x-content-type-options']).toBe('nosniff')
      expect(res.headers['cross-origin-resource-policy']).toBe('same-origin')
      expect(res.headers['content-security-policy']).toMatch(/default-src 'none'/)
      expect(res.headers['referrer-policy']).toBe('no-referrer')
      expect(res.headers['access-control-allow-origin']).toBeUndefined() // pas de CORS : réponse illisible depuis un autre site
    }
  })

  it('415 si le type de contenu n’est pas application/json (requête « simple » inter-sites)', async () => {
    for (const ct of ['text/plain', 'application/x-www-form-urlencoded', 'multipart/form-data; boundary=x', '']) {
      expect((await call({ headers: { 'content-type': ct }, body: { images: [b64(JPEG)] } })).status).toBe(415)
    }
    expect((await call({ headers: { 'content-type': 'application/json; charset=utf-8' }, body: {} })).status).toBe(400)
  })

  it('400 JSON (pas d’exception) quand le corps JSON est invalide', async () => {
    const lazy = await call({ bodyThrows: true })
    expect(lazy.status).toBe(400)
    expect(lazy.json).toEqual({ error: 'Requête illisible.' })
    expect((await call({ body: '{pas du json' })).status).toBe(400)
    expect((await call({ body: 'null' })).status).toBe(400)
    expect((await call({ body: [1, 2] })).status).toBe(400)
    expect((await call({ body: 42 })).status).toBe(400)
  })

  it('refuse les images qui ne sont pas du base64 strict, ou dont l’en-tête est tronqué', async () => {
    expect((await call({ body: { images: ['<script>alert(1)</script>'] } })).status).toBe(400)
    expect((await call({ body: { images: [b64(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0x4a, 0x46]))] } })).status).toBe(400)
    expect((await call({ body: { images: [{}] } })).status).toBe(400)
    expect((await call({ body: { images: [123] } })).status).toBe(400)
  })

  it('refuse une « bombe de décompression » : petit fichier qui annonce 30 000 × 30 000 pixels', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    for (const img of [png(30000, 30000), jpeg(20000, 20000), png(8000, 8000)]) {
      const r = await call({ body: { images: [b64(img)] } })
      expect(r.status).toBe(400)
      expect(String(r.json?.error)).toMatch(/trop grande en dimensions/)
    }
    expect((await call({ body: { images: [b64(png(0, 10))] } })).status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('accepte une photo normale (1280 × 960) et un WebP', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"results":[]}', { status: 200 })))
    expect((await call({ body: { images: [b64(jpeg(1280, 960)), b64(WEBP)] } })).status).toBe(200)
  })

  it('une IP falsifiée dans x-forwarded-for ne contourne pas la limite quand Vercel fournit l’IP réelle', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"results":[]}', { status: 200 })))
    let last: Awaited<ReturnType<typeof call>> | undefined
    for (let i = 0; i < 21; i++) last = await call({ headers: { 'x-vercel-forwarded-for': '198.51.100.9', 'x-forwarded-for': `${i}.${i}.${i}.${i}, 198.51.100.9` }, body: { images: [b64(JPEG)] } })
    expect(last?.status).toBe(429)
  })

  it('n’appelle pas Pl@ntNet en suivant une redirection (la clé est dans l’URL)', async () => {
    const fetchMock = vi.fn(async (_u: string, init: { redirect?: string }) => {
      expect(init.redirect).toBe('error')
      return new Response('{"results":[]}', { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)
    expect((await call({ body: { images: [b64(JPEG)] } })).status).toBe(200)
  })

  it('réponse Pl@ntNet démesurée : 502 propre', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('x'.repeat(1_200_000), { status: 200 })))
    expect((await call({ body: { images: [b64(JPEG)] } })).status).toBe(502)
  })

  it('erreur inattendue : 500 générique, sans clé ni trace, journal nettoyé', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })))
    const form = FormData.prototype.append
    vi.spyOn(FormData.prototype, 'append').mockImplementation(() => {
      throw new TypeError('boom https://my-api.plantnet.org/?api-key=SECRET123')
    })
    const r = await call({ body: { images: [b64(JPEG)] } })
    FormData.prototype.append = form
    expect(r.status).toBe(500)
    expect(JSON.stringify(r.json)).not.toMatch(/SECRET123|plantnet|boom/)
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toMatch(/SECRET123|my-api\.plantnet\.org/)
  })

  it('aucune image ni IP dans les journaux en cas d’échec Pl@ntNet', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('réseau') }))
    await call({ headers: { 'x-vercel-forwarded-for': '203.0.113.200' }, body: { images: [b64(JPEG)] } })
    const logged = JSON.stringify(vi.mocked(console.error).mock.calls)
    expect(logged).not.toContain('203.0.113.200')
    expect(logged).not.toContain(b64(JPEG))
  })

  it('503 sans clé n’est renvoyé qu’après les contrôles d’origine, de débit et de type', async () => {
    vi.stubEnv('PLANTNET_API_KEY', '')
    expect((await call({ headers: { origin: 'https://evil.example' } })).status).toBe(403)
    expect((await call({ headers: { 'content-type': 'text/plain' } })).status).toBe(415)
    expect((await call({ body: { images: [b64(JPEG)] } })).status).toBe(503)
  })
})

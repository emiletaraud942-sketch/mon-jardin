import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

interface Rewrite { source: string; destination: string }
interface HeaderRule { source: string; headers: { key: string; value: string }[] }
const root = join(__dirname, '..', '..', '..')
const cfg = JSON.parse(readFileSync(join(root, 'vercel.json'), 'utf8')) as { rewrites: Rewrite[]; headers: HeaderRule[] }
const proxies = cfg.rewrites.filter((r) => r.source.startsWith('/ext/'))
const globalHeaders = Object.fromEntries(cfg.headers.find((h) => h.source === '/(.*)')!.headers.map((h) => [h.key, h.value]))

/** Un chemin est servi par un proxy si un rewrite le désigne EXACTEMENT (la barre finale est tolérée, comme sur Vercel). */
const proxied = (path: string) => proxies.find((r) => r.source === path || r.source + '/' === path)

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f)
    if (statSync(p).isDirectory()) sourceFiles(p, out)
    else if (/\.(ts|tsx)$/.test(f) && !/\.test\./.test(f)) out.push(p)
  }
  return out
}

describe('rewrites /ext/* : chemins exacts', () => {
  it('aucun rewrite ne contient de paramètre ni de joker (pas de :path*, pas de regex)', () => {
    for (const r of proxies) {
      expect(r.source, r.source).toMatch(/^\/ext\/[A-Za-z0-9_./-]+$/)
      expect(r.destination, r.destination).toMatch(/^https:\/\/[a-z0-9.-]+\/[A-Za-z0-9_./-]+$/)
    }
  })

  it('chaque destination est l’un des 4 hôtes autorisés', () => {
    const hosts = new Set(proxies.map((r) => new URL(r.destination).host))
    expect([...hosts].sort()).toEqual(['api.open-meteo.com', 'apicarto.ign.fr', 'archive-api.open-meteo.com', 'data.geopf.fr'])
  })

  it('chaque appel /ext/ du code source est couvert par un rewrite', () => {
    const calls = new Set<string>()
    for (const f of sourceFiles(join(root, 'src'))) {
      for (const m of readFileSync(f, 'utf8').matchAll(/['"`](\/ext\/[A-Za-z0-9_./-]+)/g)) calls.add(m[1])
    }
    expect(calls.size).toBeGreaterThanOrEqual(6)
    for (const c of calls) expect(proxied(c), `pas de rewrite pour ${c}`).toBeDefined()
  })

  it('aucun rewrite inutile : chacun correspond à un appel du code source', () => {
    const all = sourceFiles(join(root, 'src')).map((f) => readFileSync(f, 'utf8')).join('\n')
    for (const r of proxies) expect(all, `rewrite inutilisé ${r.source}`).toContain(r.source)
  })

  it('les chemins d’évasion ne correspondent à aucun rewrite', () => {
    const attacks = [
      '/ext/geopf/../apicarto/api/cadastre/parcelle',
      '/ext/geopf/wmts/../../x',
      '/ext/geopf/wmts/extra',
      '/ext/geopf/wmtsx',
      '/ext/geopf//evil.example/wmts',
      '/ext/geopf@evil.example/wmts',
      '/ext/geopf/wmts%2f..%2f..%2fadmin',
      '/ext/geopf/%2e%2e/x',
      '/ext/geopf/',
      '/ext/geopf',
      '/ext/meteo/v1/forecast/../../v1/archive',
      '/ext/meteo//v1/forecast',
      '/ext/apicarto/api/cadastre/parcelle/../../module',
      '/ext/apicarto/api/cadastre',
      '/ext/evil/x',
      '/ext/',
    ]
    for (const a of attacks) expect(proxied(a), a).toBeUndefined()
  })

  it('le repli SPA exclut /api et /ext (un chemin /ext inconnu donne 404, pas index.html)', () => {
    const spa = cfg.rewrites.find((r) => r.destination === '/index.html')!
    const re = new RegExp('^' + spa.source + '$')
    expect(re.test('/ext/geopf/inconnu')).toBe(false)
    expect(re.test('/api/identify')).toBe(false)
    expect(re.test('/plantes')).toBe(true)
  })
})

describe('en-têtes de sécurité', () => {
  const csp = Object.fromEntries(globalHeaders['Content-Security-Policy'].split(';').map((d) => d.trim().split(/\s+/)).map(([k, ...v]) => [k, v]))

  it('en-têtes de base présents', () => {
    expect(globalHeaders['X-Content-Type-Options']).toBe('nosniff')
    expect(globalHeaders['X-Frame-Options']).toBe('DENY')
    expect(globalHeaders['Referrer-Policy']).toBe('strict-origin-when-cross-origin')
    expect(globalHeaders['Strict-Transport-Security']).toMatch(/max-age=63072000; includeSubDomains/)
    expect(globalHeaders['Cross-Origin-Opener-Policy']).toBe('same-origin')
    expect(globalHeaders['Cross-Origin-Resource-Policy']).toBe('same-origin')
    expect(globalHeaders['X-DNS-Prefetch-Control']).toBe('off')
  })

  it('CSP : rien d’externe hors Supabase, pas d’unsafe-eval ni de script inline', () => {
    expect(csp['default-src']).toEqual(["'self'"])
    // 'wasm-unsafe-eval' : permet de compiler du WebAssembly (lecture de l'étiquette, module Tesseract) ; PAS de 'unsafe-eval' (aucun eval JavaScript).
    expect(csp['script-src']).toEqual(["'self'", "'wasm-unsafe-eval'"])
    expect(csp['object-src']).toEqual(["'none'"])
    expect(csp['frame-ancestors']).toEqual(["'none'"])
    expect(csp['frame-src']).toEqual(["'none'"])
    expect(csp['base-uri']).toEqual(["'self'"])
    expect(csp['form-action']).toEqual(["'self'"])
    // Pas de Realtime (WebSocket) : seul HTTPS vers Supabase est autorisé.
    expect(csp['connect-src']).toEqual(["'self'", 'https://*.supabase.co'])
    expect(csp['upgrade-insecure-requests']).toEqual([])
    expect(globalHeaders['Content-Security-Policy']).not.toMatch(/(?<!wasm-)unsafe-eval|http:|\*\s|;\s*\*/) // « wasm-unsafe-eval » seul est permis
  })

  it('Permissions-Policy minimale : seuls caméra, géolocalisation, capteurs de mouvement (boussole) et écran allumé (prise de photos) sont autorisés, pour notre origine', () => {
    const pp = Object.fromEntries(globalHeaders['Permissions-Policy'].split(',').map((x) => x.trim().split('=')))
    expect(pp.camera).toBe('(self)')
    expect(pp.geolocation).toBe('(self)')
    for (const f of ['gyroscope', 'accelerometer', 'magnetometer', 'screen-wake-lock']) expect(pp[f], f).toBe('(self)')
    for (const f of ['microphone', 'payment', 'usb', 'serial', 'hid', 'midi', 'display-capture']) expect(pp[f], f).toBe('()')
    for (const [k, v] of Object.entries(pp)) if (v !== '()') expect(['camera', 'geolocation', 'gyroscope', 'accelerometer', 'magnetometer', 'screen-wake-lock'], k).toContain(k)
  })
})

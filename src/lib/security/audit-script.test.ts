import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const root = join(__dirname, '..', '..', '..')
const mod = (await import(pathToFileURL(join(root, '.github', 'scripts', 'audit-prod.mjs')).href)) as {
  evaluateAudit: (r: unknown, e: unknown, level?: string, now?: Date) => { blocking: { id: string; pkg: string }[]; excepted: { id: string }[]; expired: string[]; errors: string[] }
  advisoriesOf: (r: unknown) => { id: string; pkg: string; severity: string }[]
}
const sec = (await import(pathToFileURL(join(root, '.github', 'scripts', 'scan-secrets.mjs')).href)) as {
  scanText: (t: string, where: string, allow?: string[]) => { id: string }[]
}
const exceptions = JSON.parse(readFileSync(join(root, '.github', 'audit-exceptions.json'), 'utf8')) as { id: string; package: string; reason: string; expires: string }[]

const vuln = (pkg: string, id: string, severity: string) => ({ [pkg]: { name: pkg, severity, via: [{ source: 1, name: pkg, title: 't', url: `https://github.com/advisories/${id}`, severity, range: '<1' }] } })
const report = (...v: object[]) => ({ vulnerabilities: Object.assign({}, ...v) })
const EXC = [{ id: 'GHSA-aaaa-bbbb-cccc', package: 'maplibre-gl', reason: 'Non exploitable : fonction absente de la version installée.', expires: '2027-02-01' }]
const NOW = new Date('2026-11-03')

describe('audit des dépendances de production (CI bloquante)', () => {
  it('un avis critique sans exception bloque', () => {
    const r = mod.evaluateAudit(report(vuln('foo', 'GHSA-xxxx-yyyy-zzzz', 'critical')), EXC, 'critical', NOW)
    expect(r.blocking.map((a) => a.id)).toEqual(['GHSA-xxxx-yyyy-zzzz'])
  })

  it('un avis sous le seuil ne bloque pas ; au seuil « high », un avis high bloque', () => {
    const high = report(vuln('foo', 'GHSA-xxxx-yyyy-zzzz', 'high'))
    expect(mod.evaluateAudit(high, EXC, 'critical', NOW).blocking).toEqual([])
    expect(mod.evaluateAudit(high, EXC, 'high', NOW).blocking).toHaveLength(1)
  })

  it('l’exception documentée tolère SON avis pour SON paquet, et rien d’autre', () => {
    const ok = mod.evaluateAudit(report(vuln('maplibre-gl', 'GHSA-aaaa-bbbb-cccc', 'critical')), EXC, 'critical', NOW)
    expect(ok.blocking).toEqual([])
    expect(ok.excepted.map((a) => a.id)).toEqual(['GHSA-aaaa-bbbb-cccc'])
    // même avis sur un autre paquet, ou autre avis sur le même paquet : bloquant
    expect(mod.evaluateAudit(report(vuln('autre', 'GHSA-aaaa-bbbb-cccc', 'critical')), EXC, 'critical', NOW).blocking).toHaveLength(1)
    expect(mod.evaluateAudit(report(vuln('maplibre-gl', 'GHSA-nouv-eaua-vis0', 'critical')), EXC, 'critical', NOW).blocking).toHaveLength(1)
  })

  it('une exception échue ne protège plus', () => {
    const r = mod.evaluateAudit(report(vuln('maplibre-gl', 'GHSA-aaaa-bbbb-cccc', 'critical')), EXC, 'critical', new Date('2027-03-01'))
    expect(r.expired).toEqual(['GHSA-aaaa-bbbb-cccc'])
    expect(r.blocking).toHaveLength(1)
  })

  it('une exception sans raison, sans échéance ou sans id GHSA est une erreur de configuration', () => {
    for (const bad of [
      { id: 'GHSA-aaaa-bbbb-cccc', package: 'maplibre-gl', reason: 'court', expires: '2027-02-01' },
      { id: 'GHSA-aaaa-bbbb-cccc', package: 'maplibre-gl', reason: 'Une raison suffisamment longue.', expires: 'bientôt' },
      { id: 'CVE-2026-1', package: 'maplibre-gl', reason: 'Une raison suffisamment longue.', expires: '2027-02-01' },
    ]) {
      const r = mod.evaluateAudit(report(), [bad], 'critical', NOW)
      expect(r.errors, JSON.stringify(bad)).toHaveLength(1)
    }
  })

  it('les avis transitifs (via = nom de paquet) ne sont pas comptés deux fois', () => {
    const r = report(vuln('lib', 'GHSA-xxxx-yyyy-zzzz', 'critical'), { app: { name: 'app', severity: 'critical', via: ['lib'] } })
    expect(mod.advisoriesOf(r)).toHaveLength(1)
  })

  it('le fichier d’exceptions du dépôt est valide, limité à maplibre-gl, et pas échu', () => {
    expect(exceptions.map((e) => e.id)).toEqual(['GHSA-jrc7-96c5-q579'])
    const r = mod.evaluateAudit(report(vuln('maplibre-gl', 'GHSA-jrc7-96c5-q579', 'critical')), exceptions, 'critical')
    expect(r.errors).toEqual([])
    expect(r.expired, 'exception échue : réexaminer la montée de maplibre-gl').toEqual([])
    expect(r.blocking).toEqual([])
  })
})

describe('détection de secrets (CI)', () => {
  // Faux secrets fabriqués à l'exécution (le fichier de test lui-même ne contient aucun motif complet).
  const fake = {
    pem: '-----BEGIN ' + 'PRIVATE KEY-----',
    jwt: ['eyJ' + 'hbGciOiJIUzI1NiJ9', 'eyJ' + 'zdWIiOiIxMjM0NTY3ODkwIn0', 'abcdefghij1234567890'].join('.'),
    sk: 'sk-' + 'a1b2c3d4e5f6g7h8i9j0k1l2m3',
    gh: 'ghp_' + 'A'.repeat(36),
    url: 'https://' + 'abcdefghijklmnopqrst' + '.supabase.co',
    plantnet: 'api-key=' + '2b10abcdefghijkl',
    env: 'PLANTNET_API_KEY=' + 'abcdef1234567890abcd',
  }

  it('détecte chaque famille de secret', () => {
    const ids = (t: string) => sec.scanText(t, 'x').map((h) => h.id)
    expect(ids(fake.pem)).toContain('cle-privee')
    expect(ids(`token: ${fake.jwt}`)).toContain('jeton-jwt')
    expect(ids(`const k = '${fake.sk}'`)).toContain('cle-sk')
    expect(ids(fake.gh)).toContain('github')
    expect(ids(`fetch("${fake.url}/rest")`)).toContain('supabase-url-reelle')
    expect(ids(`?${fake.plantnet}`)).toContain('plantnet-url')
    expect(ids(fake.env)).toContain('variable-secrete')
  })

  it('ne signale pas le code ordinaire ni les variables vides ou factices du modèle', () => {
    for (const ok of ['const x = 1', 'VITE_SUPABASE_URL=', 'PLANTNET_API_KEY=', 'https://monprojet.supabase.co (exemple)', "const k = 'sk-court'", 'process.env.PLANTNET_API_KEY']) {
      expect(sec.scanText(ok, 'x'), ok).toEqual([])
    }
  })

  it('une ligne explicitement autorisée est tolérée, pas la suivante', () => {
    expect(sec.scanText(fake.env, 'x', [fake.env])).toEqual([])
    expect(sec.scanText(fake.env + '\n' + fake.pem, 'x', [fake.env]).map((h) => h.id)).toEqual(['cle-privee'])
  })
})

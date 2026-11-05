import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const root = join(__dirname, '..', '..', '..')
const sec = (await import(pathToFileURL(join(root, '.github', 'scripts', 'scan-secrets.mjs')).href)) as {
  scanText: (t: string, where: string, allow?: string[]) => { id: string }[]
}

describe('audit des dépendances de production (scripts/audit-prod.mjs, CI bloquante)', () => {
  // Le script s'exécute à l'import (npm audit) : on contrôle sa configuration par son texte.
  const src = readFileSync(join(root, 'scripts', 'audit-prod.mjs'), 'utf8')

  it('bloque sur high et critical, seulement pour la production, et échoue par prudence sans réponse lisible', () => {
    expect(src).toMatch(/--omit=dev/)
    expect(src).toMatch(/'high'/)
    expect(src).toMatch(/'critical'/)
    expect(src).toMatch(/process\.exit\(1\)/)
    expect(src).toMatch(/process\.exit\(2\)/)
  })

  it('aucune exception acceptée aujourd’hui (MapLibre 6 : audit à 0 alerte) ; toute entrée future porte sa raison', () => {
    const m = /const ACCEPTED = (\{[\s\S]*?\n?\})\s*\n/.exec(src)
    expect(m, 'ACCEPTED introuvable').toBeTruthy()
    expect(m![1].replace(/\s+/g, '')).toBe('{}')
  })

  it('les exceptions de la branche d’origine (maplibre-gl 4.7.1) ne sont pas reportées', () => {
    expect(src).not.toMatch(/GHSA-jrc7-96c5-q579/)
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

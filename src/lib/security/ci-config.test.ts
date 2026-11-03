import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = join(__dirname, '..', '..', '..')
const ci = readFileSync(join(root, '.github', 'workflows', 'ci.yml'), 'utf8')
/** Corps d'un job (du nom du job au job suivant, au niveau d'indentation 2). */
const job = (name: string) => {
  const m = new RegExp(`^  ${name}:\\n([\\s\\S]*?)(?=^  [a-z]+:\\n|(?![\\s\\S]))`, 'm').exec(ci)
  if (!m) throw new Error(`job ${name} introuvable`)
  return m[1]
}
const code = (s: string) => s.split('\n').filter((l) => !l.trim().startsWith('#')).join('\n')

describe('CI GitHub Actions', () => {
  it('jamais de pull_request_target, de secret ni d’écriture globale', () => {
    const c = code(ci)
    expect(c).not.toMatch(/pull_request_target/)
    expect(c).not.toMatch(/\$\{\{\s*secrets\./)
    expect(c).toMatch(/^permissions:\n  contents: read\n/m)
  })

  it('l’audit des dépendances de production est bloquant et passe par la liste d’exceptions documentée', () => {
    const a = code(job('audit'))
    expect(a).not.toMatch(/continue-on-error/)
    expect(a).toMatch(/node \.github\/scripts\/audit-prod\.mjs --level=critical/)
    expect(a).toMatch(/npm ci --ignore-scripts/)
  })

  it('détection de secrets sur tout l’historique, sans service externe', () => {
    const s = code(job('secrets'))
    expect(s).toMatch(/fetch-depth: 0/)
    expect(s).toMatch(/scan-secrets\.mjs --history/)
    expect(s).not.toMatch(/continue-on-error/)
  })

  it('CodeQL JavaScript/TypeScript, avec le seul droit d’écriture nécessaire, limité à ce job', () => {
    const q = code(job('codeql'))
    expect(q).toMatch(/languages: javascript-typescript/)
    expect(q).toMatch(/security-events: write/)
    expect(code(ci).match(/security-events: write/g)).toHaveLength(1)
  })

  it('banc SQL : Postgres éphémère sans mot de passe en clair, jamais de base distante', () => {
    const q = code(job('sql'))
    expect(q).toMatch(/image: postgres:16/)
    expect(q).toMatch(/PGHOST: localhost/)
    expect(q).toMatch(/supabase\/neighbors\/tests\/run\.sh/)
    expect(q).not.toMatch(/PASSWORD|supabase\.co/i)
  })

  it('les étapes de checkout ne gardent pas les identifiants', () => {
    const n = (ci.match(/actions\/checkout@v4/g) ?? []).length
    expect((ci.match(/persist-credentials: false/g) ?? []).length).toBe(n)
  })

  it('le commentaire d’audit ne prétend plus que le contrôle d’attribution est désactivé', () => {
    expect(ci).not.toMatch(/désactive le contrôle d'attribution/)
    expect(ci).toMatch(/GHSA-jrc7-96c5-q579/)
  })
})

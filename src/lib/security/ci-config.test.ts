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
  it('les cinq jobs existent', () => {
    for (const n of ['verifier', 'audit', 'secrets', 'sql', 'codeql']) expect(() => job(n)).not.toThrow()
  })

  it('jamais de pull_request_target, de secret ni d’écriture globale', () => {
    const c = code(ci)
    expect(c).not.toMatch(/pull_request_target/)
    expect(c).not.toMatch(/\$\{\{\s*secrets\./)
    expect(c).toMatch(/^permissions:\n  contents: read\n/m)
  })

  it('actions référencées par version majeure (v7 pour checkout et setup-node, v4 pour CodeQL)', () => {
    const uses = [...ci.matchAll(/uses:\s*(\S+)/g)].map((m) => m[1])
    expect(uses.length).toBeGreaterThanOrEqual(9)
    for (const u of uses) expect(u, u).toMatch(/@v\d+$/)
    for (const u of uses.filter((x) => /^actions\/(checkout|setup-node)@/.test(x))) expect(u).toMatch(/@v7$/)
    for (const u of uses.filter((x) => x.startsWith('github/codeql-action/'))) expect(u).toMatch(/@v4$/)
  })

  it('l’audit des dépendances de production est bloquant', () => {
    const a = code(job('audit'))
    expect(a).not.toMatch(/continue-on-error/)
    expect(a).toMatch(/node scripts\/audit-prod\.mjs/)
    expect(a).toMatch(/npm ci --ignore-scripts/)
  })

  it('détection de secrets sur tout l’historique, sans service externe, bloquante', () => {
    const s = code(job('secrets'))
    expect(s).toMatch(/fetch-depth: 0/)
    expect(s).toMatch(/scan-secrets\.mjs --history/)
    expect(s).not.toMatch(/continue-on-error/)
  })

  it('CodeQL JavaScript/TypeScript : non bloquant (documenté), seul droit d’écriture nécessaire, limité à ce job', () => {
    const raw = job('codeql')
    const q = code(raw)
    expect(q).toMatch(/languages: javascript-typescript/)
    expect(q).toMatch(/security-events: write/)
    expect(code(ci).match(/security-events: write/g)).toHaveLength(1)
    expect(q).toMatch(/continue-on-error: true/)
    // La raison du « non bloquant » est écrite à côté.
    expect(raw).toMatch(/#[^\n]*continue-on-error[^\n]*NON bloquant|#[^\n]*NON bloquant[^\n]*/)
  })

  it('banc SQL : Postgres éphémère sans mot de passe en clair, jamais de base distante', () => {
    const q = code(job('sql'))
    expect(q).toMatch(/image: postgres:16/)
    expect(q).toMatch(/PGHOST: localhost/)
    expect(q).toMatch(/supabase\/neighbors\/tests\/run\.sh/)
    expect(q).not.toMatch(/PASSWORD|supabase\.co/i)
  })

  it('les étapes de checkout ne gardent pas les identifiants', () => {
    const n = (ci.match(/actions\/checkout@v\d+/g) ?? []).length
    expect(n).toBeGreaterThanOrEqual(5)
    expect((ci.match(/persist-credentials: false/g) ?? []).length).toBe(n)
  })

  it('les fichiers appelés par la CI existent', () => {
    for (const f of ['scripts/audit-prod.mjs', '.github/scripts/scan-secrets.mjs', '.github/secrets-allow.json', 'supabase/neighbors/tests/run.sh']) {
      expect(() => readFileSync(join(root, f), 'utf8'), f).not.toThrow()
    }
  })
})

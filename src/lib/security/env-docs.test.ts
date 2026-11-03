import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const root = join(__dirname, '..', '..', '..')
const example = readFileSync(join(root, '.env.example'), 'utf8')
const readme = readFileSync(join(root, 'README.md'), 'utf8')

function files(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    if (f === 'node_modules' || f === '_tests') continue
    const p = join(dir, f)
    if (statSync(p).isDirectory()) files(p, out)
    else if (/\.(ts|tsx|mjs)$/.test(f) && !/\.test\./.test(f)) out.push(p)
  }
  return out
}

/** Variables lues par le code : import.meta.env.X, process.env.X, Deno `env.get('X')`, `env.X` dans les fonctions Edge et `e.X` de neighbors/env.ts. */
function variablesRead(): Map<string, string> {
  const found = new Map<string, string>()
  const add = (name: string, f: string) => found.set(name, f)
  for (const dir of ['src', 'api', 'supabase/functions']) {
    for (const f of files(join(root, dir))) {
      const src = readFileSync(f, 'utf8')
      for (const m of src.matchAll(/(?:import\.meta\.env|process\.env)\.([A-Z][A-Z0-9_]+)/g)) add(m[1], f)
      for (const m of src.matchAll(/env\.get\('([A-Z][A-Z0-9_]+)'\)/g)) add(m[1], f)
      if (f.includes(join('supabase', 'functions'))) for (const m of src.matchAll(/\benv\.([A-Z][A-Z0-9_]+)/g)) add(m[1], f)
      if (f.endsWith(join('neighbors', 'env.ts'))) for (const m of src.matchAll(/\be\.([A-Z][A-Z0-9_]+)/g)) add(m[1], f)
    }
  }
  // Variables propres à Vite ou aux tests, sans rapport avec la configuration.
  for (const ignore of ['DEV', 'PROD', 'MODE', 'BASE_URL', 'SSR', 'TZ']) found.delete(ignore)
  return found
}

describe('variables d’environnement documentées', () => {
  const read = variablesRead()

  it('le code lit bien les variables attendues (le détecteur fonctionne)', () => {
    for (const v of ['PLANTNET_API_KEY', 'VITE_SUPABASE_URL', 'NEIGHBORS_SUPABASE_URL', 'NEIGHBORS_SUPABASE_PUBLISHABLE', 'NEIGHBORS_VAPID_PUBLIC', 'VITE_WEATHER_PROVIDER', 'VAPID_PRIVATE_KEY', 'NOTIFY_WEBHOOK_SECRET', 'PURGE_SECRET']) {
      expect([...read.keys()], v).toContain(v)
    }
  })

  it('toute variable lue par le code figure dans .env.example (table et ligne de variable)', () => {
    for (const [v, f] of read) {
      expect(example, `${v} (lue dans ${f}) absente de .env.example`).toMatch(new RegExp(`^# \\| ${v}\\b`, 'm'))
      expect(example, `${v} sans ligne ${v}= dans .env.example`).toMatch(new RegExp(`^#? ?${v}=`, 'm'))
    }
  })

  it('.env.example ne contient aucune valeur (modèle vide)', () => {
    for (const l of example.split('\n')) {
      const m = /^([A-Z][A-Z0-9_]+)=(.*)$/.exec(l)
      if (m) expect(m[2].trim(), m[1]).toBe('')
    }
  })

  it('aucune variable secrète n’a un préfixe exposé au navigateur (VITE_ ou NEIGHBORS_)', () => {
    for (const v of read.keys()) {
      if (/^(VITE_|NEIGHBORS_)/.test(v)) expect(v, 'secret exposé').not.toMatch(/SERVICE_ROLE|PRIVATE|WEBHOOK|PURGE|SECRET/)
    }
    expect(example).not.toMatch(/^(VITE_|NEIGHBORS_)\w*(SERVICE_ROLE|PRIVATE|SECRET)\w*=/m)
  })

  it('le README renvoie à .env.example au lieu de recopier un second tableau', () => {
    expect(readme).toContain('.env.example')
    expect(readme).not.toMatch(/^\| `PLANTNET_API_KEY`/m)
  })
})

// Contrôles statiques de la migration v9 (second durcissement). Les scénarios réels sont dans supabase/neighbors/tests/scenarios_v9.sql
// (banc run.sh sur un Postgres jetable) : ce fichier est le filet quand aucun Postgres n'est disponible.
import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const dir = 'supabase/neighbors/migrations/'
const read = (name: string) => readFileSync(dir + name, 'utf8')
const strip = (s: string) => s.replace(/--.*$/gm, '')
const V9 = '20261104000000_neighbors_v9_hardening2.sql'
const sql = read(V9)
const code = strip(sql)
const PROBES = ['neighbors_is_blocked', 'neighbors_can_contact', 'neighbors_can_see_user']
const PROBE_RE = new RegExp(`public\\.(${PROBES.join('|')})\\(`)

describe('migration v9 : ordre et idempotence', () => {
  it('est la dernière migration par ordre de nom, et run.sh la joue en dernier (et deux fois)', () => {
    const files = readdirSync(dir).sort()
    expect(files.at(-1)).toBe(V9)
    expect(files).toHaveLength(9)
    const run = readFileSync('supabase/neighbors/tests/run.sh', 'utf8')
    const lines = run.split('\n').filter((l) => /-f "\$MIG\d?"|scenarios_/.test(l))
    const lastMig = lines.map((l, i) => [l, i] as const).filter(([l]) => /-f "\$MIG\d?"/.test(l)).at(-1)!
    expect(lastMig[0]).toMatch(/\$MIG9/)
    expect(run.match(/-f "\$MIG9"/g)!.length).toBeGreaterThanOrEqual(3) // juste après la v8, puis à la fin, deux fois
    expect(lines.at(-1)).toMatch(/scenarios_v9\.sql/)
    expect(run).toMatch(/MIG9=\.\.\/migrations\/20261104000000_neighbors_v9_hardening2\.sql/)
  })
  it('ne supprime aucune donnée : pas de delete, truncate, drop table ni drop column', () => {
    expect(code).not.toMatch(/\bdelete\s+from\b|\btruncate\b|drop table|drop column/i)
  })
  it('aucun secret, aucune extension, aucun droit à anon ou public, aucun « grant all », pas de cascade', () => {
    expect(code).not.toMatch(/create extension|eyJ[A-Za-z0-9_-]{20,}|cascade/i)
    expect(code).not.toMatch(/grant [^;]*\bto\b[^;]*\b(anon|public)\b/i)
    expect(code).not.toMatch(/grant all/i)
  })
})

describe('migration v9 : S6, sondes déplacées dans un schéma non exposé', () => {
  const fns = [...code.matchAll(/create or replace function neighbors_private\.(\w+)\(([^)]*)\)([\s\S]*?)\$\$;/g)].map((m) => ({ name: m[1], text: m[0] }))
  it('les trois fonctions sont créées dans neighbors_private, search_path vide, révoquées à public et anon, accordées aux connectés', () => {
    expect(fns.map((f) => f.name).sort()).toEqual([...PROBES].sort())
    for (const f of fns) {
      expect(f.text, f.name).toMatch(/set search_path = ''/)
      expect(f.text, f.name).toMatch(/security definer/)
      expect(code, f.name).toMatch(new RegExp(`revoke all on function neighbors_private\\.${f.name}\\([^)]*\\) from public, anon;`))
      expect(code, f.name).toMatch(new RegExp(`grant execute on function neighbors_private\\.${f.name}\\([^)]*\\) to authenticated;`))
    }
  })
  it('le schéma est fermé à public et anon, ouvert en usage aux connectés (les politiques en ont besoin)', () => {
    expect(code).toMatch(/create schema if not exists neighbors_private/)
    expect(code).toMatch(/revoke all on schema neighbors_private from public, anon/)
    expect(code).toMatch(/grant usage on schema neighbors_private to authenticated/)
  })
  it('aucune fonction de la v9 ne rappelle une sonde publique', () => {
    // Hors « drop function if exists public.… » : plus aucun appel.
    expect(code.replace(/drop function if exists public\.\w+\(uuid\);/g, '')).not.toMatch(PROBE_RE)
    for (const f of fns) expect(f.text, f.name).not.toMatch(PROBE_RE)
  })
  it('les copies publiques sont supprimées, sans cascade, après le ré-écrit des politiques', () => {
    for (const p of PROBES) expect(code).toMatch(new RegExp(`drop function if exists public\\.${p}\\(uuid\\);`))
    const firstDrop = code.indexOf('drop function if exists public.neighbors_can_contact')
    for (const policy of ['profiles_select', 'posts_select', 'replies_select', 'threads_select', 'threads_insert', 'events_select', 'garden_shares_select']) {
      const at = code.indexOf(`create policy ${policy} on`)
      expect(at, policy).toBeGreaterThan(-1)
      expect(at, policy).toBeLessThan(firstDrop)
    }
    // can_contact (qui appelle can_see_user et is_blocked) part avant les deux autres.
    expect(code.indexOf('drop function if exists public.neighbors_can_contact')).toBeLessThan(code.indexOf('drop function if exists public.neighbors_can_see_user'))
    expect(code.indexOf('drop function if exists public.neighbors_can_see_user')).toBeLessThan(code.indexOf('drop function if exists public.neighbors_is_blocked'))
  })
  it('toute politique des migrations v1 à v8 qui appelait une sonde est réécrite dans la v9, vers neighbors_private', () => {
    const earlier = readdirSync(dir).sort().filter((f) => f !== V9)
    const callers = new Set<string>()
    for (const f of earlier) {
      for (const m of strip(read(f)).matchAll(/create policy (\w+) on public\.(\w+)[\s\S]*?;\n/g)) {
        if (PROBE_RE.test(m[0])) callers.add(m[1])
      }
    }
    expect([...callers].sort()).toEqual(['events_select', 'garden_shares_select', 'posts_select', 'profiles_select', 'replies_select', 'threads_insert', 'threads_select'])
    for (const name of callers) {
      const body = new RegExp(`create policy ${name} on public\\.\\w+[\\s\\S]*?;\\n`).exec(code)
      expect(body, name).not.toBeNull()
      expect(body![0], name).toMatch(/neighbors_private\.neighbors_(is_blocked|can_contact|can_see_user)\(/)
      expect(body![0], name).not.toMatch(PROBE_RE)
    }
    // Les fonctions des migrations précédentes qui appelaient les sondes publiques sont, elles aussi, recréées dans neighbors_private.
    const fnCallers = new Set<string>()
    for (const f of earlier) {
      for (const m of strip(read(f)).matchAll(/create or replace function public\.(\w+)\(([^)]*)\)([\s\S]*?)\$\$;/g)) {
        if (PROBE_RE.test(m[3]) && !PROBES.includes(m[1])) fnCallers.add(m[1])
      }
    }
    expect([...fnCallers]).toEqual([])
  })
  it('les règles ne changent pas : mêmes conditions que les politiques de la v1, du v4 et de la v8', () => {
    const norm = (s: string) => s.replace(/neighbors_private\./g, 'public.').replace(/\s+/g, ' ').replace(/ ?--[^\n]*/g, '')
    const v1 = strip(read('20261023000000_neighbors.sql'))
    const v4 = strip(read('20261025020000_neighbors_v4_events.sql'))
    const v8 = strip(read('20261029000000_neighbors_v8_gardens.sql'))
    const pick = (src: string, name: string) => norm(new RegExp(`create policy ${name} on public\\.\\w+[\\s\\S]*?;\\n`).exec(src)![0])
    for (const [name, src] of [['posts_select', v1], ['replies_select', v1], ['threads_select', v1], ['threads_insert', v1], ['events_select', v4], ['profiles_select', v8], ['garden_shares_select', v8]] as const) {
      expect(pick(code, name), name).toBe(pick(src, name))
    }
  })
})

describe('migration v9 : S7, textes sans contrôles C1 ni marques de direction', () => {
  const tables = ['posts', 'replies', 'messages', 'reports', 'events', 'organizers']
  it('six contraintes *_text_clean, recréées (même nom que la v7, pas de doublon), NOT VALID puis validées sans faire échouer le fichier', () => {
    for (const t of tables) {
      expect(code, t).toMatch(new RegExp(`alter table public\\.${t} drop constraint if exists ${t}_text_clean;\\s+alter table public\\.${t} add constraint ${t}_text_clean check \\([\\s\\S]*?\\) not valid;`))
    }
    expect(code).toMatch(/validate constraint/)
    expect(code).toMatch(/exception when check_violation then/)
    expect(code.match(/add constraint \w+_text_clean/g)).toHaveLength(6)
  })
  it('chaque règle porte la plage C1 et toutes les marques de direction', () => {
    const rules = [...code.matchAll(/!~ '(\[[^']*\])'/g)].map((m) => m[1])
    expect(rules).toHaveLength(10) // posts 2, replies 1, messages 1, reports 1, events 3, organizers 2
    for (const r of rules) {
      expect(r).toContain('\\u007f-\\u009f') // DEL et contrôles C1
      expect(r).toContain('\\u200b-\\u200f') // U+200E et U+200F compris
      expect(r).toContain('\\u2028-\\u202e') // U+202A à U+202E compris
      expect(r).toContain('\\u2060-\\u206f') // U+2066 à U+2069 compris
      expect(r).toContain('\\u061c')
      expect(r).toContain('\\ufeff')
    }
  })
  it('cette règle contient celle de la v7 : mêmes plages, plus C1', () => {
    const toSet = (re: string) => {
      const set = new Set<number>()
      const body = re.slice(1, -1)
      for (const m of body.matchAll(/(?:\\u([0-9a-f]{4})|\\x([0-9a-f]{2}))(?:-(?:\\u([0-9a-f]{4})|\\x([0-9a-f]{2})))?/gi)) {
        const a = parseInt(m[1] ?? m[2], 16)
        const b = m[3] || m[4] ? parseInt(m[3] ?? m[4], 16) : a
        for (let c = a; c <= b; c++) set.add(c)
      }
      return set
    }
    const v7 = strip(read('20261027000000_neighbors_v7_hardening.sql'))
    // La règle de la v7 contient des caractères invisibles bruts : on les relit tels quels.
    const v7rule = /posts_text_clean check \(\s*title !~ '(\[[^']*?)<>\]'/.exec(v7)![1] + ']'
    const v7chars = new Set<number>()
    const re = new RegExp(v7rule.replace(/\\x([0-9a-f]{2})/gi, '\\u00$1'), 'u')
    for (let c = 1; c < 0x10000; c++) if (c < 0xd800 || c > 0xdfff) if (re.test(String.fromCodePoint(c))) v7chars.add(c)
    const v9rule = /posts_text_clean check \(\s*title !~ '(\[[^']*)<>\]'/.exec(code)![1] + ']'
    const v9chars = toSet(v9rule)
    for (const c of v7chars) expect(v9chars.has(c), `U+${c.toString(16)}`).toBe(true)
    const added = [...v9chars].filter((c) => !v7chars.has(c))
    expect(added).toHaveLength(32)
    expect(Math.min(...added)).toBe(0x80)
    expect(Math.max(...added)).toBe(0x9f)
    // Autorisés : tabulation, retour à la ligne, accents.
    for (const c of [9, 10, 13, 0xe9, 0x153, 0x20ac]) expect(v9chars.has(c)).toBe(false)
  })
  it('le titre et le lieu refusent aussi < et >, la description des organisateurs non', () => {
    expect(code).toMatch(/posts_text_clean check \(\s*title !~ '\[[^']*<>\]'/)
    expect(/organizers_text_clean check \(([\s\S]*?)\) not valid/.exec(code)![1]).toMatch(/name !~ '\[[^']*<>\]'\s+and description !~ '\[[^']*\\ufeff\]'/)
  })
})

describe('migration v9 : S8, masquage automatique plus exigeant', () => {
  const fn = /create or replace function public\.neighbors_report_after_insert\(\)[\s\S]*?\$\$;/.exec(code)![0]
  it('compte les signaleurs non bannis, de plus de 7 jours, déjà actifs (annonce, réponse ou message)', () => {
    expect(fn).toMatch(/p\.banned_at is null and p\.created_at < now\(\) - interval '7 days'/)
    expect(fn).toMatch(/from public\.posts x where x\.author = r\.reporter/)
    expect(fn).toMatch(/from public\.replies y where y\.author = r\.reporter/)
    expect(fn).toMatch(/from public\.messages m where m\.sender = r\.reporter/)
    expect(fn).not.toMatch(/interval '24 hours'/)
  })
  it('seuil de 3 ; la ligne « warn » est écrite AVANT la mise à « hidden »', () => {
    expect(fn).toMatch(/if n >= 3 then/)
    const warn = fn.indexOf("'warn'")
    expect(warn).toBeGreaterThan(-1)
    for (const t of ['posts', 'replies', 'events']) expect(fn.indexOf(`update public.${t} set status = 'hidden'`), t).toBeGreaterThan(warn)
    expect(fn.indexOf("'auto_hide'")).toBeGreaterThan(fn.indexOf("update public.posts set status = 'hidden'"))
  })
  it('le déclencheur est recréé, la fonction n’est appelable par personne', () => {
    expect(code).toMatch(/revoke all on function public\.neighbors_report_after_insert\(\) from public, anon, authenticated/)
    expect(code).toMatch(/create trigger neighbors_report_after_insert after insert on public\.reports/)
  })
  it('ne reprend pas l’extrait du contenu signalé (décision du propriétaire)', () => {
    expect(code).not.toMatch(/snapshot/i)
  })
})

describe('migration v9 : S4, purge pour la clé de service seulement', () => {
  it('purge et orphelins : révoqués à public, anon et connectés ; accordés à service_role', () => {
    for (const f of ['neighbors_purge_expired', 'neighbors_orphan_photos']) {
      expect(code).toMatch(new RegExp(`revoke all on function public\\.${f}\\(\\) from public, anon, authenticated;`))
      expect(code).toMatch(new RegExp(`grant execute on function public\\.${f}\\(\\) to service_role;`))
    }
  })
})

describe('migrations précédentes : inchangées par la v9 (elles restent rejouables, la v9 passe après)', () => {
  it('la v7 de main garde 7 jours entre deux changements de quartier et ses contraintes *_text_clean', () => {
    const v7 = read('20261027000000_neighbors_v7_hardening.sql')
    expect(v7).toMatch(/interval '7 days'/)
    expect(v7.match(/_text_clean/g)!.length).toBeGreaterThanOrEqual(6)
    expect(v7).not.toMatch(/neighbors_private/)
  })
  it('la v1 et la v8 définissent encore les sondes dans public (la v9 les déplace après coup)', () => {
    expect(read('20261023000000_neighbors.sql')).toMatch(/create or replace function public\.neighbors_is_blocked/)
    expect(read('20261029000000_neighbors_v8_gardens.sql')).toMatch(/create or replace function public\.neighbors_can_see_user/)
  })
})

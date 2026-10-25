// Contrôles statiques de la migration d'entraide (filet quand aucun Postgres n'est disponible).
// Les scénarios hostiles réels sont dans supabase/neighbors/tests/ (run.sh sur un Postgres jetable).
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { NEIGHBORS_LIMITS as L, POST_CATEGORIES, POST_KINDS } from './types'

const sql = readFileSync('supabase/neighbors/migrations/20261023000000_neighbors.sql', 'utf8')
const code = sql.replace(/--.*$/gm, '') // sans commentaires

const functions = [...code.matchAll(/create or replace function public\.(\w+)\(([^)]*)\)([\s\S]*?)\$\$;/g)].map((m) => ({ name: m[1], args: m[2], text: m[0] }))
const tables = [...code.matchAll(/create table if not exists public\.(\w+)/g)].map((m) => m[1])

describe('migration entraide : durcissement', () => {
  it('contient les fonctions attendues', () => {
    expect(functions.length).toBeGreaterThanOrEqual(18)
  })
  it('chaque fonction a un search_path vide', () => {
    for (const f of functions) expect(f.text, f.name).toMatch(/set search_path = ''/)
  })
  it('chaque fonction est révoquée à public et anon', () => {
    for (const f of functions) {
      const re = new RegExp(`revoke all on function public\\.${f.name}\\([^)]*\\) from public, anon`)
      expect(code, f.name).toMatch(re)
    }
  })
  it('seules les aides de politiques et la suppression de compte sont appelables par les connectés', () => {
    const granted = [...code.matchAll(/grant execute on function public\.(\w+)/g)].map((m) => m[1]).sort()
    expect(granted).toEqual(['delete_my_account', 'neighbors_can_contact', 'neighbors_can_see_cell', 'neighbors_is_blocked', 'neighbors_is_member', 'neighbors_my_photo_count'])
  })
  it('audit 2 : contact, blocage et signalement de profil exigent un profil déjà visible ; pas de profil anonyme', () => {
    const policy = (name: string) => new RegExp(`create policy ${name} on public\\.\\w+ for insert to authenticated\\s+with check \\(([\\s\\S]*?)\\);`).exec(code)?.[1] ?? ''
    expect(policy('threads_insert')).toMatch(/neighbors_can_contact\(/)
    expect(policy('threads_insert')).toMatch(/p\.author in \(threads\.user_a, threads\.user_b\)/)
    expect(policy('blocks_insert')).toMatch(/from public\.profiles pr where pr\.user_id = blocks\.blocked/)
    expect(policy('reports_insert')).toMatch(/when 'profile' then exists \(select 1 from public\.profiles/)
    expect(policy('profiles_insert')).toMatch(/is_anonymous/)
  })
  it('audit 2 : la fenêtre de longitude dépend de la latitude (pas de 1,5° fixe, soit ~112 km à Paris)', () => {
    const fn = functions.find((f) => f.name === 'neighbors_can_see_cell')!.text
    expect(fn).toMatch(/cos\(radians\(/)
    expect(fn).not.toMatch(/<= 1\.5/)
  })
  it('chaque table publique a la RLS activée', () => {
    expect(tables.sort()).toEqual(['blocks', 'messages', 'moderation_log', 'posts', 'profiles', 'quotas', 'replies', 'reports', 'threads'])
    for (const t of tables) expect(code, t).toMatch(new RegExp(`alter table public\\.${t}\\s+enable row level security`))
  })
  it('aucun droit à anon ou public, aucun « grant all », aucune politique ouverte', () => {
    expect(code).not.toMatch(/grant [^;]*\bto\b[^;]*\b(anon|public)\b/i)
    expect(code).not.toMatch(/grant all/i)
    expect(code).not.toMatch(/using\s*\(\s*true\s*\)/i)
    expect(code).not.toMatch(/with check\s*\(\s*true\s*\)/i)
    expect(code).not.toMatch(/\bto (anon|public)\b/i)
  })
  it('pas d’extension, pas de SQL dynamique, pas de service_role', () => {
    expect(code).not.toMatch(/create extension/i)
    expect(code).not.toMatch(/\bexecute\s+(format|'|\()/i)
    expect(code).not.toMatch(/service_role/i)
  })
  it('colonnes sensibles : aucun droit client sur banned_at, cell_*/status/expires_at des annonces', () => {
    const grants = [...code.matchAll(/grant (select|insert|update) \(([^)]*)\) on public\.(\w+)/g)].map((m) => `${m[1]} ${m[3]}: ${m[2]}`)
    expect(grants.join('\n')).not.toMatch(/banned_at/)
    expect(grants.find((g) => g.startsWith('insert posts'))).toBe('insert posts: author, kind, title, body, species_id, photo_path')
    expect(grants.find((g) => g.startsWith('update posts'))).toBe('update posts: status')
    expect(grants.find((g) => g.startsWith('update profiles'))).toBe('update profiles: pseudo, cell_lat, cell_lon')
  })
  it('le bucket de photos est privé, limité à 1 Mo et aux images', () => {
    expect(code).toMatch(/'neighbors-photos', 'neighbors-photos', false, 1048576, array\['image\/jpeg', 'image\/png', 'image\/webp'\]/)
    expect(code).toMatch(/\[0-9a-f\]\{8\}.*\\\.jpg\$/) // nom imposé <uid>/<uuid>.jpg
    expect(code).toMatch(/neighbors_my_photo_count\(\)\) < 20/)
  })
  it('les plafonds du client reprennent ceux de la base', () => {
    expect(code).toContain(`neighbors_take_quota(new.author, 'post', ${L.postsPerDay})`)
    expect(code).toContain(`neighbors_take_quota(new.author, 'reply', ${L.repliesPerDay})`)
    expect(code).toContain(`neighbors_take_quota(new.sender, 'message', ${L.messagesPerDay})`)
    expect(code).toContain(`neighbors_take_quota(new.reporter, 'report', ${L.reportsPerDay})`)
    expect(code).toContain(`>= ${L.openPostsMax} then`)
    expect(code).toContain(`between ${L.pseudoMin} and ${L.pseudoMax}`)
    expect(code).toContain(`char_length(btrim(title)) between 1 and ${L.titleMax}`)
    expect(code).toContain(`char_length(body) <= ${L.bodyMax}`)
    expect(code).toContain(`char_length(details) <= ${L.detailsMax}`)
    expect(code).toContain(`interval '${L.postLifetimeDays} days'`)
  })
  it('la migration est rejouable : tout est « if not exists », « or replace » ou précédé d’un drop', () => {
    for (const m of code.matchAll(/^create (table|index|unique index|trigger|policy|function)\b(?! if not exists)(?! or replace)(.*)$/gim)) {
      const stmt = m[0]
      if (/^create (trigger|policy)/i.test(stmt)) {
        const name = /create (?:trigger|policy) (\w+)/i.exec(stmt)![1]
        expect(code, name).toMatch(new RegExp(`drop (trigger|policy) if exists ${name}\\b`))
      } else expect(stmt).toMatch(/if not exists|or replace/)
    }
  })
})

describe('migration entraide v2 : « Je cherche » et catégories', () => {
  const sql2 = readFileSync('supabase/neighbors/migrations/20261025000000_neighbors_v2.sql', 'utf8')
  const code2 = sql2.replace(/--.*$/gm, '')
  const list = (re: RegExp) => [...(re.exec(code2)?.[1] ?? '').matchAll(/'(\w+)'/g)].map((m) => m[1])

  it('les types et les catégories de la base sont ceux du client', () => {
    expect(list(/posts_kind_check\s+check \(kind in \(([^)]*)\)/)).toEqual([...POST_KINDS])
    expect(list(/posts_category_check\s+check \(category is null or category in \(([^)]*)\)/)).toEqual(POST_CATEGORIES.map((c) => c.id))
  })
  it('une demande exige une catégorie, les anciennes annonces gardent null', () => {
    expect(code2).toMatch(/check \(kind <> 'cherche' or category is not null\)/)
    expect(code2).toMatch(/add column if not exists category text;/)
    expect(code2).not.toMatch(/category text not null/)
  })
  it('seul le droit d’insertion de la colonne category est ajouté', () => {
    expect([...code2.matchAll(/grant ([^;]*);/g)].map((m) => m[1])).toEqual(['insert (category) on public.posts to authenticated'])
  })
  it('rejouable : colonne, index et contraintes protégés ; la v1 n’est pas modifiée', () => {
    expect(code2).toMatch(/drop constraint if exists posts_kind_check/)
    expect(code2).toMatch(/drop constraint if exists posts_category_check/)
    expect(code2).toMatch(/drop constraint if exists posts_cherche_category_check/)
    expect(code2).toMatch(/create index if not exists posts_category_idx/)
    expect(sql).not.toMatch(/cherche|category/)
  })
  it('aucune suppression de données, aucune politique ni fonction nouvelle', () => {
    expect(code2).not.toMatch(/\bdelete\b/i)
    expect(code2).not.toMatch(/\bdrop (table|column|policy|trigger|function|index)\b/i)
    expect(code2).not.toMatch(/create (policy|function|or replace function|trigger)/i)
  })
})

describe('migration entraide v3 : messages non lus (thread_reads)', () => {
  const sql3 = readFileSync('supabase/neighbors/migrations/20261025010000_neighbors_v3_read.sql', 'utf8')
  const code3 = sql3.replace(/--.*$/gm, '')

  it('une ligne par conversation et par personne, supprimée avec elles', () => {
    expect(code3).toMatch(/create table if not exists public\.thread_reads/)
    expect(code3).toMatch(/primary key \(thread_id, user_id\)/)
    expect(code3).toMatch(/thread_id\s+uuid not null references public\.threads \(id\) on delete cascade/)
    expect(code3).toMatch(/user_id\s+uuid not null default auth\.uid\(\) references public\.profiles \(user_id\) on delete cascade/)
  })
  it('RLS activée ; chacun ne lit et n’écrit que sa ligne', () => {
    expect(code3).toMatch(/alter table public\.thread_reads enable row level security/)
    for (const name of ['thread_reads_select', 'thread_reads_insert', 'thread_reads_update']) {
      const policy = new RegExp(`create policy ${name} on public\\.thread_reads[\\s\\S]*?;`).exec(code3)?.[0] ?? ''
      expect(policy, name).toContain('user_id = (select auth.uid())')
    }
    expect(code3).toMatch(/exists \(select 1 from public\.threads t where t\.id = thread_reads\.thread_id and \(select auth\.uid\(\)\) in \(t\.user_a, t\.user_b\)\)/)
    expect(code3).toMatch(/neighbors_is_member\(\)/)
  })
  it('droits colonne par colonne, rien pour anon, pas de suppression ni de quota', () => {
    expect([...code3.matchAll(/grant ([^;]*);/g)].map((m) => m[1])).toEqual([
      'select on public.thread_reads to authenticated',
      'insert (thread_id, user_id, last_read_at) on public.thread_reads to authenticated',
      'update (last_read_at) on public.thread_reads to authenticated',
    ])
    expect(code3).toMatch(/revoke all on public\.thread_reads from public, anon, authenticated/)
    expect(code3).not.toMatch(/\bto (anon|public)\b/i)
    expect(code3).not.toMatch(/using\s*\(\s*true\s*\)|with check\s*\(\s*true\s*\)/i)
    expect(code3).not.toMatch(/neighbors_take_quota/)
  })
  it('la date est toujours celle du serveur (déclencheur), fonction durcie', () => {
    expect(code3).toMatch(/new\.last_read_at := now\(\)/)
    expect(code3).toMatch(/create trigger thread_reads_touch before insert or update on public\.thread_reads/)
    expect(code3).toMatch(/set search_path = ''/)
    expect(code3).toMatch(/revoke all on function public\.neighbors_thread_read_touch\(\) from public, anon, authenticated/)
    expect(code3).not.toMatch(/grant execute/)
  })
  it('rejouable, sans suppression de données, et l’historique existant n’apparaît pas « non lu »', () => {
    expect(code3).toMatch(/drop trigger if exists thread_reads_touch/)
    for (const name of ['thread_reads_select', 'thread_reads_insert', 'thread_reads_update']) expect(code3).toMatch(new RegExp(`drop policy if exists ${name}\\b`))
    expect(code3).not.toMatch(/\bdelete from\b|\bdrop (table|column|function)\b|\btruncate\b/i)
    expect(code3).toMatch(/where not exists \(select 1 from public\.thread_reads\)/)
  })
})

// Contrôles statiques de la migration v10 (événements visibles sans compte). Les scénarios réels sont dans supabase/neighbors/tests/scenarios_v10.sql
// (banc run.sh sur un Postgres jetable) : ce fichier est le filet quand aucun Postgres n'est disponible.
import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const dir = 'supabase/neighbors/migrations/'
const V10 = '20261110000000_neighbors_v10_public_events.sql'
const sql = readFileSync(dir + V10, 'utf8')
const code = sql.replace(/--.*$/gm, '')

describe('migration v10 : ordre, idempotence, portée', () => {
  it('est la dernière migration par ordre de nom ; run.sh et run-shared.sh la rejouent deux fois puis lancent scenarios_v10.sql', () => {
    expect(readdirSync(dir).sort().at(-1)).toBe(V10)
    for (const f of ['run.sh', 'run-shared.sh']) {
      const run = readFileSync('supabase/neighbors/tests/' + f, 'utf8')
      expect(run, f).toMatch(/MIG10=\.\.\/migrations\/20261110000000_neighbors_v10_public_events\.sql/)
      expect(run.match(/-f "\$MIG10"/g), f).toHaveLength(2)
      expect(run, f).toMatch(/scenarios_v10\.sql/)
    }
  })
  it('ne supprime ni ne modifie aucune donnée, ne touche à aucune table, politique ni extension', () => {
    expect(code).not.toMatch(/\bdelete\s+from\b|\btruncate\b|drop table|drop column|\binsert\s+into\b|\bupdate\s+public\./i)
    expect(code).not.toMatch(/create table|alter table|create policy|drop policy|create extension|cascade|grant all/i)
    expect(code).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}/)
  })
  it('une seule fonction est créée : neighbors_public_events(numeric, numeric)', () => {
    const fns = [...code.matchAll(/create or replace function ([\w.]+)\(/g)].map((m) => m[1])
    expect(fns).toEqual(['public.neighbors_public_events'])
  })
})

describe('migration v10 : la fonction', () => {
  it('est en lecture seule, search_path vide, security definer (anon n’a aucun droit sur les tables)', () => {
    expect(code).toMatch(/language plpgsql stable security definer\s+set search_path = ''/)
  })
  it('droits : révoquée à tous puis accordée à anon et authenticated, rien d’autre', () => {
    expect(code).toMatch(/revoke all on function public\.neighbors_public_events\(numeric, numeric\) from public, anon, authenticated;/)
    const grants = [...code.matchAll(/grant [^;]*;/gi)].map((m) => m[0].replace(/\s+/g, ' '))
    expect(grants).toEqual(['grant execute on function public.neighbors_public_events(numeric, numeric) to anon, authenticated;'])
  })
  it('rend seulement titre, dates, lieu et nom de l’organisateur (ni id, ni description, ni lien, ni cellule, ni distance)', () => {
    expect(code).toMatch(/returns table \(title text, starts_at timestamptz, ends_at timestamptz, place text, organizer_name text\)/)
    const select = /return query\s+select ([^]*?)\s+from public\.events/.exec(code)![1]
    expect(select).toBe('e.title, e.starts_at, e.ends_at, e.place, o.name')
  })
  it('filtre : ouvert, pas fini, 90 jours, organisateur validé et non banni, fenêtre de 25 km, 20 lignes', () => {
    expect(code).toMatch(/e\.status = 'open'/)
    expect(code).toMatch(/e\.ends_at > now\(\)/)
    expect(code).toMatch(/e\.starts_at < now\(\) \+ interval '90 days'/)
    expect(code).toMatch(/o\.verified_at is not null/)
    expect(code).toMatch(/p\.banned_at is null/)
    expect(code).toMatch(/d_lat := 25 \/ 111\.32/)
    expect(code).toMatch(/limit 20;/)
  })
  it('arrondit le point reçu à la grande cellule (même grille que la v6) et refuse un point impossible', () => {
    expect(code).toMatch(/neighbors_cell_snap\(p_lat, 'large', 'lat'\)/)
    expect(code).toMatch(/neighbors_cell_snap\(p_lon, 'large', 'lon'\)/)
    expect(code).toMatch(/invalid_cell' using errcode = '22023'/)
    expect(code).toMatch(/p_lat < -90 or p_lat > 90 or p_lon < -180 or p_lon > 180/)
  })
})

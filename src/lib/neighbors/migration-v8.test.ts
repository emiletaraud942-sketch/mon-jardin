// Contrôles statiques de la migration v8 (jardins partagés). Les scénarios réels sont dans supabase/neighbors/tests/scenarios_v8.sql.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { NEIGHBORS_LIMITS as L } from './types'

const sql = readFileSync('supabase/neighbors/migrations/20261029000000_neighbors_v8_gardens.sql', 'utf8')
const code = sql.replace(/--.*$/gm, '')
const functions = [...code.matchAll(/create or replace function public\.(\w+)\(([^)]*)\)([\s\S]*?)\$\$;/g)].map((m) => ({ name: m[1], text: m[0] }))

describe('migration v8 : jardins partagés', () => {
  it('chaque fonction a un search_path vide et est révoquée à public et anon', () => {
    expect(functions.map((f) => f.name).sort()).toEqual(['neighbors_can_contact', 'neighbors_can_see_user', 'neighbors_garden_before_write', 'neighbors_species_valid'])
    for (const f of functions) {
      expect(f.text, f.name).toMatch(/set search_path = ''/)
      expect(code, f.name).toMatch(new RegExp(`revoke all on function public\\.${f.name}\\([^)]*\\) from public, anon`))
    }
  })
  it('le déclencheur n’est appelable par personne ; les aides de politique le sont par les connectés', () => {
    expect(code).toMatch(/revoke all on function public\.neighbors_garden_before_write\(\) from public, anon, authenticated/)
    const granted = [...code.matchAll(/grant execute on function public\.(\w+)/g)].map((m) => m[1]).sort()
    expect(granted).toEqual(['neighbors_can_contact', 'neighbors_can_see_user', 'neighbors_species_valid'])
  })
  it('droits colonne par colonne : rien pour anon, rien sur user_id ni updated_at en écriture', () => {
    expect(code).toMatch(/revoke all on public\.garden_shares from public, anon, authenticated/)
    expect(code).toMatch(/grant insert \(species\) on public\.garden_shares to authenticated/)
    expect(code).toMatch(/grant update \(species\) on public\.garden_shares to authenticated/)
    expect(code).not.toMatch(/grant (insert|update) \([^)]*(user_id|updated_at)/)
    expect(code).not.toMatch(/to anon/)
  })
  it('RLS active, politiques de lecture filtrées par zone, blocage et bannissement', () => {
    expect(code).toMatch(/alter table public\.garden_shares enable row level security/)
    expect(/create policy garden_shares_select[\s\S]*?\);/.exec(code)?.[0]).toMatch(/neighbors_can_see_user\(garden_shares\.user_id\)/)
    expect(code).toMatch(/create policy garden_shares_delete[\s\S]*?user_id = \(select auth\.uid\(\)\)/)
  })
  it('contenu limité à des identifiants de fiches, 80 au plus (même plafond que l’appli)', () => {
    expect(code).toMatch(/cardinality\(list\) <= 80/)
    expect(L.gardenSpeciesMax).toBe(80)
    expect(code).toMatch(/s !~ '\^\[a-z0-9-\]\{2,40\}\$'/)
  })
  it('quota de 20 écritures par jour (même plafond que l’appli)', () => {
    expect(code).toMatch(/neighbors_take_quota\(new\.user_id, 'garden_share', 20\)/)
    expect(L.gardenWritesPerDay).toBe(20)
  })
  it('remplace aussi la politique de lecture des profils et le contrôle de contact', () => {
    expect(code).toMatch(/create policy profiles_select[\s\S]*?garden_shares g where g\.user_id = profiles\.user_id/)
    expect(code).toMatch(/exists \(select 1 from public\.garden_shares g where g\.user_id = other\)\s+and public\.neighbors_can_see_user\(other\)/)
  })
  it('aucune donnée précise : pas de colonne de position, de nombre ni de photo', () => {
    const table = /create table if not exists public\.garden_shares \(([\s\S]*?)\);/.exec(code)![1]
    expect(table).not.toMatch(/cell_|lat|lon|count|photo|address|adresse/i)
  })
})

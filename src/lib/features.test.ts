import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { FeatureList } from '../features/aide/ToutFaire'
import { FEATURES, RUBRIQUES, normalizeSearch, searchFeatures, visibleFeatures } from './features'

const SRC = join(__dirname, '..')
function sources(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) sources(p, out)
    else if (/\.tsx$/.test(n) && !/\.test\./.test(n)) out.push(p)
  }
  return out
}
const code = sources(SRC).map((f) => readFileSync(f, 'utf8')).join('\n')
const words = (s: string) => s.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length
const sentences = (s: string) => s.split(/(?<=[.!?])\s+(?=[A-ZÀ-ÖØ-Þ«“"'])/).filter(Boolean)

describe('registre des fonctions', () => {
  it('identifiants uniques, rubriques connues, rien de vide', () => {
    expect(new Set(FEATURES.map((f) => f.id)).size).toBe(FEATURES.length)
    const rub = new Set(RUBRIQUES.map((r) => r.id))
    for (const f of FEATURES) {
      expect(rub.has(f.rubrique), f.id).toBe(true)
      expect(f.mot.trim().length, f.id).toBeGreaterThan(2)
      expect(f.motsCles.length, f.id).toBeGreaterThan(0)
      expect(typeof f.run, f.id).toBe('function')
    }
    for (const r of RUBRIQUES) expect(FEATURES.some((f) => f.rubrique === r.id), r.id).toBe(true)
  })

  it('au moins 68 fonctions (l’inventaire de l’audit)', () => {
    expect(FEATURES.length).toBeGreaterThanOrEqual(68)
  })

  it('une phrase de 20 mots au plus par fonction ; un mot court', () => {
    for (const f of FEATURES) {
      expect(words(f.mot), f.id).toBeLessThanOrEqual(8)
      for (const s of sentences(f.phrase)) expect(words(s), `${f.id} : ${s}`).toBeLessThanOrEqual(20)
    }
    for (const r of RUBRIQUES) for (const s of sentences(r.phrase)) expect(words(s)).toBeLessThanOrEqual(20)
  })

  it('chaque cible existe dans le code (data-feat, feat ou repère construit)', () => {
    const special = new Set(['toast', 'pano-home', 'pano-place', 'placing-banner', 'parcours', 'voisins', 'help', 'picker', 'identify', 'shopping'])
    for (const f of FEATURES) {
      if (special.has(f.cible)) continue
      const found = code.includes(`data-feat="${f.cible}"`) || code.includes(`feat="${f.cible}"`)
      expect(found, `${f.id} → ${f.cible}`).toBe(true)
    }
    for (const c of ['picker', 'identify', 'shopping', 'help']) expect(code.includes(`feat="${c}"`), c).toBe(true)
    expect(code).toContain("'pano-' +")
    expect(code).toContain('placing-banner')
  })
})

describe('Tout ce que je peux faire', () => {
  const html = (query = '', opened = new Set([RUBRIQUES[0].id])) =>
    renderToStaticMarkup(createElement(FeatureList, { query, opened, onToggle: () => undefined, onChoose: () => undefined }))

  it('chaque fonction visible a son gros bouton (une entrée, même hors rubrique ouverte)', () => {
    const h = html()
    for (const f of visibleFeatures()) expect(h, f.id).toContain(`data-fid="${f.id}"`)
  })

  it('la première rubrique est ouverte, les autres repliées', () => {
    const h = html()
    expect(h.match(/<details[^>]*open=""/g)?.length).toBe(1)
    expect(h).toMatch(/data-rub="jardin"[^>]*open=""|open=""[^>]*data-rub="jardin"/)
  })

  it('la recherche ouvre toutes les rubriques trouvées', () => {
    const h = html('photo')
    expect(h.match(/<details/g)?.length).toBe(h.match(/<details[^>]*open=""/g)?.length)
  })

  it('les gros boutons font 56 px au moins', () => {
    const css = readFileSync(join(SRC, 'styles/facile.css'), 'utf8')
    expect(css).toMatch(/\.tf-item \{[^}]*min-height: 56px/)
  })
})

describe('recherche de fonctions', () => {
  const ids = (q: string) => searchFeatures(q, FEATURES).map((f) => f.id)
  it('trouve par mot-clé, sans accent ni pluriel', () => {
    expect(ids('tailler')).toContain('a-faire')
    expect(ids('photo')).toEqual(expect.arrayContaining(['photo-plante', 'identifier', 'photos-jardin']))
    expect(ids('sauvegarde')).toEqual(expect.arrayContaining(['sauvegarde', 'sauvegarde-photos', 'reprise']))
    expect(ids('loupe')[0]).toBe('loupe')
    expect(ids('LOUPES')).toContain('loupe')
    expect(ids('visite photos')[0]).toBe('visite-photos')
    expect(ids('œil')).toEqual([])
  })
  it('requête vide : tout ; mot inconnu : rien', () => {
    expect(searchFeatures('', FEATURES)).toHaveLength(FEATURES.length)
    expect(ids('zzzzqx')).toEqual([])
    expect(normalizeSearch('  Œillet d’Inde ')).toBe('oeillet d inde')
  })
})

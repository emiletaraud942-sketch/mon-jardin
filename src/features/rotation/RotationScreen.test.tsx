import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { SPECIES_BY_ID } from '../../data/species'
import { ROTATION_CAUTION, rotationAdvice, rotationWarning } from '../../engine/rotation'
import { RotationNote } from '../../components/RotationNote'
import { FEATURES, searchFeatures, visibleFeatures } from '../../lib/features'
import { rotationOpen } from '../../lib/overlays'
import type { Plant } from '../../types'
import { groupPlants } from './groups'
import { EMPTY_TEXT, INTRO_TEXT, ROTATION_TITLE, RotationBody } from './RotationScreen'

const words = (s: string) => s.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length
const sentences = (s: string) => s.split(/(?<=[.!?])\s+(?=[A-ZÀ-ÖØ-Þ«“"'])/).filter(Boolean)
const text = (h: string) => h.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, '’').replace(/\s+/g, ' ')

let n = 0
const plant = (speciesId: string, x: number, y: number, plantedAt: string, extra: Partial<Plant> = {}): Plant => ({
  id: `p${++n}`, gardenId: 'g', speciesId, position: { x, y }, plantedAt, status: 'en-place', photos: [], ...extra,
})
const TODAY = new Date(2026, 10, 9)
const PLANTS = [
  plant('tomate', 3, 3, '2026-05-10'),
  plant('tomate', 3.5, 3, '2026-05-10'),
  plant('aubergine', 4, 3, '2026-05-12'),
  plant('carotte', -8, 2, '2026-04-10', { status: 'recoltee' }),
  plant('pommier', 9, -9, '2020-03-01'),
]
const zones = rotationAdvice(PLANTS, SPECIES_BY_ID, TODAY, { id: 'g' })
const html = (z = zones) => renderToStaticMarkup(createElement(RotationBody, { zones: z, onAdd: () => undefined }))

describe('écran « Rotation de mon potager »', () => {
  it('liste par zone : légumes, famille en mots simples, dernière culture, ce qu’on ne remet pas', () => {
    const h = html()
    const t = text(h)
    expect(zones).toHaveLength(2)
    expect(h.match(/<section class="rot-zone"/g)).toHaveLength(2)
    expect(t).toContain('Tomate, 2 pieds')
    expect(t).toContain('2026 · la famille de la tomate')
    expect(t).toContain('Dernière culture : aubergine et tomate (2026).')
    expect(t).toContain('Ne remettez pas ici la famille de la tomate avant 2029 (souvent 3 ans).')
    expect(t).toContain('Même famille : tomate, pomme de terre, aubergine, poivron.')
    expect(t).toContain('Pour la suite, essayez des légumes-racines')
    expect(t).toContain('Ce sont des conseils généraux')
  })

  it('chaque zone est un repère de lecture avec un titre', () => {
    const h = html()
    for (const z of zones) expect(h).toContain(`<h2 id="${z.id}-h">${z.name}</h2>`)
    expect(h.match(/aria-labelledby="zone-\d-h"/g)).toHaveLength(2)
  })

  it('état vide : phrase claire et un seul bouton « Ajouter une plante »', () => {
    const h = html([])
    expect(text(h)).toContain(EMPTY_TEXT)
    expect(EMPTY_TEXT).toBe('Ajoutez vos légumes pour voir quoi planter où l’an prochain.')
    expect(h).toContain('role="status"')
    expect(h.match(/<button/g)).toHaveLength(1)
    expect(h).toContain('Ajouter une plante')
    expect(h).not.toContain('rot-zone')
    expect(text(h)).toContain('Ce sont des conseils généraux')
    expect(text(h)).toContain(ROTATION_CAUTION)
  })

  it('clavier : tout ce qui se touche est un vrai bouton ; l’écran se ferme avec Échap et Retour', () => {
    const src = readFileSync(join(__dirname, 'RotationScreen.tsx'), 'utf8')
    expect(html()).not.toMatch(/<(div|span|li|p)[^>]*onClick/)
    expect(src).toContain("e.key === 'Escape'")
    expect(src).toContain('useBackLayer(true, onBack)')
    expect(src).toContain('useInertBehind(true)')
    expect(src).toContain('role="dialog" aria-modal="true"')
    expect(src).toContain('data-feat="rotation"')
    expect(src).toContain('tabIndex={-1}')
  })

  it('les phrases de l’écran font 20 mots au plus, sans mot compliqué', () => {
    const lines = (h: string) => h.replace(/<\/(p|li|span|strong|h2|button)>/g, '\n').replace(/<[^>]+>/g, '').split('\n').map((l) => l.replace(/&#x27;/g, '’').trim()).filter(Boolean)
    const all = [INTRO_TEXT, EMPTY_TEXT, ROTATION_CAUTION, ...lines(html()), ...lines(html([]))]
    for (const t of all) for (const s of sentences(t)) expect(words(s), s).toBeLessThanOrEqual(20)
    for (const t of all) expect(t).not.toMatch(/assolement|strate|vivace|diagnostic|mellif/i)
    expect(ROTATION_TITLE).toBe('Rotation de mon potager')
  })

  it('plusieurs pieds du même légume la même année : une ligne', () => {
    const lines = groupPlants(zones.find((z) => z.plants.some((p) => p.speciesId === 'tomate'))!.plants)
    expect(lines.map((l) => [l.name, l.count])).toEqual([['Aubergine', 1], ['Tomate', 2]])
  })
})

describe('feuille de style de l’écran', () => {
  const css = readFileSync(join(__dirname, '../../styles/rotation.css'), 'utf8')
  it('couleurs par variables seulement, graisses par variables', () => {
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(css).not.toMatch(/rgba?\(/)
    expect(css).not.toMatch(/font-weight:\s*\d/)
  })
  it('tailles en unités de la maquette', () => {
    expect(css).toMatch(/calc\(21 \* var\(--px\)\)/)
  })
})

describe('avertissement dans « Où planter ? »', () => {
  const w = rotationWarning('pomme-de-terre', { x: 3, y: 3 }, PLANTS, SPECIES_BY_ID, TODAY)
  it('affiche la phrase de rotation, discrètement, avec le mot « rotation »', () => {
    const h = renderToStaticMarkup(createElement(RotationNote, { warning: w }))
    expect(h).toContain('role="note"')
    expect(h).toContain('Pensez à la rotation des cultures')
    expect(text(h)).toContain('Même famille déjà cultivée à moins de 3 m (2026)')
    expect(h).not.toContain('<button')
  })
  it('ne montre rien quand il n’y a rien à dire', () => {
    expect(renderToStaticMarkup(createElement(RotationNote, { warning: null }))).toBe('')
    expect(renderToStaticMarkup(createElement(RotationNote, { warning: undefined }))).toBe('')
    expect(rotationWarning('carotte', { x: 3, y: 3 }, PLANTS, SPECIES_BY_ID, TODAY)).toBeNull()
  })
  it('« Où planter ? » l’utilise sous les risques, sans bloquer le bouton « Prévoir ici »', () => {
    const src = readFileSync(join(__dirname, '../planting/PlantingPage.tsx'), 'utf8')
    expect(src).toContain('<RotationNote warning={analysis.rotation[r.species.id]} />')
    expect(src.indexOf('<RiskNotes')).toBeLessThan(src.indexOf('<RotationNote'))
    expect(src.indexOf('<RotationNote')).toBeLessThan(src.indexOf('placePlant(garden'))
  })
})

describe('registre et ouverture', () => {
  const f = FEATURES.find((x) => x.id === 'rotation-potager')!
  it('la fonction est au registre, visible, avec son repère et ses mots-clés', () => {
    expect(f).toBeDefined()
    expect(f.mot).toBe('Voir la rotation de mon potager')
    expect(f.cible).toBe('rotation')
    expect(f.rubrique).toBe('afaire')
    expect(f.motsCles).toEqual(expect.arrayContaining(['rotation', 'potager', 'famille', 'légumes', 'assolement']))
    for (const s of sentences(f.phrase)) expect(words(s)).toBeLessThanOrEqual(20)
    expect(visibleFeatures().map((x) => x.id)).toContain('rotation-potager')
  })
  it('on la trouve avec les mots d’un jardinier', () => {
    for (const q of ['rotation', 'potager', 'assolement', 'famille', 'légumes', 'rotations']) expect(searchFeatures(q).map((x) => x.id), q).toContain('rotation-potager')
  })
  it('run() ouvre l’écran sans état caché', () => {
    rotationOpen.set(false)
    f.run()
    expect(rotationOpen.get()).toBe(true)
    rotationOpen.set(false)
  })
})

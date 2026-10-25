import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { HELP, MODES_HELP } from './help'
import { computeProgress } from './progress'
import { CONSENT_TEXT } from './legal'
import { INVITE_TEXT, inviteMessage } from './invite'
import { PERMISSION_TEXT, SUPPORT_TEXT } from './neighbors/push'
import { FAIL_HELP, INITIAL_STEPS } from '../features/settings/createGarden'

// Point 30 du plan : phrases de 20 mots au plus dans les textes de l'interface (public novice et retraité).
export const MAX_WORDS = 20

/** Phrases d'un texte (coupe sur . ! ? suivis d'une espace ; « … » et les points de liste ne coupent pas). */
export function sentencesOf(text: string): string[] {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+(?=[A-ZÀ-ÖØ-Þ«“"'])/)
    .map((x) => x.trim())
    .filter(Boolean)
}
export const wordCount = (sentence: string) => sentence.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length
const tooLong = (text: string) => sentencesOf(text).filter((s) => wordCount(s) > MAX_WORDS)

const ROOT = join(__dirname, '..')

describe('longueur des phrases', () => {
  it('le compteur compte les mots, pas la ponctuation', () => {
    expect(wordCount('Touchez la carte à l’endroit où elle pousse.')).toBe(8)
    expect(sentencesOf('Une phrase. Une autre phrase ! Et « une citation. » ici ?')).toHaveLength(3)
    expect(tooLong('un deux trois quatre cinq six sept huit neuf dix onze douze treize quatorze quinze seize dix-sept dix-huit dix-neuf vingt vingt-et-un.')).toHaveLength(1)
  })

  it('aide : étapes et modes', () => {
    const texts = [
      ...Object.values(HELP).flatMap((h) => h.steps),
      MODES_HELP.intro,
      MODES_HELP.optional,
      ...MODES_HELP.modes.map((m) => m.text),
    ]
    expect(texts.flatMap(tooLong)).toEqual([])
  })

  it('jauge, premiers pas, création du jardin, autorisations', () => {
    const progress = computeProgress({ id: 'g', name: 'J', address: 'a', center: { lon: 0, lat: 0 }, createdAt: '2026-01-01' }, [], { speciesById: {} })
    const texts = [
      ...progress.steps.flatMap((s) => [s.label, s.hint]),
      ...Object.values(FAIL_HELP),
      ...INITIAL_STEPS.map((s) => s.label),
      ...CONSENT_TEXT.plantnet.paragraphes,
    ]
    expect(texts.flatMap(tooLong)).toEqual([])
  })

  it('alertes de nouveaux messages : autorisation, support, état du programme internet', () => {
    const texts = [...CONSENT_TEXT.notifications.paragraphes, ...Object.values(SUPPORT_TEXT), ...Object.values(PERMISSION_TEXT)]
    expect(texts.flatMap(tooLong)).toEqual([])
  })

  it('invitation et nouveautés', () => {
    const texts = [INVITE_TEXT, inviteMessage('shared'), inviteMessage('copied'), inviteMessage('manual')]
    expect(texts.flatMap(tooLong)).toEqual([])
  })

  it('écrans : tous les textes visibles des fichiers de l’interface', () => {
    const dirs = ['components', 'features/map', 'features/settings', 'features/legal', 'features/plants', 'features/neighbors', '.']
    // Icon.tsx : tracés SVG ; les trois autres fichiers appartiennent à l'agent du Catalogue.
    const skip = new Set(['CataloguePage.tsx', 'SpeciesSheet.tsx', 'MonthGrid.tsx', 'Icon.tsx'])
    const files = dirs.flatMap((d) =>
      readdirSync(join(ROOT, d))
        .filter((f) => f.endsWith('.tsx') && !skip.has(f) && !(d === '.' && f !== 'App.tsx'))
        .map((f) => join(ROOT, d, f)),
    )
    expect(files.length).toBeGreaterThan(20)
    const found: string[] = []
    for (const file of files) {
      const src = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
      const texts: string[] = []
      // Chaînes entre apostrophes, guillemets ou accents graves.
      for (const m of src.matchAll(/'((?:[^'\\\n]|\\.)+)'|"((?:[^"\\\n]|\\.)+)"|`((?:[^`\\]|\\.)+)`/g)) texts.push(m[1] ?? m[2] ?? m[3])
      // Texte entre balises JSX, sur une ou plusieurs lignes.
      for (const m of src.matchAll(/>([^<>{}]*[A-Za-zÀ-ÿ][^<>{}]*)</g)) texts.push(m[1])
      for (const t of texts) {
        const clean = t.replace(/\$\{[^}]*\}/g, ' x ')
        if (!/\s/.test(clean) || /^[\w./:@#-]+$/.test(clean) || /\bconst\b|=>|useState|\bfunction\b/.test(clean)) continue
        for (const s of tooLong(clean)) found.push(`${file.replace(ROOT, 'src')} : ${s}`)
      }
    }
    expect(found).toEqual([])
  })
})

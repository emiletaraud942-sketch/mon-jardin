import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { journalEntries } from '../../lib/journal'
import { applyToPlant, FEATURES } from '../../lib/features'
import { BeforeAfter, captionOf, optionLabels } from './BeforeAfter'
import { JournalList } from './PlantJournal'

const A = 'photo:aaa'
const B = 'photo:bbb'
const C = 'photo:ccc'
const TODAY = '2026-11-09'
const entries = journalEntries([A, B, C], { [A]: { at: '2026-03-09', note: 'Après la taille' }, [B]: { at: '2026-10-01' } })
const noop = () => undefined
const list = (over: Partial<Parameters<typeof JournalList>[0]> = {}) =>
  renderToStaticMarkup(createElement(JournalList, { entries, today: TODAY, onEdit: noop, onSave: noop, onRemove: noop, ...over }))
const compare = (e = entries) => renderToStaticMarkup(createElement(BeforeAfter, { entries: e, today: TODAY }))
const css = readFileSync(join(__dirname, '../../styles/journal.css'), 'utf8')

describe('frise du journal', () => {
  it('une entrée par photo : date en toutes lettres, « il y a », note ; « Date inconnue » à la fin', () => {
    const h = list()
    expect(h.match(/<li /g)).toHaveLength(3)
    expect(h.indexOf('1 octobre 2026')).toBeGreaterThan(-1)
    expect(h.indexOf('1 octobre 2026')).toBeLessThan(h.indexOf('9 mars 2026'))
    expect(h.indexOf('9 mars 2026')).toBeLessThan(h.indexOf('Date inconnue'))
    expect(h).toContain('il y a 8 mois')
    expect(h).toContain('il y a 1 mois')
    expect(h).toContain('Après la taille')
    expect(h).toContain('Photo ancienne : touchez « Modifier » pour ajouter sa date.')
  })

  it('chaque entrée a une vignette qui s’agrandit, Modifier et Supprimer nommés avec leur date', () => {
    const h = list()
    expect(h.match(/aria-label="Voir la photo en grand"|class="photo-thumb"/g)?.length).toBeGreaterThanOrEqual(3)
    expect(h).toContain('aria-label="Supprimer la photo du 9 mars 2026"')
    expect(h).toContain('aria-label="Modifier la date et la note de la photo du 9 mars 2026"')
    expect(h).toContain('aria-label="Supprimer la photo (date inconnue)"')
    expect(h.match(/>Supprimer</g)).toHaveLength(3)
  })

  it('une note est du texte, jamais du HTML', () => {
    const h = list({ entries: [{ id: A, at: '2026-03-09', note: '<img src=x onerror=alert(1)>' }] })
    expect(h).not.toContain('<img src=x')
    expect(h).toContain('&lt;img src=x onerror=alert(1)&gt;')
  })

  it('l’entrée en cours de modification montre une date (pas dans le futur) et une note de 140 signes', () => {
    const h = list({ editingId: A })
    expect(h).toContain('type="date"')
    expect(h).toContain(`max="${TODAY}"`)
    expect(h).toContain('value="2026-03-09"')
    expect(h).toContain('maxLength="140"')
    expect(h).toContain('value="Après la taille"')
    expect(h).toContain('Enregistrer</button>')
    expect(h).toContain('>Annuler<')
    // les autres entrées gardent leurs boutons
    expect(h.match(/>Modifier</g)).toHaveLength(2)
  })

  it('une date vide à la modification veut dire « date inconnue »', () => {
    const h = list({ editingId: C })
    expect(h).toContain('type="date"')
    expect(h).toContain('value=""')
  })
})

describe('avant / après', () => {
  it('rien à comparer avec une seule photo', () => {
    expect(compare([{ id: A, at: '2026-03-09' }])).toBe('')
    expect(compare([])).toBe('')
  })

  it('deux choix (la plus ancienne datée et la plus récente d’abord) et un curseur natif au clavier', () => {
    const h = compare()
    expect(h.match(/<select/g)).toHaveLength(2)
    expect(h.match(/<option/g)).toHaveLength(6)
    // avant = 9 mars 2026 (la plus ancienne datée), après = 1er octobre 2026
    expect(h).toMatch(/<option value="photo:aaa" selected="">9 mars 2026<\/option>/)
    expect(h).toMatch(/<option value="photo:bbb" selected="">1 octobre 2026<\/option>/)
    expect(h).toContain('type="range"')
    expect(h).toContain('min="0"')
    expect(h).toContain('max="100"')
    expect(h).toContain('step="1"')
    expect(h).toContain('value="50"')
    expect(h).toContain('aria-label="Curseur avant et après"')
    expect(h).toContain('aria-valuetext="Coupure à 50 % : avant à gauche, après à droite"')
    expect(h).toContain('style="left:50%"') // la coupure
  })

  it('les légendes disent le jour et le temps passé, l’écart dit les mois', () => {
    const h = compare()
    expect(h).toContain('<strong>Avant :</strong> 9 mars 2026 (il y a 8 mois)')
    expect(h).toContain('<strong>Après :</strong> 1 octobre 2026 (il y a 1 mois)')
    expect(h).toContain('6 mois entre les deux photos.')
    expect(captionOf({ id: A }, TODAY)).toBe('Date inconnue')
    expect(captionOf(undefined, TODAY)).toBe('')
  })

  it('deux photos du même jour sont numérotées dans les choix', () => {
    const two = journalEntries([A, B], { [A]: { at: '2026-03-09' }, [B]: { at: '2026-03-09' } })
    expect([...optionLabels(two).values()]).toEqual(['9 mars 2026 (photo 1)', '9 mars 2026 (photo 2)'])
    expect([...optionLabels(entries).values()]).toEqual(['1 octobre 2026', '9 mars 2026', 'Date inconnue'])
  })

  it('une photo sans date se compare aussi, en « avant »', () => {
    const h = compare(journalEntries([A, B], { [B]: { at: '2026-10-01' } }))
    expect(h).toContain('<strong>Avant :</strong> Date inconnue')
    expect(h).not.toContain('entre les deux photos')
  })
})

describe('feuille de style du journal', () => {
  it('couleurs par variables seulement, aucun --sun en texte', () => {
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(css).not.toMatch(/\brgba?\(/)
    expect(css).not.toMatch(/[^-]color:\s*var\(--sun\)/)
  })
  it('cibles tactiles : boutons et curseur suivent --tap (44 px, 56 px en Grandes touches)', () => {
    expect(css).toMatch(/\.compare-range\s*\{[^}]*height:\s*var\(--tap\)/)
    expect(css).toMatch(/\.journal-actions \.btn\.small\s*\{[^}]*min-height:\s*var\(--tap\)/)
    expect(css).toMatch(/\.journal-add \.photo-add\.journal-add-btn\s*\{[^}]*min-height:\s*var\(--tap\)/)
  })
  it('graisses par variables (pas de font-weight en nombre)', () => {
    expect(css).not.toMatch(/font-weight:\s*\d/)
  })
})

describe('registre : ouvrir le journal', () => {
  it('journal-jardin demande « Quelle plante ? » (plantChoice) puis ouvre la fiche à la section Journal', () => {
    expect(FEATURES.find((f) => f.id === 'journal-jardin')).toBeTruthy()
    expect(typeof applyToPlant).toBe('function')
    const src = readFileSync(join(__dirname, '../../lib/features.ts'), 'utf8')
    expect(src).toMatch(/journal: 'journal'/)
    expect(src).toMatch(/F\('journal-jardin'[^\n]*askPlant\('journal'\)/)
    const host = readFileSync(join(__dirname, '../aide/FeatureHost.tsx'), 'utf8')
    expect(host).toMatch(/journal: '[^']+'/)
  })
})

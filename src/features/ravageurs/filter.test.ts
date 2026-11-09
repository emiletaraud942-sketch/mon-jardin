import { describe, expect, it } from 'vitest'
import { ENNUIS } from '../../data/ravageurs'
import { SPECIES_BY_ID } from '../../data/species'
import { ennuiRank, ennuisForSpecies, filterEnnuis, GROUPS, monthsText, NO_FILTER, touchesMyPlants, type EnnuiFilter } from './filter'

const none = new Set<string>()
const ctx = (month = 6, ids: string[] = []) => ({ month, speciesIds: new Set(ids) })
const run = (f: Partial<EnnuiFilter>, c = ctx()) => filterEnnuis(ENNUIS, { ...NO_FILTER, ...f }, c)
const ids = (list: { id: string }[]) => list.map((e) => e.id)

describe('guide des ennuis : recherche', () => {
  it('sans filtre : toutes les fiches, dans l’ordre d’origine', () => {
    expect(ids(run({}))).toEqual(ids(ENNUIS))
    expect(run({ query: '   ' })).toHaveLength(ENNUIS.length)
  })

  it('un nom, un nom usuel, un pluriel, sans accent', () => {
    expect(ids(run({ query: 'puceron' }))[0]).toBe('puceron')
    expect(ids(run({ query: 'pucerons' }))[0]).toBe('puceron')
    expect(ids(run({ query: 'PUCERON VERT' }))[0]).toBe('puceron')
    expect(ids(run({ query: 'oidium' }))).toContain('oidium')
    expect(ids(run({ query: 'mildiou' }))[0]).toBe('mildiou')
  })

  it('un signe (symptôme) retrouve la fiche', () => {
    expect(ids(run({ query: 'feuilles collantes' }))).toContain('puceron')
    expect(ids(run({ query: 'feuille collante' }))).toContain('puceron')
    expect(ids(run({ query: 'trous dans les feuilles' }))).toContain('limace-escargot')
    expect(ids(run({ query: 'bave argentée' }))).toContain('limace-escargot')
    expect(ids(run({ query: 'bave argentee' }))).toContain('limace-escargot')
  })

  it('les mots d’un signe dans le désordre se retrouvent, en dernier', () => {
    const e = ENNUIS.find((x) => x.signesMots.some((m) => m.split(' ').length > 1))!
    const m = e.signesMots.find((x) => x.split(' ').length > 1)!
    const reversed = m.split(' ').reverse().join(' ')
    expect(ids(run({ query: reversed }))).toContain(e.id)
    expect(ennuiRank(e, 'zzzzzz')).toBe(99)
  })

  it('une requête sans rapport ne trouve rien', () => {
    expect(run({ query: 'xylophone' })).toEqual([])
  })

  it('un nom exact passe avant un symptôme', () => {
    const list = run({ query: 'limaces' })
    expect(list[0].id).toBe('limace-escargot')
  })
})

describe('guide des ennuis : filtres', () => {
  it('chaque pastille garde ses types ; plusieurs pastilles = union', () => {
    for (const g of GROUPS) {
      const list = run({ groups: [g.id] })
      expect(list.length, g.id).toBeGreaterThan(0)
      for (const e of list) expect(g.types, e.id).toContain(e.type)
    }
    const a = run({ groups: ['insectes'] }).length
    const b = run({ groups: ['champignons'] }).length
    expect(run({ groups: ['insectes', 'champignons'] })).toHaveLength(a + b)
    expect(run({ groups: ['animaux'] }).some((e) => e.type === 'mollusque')).toBe(true)
    expect(run({ groups: ['animaux'] }).some((e) => e.type === 'animal')).toBe(true)
  })

  it('« ce mois-ci » : seulement les fiches visibles ce mois', () => {
    for (const month of [1, 6, 11]) {
      const list = run({ thisMonth: true }, ctx(month))
      for (const e of list) expect(e.mois, e.id).toContain(month)
    }
    expect(run({ thisMonth: true }, ctx(7)).length).toBeGreaterThan(run({ thisMonth: true }, ctx(1)).length)
  })

  it('« mes plantes » : planteIds ∩ plantes du jardin', () => {
    const list = run({ mine: true }, ctx(6, ['rosier']))
    expect(list.length).toBeGreaterThan(0)
    for (const e of list) expect(e.planteIds, e.id).toContain('rosier')
    expect(ids(list)).toContain('oidium')
    expect(touchesMyPlants(ENNUIS[0], none)).toBe(false)
  })

  it('« mes plantes » sans aucune plante : sans effet', () => {
    expect(run({ mine: true }, ctx(6, []))).toHaveLength(ENNUIS.length)
  })

  it('les critères se combinent', () => {
    const list = run({ query: 'taches', groups: ['champignons'], mine: true }, ctx(6, ['rosier']))
    expect(list.length).toBeGreaterThan(0)
    for (const e of list) {
      expect(e.type).toBe('champignon')
      expect(e.planteIds).toContain('rosier')
    }
  })

  it('les ennuis d’une espèce', () => {
    expect(ids(ennuisForSpecies(ENNUIS, 'pommier'))).toContain('carpocapse')
    expect(ennuisForSpecies(ENNUIS, 'inconnue')).toEqual([])
    expect(SPECIES_BY_ID.tomate).toBeDefined()
    for (const e of ennuisForSpecies(ENNUIS, 'tomate')) expect(e.planteIds).toContain('tomate')
  })
})

describe('guide des ennuis : mois en toutes lettres', () => {
  it('une plage, avec « d’ » devant une voyelle', () => {
    expect(monthsText([4, 5, 6, 7, 8, 9])).toBe('d’avril à septembre')
    expect(monthsText([3, 4, 5])).toBe('de mars à mai')
    expect(monthsText([8, 9, 10])).toBe('d’août à octobre')
  })
  it('un seul mois, toute l’année, passage de Noël', () => {
    expect(monthsText([5])).toBe('en mai')
    expect(monthsText([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])).toBe('toute l’année')
    expect(monthsText([11, 12, 1, 2])).toBe('de novembre à février')
  })
  it('des mois séparés : la liste', () => {
    expect(monthsText([3, 4, 9, 10])).toBe('mars, avril, septembre et octobre')
    expect(monthsText([2, 6])).toBe('février et juin')
    expect(monthsText([])).toBe('')
  })
  it('chaque fiche donne un texte non vide', () => {
    for (const e of ENNUIS) expect(monthsText(e.mois), e.id).not.toBe('')
  })
})

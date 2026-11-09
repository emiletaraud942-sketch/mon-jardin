import { describe, expect, it } from 'vitest'
import { CONSEILS } from '../../data/conseils'
import { conseilRank, countByTheme, filterConseils, NO_FILTER, servesMonth, type ConseilFilter } from './filter'

const run = (f: Partial<ConseilFilter>, month = 6) => filterConseils(CONSEILS, { ...NO_FILTER, ...f }, { month })
const ids = (list: { id: string }[]) => list.map((c) => c.id)

describe('conseils : recherche', () => {
  it('sans filtre : toutes les fiches, dans l’ordre d’origine', () => {
    expect(ids(run({}))).toEqual(ids(CONSEILS))
    expect(run({ query: '   ' })).toHaveLength(CONSEILS.length)
  })

  it('un mot-clé, un pluriel, une majuscule, sans accent', () => {
    expect(ids(run({ query: 'paillage' }))).toContain('eau-pailler')
    expect(ids(run({ query: 'PAILLAGE' }))).toContain('eau-pailler')
    expect(ids(run({ query: 'epluchures' }))).toContain('compost-quoi-mettre')
    expect(ids(run({ query: 'épluchure' }))).toContain('compost-quoi-mettre')
    expect(ids(run({ query: 'copeaux' }))).toContain('eau-pailler')
  })

  it('un titre exact passe avant un simple mot-clé', () => {
    const c = CONSEILS[0]
    expect(ids(run({ query: c.titre }))[0]).toBe(c.id)
    expect(conseilRank(c, c.titre)).toBe(0)
  })

  it('les mots d’un titre dans le désordre se retrouvent, en dernier', () => {
    const c = CONSEILS.find((x) => x.titre.split(' ').filter((w) => w.length > 3).length >= 2)!
    const w = c.titre.split(' ').filter((x) => x.length > 3).slice(0, 2).reverse().join(' ')
    expect(ids(run({ query: w }))).toContain(c.id)
    expect(conseilRank(c, 'zzzzzz')).toBe(99)
  })

  it('un mot sans rapport ne trouve rien', () => {
    expect(run({ query: 'xylophone' })).toEqual([])
  })
})

describe('conseils : thèmes et mois', () => {
  it('une pastille de thème garde ce thème, deux pastilles les additionnent', () => {
    const compost = run({ themes: ['compost'] })
    expect(compost.length).toBe(8)
    expect(compost.every((c) => c.theme === 'compost')).toBe(true)
    expect(run({ themes: ['eau'] }).every((c) => c.theme === 'eau')).toBe(true)
    expect(run({ themes: ['compost', 'eau'] })).toHaveLength(CONSEILS.length)
  })

  it('la recherche et le thème se combinent', () => {
    expect(ids(run({ query: 'paillage', themes: ['compost'] }))).not.toContain('eau-pailler')
    expect(ids(run({ query: 'paillage', themes: ['eau'] }))).toContain('eau-pailler')
  })

  it('« ce mois-ci » : les fiches sans mois restent toujours visibles', () => {
    const sans = CONSEILS.filter((c) => !c.mois || c.mois.length === 0)
    expect(sans.length).toBeGreaterThan(0)
    for (let m = 1; m <= 12; m++) {
      const shown = ids(run({ thisMonth: true }, m))
      for (const c of sans) expect(shown, `${c.id} en mois ${m}`).toContain(c.id)
      for (const c of CONSEILS.filter((x) => x.mois && x.mois.length > 0)) expect(shown.includes(c.id), `${c.id} en mois ${m}`).toBe(c.mois!.includes(m))
    }
  })

  it('servesMonth : sans mois, toute l’année', () => {
    const c = CONSEILS.find((x) => x.id === 'eau-canicule')!
    expect(servesMonth(c, 7)).toBe(true)
    expect(servesMonth(c, 1)).toBe(false)
    expect(servesMonth({ ...c, mois: undefined }, 1)).toBe(true)
  })

  it('le mois en plein hiver garde moins de fiches qu’en été', () => {
    expect(run({ thisMonth: true }, 1).length).toBeLessThan(run({ thisMonth: true }, 7).length)
  })

  it('countByTheme compte 8 et 10', () => {
    expect(countByTheme(CONSEILS)).toEqual({ compost: 8, eau: 10 })
  })
})

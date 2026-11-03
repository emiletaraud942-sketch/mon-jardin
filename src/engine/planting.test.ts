import { describe, expect, it } from 'vitest'
import type { Garden, Plant, Species, XY } from '../types'
import { companionReport, legalDistance, recommendSpecies, scoreSpecies, sunCategory, winterMinC, type SpotContext } from './planting'

const parcel: XY[] = [
  { x: -10, y: -10 },
  { x: 10, y: -10 },
  { x: 10, y: 10 },
  { x: -10, y: 10 },
]

const garden = (extra: Partial<Garden> = {}): Garden => ({
  id: 'g1',
  name: 'Test',
  address: '',
  center: { lat: 48.85, lon: 2.35 },
  parcel,
  createdAt: '2026-01-01',
  ...extra,
})

const base: Omit<Species, 'id' | 'nomCommun'> = {
  nomLatin: '',
  famille: 'Test',
  categorie: 'legume',
  strate: 'herbacee',
  vivace: false,
  comestible: true,
  soleil: ['plein-soleil'],
  eau: 'moyen',
  rusticiteC: 0,
  hauteurAdulteM: 1,
  envergureAdulteM: 0.5,
  anneesMaturite: 1,
  espacementCm: 50,
  compagnons: [],
  antagonistes: [],
  taches: [],
  entretien: '',
  couleur: '#4a4',
}

const tomate: Species = {
  ...base,
  id: 'tomate',
  nomCommun: 'Tomate',
  famille: 'Solanaceae',
  rusticiteC: 2,
  eau: 'eleve',
  espacementCm: 60,
  compagnons: ['basilic'],
  antagonistes: ['fenouil'],
  solPrefere: ['limoneux', 'humifere'],
  plantation: [5],
}
const basilic: Species = { ...base, id: 'basilic', nomCommun: 'Basilic', categorie: 'aromatique', espacementCm: 25, compagnons: ['tomate'] }
const fenouil: Species = { ...base, id: 'fenouil', nomCommun: 'Fenouil', espacementCm: 30 }
const feve: Species = { ...base, id: 'feve', nomCommun: 'Fève', famille: 'Fabaceae', fixateurAzote: true, rusticiteC: -5, espacementCm: 20 }
const pommier: Species = {
  ...base,
  id: 'pommier',
  nomCommun: 'Pommier',
  categorie: 'fruitier',
  strate: 'arbre-bas',
  vivace: true,
  rusticiteC: -25,
  hauteurAdulteM: 5,
  envergureAdulteM: 4,
  anneesMaturite: 8,
  espacementCm: 500,
}
const citronnier: Species = { ...pommier, id: 'citronnier', nomCommun: 'Citronnier', rusticiteC: -3, hauteurAdulteM: 3 }
const hosta: Species = { ...base, id: 'hosta', nomCommun: 'Hosta', categorie: 'fleur', vivace: true, soleil: ['ombre', 'mi-ombre'], rusticiteC: -25 }

const speciesById = Object.fromEntries([tomate, basilic, fenouil, feve, pommier, citronnier, hosta].map((s) => [s.id, s]))

let n = 0
const plant = (speciesId: string, x: number, y: number, status: Plant['status'] = 'en-place'): Plant => ({
  id: `p${++n}`,
  gardenId: 'g1',
  speciesId,
  position: { x, y },
  plantedAt: '2024-03-01',
  status,
  photos: [],
})

const ctx = (extra: Partial<SpotContext> = {}): SpotContext => ({
  garden: garden(),
  plants: [],
  speciesById,
  spot: { x: 0, y: 0 },
  sunHours: 8,
  today: new Date(2026, 9, 17),
  ...extra,
})

const pointsOf = (factors: { label: string; points: number }[], re: RegExp) =>
  factors.filter((f) => re.test(f.label)).reduce((s, f) => s + f.points, 0)

describe('sunCategory', () => {
  it('seuils 6 h et 3 h', () => {
    expect(sunCategory(6)).toBe('plein-soleil')
    expect(sunCategory(5.9)).toBe('mi-ombre')
    expect(sunCategory(3)).toBe('mi-ombre')
    expect(sunCategory(2.9)).toBe('ombre')
  })
})

describe('legalDistance (art. 671)', () => {
  it('arbre de plus de 2 m à 1 m de la limite : non conforme', () => {
    const r = legalDistance(pommier, { x: 9, y: 0 }, parcel)
    expect(r.requiredM).toBe(2)
    expect(r.actualM).toBeCloseTo(1, 6)
    expect(r.ok).toBe(false)
    expect(r.message).toContain('671')
    expect(r.message).toMatch(/usages locaux/i)
  })

  it('plante basse à 1 m de la limite : conforme (0,5 m)', () => {
    const r = legalDistance(tomate, { x: 9, y: 0 }, parcel)
    expect(r.requiredM).toBe(0.5)
    expect(r.ok).toBe(true)
  })

  it('le message rappelle que la voirie n’est pas une limite séparative', () => {
    const r = legalDistance(pommier, { x: 9, y: 0 }, parcel)
    expect(r.ok).toBe(false)
    expect(r.message).toMatch(/voirie/i)
  })

  it('hors parcelle ou parcelle inconnue', () => {
    expect(legalDistance(tomate, { x: 20, y: 0 }, parcel).ok).toBe(false)
    const r = legalDistance(pommier, { x: 0, y: 0 })
    expect(r.ok).toBe(true)
    expect(r.actualM).toBeUndefined()
  })
})

describe('scoreSpecies', () => {
  it('soleil : forte influence', () => {
    const sunny = scoreSpecies(tomate, ctx({ sunHours: 8 }))
    const shady = scoreSpecies(tomate, ctx({ sunHours: 1.5 }))
    expect(sunny.score - shady.score).toBeGreaterThanOrEqual(50)
    expect(shady.warnings.join(' ')).toMatch(/ombragé/)
    expect(scoreSpecies(hosta, ctx({ sunHours: 2 })).score).toBeGreaterThan(scoreSpecies(hosta, ctx({ sunHours: 9 })).score)
  })

  it('compagnons (+) et antagonistes (−) à moins de 3 m', () => {
    const avecBasilic = scoreSpecies(tomate, ctx({ plants: [plant('basilic', 1, 0)] }))
    const avecFenouil = scoreSpecies(tomate, ctx({ plants: [plant('fenouil', 1, 0)] }))
    const loin = scoreSpecies(tomate, ctx({ plants: [plant('fenouil', 5, 0)] }))
    expect(pointsOf(avecBasilic.factors, /Compagnons/)).toBeGreaterThan(0)
    expect(pointsOf(avecFenouil.factors, /Mauvais voisins/)).toBeLessThan(0)
    expect(avecFenouil.warnings.join(' ')).toMatch(/fenouil/)
    expect(avecBasilic.score).toBeGreaterThan(loin.score)
    expect(loin.score).toBeGreaterThan(avecFenouil.score)
  })

  it('espacement trop faible avec une plante existante', () => {
    const serre = scoreSpecies(tomate, ctx({ plants: [plant('tomate', 0.2, 0)] }))
    expect(pointsOf(serre.factors, /Espacement/)).toBeLessThan(0)
    expect(serre.warnings.join(' ')).toMatch(/Trop près/)
    // Strates différentes : une aromatique sous un pommier n'est pas pénalisée à 1,5 m.
    const sous = scoreSpecies(basilic, ctx({ plants: [plant('pommier', 1.5, 0)] }))
    expect(pointsOf(sous.factors, /Espacement/)).toBe(0)
    // Deux arbres trop proches : pénalité.
    const arbres = scoreSpecies(pommier, ctx({ plants: [plant('pommier', 2, 0)] }))
    expect(pointsOf(arbres.factors, /Espacement/)).toBeLessThan(0)
  })

  it('distance légale : avertissement et malus, jamais bloquant (la limite peut être la voirie)', () => {
    const pres = scoreSpecies(pommier, ctx({ spot: { x: 9, y: 0 } }))
    const centre = scoreSpecies(pommier, ctx({ spot: { x: 0, y: 0 } }))
    expect(pres.blocking).toBe(false)
    expect(pres.warnings.join(' ')).toContain('671')
    expect(pointsOf(pres.factors, /limite/)).toBeLessThan(0)
    expect(pres.score).toBeLessThan(centre.score)
    expect(centre.warnings.join(' ')).not.toContain('671')
    expect(scoreSpecies(tomate, ctx({ spot: { x: 9, y: 0 } })).blocking).toBe(false)
    // Emplacement hors parcelle : même traitement.
    expect(scoreSpecies(tomate, ctx({ spot: { x: 20, y: 0 } })).blocking).toBe(false)
  })

  it('fixateur d’azote à proximité : bonus pour une gourmande', () => {
    const r = scoreSpecies(tomate, ctx({ plants: [plant('feve', 2, 0)] }))
    expect(pointsOf(r.factors, /azote/)).toBeGreaterThan(0)
    expect(pointsOf(scoreSpecies(basilic, ctx({ plants: [plant('feve', 2, 0)] })).factors, /azote/)).toBe(0)
  })

  it('sol, pente, rusticité, saison', () => {
    expect(pointsOf(scoreSpecies(tomate, ctx({ garden: garden({ sol: 'limoneux' }) })).factors, /^Sol/)).toBeGreaterThan(0)
    expect(pointsOf(scoreSpecies(tomate, ctx({ garden: garden({ sol: 'argileux' }) })).factors, /^Sol/)).toBeLessThan(0)
    expect(pointsOf(scoreSpecies(tomate, ctx({ slopePct: 25 })).factors, /Pente/)).toBeLessThan(0)
    expect(pointsOf(scoreSpecies(pommier, ctx({ slopePct: 25 })).factors, /Pente/)).toBe(0)
    // Rusticité ignorée sans date de gelée, pénalisée dans un climat froid.
    expect(pointsOf(scoreSpecies(citronnier, ctx()).factors, /Rusticité/)).toBe(0)
    expect(pointsOf(scoreSpecies(citronnier, ctx({ garden: garden({ lastFrostDoy: 115 }) })).factors, /Rusticité/)).toBeLessThan(0)
    expect(pointsOf(scoreSpecies(pommier, ctx({ garden: garden({ lastFrostDoy: 115 }) })).factors, /Rustique/)).toBeGreaterThan(0)
    // Saison : plantation de tomates en mai.
    expect(pointsOf(scoreSpecies(tomate, ctx({ today: new Date(2026, 4, 10) })).factors, /moment/)).toBeGreaterThan(0)
    expect(pointsOf(scoreSpecies(tomate, ctx({ today: new Date(2026, 10, 10) })).factors, /moment/)).toBe(0)
  })

  it('score borné entre 0 et 100', () => {
    const r = scoreSpecies(tomate, ctx({ sunHours: 0, plants: [plant('fenouil', 0.1, 0), plant('fenouil', 0.2, 0), plant('fenouil', 0.3, 0)], slopePct: 40 }))
    expect(r.score).toBeGreaterThanOrEqual(0)
    expect(r.score).toBeLessThanOrEqual(100)
  })
})

describe('recommendSpecies', () => {
  it('trie par score, filtre les catégories, garde les espèces près de la limite (avec avertissement)', () => {
    const all = [tomate, basilic, fenouil, pommier, hosta]
    const r = recommendSpecies(all, ctx({ spot: { x: 9, y: 0 }, sunHours: 8 }))
    const pom = r.find((x) => x.species.id === 'pommier')!
    expect(pom).toBeDefined()
    expect(pom.warnings.join(' ')).toContain('671')
    expect(r[r.length - 1].species.id).toBe('hosta') // demande de l'ombre
    for (let i = 1; i < r.length; i++) expect(r[i - 1].score).toBeGreaterThanOrEqual(r[i].score)
    const fleurs = recommendSpecies(all, ctx(), { categories: ['fleur'] })
    expect(fleurs.map((x) => x.species.id)).toEqual(['hosta'])
    expect(recommendSpecies(all, ctx(), { limit: 2 })).toHaveLength(2)
  })
})

describe('companionReport', () => {
  it('amis et ennemis dans le rayon', () => {
    const t = plant('tomate', 0, 0)
    const b = plant('basilic', 1, 1)
    const f = plant('fenouil', -2, 0)
    const loin = plant('basilic', 8, 0)
    const mort = plant('basilic', 0.5, 0, 'mort')
    const r = companionReport(t, [t, b, f, loin, mort], speciesById)
    expect(r.amis.map((p) => p.id)).toEqual([b.id])
    expect(r.ennemis.map((p) => p.id)).toEqual([f.id])
  })
})

describe('art. 671 et 672 : texte et ordre', () => {
  it('les règlements et usages locaux passent avant les 2 m / 0,5 m, qui valent « à défaut »', () => {
    const r = legalDistance(pommier, { x: 9, y: 0 }, parcel).message
    const iUsages = r.search(/règlements particuliers et les usages locaux constants et reconnus/)
    const iDefaut = r.indexOf('à défaut')
    const iDeux = r.indexOf('2 m de la limite')
    expect(iUsages).toBeGreaterThanOrEqual(0)
    expect(iDefaut).toBeGreaterThan(iUsages)
    expect(iDeux).toBeGreaterThan(iDefaut)
    expect(legalDistance(tomate, { x: 9.9, y: 0 }, parcel).message).toMatch(/à défaut, une plantation de 2 m de haut ou moins .* 0,5 m/)
  })

  it('rappelle la mairie, les espaliers (crête du mur), la voirie et l’art. 672, sans prétendre être un avis juridique', () => {
    for (const r of [legalDistance(pommier, { x: 9, y: 0 }, parcel), legalDistance(pommier, { x: 0, y: 0 }, parcel), legalDistance(pommier, { x: 0, y: 0 })]) {
      expect(r.message).toMatch(/auprès de votre mairie/)
      expect(r.message).toMatch(/espalier.*crête du mur/)
      expect(r.message).toMatch(/voirie/)
      expect(r.message).toMatch(/672.*arrachage ou la réduction.*titre, destination du père de famille ou prescription de 30 ans/)
      expect(r.message).toMatch(/arbre mort ne se remplace qu’en respectant la distance/)
      expect(r.message).toMatch(/pas un conseil juridique/)
    }
  })

  it('reste non bloquant : le malus de limite ne bloque jamais', () => {
    expect(scoreSpecies(pommier, ctx({ spot: { x: 9.5, y: 0 } })).blocking).toBe(false)
  })
})

describe('rusticité : climat enregistré ou estimation', () => {
  const froid = (extra: Partial<Garden>) => garden(extra)
  it('utilise la minimale observée du climat quand elle est présente', () => {
    const r = scoreSpecies(citronnier, ctx({ garden: froid({ climate: { minAbsC: -12 } }) }))
    expect(pointsOf(r.factors, /Rusticité/)).toBeLessThan(0)
    expect(r.factors.find((f) => /Rusticité/.test(f.label))!.label).toMatch(/observés/)
    // Sans date de gelée : le climat suffit.
    expect(garden({ climate: { minAbsC: -12 } }).lastFrostDoy).toBeUndefined()
  })

  it('le climat prime sur l’estimation par les gelées', () => {
    // Gelées tardives (estimation très froide) mais minimale observée douce (-1 °C) : citronnier (-3 °C) non pénalisé.
    const doux = scoreSpecies(citronnier, ctx({ garden: froid({ lastFrostDoy: 130, climate: { minAbsC: -1 } }) }))
    expect(pointsOf(doux.factors, /Rusticité/)).not.toBeLessThan(0)
    // Repli : sans climat, l'estimation s'applique encore.
    const repli = scoreSpecies(citronnier, ctx({ garden: froid({ lastFrostDoy: 130 }) }))
    expect(repli.factors.find((f) => /Rusticité/.test(f.label))!.label).toMatch(/estimés/)
    expect(winterMinC(froid({}))).toBeUndefined()
    expect(winterMinC(froid({ climate: { zone: '8a' } }))).toBeUndefined() // zone seule : pas de minimale
  })

  it('une plante récoltée ne compte plus comme voisine', () => {
    const avec = scoreSpecies(tomate, ctx({ plants: [plant('tomate', 0.2, 0, 'recoltee')] }))
    expect(pointsOf(avec.factors, /Espacement/)).toBe(0)
  })
})

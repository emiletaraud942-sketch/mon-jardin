import { describe, expect, it } from 'vitest'
import type { Plant, Species } from '../types'
import { SPECIES } from '../data/species'
import { fitMeasurements, growthCurve01, plantAgeYears, plantSizeAt, plantStateAt } from './growth'

const plant = (extra: Partial<Plant> = {}): Plant => ({
  id: 'p1',
  gardenId: 'g1',
  speciesId: 'x',
  position: { x: 0, y: 0 },
  plantedAt: '2020-03-01',
  status: 'en-place',
  photos: [],
  ...extra,
})

const species = (extra: Partial<Species> = {}): Species => ({
  id: 'x',
  nomCommun: 'X',
  nomLatin: '',
  famille: 'Test',
  categorie: 'arbre',
  strate: 'canopee',
  vivace: true,
  comestible: false,
  soleil: ['plein-soleil'],
  eau: 'moyen',
  rusticiteC: -15,
  hauteurAdulteM: 10,
  envergureAdulteM: 6,
  anneesMaturite: 10,
  espacementCm: 500,
  compagnons: [],
  antagonistes: [],
  taches: [],
  entretien: '',
  couleur: '#4a4',
  ...extra,
})

describe('plantAgeYears', () => {
  it('âge décimal depuis la plantation', () => {
    expect(plantAgeYears(plant(), new Date('2026-03-01'))).toBeCloseTo(6, 1)
    expect(plantAgeYears(plant({ plantedAt: '2026-01-01' }), new Date('2026-07-02'))).toBeCloseTo(0.5, 1)
  })

  it('ageAtPlanting s’ajoute (arbre acheté en pot)', () => {
    const p = plant({ plantedAt: '2026-03-01', ageAtPlanting: 3 })
    expect(plantAgeYears(p, new Date('2027-03-01'))).toBeCloseTo(4, 1)
    expect(plantAgeYears(p, new Date('2026-03-01'))).toBeCloseTo(3, 5)
  })

  it('plantation dans le futur : jamais négatif', () => {
    expect(plantAgeYears(plant({ plantedAt: '2030-01-01' }), new Date('2026-03-01'))).toBe(0)
  })

  it('date invalide : 0 an, jamais NaN', () => {
    expect(plantAgeYears(plant({ plantedAt: 'pas-une-date' }), new Date('2026-03-01'))).toBe(0)
    expect(plantAgeYears(plant({ plantedAt: '' }), new Date('2026-03-01'))).toBe(0)
    expect(plantAgeYears(plant({ plantedAt: 'nope', ageAtPlanting: 5 }), new Date('2026-03-01'))).toBe(0)
    expect(plantAgeYears(plant(), new Date('invalide'))).toBe(0)
  })
})

describe('plantSizeAt', () => {
  const sp = species()
  const at = (years: number, p = plant()) => plantSizeAt(p, sp, new Date(new Date(p.plantedAt).getTime() + years * 365.25 * 86400000))

  it('démarre à ~12 % de la taille adulte', () => {
    const s = at(0)
    expect(s.heightM).toBeCloseTo(1.2, 1)
    expect(s.spreadM).toBeCloseTo(0.72, 1)
  })

  it('courbe en S : croissante, bornée par la taille adulte', () => {
    let prev = 0
    for (let y = 0; y <= 25; y += 1) {
      const { heightM, spreadM } = at(y)
      expect(heightM).toBeGreaterThanOrEqual(prev)
      expect(heightM).toBeLessThanOrEqual(sp.hauteurAdulteM + 1e-9)
      expect(spreadM).toBeLessThanOrEqual(sp.envergureAdulteM + 1e-9)
      prev = heightM
    }
    expect(at(10).heightM).toBeGreaterThan(9.3) // ≈ 95 % à la maturité
    expect(at(25).heightM).toBeCloseTo(10, 5) // pas de dépassement
  })

  it('la pousse est lente au début et à la fin, rapide au milieu', () => {
    const growth = (a: number, b: number) => at(b).heightM - at(a).heightM
    expect(growth(4, 6)).toBeGreaterThan(growth(0, 2))
    expect(growth(4, 6)).toBeGreaterThan(growth(8, 10))
  })

  it('annuelle : adulte en ~4 mois ; vivace : bien plus lent', () => {
    const annuelle = species({ vivace: false, anneesMaturite: 1, hauteurAdulteM: 1, envergureAdulteM: 0.5 })
    const p = plant({ plantedAt: '2026-05-01' })
    const fourMonths = new Date('2026-09-05')
    expect(plantSizeAt(p, annuelle, fourMonths).heightM).toBeCloseTo(1, 1)
    const vivace = species({ vivace: true, anneesMaturite: 5, hauteurAdulteM: 1, envergureAdulteM: 0.5 })
    expect(plantSizeAt(p, vivace, fourMonths).heightM).toBeLessThan(0.3)
  })

  it('ageAtPlanting : un arbre acheté de 8 ans est déjà grand', () => {
    const jeune = plantSizeAt(plant({ plantedAt: '2026-03-01' }), sp, new Date('2026-03-02'))
    const achete = plantSizeAt(plant({ plantedAt: '2026-03-01', ageAtPlanting: 8 }), sp, new Date('2026-03-02'))
    expect(achete.heightM).toBeGreaterThan(jeune.heightM * 3)
  })

  it('date invalide ou maturité absurde : valeurs finies', () => {
    const bad = plantSizeAt(plant({ plantedAt: 'nope' }), sp, new Date('2026-03-01'))
    expect(Number.isFinite(bad.heightM)).toBe(true)
    expect(Number.isFinite(bad.spreadM)).toBe(true)
    expect(bad.heightM).toBeCloseTo(1.2, 1)
    const nan = plantSizeAt(plant(), species({ anneesMaturite: Number.NaN }), new Date('2026-03-01'))
    expect(Number.isFinite(nan.heightM)).toBe(true)
  })
})

describe('growthCurve01', () => {
  it('0 au départ, ≈ 0,95 à la maturité, ~1 ensuite, monotone', () => {
    expect(growthCurve01(0, 10)).toBe(0)
    expect(growthCurve01(10, 10)).toBeGreaterThan(0.92)
    expect(growthCurve01(10, 10)).toBeLessThan(0.98)
    expect(growthCurve01(40, 10)).toBe(1)
    let prev = -1
    for (let a = 0; a <= 30; a += 0.25) {
      const v = growthCurve01(a, 10)
      expect(v).toBeGreaterThanOrEqual(prev)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(1)
      prev = v
    }
  })
  it('entrées absurdes : jamais NaN', () => {
    for (const [a, m] of [[Number.NaN, 5], [3, Number.NaN], [-4, 5], [3, 0], [3, -2], [Infinity, 5]]) {
      const v = growthCurve01(a, m)
      expect(Number.isFinite(v)).toBe(true)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(1)
    }
  })
})

describe('plantStateAt', () => {
  const tree = species({ id: 'pommier', categorie: 'fruitier', strate: 'arbre-bas', recolte: [9, 10], hauteurAdulteM: 5, envergureAdulteM: 4, anneesMaturite: 8 })
  const old = plant({ plantedAt: '2000-03-01' })
  const state = (d: string, p = old, sp: Species | undefined = tree) => plantStateAt(p, sp, new Date(d + 'T12:00:00'))

  it('caduc : nu en hiver, bourgeons au printemps, feuillé en été, teinte en octobre-novembre', () => {
    expect(state('2026-01-15').leafCover).toBe(0)
    expect(state('2026-01-15').autumnTint).toBe(0)
    const bud = state('2026-04-10').leafCover
    expect(bud).toBeGreaterThan(0)
    expect(bud).toBeLessThan(0.6)
    expect(state('2026-07-15').leafCover).toBe(1)
    expect(state('2026-10-25').autumnTint).toBeGreaterThan(0.7)
    expect(state('2026-12-20').leafCover).toBe(0)
    expect(state('2026-07-15').autumnTint).toBe(0)
  })

  it('persistant : feuillage toute l’année, pas de teinte', () => {
    const olivier = species({ id: 'olivier', categorie: 'fruitier', strate: 'arbre-bas' })
    const feuillage = species({ id: 'autre', fonctions: ['feuillage persistant'] })
    for (const sp of [olivier, feuillage]) {
      expect(state('2026-01-15', old, sp).leafCover).toBeGreaterThanOrEqual(0.9)
      expect(state('2026-07-15', old, sp).leafCover).toBe(1)
      expect(state('2026-10-25', old, sp).autumnTint).toBe(0)
    }
  })

  it('floraison au printemps et fruits en saison de récolte pour un arbre adulte', () => {
    expect(state('2026-04-20').flowering).toBeGreaterThan(0.5)
    expect(state('2026-01-20').flowering).toBe(0)
    expect(state('2026-09-20').fruiting).toBe(1)
    expect(state('2026-02-20').fruiting).toBe(0)
    expect(state('2026-08-01').fruiting).toBeGreaterThan(0)
    expect(state('2026-08-01').fruiting).toBeLessThan(1)
  })

  it('un jeune arbre ne fleurit ni ne fructifie encore', () => {
    const jeune = plant({ plantedAt: '2026-03-01' })
    expect(state('2026-04-25', jeune).flowering).toBe(0)
    expect(state('2026-09-20', jeune).fruiting).toBe(0)
    expect(state('2026-04-25', jeune).stage).not.toBe('mature')
  })

  it('stades selon l’âge', () => {
    expect(state('2026-03-02', plant({ plantedAt: '2026-03-01' })).stage).toBe('semis')
    expect(state('2027-03-01', plant({ plantedAt: '2026-03-01' })).stage).toBe('jeune')
    expect(state('2030-03-01', plant({ plantedAt: '2026-03-01' })).stage).toBe('croissance')
    expect(state('2040-03-01', plant({ plantedAt: '2026-03-01' })).stage).toBe('mature')
    expect(state('2100-03-01', plant({ plantedAt: '2026-03-01' })).stage).toBe('ancien')
  })

  it('taille : monotone jusqu’à maturité, bornée par la taille adulte', () => {
    let prev = 0
    for (let y = 0; y <= 20; y++) {
      const s = state(`${2026 + y}-07-01`, plant({ plantedAt: '2026-07-01' }))
      expect(s.heightM).toBeGreaterThanOrEqual(prev)
      expect(s.heightM).toBeLessThanOrEqual(tree.hauteurAdulteM + 1e-9)
      expect(s.spreadM).toBeLessThanOrEqual(tree.envergureAdulteM + 1e-9)
      prev = s.heightM
    }
  })

  it('annuelle : cycle semis, récolte, fin de saison', () => {
    const tomate = species({ id: 'tomate', categorie: 'legume', strate: 'herbacee', vivace: false, anneesMaturite: 1, hauteurAdulteM: 1.5, envergureAdulteM: 0.6, recolte: [7, 8, 9] })
    const p = plant({ plantedAt: '2026-05-01' })
    const jeune = state('2026-05-10', p, tomate)
    expect(jeune.stage).toBe('semis')
    expect(jeune.fruiting).toBe(0)
    const ete = state('2026-08-15', p, tomate)
    expect(ete.heightM).toBeGreaterThan(1.3)
    expect(ete.fruiting).toBe(1)
    expect(ete.leafCover).toBeGreaterThan(0.8)
    const fin = state('2026-12-15', p, tomate)
    expect(fin.leafCover).toBeLessThan(0.2)
    expect(fin.fruiting).toBe(0)
    expect(fin.stage).toBe('ancien')
  })

  it('vivace herbacée : touffe réduite en hiver mais jamais nulle', () => {
    const herbe = species({ id: 'achillee', categorie: 'fleur', strate: 'herbacee', anneesMaturite: 2, hauteurAdulteM: 0.8, envergureAdulteM: 0.5 })
    expect(state('2026-01-15', old, herbe).leafCover).toBeGreaterThan(0)
    expect(state('2026-01-15', old, herbe).leafCover).toBeLessThan(0.3)
    expect(state('2026-07-15', old, herbe).flowering).toBeGreaterThan(0.7)
  })

  it('plante morte : dead, vigueur 0, rien de vivant', () => {
    const s = state('2026-07-15', plant({ status: 'mort', plantedAt: '2000-03-01' }))
    expect(s.dead).toBe(true)
    expect(s.vigor).toBe(0)
    expect(s.leafCover).toBe(0)
    expect(s.flowering).toBe(0)
    expect(s.fruiting).toBe(0)
    expect(s.autumnTint).toBe(0)
  })

  it('plante malade : vigueur réduite, feuillage et fruits diminués', () => {
    const bien = state('2026-09-20')
    const mal = state('2026-09-20', plant({ status: 'malade', plantedAt: '2000-03-01' }))
    expect(mal.dead).toBe(false)
    expect(mal.vigor).toBeGreaterThan(0)
    expect(mal.vigor).toBeLessThan(bien.vigor)
    expect(mal.leafCover).toBeLessThan(bien.leafCover)
    expect(mal.fruiting).toBeLessThan(bien.fruiting)
  })

  it('en projet : taille à l’achat, ni fleurs ni fruits, même longtemps après la date prévue', () => {
    const projet = plant({ status: 'projet', plantedAt: '2000-03-01', ageAtPlanting: 2 })
    const s = state('2026-09-20', projet)
    expect(s.ageYears).toBe(2)
    expect(s.fruiting).toBe(0)
    expect(s.flowering).toBe(0)
    expect(s.heightM).toBeCloseTo(plantSizeAt(plant({ plantedAt: '2026-09-20', ageAtPlanting: 2 }), tree, new Date('2026-09-20')).heightM, 5)
  })

  it('plantation future : âge nul, taille de départ', () => {
    const s = state('2026-03-01', plant({ plantedAt: '2030-01-01' }))
    expect(s.ageYears).toBe(0)
    expect(s.heightM).toBeCloseTo(tree.hauteurAdulteM * 0.12, 5)
  })

  it('dates limites : 29 février et changement d’année', () => {
    const bissextile = state('2028-02-29')
    expect(Number.isFinite(bissextile.leafCover)).toBe(true)
    expect(bissextile.leafCover).toBe(0)
    const a = state('2026-12-31')
    const b = state('2027-01-01')
    expect(Math.abs(a.leafCover - b.leafCover)).toBeLessThan(0.05)
    expect(Math.abs(a.heightM - b.heightM)).toBeLessThan(0.05)
    const p = plant({ plantedAt: '2028-02-29' })
    expect(state('2029-02-28', p).ageYears).toBeCloseTo(1, 1)
    expect(state('2028-02-29', p).ageYears).toBeLessThan(0.01)
  })

  it('espèce inconnue ou date invalide : valeurs finies', () => {
    for (const s of [plantStateAt(old, undefined, new Date('2026-07-01')), plantStateAt(old, tree, new Date('invalide')), plantStateAt(plant({ plantedAt: 'nope' }), tree, new Date('2026-07-01'))]) {
      for (const v of [s.ageYears, s.heightM, s.spreadM, s.leafCover, s.flowering, s.fruiting, s.autumnTint, s.vigor]) expect(Number.isFinite(v)).toBe(true)
    }
  })

  it('aucun NaN et valeurs bornées sur les 146 fiches × dates et statuts', () => {
    const dates = ['2026-01-01', '2026-02-28', '2028-02-29', '2026-04-15', '2026-06-21', '2026-09-30', '2026-11-15', '2026-12-31']
    const plantings = ['2026-03-01', '2018-05-10', '2030-01-01']
    expect(SPECIES.length).toBeGreaterThan(100)
    let n = 0
    for (const sp of SPECIES) {
      for (const d of dates) {
        for (const pl of plantings) {
          for (const status of ['en-place', 'malade', 'mort', 'projet'] as const) {
            const s = plantStateAt(plant({ speciesId: sp.id, plantedAt: pl, status }), sp, new Date(d + 'T12:00:00'))
            n++
            for (const k of ['ageYears', 'heightM', 'spreadM', 'leafCover', 'flowering', 'fruiting', 'autumnTint', 'vigor'] as const) {
              expect(Number.isFinite(s[k])).toBe(true)
              expect(s[k]).toBeGreaterThanOrEqual(0)
            }
            for (const k of ['leafCover', 'flowering', 'fruiting', 'autumnTint', 'vigor'] as const) expect(s[k]).toBeLessThanOrEqual(1)
            expect(s.heightM).toBeLessThanOrEqual(sp.hauteurAdulteM + 1e-9)
          }
        }
      }
    }
    expect(n).toBeGreaterThan(200)
  })
})

describe('fitMeasurements', () => {
  const sp = species()
  it('sans mesure : 1', () => {
    expect(fitMeasurements(plant(), sp)).toEqual({ scaleHeight: 1, scaleSpread: 1 })
    expect(fitMeasurements(plant({ measurements: [] }), sp)).toEqual({ scaleHeight: 1, scaleSpread: 1 })
    expect(fitMeasurements(plant({ measurements: [{ at: '2023-01-01', heightM: 3 }] }), undefined)).toEqual({ scaleHeight: 1, scaleSpread: 1 })
  })

  it('une plante plus grande que prévu recale la courbe vers le haut', () => {
    const modele = plantSizeAt(plant(), sp, new Date('2023-03-01')).heightM
    const p = plant({ measurements: [{ at: '2023-03-01', heightM: modele * 1.5 }] })
    const fit = fitMeasurements(p, sp)
    expect(fit.scaleHeight).toBeCloseTo(1.5, 2)
    expect(fit.scaleSpread).toBe(1)
    expect(plantSizeAt(p, sp, new Date('2023-03-01')).heightM).toBeCloseTo(modele * 1.5, 5)
    expect(plantStateAt(p, sp, new Date('2023-03-01')).heightM).toBeCloseTo(modele * 1.5, 5)
  })

  it('plus petite que prévu : facteur < 1 ; envergure indépendante', () => {
    const modele = plantSizeAt(plant(), sp, new Date('2023-03-01')).spreadM
    const fit = fitMeasurements(plant({ measurements: [{ at: '2023-03-01', spreadM: modele * 0.5 }] }), sp)
    expect(fit.scaleSpread).toBeCloseTo(0.5, 2)
    expect(fit.scaleHeight).toBe(1)
  })

  it('facteur borné à [0,3 ; 3]', () => {
    expect(fitMeasurements(plant({ measurements: [{ at: '2023-03-01', heightM: 55 }] }), sp).scaleHeight).toBeCloseTo(3, 9)
    expect(fitMeasurements(plant({ measurements: [{ at: '2023-03-01', heightM: 0.001 }] }), sp).scaleHeight).toBeCloseTo(0.3, 9)
    expect(fitMeasurements(plant({ measurements: [{ at: '2023-03-01', heightM: 0.2 }] }), sp).scaleHeight).toBeGreaterThanOrEqual(0.3)
  })

  it('pondère vers les mesures récentes', () => {
    const m = (d: string) => plantSizeAt(plant(), sp, new Date(d)).heightM
    const p = plant({ measurements: [{ at: '2021-03-01', heightM: m('2021-03-01') * 2 }, { at: '2025-03-01', heightM: m('2025-03-01') * 1 }] })
    const { scaleHeight } = fitMeasurements(p, sp)
    expect(scaleHeight).toBeGreaterThan(1)
    expect(scaleHeight).toBeLessThan(1.5) // plus proche de la mesure récente (1) que de l’ancienne (2)
  })

  it('mesures invalides ignorées, jamais NaN', () => {
    const p = plant({ measurements: [{ at: 'nope', heightM: 3 }, { at: '2023-03-01', heightM: Number.NaN }, { at: '2023-03-01', heightM: -2 }] })
    expect(fitMeasurements(p, sp)).toEqual({ scaleHeight: 1, scaleSpread: 1 })
  })
})

import { afterAll, beforeAll, afterEach, describe, expect, it, vi } from 'vitest'
import type { DailyWeather, Garden, Plant, Species, TaskDone, WeatherBundle } from '../types'
import { SPECIES_BY_ID } from '../data/species'
import { annualSeasonOver, generateTasks, harvestMinAgeYears, pluralFr, purgeTasksDone, waterBalance, weekKey, yearPlan, type TaskContext } from './tasks'

const garden: Garden = { id: 'g1', name: 'Test', address: '', center: { lat: 48.85, lon: 2.35 }, createdAt: '2026-01-01' }

const base: Omit<Species, 'id' | 'nomCommun'> = {
  nomLatin: '',
  famille: 'Test',
  categorie: 'legume',
  strate: 'herbacee',
  vivace: true,
  comestible: true,
  soleil: ['plein-soleil'],
  eau: 'moyen',
  rusticiteC: -15,
  hauteurAdulteM: 1,
  envergureAdulteM: 1,
  anneesMaturite: 3,
  espacementCm: 50,
  compagnons: [],
  antagonistes: [],
  taches: [],
  entretien: '',
  couleur: '#4a4',
}

const pommier: Species = {
  ...base,
  id: 'pommier',
  nomCommun: 'Pommier',
  categorie: 'fruitier',
  rusticiteC: -25,
  recolte: [9, 10],
  taches: [
    { type: 'taille', months: [12, 1, 2, 3], condition: 'hors-gel', howTo: 'Tailler les gourmands.', tool: 'sécateur' },
    { type: 'taille', months: [1], minAgeYears: 4, howTo: 'Taille de fructification.' },
  ],
}
const tomate: Species = {
  ...base,
  id: 'tomate',
  nomCommun: 'Tomate',
  vivace: false,
  eau: 'eleve',
  rusticiteC: 2,
  plantation: [5],
  taches: [
    { type: 'arrosage', months: [6, 7, 8], frequencyDays: 3, howTo: 'Arroser au pied.' },
    { type: 'traitement', months: [6, 7], condition: 'temps-sec', howTo: 'Purin de prêle.' },
    { type: 'paillage', months: [7], condition: 'chaleur', howTo: 'Pailler épais.' },
  ],
}
const lavande: Species = {
  ...base,
  id: 'lavande',
  nomCommun: 'Lavande',
  eau: 'faible',
  taches: [{ type: 'taille', months: [8, 9], condition: 'temps-sec', howTo: 'Tailler après floraison.' }],
}
const laitue: Species = {
  ...base,
  id: 'laitue',
  nomCommun: 'Laitue',
  vivace: false,
  eau: 'moyen',
  taches: [{ type: 'desherbage', months: [3, 4, 5, 6, 7, 8, 9, 10], condition: 'apres-pluie', frequencyDays: 14, howTo: 'Biner.' }],
}
const citronnier: Species = { ...base, id: 'citronnier', nomCommun: 'Citronnier', categorie: 'fruitier', rusticiteC: -1, taches: [] }

const noyer: Species = {
  ...base,
  id: 'noyer',
  nomCommun: 'Noyer',
  categorie: 'fruitier',
  strate: 'canopee',
  anneesMaturite: 20,
  rusticiteC: -25,
  recolte: [9, 10],
  taches: [{ type: 'recolte', months: [9, 10], frequencyDays: 3, howTo: 'Ramasser les noix tombées.' }],
}
const poirier: Species = { ...base, id: 'poirier', nomCommun: 'Poirier', categorie: 'fruitier', anneesMaturite: 8, rusticiteC: -25, recolte: [8, 9] }
const prunier: Species = { ...base, id: 'prunier', nomCommun: 'Prunier', categorie: 'fruitier', anneesMaturite: 3, rusticiteC: -25, recolte: [8, 9] }
const menthe: Species = { ...base, id: 'menthe', nomCommun: 'Menthe', anneesMaturite: 1, recolte: [5, 6, 7, 8, 9, 10] }
const basilic: Species = { ...base, id: 'basilic', nomCommun: 'Basilic', vivace: false, anneesMaturite: 1, rusticiteC: 2, recolte: [6, 7, 8, 9] }
const courgette: Species = {
  ...base,
  id: 'courgette',
  nomCommun: 'Courgette',
  vivace: false,
  anneesMaturite: 1,
  rusticiteC: 2,
  taches: [{ type: 'recolte', months: [7, 8, 9], frequencyDays: 2, howTo: 'Cueillir jeunes.' }],
}
const noyerPrecoce: Species = { ...noyer, id: 'noyer-precoce', nomCommun: 'Noyer précoce', taches: [{ ...noyer.taches[0], minAgeYears: 1 }] }
const cerisier: Species = {
  ...base,
  id: 'cerisier',
  nomCommun: 'Cerisier',
  categorie: 'fruitier',
  anneesMaturite: 8,
  rusticiteC: -25,
  taches: [
    { type: 'arrosage', months: [6, 7, 8], frequencyDays: 7, maxAgeYears: 3, howTo: 'Arroser les jeunes plants.' },
    { type: 'arrosage', months: [7], condition: 'chaleur', howTo: 'Arroser en cas de canicule.' },
  ],
}
const saule: Species = { ...base, id: 'saule', nomCommun: 'Saule', eau: 'eleve', rusticiteC: -30 }
const framboisier: Species = {
  ...base,
  id: 'framboisier',
  nomCommun: 'Framboisier',
  anneesMaturite: 2,
  recolte: [7, 8],
  taches: [{ type: 'taille', months: [7, 8, 9, 10], condition: 'apres-recolte', howTo: 'Couper les cannes ayant fructifié.' }],
}
const cassissier: Species = {
  ...framboisier,
  id: 'cassissier',
  nomCommun: 'Cassissier',
  taches: [{ type: 'taille', months: [6, 7, 8, 9], condition: 'apres-recolte', howTo: 'Tailler après récolte.' }],
}
const sansRecolte: Species = { ...framboisier, id: 'sans-recolte', nomCommun: 'Sans récolte', recolte: undefined }
const tomateP: Species = {
  ...base,
  id: 'tomate-p',
  nomCommun: 'Tomate test',
  vivace: false,
  rusticiteC: 2,
  taches: [{ type: 'plantation', months: [5], howTo: 'Planter après les gelées.' }],
}
const piment: Species = {
  ...base,
  id: 'piment',
  nomCommun: 'Piment',
  vivace: false,
  rusticiteC: 2,
  semisAbri: [3],
  semisPleineTerre: [5],
  taches: [{ type: 'semis', months: [3, 5], howTo: 'Semer.' }],
}
const rustique: Species = {
  ...base,
  id: 'rustique',
  nomCommun: 'Rustique',
  vivace: false,
  rusticiteC: -10,
  taches: [{ type: 'plantation', months: [5], howTo: 'Planter.' }],
}

const speciesById = Object.fromEntries(
  [
    pommier, tomate, lavande, laitue, citronnier, noyer, poirier, prunier, menthe, basilic, courgette, noyerPrecoce,
    cerisier, saule, framboisier, cassissier, sansRecolte, tomateP, piment, rustique,
  ].map((s) => [s.id, s]),
)

let n = 0
const plant = (speciesId: string, extra: Partial<Plant> = {}): Plant => ({
  id: `p${++n}`,
  gardenId: 'g1',
  speciesId,
  position: { x: n, y: 0 },
  plantedAt: '2020-03-01',
  status: 'en-place',
  photos: [],
  ...extra,
})

/** Météo : 7 jours passés avant `today`, 7 jours prévus à partir de `today`. */
function weather(today: Date, past: Partial<DailyWeather>[], forecast: Partial<DailyWeather>[]): WeatherBundle {
  const day = (offset: number) => {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
  const fill = (w: Partial<DailyWeather>, date: string): DailyWeather => ({ date, tMin: 8, tMax: 18, rainMm: 0, et0Mm: 1, ...w })
  return {
    fetchedAt: today.toISOString(),
    past: Array.from({ length: 7 }, (_, i) => fill(past[i] ?? {}, day(i - 7))),
    forecast: Array.from({ length: 7 }, (_, i) => fill(forecast[i] ?? {}, day(i))),
  }
}

const run = (extra: Partial<TaskContext>) =>
  generateTasks({ garden, plants: [], speciesById, today: new Date(2026, 0, 13, 9), tasksDone: [], ...extra })

const done = (taskKey: string, doneAt: string): TaskDone => ({ id: taskKey, gardenId: 'g1', taskKey, doneAt })
const tailleHiver = (t: { speciesId?: string; type: string; key: string }) =>
  t.speciesId === 'pommier' && t.type === 'taille' && t.key.includes(':m1.2.3.12+hors-gel:')

describe('weekKey', () => {
  it('semaine ISO', () => {
    expect(weekKey(new Date(2026, 9, 17))).toBe('2026-W42')
    expect(weekKey(new Date(2027, 0, 1))).toBe('2026-W53')
    expect(weekKey(new Date(2026, 0, 1))).toBe('2026-W01')
  })
})

describe('pluralFr', () => {
  it('pluriels simples', () => {
    expect(pluralFr('Pommier')).toBe('pommiers')
    expect(pluralFr('Chou-fleur')).toBe('choux-fleurs')
    expect(pluralFr('Fraisier des bois')).toBe('fraisiers des bois')
    expect(pluralFr('Poireau')).toBe('poireaux')
    expect(pluralFr('Petit pois')).toBe('petits pois')
  })
})

describe('generateTasks : regroupement et clés', () => {
  const pommiers = [plant('pommier'), plant('pommier'), plant('pommier', { plantedAt: '2025-11-01' })]

  it('une seule tâche « Tailler les pommiers (3) » avec les plantIds', () => {
    const tasks = run({ plants: pommiers })
    const taille = tasks.filter(tailleHiver)
    expect(taille).toHaveLength(1)
    expect(taille[0].title).toBe('Tailler les pommiers (3)')
    expect(taille[0].plantIds).toEqual(pommiers.map((p) => p.id))
    expect(taille[0].tool).toBe('sécateur')
    // Fenêtre décembre → mars commencée en 2025.
    expect(taille[0].key).toMatch(/^2025:pommier:taille:m1\.2\.3\.12\+hors-gel:[0-9a-z]{4}(\.[0-9a-z]{4})*$/)
    expect(taille[0].reason).toBe("Bonne période pour tailler : de décembre à mars. À faire seulement s'il ne gèle pas.")
  })

  it('minAgeYears : la taille de fructification exclut le jeune pommier', () => {
    const t = run({ plants: pommiers }).find((t) => t.key.includes('pommier:taille:m1:'))!
    expect(t.plantIds).toEqual([pommiers[0].id, pommiers[1].id])
    expect(t.title).toBe('Tailler les pommiers (2)')
  })

  it('une tâche saisonnière cochée disparaît pour toute la fenêtre', () => {
    const t0 = run({ plants: pommiers }).find(tailleHiver)!
    const tasksDone = [done(t0.key, '2025-12-20T10:00:00Z')]
    expect(run({ plants: pommiers, tasksDone }).find(tailleHiver)).toBeUndefined()
    // …et revient à la saison suivante.
    const next = run({ plants: pommiers, today: new Date(2026, 11, 5), tasksDone }).find(tailleHiver)
    expect(next).toBeDefined()
    expect(next!.key.startsWith('2026:pommier:taille:')).toBe(true)
  })

  it('rétro-compatibilité : une ancienne clé (index de règle) masque toujours la tâche', () => {
    const tasksDone = [done('2025:pommier:taille:0', '2025-12-20T10:00:00Z')]
    expect(run({ plants: pommiers, tasksDone }).find(tailleHiver)).toBeUndefined()
    const next = run({ plants: pommiers, today: new Date(2026, 11, 5), tasksDone })
    expect(next.find(tailleHiver)).toBeDefined()
  })

  it('frequencyDays : réapparaît quand le dernier passage est trop ancien', () => {
    const plants = [plant('laitue')]
    const today = new Date(2026, 4, 20, 9)
    const first = run({ plants, today }).find((t) => t.speciesId === 'laitue')!
    expect(first.key.startsWith(`${weekKey(today)}:laitue:desherbage:m3.4.5.6.7.8.9.10+apres-pluie:`)).toBe(true)
    const has = (tasks: ReturnType<typeof run>) => tasks.some((t) => t.speciesId === 'laitue')
    // Cochée il y a 8 jours (< 14) : masquée. Cochée il y a 22 jours : revient.
    expect(has(run({ plants, today, tasksDone: [done('2026-W19:laitue:desherbage:m3.4.5.6.7.8.9.10+apres-pluie:' + first.key.split(':')[4], '2026-05-12T08:00:00Z')] }))).toBe(false)
    expect(has(run({ plants, today, tasksDone: [done('2026-W17:laitue:desherbage:m3.4.5.6.7.8.9.10+apres-pluie:' + first.key.split(':')[4], '2026-04-28T08:00:00Z')] }))).toBe(true)
    // Anciennes clés : même comportement.
    expect(has(run({ plants, today, tasksDone: [done('2026-W19:laitue:desherbage:0', '2026-05-12T08:00:00Z')] }))).toBe(false)
    expect(has(run({ plants, today, tasksDone: [done('2026-W17:laitue:desherbage:0', '2026-04-28T08:00:00Z')] }))).toBe(true)
  })

  it('semis / plantation : seulement pour les plantes en projet (calendrier de l’espèce)', () => {
    const today = new Date(2026, 4, 10)
    const tasks = run({ plants: [plant('tomate', { status: 'projet' }), plant('tomate')], today })
    const pl = tasks.filter((t) => t.type === 'plantation')
    expect(pl).toHaveLength(1)
    expect(pl[0].title).toBe('Planter votre tomate')
    expect(pl[0].plantIds).toHaveLength(1)
    // Les plantes mortes ou en projet ne reçoivent pas de taille.
    expect(run({ plants: [plant('pommier', { status: 'mort' }), plant('pommier', { status: 'projet' })] })).toEqual([])
  })

  it('chaque tâche a une raison', () => {
    for (const t of run({ plants: [...pommiers, plant('laitue')], today: new Date(2026, 2, 10) })) expect(t.reason.length).toBeGreaterThan(10)
  })
})

describe('generateTasks : météo', () => {
  it('hors-gel : bloquée si gel prévu, alerte de protection pour les plantes gélives', () => {
    const today = new Date(2026, 0, 13, 9) // mardi
    const w = weather(today, [], [{ tMin: 2 }, { tMin: 1 }, { tMin: -2.3 }])
    const tasks = run({ plants: [plant('pommier'), plant('citronnier')], weather: w, today })
    const taille = tasks.find(tailleHiver)!
    expect(taille.blockedBy).toBe('Attendre : risque de gel')
    expect(taille.detail).toContain('Gel prévu jeudi (-2 °C)')
    const prot = tasks.find((t) => t.type === 'protection')!
    expect(prot.priority).toBe('haute')
    expect(prot.plantIds).toHaveLength(1) // le pommier supporte -25 °C
    expect(prot.reason).toContain('jeudi')
    // Tri : protection (haute) d'abord, tâches bloquées en dernier.
    expect(tasks[0]).toBe(prot)
    expect(tasks[tasks.length - 1].blockedBy).toBeDefined()
  })

  it('pas de gel : taille possible, pas d’alerte', () => {
    const today = new Date(2026, 0, 13, 9)
    const tasks = run({ plants: [plant('pommier'), plant('citronnier')], weather: weather(today, [], []), today })
    expect(tasks.find((t) => t.type === 'protection')).toBeUndefined()
    expect(tasks.every((t) => !t.blockedBy)).toBe(true)
  })

  it('apres-pluie : priorité haute si sol humide, sinon raison « sol sec »', () => {
    const today = new Date(2026, 4, 20, 9)
    const humide = run({ plants: [plant('laitue')], today, weather: weather(today, [{}, {}, {}, {}, { rainMm: 1 }, { rainMm: 2 }, {}], []) })
    expect(humide[0].priority).toBe('haute')
    const sec = run({ plants: [plant('laitue')], today, weather: weather(today, [{ rainMm: 10 }], []) })
    expect(sec[0].priority).toBe('normale')
    expect(sec[0].reason).toContain('Le sol est sec : désherbage plus difficile')
  })

  it('temps-sec : bloquée si pluie prévue sous 48 h', () => {
    const today = new Date(2026, 7, 20, 9)
    const pluie = run({ plants: [plant('lavande')], today, weather: weather(today, [], [{}, { rainMm: 4 }]) })
    expect(pluie[0].blockedBy).toBe('Attendre : pluie prévue')
    expect(pluie[0].detail).toMatch(/Pluie prévue sous 48 h/)
    const sec = run({ plants: [plant('lavande')], today, weather: weather(today, [], [{}, {}, { rainMm: 8 }]) })
    expect(sec[0].blockedBy).toBeUndefined()
  })

  it('chaleur : seulement si > 25 °C prévus', () => {
    const today = new Date(2026, 6, 10, 9)
    const frais = run({ plants: [plant('tomate')], today, weather: weather(today, [{ rainMm: 5 }], []) })
    expect(frais.find((t) => t.type === 'paillage')).toBeUndefined()
    const chaud = run({ plants: [plant('tomate')], today, weather: weather(today, [{ rainMm: 5 }], [{}, { tMax: 31 }]) })
    expect(chaud.find((t) => t.type === 'paillage')?.reason).toContain('Chaleur prévue demain')
    expect(chaud.find((t) => t.type === 'paillage')?.detail).toContain('31 °C prévus demain')
  })

  it('déficit hydrique : arrosage haute priorité des plantes concernées', () => {
    const today = new Date(2026, 6, 15, 9)
    const sec = Array.from({ length: 7 }, () => ({ et0Mm: 4, rainMm: 0 }))
    sec[2] = { et0Mm: 4, rainMm: 2 }
    const w = weather(today, sec, [{ rainMm: 1 }, { rainMm: 1 }])
    expect(waterBalance(w, today)).toEqual({ rain7: 2, et07: 28, deficitMm: 26, forecastRain3: 2 })
    const t = plant('tomate')
    const p = plant('pommier')
    const vieilleLavande = plant('lavande')
    const jeuneLavande = plant('lavande', { plantedAt: '2026-04-01' })
    const tasks = run({ plants: [t, p, vieilleLavande, jeuneLavande], today, weather: w })
    const arrosage = tasks.filter((x) => x.type === 'arrosage')
    expect(arrosage).toHaveLength(1) // la règle d'arrosage de la tomate est fusionnée
    expect(arrosage[0].priority).toBe('haute')
    expect(arrosage[0].reason).toContain('Pas assez de pluie ces 7 derniers jours')
    expect(arrosage[0].detail).toContain('Déficit en eau : 26 mm sur 7 jours')
    // Le pommier de 6 ans est établi : il n'est plus compté dans l'arrosage météo.
    expect(new Set(arrosage[0].plantIds)).toEqual(new Set([t.id, jeuneLavande.id]))
    expect(tasks[0]).toBe(arrosage[0])
  })

  it('pluie abondante prévue : pas d’arrosage, raison explicite', () => {
    const today = new Date(2026, 6, 15, 9)
    const sec = Array.from({ length: 7 }, () => ({ et0Mm: 4 }))
    const w = weather(today, sec, [{ rainMm: 3 }, { rainMm: 9 }])
    const tasks = run({ plants: [plant('tomate')], today, weather: w })
    const arrosage = tasks.filter((x) => x.type === 'arrosage')
    expect(arrosage.length).toBeGreaterThan(0)
    for (const a of arrosage) {
      expect(a.blockedBy).toBe('Attendre : pluie prévue')
      expect(a.detail).toContain('Pluie prévue sous 3 jours : 12 mm')
    }
  })

  it('pas de déficit : l’arrosage météo n’est pas proposé', () => {
    const today = new Date(2026, 6, 15, 9)
    const w = weather(today, [{ rainMm: 20 }], [])
    const tasks = run({ plants: [plant('pommier')], today, weather: w })
    expect(tasks.find((x) => x.type === 'arrosage')).toBeUndefined()
  })
})

describe('yearPlan', () => {
  it('vue annuelle par mois', () => {
    const plan = yearPlan([plant('pommier'), plant('pommier'), plant('tomate', { status: 'projet' }), plant('laitue')], speciesById)
    expect(plan).toHaveLength(12)
    const janvier = plan[0].tasks
    expect(janvier.find((t) => t.type === 'taille' && t.speciesId === 'pommier')?.count).toBe(2)
    expect(plan[4].tasks.find((t) => t.type === 'desherbage')?.count).toBe(1)
    expect(plan[6].tasks.find((t) => t.speciesId === 'tomate')).toBeUndefined() // en projet
  })
})

// ---------- Récolte : âge minimal (L1) et règles implicites (L3) ----------

describe('récolte : âge minimal des vivaces (L1)', () => {
  const oct = new Date(2026, 8, 18, 9) // 18 septembre
  const recoltes = (plants: Plant[], speciesId?: string) =>
    run({ plants, today: oct }).filter((t) => t.type === 'recolte' && (!speciesId || t.speciesId === speciesId))

  it('seuil par défaut : 60 % de la maturité, borné entre 2 et 8 ans', () => {
    expect(harvestMinAgeYears(noyer, { type: 'recolte', months: [9], howTo: '' })).toBe(8) // 12 → 8
    expect(harvestMinAgeYears(poirier, { type: 'recolte', months: [9], howTo: '' })).toBe(5) // 4,8 → 5
    expect(harvestMinAgeYears(prunier, { type: 'recolte', months: [9], howTo: '' })).toBe(2) // 1,8 → 2
    expect(harvestMinAgeYears({ ...noyer, anneesMaturite: 40 }, { type: 'recolte', months: [9], howTo: '' })).toBe(8)
    // Pas de seuil pour les annuelles, les vivaces à maturité rapide, ni pour les autres types de tâche.
    expect(harvestMinAgeYears(basilic, { type: 'recolte', months: [9], howTo: '' })).toBe(0)
    expect(harvestMinAgeYears(menthe, { type: 'recolte', months: [9], howTo: '' })).toBe(0)
    expect(harvestMinAgeYears(noyer, { type: 'taille', months: [9], howTo: '' })).toBe(0)
    expect(harvestMinAgeYears(noyer, { type: 'recolte', months: [9], minAgeYears: 3, howTo: '' })).toBe(3)
  })

  it('noyer planté il y a un mois : aucune récolte', () => {
    expect(recoltes([plant('noyer', { plantedAt: '2026-08-18' })])).toEqual([])
  })

  it('noyer adulte (9 ans > seuil de 8) : récolte', () => {
    const t = recoltes([plant('noyer', { plantedAt: '2017-03-01' })])
    expect(t).toHaveLength(1)
    expect(t[0].howTo).toBe('Ramasser les noix tombées.')
  })

  it('poirier (seuil 5 ans) et prunier (seuil 2 ans) : récolte implicite selon l’âge', () => {
    expect(recoltes([plant('poirier', { plantedAt: '2022-06-01' })])).toEqual([]) // 4,4 ans
    expect(recoltes([plant('poirier', { plantedAt: '2020-06-01' })])).toHaveLength(1) // 6,4 ans
    expect(recoltes([plant('prunier', { plantedAt: '2025-04-01' })])).toEqual([]) // 1,5 an
    expect(recoltes([plant('prunier', { plantedAt: '2024-04-01' })])).toHaveLength(1) // 2,5 ans
  })

  it('minAgeYears explicite l’emporte sur le seuil par défaut', () => {
    expect(recoltes([plant('noyer-precoce', { plantedAt: '2025-04-01' })])).toHaveLength(1) // 1,5 an ≥ 1
    expect(recoltes([plant('noyer-precoce', { plantedAt: '2026-04-01' })])).toEqual([]) // 0,5 an < 1
  })

  it('annuelles : aucun seuil', () => {
    expect(recoltes([plant('courgette', { plantedAt: '2026-09-15' })])).toHaveLength(1)
  })

  it('vivace à maturité rapide (menthe) : récolte dès la première année', () => {
    expect(recoltes([plant('menthe', { plantedAt: '2026-09-15' })])).toHaveLength(1)
  })

  it('un arbre acheté de 10 ans compte son âge total', () => {
    expect(recoltes([plant('noyer', { plantedAt: '2026-09-17', ageAtPlanting: 10 })])).toHaveLength(1)
    expect(recoltes([plant('noyer', { plantedAt: '2026-09-17', ageAtPlanting: 2 })])).toEqual([])
  })
})

describe('récolte : données réelles (pas de règle implicite en doublon)', () => {
  it('tomate et pommier ont des règles explicites : une seule tâche de récolte chacun', () => {
    const real = SPECIES_BY_ID
    for (const [id, today] of [['tomate', new Date(2026, 7, 10, 9)], ['pommier', new Date(2026, 8, 10, 9)]] as const) {
      const tasks = generateTasks({
        garden, speciesById: real, today, tasksDone: [], plants: [plant(id, { plantedAt: id === 'tomate' ? '2026-05-10' : '2015-03-01' })], // une annuelle plantée en 2015 aurait fini sa saison
      }).filter((t) => t.type === 'recolte')
      expect(tasks).toHaveLength(1)
      expect(tasks[0].key).not.toContain('cal-recolte')
    }
  })
})

describe('récolte implicite depuis le calendrier (L3)', () => {
  const oct = new Date(2026, 9, 18, 9)

  it('pommier sans règle de récolte : tâche hebdomadaire avec raison lisible', () => {
    const t = run({ plants: [plant('pommier'), plant('pommier')], today: oct }).find((x) => x.type === 'recolte')!
    expect(t).toBeDefined()
    expect(t.title).toBe('Récolter les pommiers (2)')
    expect(t.reason).toBe('Bonne période pour récolter : septembre et octobre. À refaire tous les 7 jours.')
    expect(t.howTo).toBe('Cueillez à maturité, de préférence le matin ; ne laissez pas les fruits mûrs sur la plante.')
    expect(t.priority).toBe('normale')
    expect(t.key.startsWith(`${weekKey(oct)}:pommier:recolte:cal-recolte:`)).toBe(true)
  })

  it('hors des mois de récolte : rien', () => {
    expect(run({ plants: [plant('pommier')], today: new Date(2026, 2, 10) }).filter((t) => t.type === 'recolte')).toEqual([])
  })

  it('seulement pour les plantes en place (ni projet, ni mort)', () => {
    const ps = [plant('pommier', { status: 'projet' }), plant('pommier', { status: 'mort' })]
    expect(run({ plants: ps, today: oct }).filter((t) => t.type === 'recolte')).toEqual([])
    const en = run({ plants: [...ps, plant('pommier')], today: oct }).find((t) => t.type === 'recolte')!
    expect(en.plantIds).toHaveLength(1)
  })

  it('pas de doublon quand l’espèce a déjà une règle de récolte explicite', () => {
    const t = run({ plants: [plant('noyer', { plantedAt: '2010-01-01' })], today: oct }).filter((x) => x.type === 'recolte')
    expect(t).toHaveLength(1)
    expect(t[0].key).toContain(':noyer:recolte:m9.10:')
    expect(t[0].reason).toContain('tous les 3 jours')
  })

  it('annuelle (basilic) : récolte dès la plantation, une fois par semaine', () => {
    const t = run({ plants: [plant('basilic', { plantedAt: '2026-09-20' })], today: new Date(2026, 8, 25, 9) }).filter((x) => x.type === 'recolte')
    expect(t).toHaveLength(1)
    expect(t[0].reason).toBe('Bonne période pour récolter : de juin à septembre. À refaire tous les 7 jours.')
  })

  it('la récolte implicite suit les premières gelées locales pour les espèces gélives', () => {
    const g = { ...garden, firstFrostDoy: 290 } // 17 octobre
    const sept = run({ garden: g, plants: [plant('basilic', { plantedAt: '2026-05-10' })], today: new Date(2026, 8, 25, 9) }).filter((x) => x.type === 'recolte')
    expect(sept).toHaveLength(1)
    const oct2 = run({ garden: g, plants: [plant('basilic', { plantedAt: '2026-05-10' })], today: oct }).filter((x) => x.type === 'recolte')
    expect(oct2).toEqual([])
  })
})

// ---------- Arrosage des arbres adultes (L2) ----------

describe('arrosage : arbres établis (L2)', () => {
  const today = new Date(2026, 6, 15, 9)
  const chaud = () =>
    weather(today, Array.from({ length: 7 }, () => ({ et0Mm: 4, rainMm: 0 })), [{}, { tMax: 31 }])
  const arrosages = (plants: Plant[], w = chaud()) => run({ plants, today, weather: w }).filter((t) => t.type === 'arrosage')

  it('maxAgeYears : la règle ne s’applique plus au-delà', () => {
    const jeune = arrosages([plant('cerisier', { plantedAt: '2025-04-01' })], weather(today, [{ rainMm: 30 }], []))
    expect(jeune.some((t) => t.reason.includes('de juin à août'))).toBe(true)
    const adulte = arrosages([plant('cerisier', { plantedAt: '2018-04-01' })], weather(today, [{ rainMm: 30 }], []))
    expect(adulte.some((t) => t.reason.includes('de juin à août'))).toBe(false)
  })

  it('un arbre adulte n’entre plus dans l’arrosage météo et n’obtient jamais la priorité haute', () => {
    const arbre = plant('cerisier', { plantedAt: '2018-04-01' })
    const t = arrosages([arbre])
    expect(t.length).toBeGreaterThan(0) // la règle « canicule » reste proposée
    for (const x of t) {
      expect(x.priority).not.toBe('haute')
      expect(x.key).not.toContain('jardin:arrosage:meteo')
    }
  })

  it('les annuelles et les jeunes plantations restent dans l’arrosage météo', () => {
    const tom = plant('tomate')
    const jeune = plant('cerisier', { plantedAt: '2026-03-01' })
    const vieux = plant('cerisier', { plantedAt: '2018-04-01' })
    const meteo = arrosages([tom, jeune, vieux]).find((t) => t.key.includes('jardin:arrosage:meteo'))!
    expect(meteo.priority).toBe('haute')
    expect(new Set(meteo.plantIds)).toEqual(new Set([tom.id, jeune.id]))
    // La règle « canicule » du vieux cerisier reste à part, sans priorité haute.
    const apart = arrosages([tom, jeune, vieux]).find((t) => t.plantIds.includes(vieux.id))!
    expect(apart.priority).not.toBe('haute')
  })

  it('espèce « eau élevée » : comptée même adulte, mais sans priorité haute si tout est établi', () => {
    const saules = plant('saule', { plantedAt: '2015-01-01' })
    const seul = arrosages([saules]).find((t) => t.key.includes('jardin:arrosage:meteo'))!
    expect(seul.plantIds).toEqual([saules.id])
    expect(seul.priority).toBe('normale')
    const avecTomate = arrosages([saules, plant('tomate')]).find((t) => t.key.includes('jardin:arrosage:meteo'))!
    expect(avecTomate.priority).toBe('haute')
  })

  it('un arbre adulte fraîchement planté reste considéré comme jeune', () => {
    const achete = plant('cerisier', { plantedAt: '2026-06-20', ageAtPlanting: 6 })
    const meteo = arrosages([achete]).find((t) => t.key.includes('jardin:arrosage:meteo'))
    expect(meteo?.plantIds).toEqual([achete.id])
  })
})

// ---------- Clés de tâches stables ----------

describe('clés de tâches', () => {
  const today = new Date(2026, 0, 13, 9)

  it('une nouvelle plante plantée après la tâche cochée fait réapparaître la tâche pour elle seule', () => {
    const ps = [plant('pommier'), plant('pommier')]
    const t1 = run({ plants: ps, today }).find(tailleHiver)!
    const tasksDone = [done(t1.key, '2026-01-13T08:00:00Z')]
    expect(run({ plants: ps, today, tasksDone }).find(tailleHiver)).toBeUndefined()
    const p3 = plant('pommier')
    const again = run({ plants: [...ps, p3], today, tasksDone }).filter(tailleHiver)
    expect(again).toHaveLength(1)
    expect(again[0].plantIds).toEqual([p3.id])
    expect(again[0].title).toBe('Tailler votre pommier')
    expect(again[0].key).not.toBe(t1.key)
    // Cochée à son tour, elle disparaît.
    const all = [...tasksDone, done(again[0].key, '2026-01-14T08:00:00Z')]
    expect(run({ plants: [...ps, p3], today, tasksDone: all }).find(tailleHiver)).toBeUndefined()
  })

  it('même ensemble de plantes, même clé (ordre des plantes sans effet)', () => {
    const ps = [plant('pommier'), plant('pommier'), plant('pommier')]
    const a = run({ plants: ps, today }).find(tailleHiver)!
    const b = run({ plants: [...ps].reverse(), today }).find(tailleHiver)!
    expect(a.key).toBe(b.key)
  })

  it('tâche fréquente : une plante ajoutée après le dernier passage est proposée tout de suite', () => {
    const t = new Date(2026, 4, 20, 9)
    const a = plant('laitue')
    const first = run({ plants: [a], today: t }).find((x) => x.speciesId === 'laitue')!
    const tasksDone = [done(first.key, '2026-05-19T08:00:00Z')]
    expect(run({ plants: [a], today: t, tasksDone }).some((x) => x.speciesId === 'laitue')).toBe(false)
    const b = plant('laitue')
    const next = run({ plants: [a, b], today: t, tasksDone }).find((x) => x.speciesId === 'laitue')!
    expect(next.plantIds).toEqual([b.id])
  })

  it('l’ordre des règles dans sp.taches n’invalide pas les tâches faites', () => {
    const ps = [plant('pommier'), plant('pommier')]
    const t1 = run({ plants: ps, today }).find(tailleHiver)!
    const tasksDone = [done(t1.key, '2026-01-13T08:00:00Z')]
    const inverse: Species = { ...pommier, taches: [...pommier.taches].reverse() }
    const ctx = { plants: ps, today, tasksDone, speciesById: { ...speciesById, pommier: inverse } }
    const tasks = run(ctx)
    expect(tasks.find(tailleHiver)).toBeUndefined()
    // Les clés des deux règles sont les mêmes qu’avant l’inversion.
    const avant = run({ plants: ps, today }).map((x) => x.key).sort()
    const apres = run({ plants: ps, today, speciesById: { ...speciesById, pommier: inverse } }).map((x) => x.key).sort()
    expect(apres).toEqual(avant)
  })

  it('insérer une règle avant les autres ne casse pas les clés existantes', () => {
    const ps = [plant('pommier')]
    const avant = run({ plants: ps, today }).find(tailleHiver)!
    const etendu: Species = { ...pommier, taches: [{ type: 'paillage', months: [4], howTo: 'Pailler.' }, ...pommier.taches] }
    const apres = run({ plants: ps, today, speciesById: { ...speciesById, pommier: etendu } }).find(tailleHiver)!
    expect(apres.key).toBe(avant.key)
  })

  it('deux règles au contenu identique gardent des clés distinctes', () => {
    const jumelles: Species = {
      ...pommier,
      taches: [
        { type: 'taille', months: [1], howTo: 'A.' },
        { type: 'taille', months: [1], minAgeYears: 4, howTo: 'B.' },
      ],
    }
    const keys = run({ plants: [plant('pommier')], today, speciesById: { ...speciesById, pommier: jumelles } })
      .filter((t) => t.type === 'taille')
      .map((t) => t.key)
    expect(keys).toHaveLength(2)
    expect(new Set(keys).size).toBe(2)
  })

  it('les ids d’espèce et de type restent aux positions 2 et 3 de la clé (affichage de l’historique)', () => {
    const t = run({ plants: [plant('pommier')], today }).find(tailleHiver)!
    const parts = t.key.split(':')
    expect(parts[1]).toBe('pommier')
    expect(parts[2]).toBe('taille')
  })
})

describe('alerte gel : clé par nuit de gel', () => {
  const today = new Date(2026, 0, 13, 9)
  const prot = (w: WeatherBundle, tasksDone: TaskDone[] = []) =>
    run({ plants: [plant('citronnier')], today, weather: w, tasksDone }).find((t) => t.type === 'protection')

  it('la clé est la date de la première nuit de gel, pas du jour le plus froid', () => {
    const w1 = weather(today, [], [{}, { tMin: -2 }])
    const w2 = weather(today, [], [{}, { tMin: -2 }, {}, { tMin: -6 }]) // prévision qui se refroidit
    const w3 = weather(today, [], [{}, { tMin: -2 }, { tMin: -3 }])
    expect(prot(w1)!.key).toBe('2026-01-14:jardin:protection:gel')
    expect(prot(w2)!.key).toBe('2026-01-14:jardin:protection:gel')
    expect(prot(w3)!.key).toBe('2026-01-14:jardin:protection:gel')
  })

  it('cochée, l’alerte ne revient pas quand la prévision change', () => {
    const w1 = weather(today, [], [{}, { tMin: -2 }])
    const w2 = weather(today, [], [{}, { tMin: -2 }, {}, { tMin: -6 }])
    const tasksDone = [done(prot(w1)!.key, '2026-01-13T08:00:00Z')]
    expect(prot(w2, tasksDone)).toBeUndefined()
  })

  it('une nuit de gel suivante donne une nouvelle alerte', () => {
    const w = weather(today, [], [{}, { tMin: -2 }])
    const tasksDone = [done(prot(w)!.key, '2026-01-13T08:00:00Z')]
    const demain = new Date(2026, 0, 15, 9)
    const w2 = weather(demain, [], [{}, {}, { tMin: -2 }])
    const next = run({ plants: [plant('citronnier')], today: demain, weather: w2, tasksDone }).find((t) => t.type === 'protection')!
    expect(next.key).toBe('2026-01-17:jardin:protection:gel')
  })

  it('la raison signale le gel le plus fort s’il est plus tard', () => {
    const w = weather(today, [], [{}, { tMin: -2 }, {}, { tMin: -6 }])
    const t = prot(w)!
    expect(t.reason).toContain('demain')
    expect(t.reason).toContain('-6 °C')
  })
})

// ---------- Conditions et calendrier ----------

describe('condition « après la récolte »', () => {
  const taille = (id: string, day: Date) =>
    run({ plants: [plant(id)], today: day }).find((t) => t.type === 'taille')!

  it('bloquée pendant les mois de récolte', () => {
    expect(taille('framboisier', new Date(2026, 7, 10, 9)).blockedBy).toBe('Attendre : la récolte est en cours')
    expect(taille('framboisier', new Date(2026, 6, 5, 9)).blockedBy).toBe('Attendre : la récolte est en cours')
  })

  it('possible dès la fin des mois de récolte', () => {
    expect(taille('framboisier', new Date(2026, 8, 5, 9)).blockedBy).toBeUndefined()
  })

  it('règle : faisable si le mois est dans `months` et hors des mois de récolte', () => {
    // Cassissier : fenêtre juin-septembre, récolte juillet-août.
    expect(taille('cassissier', new Date(2026, 5, 10, 9)).blockedBy).toBeUndefined()
    expect(taille('cassissier', new Date(2026, 6, 10, 9)).blockedBy).toBe('Attendre : la récolte est en cours')
    expect(taille('cassissier', new Date(2026, 8, 10, 9)).blockedBy).toBeUndefined()
  })

  it('espèce sans mois de récolte : la condition ne bloque pas', () => {
    expect(taille('sans-recolte', new Date(2026, 7, 10, 9)).blockedBy).toBeUndefined()
  })
})

describe('règles explicites de semis / plantation et dernières gelées', () => {
  const tardif: Garden = { ...garden, lastFrostDoy: 140 } // ≈ 20 mai
  const plantation = (g: Garden, day: Date, id = 'tomate-p') =>
    run({ garden: g, plants: [plant(id, { status: 'projet' })], today: day }).find((t) => t.type === 'plantation' || t.type === 'semis')

  it('plantation de tomate en mai alors que les gelées vont jusqu’au 20 mai : bloquée', () => {
    const t = plantation(tardif, new Date(2026, 4, 10, 9))!
    expect(t.blockedBy).toBe('Attendre : risque de gel au printemps')
    expect(t.detail).toBe('Dernières gelées vers le 20 mai : attendez juin.')
  })

  it('décalée : la tâche est proposée en juin, sans blocage', () => {
    const t = plantation(tardif, new Date(2026, 5, 5, 9))!
    expect(t).toBeDefined()
    expect(t.blockedBy).toBeUndefined()
    expect(t.reason).toContain('juin')
  })

  it('sans date de gelée, ou gelées précoces, ou espèce rustique : pas de blocage', () => {
    const mai = new Date(2026, 4, 10, 9)
    expect(plantation(garden, mai)!.blockedBy).toBeUndefined()
    expect(plantation({ ...garden, lastFrostDoy: 100 }, mai)!.blockedBy).toBeUndefined()
    expect(plantation(tardif, mai, 'rustique')!.blockedBy).toBeUndefined()
  })

  it('semis sous abri en mars non bloqué, semis en pleine terre en mai bloqué', () => {
    expect(plantation(tardif, new Date(2026, 2, 10, 9), 'piment')!.blockedBy).toBeUndefined()
    expect(plantation(tardif, new Date(2026, 4, 10, 9), 'piment')!.blockedBy).toBe('Attendre : risque de gel au printemps')
  })
})

// ---------- Purge de l'historique ----------

describe('purgeTasksDone', () => {
  const now = new Date('2026-10-18T10:00:00Z')

  it('supprime les entrées de plus de 400 jours, garde les autres', () => {
    const vieux = done('2024-W10:a:taille:m1', '2024-03-01T10:00:00Z')
    const limite = done('2025:pommier:taille:m1:aaaa', '2025-09-20T10:00:00Z') // 393 jours
    const recent = done('2026:pommier:taille:m1:aaaa', '2026-03-01T10:00:00Z')
    expect(purgeTasksDone([vieux, limite, recent], now)).toEqual([limite, recent])
  })

  it('tâche fréquente : ne garde que la dernière entrée par clé de base', () => {
    const k = (week: string, tags?: string) => `${week}:tomate:arrosage:m6.7.8${tags ? ':' + tags : ''}`
    const e1 = done(k('2026-W38'), '2026-09-17T08:00:00Z')
    const e2 = done(k('2026-W40'), '2026-09-30T08:00:00Z')
    const e3 = done(k('2026-W41'), '2026-10-10T08:00:00Z')
    const autre = done('2026-W41:laitue:desherbage:m3.4', '2026-10-10T08:00:00Z')
    expect(purgeTasksDone([e1, e2, e3, autre], now)).toEqual([e3, autre])
  })

  it('tâche fréquente par plante : garde la dernière entrée qui couvre chaque plante', () => {
    const k = (week: string, tags: string) => `${week}:tomate:arrosage:m6.7.8:${tags}`
    const ab1 = done(k('2026-W39', 'aaaa.bbbb'), '2026-09-24T08:00:00Z')
    const ab2 = done(k('2026-W40', 'aaaa.bbbb'), '2026-10-01T08:00:00Z')
    const c = done(k('2026-W41', 'cccc'), '2026-10-10T08:00:00Z')
    const kept = purgeTasksDone([ab1, ab2, c], now)
    expect(kept).toEqual([ab2, c])
  })

  it('tâches saisonnières et alertes de gel : toutes conservées dans l’année', () => {
    const s1 = done('2026:pommier:taille:m1:aaaa', '2026-01-10T10:00:00Z')
    const s2 = done('2026:pommier:taille:m1:bbbb', '2026-02-10T10:00:00Z')
    const g1 = done('2026-01-14:jardin:protection:gel', '2026-01-13T10:00:00Z')
    const g2 = done('2026-02-03:jardin:protection:gel', '2026-02-02T10:00:00Z')
    expect(purgeTasksDone([s1, s2, g1, g2], now)).toEqual([s1, s2, g1, g2])
  })

  it('ne modifie pas l’entrée, conserve l’ordre, tolère une date illisible', () => {
    const bad = done('2026:x:taille:m1', 'pas-une-date')
    const input = [done('2026:y:taille:m1', '2026-03-01T10:00:00Z'), bad]
    const copy = [...input]
    const out = purgeTasksDone(input, now)
    expect(input).toEqual(copy)
    expect(out).toEqual(copy)
    expect(out).not.toBe(input)
  })
})

// ---------- Dates locales ----------

describe('dates locales (fuseau Europe/Paris)', () => {
  const tz = process.env.TZ
  beforeAll(() => {
    process.env.TZ = 'Europe/Paris'
  })
  afterEach(() => {
    vi.useRealTimers()
  })
  afterAll(() => {
    if (tz === undefined) delete process.env.TZ
    else process.env.TZ = tz
  })

  it('à 0 h 30 locale (22 h 30 UTC la veille), les clés utilisent la date locale', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-15T22:30:00Z'))
    const today = new Date()
    expect(today.getDate()).toBe(16) // 16 juillet, 00 h 30 à Paris
    const w = weather(today, [{ rainMm: 5 }], [{ tMin: -1 }])
    const tasks = run({ plants: [plant('tomate'), plant('citronnier')], today, weather: w })
    const arrosage = tasks.find((t) => t.speciesId === 'tomate' && t.type === 'arrosage')!
    expect(arrosage.key.startsWith('2026-07-16:tomate:arrosage:')).toBe(true)
    expect(tasks.find((t) => t.type === 'protection')!.key).toBe('2026-07-16:jardin:protection:gel')
    expect(tasks.find((t) => t.type === 'protection')!.reason).toContain("aujourd'hui")
  })

  it('weekKey et seasonKey : jour local, pas UTC', () => {
    vi.useFakeTimers()
    // Dimanche 4 octobre 2026, 00 h 30 à Paris = samedi 22 h 30 UTC.
    vi.setSystemTime(new Date('2026-10-03T22:30:00Z'))
    const d = new Date()
    expect(d.getDate()).toBe(4)
    expect(weekKey(d)).toBe('2026-W40')
    // Lundi 1er janvier 2029 à 0 h 30 locale : semaine 1 de 2029.
    expect(weekKey(new Date(2029, 0, 1, 0, 30))).toBe('2029-W01')
    // Fenêtre décembre → mars : au 1er janvier 00 h 30, la saison a commencé l'année précédente.
    const t = run({ plants: [plant('pommier')], today: new Date(2026, 0, 1, 0, 30) }).find(tailleHiver)!
    expect(t.key.startsWith('2025:')).toBe(true)
  })
})

describe('generateTasks : langage clair', () => {
  const sentences = (text: string) => text.split(/[.!?]+/).map((x) => x.trim()).filter(Boolean)
  const words = (text: string) => text.split(/\s+/).filter(Boolean).length

  it('reason, blockedBy et detail : phrases de 20 mots maximum, sans jargon', () => {
    const all: ReturnType<typeof run> = []
    const mois = [0, 2, 4, 5, 6, 7, 8, 9, 11]
    const meteos = (d: Date) => [
      undefined,
      weather(d, [], []),
      weather(d, [], [{ tMin: 2 }, { tMin: 1 }, { tMin: -3 }]),
      weather(d, Array.from({ length: 7 }, () => ({ et0Mm: 4 })), [{ rainMm: 3 }, { rainMm: 9 }]),
      weather(d, Array.from({ length: 7 }, () => ({ et0Mm: 4 })), [{ rainMm: 4 }, { tMax: 31 }]),
      weather(d, [{}, {}, {}, {}, { rainMm: 1 }, { rainMm: 2 }, {}], [{ rainMm: 4 }]),
      weather(d, [{ rainMm: 20 }], []),
    ]
    for (const m of mois) {
      const today = new Date(2026, m, 15, 9)
      for (const w of meteos(today)) {
        all.push(
          ...run({
            plants: [
              plant('pommier'), plant('citronnier'), plant('tomate'), plant('lavande'), plant('laitue'),
              plant('lavande', { plantedAt: '2026-04-01' }), plant('tomate', { status: 'malade' }),
            ],
            today,
            weather: w,
          }),
        )
      }
    }
    expect(all.length).toBeGreaterThan(30)
    expect(all.some((t) => t.blockedBy)).toBe(true)
    expect(all.some((t) => t.detail)).toBe(true)
    for (const t of all) {
      for (const text of [t.reason, t.blockedBy, t.detail]) {
        if (!text) continue
        for (const s of sentences(text)) expect(words(s), `${t.key} : « ${s} »`).toBeLessThanOrEqual(20)
      }
      if (t.blockedBy) expect(t.blockedBy).toMatch(/^Attendre : /)
      expect(t.reason).not.toMatch(/Fenêtre|Déficit|évaporation|\bmm\b/)
      expect(t.blockedBy ?? '').not.toMatch(/\bmm\b|°C/)
    }
  })
})

// ---------- Annuelles : fin de saison ----------

describe('annuelles hors saison', () => {
  // basilic : récolte juin à septembre. Planté le 10 mai 2026 : saison finie fin septembre, +30 jours de grâce.
  const basilicEnPlace = (extra: Partial<Plant> = {}) => plant('basilic', { plantedAt: '2026-05-10', ...extra })
  it('annualSeasonOver : fenêtre de récolte finie depuis plus de 30 jours', () => {
    expect(annualSeasonOver(basilicEnPlace(), basilic, new Date(2026, 7, 1))).toBe(false)
    expect(annualSeasonOver(basilicEnPlace(), basilic, new Date(2026, 9, 25))).toBe(false) // 25 octobre : dans la grâce
    expect(annualSeasonOver(basilicEnPlace(), basilic, new Date(2026, 10, 5))).toBe(true)
  })
  it('une plantation de fin de saison attend la fenêtre suivante, pas celle déjà passée', () => {
    // plantée en octobre : la première fenêtre de récolte qui suit est l'été d'après
    expect(annualSeasonOver(basilicEnPlace({ plantedAt: '2026-10-15' }), basilic, new Date(2027, 2, 1))).toBe(false)
  })
  it('jamais pour une vivace, ni pour un projet, ni pour une plante morte', () => {
    expect(annualSeasonOver(plant('menthe', { plantedAt: '2015-05-10' }), menthe, new Date(2026, 9, 1))).toBe(false)
    expect(annualSeasonOver(basilicEnPlace({ status: 'projet' }), basilic, new Date(2027, 5, 1))).toBe(false)
  })
  it('sans récolte connue : fin un an après la plantation (+ grâce)', () => {
    const sp: Species = { ...base, id: 'fleur', nomCommun: 'Fleur', vivace: false, anneesMaturite: 1 }
    const p = plant('fleur', { plantedAt: '2026-05-10' })
    expect(annualSeasonOver(p, sp, new Date(2027, 5, 1))).toBe(false)
    expect(annualSeasonOver(p, sp, new Date(2027, 6, 15))).toBe(true)
  })
  it('une annuelle hors saison ne génère plus ni arrosage ni désherbage ni alerte de gel', () => {
    const today = new Date(2027, 6, 15, 9) // juillet suivant : la tomate d'il y a un an est finie
    const vieille = plant('tomate', { plantedAt: '2026-05-10' })
    const neuve = plant('tomate', { plantedAt: '2027-05-10' })
    const chaud = weather(today, Array.from({ length: 7 }, () => ({ et0Mm: 4, rainMm: 0 })), [{ tMin: -1 }])
    const annuelle = { speciesById: { ...speciesById, tomate: { ...tomate, anneesMaturite: 1 } } }
    const sans = run({ ...annuelle, plants: [vieille], today, weather: chaud })
    expect(sans).toEqual([])
    const avec = run({ ...annuelle, plants: [vieille, neuve], today, weather: chaud })
    for (const t of avec) expect(t.plantIds).not.toContain(vieille.id)
    expect(avec.some((t) => t.plantIds.includes(neuve.id))).toBe(true)
  })
})

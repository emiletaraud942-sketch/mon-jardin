import { describe, expect, it } from 'vitest'
import { SPECIES, SPECIES_BY_ID } from '../data/species'
import type { Plant, Species } from '../types'
import { CYCLE_SENTENCE, FAMILY_EXPLAIN, FAMILY_INFO, ROTATION_CAUTION, ZONE_RADIUS_M, isRotationCrop, normalizeFamily, rotationAdvice, rotationWarning, type FamilyId } from './rotation'

const words = (s: string) => s.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length
const sentences = (s: string) => s.split(/(?<=[.!?])\s+(?=[A-ZÀ-ÖØ-Þ«“"'])/).filter(Boolean)

describe('normalizeFamily', () => {
  // Toutes les valeurs distinctes de `famille` des 173 fiches (relevées dans src/data/species).
  const REAL: Record<string, FamilyId> = {
    Rosaceae: 'rosacees', Brassicacées: 'brassicacees', Astéracées: 'asteracees', Lamiacées: 'lamiacees', Cucurbitacées: 'cucurbitacees', Apiacées: 'apiacees',
    Fabacées: 'fabacees', Amaryllidacées: 'alliacees', Solanacées: 'solanacees', Grossulariaceae: 'autres', Betulaceae: 'autres', Amaranthacées: 'chenopodiacees',
    Fagaceae: 'autres', Boraginacées: 'autres', Rosacées: 'rosacees', Polygonacées: 'autres', Poacées: 'poacees', Oleaceae: 'autres', Moraceae: 'autres',
    Elaeagnaceae: 'autres', Asteraceae: 'asteracees', Amaryllidaceae: 'alliacees', Adoxaceae: 'autres', Actinidiaceae: 'autres', Vitaceae: 'autres',
    Verbénacées: 'autres', Urticacées: 'autres', Tropaeolacées: 'autres', Taxaceae: 'autres', Solanaceae: 'solanacees', Sapindaceae: 'autres', Salicaceae: 'autres',
    Rutacées: 'autres', Pæoniacées: 'autres', Portulacacées: 'autres', Polygonaceae: 'autres', Papavéracées: 'autres', Oléacées: 'autres', Malvaceae: 'autres',
    Lythraceae: 'autres', Liliacées: 'alliacees', Lauracées: 'autres', Lamiaceae: 'lamiacees', Juglandaceae: 'autres', Hydrangéacées: 'autres', Fabaceae: 'fabacees',
    Ericaceae: 'autres', Ebenaceae: 'autres', Cupressacées: 'autres', Cornaceae: 'autres', Convolvulacées: 'autres', Caprifoliacées: 'autres', Caprifoliaceae: 'autres',
    Buxaceae: 'autres', Brassicaceae: 'brassicacees', Asphodélacées: 'autres', Asparagaceae: 'autres', Annonaceae: 'autres', Amaranthaceae: 'chenopodiacees',
    Aizoacées: 'autres',
  }

  it('couvre toutes les valeurs de famille des fiches (et seulement celles-là)', () => {
    const actual = new Set(SPECIES.map((s) => s.famille))
    expect([...actual].sort()).toEqual(Object.keys(REAL).sort())
    for (const f of actual) expect(normalizeFamily(f), f).toBe(REAL[f])
  })

  it('latin et français donnent la même famille', () => {
    const pairs: [string, string][] = [['Solanaceae', 'Solanacées'], ['Brassicaceae', 'Brassicacées'], ['Rosaceae', 'Rosacées'], ['Lamiaceae', 'Lamiacées'], ['Fabaceae', 'Fabacées'], ['Asteraceae', 'Astéracées']]
    for (const [a, b] of pairs) expect(normalizeFamily(a)).toBe(normalizeFamily(b))
    expect(normalizeFamily('Amaryllidaceae')).toBe(normalizeFamily('Alliacées'))
  })

  it('ignore casse, accents, singulier, espaces et « famille des »', () => {
    for (const v of ['solanacées', 'SOLANACÉES', 'Solanacee', ' Solanacées ', 'solanacees', 'Famille des Solanacées', 'famille de la Solanacée']) expect(normalizeFamily(v), v).toBe('solanacees')
    expect(normalizeFamily('Chenopodiacees')).toBe('chenopodiacees')
    expect(normalizeFamily('Chénopodiacée')).toBe('chenopodiacees')
    expect(normalizeFamily('Crucifères')).toBe('brassicacees')
    expect(normalizeFamily('Ombellifères')).toBe('apiacees')
    expect(normalizeFamily('Légumineuses')).toBe('fabacees')
    expect(normalizeFamily('Graminées')).toBe('poacees')
  })

  it('« Liliacées/Alliacées » et les listes : le premier nom connu l’emporte', () => {
    expect(normalizeFamily('Liliacées/Alliacées')).toBe('alliacees')
    expect(normalizeFamily('Inconnue, Solanaceae')).toBe('solanacees')
    expect(normalizeFamily('Solanacées (pomme de terre)')).toBe('solanacees')
  })

  it('valeur vide, absente ou inconnue : autres', () => {
    expect(normalizeFamily('')).toBe('autres')
    expect(normalizeFamily(undefined)).toBe('autres')
    expect(normalizeFamily(null)).toBe('autres')
    expect(normalizeFamily('Machinacées')).toBe('autres')
  })

  it('les légumes de potager connus tombent dans la bonne famille', () => {
    const fam = (id: string) => normalizeFamily(SPECIES_BY_ID[id].famille)
    expect(fam('tomate')).toBe('solanacees')
    expect(fam('pomme-de-terre')).toBe('solanacees')
    expect(fam('aubergine')).toBe('solanacees')
    expect(fam('courgette')).toBe('cucurbitacees')
    expect(fam('chou-pomme')).toBe('brassicacees')
    expect(fam('carotte')).toBe('apiacees')
    expect(fam('pois')).toBe('fabacees')
    expect(fam('laitue')).toBe('asteracees')
    expect(fam('poireau')).toBe('alliacees')
    expect(fam('betterave')).toBe('chenopodiacees')
    expect(fam('mais')).toBe('poacees')
  })
})

describe('familles : valeurs de N', () => {
  it('N par famille, documenté', () => {
    const years = (id: FamilyId) => FAMILY_INFO[id].years
    expect([years('solanacees'), years('brassicacees'), years('apiacees')]).toEqual([3, 4, 3])
    expect([years('cucurbitacees'), years('alliacees'), years('fabacees')]).toEqual([3, 3, 2])
    expect(years('autres')).toBe(0)
    expect(years('lamiacees')).toBe(0)
  })
  it('chaque famille a au plus 4 exemples et des phrases courtes', () => {
    for (const f of Object.values(FAMILY_INFO)) {
      expect(f.examples.length, f.id).toBeLessThanOrEqual(4)
      expect(words(f.simple), f.id).toBeLessThanOrEqual(8)
    }
  })
})

// ---------- Cas simulés ----------

const base: Omit<Species, 'id' | 'nomCommun' | 'famille'> = {
  nomLatin: '', categorie: 'legume', strate: 'herbacee', vivace: false, comestible: true, soleil: ['plein-soleil'],
  eau: 'moyen', rusticiteC: 2, hauteurAdulteM: 1, envergureAdulteM: 1, anneesMaturite: 1, espacementCm: 50,
  compagnons: [], antagonistes: [], taches: [], entretien: '', couleur: '#4a4',
}
const sp = (id: string, nomCommun: string, famille: string, extra: Partial<Species> = {}): Species => ({ ...base, id, nomCommun, famille, ...extra })
const tomate = sp('tomate', 'Tomate', 'Solanacées', { recolte: [7, 8, 9, 10] })
const pdt = sp('pomme-de-terre', 'Pomme de terre', 'Solanaceae', { recolte: [6, 7, 8, 9] })
const courgette = sp('courgette', 'Courgette', 'Cucurbitacées', { recolte: [7, 8, 9, 10] })
const chou = sp('chou', 'Chou', 'Brassicacées', { recolte: [9, 10, 11, 12] })
const poireau = sp('poireau', 'Poireau', 'Amaryllidacées', { recolte: [8, 9, 10, 11, 12, 1, 2, 3, 4] })
const carotte = sp('carotte', 'Carotte', 'Apiacées', { recolte: [7, 8, 9, 10] })
const pois = sp('pois', 'Pois', 'Fabacées', { recolte: [6, 7] })
const basilic = sp('basilic', 'Basilic', 'Lamiacées', { categorie: 'aromatique', recolte: [6, 7, 8, 9] })
const mache = sp('mache', 'Mâche', 'Caprifoliacées', { recolte: [10, 11, 12] })
const menthe = sp('menthe', 'Menthe', 'Lamiacées', { categorie: 'aromatique', vivace: true })
const pommier = sp('pommier', 'Pommier', 'Rosaceae', { categorie: 'fruitier', vivace: true, anneesMaturite: 5 })
const cosmos = sp('cosmos', 'Cosmos', 'Astéracées', { categorie: 'fleur', recolte: [7, 8, 9] })
const lupin = sp('lupin', 'Lupin', 'Fabacées', { categorie: 'engrais-vert', comestible: false })
const SPECIES_LIST = [tomate, pdt, courgette, chou, poireau, carotte, pois, basilic, mache, menthe, pommier, cosmos, lupin]
const byId = Object.fromEntries(SPECIES_LIST.map((s) => [s.id, s]))

let n = 0
const plant = (speciesId: string, x: number, y: number, plantedAt: string, extra: Partial<Plant> = {}): Plant => ({
  id: `p${++n}`, gardenId: 'g', speciesId, position: { x, y }, plantedAt, status: 'en-place', photos: [], ...extra,
})
const NOV_2026 = new Date(2026, 10, 9)
const garden = { id: 'g' }

describe('isRotationCrop', () => {
  it('annuelles de potager seulement : ni vivaces, ni arbres, ni fleurs, ni engrais verts', () => {
    expect(isRotationCrop(tomate)).toBe(true)
    expect(isRotationCrop(basilic)).toBe(true)
    for (const s of [menthe, pommier, cosmos, lupin, undefined]) expect(isRotationCrop(s)).toBe(false)
  })
})

describe('rotationAdvice', () => {
  it('aucune plante, ou aucune annuelle : liste vide', () => {
    expect(rotationAdvice([], byId, NOV_2026, garden)).toEqual([])
    expect(rotationAdvice([plant('pommier', 0, 0, '2020-03-01'), plant('menthe', 1, 1, '2024-04-01'), plant('cosmos', 2, 2, '2026-05-01'), plant('inconnue', 3, 3, '2026-05-01')], byId, NOV_2026, garden)).toEqual([])
  })

  it('les vivaces et les arbres sont ignorés même parmi des légumes', () => {
    const z = rotationAdvice([plant('tomate', 0, 0, '2026-05-10'), plant('pommier', 1, 0, '2020-03-01'), plant('menthe', 1, 1, '2024-04-01')], byId, NOV_2026, garden)
    expect(z).toHaveLength(1)
    expect(z[0].plants.map((p) => p.speciesId)).toEqual(['tomate'])
  })

  it('un projet et une plante morte ne comptent pas', () => {
    expect(rotationAdvice([plant('tomate', 0, 0, '2026-05-10', { status: 'projet' }), plant('tomate', 4, 4, '2026-05-10', { status: 'mort' })], byId, NOV_2026, garden)).toEqual([])
  })

  it('tomate en 2026 : ne pas remettre les Solanacées avant 2029, avec des exemples', () => {
    const [z] = rotationAdvice([plant('tomate', 3, 2, '2026-05-10')], byId, NOV_2026, garden)
    expect(z.blocks).toHaveLength(1)
    const b = z.blocks[0]
    expect(b).toMatchObject({ family: 'solanacees', lastYear: 2026, years: 3, until: 2029, names: ['tomate'] })
    expect(b.text).toBe('Ne remettez pas ici la famille de la tomate avant 2029 (souvent 3 ans).')
    expect(b.same).toBe('Même famille : tomate, pomme de terre, aubergine, poivron.')
    expect(z.last).toBe('Dernière culture : tomate (2026).')
  })

  it('une plante récoltée compte comme précédent culture', () => {
    const [z] = rotationAdvice([plant('tomate', 0, 0, '2026-05-10', { status: 'recoltee' })], byId, NOV_2026, garden)
    expect(z.blocks[0].until).toBe(2029)
    expect(z.plants[0].year).toBe(2026)
  })

  it('bord d’année : un poireau planté en mai 2026 occupe la terre jusqu’à avril 2027', () => {
    const [z] = rotationAdvice([plant('poireau', 0, 0, '2026-05-10')], byId, new Date(2026, 11, 31), garden)
    expect(z.lastYear).toBe(2027)
    expect(z.blocks[0]).toMatchObject({ family: 'alliacees', lastYear: 2027, until: 2030 })
  })

  it('bord d’année : le délai se termine à la bonne date', () => {
    const p = [plant('tomate', 0, 0, '2026-05-10', { status: 'recoltee' })]
    expect(rotationAdvice(p, byId, new Date(2028, 11, 31), garden)).toHaveLength(1)
    expect(rotationAdvice(p, byId, new Date(2029, 0, 1), garden)).toEqual([])
  })

  it('une vieille culture dont le délai est passé n’apparaît plus', () => {
    expect(rotationAdvice([plant('tomate', 0, 0, '2020-05-10', { status: 'recoltee' })], byId, NOV_2026, garden)).toEqual([])
  })

  it('une famille sans règle (menthe, mâche) est listée sans « ne remettez pas »', () => {
    const [z] = rotationAdvice([plant('basilic', 0, 0, '2026-05-10'), plant('mache', 1, 0, '2026-09-10')], byId, NOV_2026, garden)
    expect(z.plants).toHaveLength(2)
    expect(z.blocks).toEqual([])
  })

  it('zones : à moins de 3 m ensemble, plus loin séparées, avec un nom par direction', () => {
    const z = rotationAdvice(
      [plant('tomate', 10, 10, '2026-05-10'), plant('basilic', 11, 11, '2026-05-10'), plant('chou', -10, -10, '2026-05-10'), plant('carotte', 10, -10, '2026-05-10')],
      byId,
      NOV_2026,
      garden,
    )
    expect(z).toHaveLength(3)
    expect(z.map((x) => x.name)).toEqual(['Zone nord-est du jardin', 'Zone sud-ouest du jardin', 'Zone sud-est du jardin'])
    expect(z[0].plants).toHaveLength(2)
  })

  it('distance exacte : 3 m ensemble, 3,1 m séparées', () => {
    expect(rotationAdvice([plant('tomate', 20, 0, '2026-05-10'), plant('chou', 23, 0, '2026-05-10')], byId, NOV_2026, garden)).toHaveLength(1)
    expect(rotationAdvice([plant('tomate', 20, 0, '2026-05-10'), plant('chou', 23.1, 0, '2026-05-10')], byId, NOV_2026, garden)).toHaveLength(2)
    expect(ZONE_RADIUS_M).toBe(3)
  })

  it('deux zones dans la même direction sont numérotées ; une plante au centre : « Centre du jardin »', () => {
    const z = rotationAdvice([plant('tomate', 0, 10, '2026-05-10'), plant('chou', 0, 20, '2026-05-10'), plant('pois', 0, 0, '2026-05-10')], byId, NOV_2026, garden)
    expect(z.map((x) => x.name)).toEqual(['Zone nord du jardin (1)', 'Zone nord du jardin (2)', 'Centre du jardin'])
    expect(new Set(z.map((x) => x.id)).size).toBe(3)
  })

  it('seules les plantes du jardin donné comptent', () => {
    const p = [plant('tomate', 0, 0, '2026-05-10', { gardenId: 'autre' }), plant('chou', 0, 0, '2026-05-10')]
    const [z] = rotationAdvice(p, byId, NOV_2026, garden)
    expect(z.plants.map((x) => x.speciesId)).toEqual(['chou'])
  })

  it('plusieurs familles dans une zone : un bloc par famille, la plus longue attente d’abord', () => {
    const [z] = rotationAdvice([plant('tomate', 0, 0, '2026-05-10'), plant('pomme-de-terre', 1, 0, '2026-04-10'), plant('chou', 1, 1, '2026-06-10')], byId, NOV_2026, garden)
    expect(z.blocks.map((b) => b.family)).toEqual(['brassicacees', 'solanacees'])
    expect(z.blocks[1].names).toEqual(['pomme de terre', 'tomate'])
  })

  it('suite classique : après les fruits, des légumes-racines ; sans reprendre une famille bloquée', () => {
    const [z] = rotationAdvice([plant('tomate', 0, 0, '2026-05-10')], byId, NOV_2026, garden)
    expect(z.next?.group).toBe('racines')
    expect(z.next?.text).toBe('Pour la suite, essayez des légumes-racines (carotte, betterave, oignon).')
    const [z2] = rotationAdvice([plant('tomate', 0, 0, '2026-05-10'), plant('carotte', 1, 0, '2026-05-10')], byId, NOV_2026, garden)
    expect(z2.next?.text).toBe('Pour la suite, essayez des légumes-racines (betterave, oignon).')
    const [z3] = rotationAdvice([plant('pois', 0, 0, '2026-05-10')], byId, NOV_2026, garden)
    expect(z3.next?.group).toBe('feuilles')
    const [z4] = rotationAdvice([plant('carotte', 0, 0, '2026-05-10')], byId, NOV_2026, garden)
    expect(z4.next?.group).toBe('legumineuses')
    const [z5] = rotationAdvice([plant('chou', 0, 0, '2026-05-10')], byId, NOV_2026, garden)
    expect(z5.next?.group).toBe('fruits')
  })

  it('pas de suite proposée quand aucune culture n’a de place dans le cycle', () => {
    const [z] = rotationAdvice([plant('basilic', 0, 0, '2026-05-10')], byId, NOV_2026, garden)
    expect(z.next).toBeUndefined()
  })

  it('déterministe : même résultat quel que soit l’ordre des plantes', () => {
    const list = [plant('tomate', 3, 3, '2026-05-10'), plant('chou', 3.5, 3, '2026-05-12'), plant('carotte', -8, 2, '2026-05-10'), plant('pois', 9, -9, '2025-05-10', { status: 'recoltee' }), plant('basilic', 3, 4, '2026-06-01')]
    const a = rotationAdvice(list, byId, NOV_2026, garden)
    expect(rotationAdvice([...list].reverse(), byId, NOV_2026, garden)).toEqual(a)
    expect(rotationAdvice([list[2], list[0], list[4], list[1], list[3]], byId, NOV_2026, garden)).toEqual(a)
    expect(rotationAdvice(list, byId, NOV_2026, garden)).toEqual(a)
  })

  it('ne modifie pas ses entrées', () => {
    const list = [plant('tomate', 3, 3, '2026-05-10'), plant('chou', 3.5, 3, '2026-05-12')]
    const copy = JSON.stringify(list)
    rotationAdvice(list, byId, NOV_2026, garden)
    expect(JSON.stringify(list)).toBe(copy)
  })

  it('une date de plantation invalide est ignorée sans erreur', () => {
    expect(rotationAdvice([plant('tomate', 0, 0, 'n’importe quoi')], byId, NOV_2026, garden)).toEqual([])
  })

  it('toutes les phrases font 20 mots au plus', () => {
    const zs = rotationAdvice([plant('tomate', 0, 0, '2026-05-10'), plant('pomme-de-terre', 1, 0, '2026-05-10'), plant('courgette', 1, 1, '2026-05-10'), plant('carotte', 2, 0, '2026-05-10'), plant('pois', 2, 1, '2025-05-10'), plant('basilic', 0, 2, '2026-05-10')], byId, NOV_2026, garden)
    const texts = [CYCLE_SENTENCE, ROTATION_CAUTION, FAMILY_EXPLAIN]
    for (const z of zs) texts.push(z.last, z.next?.text ?? '', ...z.blocks.flatMap((b) => [b.text, b.same]))
    for (const t of texts) for (const s of sentences(t)) expect(words(s), s).toBeLessThanOrEqual(20)
    expect(zs.length).toBeGreaterThan(0)
  })
})

describe('rotationWarning', () => {
  const tomatesEn2026 = [plant('tomate', 5, 5, '2026-05-10', { status: 'recoltee' })]

  it('même famille à moins de 3 m : avertit, avec l’année, le délai et un exemple', () => {
    const w = rotationWarning('pomme-de-terre', { x: 6, y: 6 }, tomatesEn2026, byId, NOV_2026)!
    expect(w).toMatchObject({ family: 'solanacees', names: ['tomate'], lastYear: 2026, years: 3, until: 2029 })
    expect(w.text).toBe('Même famille déjà cultivée à moins de 3 m (2026) : tomate. Souvent, on attend 3 ans avant de la remettre au même endroit : pas avant 2029. Tomate, pomme de terre et aubergine sont de la même famille.')
  })

  it('la même espèce compte aussi', () => {
    expect(rotationWarning('tomate', { x: 5, y: 5 }, tomatesEn2026, byId, NOV_2026)).not.toBeNull()
  })

  it('trop loin (plus de 3 m) : rien', () => {
    expect(rotationWarning('tomate', { x: 5, y: 8.01 }, tomatesEn2026, byId, NOV_2026)).toBeNull()
    expect(rotationAdvice(tomatesEn2026, byId, NOV_2026, garden)).toHaveLength(1)
  })

  it('pile à 3 m : avertit', () => {
    expect(rotationWarning('tomate', { x: 8, y: 5 }, tomatesEn2026, byId, NOV_2026)).not.toBeNull()
  })

  it('autre famille : rien', () => {
    expect(rotationWarning('chou', { x: 5, y: 5 }, tomatesEn2026, byId, NOV_2026)).toBeNull()
    expect(rotationWarning('carotte', { x: 5.5, y: 5 }, tomatesEn2026, byId, NOV_2026)).toBeNull()
  })

  it('délai passé : rien (bord d’année)', () => {
    expect(rotationWarning('tomate', { x: 5, y: 5 }, tomatesEn2026, byId, new Date(2028, 11, 31))).not.toBeNull()
    expect(rotationWarning('tomate', { x: 5, y: 5 }, tomatesEn2026, byId, new Date(2029, 0, 1))).toBeNull()
  })

  it('la culture de cette année en place compte', () => {
    expect(rotationWarning('pomme-de-terre', { x: 5, y: 5 }, [plant('tomate', 5, 5, '2026-05-10')], byId, new Date(2026, 6, 1))).not.toBeNull()
  })

  it('plante qui n’est pas de potager ou famille sans règle : rien', () => {
    const near = [plant('basilic', 0, 0, '2026-05-10'), plant('tomate', 0, 0, '2026-05-10')]
    expect(rotationWarning('menthe', { x: 0, y: 0 }, near, byId, NOV_2026)).toBeNull()
    expect(rotationWarning('pommier', { x: 0, y: 0 }, near, byId, NOV_2026)).toBeNull()
    expect(rotationWarning('basilic', { x: 0, y: 0 }, near, byId, NOV_2026)).toBeNull()
    expect(rotationWarning('mache', { x: 0, y: 0 }, near, byId, NOV_2026)).toBeNull()
    expect(rotationWarning('inconnue', { x: 0, y: 0 }, near, byId, NOV_2026)).toBeNull()
  })

  it('vivaces, projets et plantes mortes tout près : rien', () => {
    const near = [plant('pommier', 5, 5, '2020-03-01'), plant('tomate', 5, 5, '2026-05-10', { status: 'projet' }), plant('tomate', 5, 5, '2026-05-10', { status: 'mort' })]
    expect(rotationWarning('tomate', { x: 5, y: 5 }, near, byId, NOV_2026)).toBeNull()
  })

  it('aucune plante : rien', () => {
    expect(rotationWarning('tomate', { x: 0, y: 0 }, [], byId, NOV_2026)).toBeNull()
  })

  it('on peut ignorer la plante qu’on déplace', () => {
    const p = tomatesEn2026[0]
    expect(rotationWarning('tomate', p.position, tomatesEn2026, byId, NOV_2026, p.id)).toBeNull()
  })

  it('plusieurs légumes de la même famille tout près : les noms, au plus trois, dans l’ordre alphabétique', () => {
    const near = [plant('tomate', 0, 0, '2026-05-10'), plant('pomme-de-terre', 1, 0, '2026-05-10')]
    const w = rotationWarning('tomate', { x: 0, y: 1 }, near, byId, NOV_2026)!
    expect(w.names).toEqual(['pomme de terre', 'tomate'])
    expect(w.text).toContain('(2026) : pomme de terre et tomate.')
  })

  it('l’année la plus récente est celle qui donne le délai', () => {
    const near = [plant('tomate', 0, 0, '2025-05-10', { status: 'recoltee' }), plant('pomme-de-terre', 1, 0, '2026-05-10', { status: 'recoltee' })]
    const w = rotationWarning('tomate', { x: 0, y: 0 }, near, byId, NOV_2026)!
    expect(w).toMatchObject({ lastYear: 2026, until: 2029, names: ['pomme de terre'] })
  })

  it('déterministe et phrases de 20 mots au plus', () => {
    const a = rotationWarning('pomme-de-terre', { x: 6, y: 6 }, tomatesEn2026, byId, NOV_2026)!
    expect(rotationWarning('pomme-de-terre', { x: 6, y: 6 }, [...tomatesEn2026], byId, NOV_2026)).toEqual(a)
    for (const s of sentences(a.text)) expect(words(s), s).toBeLessThanOrEqual(20)
  })
})

describe('avec les vraies fiches', () => {
  it('tomate puis aubergine au même endroit : avertissement ; carotte : rien', () => {
    const p = [plant('tomate', 0, 0, '2026-05-10')]
    expect(rotationWarning('aubergine', { x: 1, y: 1 }, p, SPECIES_BY_ID, NOV_2026)).not.toBeNull()
    expect(rotationWarning('carotte', { x: 1, y: 1 }, p, SPECIES_BY_ID, NOV_2026)).toBeNull()
  })

  it('chaque légume annuel du catalogue a une famille connue ou « autres », et un nom lisible', () => {
    for (const s of SPECIES.filter(isRotationCrop)) {
      const fam = normalizeFamily(s.famille)
      expect(FAMILY_INFO[fam], s.id).toBeDefined()
    }
    expect(SPECIES.filter(isRotationCrop).length).toBeGreaterThan(40)
  })
})

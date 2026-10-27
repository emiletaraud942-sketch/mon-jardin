import { describe, expect, it } from 'vitest'
import type { TaskRule } from '../../types'
import { SPECIES, SPECIES_BY_ID, matchesSpecies } from './index'
import { ALIAS } from './alias'
import { AVERTISSEMENTS } from './avertissements'
import { AJOUTS } from './ajouts'

describe('base espèces', () => {
  it('contient au moins 160 espèces aux ids uniques', () => {
    expect(SPECIES.length).toBeGreaterThanOrEqual(160)
    expect(new Set(SPECIES.map((s) => s.id)).size).toBe(SPECIES.length)
  })

  it('ne référence que des espèces existantes', () => {
    const missing: string[] = []
    for (const s of SPECIES) {
      for (const id of [...s.compagnons, ...s.antagonistes]) if (!SPECIES_BY_ID[id]) missing.push(`${s.id} → ${id}`)
    }
    expect(missing).toEqual([])
  })

  it('a des valeurs cohérentes', () => {
    for (const s of SPECIES) {
      const months = [...(s.semisAbri ?? []), ...(s.semisPleineTerre ?? []), ...(s.plantation ?? []), ...(s.recolte ?? []), ...s.taches.flatMap((t) => t.months)]
      expect(months.every((m) => m >= 1 && m <= 12), s.id).toBe(true)
      expect(s.hauteurAdulteM, s.id).toBeGreaterThan(0)
      expect(s.envergureAdulteM, s.id).toBeGreaterThan(0)
      expect(s.taches.length, s.id).toBeGreaterThan(0)
      expect(s.soleil.length, s.id).toBeGreaterThan(0)
      expect(/^#[0-9a-f]{6}$/i.test(s.couleur), s.id).toBe(true)
      expect(s.compagnons.includes(s.id) || s.antagonistes.includes(s.id), s.id).toBe(false)
    }
  })
})

describe('cohérence des tâches', () => {
  const ligneuse = (strate: string) => strate === 'canopee' || strate === 'arbre-bas'

  it("donne une règle de récolte à toute espèce qui a des mois de récolte", () => {
    const manquantes = SPECIES.filter((s) => (s.recolte?.length ?? 0) > 0 && !s.taches.some((t) => t.type === 'recolte')).map((s) => s.id)
    expect(manquantes).toEqual([])
  })

  it("borne l'arrosage des jeunes plants par maxAgeYears", () => {
    const sansBorne: string[] = []
    for (const s of SPECIES) {
      for (const t of s.taches) {
        if (t.type === 'arrosage' && /jeunes?\b|suivant la plantation|premiers? étés?|première année/i.test(t.howTo) && t.maxAgeYears === undefined) sansBorne.push(s.id)
      }
    }
    expect(sansBorne).toEqual([])
  })

  it('ne chevauche pas deux règles du même type sans distinguer âge ou condition', () => {
    const conflits: string[] = []
    const plage = (r: TaskRule): [number, number] => [r.minAgeYears ?? 0, r.maxAgeYears ?? Infinity]
    for (const s of SPECIES) {
      for (let i = 0; i < s.taches.length; i++) {
        for (let j = i + 1; j < s.taches.length; j++) {
          const a = s.taches[i]
          const b = s.taches[j]
          if (a.type !== b.type || !a.months.some((m) => b.months.includes(m))) continue
          const [a0, a1] = plage(a)
          const [b0, b1] = plage(b)
          const agesDistincts = Math.max(a0, b0) >= Math.min(a1, b1)
          if (a.condition === b.condition && !agesDistincts) conflits.push(`${s.id} : ${a.type}`)
        }
      }
    }
    expect(conflits).toEqual([])
  })

  it("impose un âge minimal de récolte aux arbres (canopée, arbre bas)", () => {
    const sansAge: string[] = []
    for (const s of SPECIES) {
      if (!s.vivace || !ligneuse(s.strate)) continue
      for (const t of s.taches) if (t.type === 'recolte' && (t.minAgeYears ?? 0) < 1) sansAge.push(s.id)
    }
    expect(sansAge).toEqual([])
  })

  it('a une strate cohérente avec la hauteur adulte', () => {
    const ecarts: string[] = []
    for (const s of SPECIES) {
      const h = s.hauteurAdulteM
      if (s.strate === 'canopee' && h <= 10) ecarts.push(`${s.id} : canopée à ${h} m`)
      if (s.strate === 'arbre-bas' && (h < 3 || h > 10)) ecarts.push(`${s.id} : arbre bas à ${h} m`)
      if (s.strate === 'arbuste' && (h < 0.5 || h > 3.5)) ecarts.push(`${s.id} : arbuste à ${h} m`)
    }
    expect(ecarts).toEqual([])
  })

  it('rend possible toute taille « après récolte » (au moins un mois hors fenêtre de récolte)', () => {
    const impossibles: string[] = []
    for (const s of SPECIES) {
      for (const t of s.taches) {
        if (t.condition !== 'apres-recolte') continue
        const recolte = s.recolte ?? []
        if (recolte.length === 0 || t.months.every((m) => recolte.includes(m))) impossibles.push(s.id)
      }
    }
    expect(impossibles).toEqual([])
  })

  it('espace les récoltes à la demande étalées sur presque toute l’année', () => {
    const trop: string[] = []
    for (const s of SPECIES) {
      for (const t of s.taches) if (t.type === 'recolte' && t.months.length >= 10 && (t.frequencyDays ?? 0) < 30) trop.push(s.id)
    }
    expect(trop).toEqual([])
  })

  it("ne mélange pas maxAgeYears et minAgeYears incohérents", () => {
    const mauvais: string[] = []
    for (const s of SPECIES) for (const t of s.taches) if (t.maxAgeYears !== undefined && t.minAgeYears !== undefined && t.maxAgeYears <= t.minAgeYears) mauvais.push(s.id)
    expect(mauvais).toEqual([])
  })
})

describe('calendriers cohérents (audit du 27 octobre 2026)', () => {
  it('la fenêtre de récolte de la fiche est celle des règles de récolte', () => {
    const ecarts: string[] = []
    for (const s of SPECIES) {
      const regles = [...new Set(s.taches.filter((t) => t.type === 'recolte').flatMap((t) => t.months))].sort((a, b) => a - b)
      const fiche = [...new Set(s.recolte ?? [])].sort((a, b) => a - b)
      if (regles.length && fiche.length && regles.join() !== fiche.join()) ecarts.push(`${s.id} : fiche [${fiche}] règles [${regles}]`)
    }
    expect(ecarts).toEqual([])
  })

  it('les mois de semis et de plantation des règles sont dans la fiche', () => {
    const hors: string[] = []
    for (const s of SPECIES) {
      const semis = [...(s.semisAbri ?? []), ...(s.semisPleineTerre ?? [])]
      for (const t of s.taches) {
        if (t.type === 'semis' && semis.length && t.months.some((m) => !semis.includes(m))) hors.push(`${s.id} : semis`)
        if (t.type === 'plantation' && s.plantation?.length && t.months.some((m) => !s.plantation!.includes(m))) hors.push(`${s.id} : plantation`)
      }
    }
    expect(hors).toEqual([])
  })

  it('prunier et mirabellier se taillent en été, jamais en automne ni en hiver (plomb parasite, gommose)', () => {
    for (const id of ['prunier', 'mirabellier']) {
      for (const t of SPECIES_BY_ID[id].taches.filter((r) => r.type === 'taille')) expect(t.months.every((m) => m >= 5 && m <= 9), `${id} [${t.months}]`).toBe(true)
    }
  })

  it('une haie ne se taille jamais du 15 mars au 31 juillet (sauf avant le 15 mars : février)', () => {
    const fautes: string[] = []
    for (const s of AJOUTS.filter((x) => x.categorie === 'haie')) {
      for (const t of s.taches.filter((r) => r.type === 'taille')) if (t.months.some((m) => m >= 3 && m <= 7)) fautes.push(`${s.id} [${t.months}]`)
    }
    expect(fautes).toEqual([])
  })
})

describe('ajouts', () => {
  it('apporte au moins 15 espèces nouvelles, dont rosier, hortensia, thuya, laurier-palme et chou rouge', () => {
    expect(AJOUTS.length).toBeGreaterThanOrEqual(15)
    for (const id of ['rosier', 'hortensia', 'thuya', 'laurier-palme', 'chou-rouge']) expect(SPECIES_BY_ID[id], id).toBeDefined()
  })
  it('chaque ajout a une fiche d’entretien et des couleurs valides', () => {
    for (const s of AJOUTS) {
      expect(s.entretien.length, s.id).toBeGreaterThan(80)
      if (s.couleurAccent) expect(/^#[0-9a-f]{6}$/i.test(s.couleurAccent), s.id).toBe(true)
    }
  })
})

describe('noms usuels (alias)', () => {
  it('ne vise que des espèces existantes, sans alias vide', () => {
    for (const [id, noms] of Object.entries(ALIAS)) {
      expect(SPECIES_BY_ID[id], id).toBeDefined()
      for (const n of noms) expect(n.trim().length, id).toBeGreaterThan(1)
    }
  })
  it('la recherche trouve « pomme », « fraise », « cerise », « oeillet », « salade », « mure »', () => {
    const trouve = (q: string) => SPECIES.filter((s) => matchesSpecies(s, q)).map((s) => s.id)
    expect(trouve('pomme')).toContain('pommier')
    expect(trouve('Fraise')).toContain('fraisier')
    expect(trouve('cerise')).toContain('cerisier')
    expect(trouve('oeillet')).toContain('oeillet-d-inde')
    expect(trouve('œillet')).toContain('oeillet-d-inde')
    expect(trouve('salade')).toEqual(expect.arrayContaining(['laitue', 'chicoree', 'mache', 'roquette']))
    expect(trouve('mûre')).toEqual(expect.arrayContaining(['murier-noir', 'ronce-sans-epines']))
    expect(trouve('laurier')).toEqual(expect.arrayContaining(['laurier-sauce', 'laurier-palme']))
    expect(trouve('')).toHaveLength(SPECIES.length)
    expect(trouve('zzzz')).toEqual([])
  })
  it('les alias sont portés par les espèces du catalogue', () => {
    expect(SPECIES_BY_ID.pommier.alias).toContain('pomme')
    expect(SPECIES_BY_ID.tomate.alias).toBeDefined()
  })
})

describe('avertissements (toxique, envahissante…)', () => {
  const TYPES = ['toxique', 'envahissante', 'epineuse', 'allergene', 'irritante']
  it('ne vise que des espèces existantes, avec un type connu et un texte court', () => {
    for (const [id, liste] of Object.entries(AVERTISSEMENTS)) {
      expect(SPECIES_BY_ID[id], id).toBeDefined()
      expect(liste.length, id).toBeGreaterThan(0)
      for (const a of liste) {
        expect(TYPES, id).toContain(a.type)
        expect(a.texte.length, id).toBeGreaterThan(15)
        expect(a.texte.length, id).toBeLessThanOrEqual(240)
      }
    }
  })
  it('les plantes à risque connues sont signalées', () => {
    const a = (id: string) => (SPECIES_BY_ID[id].avertissements ?? []).map((x) => x.type)
    for (const id of ['rhubarbe', 'tomate', 'pomme-de-terre', 'ail-des-ours', 'sureau-noir', 'laurier-palme', 'thuya', 'hortensia', 'hemerocalle', 'robinier']) expect(a(id), id).toContain('toxique')
    for (const id of ['menthe', 'topinambour', 'robinier', 'laurier-palme', 'ortie']) expect(a(id), id).toContain('envahissante')
    expect(a('rosier')).toContain('epineuse')
    expect(a('bouleau')).toContain('allergene')
    expect(a('piment')).toContain('irritante')
  })
  it('les fiches sans risque connu n’ont pas de champ', () => {
    expect(SPECIES_BY_ID.laitue.avertissements).toBeUndefined()
  })
})

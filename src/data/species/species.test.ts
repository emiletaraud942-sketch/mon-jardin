import { describe, expect, it } from 'vitest'
import type { Species, TaskRule } from '../../types'
import { SPECIES, SPECIES_BY_ID } from './index'

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

describe('cohérence calendrier et tâches', () => {
  const couvre = (s: Species, type: TaskRule['type'], m: number) => s.taches.some((t) => t.type === type && (t.months as number[]).includes(m))
  const explicitSow = (s: Species) => s.taches.some((t) => t.type === 'semis' || t.type === 'plantation')

  it('couvre chaque mois de semis, de plantation et de récolte par une tâche (sans liste d’exceptions)', () => {
    const ecarts: string[] = []
    for (const s of SPECIES) {
      const spt = s.semisPleineTerre ?? []
      const abri = s.semisAbri ?? []
      // Sans aucune tâche de semis ou de plantation, le moteur déduit les tâches du calendrier (semis en pleine terre, plantation).
      if (explicitSow(s)) {
        for (const m of spt) if (!couvre(s, 'semis', m)) ecarts.push(`${s.id} : semis en pleine terre ${m} sans tâche`)
        for (const m of s.plantation ?? []) if (!couvre(s, 'plantation', m)) ecarts.push(`${s.id} : plantation ${m} sans tâche`)
      }
      // Le semis à l'abri n'est jamais déduit : il faut une tâche explicite.
      for (const m of abri) if (!spt.includes(m) && !couvre(s, 'semis', m)) ecarts.push(`${s.id} : semis à l’abri ${m} sans tâche`)
      if (s.taches.some((t) => t.type === 'recolte')) {
        for (const m of s.recolte ?? []) if (!couvre(s, 'recolte', m)) ecarts.push(`${s.id} : récolte ${m} sans tâche`)
      }
    }
    expect(ecarts).toEqual([])
  })

  it('ne propose pas de tâche de semis, de plantation ou de récolte hors du calendrier de la fiche', () => {
    const ecarts: string[] = []
    for (const s of SPECIES) {
      for (const t of s.taches) {
        const permis =
          t.type === 'semis' ? [...(s.semisAbri ?? []), ...(s.semisPleineTerre ?? [])] : t.type === 'plantation' ? s.plantation : t.type === 'recolte' ? s.recolte : undefined
        if (!permis) continue
        for (const m of t.months) if (!(permis as number[]).includes(m)) ecarts.push(`${s.id} : ${t.type} ${m} hors calendrier`)
      }
    }
    expect(ecarts).toEqual([])
  })
})

describe('recherche, produits et risques', () => {
  it('a des alias propres (non vides, sans doublon, sans reprendre le nom commun)', () => {
    const norm = (x: string) => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
    for (const s of SPECIES) {
      const a = (s.alias ?? []).map(norm)
      expect(a.every((x) => x.length >= 2), s.id).toBe(true)
      expect(new Set(a).size, s.id).toBe(a.length)
      expect(a.includes(norm(s.nomCommun)), s.id).toBe(false)
    }
  })

  it('trouve les noms usuels du jardinier par alias', () => {
    const attendu: Record<string, string> = {
      pomme: 'pommier', fraise: 'fraisier', framboise: 'framboisier', cerise: 'cerisier', figue: 'figuier', noix: 'noyer',
      myrtille: 'myrtillier', 'tomate cerise': 'tomate', 'haricot vert': 'haricot-nain', 'petit pois': 'pois', patate: 'pomme-de-terre',
      salade: 'laitue', scarole: 'chicoree', kaki: 'plaqueminier', citron: 'citronnier', thuya: 'thuya', rose: 'rosier',
    }
    const norm = (x: string) => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    for (const [q, id] of Object.entries(attendu)) {
      const sp = SPECIES_BY_ID[id]
      expect(sp, id).toBeDefined()
      expect([sp.nomCommun, ...(sp.alias ?? [])].some((n) => norm(n).includes(q)), `${q} → ${id}`).toBe(true)
    }
    expect(SPECIES.filter((s) => (s.alias ?? []).some((a) => a.normalize('NFD').toLowerCase().includes('courge'))).length).toBeGreaterThanOrEqual(4)
  })

  it('accompagne chaque risque d’un avertissement de 20 mots au plus', () => {
    for (const s of SPECIES) {
      expect(Boolean(s.risque?.length), s.id).toBe(Boolean(s.risqueNote))
      if (s.risqueNote) expect(s.risqueNote.trim().split(/\s+/).length, s.id).toBeLessThanOrEqual(20)
    }
    for (const id of ['robinier', 'ail-des-ours', 'rhubarbe', 'tanaisie', 'lupin', 'laurier-palme', 'buis', 'if', 'hortensia']) {
      expect(SPECIES_BY_ID[id].risque?.length, id).toBeGreaterThan(0)
    }
    expect(SPECIES_BY_ID.robinier.risque).toContain('invasive')
    expect(SPECIES_BY_ID['ail-des-ours'].entretien).toMatch(/colchique/)
  })

  it('ne donne aucun dosage de cuivre de professionnel et renvoie à l’étiquette', () => {
    for (const s of SPECIES) {
      for (const t of s.taches) {
        expect(t.howTo, s.id).not.toMatch(/kg de cuivre|\d+ ?g\/L.*bordelaise/i)
        if (/bordelaise|cuivr/i.test(t.howTo)) expect(t.howTo, s.id).toMatch(/étiquette/)
      }
    }
  })

  it('taille les Prunus d’été (cerisier, prunier, mirabellier, abricotier, amandier) en juillet-septembre, jamais en automne ni en hiver', () => {
    for (const id of ['cerisier', 'prunier', 'mirabellier', 'abricotier', 'amandier']) {
      const mois = SPECIES_BY_ID[id].taches.filter((t) => t.type === 'taille' && t.months.length && !/drageons|Arracher/.test(t.howTo)).flatMap((t) => t.months)
      expect(mois.every((m) => m >= 7 && m <= 9), id).toBe(true)
    }
  })
})

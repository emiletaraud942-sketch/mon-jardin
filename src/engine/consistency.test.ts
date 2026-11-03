import { describe, expect, it } from 'vitest'
import type { Month, Species } from '../types'
import { SPECIES } from '../data/species'
import { calendarConsistency, calendarConsistencyAll, type CalendarGap } from './consistency'

const base: Species = {
  id: 'test', nomCommun: 'Test', nomLatin: '', famille: 'Test', categorie: 'legume', strate: 'herbacee', vivace: false, comestible: true,
  soleil: ['plein-soleil'], eau: 'moyen', rusticiteC: -10, hauteurAdulteM: 1, envergureAdulteM: 0.5, anneesMaturite: 1, espacementCm: 30,
  compagnons: [], antagonistes: [], taches: [], entretien: '', couleur: '#4a4',
}

describe('calendarConsistency (fonction)', () => {
  it('fiche sans tâche explicite : le semis en pleine terre et la récolte de la fiche donnent des tâches, aucun écart', () => {
    expect(calendarConsistency({ ...base, semisPleineTerre: [3, 4], recolte: [6, 7] })).toEqual([])
  })

  it('semis à l’abri sans tâche : écart « sans-tache » (cas de la laitue)', () => {
    const gaps = calendarConsistency({ ...base, semisAbri: [1, 2], semisPleineTerre: [3, 4] })
    expect(gaps).toHaveLength(1)
    expect(gaps[0]).toMatchObject({ kind: 'semis', issue: 'sans-tache', months: [1, 2] })
    expect(gaps[0].detail).toMatch(/janv\., févr\./)
  })

  it('récolte « toute l’année » mais tâche explicite d’août à septembre : écart (cas du laurier-sauce)', () => {
    const sp: Species = {
      ...base, vivace: true, recolte: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      taches: [{ type: 'recolte', months: [8, 9], howTo: '' }],
    }
    const g = calendarConsistency(sp)
    expect(g).toHaveLength(1)
    expect(g[0]).toMatchObject({ kind: 'recolte', issue: 'sans-tache', months: [1, 2, 3, 4, 5, 6, 7, 10, 11, 12] })
  })

  it('tâche de récolte hors des mois de la fiche : « tache-hors-fiche »', () => {
    const g = calendarConsistency({ ...base, vivace: true, recolte: [9], taches: [{ type: 'recolte', months: [9, 10], howTo: '' }] })
    expect(g).toEqual([expect.objectContaining({ kind: 'recolte', issue: 'tache-hors-fiche', months: [10] })])
  })

  it('une plantation explicite ne remplace pas un semis annoncé (cas de la courgette)', () => {
    const g = calendarConsistency({ ...base, semisPleineTerre: [5, 6], plantation: [5, 6], taches: [{ type: 'plantation', months: [5, 6], howTo: '' }] })
    expect(g).toEqual([expect.objectContaining({ kind: 'semis', issue: 'sans-tache', months: [5, 6] })])
  })
})

/**
 * Liste blanche des écarts connus sur les 146 fiches. Elle est VIDE : l'agronome a corrigé les 47 écarts de départ
 * (38 fiches ; liste historique dans le scratchpad `ecarts-calendriers.md`). Toute nouvelle fiche ou modification
 * qui crée un écart fait échouer le test ci-dessous : corriger la fiche (ou la règle `taches`), ou, en dernier recours,
 * ajouter l'écart ici avec les mois exacts. Un écart qui rétrécit reste accepté ; retirer alors l'entrée.
 */
const KNOWN_GAPS: { key: string; months: Month[] }[] = []

const keyOf = (g: CalendarGap) => `${g.speciesId}:${g.kind}:${g.issue}`

describe('calendarConsistency (146 fiches)', () => {
  it('aucun nouvel écart au-delà de la liste blanche', () => {
    const fresh = calendarConsistencyAll(SPECIES).filter((g) => {
      const known = KNOWN_GAPS.find((k) => k.key === keyOf(g))
      return !known || !g.months.every((m) => known.months.includes(m))
    })
    expect(fresh.map((g) => g.detail)).toEqual([])
  })

  it('la liste blanche ne contient pas d’entrée sans objet (écart déjà corrigé)', () => {
    const found = new Set(calendarConsistencyAll(SPECIES).map(keyOf))
    expect(KNOWN_GAPS.filter((k) => !found.has(k.key)).map((k) => k.key)).toEqual([])
  })
})

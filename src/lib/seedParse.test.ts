import { describe, expect, it } from 'vitest'
import { fixDigits, guessSeedName, monthsText, parseSeedDates, parseSeedText, parseSowMonths, seedProposal } from './seedParse'

const NOW = new Date(2026, 10, 16)
const read = (t: string) => parseSeedText(t, NOW)

// Dix textes de sachets, tels qu'un OCR les rend : majuscules, accents perdus, lignes coupées, bruit.
const SACHETS: { titre: string; texte: string; name?: string; speciesId?: string; at?: string; note?: string; sow?: number[] }[] = [
  {
    titre: 'tomate, récolte en année seule',
    texte: 'TOMATE\nMarmande\nSemis : mars à mai\nRécolte 2025\nSachet de 1 g',
    name: 'Tomate', speciesId: 'tomate', note: 'Récolte 2025', sow: [3, 4, 5],
  },
  {
    titre: 'carotte, à semer avant (pas une période de semis)',
    texte: 'Carotte Nantaise 2\nA SEMER AVANT FIN MARS 2027\nSemer de mars à juillet en pleine terre\nPoids net : 5 g',
    name: 'Carotte', speciesId: 'carotte', note: 'À semer avant mars 2027', sow: [3, 4, 5, 6, 7],
  },
  {
    titre: 'basilic, lot et emballage en mois/année',
    texte: 'BASILIC GRAND VERT\nLOT 03/2026\nBio - Ecocert\nSemis: avril - juin',
    name: 'Basilic', speciesId: 'basilic', at: '2026-03-01', sow: [4, 5, 6],
  },
  {
    titre: 'courgette, emballé le jour exact, accents perdus',
    texte: 'COURGETTE VERTE DES MARAICHERS\nEmballe le 12.03.2026\nA utiliser de preference avant 12/2028\nSemis en place : mai, juin',
    name: 'Courgette', speciesId: 'courgette', at: '2026-03-12', sow: [5, 6],
  },
  {
    titre: 'radis, bruit d’OCR dans l’année et caractères parasites',
    texte: '| RADIS |\nRose de Sainte-Ci0tat ~\nRécolte: 1O/2O25\nSemer de mars a septembre',
    name: 'Radis', speciesId: 'radis', at: '2025-10-01', sow: [3, 4, 5, 6, 7, 8, 9],
  },
  {
    titre: 'haricot grimpant, récolte et mois en toutes lettres',
    texte: 'Haricot à rames\n« Coco de Paimpol »\nGraines récoltées en septembre 2025\nsemis mai juin',
    name: 'Haricot à rames', speciesId: 'haricot-grimpant', at: '2025-09-01', sow: [5, 6],
  },
  {
    titre: 'sachet de variété inconnue du catalogue : la ligne la plus plausible',
    texte: 'GOMBO\nClemson sans épines\nSachet 4 g\nwww.graines-du-sud.fr\nLot n° 24B15',
    name: 'Gombo',
  },
  {
    titre: 'sans aucune date lisible : rien d’inventé',
    texte: 'CAPUCINE NAINE\nMélange de couleurs\nSemis direct dès que le sol est réchauffé',
    name: 'Capucine', speciesId: 'capucine',
  },
  {
    titre: 'laitue, date limite en chiffres',
    texte: 'LAITUE BATAVIA BLONDE\nDate limite : 06/2027\nSemis de mars à août\nRécolte : 2026',
    name: 'Laitue', speciesId: 'laitue', note: 'Récolte 2026', sow: [3, 4, 5, 6, 7, 8],
  },
  {
    titre: 'tournesol, lot, jour complet, mois de semis en abréviations',
    texte: 'Tournesol géant\nconditionné le 3 mars 2026\nsemis avr. - mai\nHauteur 250 cm',
    name: 'Tournesol', speciesId: 'tournesol', at: '2026-03-03', sow: [4, 5],
  },
]

describe('parseSeedText : dix sachets réalistes', () => {
  for (const s of SACHETS) {
    it(s.titre, () => {
      const f = read(s.texte)
      const p = seedProposal(f)
      expect(f.name).toBe(s.name)
      expect(f.speciesId).toBe(s.speciesId)
      expect(p.at).toBe(s.at)
      expect(p.note).toBe(s.note)
      expect(f.sowMonths).toEqual(s.sow ?? [])
    })
  }
})

describe('dates : jamais inventées', () => {
  it('sans date lisible, aucune date et rien dans la proposition', () => {
    expect(parseSeedDates('TOMATE\nSachet de 1 g\nwww.graines.fr', NOW)).toEqual([])
    expect(seedProposal(read('TOMATE')).at).toBeUndefined()
  })
  it('une année seule n’est jamais transformée en jour', () => {
    const [d] = parseSeedDates('Récolte 2025', NOW)
    expect(d).toMatchObject({ kind: 'recolte', precision: 'annee', year: 2025 })
    expect(d.iso).toBeUndefined()
  })
  it('« à semer avant » est une limite, pas une date de récolte : elle va dans la note', () => {
    const f = read('Poireau\nà semer avant fin 03/2027')
    expect(f.dates[0]).toMatchObject({ kind: 'avant', iso: '2027-03-31' })
    expect(seedProposal(f)).toMatchObject({ note: 'À semer avant mars 2027' })
    expect(seedProposal(f).at).toBeUndefined()
  })
  it('la récolte passe avant l’emballage, l’emballage avant « avant »', () => {
    const kinds = parseSeedDates('à utiliser avant 2028. Emballé en 02/2026. Récolte 08/2025', NOW).map((d) => d.kind)
    expect(kinds).toEqual(['recolte', 'emballage', 'avant'])
  })
  it('refuse les dates impossibles ou absurdes (OCR : 31/02, an 2095, récolte dans le futur)', () => {
    expect(parseSeedDates('emballé le 31/02/2025', NOW)).toEqual([])
    expect(parseSeedDates('récolte 2095', NOW)).toEqual([])
    expect(parseSeedDates('récolte 2031', NOW)).toEqual([])
    expect(parseSeedDates('lot 13/2025', NOW)).toEqual([])
  })
  it('un numéro de lot n’est pas une date', () => {
    expect(parseSeedDates('LOT 24B15 - 2025ABC', NOW)).toEqual([])
    expect(parseSeedDates('Lot n° 120325', NOW)).toEqual([])
  })
  it('mois et année seuls, sans mot-clé : date « autre »', () => {
    expect(parseSeedDates('Graines\nmars 2025', NOW)[0]).toMatchObject({ kind: 'autre', iso: '2025-03-01' })
    expect(parseSeedDates('Graines 03/2025', NOW)[0]).toMatchObject({ kind: 'autre', iso: '2025-03-01' })
  })
  it('corrige le bruit d’OCR dans les nombres seulement', () => {
    expect(fixDigits('2O25')).toBe('2025')
    expect(fixDigits('1l/2O25')).toBe('11/2025')
    expect(fixDigits('Tomate Olivette')).toBe('Tomate Olivette')
  })
})

describe('mois de semis : information seulement', () => {
  it('plage, liste, abréviations, plage qui passe l’année', () => {
    expect(parseSowMonths('Semis : mars à mai')).toEqual([3, 4, 5])
    expect(parseSowMonths('Semer en avril, mai et juin')).toEqual([4, 5, 6])
    expect(parseSowMonths('SEMIS sept.-nov.')).toEqual([9, 10, 11])
    expect(parseSowMonths('Semis de novembre à février')).toEqual([1, 2, 11, 12])
  })
  it('ne prend pas les mois d’une récolte, d’une date ou d’un autre texte', () => {
    expect(parseSowMonths('Semis mars-avril\nRécolte juillet à octobre')).toEqual([3, 4])
    expect(parseSowMonths('À semer avant fin mars 2027')).toEqual([])
    expect(parseSowMonths('Récolte en septembre 2025')).toEqual([])
    expect(parseSowMonths('Sachet de 5 g')).toEqual([])
  })
  it('se dit en une phrase', () => {
    expect(monthsText([3, 4, 5])).toBe('mars, avril et mai')
    expect(monthsText([6])).toBe('juin')
    expect(monthsText([])).toBe('')
  })
})

describe('nom proposé', () => {
  it('le catalogue d’abord : nom usuel, accents et majuscules ignorés', () => {
    expect(read('COURGETTE').name).toBe('Courgette')
    expect(read('Radis Noir de Gournay\nsemis juillet').speciesId).toBe('radis-noir')
    expect(read('CAROTTES\nde Colmar').name).toBe('Carotte')
  })
  it('sinon la ligne la plus plausible : pas de bruit, pas de chiffres, au début du sachet', () => {
    expect(guessSeedName(['Sachet de 5 g', 'www.graines.fr', 'PHYSALIS DU PEROU', 'Semis mars'])).toBe('Physalis du perou')
    expect(guessSeedName(['12345', '--', 'Semis : mars à mai'])).toBeUndefined()
  })
  it('un texte vide ne propose rien', () => {
    const f = read('')
    expect(f).toEqual({ dates: [], sowMonths: [] })
    expect(seedProposal(f)).toEqual({})
  })
})

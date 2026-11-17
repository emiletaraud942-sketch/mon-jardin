import { describe, expect, it } from 'vitest'
import { classifyLabel, parseContent, parseDepthCm, parseGerminationDays, parseLabelScan, parseSpacingCm, parseSun } from './labelFacts'

const NOW = new Date(2026, 10, 17)

describe('étiquettes et sachets : tout lire', () => {
  const SACHET = 'TOMATE\nMarmande\nSemis : mars à mai\nRécolte : juillet à octobre\nProfondeur de semis : 0,5 à 1 cm\nGermination : 8 à 12 jours\nDistance entre les plants : 50 cm\nExposition : plein soleil\nPoids net : 1 g\nRécolte 2025'

  it('un sachet complet', () => {
    const r = parseLabelScan(SACHET, NOW)
    expect(r.kind).toBe('sachet')
    expect(r.seed.name).toBe('Tomate')
    expect(r.species?.id).toBe('tomate')
    expect(r.seed.sowMonths).toEqual([3, 4, 5])
    expect(r.extras.recolteMois).toEqual([7, 8, 9, 10])
    expect(r.extras.profondeurCm).toBe(0.8)
    expect(r.extras.leveeJours).toBe(10)
    expect(r.extras.espacementCm).toBe(50)
    expect(r.extras.soleil).toBe('soleil')
    expect(r.extras.contenu).toBe('1 g')
  })

  it('une étiquette de pépinière', () => {
    const r = parseLabelScan("Malus domestica 'Reine des reinettes'\nPommier\nDemi-tige - racines nues\nHauteur 150-170 cm\n24,90 €", NOW)
    expect(r.kind).toBe('plante')
    expect(r.species?.id).toBe('pommier')
    expect(r.label.form).toBe('demi-tige')
    expect(r.extras.prixEur).toBe(24.9)
    expect(r.extras.hauteurCm).toBe(160)
  })

  it('un texte sans rapport ne propose rien', () => {
    const r = parseLabelScan('Bonjour\nrendez-vous mardi\nà bientôt', NOW)
    expect(r.kind).toBe('autre')
    expect(r.species).toBeUndefined()
    expect(r.extras).toEqual({ recolteMois: [] })
  })

  it('profondeur : mm convertis, aberrations refusées', () => {
    expect(parseDepthCm('profondeur 10 mm')).toBe(1)
    expect(parseDepthCm('profondeur 2 cm')).toBe(2)
    expect(parseDepthCm('profondeur 400 cm')).toBeUndefined()
    expect(parseDepthCm('pas de profondeur ici')).toBeUndefined()
  })
  it('espacement, levée, soleil, contenu', () => {
    expect(parseSpacingCm('Ecartement entre lignes 30-40 cm')).toBe(35)
    expect(parseGerminationDays('levée en 10 jours')).toBe(10)
    expect(parseGerminationDays('germination 3 mois')).toBeUndefined()
    expect(parseSun('Mi-ombre')).toBe('mi-ombre')
    expect(parseSun('Soleil ou mi-ombre')).toBe('mi-ombre')
    expect(parseSun('à l’ombre')).toBe('ombre')
    expect(parseContent('Contenu 2,5 g')).toBe('2,5 g')
    expect(parseContent('environ 150 graines')).toBe('150 graines')
  })
  it('classement', () => {
    expect(classifyLabel('graines à semer en mars, sachet de 2 g')).toBe('sachet')
    expect(classifyLabel('Lavande en godet, hauteur 30 cm, rusticité -15')).toBe('plante')
    expect(classifyLabel('facture n° 123')).toBe('autre')
  })
})

describe('étiquettes réelles : formulations variées (banc d’essai scripts/qa/ocr-bench)', () => {
  it('lit la profondeur avant le mot, l’espacement en verbe et la mi-ombre coupée', () => {
    const t = 'CAROTTE\nSemer à 1 cm de profondeur\nEspacer de 5 cm\nMi -ombre\nPoids net : 5 g'
    expect(parseDepthCm(t)).toBe(1)
    expect(parseSpacingCm(t)).toBe(5)
    expect(parseSun(t)).toBe('mi-ombre')
    expect(parseDepthCm('Enterrer à 0,5 cm')).toBe(0.5)
    expect(parseSpacingCm('Laisser 30 cm entre les plants')).toBe(30)
  })
  it('ne prend pas une distance de plantation pour une hauteur sur un sachet', () => {
    const t = 'TOMATE\nSemis : mars à mai\nGermination : 8 à 12 jours\nDistance entre plants : 50 cm\nProfondeur : 1 cm'
    expect(parseLabelScan(t).extras.hauteurCm).toBeUndefined()
    expect(parseLabelScan('LAVANDE\nGodet 1 L\nVariété Hidcote\nHauteur 60 cm').extras.hauteurCm).toBe(60)
  })
  it('distingue haricot nain et haricot à rames par le mot en plus', () => {
    expect(parseLabelScan('HARICOT\nHaricot vert nain\nSemis : mai à juillet\nProfondeur : 3 cm').species?.id).toBe('haricot-nain')
    expect(parseLabelScan('HARICOT\nHaricot à rames\nSemis : mai à juillet\nProfondeur : 3 cm').species?.id).toBe('haricot-grimpant')
  })
})

describe('formulations de sachets et de prix (trouvées par le banc d’essai)', () => {
  it('lit mois en chiffres, semaines, grille 40 x 60 et mm', () => {
    const t = 'Poireau\nSemis : 03 à 05\nRécolte : 09 à 12\nProfondeur : 10 mm\nLevée 2 semaines\nDistance de plantation : 40 x 60 cm'
    const r = parseLabelScan(t)
    expect(r.seed.sowMonths).toEqual([3, 4, 5])
    expect(r.extras.recolteMois).toEqual([9, 10, 11, 12])
    expect(r.extras.profondeurCm).toBe(1)
    expect(r.extras.leveeJours).toBe(14)
    expect(r.extras.espacementCm).toBe(40)
  })
  it('un prix n’est jamais lu dans « Hauteur 50 cm » ni sur la ligne d’à côté', () => {
    expect(parseLabelScan('LAVANDE\nGodet 1 L\nHauteur 50 cm\n5€90').extras.prixEur).toBe(5.9)
    expect(parseLabelScan('Rosier\nPot C3\n€ 14,90\nHauteur 80 cm').extras.prixEur).toBe(14.9)
    expect(parseLabelScan('Poireau\nProfondeur 1 cm').extras.prixEur).toBeUndefined()
    expect(parseLabelScan('Thym\nPot 9 cm\n3,50 EUR').extras.prixEur).toBe(3.5)
  })
})

describe('sachets et étiquettes en anglais', () => {
  it('lit un sachet anglais : mois, profondeur, espacement, germination, soleil, plante', () => {
    const t = 'BASIL\nGenovese\nSow indoors March to May\nHarvest June - September\nSeed depth 0.25 inch\nSpacing 10 inches apart\nGermination 5-10 days\nFull sun\nNet wt. 1 g'
    const r = parseLabelScan(t)
    expect(r.kind).toBe('sachet')
    expect(r.species?.id).toBe('basilic')
    expect(r.seed.sowMonths).toEqual([3, 4, 5])
    expect(r.extras.recolteMois).toEqual([6, 7, 8, 9])
    expect(r.extras.profondeurCm).toBe(0.6)
    expect(r.extras.espacementCm).toBe(25)
    expect(r.extras.leveeJours).toBe(8)
    expect(r.extras.soleil).toBe('soleil')
    expect(r.extras.hauteurCm).toBeUndefined()
    expect(r.extras.contenu).toBe('1 g')
  })
  it('lit « sow 1 cm deep », « thin to 30 cm », « partial shade »', () => {
    const t = 'CARROT\nSow Feb-Jul\nSow 1 cm deep\nThin to 5 cm\nPartial shade'
    expect(parseDepthCm(t)).toBe(1)
    expect(parseSpacingCm(t)).toBe(5)
    expect(parseSun(t)).toBe('mi-ombre')
    expect(parseLabelScan(t).seed.sowMonths).toEqual([2, 3, 4, 5, 6, 7])
  })
  it('étiquette de plante en anglais : forme et hauteur', () => {
    const r = parseLabelScan('LAVENDER\nLavandula angustifolia\nPotted 1 L\nHeight: 60 cm\nFull sun')
    expect(r.kind).toBe('plante')
    expect(r.extras.hauteurCm).toBe(60)
    expect(r.label.form).toBe('godet')
    expect(r.species?.id).toBe('lavande')
  })
})

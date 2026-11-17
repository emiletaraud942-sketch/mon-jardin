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

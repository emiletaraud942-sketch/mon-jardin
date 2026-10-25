/** Libellés de l'identification par photo, en mots simples. */

/** « Probable à 87 % ». */
export function confidenceLabel(score: number): string {
  const pct = Math.max(0, Math.min(100, Math.round(score * 100)))
  return `Probable à ${pct} %`
}

/** Phrase pour une espèce qui a (ou non) une fiche dans la liste de l'appli. */
export function listLabel(inList: boolean, approx: boolean): string {
  if (!inList) return 'Pas dans notre liste'
  return approx ? 'Plante proche dans notre liste' : 'Dans notre liste'
}

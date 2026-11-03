// Reformulation en mots simples des libellés « Pourquoi ? » de l'adéquation (planting.ts).
// Fonction pure : elle ne touche ni aux scores ni aux libellés d'origine (qui restent la référence des tests).

const SUN_WORD: Record<string, string> = { 'plein-soleil': 'plein soleil', 'mi-ombre': 'soleil par moments', ombre: 'ombre' }

/** « plein-soleil, mi-ombre » → « plein soleil, soleil par moments ». */
const sunWords = (list: string) =>
  list
    .split(/\s*,\s*/)
    .map((s) => SUN_WORD[s.trim()] ?? s.trim())
    .join(', ')

/** Mots techniques restants, remplacés où qu'ils soient (avertissements compris). */
function generic(text: string): string {
  return text
    .replace(/(\d+(?:,\d+)?)\s*h\/j/g, '$1 h de soleil par jour')
    .replace(/plein-soleil/g, 'plein soleil')
    .replace(/mi-ombre/g, 'soleil par moments')
    .replace(/\bhivers ≈ /g, 'hivers vers ')
}

const RULES: [RegExp, (m: RegExpExecArray) => string][] = [
  [/^Ensoleillement adapté \((.+?) h\/j, [^)]*\)$/, (m) => `Assez de soleil ici : environ ${m[1]} h par jour`],
  [
    /^Ensoleillement peu adapté \((.+?) h\/j, ([^ ;]+) ; aime : (.+)\)$/,
    (m) => `Pas le bon soleil ici : environ ${m[1]} h par jour (${sunWords(m[2])}) ; elle préfère ${sunWords(m[3]).replace(/, /g, ' ou ')}`,
  ],
  [/^Compagnons à proximité : (.+)$/, (m) => `Bons voisins tout près : ${m[1]}`],
  [/^Mauvais voisins à moins de 3 m : (.+)$/, (m) => `Mauvais voisins à moins de 3 m : ${m[1]}`],
  [/^Espacement insuffisant avec les plantes voisines$/, () => 'Trop serrée : les plantes voisines sont trop près'],
  [
    /^Fixateur d['’]azote à proximité : (.+)$/,
    (m) => `Une plante qui nourrit le sol est tout près (${m[1]}) : de l’engrais naturel pour elle`,
  ],
  [
    /^Proche de la limite de parcelle \(art\. 671 si c['’]est un voisin\)$/,
    () => 'Près de la limite du terrain : si c’est chez un voisin, il faut garder une distance',
  ],
  [
    /^Rusticité limite \((-?\d+(?:,\d+)?) °C, hivers ≈ (-?\d+(?:,\d+)?) °C (observés|estimés)\)$/,
    (m) => `Craint le froid : elle supporte ${m[1]} °C et vos hivers descendent vers ${m[2]} °C${m[3] === 'estimés' ? ' (estimation)' : ''}`,
  ],
  [/^Rustique dans votre climat$/, () => 'Résiste bien au froid de chez vous'],
  [/^Sol (.+) apprécié$/, (m) => `Votre sol (${m[1]}) lui convient`],
  [/^Sol (.+?) peu adapté \(préfère : (.+)\)$/, (m) => `Votre sol (${m[1]}) lui convient moins ; elle préfère ${m[2].replace(/, /g, ' ou ')}`],
  [/^Pente de (\d+) % : peu pratique pour une annuelle$/, (m) => `Terrain en pente (${m[1]} %) : peu pratique pour une plante à semer chaque année`],
  [/^C['’]est le moment : (.+)$/, (m) => `C’est la bonne période : ${m[1]}`],
]

/**
 * Libellé simple d'un facteur ou d'un avertissement de `scoreSpecies`. Un texte inconnu est gardé,
 * seuls ses mots techniques (« h/j », « mi-ombre »…) sont remplacés.
 */
export function plainReason(text: string): string {
  for (const [re, fn] of RULES) {
    const m = re.exec(text)
    if (m) return fn(m)
  }
  return generic(text)
}

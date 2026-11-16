// Météo en langage clair pour l'écran Entretien. Les chiffres (mm) restent dans « Détails météo ».

export interface WaterBalanceLike {
  rain7: number
  et07: number
  deficitMm: number
  forecastRain3: number
}

/** Une phrase sur le sol, une phrase sur les 3 prochains jours. */
export function weatherSentences(wb: WaterBalanceLike): string[] {
  const out: string[] = []
  if (wb.deficitMm > 0) {
    out.push(wb.forecastRain3 >= wb.deficitMm ? 'Le sol est sec, mais de la pluie arrive.' : 'Pas assez de pluie ces 7 jours : arrosez les jeunes plantations.')
  } else {
    out.push('Il a assez plu ces 7 jours. Le sol est bien humide.')
  }
  out.push(wb.forecastRain3 >= 1 ? 'De la pluie est prévue dans les 3 prochains jours.' : 'Pas de pluie prévue dans les 3 prochains jours.')
  return out
}

/** Pluie du jour : mot court, sans chiffre. */
export const rainWord = (mm: number) => (mm >= 5 ? 'Pluie' : mm >= 0.5 ? 'Averses' : 'Sec')

/**
 * Les deux températures d'un jour, toujours avec leur mot. Choix d'écriture, le même partout dans l'appli :
 * « jour » = la plus haute de la journée, « nuit » = la plus basse (souvent au petit matin). Jamais un nombre seul.
 */
export const TEMP_WORD = { jour: 'Jour', nuit: 'Nuit' } as const

/** Phrase d'explication, sous les chiffres de la météo et dans l'aide. */
export const TEMP_LEGEND = '« Jour » : le plus chaud de la journée. « Nuit » : le plus froid, souvent au petit matin.'

/** Degrés arrondis, avec un vrai signe moins (−3) et jamais de « −0 ». */
export function degrees(t: number): string {
  const n = Math.round(t)
  return n < 0 ? '−' + Math.abs(n) : String(Math.abs(n))
}

export interface DayTemps {
  /** « 14° » : la plus haute, le jour. */
  jour: string
  /** « −3° » : la plus basse, la nuit. */
  nuit: string
  /** Il gèle : 0 °C ou moins la nuit. */
  frost: boolean
  /** Pour une liste : « le jour 14 °C, la nuit −3 °C (gel) ». */
  text: string
  /** Pour un lecteur d'écran : « le jour 14 degrés, la nuit −3 degrés, gel ». */
  spoken: string
}

export function dayTemps(d: { tMin: number; tMax: number }): DayTemps {
  const jour = degrees(d.tMax)
  const nuit = degrees(d.tMin)
  const frost = d.tMin <= 0
  return {
    jour: jour + '°',
    nuit: nuit + '°',
    frost,
    text: `le jour ${jour} °C, la nuit ${nuit} °C${frost ? ' (gel)' : ''}`,
    spoken: `le jour ${jour} degrés, la nuit ${nuit} degrés${frost ? ', gel' : ''}`,
  }
}

const WEEKDAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']

/** Jour d'un `YYYY-MM-DD`, lu en heure locale (jamais en UTC : « 2026-11-04 » ne doit pas devenir la veille). */
function localDay(iso: string): Date | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : undefined
}

/**
 * Phrase d'alerte en tête de la liste « À faire » : « Gel prévu mardi, jusqu’à −3 °C la nuit. »
 * Les 7 prochains jours, gel à 0 °C ou moins (comme les tuiles de la semaine). Rien s'il n'y a pas de gel.
 */
export function frostSentence(forecast: { date: string; tMin: number }[], now: Date = new Date()): string | undefined {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const frosty: { when: string; tMin: number }[] = []
  for (const d of forecast.slice(0, 8)) {
    const day = localDay(d.date)
    if (!day || d.tMin > 0) continue
    const diff = Math.round((day.getTime() - today.getTime()) / 86400000)
    if (diff < 0 || diff > 6) continue
    frosty.push({ when: diff === 0 ? 'cette nuit' : diff === 1 ? 'demain' : WEEKDAYS[day.getDay()], tMin: d.tMin })
  }
  if (frosty.length === 0) return undefined
  const names = frosty.map((f) => f.when)
  const list = names.length === 1 ? names[0] : names.slice(0, -1).join(', ') + ' et ' + names[names.length - 1]
  const lowest = Math.round(Math.min(...frosty.map((f) => f.tMin)))
  // « cette nuit » dit déjà que c'est la température de la nuit.
  return `Gel prévu ${list}, jusqu’à ${degrees(lowest)} °C${list === 'cette nuit' ? '' : ' la nuit'}.`
}

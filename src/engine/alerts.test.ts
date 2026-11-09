import { describe, expect, it } from 'vitest'
import type { DailyWeather, WeatherBundle } from '../types'
import { sentencesOf, wordCount } from '../lib/sentences'
import {
  ALERT_BASE,
  ALERT_THRESHOLDS,
  HOWTO_CANICULE,
  HOWTO_SECHERESSE,
  HOWTO_VENT,
  alertHomeSentence,
  alertKey,
  detectAlerts,
  type WeatherAlert,
} from './alerts'
import { waterBalance } from './tasks'

// Dates en toutes lettres : le 9 novembre 2026 est un lundi.
const TODAY = new Date(2026, 10, 9, 9)

const addDays = (iso: string, n: number) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}
const mk = (date: string, over: Partial<DailyWeather> = {}): DailyWeather => ({ date, tMin: 12, tMax: 20, rainMm: 0, et0Mm: 1, ...over })

/** 7 jours passés avant `today`, 7 jours prévus à partir de `today`, modifiés par `past[i]` et `fc[i]`. */
function bundle(today: string, past: Partial<DailyWeather>[] = [], fc: Partial<DailyWeather>[] = []): WeatherBundle {
  return {
    fetchedAt: '2026-11-09T08:00:00Z',
    past: Array.from({ length: 7 }, (_, i) => mk(addDays(today, i - 7), past[i])),
    forecast: Array.from({ length: 7 }, (_, i) => mk(addDays(today, i), fc[i])),
  }
}
const TODAY_ISO = '2026-11-09'
const alerts = (w: WeatherBundle | undefined, today = TODAY) => detectAlerts(w, today, w ? waterBalance(w, today) : undefined)
const kinds = (w: WeatherBundle | undefined, today = TODAY) => alerts(w, today).map((a) => a.kind)
const hot = (t: number) => ({ tMax: t })
const T = ALERT_THRESHOLDS.caniculeTmaxC

describe('canicule', () => {
  it('3 jours de suite au seuil exact : alerte ; juste en dessous : rien', () => {
    expect(kinds(bundle(TODAY_ISO, [], [{}, hot(T), hot(T), hot(T)]))).toEqual(['canicule'])
    expect(kinds(bundle(TODAY_ISO, [], [{}, hot(T), hot(T), hot(T - 0.1)]))).toEqual([])
  })

  it('2 jours ne suffisent pas, 3 oui', () => {
    expect(kinds(bundle(TODAY_ISO, [], [hot(35), hot(35)]))).toEqual([])
    expect(kinds(bundle(TODAY_ISO, [], [hot(35), hot(35), hot(35)]))).toEqual(['canicule'])
  })

  it('3 jours chauds mais pas consécutifs : rien', () => {
    expect(kinds(bundle(TODAY_ISO, [], [hot(35), hot(35), hot(25), hot(35)]))).toEqual([])
  })

  it('un jour manquant dans la prévision coupe la série (dates réelles, pas rangs)', () => {
    const w = bundle(TODAY_ISO, [], [hot(35), hot(35), hot(35)])
    w.forecast.splice(1, 1) // le 10 novembre disparaît : 9, 11 → pas consécutifs
    expect(kinds(w)).toEqual([])
  })

  it('la série traverse un bord de mois (30 octobre → 1er novembre)', () => {
    const today = new Date(2026, 9, 30, 9)
    const w = bundle('2026-10-30', [], [hot(34), hot(34), hot(34)])
    const [a] = alerts(w, today)
    expect(a.kind).toBe('canicule')
    expect(a.date).toBe('2026-10-30')
    expect(a.reason).toContain("d'aujourd'hui à dimanche") // 1er novembre 2026 : dimanche
  })

  it('traverse aussi la fin d’année (31 décembre → 2 janvier)', () => {
    const today = new Date(2026, 11, 31, 9)
    expect(kinds(bundle('2026-12-31', [], [hot(33), hot(33), hot(33)]), today)).toEqual(['canicule'])
  })

  it('une vague commencée dans le passé compte : 2 jours passés + aujourd’hui', () => {
    const w = bundle(TODAY_ISO, [{}, {}, {}, {}, {}, hot(33), hot(34)], [hot(35), {}])
    const [a] = alerts(w)
    expect(a.kind).toBe('canicule')
    expect(a.date).toBe('2026-11-07') // la clé reste celle du 1er jour de la vague
    expect(a.reason).toContain('en cours')
    expect(a.reason).toContain("jusqu'à ce soir")
  })

  it('la clé ne bouge pas pendant la vague', () => {
    const w1 = bundle(TODAY_ISO, [], [hot(33), hot(33), hot(33), hot(33)])
    const next = new Date(2026, 10, 10, 9)
    const w2 = bundle('2026-11-10', [{}, {}, {}, {}, {}, {}, hot(33)], [hot(33), hot(33), hot(33)])
    expect(alertKey(alerts(w1)[0])).toBe(alertKey(alerts(w2, next)[0]))
  })

  it('une vague entièrement passée : rien', () => {
    expect(kinds(bundle(TODAY_ISO, [hot(35), hot(35), hot(35), hot(35), {}, {}, {}], []))).toEqual([])
  })

  it('maximum et jours cités dans les phrases', () => {
    const [a] = alerts(bundle(TODAY_ISO, [], [{}, {}, hot(33.4), hot(36.6), hot(34)]))
    expect(a.reason).toBe('Canicule prévue du mercredi au vendredi. Maximum prévu : 37 °C.')
    expect(a.detail).toContain('mercredi 33 °C, jeudi 37 °C, vendredi 34 °C')
    expect(a.detail).toContain('32 °C')
    expect(a.title).toContain('Canicule')
    expect(a.howTo).toBe(HOWTO_CANICULE)
  })

  it('« de demain à … » quand la vague commence demain', () => {
    const [a] = alerts(bundle(TODAY_ISO, [], [{}, hot(33), hot(33), hot(33)]))
    expect(a.reason).toContain('de demain à jeudi')
  })
})

describe('sécheresse', () => {
  const D = ALERT_THRESHOLDS.secheresseDeficitMm
  /** Passé avec un manque d'eau de `deficit` mm sur 7 jours (évaporation 1 mm de plus que la pluie, répartie). */
  const dry = (deficit: number, fc: Partial<DailyWeather>[] = []) =>
    bundle(TODAY_ISO, Array.from({ length: 7 }, () => ({ et0Mm: deficit / 7, rainMm: 0 })), fc)

  it('seuil exact : alerte ; juste en dessous : rien', () => {
    expect(kinds(dry(D))).toEqual(['secheresse'])
    expect(kinds(dry(D - 0.5))).toEqual([])
  })

  it('pluie prévue : 4,9 mm sous 5 jours → alerte, 5 mm → rien', () => {
    expect(kinds(dry(D, [{ rainMm: 4.9 }]))).toEqual(['secheresse'])
    expect(kinds(dry(D, [{ rainMm: 5 }]))).toEqual([])
    // une pluie au-delà du 5e jour ne compte pas
    expect(kinds(dry(D, [{}, {}, {}, {}, {}, { rainMm: 30 }]))).toEqual(['secheresse'])
  })

  it('la clé est celle du jour ; la phrase dit presque aucune pluie ou peu de pluie, sans « mm »', () => {
    const [none] = alerts(dry(D))
    expect(none.date).toBe(TODAY_ISO)
    expect(alertKey(none)).toBe(`2026-11-09:${ALERT_BASE.secheresse}`)
    expect(none.reason).toContain("presque aucune pluie n'est prévue")
    const [some] = alerts(dry(D, [{ rainMm: 3 }]))
    expect(some.reason).toContain('peu de pluie est prévue')
    expect(none.reason).not.toMatch(/\bmm\b/)
    expect(none.detail).toContain('Pluie des 7 derniers jours')
    expect(none.howTo).toBe(HOWTO_SECHERESSE)
  })

  it('pas assez de jours passés ou de prévision : aucune alerte, aucune erreur', () => {
    const few = dry(60)
    few.past = few.past.slice(-4)
    expect(kinds(few)).toEqual([])
    const noForecast = dry(60)
    noForecast.forecast = noForecast.forecast.slice(0, 2)
    expect(kinds(noForecast)).toEqual([])
    const noPast = dry(60)
    noPast.past = []
    expect(kinds(noPast)).toEqual([])
  })

  it('sans bilan : rien', () => {
    expect(detectAlerts(dry(60), TODAY)).toEqual([])
  })

  it('une prévision déjà périmée (tous les jours avant aujourd’hui) : rien', () => {
    const old = bundle('2026-10-20', Array.from({ length: 7 }, () => ({ et0Mm: 9, rainMm: 0 })), [])
    expect(kinds(old)).toEqual([])
  })
})

describe('vent fort', () => {
  const G = ALERT_THRESHOLDS.ventGustKmh
  const gust = (g: number | undefined) => ({ gustKmh: g })

  it('seuil exact : alerte ; juste en dessous : rien', () => {
    expect(kinds(bundle(TODAY_ISO, [], [gust(G)]))).toEqual(['vent'])
    expect(kinds(bundle(TODAY_ISO, [], [gust(G - 0.1), gust(40), gust(59.9)]))).toEqual([])
  })

  it('rafales absentes (ancien cache, autre fournisseur) : rien, sans erreur', () => {
    const w = bundle(TODAY_ISO, [], [{}, {}, {}])
    expect(w.forecast.every((d) => d.gustKmh === undefined)).toBe(true)
    expect(kinds(w)).toEqual([])
    expect(kinds(bundle(TODAY_ISO, [], [gust(undefined), gust(80)]))).toEqual(['vent']) // un jour manquant n'efface pas les autres
  })

  it('seulement les 3 prochains jours', () => {
    expect(kinds(bundle(TODAY_ISO, [], [{}, {}, gust(70)]))).toEqual(['vent'])
    expect(kinds(bundle(TODAY_ISO, [], [{}, {}, {}, gust(90)]))).toEqual([])
  })

  it('un coup de vent passé n’alerte pas', () => {
    expect(kinds(bundle(TODAY_ISO, [gust(100)], []))).toEqual([])
  })

  it('premier jour dans la clé, plus forte rafale dans la phrase', () => {
    const [a] = alerts(bundle(TODAY_ISO, [], [{}, gust(65), gust(85.4)]))
    expect(a.date).toBe('2026-11-10')
    expect(a.reason).toBe("Vent fort prévu demain (65 km/h), jusqu'à 85 km/h mercredi.")
    expect(a.detail).toContain('demain 65 km/h, mercredi 85 km/h')
    const [b] = alerts(bundle(TODAY_ISO, [], [gust(72)]))
    expect(b.reason).toBe("Vent fort prévu aujourd'hui : rafales jusqu'à 72 km/h.")
    expect(b.howTo).toBe(HOWTO_VENT)
  })
})

describe('ensemble', () => {
  it('sans météo : aucune alerte', () => {
    expect(detectAlerts(undefined, TODAY)).toEqual([])
  })

  it('météo calme : aucune alerte', () => {
    expect(kinds(bundle(TODAY_ISO))).toEqual([])
  })

  it('plusieurs alertes ensemble, dans l’ordre canicule, sécheresse, vent', () => {
    const past = Array.from({ length: 7 }, () => ({ et0Mm: 6, rainMm: 0 }))
    const w = bundle(TODAY_ISO, past, [{ tMax: 36, gustKmh: 70 }, hot(36), hot(36)])
    expect(kinds(w)).toEqual(['canicule', 'secheresse', 'vent'])
  })

  it('les clés des trois alertes sont distinctes et sans collision avec le gel', () => {
    const keys = Object.values(ALERT_BASE)
    expect(new Set(keys).size).toBe(3)
    expect(keys).not.toContain('jardin:protection:gel')
  })

  it('les textes : 20 mots au plus par phrase, conseils de 6 phrases au plus', () => {
    const past = Array.from({ length: 7 }, () => ({ et0Mm: 6, rainMm: 0 }))
    const all: WeatherAlert[] = alerts(bundle(TODAY_ISO, past, [{ tMax: 36, gustKmh: 90 }, { tMax: 36, gustKmh: 70 }, hot(36)]))
    expect(all).toHaveLength(3)
    for (const a of all) {
      for (const text of [a.title, a.reason, a.detail, a.howTo]) {
        for (const s of sentencesOf(text)) expect(wordCount(s), `${a.kind} : « ${s} »`).toBeLessThanOrEqual(20)
      }
      expect(sentencesOf(a.howTo).length).toBeLessThanOrEqual(6)
    }
  })

  it('phrase de l’accueil : une alerte, plusieurs, aucune', () => {
    expect(alertHomeSentence([])).toBeUndefined()
    expect(alertHomeSentence(['canicule'])).toBe('Canicule prévue : arrosez le soir.')
    expect(alertHomeSentence(['vent'])).toContain('Vent fort')
    expect(alertHomeSentence(['canicule', 'vent'])).toBe('Alertes : canicule et vent fort.')
    expect(alertHomeSentence(['canicule', 'secheresse', 'vent'])).toBe('Alertes : canicule, sécheresse et vent fort.')
    expect(alertHomeSentence(['vent', 'vent'])).toContain('Vent fort')
    for (const k of ['canicule', 'secheresse', 'vent'] as const) {
      for (const s of sentencesOf(alertHomeSentence([k])!)) expect(wordCount(s)).toBeLessThanOrEqual(20)
    }
  })
})

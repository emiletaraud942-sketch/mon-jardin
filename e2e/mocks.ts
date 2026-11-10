import type { Page, Route } from '@playwright/test'

// Réponses minimales et plausibles des services externes. Rien ne sort vers Internet : toute requête hors de notre origine est refusée
// et notée dans `external` (le test échoue si elle n'est pas vide).
const LON = 4.8357
const LAT = 45.764
// Pixel PNG transparent : tuiles de carte et photos aériennes.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64')

const square = (d: number) => [[[LON - d, LAT - d], [LON + d, LAT - d], [LON + d, LAT + d], [LON - d, LAT + d], [LON - d, LAT - d]]]
const place = { type: 'Feature', geometry: { type: 'Point', coordinates: [LON, LAT] }, properties: { label: '12 Rue des Lilas 69001 Lyon', city: 'Lyon', postcode: '69001', context: '69, Rhône' } }

/** Météo simulée. `heatWave` : 36 °C pendant 4 jours à partir d'aujourd'hui (alerte canicule) ; `gust` : rafales de ce jour-là, en km/h (25 par défaut). */
export interface WeatherMock {
  heatWave?: boolean
  gust?: number
}

function weather(opts: WeatherMock = {}) {
  const t0 = Date.now()
  // Jours du fuseau de l'appli (Paris), pas de l'UTC : entre 23 h et minuit UTC les deux ne tombent pas le même jour et la vague de chaleur se décalait d'un jour.
  const days = Array.from({ length: 16 }, (_, i) => new Date(t0 + (i - 3) * 86_400_000).toLocaleDateString('en-CA', { timeZone: 'Europe/Paris' }))
  const tmax = [14, 11, 13, 9, 10, 12, 12, 12, 13, 14, 15, 15, 14, 13, 12, 12].map((t, i) => (opts.heatWave && i >= 3 && i < 7 ? 36 : t))
  return {
    latitude: LAT,
    longitude: LON,
    timezone: 'Europe/Paris',
    daily: {
      time: days,
      temperature_2m_max: tmax,
      temperature_2m_min: tmax.map((x) => x - 6),
      precipitation_sum: days.map(() => 0),
      weather_code: days.map(() => 1),
      et0_fao_evapotranspiration: days.map(() => 2),
      wind_speed_10m_max: days.map(() => 10),
      wind_gusts_10m_max: days.map((_, i) => (opts.gust != null && i === 3 ? opts.gust : 25)),
    },
    current: { temperature_2m: 12 },
  }
}

/** Cinq ans de températures et de pluie (pour le froid extrême et le climat). */
function archive() {
  const time: string[] = []
  const mn: number[] = []
  const mx: number[] = []
  const pr: number[] = []
  for (let y = 2021; y <= 2025; y++) {
    for (let d = 0; d < 365; d++) {
      time.push(new Date(Date.UTC(y, 0, 1 + d)).toISOString().slice(0, 10))
      const t = 12 - 10 * Math.cos((d / 365) * 2 * Math.PI)
      mn.push(+(t - 4).toFixed(1))
      mx.push(+(t + 4).toFixed(1))
      pr.push(d % 4 === 0 ? 3 : 0)
    }
  }
  return { latitude: LAT, longitude: LON, daily: { time, temperature_2m_min: mn, temperature_2m_max: mx, precipitation_sum: pr } }
}

function ext(route: Route, wx: WeatherMock) {
  const url = route.request().url()
  const json = (body: unknown) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
  if (url.includes('geocodage/search') || url.includes('geocodage/reverse')) return json({ type: 'FeatureCollection', features: [place] })
  if (url.includes('apicarto')) {
    return json({ type: 'FeatureCollection', features: [{ type: 'Feature', id: 'p1', geometry: { type: 'Polygon', coordinates: square(0.0001) }, properties: { idu: 'x', contenance: 480, nom_com: 'Lyon' } }] })
  }
  if (url.includes('elevation.json')) {
    const n = (new URL(url).searchParams.get('lon') || '').split('|').length
    return json({ elevations: Array.from({ length: n }, () => 170) })
  }
  if (url.includes('meteo-archive')) return json(archive())
  if (url.includes('/ext/meteo')) return json(weather(wx))
  if (url.includes('wmts')) return route.fulfill({ status: 200, contentType: 'image/png', body: PNG })
  if (url.includes('wms')) return route.fulfill({ status: 200, contentType: 'image/jpeg', body: PNG })
  // WFS (bâtiments, etc.) et tout le reste de l'IGN : réponse vide valide.
  return json({ type: 'FeatureCollection', features: [] })
}

/** Installe les simulations. Renvoie la liste des requêtes sorties vers un autre domaine (doit rester vide). */
export async function mockNetwork(page: Page, baseURL: string, wx: WeatherMock = {}): Promise<string[]> {
  const external: string[] = []
  const origin = new URL(baseURL).origin
  // Une seule règle, évaluée pour chaque requête : notre origine passe (proxys /ext/* et /api/* simulés), Supabase répond « vide ».
  await page.route('**/*', (route) => {
    const url = route.request().url()
    if (url.startsWith('data:') || url.startsWith('blob:')) return route.continue()
    if (/^https:\/\/[^/]*\.supabase\.co\//.test(url)) return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
    if (!url.startsWith(origin)) {
      external.push(url)
      return route.abort()
    }
    const path = new URL(url).pathname
    if (path.startsWith('/ext/')) return ext(route, wx)
    if (path.startsWith('/api/identify')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ results: [] }) })
    return route.continue()
  })
  return external
}

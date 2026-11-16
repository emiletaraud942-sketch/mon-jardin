// Outils communs du teaser : navigateur, réseau simulé (repris de e2e/mocks.ts), dossier de travail.
// Rien ne sort vers Internet. Les tuiles de carte sont remplacées par un fond SCHÉMATIQUE dessiné (ce n'est pas une photo aérienne).
import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'
import path from 'node:path'

const require = createRequire(import.meta.url)
export const { chromium } = require('playwright')

/** Dossier de travail (captures, images, sons) : hors du dépôt. */
export const WORK = process.env.TEASER_WORK || '/tmp/permajardin-teaser'
mkdirSync(WORK, { recursive: true })
export const BASE = process.env.TEASER_BASE || 'http://127.0.0.1:4823'
export const ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
/** Chromium déjà installé (PW_CHROMIUM_PATH), sinon celui de Playwright. */
export const launch = () => chromium.launch({ args: ARGS, executablePath: process.env.PW_CHROMIUM_PATH || undefined })
export const work = (...p) => path.join(WORK, ...p)

const LON = 4.8357
const LAT = 45.764
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64')
const square = (d) => [[[LON - d, LAT - d], [LON + d, LAT - d], [LON + d, LAT + d], [LON - d, LAT + d], [LON - d, LAT - d]]]
const place = { type: 'Feature', geometry: { type: 'Point', coordinates: [LON, LAT] }, properties: { label: '12 Rue des Lilas 69001 Lyon', city: 'Lyon', postcode: '69001', context: '69, Rhône' } }

function weather() {
  const t0 = Date.now()
  const days = Array.from({ length: 16 }, (_, i) => new Date(t0 + (i - 3) * 86_400_000).toLocaleDateString('en-CA', { timeZone: 'Europe/Paris' }))
  const tmax = [14, 11, 13, 9, 10, 12, 12, 12, 13, 14, 15, 15, 14, 13, 12, 12]
  return {
    latitude: LAT, longitude: LON, timezone: 'Europe/Paris',
    daily: {
      time: days, temperature_2m_max: tmax, temperature_2m_min: tmax.map((x) => x - 6), precipitation_sum: days.map(() => 0),
      weather_code: days.map(() => 1), et0_fao_evapotranspiration: days.map(() => 2), wind_speed_10m_max: days.map(() => 10), wind_gusts_10m_max: days.map(() => 25),
    },
    current: { temperature_2m: 12 },
  }
}

function archive() {
  const time = [], mn = [], mx = [], pr = []
  for (let y = 2021; y <= 2025; y++) {
    for (let d = 0; d < 365; d++) {
      time.push(new Date(Date.UTC(y, 0, 1 + d)).toISOString().slice(0, 10))
      const t = 12 - 10 * Math.cos((d / 365) * 2 * Math.PI)
      mn.push(+(t - 4).toFixed(1)); mx.push(+(t + 4).toFixed(1)); pr.push(d % 4 === 0 ? 3 : 0)
    }
  }
  return { latitude: LAT, longitude: LON, daily: { time, temperature_2m_min: mn, temperature_2m_max: mx, precipitation_sum: pr } }
}

function squareAround(url, h) {
  try {
    const g = JSON.parse(new URL(url).searchParams.get('geom') || '{}')
    const [lon, lat] = g.coordinates ?? [LON, LAT]
    return [[[lon - h, lat - h], [lon + h, lat - h], [lon + h, lat + h], [lon - h, lat + h], [lon - h, lat - h]]]
  } catch {
    return square(h)
  }
}

function ext(route, tile) {
  const url = route.request().url()
  const json = (body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
  if (url.includes('geocodage/search') || url.includes('geocodage/reverse')) return json({ type: 'FeatureCollection', features: [place] })
  if (url.includes('apicarto')) return json({ type: 'FeatureCollection', features: [{ type: 'Feature', id: 'p1', geometry: { type: 'Polygon', coordinates: squareAround(url, 0.0001) }, properties: { idu: 'x', contenance: 480, nom_com: 'Lyon' } }] })
  if (url.includes('/ext/agenda/')) return json({ total_count: 0, results: [] })
  if (url.includes('elevation.json')) {
    const n = (new URL(url).searchParams.get('lon') || '').split('|').length
    return json({ elevations: Array.from({ length: n }, () => 170) })
  }
  if (url.includes('meteo-archive')) return json(archive())
  if (url.includes('/ext/meteo')) return json(weather())
  // Photo et plan : fond schématique ; cadastre et autres couches : transparent.
  if (url.includes('wmts')) return route.fulfill({ status: 200, contentType: 'image/png', body: (/ORTHOPHOTOS|PLANIGNV2/.test(url) && tile) || PNG })
  if (url.includes('wms')) return route.fulfill({ status: 200, contentType: 'image/jpeg', body: PNG })
  return json({ type: 'FeatureCollection', features: [] })
}

/** Installe les simulations. `tile` : image PNG servie à la place des tuiles (fond schématique). */
export async function mockNetwork(page, tile) {
  const external = []
  const origin = new URL(BASE).origin
  await page.route('**/*', (route) => {
    const url = route.request().url()
    if (url.startsWith('data:') || url.startsWith('blob:')) return route.continue()
    if (/^https:\/\/[^/]*\.supabase\.co\//.test(url)) return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
    if (!url.startsWith(origin)) { external.push(url); return route.abort() }
    const p = new URL(url).pathname
    if (p.startsWith('/ext/')) return ext(route, tile)
    if (p.startsWith('/api/identify')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ results: [] }) })
    return route.continue()
  })
  return external
}

/** Téléphone simulé : 393 × 852, densité 3, tactile, thème clair, français. */
export async function phone(browser, { scale = 3, tile } = {}) {
  const ctx = await browser.newContext({
    viewport: { width: 393, height: 852 }, deviceScaleFactor: scale, hasTouch: true, isMobile: true,
    locale: 'fr-FR', timezoneId: 'Europe/Paris', colorScheme: 'light', serviceWorkers: 'block',
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  })
  const page = await ctx.newPage()
  const external = await mockNetwork(page, tile)
  const errors = []
  page.on('pageerror', (e) => errors.push(`pageerror : ${e.message}`))
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console : ${m.text()}`) })
  await page.addInitScript(() => {
    try {
      if (sessionStorage.getItem('teaser-init')) return
      sessionStorage.setItem('teaser-init', '1')
      localStorage.setItem('permajardin:consent', JSON.stringify({ v: 1, voisins: new Date().toISOString(), plantnet: new Date().toISOString() }))
      localStorage.setItem('pj.tourSeen', '1')
    } catch { /* stockage indisponible */ }
  })
  return { ctx, page, external, errors }
}

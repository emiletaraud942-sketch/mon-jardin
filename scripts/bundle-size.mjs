// Calculs purs du budget de taille (aucune dépendance). Utilisés par scripts/check-bundle.mjs et testés dans check-bundle.test.mjs.
import { gzipSync } from 'node:zlib'

/** Taille gzip en octets (niveau 9 : stable d'une machine à l'autre). */
export function gzipSize(buf) {
  return gzipSync(buf, { level: 9 }).length
}

/** Nom de fichier du chunk d'entrée : le <script type="module" src="/assets/index-xxx.js"> de index.html. */
export function entryChunkFromHtml(html) {
  for (const tag of html.match(/<script\b[^>]*>/g) ?? []) {
    if (!/type=["']module["']/.test(tag)) continue
    const m = /src=["']([^"']+)["']/.exec(tag)
    if (m) return m[1].replace(/^\//, '')
  }
  return null
}

/** Adresses (relatives à dist/) du précache d'un sw.js généré par Workbox. */
export function precacheUrls(swSource) {
  const start = swSource.indexOf('precacheAndRoute([')
  if (start < 0) return []
  const end = swSource.indexOf('])', start)
  const list = swSource.slice(start, end)
  return [...list.matchAll(/url:\s*["']([^"']+)["']/g)].map((m) => m[1])
}

/** Premier fichier de assets/ qui s'appelle `<nom>-<hash>.js` (le worker de MapLibre, `maplibre-gl-worker-…`, est exclu). */
export function findChunk(files, name) {
  const re = new RegExp(`^assets/${name}-[A-Za-z0-9_-]+\\.js$`)
  return files.find((f) => re.test(f) && !f.includes('-worker-')) ?? null
}

/** Compare des mesures à leurs seuils. `rows` : [{ label, bytes, limit }] ; renvoie les lignes en dépassement. */
export function overBudget(rows) {
  return rows.filter((r) => r.bytes > r.limit)
}

export const ko = (n) => `${(n / 1000).toFixed(1)} Ko`

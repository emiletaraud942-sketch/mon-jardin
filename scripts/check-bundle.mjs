// Budget de taille du bundle : à lancer après `npm run build`. Sort en erreur (code 1) si un seuil est dépassé.
// Tailles en gzip (ce que le réseau transfère), 1 Ko = 1 000 octets. Sans dépendance.
// Mesures du 9 nov. 2026 : entrée ≈ 228 Ko, précache ≈ 1,04 Mo, three ≈ 248 Ko (chunk supprimé le 11 nov. avec la vue 3D), maplibre ≈ 295 Ko ; seuils ≈ 10 % au-dessus.
// Pour relever un seuil : le faire ici, en connaissance de cause, avec la raison dans le message du commit.
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { entryChunkFromHtml, findChunk, gzipSize, ko, overBudget, precacheUrls } from './bundle-size.mjs'

const DIST = process.env.DIST_DIR || join(dirname(fileURLToPath(import.meta.url)), '..', 'dist')
const LIMITS = {
  entree: 250_000,
  precache: 1_200_000,
  maplibre: 330_000,
}

function fail(msg) {
  console.error(`Budget de bundle : ${msg}`)
  process.exit(1)
}

if (!existsSync(join(DIST, 'index.html'))) fail(`dist/ introuvable (${DIST}). Lancez d'abord « npm run build ».`)
if (!existsSync(join(DIST, 'sw.js'))) fail('dist/sw.js introuvable : le service worker n\'a pas été généré.')

const size = (rel) => gzipSize(readFileSync(join(DIST, rel)))
const assets = readdirSync(join(DIST, 'assets')).map((f) => `assets/${f}`)

const entry = entryChunkFromHtml(readFileSync(join(DIST, 'index.html'), 'utf8'))
if (!entry) fail('chunk d\'entrée introuvable dans dist/index.html.')
const maplibre = findChunk(assets, 'maplibre')
if (!maplibre) fail('chunk « maplibre » introuvable dans dist/assets.')

const urls = precacheUrls(readFileSync(join(DIST, 'sw.js'), 'utf8'))
if (urls.length === 0) fail('liste de précache introuvable dans dist/sw.js.')
const missing = urls.filter((u) => !existsSync(join(DIST, u)))
if (missing.length) fail(`fichiers du précache absents de dist/ : ${missing.join(', ')}`)
const precache = urls.reduce((sum, u) => sum + size(u), 0)

const rows = [
  { label: `Chunk d'entrée (${entry})`, bytes: size(entry), limit: LIMITS.entree },
  { label: `Précache du service worker (${urls.length} fichiers)`, bytes: precache, limit: LIMITS.precache },
  { label: `Chunk maplibre (${maplibre})`, bytes: size(maplibre), limit: LIMITS.maplibre },
]

console.log('Budget de bundle (gzip)')
for (const r of rows) {
  const state = r.bytes > r.limit ? 'TROP GROS' : 'ok'
  console.log(`  ${r.label.padEnd(66)} ${ko(r.bytes).padStart(10)} / ${ko(r.limit).padStart(10)}  ${state}`)
}

const over = overBudget(rows)
if (over.length) {
  for (const r of over) console.error(`Dépassement : ${r.label} pèse ${ko(r.bytes)} en gzip, budget ${ko(r.limit)} (+${ko(r.bytes - r.limit)}).`)
  fail('un ou plusieurs budgets sont dépassés. Allégez le bundle, ou relevez le seuil dans scripts/check-bundle.mjs en le justifiant.')
}
console.log('Tous les budgets sont respectés.')

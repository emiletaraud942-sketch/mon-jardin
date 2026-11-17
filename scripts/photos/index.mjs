// Écrit src/data/species/photoIds.ts : les identifiants d'espèces qui ont une photo dans public/plantes (lu par SpeciesThumb).
import { readdirSync, writeFileSync } from 'node:fs'
const all = readdirSync('public/plantes')
const large = all.filter((f) => f.endsWith('-lg.jpg')).map((f) => f.slice(0, -7)).sort()
const ids = readdirSync('public/plantes').filter((f) => f.endsWith('.jpg') && !f.endsWith('-lg.jpg')).map((f) => f.slice(0, -4)).sort()
writeFileSync('src/data/species/photoIds.ts', `// Généré par scripts/photos/index.mjs : espèces ayant une photo libre dans public/plantes (crédits : public/plantes/credits.json).\nexport const PHOTO_IDS: ReadonlySet<string> = new Set(${JSON.stringify(ids)})\n// Espèces dont la version large (1280 px, <id>-lg.jpg) est là : seules utilisées en fond de page.\nexport const LARGE_IDS: ReadonlySet<string> = new Set(${JSON.stringify(large)})\n`)
console.log(ids.length, 'photos')

// Rend le teaser image par image : node render.mjs 16x9|9x16 [t1 t2 ...]
// Sans temps : 900 images (30 i/s × 30 s) dans WORK/frames-<format>/f0000.jpg. Avec temps : des PNG d'essai dans WORK/essai-<format>/.
import { launch, work, WORK } from './commun.mjs'
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, rmSync } from 'node:fs'
import { pathToFileURL, fileURLToPath } from 'node:url'
import path from 'node:path'

const fmt = process.argv[2] === '9x16' ? '9x16' : '16x9'
const times = process.argv.slice(3).map(Number)
const [W, H] = fmt === '9x16' ? [1080, 1920] : [1920, 1080]
const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '../..')
const font = (n) => pathToFileURL(path.join(root, 'src/assets/fonts', n)).href
copyFileSync(work('qr.png'), work('shots', 'qr.png'))
const html = readFileSync(path.join(here, 'scene.html'), 'utf8')
  .replace('FONT_SERIF', font('dm-serif-display-latin-400-normal.woff2')).replace('FONT_SANS', font('dm-sans-latin-wght-normal.woff2'))
writeFileSync(work('scene-run.html'), html)
const meta = JSON.parse(readFileSync(work('shots', 'meta.json'), 'utf8'))

const b = await launch()
const page = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })
await page.addInitScript(({ meta, shots }) => { window.META = meta; window.SHOTS = shots }, { meta, shots: pathToFileURL(work('shots')).href })
page.on('pageerror', (e) => { console.error('ERREUR PAGE', e.message); process.exitCode = 1 })
await page.goto(pathToFileURL(work('scene-run.html')).href + '?fmt=' + fmt)
await page.evaluate(() => window.__ready)

// Une seule animation à la fois : aucun chevauchement entre les mouvements.
const ev = await page.evaluate(() => window.EVENTS)
for (let i = 1; i < ev.length; i++) if (ev[i].a < ev[i - 1].b - 1e-9) throw new Error(`chevauchement : ${ev[i - 1].k} [${ev[i - 1].a}-${ev[i - 1].b}] et ${ev[i].k} [${ev[i].a}-${ev[i].b}]`)
if (ev.some((e) => e.b - e.a > 2.3)) console.log('mouvement long :', ev.filter((e) => e.b - e.a > 2.3).map((e) => e.k))
if (ev.some((e) => /^(titre|phase|fin|fondu)/.test(e.k) && e.b - e.a > 0.4 + 1e-9)) throw new Error('transition de plus de 0,4 s')

if (times.length) {
  const out = work('essai-' + fmt); mkdirSync(out, { recursive: true })
  for (const t of times) { await page.evaluate((x) => window.render(x), t); await page.screenshot({ path: path.join(out, `t${String(t).replace('.', '_')}.png`) }) }
} else {
  const out = work('frames-' + fmt); rmSync(out, { recursive: true, force: true }); mkdirSync(out, { recursive: true })
  for (let i = 0; i < 900; i++) {
    await page.evaluate((x) => window.render(x), i / 30)
    await page.screenshot({ path: path.join(out, `f${String(i).padStart(4, '0')}.jpg`), type: 'jpeg', quality: 93 })
    if (i % 150 === 0) console.log(fmt, 'image', i)
  }
}
await b.close()

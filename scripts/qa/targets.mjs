// Contrôle des cibles tactiles : tous les button, summary, a[href], [role=tab] et les lignes de cases (label.check-row) visibles
// doivent faire au moins 44 px de haut (56 px avec « Grandes touches »), à 360 et 390 px de large, sur dix écrans.
// Usage : npm run dev (autre terminal), puis  node scripts/qa/targets.mjs [--big] [--url=http://127.0.0.1:5173/] [--json]
// Playwright n'est pas une dépendance du dépôt : PLAYWRIGHT_DIR (défaut /opt/node-tools/node_modules) dit où le trouver.
// Aucun réseau externe n'est joint : /ext et /api répondent 404, la météo est simulée.
import { createRequire } from 'node:module'

const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')))
const BASE = args.get('url') ?? 'http://127.0.0.1:5173/'
const BIG = args.has('big')
const MIN = BIG ? 56 : 44
const require = createRequire((process.env.PLAYWRIGHT_DIR ?? '/opt/node-tools/node_modules') + '/')
const { chromium } = require('playwright')

const now = Date.now()
const iso = (y) => new Date(now - y * 365.25 * 86400000).toISOString().slice(0, 10)
const seed = () => {
  const g = { id: 'g1', name: 'Chez Marie', address: '12 rue des Lilas 44400 Rezé', center: { lon: -1.55583, lat: 47.17582 }, parcel: [{ x: -15, y: -15 }, { x: 15, y: -15 }, { x: 15, y: 15 }, { x: -15, y: 15 }], areaM2: 900, buildings: [], createdAt: iso(1), lastFrostDoy: 100, firstFrostDoy: 300 }
  const mk = (i, sp, x, y, yrs, status = 'en-place') => ({ id: 'p' + i, gardenId: 'g1', speciesId: sp, position: { x, y }, plantedAt: iso(yrs), status, photos: [], ageAtPlanting: yrs >= 1 ? 2 : 0 })
  // Le pommier a un journal (deux photos datées, une troisième sans date) : la frise et l'avant / après sont mesurés.
  const journal = { photos: ['photo:aaa', 'photo:bbb', 'photo:ccc'], photoMeta: { 'photo:aaa': { at: '2026-03-04', note: 'Après la taille' }, 'photo:bbb': { at: '2026-10-01' } } }
  const plants = [{ ...mk(1, 'pommier', -5, -5, 4), ...journal }, mk(2, 'tomate', 3, 2, 0.3), mk(3, 'lavande', 6, -4, 2), mk(4, 'basilic', 4, 3, 0.3), mk(5, 'figuier', 8, 8, 0, 'projet')]
  return JSON.stringify({ savedAt: now + 1000, data: { version: 2, gardens: [g], plants, tasksDone: [], activeGardenId: 'g1' } })
}

/** Les cibles de la page visibles à l'écran et trop petites. */
function measure(min) {
  const sel = "button, summary, a[href], [role='tab'], label.check-row, label.lecon-choice"
  const out = []
  for (const el of document.querySelectorAll(sel)) {
    if (el.closest('.sr-only, [inert], [hidden], .maplibregl-canvas-container')) continue
    const cs = getComputedStyle(el)
    if (cs.visibility === 'hidden' || cs.display === 'none' || cs.pointerEvents === 'none') continue
    const r = el.getBoundingClientRect()
    if (r.width < 1 || r.height < 1) continue
    if (el.classList.contains('skip-link')) continue
    // Zone touchable agrandie par un ::after absolu (liens dans une phrase, pastille « Fait ») : on la compte.
    const after = getComputedStyle(el, '::after')
    const extra = after.content !== 'none' && after.position === 'absolute' ? -(parseFloat(after.top) || 0) - (parseFloat(after.bottom) || 0) : 0
    const hit = r.height + Math.max(0, extra)
    if (hit + 0.5 < min) {
      const name = (el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40)
      out.push({ tag: el.tagName.toLowerCase(), cls: String(el.className).slice(0, 50), name, w: Math.round(r.width), h: Math.round(hit * 10) / 10, inline: cs.display === 'inline' })
    }
  }
  return out
}

/** « Tout » → « Reconnaître un ennui du jardin » : la liste du guide des bestioles et maladies. */
async function ouvrirEnnuis(p) {
  await p.locator('[data-home=tout]').click()
  await p.locator('.tf-overlay input[type=search]').fill('ennui')
  await p.getByRole('button', { name: /Reconnaître un ennui du jardin/ }).first().click()
  await p.locator('[data-feat=guide-ennuis]').waitFor()
}

/** « Tout » → « Lire les conseils compost et économie d'eau » : la liste des conseils. */
async function ouvrirConseils(p) {
  await p.locator('[data-home=tout]').click()
  await p.locator('.tf-overlay input[type=search]').fill('compost')
  await p.getByRole('button', { name: /Lire les conseils compost/ }).first().click()
  await p.locator('[data-feat=conseils]').waitFor()
}

/** « Tout » → « Apprendre à jardiner » : la liste des leçons. */
async function ouvrirLecons(p) {
  await p.locator('[data-home=tout]').click()
  await p.locator('.tf-overlay input[type=search]').fill('apprendre')
  await p.getByRole('button', { name: /Apprendre à jardiner/ }).first().click()
  await p.locator('[data-feat=lecons]').waitFor()
}

/** « Tout » → « Voir la rotation de mon potager » : l'écran de rotation des cultures. */
async function ouvrirRotation(p) {
  await p.locator('[data-home=tout]').click()
  await p.locator('.tf-overlay input[type=search]').fill('rotation')
  await p.getByRole('button', { name: /Voir la rotation de mon potager/ }).first().click()
  await p.locator('[data-feat=rotation]').waitFor()
}

const SCREENS = [
  { id: 'accueil', go: async () => {} },
  { id: 'carte', go: (p) => p.locator('.sidenav .navbtn', { hasText: 'Mon jardin' }).click() },
  { id: 'a-faire', go: (p) => p.locator('.sidenav .navbtn', { hasText: 'À faire' }).click() },
  { id: 'ou-planter', go: (p) => p.locator('.sidenav .navbtn', { hasText: /Planter|Où planter/ }).first().click() },
  { id: 'reglages', go: (p) => p.getByRole('button', { name: /Compte/ }).first().click() },
  { id: 'tout', go: (p) => p.locator('[data-home=tout]').click() },
  { id: 'ennuis', go: ouvrirEnnuis },
  { id: 'fiche-journal', go: async (p) => {
    await p.locator('.sidenav .navbtn', { hasText: 'Mon jardin' }).click()
    await p.getByRole('tab', { name: 'Plantes' }).click()
    await p.locator('[data-feat=liste-plantes]').getByText(/Pommier/i).first().click()
    await p.locator('[data-feat=journal]').waitFor()
  } },
  { id: 'rotation', go: ouvrirRotation },
  { id: 'conseils', go: ouvrirConseils },
  { id: 'conseils-fiche', go: async (p) => { await ouvrirConseils(p); await p.locator('[data-conseil-id]').first().click() } },
  { id: 'lecons', go: ouvrirLecons },
  { id: 'lecon-fiche', go: async (p) => { await ouvrirLecons(p); await p.locator('[data-lecon-id]').first().click(); await p.locator('[data-lecon]').waitFor() } },
  { id: 'ennuis-fiche', go: async (p) => { await ouvrirEnnuis(p); await p.locator('[data-ennui-id]').first().click() } },
]

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const report = []
for (const size of [{ w: 360, h: 740 }, { w: 390, h: 844 }]) {
  for (const s of SCREENS) {
    const ctx = await browser.newContext({ viewport: { width: size.w, height: size.h }, hasTouch: true, isMobile: true, deviceScaleFactor: 1, locale: 'fr-FR', serviceWorkers: 'block' })
    const page = await ctx.newPage()
    await ctx.route(/\/(ext|api)\//, (r) => r.fulfill({ status: 404, body: '' }))
    await ctx.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/, (r) => r.abort())
    await ctx.addInitScript(({ seedText, big }) => {
      try {
        if (!sessionStorage.getItem('seeded')) {
          sessionStorage.setItem('seeded', '1')
          localStorage.setItem('permajardin:state:v1:miroir', seedText)
          localStorage.setItem('permajardin:consent', JSON.stringify({}))
          localStorage.setItem('pj.tourSeen', '1')
          sessionStorage.setItem('pj.force3d', '1')
          if (big) localStorage.setItem('pj.bigTaps', '1')
        }
      } catch {}
    }, { seedText: seed(), big: BIG })
    await page.goto(BASE)
    await page.waitForTimeout(1500)
    try {
      await s.go(page)
      await page.waitForTimeout(900)
    } catch (e) {
      report.push({ size: size.w, screen: s.id, error: String(e).split('\n')[0] })
      await ctx.close()
      continue
    }
    // Replis ouverts : leurs boutons comptent aussi.
    await page.evaluate(() => document.querySelectorAll('details').forEach((d) => (d.open = true)))
    await page.waitForTimeout(300)
    const small = await page.evaluate(measure, MIN)
    report.push({ size: size.w, screen: s.id, count: small.length, small })
    await ctx.close()
  }
}
await browser.close()

if (args.has('json')) console.log(JSON.stringify(report, null, 1))
else {
  console.log(`Cibles de moins de ${MIN} px (${BIG ? 'Grandes touches' : 'réglage normal'}) :`)
  for (const r of report) {
    if (r.error) console.log(`  ${r.size} ${r.screen} : ERREUR ${r.error}`)
    else {
      console.log(`  ${r.size} ${r.screen} : ${r.count}`)
      for (const x of r.small) console.log(`      ${x.h} px · ${x.tag}.${x.cls} « ${x.name} » (${x.w} px de large${x.inline ? ', en ligne' : ''})`)
    }
  }
}
process.exit(report.some((r) => r.error || r.count > 0) ? 1 : 0)

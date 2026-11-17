// Banc d'essai de « Scanner un sachet ou une étiquette » : chaque image du corpus passe par la VRAIE appli (Tesseract compris),
// puis les champs du formulaire sont comparés à la vérité. Usage : node scripts/qa/ocr-bench/run.mjs <corpus> [--url=http://127.0.0.1:4793]
// (build + `npx vite preview --port 4793` avant ; PLAYWRIGHT_DIR ou playwright installé ; PW_CHROMIUM_PATH pour Chromium.)
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
const require = createRequire(process.env.PLAYWRIGHT_DIR ? process.env.PLAYWRIGHT_DIR + '/' : import.meta.url)
const { chromium } = require('playwright')
const dir = process.argv[2]
const url = (process.argv.find((a) => a.startsWith('--url=')) || '--url=http://127.0.0.1:4793').slice(6)
const cases = JSON.parse(readFileSync(dir + '/corpus.json', 'utf8'))
const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7)
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || undefined })
const page = await (await browser.newContext({ locale: 'fr-FR', viewport: { width: 390, height: 1400 } })).newPage()
await page.addInitScript(() => { try { localStorage.setItem('pj.tourSeen', '1') } catch {} })
await page.goto(url)
await page.getByRole('button', { name: 'Visiter un jardin d’exemple' }).click()
await page.locator('[data-home=etiquette]').click()
const box = page.locator('[data-feat=scanner-etiquette]')
const months = async (label) => {
  const g = box.getByRole('group', { name: label })
  const out = []
  const btns = g.getByRole('button')
  const n = await btns.count()
  for (let i = 0; i < n; i++) if ((await btns.nth(i).getAttribute('aria-pressed')) === 'true') out.push(i + 1)
  return out
}
const field = async (l) => (await box.locator('label.field', { hasText: l }).locator('input,select').first().inputValue()).trim()
const rows = []
for (const c of cases.filter((c) => !only || c.id.startsWith(only))) {
  const t0 = Date.now()
  const r = { id: c.id, kind: c.kind, font: c.font, bg: c.bg, defect: c.defect, got: {}, ok: {} }
  try {
    await box.locator('input[type=file]').nth(1).setInputFiles(dir + '/' + c.file)
    await box.locator('form').waitFor({ timeout: 120000 })
    const kindOn = await box.getByRole('group', { name: 'Type de fiche' }).locator('[aria-pressed=true]').innerText()
    const g = { kind: kindOn, species: await field('Plante du catalogue'), semis: await months('Mois de semis'), recolte: await months('Mois de récolte'), prof: await field('Profondeur'), esp: await field('Distance entre plants'), levee: await field('Levée'), haut: await field('Hauteur'), soleil: await field('Soleil'), prix: (await box.getByText(/Prix lu/).allInnerTexts())[0] || '' }
    r.got = g
    const T = c.truth
    const num = (s) => (s === '' ? undefined : Number(s.replace(',', '.')))
    r.ok.kind = c.kind === 'sachet' ? g.kind.startsWith('Sachet') : g.kind.toLowerCase().includes('plante')
    r.ok.species = g.species === c.species
    if (T.semis) r.ok.semis = JSON.stringify(g.semis) === JSON.stringify(T.semis)
    if (T.recolte) r.ok.recolte = JSON.stringify(g.recolte) === JSON.stringify(T.recolte)
    if (T.prof !== undefined) r.ok.prof = num(g.prof) === T.prof
    if (T.esp !== undefined) r.ok.esp = num(g.esp) === T.esp
    if (T.levee !== undefined) r.ok.levee = num(g.levee) !== undefined && num(g.levee) >= T.levee * 0.5 && num(g.levee) <= T.levee // une fourchette « 8 à 12 jours » : milieu ou borne acceptés
    if (T.haut) r.ok.haut = num(g.haut) === T.haut
    if (c.kind === 'sachet') r.ok.fauxHaut = g.haut === '' // une distance de plantation ne doit pas devenir une hauteur
    if (T.soleil) r.ok.soleil = g.soleil === T.soleil
    if (T.prix) r.ok.prix = Number((g.prix.match(/Prix lu : ([\d,]+)/) || [])[1]?.replace(',', '.')) === Number(T.prix.replace(',', '.'))
    await box.getByRole('button', { name: 'Recommencer' }).click()
  } catch (e) {
    r.error = String(e.message).split('\n')[0]
    await page.keyboard.press('Escape'); await page.locator('[data-home=etiquette]').click().catch(() => {})
  }
  r.s = Math.round((Date.now() - t0) / 1000)
  rows.push(r)
  const bad = Object.entries(r.ok).filter(([, v]) => !v).map(([k]) => k)
  console.log(`${r.id.padEnd(18)} ${c.font.padEnd(12)} ${c.defect.padEnd(7)} ${r.error ? 'ERREUR ' + r.error : bad.length ? 'à revoir : ' + bad.join(', ') : 'ok'} (${r.s}s)`)
}
const tot = {}
for (const r of rows) for (const [k, v] of Object.entries(r.ok)) { (tot[k] ??= [0, 0])[1]++; if (v) tot[k][0]++ }
console.log('\nPar champ :'); for (const [k, [a, b]] of Object.entries(tot)) console.log(`  ${k.padEnd(8)} ${a}/${b}  ${Math.round((100 * a) / b)} %`)
const byDef = {}; for (const r of rows) for (const v of Object.values(r.ok)) { (byDef[r.defect] ??= [0, 0])[1]++; if (v) byDef[r.defect][0]++ }
console.log('\nPar défaut de photo :'); for (const [k, [a, b]] of Object.entries(byDef)) console.log(`  ${k.padEnd(8)} ${Math.round((100 * a) / b)} %`)
writeFileSync(dir + '/resultats.json', JSON.stringify(rows, null, 1))
await browser.close()

// Captures de l'appli pour le teaser (build local servi par `vite preview`, réseau simulé, fond de carte schématique).
// Sortie dans WORK : shots/*.png (1179 × 2556) + shots/meta.json (positions des touchers, défilements, couleur de fond).
// Usage : TEASER_BASE=http://127.0.0.1:4823 node capture.mjs
import { launch, BASE, phone, work } from './commun.mjs'
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

mkdirSync(work('shots'), { recursive: true })
const b = await launch()
const { page, errors, external } = await phone(b, { scale: 3, tile: readFileSync(work('tuile.png')) })
const meta = { taps: {}, tall: {} }
const S = (n) => work('shots', n + '.png')
/** Ferme le message du bas (« placée », « Photo mise à jour ») : ce n'est pas le sujet de l'image. */
const clean = async () => {
  await page.evaluate(() => { for (const b of document.querySelectorAll('button')) if (b.innerText.trim() === 'Annuler' && /placée|mise à jour|supprim|ajout|enregistr/i.test(b.parentElement?.innerText || '')) b.nextElementSibling?.click() })
  await page.waitForTimeout(700)
}
const shot = async (n) => { await clean(); await page.waitForTimeout(300); await page.screenshot({ path: S(n) }) }
const tab = (name) => page.locator('nav').getByRole('button', { name: new RegExp('^' + name) }).first().click()
const center = async (loc) => { const bb = await loc.first().boundingBox(); return [Math.round(bb.x + bb.width / 2), Math.round(bb.y + bb.height / 2)] }
const hideLost = () => page.evaluate(() => { for (const b of document.querySelectorAll('button')) if (/Je suis perdu/.test(b.innerText)) (b.closest('[class*=lost]') || b).style.display = 'none' })
const closeBanner = async () => {
  const x = page.getByRole('button', { name: 'Créer mon vrai jardin' }).first().locator('xpath=following-sibling::button[1]')
  if (await x.count()) { await x.click(); await page.waitForTimeout(500) }
}

/** Capture longue : fait défiler l'élément qui défile et recolle les bandes (bas de page compris). */
async function tall(name, mark) {
  await clean(); await hideLost()
  const info = await page.evaluate(() => {
    const c = [...document.querySelectorAll('*')].filter((e) => { const s = getComputedStyle(e); const r = e.getBoundingClientRect(); return /auto|scroll/.test(s.overflowY) && e.scrollHeight > e.clientHeight + 5 && r.height > 300 && r.width > 300 && r.top < 400 })
    c.sort((a, z) => (z.scrollHeight - z.clientHeight) - (a.scrollHeight - a.clientHeight))
    const e = c[0]; if (!e) return null
    e.setAttribute('data-tall', '1'); e.scrollTop = 0
    // En-têtes collants : ils se répéteraient à chaque raccord ; ils défilent donc avec la page dans la capture longue.
    for (const x of e.querySelectorAll('*')) if (/sticky|fixed/.test(getComputedStyle(x).position)) x.style.position = 'static'
    const r = e.getBoundingClientRect()
    return { x: r.x, y: r.y, w: r.width, h: r.height, sh: e.scrollHeight }
  })
  const markY = mark ? await page.evaluate((sel) => { const m = document.querySelector(sel); const e = document.querySelector('[data-tall]'); return m ? m.getBoundingClientRect().top - e.getBoundingClientRect().top + e.scrollTop : null }, mark) : null
  if (!info) throw new Error('aucun conteneur qui défile : ' + name)
  const step = Math.floor(info.h * 0.8); const offs = []
  for (let o = 0; o < info.sh - info.h; o += step) offs.push(o)
  offs.push(info.sh - info.h)
  const files = []
  for (const o of offs) {
    await page.evaluate((v) => { document.querySelector('[data-tall]').scrollTop = v }, o); await page.waitForTimeout(350)
    const real = await page.evaluate(() => document.querySelector('[data-tall]').scrollTop)
    const f = work('shots', `${name}-part${files.length}.png`)
    await page.screenshot({ path: f, clip: { x: info.x, y: info.y, width: info.w, height: info.h } })
    files.push([f, real])
  }
  execFileSync('python3', ['-I', new URL('./coller.py', import.meta.url).pathname, S(name + '-tall'), String(3), ...files.flatMap(([f, o]) => [f, String(o)])])
  await page.evaluate(() => { const e = document.querySelector('[data-tall]'); e.scrollTop = 0; e.removeAttribute('data-tall') })
  await page.waitForTimeout(300)
  meta.tall[name] = { x: info.x, y: info.y, w: info.w, h: info.h, sh: info.sh, markY }
}

await page.goto(BASE + '/')
// 1. Trouvez votre terrain : adresse tapée, suggestion, puis la carte du jardin.
await page.getByRole('button', { name: 'Commencer' }).click()
await page.getByRole('combobox').or(page.getByRole('textbox')).first().fill('12 rue des Lilas'); await page.getByText('12 Rue des Lilas 69001 Lyon').first().waitFor()
await shot('p1-adresse'); meta.taps.p1adresse = await center(page.getByText('12 Rue des Lilas 69001 Lyon').first())
await page.getByRole('button', { name: 'Visiter un jardin d’exemple' }).click()
await page.locator('[data-home=ajouter]').waitFor({ timeout: 60000 }); await page.waitForTimeout(1500)
await tab('Mon jardin'); await page.waitForTimeout(3500); await closeBanner(); await hideLost(); await page.waitForTimeout(800)
await shot('p1-carte')
// 2. Placez vos plantes.
meta.taps.p2ajouter = await center(page.getByRole('button', { name: /^Ajouter/ }))
await page.getByRole('button', { name: /^Ajouter/ }).first().click(); await page.getByText('Ajouter une plante au jardin').click()
const choix = page.getByRole('dialog'); await choix.getByRole('textbox').fill('lavande'); await page.waitForTimeout(600); await shot('p2-choix')
meta.taps.p2lavande = await center(choix.getByRole('button', { name: /^Lavande/ }))
await choix.getByRole('button', { name: /^Lavande/ }).first().click(); await page.waitForTimeout(2500); await hideLost()
meta.taps.p2viser = await center(page.getByRole('button', { name: /^Viser/ }))
await page.getByRole('button', { name: /^Viser/ }).click(); await page.waitForTimeout(1200); await shot('p2-viser')
meta.taps.p2valider = await center(page.getByRole('button', { name: /^Valider/ }))
await page.getByRole('button', { name: /^Valider/ }).click()
const achat = page.getByRole('dialog', { name: /Comment l’avez-vous achetée/ }); await achat.waitFor(); await achat.getByRole('button', { name: /Fermer/ }).click(); await achat.waitFor({ state: 'hidden' })
await page.waitForTimeout(1500); await hideLost(); await shot('p2-apres')
// 3. À faire.
await tab('À faire'); await page.waitForTimeout(3000); await closeBanner(); await hideLost(); await shot('p3-afaire'); await tall('p3')
// 4. Où planter ?
await tab('Planter'); await page.waitForTimeout(2500); await closeBanner(); await hideLost(); await shot('p4-0')
const bb = await page.locator('.maplibregl-canvas').first().boundingBox(); const tp = [Math.round(bb.x + bb.width * 0.5), Math.round(bb.y + bb.height * 0.5)]; meta.taps.p4carte = tp
await page.mouse.click(tp[0], tp[1]); await page.waitForTimeout(2500); await hideLost(); await shot('p4-1')
// 5. Apprendre et soigner : leçons, puis fiche d'ennui.
await tab('Accueil'); await page.waitForTimeout(800)
await page.getByText('Apprendre à jardiner').click(); await page.waitForTimeout(1500); await hideLost(); await shot('p5-lecons'); await tall('p5a')
await page.keyboard.press('Escape'); await page.waitForTimeout(600)
await page.locator('[data-home=tout]').click(); const tout = page.getByRole('dialog', { name: /Tout ce que je peux faire/ })
await tout.getByRole('searchbox').fill('puceron'); await tout.getByRole('button', { name: /Reconnaître un ennui du jardin/ }).first().click()
const ennuis = page.getByRole('dialog', { name: /Reconnaître un ennui du jardin/ }); await ennuis.getByRole('searchbox').fill('puceron'); await page.waitForTimeout(600); await ennuis.getByRole('button', { name: /Pucerons/ }).first().click()
await page.waitForTimeout(900); await hideLost(); await shot('p5-pucerons'); await tall('p5b')
await page.keyboard.press('Escape'); await page.keyboard.press('Escape'); await page.waitForTimeout(500)
// 6. Gardez la mémoire : journal de la plante, deux photos datées, comparaison avant / après.
await tab('Accueil'); await page.waitForTimeout(500)
await tab('Mon jardin'); await page.waitForTimeout(1500)
await page.getByRole('tab', { name: 'Plantes', exact: true }).or(page.getByRole('button', { name: 'Plantes', exact: true })).first().click(); await page.waitForTimeout(1200)
await page.locator('[data-feat=liste-plantes]').getByText(/Lavande/i).first().click(); await page.waitForTimeout(1500)
const journal = page.locator('[data-feat=journal]').filter({ visible: true }); await journal.scrollIntoViewIfNeeded()
await journal.locator('input[type=file]').setInputFiles([work('illus', 'apres.png'), work('illus', 'avant.png')])
await page.locator('.journal-item').first().waitFor({ timeout: 30000 }); await page.waitForTimeout(1500)
await journal.locator('.journal-item').last().getByRole('button', { name: /^Modifier/ }).click()
await journal.getByLabel('Date de la photo').fill('2026-03-04'); await journal.getByLabel('Note (facultatif)').fill('Avant la taille')
await journal.getByRole('button', { name: /Enregistrer/ }).click(); await page.waitForTimeout(1000)
await hideLost(); await journal.scrollIntoViewIfNeeded(); await page.waitForTimeout(600); await shot('p6-journal')
await tall('p6', '[data-feat=journal] .compare')
meta.bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
meta.errors = errors; meta.external = external
writeFileSync(work('shots', 'meta.json'), JSON.stringify(meta, null, 1))
console.log('erreurs :', errors, 'requêtes externes :', external)
await b.close()

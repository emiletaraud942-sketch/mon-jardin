import { expect, test } from '@playwright/test'
import { mockNetwork } from './mocks'

// Placement d'une plante au doigt : on touche la carte, un repère orange apparaît ; on peut le saisir et le faire glisser (il monte au-dessus du doigt) ;
// un simple toucher sur le repère ne le déplace pas ; « Valider » pose la plante.
test('repère de placement : saisi, glissé, validé', async ({ page, baseURL }, info) => {
  test.skip(info.project.name !== 'mobile-390', 'geste tactile')
  await mockNetwork(page, baseURL!)
  await page.addInitScript(() => {
    try {
      if (sessionStorage.getItem('e2e-init')) return
      sessionStorage.setItem('e2e-init', '1')
      localStorage.setItem('permajardin:consent', JSON.stringify({ v: 1, voisins: new Date().toISOString(), plantnet: new Date().toISOString() }))
      localStorage.setItem('pj.tourSeen', '1')
    } catch {
      /* stockage indisponible */
    }
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Visiter un jardin d’exemple' }).click()
  await expect(page.locator('[data-home=ajouter]')).toBeVisible({ timeout: 60_000 })
  await page.locator('[data-home=ajouter]').click()
  const choix = page.getByRole('dialog')
  await choix.getByRole('textbox').fill('lavande')
  await choix.getByRole('button', { name: /^Lavande/ }).first().click()
  const carte = page.locator('.maplibregl-canvas').first()
  await expect(carte).toBeVisible({ timeout: 30_000 })
  await page.waitForTimeout(1200)

  // 1. Toucher la carte : le repère apparaît (pas de croix de visée par défaut).
  await expect(page.getByRole('button', { name: /^Viser/ })).toHaveAttribute('aria-pressed', 'false')
  const box = (await carte.boundingBox())!
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2)
  const pin = page.locator('.spot-pin')
  await expect(pin).toBeVisible()
  const centre = async () => {
    const b = (await pin.boundingBox())!
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
  }
  const c0 = await centre()

  // Gestes tactiles simulés sur le repère (événements de pointeur, type « touch »).
  const geste = (points: { x: number; y: number }[]) =>
    page.evaluate((pts) => {
      const el = document.querySelector('.spot-pin') as HTMLElement
      const fire = (type: string, p: { x: number; y: number }) =>
        el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerType: 'touch', isPrimary: true, pointerId: 7, clientX: p.x, clientY: p.y }))
      fire('pointerdown', pts[0])
      for (const p of pts.slice(1)) fire('pointermove', p)
      fire('pointerup', pts[pts.length - 1])
    }, points)

  // 2. Un simple toucher sur le repère ne le déplace pas.
  await geste([c0])
  await page.waitForTimeout(300)
  const c1 = await centre()
  expect(Math.abs(c1.x - c0.x)).toBeLessThanOrEqual(3)
  expect(Math.abs(c1.y - c0.y)).toBeLessThanOrEqual(3)

  // 3. Le glisser le déplace, et il passe au-dessus du doigt (le doigt finit plus bas que le repère).
  const fin = { x: c1.x + 60, y: c1.y + 90 }
  await geste([c1, { x: c1.x + 15, y: c1.y + 20 }, { x: c1.x + 40, y: c1.y + 60 }, fin])
  await page.waitForTimeout(400)
  const c2 = await centre()
  expect(c2.x - c1.x).toBeGreaterThan(30)
  expect(c2.y).toBeLessThan(fin.y - 20) // au-dessus du doigt
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)

  // 4. « Valider » pose la plante (la question d'achat s'ouvre, on la ferme).
  await page.getByRole('button', { name: /^Valider/ }).click()
  const achat = page.getByRole('dialog', { name: /Comment l’avez-vous achetée/ })
  await expect(achat).toBeVisible()
  await achat.getByRole('button', { name: /Fermer/ }).click()
})

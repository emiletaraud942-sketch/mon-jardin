import { expect, test } from '@playwright/test'
import { mockNetwork } from './mocks'

// Carte, téléphone : toucher une plante la CHOISIT (petite carte d'infos, la carte reste visible) ; la fiche complète ne s'ouvre que sur « Fiche » ;
// seule la plante choisie se déplace au doigt ; la fiche ne s'ouvre jamais toute seule après un déplacement.
test('plante choisie : infos sur la carte, glisser, fiche sur demande', async ({ page, baseURL, viewport }) => {
  test.skip((viewport?.width ?? 0) > 760, 'téléphone seulement')
  await mockNetwork(page, baseURL!)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.addInitScript(() => {
    try {
      if (sessionStorage.getItem('e2e-init')) return
      sessionStorage.setItem('e2e-init', '1')
      localStorage.setItem('pj.tourSeen', '1')
    } catch {
      /* stockage indisponible */
    }
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Visiter un jardin d’exemple' }).click()
  await expect(page.locator('[data-home=carte]')).toBeVisible({ timeout: 60_000 })
  await page.locator('[data-home=carte]').click()
  await expect(page.locator('.maplibregl-map').first()).toBeVisible({ timeout: 30_000 })
  const marker = page.locator('.marker-hit').first()
  await expect(marker).toBeVisible({ timeout: 30_000 })
  const peek = page.locator('[data-feat=plante-choisie]')
  await expect(peek).toHaveCount(0)

  // 1. Toucher : la plante est choisie, la carte d'infos apparaît, AUCUNE fiche plein écran.
  const b0 = (await marker.boundingBox())!
  await page.mouse.click(b0.x + b0.width / 2, b0.y + b0.height / 2)
  await expect(peek).toBeVisible()
  await expect(page.locator('.fiche-overlay')).toHaveCount(0)
  await expect(peek.locator('.plant-peek-dist')).toContainText(/\d/)
  await expect(peek.locator('.site-note')).toBeVisible()
  await page.waitForTimeout(700) // la carte glisse pour que la plante reste visible au-dessus de la carte d'infos
  const avant = await peek.locator('.plant-peek-dist').innerText()
  const pk = (await peek.boundingBox())!
  const mk = (await marker.boundingBox())!
  expect(mk.y + mk.height / 2, 'la plante choisie reste au-dessus de la carte d’infos').toBeLessThan(pk.y - 8)

  // 2. Glisser la plante choisie : elle bouge, la fiche ne s'ouvre pas, la carte d'infos reste.
  const b1 = (await marker.boundingBox())!
  const cx = b1.x + b1.width / 2
  const cy = b1.y + b1.height / 2
  await page.mouse.move(cx, cy)
  await page.mouse.down()
  await page.mouse.move(cx + 30, cy - 25, { steps: 8 })
  await page.mouse.move(cx + 60, cy - 50, { steps: 8 })
  await page.mouse.up()
  await expect(peek).toBeVisible()
  await expect(page.locator('.fiche-overlay')).toHaveCount(0)
  await expect.poll(async () => peek.locator('.plant-peek-dist').innerText(), { timeout: 5000 }).not.toBe(avant)

  // 3. « Fiche » ouvre la fiche complète ; la fermer ramène à la carte avec la plante toujours choisie.
  await peek.getByRole('button', { name: 'Fiche' }).click()
  await expect(page.locator('.fiche-overlay')).toBeVisible()
  await page.locator('.fiche-overlay').getByRole('button', { name: /Fermer|Retour/ }).first().click()
  await expect(page.locator('.fiche-overlay')).toHaveCount(0)
  await expect(peek).toBeVisible()

  // 4. Fermer la carte d'infos : plus aucune plante choisie.
  await peek.getByRole('button', { name: /Fermer/ }).click()
  await expect(peek).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)
  expect(errors).toEqual([])
})

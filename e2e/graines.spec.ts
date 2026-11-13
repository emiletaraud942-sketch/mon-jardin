import { expect, test } from '@playwright/test'
import { mockNetwork } from './mocks'

// « Où planter ? » : feuille du mois (imprimer / partager) et « Mes graines » (ajouter, à donner, retirer + annuler).
test('graines et liste des semis', async ({ page, baseURL }) => {
  await mockNetwork(page, baseURL!)
  const erreurs: string[] = []
  page.on('pageerror', (e) => erreurs.push(e.message))
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
  await expect(page.locator('[data-home=planter]')).toBeVisible({ timeout: 60_000 })
  await page.locator('[data-home=planter]').click()

  // 1. La liste du mois s'imprime et se partage.
  const semer = page.locator('[data-feat=semer-ce-mois]')
  await expect(semer).toBeVisible()
  await expect(semer.locator('[data-feat=imprimer-semis]')).toBeVisible()
  await expect(semer.locator('[data-feat=partager-semis]')).toBeVisible()

  // 2. Mes graines : ajouter, marquer « à donner », retirer, annuler.
  const graines = page.locator('[data-feat=mes-graines]')
  await graines.scrollIntoViewIfNeeded()
  await expect(graines.getByText('Aucun sachet pour l’instant.')).toBeVisible()
  await graines.getByLabel('Nom du sachet').fill('Haricot de ma grand-mère')
  await graines.getByRole('button', { name: 'Ajouter ce sachet' }).click()
  await expect(graines.getByText('Haricot de ma grand-mère')).toBeVisible()
  await graines.getByRole('button', { name: /À donner : Haricot/ }).click()
  await expect(graines.getByText('À donner', { exact: true }).first()).toBeVisible()
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('pj.seeds') || '[]'))).toHaveLength(1)
  await graines.getByRole('button', { name: /Retirer le sachet/ }).click()
  await expect(graines.getByText('Aucun sachet pour l’instant.')).toBeVisible()
  await page.getByRole('button', { name: 'Annuler' }).first().click()
  await expect(graines.getByText('Haricot de ma grand-mère')).toBeVisible()
  // Rien n'est envoyé : aucune requête hors de notre origine.

  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)
  expect(erreurs).toEqual([])
})

import { expect, test } from '@playwright/test'
import { mockNetwork } from './mocks'

// Accueil en feuille de chêne : trois parties, une page chacune, retour, « Plus de choses ».
test('feuille : trois parties, pages épurées, retour', async ({ page, baseURL }) => {
  await mockNetwork(page, baseURL!)
  await page.addInitScript(() => {
    try {
      sessionStorage.setItem('pj.homePlus', '0') // passe après la règle de mockNetwork : on veut la feuille
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
  for (const h of ['consommer', 'entretenir', 'cultiver']) await expect(page.locator(`[data-hub=${h}]`)).toBeVisible({ timeout: 60_000 })
  const overflow = () => page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth)
  expect(await overflow()).toBeLessThanOrEqual(0)

  for (const h of ['consommer', 'entretenir', 'cultiver']) {
    await page.locator(`[data-hub=${h}]`).click()
    const pageHub = page.locator(`[data-hub-page=${h}]`)
    await expect(pageHub).toBeVisible()
    // Trois gros choix au plus d'emblée, le reste derrière « Voir plus ».
    expect(await pageHub.locator('.hub-card').count()).toBeLessThanOrEqual(3)
    expect(await overflow()).toBeLessThanOrEqual(0)
    await pageHub.getByRole('button', { name: 'Voir plus' }).click()
    expect(await pageHub.locator('.hub-card').count()).toBeGreaterThan(3)
    await pageHub.getByRole('button', { name: /Accueil/ }).click()
    await expect(page.locator('[data-hub=cultiver]')).toBeVisible()
  }
  // Un choix lance bien la fonction : « Ce qu'il y a à faire » ouvre À faire.
  await page.locator('[data-hub=entretenir]').click()
  await page.locator('[data-feat-run=a-faire]').click()
  await expect(page.locator('[data-feat=taches]')).toBeVisible()
  // Le bouton Accueil du menu ramène à la feuille.
  await page.getByRole('button', { name: /^Accueil$/ }).last().click()
  await expect(page.locator('[data-hub=cultiver]')).toBeVisible()
  // « Plus de choses » : l'accueil complet.
  await page.locator('[data-home-more]').click()
  await expect(page.locator('[data-more-card=tout]')).toBeVisible()
  await expect(page.locator('[data-home=ajouter]')).toBeHidden() // les autres actions sont repliées
  await page.getByText('Toutes les actions', { exact: true }).click()
  await expect(page.locator('[data-home=ajouter]')).toBeVisible()
})

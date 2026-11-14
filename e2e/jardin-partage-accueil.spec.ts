import { expect, test } from '@playwright/test'
import { mockNetwork } from './mocks'

// Accueil : « Jardin partagé » est un gros bouton visible d'emblée (sans faire défiler), « Aide » n'y est plus (elle reste dans l'en-tête).
test('accueil : Jardin partagé en vue, Aide seulement dans l’en-tête', async ({ page, baseURL }) => {
  await mockNetwork(page, baseURL!)
  await page.addInitScript(() => {
    try {
      localStorage.setItem('pj.tourSeen', '1')
    } catch {
      /* stockage indisponible */
    }
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Visiter un jardin d’exemple' }).click()
  const bouton = page.locator('[data-home=partage]')
  await expect(bouton).toBeVisible({ timeout: 60_000 })
  // Tout en haut de la liste : le premier gros bouton est « Ajouter une plante », le deuxième « Jardin partagé ».
  const ordre = await page.evaluate(() => [...document.querySelectorAll('[data-home]')].map((e) => (e as HTMLElement).dataset.home))
  expect(ordre.slice(0, 2)).toEqual(['ajouter', 'partage'])
  await expect(page.locator('[data-home=aide]')).toHaveCount(0)
  await expect(page.getByRole('button', { name: /^Aide/ }).first()).toBeVisible()
  await bouton.click()
  await expect(page.locator('[data-feat=jardin-partage]')).toBeVisible({ timeout: 15_000 })
})

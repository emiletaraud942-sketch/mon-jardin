import { expect, test } from '@playwright/test'
import { mockNetwork } from './mocks'

// Jardin à Rouen (parcelle 76540…) : le bouton « Jardinons ! (Métropole) » apparaît, la page montre les rendez-vous de l'agenda
// (simulé), les aides et les heures de tonte. Un jardin ailleurs : le bouton n'existe pas. Aucune requête hors de notre origine.
async function ouvrir(page: import('@playwright/test').Page, baseURL: string, idu?: string) {
  const externes = await mockNetwork(page, baseURL, idu ? { idu } : {})
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
  return externes
}

test('jardin à Rouen : page Jardinons ! avec agenda, aides et heures de tonte', async ({ page, baseURL }) => {
  const erreurs: string[] = []
  page.on('pageerror', (e) => erreurs.push(e.message))
  const externes = await ouvrir(page, baseURL!, '76540000AB0001')
  const bouton = page.locator('[data-home=jardinons]')
  await expect(bouton).toBeVisible()
  await bouton.click()
  const ecran = page.locator('[data-feat=territoire]')
  await expect(ecran).toBeVisible()
  await expect(ecran.getByTestId('territoire-intro')).toContainText('Votre jardin est dans la Métropole')
  await expect(ecran.locator('.terr-event')).toHaveCount(1)
  await expect(ecran.getByText('Un apéro sain et gourmand')).toBeVisible()
  await expect(ecran.getByRole('link', { name: /S’inscrire ou en savoir plus/ })).toHaveAttribute('href', /^https:\/\/openagenda\.com\//)
  await expect(ecran.getByRole('link', { name: /Voir la page de la Métropole/ })).toHaveAttribute('rel', /noopener/)
  const dl = page.waitForEvent('download')
  await ecran.getByRole('button', { name: 'Ajouter à mon calendrier' }).click()
  expect((await dl).suggestedFilename()).toMatch(/\.ics$/)
  await expect(ecran.getByText('10 h à 12 h')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)
  await ecran.getByRole('button', { name: 'Accueil' }).click()
  await expect(ecran).toHaveCount(0)
  expect(externes).toEqual([])
  expect(erreurs).toEqual([])
})

test('jardin ailleurs : pas de bouton Jardinons !', async ({ page, baseURL }) => {
  await ouvrir(page, baseURL!, '69123000AB0001')
  await expect(page.locator('[data-home=jardinons]')).toHaveCount(0)
})

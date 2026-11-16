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

  // 1 bis. Les listes sont courtes d'emblée (4 plantes au plus), le reste est derrière « Voir les N autres ».
  for (const h of await semer.locator('h3').all()) {
    const chips = h.locator('xpath=following-sibling::div[1]').locator('button.btn.small:not(.ghost)')
    expect(await chips.count()).toBeLessThanOrEqual(4)
  }
  const plus = semer.getByRole('button', { name: /^Voir les \d+ autres$/ }).first()
  if (await plus.count()) {
    await plus.click()
    await expect(semer.getByRole('button', { name: 'Voir moins' }).first()).toBeVisible()
    await semer.getByRole('button', { name: 'Voir moins' }).first().click()
  }

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

// « Lire le sachet en photo » : un sachet fabriqué (image dessinée), lu par le vrai Tesseract servi sous /ocr/.
// L'écran propose (nom, note) ; rien n'est ajouté avant « Ajouter ce sachet ».
test('lire un sachet en photo : champs proposés, rien d’ajouté tout seul', async ({ page, baseURL }) => {
  test.setTimeout(180_000)
  const externes = await mockNetwork(page, baseURL!)
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
  const graines = page.locator('[data-feat=mes-graines]')
  await graines.scrollIntoViewIfNeeded()
  await expect(graines.getByText('La photo n’est pas gardée et ne quitte pas l’appareil.')).toBeVisible()

  const url = await page.evaluate(() => {
    const c = document.createElement('canvas')
    c.width = 900
    c.height = 1200
    const g = c.getContext('2d')!
    g.fillStyle = '#e9f2d8'
    g.fillRect(0, 0, 900, 1200)
    g.fillStyle = '#2d4a1e'
    g.font = 'bold 70px sans-serif'
    g.fillText('TOMATE', 80, 200)
    g.font = '60px sans-serif'
    g.fillText('Marmande', 80, 300)
    g.fillStyle = '#222'
    g.font = '48px sans-serif'
    g.fillText('Semis : mars à mai', 80, 500)
    g.fillText('Récolte 2025', 80, 600)
    return c.toDataURL('image/png')
  })
  await graines.locator('input[type=file]').nth(1).setInputFiles({ name: 'sachet.png', mimeType: 'image/png', buffer: Buffer.from(url.split(',')[1], 'base64') })
  await expect(graines.getByText(/Lu sur le sachet : nom : Tomate/)).toBeVisible({ timeout: 150_000 })
  await expect(graines.getByText(/Semis indiqué sur le sachet : mars, avril et mai/)).toBeVisible()
  await expect(graines.getByLabel('Nom du sachet')).toHaveValue('Tomate')
  expect(await page.evaluate(() => localStorage.getItem('pj.seeds'))).toBeNull() // jamais d'ajout automatique
  await graines.getByRole('button', { name: 'Ajouter ce sachet' }).click()
  const liste = await page.evaluate(() => JSON.parse(localStorage.getItem('pj.seeds') || '[]'))
  expect(liste).toHaveLength(1)
  expect(liste[0]).toMatchObject({ name: 'Tomate', note: 'Récolte 2025' })
  expect(liste[0].at).toBeUndefined() // une année seule n'est pas un jour
  expect(externes).toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)
  expect(erreurs).toEqual([])
})

import { expect, test } from '@playwright/test'
import { mockNetwork } from './mocks'

// « Scanner un sachet ou une étiquette » depuis l'accueil : un sachet fabriqué (image dessinée), lu par le vrai Tesseract.
// Tout est proposé dans un formulaire ; rien n'est ajouté avant « Ajouter à mes graines » ; aucune requête hors de notre origine.
test('scanner un sachet : champs remplis, vérifiés, ajoutés avec leurs informations', async ({ page, baseURL }) => {
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
  await expect(page.locator('[data-home=etiquette]')).toBeVisible({ timeout: 60_000 })
  await page.locator('[data-home=etiquette]').click()
  const boite = page.locator('[data-feat=scanner-etiquette]')
  await expect(boite).toBeVisible()

  const url = await page.evaluate(() => {
    const c = document.createElement('canvas')
    c.width = 1000
    c.height = 1400
    const g = c.getContext('2d')!
    g.fillStyle = '#e9f2d8'
    g.fillRect(0, 0, 1000, 1400)
    g.fillStyle = '#2d4a1e'
    g.font = 'bold 80px sans-serif'
    g.fillText('TOMATE', 80, 160)
    g.fillStyle = '#222'
    g.font = '50px sans-serif'
    const L = ['Semis : mars à mai', 'Récolte : juillet à octobre', 'Profondeur : 1 cm', 'Germination : 10 jours', 'Distance entre plants : 50 cm', 'Exposition : plein soleil', 'Poids net : 1 g']
    L.forEach((t, i) => g.fillText(t, 80, 320 + i * 100))
    return c.toDataURL('image/png')
  })
  await boite.locator('input[type=file]').nth(1).setInputFiles({ name: 'sachet.png', mimeType: 'image/png', buffer: Buffer.from(url.split(',')[1], 'base64') })
  await expect(boite.getByLabel('Nom', { exact: true })).toHaveValue('Tomate', { timeout: 150_000 })
  await expect(boite.getByRole('button', { name: 'Sachet de graines' })).toHaveAttribute('aria-pressed', 'true')
  await expect(boite.getByRole('button', { name: 'mars' }).first()).toHaveAttribute('aria-pressed', 'true')
  expect(await page.evaluate(() => localStorage.getItem('pj.seeds'))).toBeNull() // jamais d'ajout automatique
  await boite.getByRole('button', { name: 'Ajouter à mes graines' }).click()
  const liste = await page.evaluate(() => JSON.parse(localStorage.getItem('pj.seeds') || '[]'))
  expect(liste).toHaveLength(1)
  expect(liste[0].name).toBe('Tomate')
  expect(liste[0].info.semis).toEqual([3, 4, 5])
  expect(liste[0].info.speciesId).toBe('tomate')
  expect(externes).toEqual([])
  expect(erreurs).toEqual([])
})

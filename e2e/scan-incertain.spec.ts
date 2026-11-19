import { expect, test } from '@playwright/test'
import { mockNetwork } from './mocks'

// Scan d'une plante dont Pl@ntNet n'est pas sûr (hiver) : aucun nom choisi d'office, la phrase « je ne suis pas sûr »,
// puis « Préciser avec 2 gros plans » qui envoie écorce + branche + image d'origine avec les bons organes. Pl@ntNet est simulé.
test('plante incertaine : pas de nom d’office, puis gros plans qui lèvent le doute', async ({ page, baseURL }) => {
  const externes = await mockNetwork(page, baseURL!, {})
  const appels: { organs?: string[]; images?: number }[] = []
  await page.route('**/api/identify', async (route) => {
    const body = route.request().postDataJSON() as { organs?: string[]; images?: string[] }
    appels.push({ organs: body.organs, images: body.images?.length })
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ results: [{ score: 0.62, latin: 'Malus domestica', commonNames: ['Pommier'], family: 'Rosaceae' }] }),
    })
  })
  await page.addInitScript(() => {
    try {
      localStorage.setItem('pj.tourSeen', '1')
      localStorage.setItem('permajardin:consent', JSON.stringify({ v: 2, plantnet: new Date().toISOString() }))
    } catch {
      /* stockage indisponible */
    }
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Visiter un jardin d’exemple' }).click()
  await page.locator('[data-home=planter]').waitFor({ timeout: 60_000 })

  // File d'attente préparée dans IndexedDB : une image de vidéo à valider, incertaine.
  await page.evaluate(async () => {
    const idb = (): Promise<IDBDatabase> =>
      new Promise((ok, ko) => {
        const r = indexedDB.open('keyval-store')
        r.onsuccess = () => ok(r.result)
        r.onerror = () => ko(r.error)
      })
    const db = await idb()
    const put = (k: string, v: unknown) =>
      new Promise<void>((ok, ko) => {
        const t = db.transaction('keyval', 'readwrite')
        t.objectStore('keyval').put(v, k)
        t.oncomplete = () => ok()
        t.onerror = () => ko(t.error)
      })
    const get = (k: string) =>
      new Promise<any>((ok, ko) => {
        const q = db.transaction('keyval').objectStore('keyval').get(k)
        q.onsuccess = () => ok(q.result)
        q.onerror = () => ko(q.error)
      })
    const state = await get('permajardin:state:v1')
    const garden = (state.gardens ?? state.data?.gardens)[0]
    await put('permajardin:scan-queue', [
      {
        id: 'i1', gardenId: garden.id, photoId: 'photo:e2eincertain', createdAt: new Date().toISOString(), position: { x: 1, y: 1 }, accuracyM: 4,
        status: 'a-valider', attempts: 0, plantStatus: 'en-place', from: 'video', uncertain: true, hint: 'Probablement du genre Acer',
        suggestions: [
          { latin: 'Liquidambar styraciflua', name: 'Copalme d’Amérique', score: 0.15, approx: false },
          { latin: 'Acer palmatum', name: 'Érable du Japon', score: 0.07, approx: false },
        ],
      },
    ])
    db.close()
  })
  await page.reload()
  await page.locator('[data-home=planter]').waitFor({ timeout: 60_000 })
  // La photo est rangée APRÈS le démarrage : le nettoyage des photos orphelines passe au lancement.
  await page.evaluate(async () => {
    const c = document.createElement('canvas')
    c.width = 64
    c.height = 48
    const g = c.getContext('2d')!
    g.fillStyle = '#6a8f4a'
    g.fillRect(0, 0, 64, 48)
    const blob: Blob = await new Promise((res) => c.toBlob((b) => res(b!), 'image/jpeg', 0.8))
    await new Promise<void>((ok, ko) => {
      const r = indexedDB.open('keyval-store')
      r.onsuccess = () => {
        const t = r.result.transaction('keyval', 'readwrite')
        t.objectStore('keyval').put(blob, 'photo:e2eincertain')
        t.oncomplete = () => ok()
        t.onerror = () => ko(t.error)
      }
      r.onerror = () => ko(r.error)
    })
  })
  await page.locator('[data-home=scanner]').click()
  await page.getByRole('button', { name: /Placer une plante en la photographiant/ }).click()

  const ligne = page.locator('.scan-item-head').first()
  await expect(ligne).toBeVisible({ timeout: 15_000 })
  await expect(ligne).toContainText('Plante à nommer')
  await expect(ligne).toContainText('Je ne suis pas sûr')
  await expect(ligne).toContainText('genre Acer')
  await ligne.click()
  await expect(page.locator('.scan-item-body').getByRole('button', { name: 'Valider' })).toBeDisabled()
  await expect(page.getByText('Choisissez dans la liste ci-dessous, ou précisez avec des gros plans.')).toBeVisible()

  // Gros plans : écorce puis branche (deux photos simulées), envoi avec les bons organes.
  await page.getByRole('button', { name: /Préciser avec 2 gros plans/ }).click()
  const fichier = { name: 'g.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', 'base64') }
  await page.locator('label', { hasText: 'L’écorce du tronc' }).locator('input[type=file]').setInputFiles(fichier)
  await page.locator('label', { hasText: 'Une branche avec ses bourgeons' }).locator('input[type=file]').setInputFiles(fichier)
  await page.getByRole('button', { name: 'Chercher le nom' }).click()
  await expect(page.getByText(/le nom proposé est choisi/)).toBeVisible({ timeout: 20_000 })
  expect(appels).toHaveLength(1)
  expect(appels[0].organs).toEqual(['bark', 'auto', 'auto'])
  expect(appels[0].images).toBe(3)
  await page.getByRole('dialog', { name: /gros plans/ }).getByRole('button', { name: 'Fermer', exact: true }).last().click()
  await expect(ligne).toContainText('Pommier')
  expect(externes).toEqual([])
})

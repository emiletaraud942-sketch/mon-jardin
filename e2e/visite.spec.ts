import { expect, test, type Page } from '@playwright/test'
import { mockNetwork } from './mocks'

// Visite en photos : trois points de vue (de fausses photos de couleur rangées dans IndexedDB), départ depuis la liste, rotation, pause,
// « Suivant », « Arrêter », légendes. Les photos sont fausses : on ne vérifie ni la caméra ni la boussole, seulement le déroulé.

async function preparerPoints(page: Page) {
  await page.evaluate(async () => {
    const photo = async (label: string, hue: number) => {
      const c = document.createElement('canvas')
      c.width = 640
      c.height = 480
      const g = c.getContext('2d')!
      const grd = g.createLinearGradient(0, 0, 640, 0)
      grd.addColorStop(0, `hsl(${hue},55%,60%)`)
      grd.addColorStop(1, `hsl(${hue + 40},55%,45%)`)
      g.fillStyle = grd
      g.fillRect(0, 0, 640, 480)
      g.fillStyle = '#fff'
      g.font = 'bold 56px sans-serif'
      g.fillText(label, 40, 260)
      return await new Promise<Blob>((r) => c.toBlob((b) => r(b!), 'image/jpeg', 0.8))
    }
    const db: IDBDatabase = await new Promise((res, rej) => {
      const rq = indexedDB.open('keyval-store')
      rq.onupgradeneeded = () => rq.result.createObjectStore('keyval')
      rq.onsuccess = () => res(rq.result)
      rq.onerror = () => rej(rq.error)
    })
    const put = (key: string, v: Blob) =>
      new Promise<void>((res, rej) => {
        const tx = db.transaction('keyval', 'readwrite')
        tx.objectStore('keyval').put(v, key)
        tx.oncomplete = () => res()
        tx.onerror = () => rej(tx.error)
      })
    // Point 1 à l'origine ; le point 3 est plus proche que le point 2 : la visite va 1 → 3 → 2.
    const points = [
      { id: 'panoa', x: 0, y: 0, h: 0 },
      { id: 'panob', x: 14, y: 3, h: 120 },
      { id: 'panoc', x: -6, y: 12, h: 240 },
    ]
    const panoramas = []
    for (const p of points) {
      const shots = []
      for (let k = 0; k < 8; k++) {
        const id = `photo:e2e${p.id}${k}`
        await put(id, await photo(`${p.id} ${k * 45}`, p.h + k * 5))
        shots.push({ photoId: id, headingDeg: k * 45, fovDeg: 70 })
      }
      panoramas.push({ id: p.id, x: p.x, y: p.y, takenAt: '2026-11-01T10:00:00Z', shots, kind: 'guide', northOk: true, bytes: 90000 })
    }
    // Copie de secours synchrone reprise au rechargement (elle est plus récente que ce qui est dans IndexedDB).
    const key = Object.keys(localStorage).find((k) => k.endsWith(':miroir'))!
    const s = JSON.parse(localStorage.getItem(key)!)
    s.data.gardens[0].panoramas = panoramas
    s.savedAt = Date.now() + 60_000
    localStorage.setItem(key, JSON.stringify(s))
  })
}

test('visite en photos : départ, rotation, pause, suivant, arrêt, légendes', async ({ page, baseURL }) => {
  const externes = await mockNetwork(page, baseURL!)
  const erreurs: string[] = []
  page.on('pageerror', (e) => erreurs.push(e.message))
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
  await preparerPoints(page)
  await page.reload()
  const passer = page.getByRole('button', { name: /Passer et découvrir/ })
  if (await passer.count()) await passer.click()

  // Liste : trois points et « Lancer la visite ».
  await page.locator('[data-home=photos]').click()
  await expect(page.locator('.pano-card')).toHaveCount(3)
  await expect(page.getByRole('button', { name: /Lancer la visite/ })).toBeVisible()
  await page.getByRole('button', { name: /Lancer la visite/ }).click()

  const stage = page.locator('.pano-stage')
  const etat = () => page.evaluate(() => ({ yaw: Number((document.querySelector('.pano-stage') as HTMLElement).dataset.yaw), label: document.querySelector('.pano-tour-label')?.textContent ?? '' }))
  await expect(page.locator('.pano-tour-label')).toContainText('étape 1 sur 3')
  await expect(page.locator('.pano-title strong')).toHaveText('Point 1')
  await expect(stage).not.toHaveAttribute('data-loading', 'true', { timeout: 20_000 })

  // La vue tourne toute seule (16° par seconde, après une courte pause à l'arrivée).
  const a = (await etat()).yaw
  await expect
    .poll(async () => (((await etat()).yaw - a + 360) % 360), { message: 'la vue doit tourner toute seule', timeout: 20_000, intervals: [500] })
    .toBeGreaterThan(20)

  // Pause : la vue ne bouge plus.
  await page.getByRole('button', { name: 'Pause' }).click()
  await expect(page.locator('.pano-tour-label')).toContainText('en pause')
  const p1 = (await etat()).yaw
  await page.waitForTimeout(1500)
  expect((await etat()).yaw).toBe(p1)
  await page.getByRole('button', { name: 'Reprendre' }).click()

  // Suivant : le point le plus proche du point 1 est le point 3.
  await page.getByRole('button', { name: /Suivant/ }).click()
  await expect(page.locator('.pano-tour-label')).toContainText('étape 2 sur 3')
  await expect(page.locator('.pano-title strong')).toHaveText('Point 3')
  await expect(page.getByRole('button', { name: /Précédent/ })).toBeEnabled()

  // Légendes : bouton à bascule, jamais caché (le nord est connu ici).
  const legendes = page.getByRole('button', { name: /Légendes/ })
  await expect(legendes).toHaveAttribute('aria-pressed', 'true')
  await legendes.click()
  await expect(legendes).toHaveAttribute('aria-pressed', 'false')
  await legendes.click()

  // Toucher la vue met la visite en pause ; choisir un point soi-même (flèche ou rangée de points) l'arrête.
  await stage.dispatchEvent('pointerdown', { pointerId: 1, clientX: 100, clientY: 300 })
  await expect(page.locator('.pano-tour-label')).toContainText('en pause')

  await page.getByRole('button', { name: 'Arrêter' }).click()
  await expect(page.locator('.pano-tour')).toHaveCount(0)
  await expect(page.getByRole('button', { name: /^Visite$/ })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), 'débordement horizontal').toBeLessThanOrEqual(0)
  expect(externes, 'requêtes sorties vers un autre domaine').toEqual([])
  expect(erreurs).toEqual([])
})

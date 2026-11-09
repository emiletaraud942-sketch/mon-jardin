import { expect, test, type Page } from '@playwright/test'
import { mockNetwork } from './mocks'

// Parcours de fumée : premier lancement, jardin d'exemple, ajout d'une plante, À faire, « Tout ce que je peux faire », Réglages.
// Un seul test par projet (mobile 390×844 et bureau 1280×800) : le jardin d'exemple est créé une fois, les étapes s'enchaînent.

/** Dépassement horizontal de la page (0 attendu). */
async function overflowX(page: Page): Promise<number> {
  return page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth)
}

test('parcours de base', async ({ page, baseURL }) => {
  const external = await mockNetwork(page, baseURL!)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(`pageerror : ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console : ${m.text()}`)
  })
  const noOverflow = async (etape: string) => expect(await overflowX(page), `débordement horizontal : ${etape}`).toBeLessThanOrEqual(0)
  // Au départ, on met de côté ce qui n'est pas l'objet du test : accord réseau déjà donné, visite des fonctions déjà vue.
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

  // 1. Premier lancement -> jardin d'exemple -> accueil à gros boutons.
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Commencer' })).toBeVisible()
  await noOverflow('bienvenue')
  await page.getByRole('button', { name: 'Visiter un jardin d’exemple' }).click()
  const ajouter = page.locator('[data-home=ajouter]')
  await expect(ajouter).toBeVisible({ timeout: 60_000 })
  await expect(page.locator('[data-home=afaire]')).toBeVisible()
  await expect(page.locator('[data-home=tout]')).toBeVisible()
  await noOverflow('accueil')

  // 2. Ajouter une plante : choisir l'espèce, viser le centre de la carte, valider.
  const avant = await ouvrirPlantes(page)
  await retourAccueil(page)
  await ajouter.click()
  const choix = page.getByRole('dialog')
  await choix.getByRole('textbox').fill('lavande')
  await choix.getByRole('button', { name: /^Lavande/ }).first().click()
  const carte = page.locator('.maplibregl-map').first()
  await expect(carte).toBeVisible({ timeout: 30_000 })
  await noOverflow('carte en placement')
  await page.getByRole('button', { name: /^Viser/ }).click()
  await page.getByRole('button', { name: /^Valider/ }).click()
  // Question d'achat facultative (« Comment l'avez-vous achetée ? ») : on la ferme.
  const achat = page.getByRole('dialog', { name: /Comment l’avez-vous achetée/ })
  await expect(achat).toBeVisible()
  await achat.getByRole('button', { name: /Fermer/ }).click()
  await expect(achat).toBeHidden()
  await noOverflow('après placement')

  // Elle apparaît dans « Mes plantes ».
  expect(await ouvrirPlantes(page), 'nombre de plantes dans « Mes plantes »').toBe(avant + 1)
  await expect(page.locator('[data-feat=liste-plantes]').getByText(/Lavande/i).first()).toBeVisible()
  await noOverflow('mes plantes')

  // 3. À faire s'ouvre.
  await retourAccueil(page)
  await page.locator('[data-home=afaire]').click()
  await expect(page.getByRole('heading', { name: /À faire/ }).first()).toBeVisible()
  await noOverflow('à faire')

  // 4. « Tout ce que je peux faire » : la recherche « sauvegarde » trouve un résultat.
  await retourAccueil(page)
  await page.locator('[data-home=tout]').click()
  const tout = page.getByRole('dialog', { name: /Tout ce que je peux faire/ })
  await expect(tout).toBeVisible()
  await tout.getByRole('searchbox').fill('sauvegarde')
  await expect(tout.getByRole('button', { name: /Sauvegarder mes données/ }).first()).toBeVisible()
  await noOverflow('tout ce que je peux faire')
  await page.keyboard.press('Escape')
  await expect(tout).toBeHidden()

  // 4 bis. Guide des ennuis : « Tout » → « Reconnaître un ennui du jardin » → recherche « puceron » → la fiche s'ouvre.
  await retourAccueil(page)
  await page.locator('[data-home=tout]').click()
  await tout.getByRole('searchbox').fill('puceron')
  await tout.getByRole('button', { name: /Reconnaître un ennui du jardin/ }).first().click()
  const ennuis = page.getByRole('dialog', { name: /Reconnaître un ennui du jardin/ })
  await expect(ennuis).toBeVisible()
  await ennuis.getByRole('searchbox').fill('puceron')
  await ennuis.getByRole('button', { name: /Pucerons/ }).first().click()
  await expect(page.getByRole('dialog', { name: 'Pucerons' }).getByRole('heading', { name: 'Ce que je vois' })).toBeVisible()
  await noOverflow('guide des ennuis')
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: /Pucerons|Reconnaître un ennui/ })).toBeHidden()

  // 5. Réglages affiche « Version ».
  await retourAccueil(page)
  await ouvrirReglages(page)
  await expect(page.getByText(/Version \d/).first()).toBeVisible()
  await noOverflow('réglages')

  // 6. Aucune erreur de console ni sortie vers Internet.
  expect(errors, 'erreurs de console ou de page').toEqual([])
  expect(external, 'requêtes sorties vers un autre domaine').toEqual([])
})

/** Barre de navigation (en bas sur téléphone, à gauche sur ordinateur). */
const nav = (page: Page) => page.getByRole('navigation', { name: 'Navigation principale' })

async function retourAccueil(page: Page) {
  await nav(page).getByRole('button', { name: 'Accueil' }).click()
  await expect(page.locator('[data-home=ajouter]')).toBeVisible()
}

/** Ouvre « Mes plantes » et renvoie leur nombre (lu dans le titre « Mes plantes (N) »). */
async function ouvrirPlantes(page: Page): Promise<number> {
  await nav(page).getByRole('button', { name: 'Mon jardin' }).click()
  await page.getByRole('tab', { name: 'Plantes' }).click()
  const titre = page.getByRole('heading', { name: /^Mes plantes \(\d+\)/ })
  await expect(titre).toBeVisible()
  return Number(/\((\d+)\)/.exec((await titre.textContent()) ?? '')?.[1])
}

async function ouvrirReglages(page: Page) {
  await page.getByRole('button', { name: 'Compte et réglages' }).filter({ visible: true }).first().click()
}

test('alerte de canicule : phrase sur l’accueil, badge « Canicule » dans À faire', async ({ page, baseURL }) => {
  const external = await mockNetwork(page, baseURL!, { heatWave: true, gust: 75 })
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(`pageerror : ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console : ${m.text()}`)
  })
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
  await expect(page.locator('[data-home=afaire]')).toBeVisible({ timeout: 60_000 })
  // Canicule et vent fort : la phrase de l'accueil nomme les deux et mène à À faire.
  const alerte = page.locator('[data-home-alert]')
  await expect(alerte).toBeVisible({ timeout: 30_000 })
  await expect(alerte).toContainText(/canicule/i)
  expect(await overflowX(page), 'débordement horizontal : accueil avec alerte').toBeLessThanOrEqual(0)
  await alerte.click()
  const urgent = page.locator('section.afaire-group', { has: page.getByRole('heading', { name: /^Urgent/ }) })
  await expect(urgent.locator('.badge.alert-canicule')).toContainText('Canicule')
  await expect(urgent.locator('.badge.alert-vent')).toContainText('Vent fort')
  expect(await overflowX(page), 'débordement horizontal : À faire avec alertes').toBeLessThanOrEqual(0)
  expect(external, 'requêtes hors de notre origine').toEqual([])
  expect(errors, 'erreurs de console').toEqual([])
})

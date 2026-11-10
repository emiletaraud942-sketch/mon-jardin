import { expect, test, type Page } from '@playwright/test'
import { mockNetwork } from './mocks'

// Parcours de fumée : premier lancement, jardin d'exemple, ajout d'une plante, À faire, « Tout ce que je peux faire », Réglages.
// Un seul test par projet (mobile 390×844 et bureau 1280×800) : le jardin d'exemple est créé une fois, les étapes s'enchaînent.

/** Une image PNG de 1 pixel : assez pour passer par le flux photo (décodage, recompression, rangement). */
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64')

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

  // 2 bis. Journal de la plante : deux photos datées d'aujourd'hui, modification de la date, comparaison avant / après au clavier.
  await page.locator('[data-feat=liste-plantes]').getByText(/Lavande/i).first().click()
  const journal = page.locator('[data-feat=journal]').filter({ visible: true })
  await journal.scrollIntoViewIfNeeded()
  await expect(journal.getByText('Aucune photo pour l’instant')).toBeVisible()
  await journal.locator('input[type=file]').setInputFiles([
    { name: 'a.png', mimeType: 'image/png', buffer: PNG },
    { name: 'b.png', mimeType: 'image/png', buffer: PNG },
  ])
  const aujourdhui = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' })
  await expect(journal.locator('.journal-item')).toHaveCount(2, { timeout: 30_000 })
  await expect(journal.locator('.journal-item').first()).toContainText(aujourdhui)
  await noOverflow('journal : deux photos')
  await journal.locator('.journal-item').last().getByRole('button', { name: /^Modifier/ }).click()
  await journal.getByLabel('Date de la photo').fill('2025-03-04')
  await journal.getByLabel('Note (facultatif)').fill('Avant la taille')
  await journal.getByRole('button', { name: /Enregistrer/ }).click()
  await expect(journal.locator('.journal-item').last()).toContainText('4 mars 2025')
  await expect(journal.locator('.journal-item').last()).toContainText('Avant la taille')
  const curseur = journal.locator('.compare-range')
  await expect(curseur).toBeVisible()
  await curseur.focus()
  await page.keyboard.press('ArrowRight')
  await expect(curseur).toHaveValue('51')
  await page.keyboard.press('End')
  await expect(curseur).toHaveValue('100')
  await expect(journal.locator('.compare-span')).toContainText('entre les deux photos')
  await noOverflow('journal : avant / après')
  await journal.locator('.journal-item').last().getByRole('button', { name: /^Supprimer/ }).click()
  await expect(journal.locator('.journal-item')).toHaveCount(1)
  await expect(journal.locator('.compare')).toHaveCount(0)
  await page.locator('.fiche-home, button.close-btn').filter({ visible: true }).first().click()

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

  // 4 bis 2. Conseils compost et eau : « Tout » → « Lire les conseils… » → recherche « paillage » → la fiche s'ouvre ; une recherche sans résultat dit « Rien ne correspond ».
  await retourAccueil(page)
  await page.locator('[data-home=tout]').click()
  await tout.getByRole('searchbox').fill('compost')
  await tout.getByRole('button', { name: /Lire les conseils compost et économie d’eau/ }).first().click()
  const conseils = page.getByRole('dialog', { name: /Conseils compost et économie d’eau/ })
  await expect(conseils).toBeVisible()
  await conseils.getByRole('searchbox').fill('xylophone')
  await expect(conseils.getByText('Rien ne correspond')).toBeVisible()
  await conseils.getByRole('searchbox').fill('paillage')
  await conseils.getByRole('button', { name: /Pailler pour garder l’humidité/ }).first().click()
  await expect(page.getByRole('dialog', { name: /Pailler pour garder l’humidité/ }).getByRole('heading', { name: 'Étape par étape' })).toBeVisible()
  await noOverflow('conseils')
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: /Pailler|Conseils compost/ })).toBeHidden()

  // 4 bis 3. Apprendre à jardiner : « Tout » → « Apprendre à jardiner » → leçon 1 → « Marquer comme terminée » → « 1 leçon sur 14 ».
  await retourAccueil(page)
  await page.locator('[data-home=tout]').click()
  await tout.getByRole('searchbox').fill('apprendre')
  await tout.getByRole('button', { name: /Apprendre à jardiner/ }).first().click()
  const lecons = page.getByRole('dialog', { name: 'Apprendre à jardiner' })
  await expect(lecons).toBeVisible()
  await expect(lecons.getByText('Aucune leçon terminée sur 14')).toBeVisible()
  await noOverflow('leçons (liste)')
  await lecons.getByRole('button', { name: /Commencer la leçon 1/ }).click()
  const lecon = page.getByRole('dialog', { name: 'Observer son jardin et le soleil' })
  await expect(lecon.getByRole('heading', { name: 'Les points à retenir' })).toBeVisible()
  await noOverflow('leçon')
  await lecon.getByRole('button', { name: 'Marquer comme terminée' }).click()
  await expect(lecon.getByRole('button', { name: 'Rouvrir cette leçon' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(lecons.getByText('1 leçon sur 14').first()).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: /Apprendre à jardiner|Observer son jardin/ })).toBeHidden()

  // 4 ter. Rotation du potager : « Tout » → « Voir la rotation de mon potager » → l'écran s'ouvre (liste ou état vide) et se ferme avec Échap.
  await retourAccueil(page)
  await page.locator('[data-home=tout]').click()
  await tout.getByRole('searchbox').fill('rotation')
  await tout.getByRole('button', { name: /Voir la rotation de mon potager/ }).first().click()
  const rotation = page.getByRole('dialog', { name: 'Rotation de mon potager' })
  await expect(rotation).toBeVisible()
  await expect(rotation.getByText(/Ce sont des conseils généraux/)).toBeVisible()
  await noOverflow('rotation du potager')
  await page.keyboard.press('Escape')
  await expect(rotation).toBeHidden()

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

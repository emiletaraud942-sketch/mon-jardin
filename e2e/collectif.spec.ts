import { expect, test } from '@playwright/test'
import { mockNetwork } from './mocks'

// Jardin collectif : responsable, parcelles, gestes et bilan, composteur, biodiversité, chantier, dossier imprimable.
test('jardin collectif', async ({ page, baseURL }) => {
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

  // Ouverture par « Tout ce que je peux faire » (recherche).
  await page.locator('[data-home=tout]').click()
  const tout = page.getByRole('dialog', { name: /Tout ce que je peux faire/ })
  await tout.getByRole('searchbox').fill('bilan')
  await tout.getByRole('button', { name: /Noter mes gestes et voir le bilan/ }).first().click()
  const ecran = page.locator('[data-feat=jardin-collectif]')
  await expect(ecran).toBeVisible()
  const gestes = ecran.locator('[data-feat=bilan-gestes]')
  await expect(gestes).toHaveAttribute('open', '')

  // Gestes : deux ajouts, bilan, retrait, annulation.
  await gestes.getByLabel('Quantité (kilos)').fill('12,5')
  await gestes.getByRole('button', { name: 'Ajouter ce geste' }).click()
  await gestes.getByLabel('Quantité (kilos)').fill('7.5')
  await gestes.getByRole('button', { name: 'Ajouter ce geste' }).click()
  await expect(gestes.getByTestId('bilan-total')).toHaveText(/20\s*kg/)
  await gestes.getByRole('button', { name: /Retirer le geste/ }).first().click()
  await expect(gestes.getByTestId('bilan-total')).not.toHaveText(/20\s*kg/)
  await page.locator('.toast-host').getByRole('button', { name: 'Annuler' }).click()
  await expect(gestes.getByTestId('bilan-total')).toHaveText(/20\s*kg/)

  // Responsable et charte.
  await ecran.locator('summary', { hasText: 'Qui coordonne le jardin' }).click()
  const resp = ecran.locator('[data-feat=collectif-responsable]')
  await resp.getByLabel('Personne qui coordonne').fill('Sam')
  await resp.getByRole('button', { name: 'Enregistrer' }).click()
  await resp.getByRole('checkbox').check()

  // Parcelles : 4 × 3 = 12, attribuer la 1re, retirer tout.
  await ecran.locator('summary', { hasText: 'Parcelles individuelles' }).click()
  const parc = ecran.locator('[data-feat=parcelles]')
  await parc.getByRole('button', { name: 'Créer 12 parcelles' }).click()
  await expect(parc.locator('.coll-plots li')).toHaveCount(12)
  await parc.getByLabel('Cultivée par, parcelle 1', { exact: true }).fill('Marie')
  await parc.getByLabel('Cultivée par, parcelle 2', { exact: true }).focus()
  await expect(parc.getByLabel('Cultivée par, parcelle 1', { exact: true })).toHaveValue('Marie')

  // Composteur : départ ancien => « À retourner » ou « mûr ».
  await ecran.locator('summary', { hasText: 'Composteurs' }).click()
  const comp = ecran.locator('[data-feat=suivi-compost]')
  const ancien = new Date(Date.now() - 50 * 86_400_000).toISOString().slice(0, 10)
  await comp.getByLabel('Mis en route le').fill(ancien)
  await comp.getByRole('button', { name: 'Ajouter un composteur' }).click()
  await expect(comp.locator('.coll-compost.tourner')).toBeVisible()
  await comp.getByRole('button', { name: 'Je l’ai retourné aujourd’hui' }).click()
  await expect(comp.locator('.coll-compost.ok')).toBeVisible()

  // Biodiversité et chantier.
  await ecran.locator('summary', { hasText: 'Pour la biodiversité' }).click()
  await ecran.locator('[data-feat=biodiversite]').getByRole('checkbox').first().check()
  await ecran.locator('summary', { hasText: 'Inviter à un chantier' }).click()
  const ch = ecran.locator('[data-feat=chantier-participatif]')
  await ch.getByRole('button', { name: 'Partager l’invitation' }).click()
  await expect(page.getByText('Donnez un titre au chantier.')).toBeVisible()

  // Rien n'est perdu au rechargement (les gestes, le responsable et les parcelles sont dans le jardin).
  await page.waitForTimeout(500)
  const etat = await page.evaluate(() => {
    const k = Object.keys(localStorage).find((x) => x.endsWith(':miroir'))!
    const g = JSON.parse(localStorage.getItem(k)!).data.gardens[0]
    return { gestes: g.gestes?.length, coord: g.collectif?.coordinateur, charte: !!g.collectif?.charteAt, plots: g.plots?.length, holder: g.plots?.[0]?.holder, comp: g.composteurs?.length, hab: g.habitats?.length }
  })
  expect(etat).toEqual({ gestes: 2, coord: 'Sam', charte: true, plots: 12, holder: 'Marie', comp: 1, hab: 1 })

  // Dossier : la feuille existe dans la page, cachée à l'écran.
  const feuille = page.locator('.print-dossier')
  await expect(feuille).toHaveCount(1)
  await expect(feuille).toBeHidden()
  await expect(feuille.locator('svg.pd-plan')).toHaveCount(1)
  await expect(feuille.getByText('Dossier du jardin :')).toHaveCount(1)
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)
  expect(externes).toEqual([])
  expect(erreurs).toEqual([])
})

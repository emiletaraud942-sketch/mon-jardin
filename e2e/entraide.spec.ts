import { expect, test, type Page } from '@playwright/test'
import { mockNetwork } from './mocks'

// Entraide : accord, connexion par code reçu par e-mail, création du profil. Site construit avec une URL et une clé FAUSSES (`npm run build:e2e-entraide`) :
// aucun vrai projet Supabase n'est joint. Le faux serveur ci-dessous ne répond qu'aux routes d'authentification et renvoie « aucune ligne » pour les tables.

const HOTE = 'https://e2e-entraide.supabase.co'
const BON_CODE = '123456'
const USER_ID = '11111111-1111-4111-8111-111111111111'

interface FauxServeur {
  /** Adresses pour lesquelles un code a été demandé. */
  codes: string[]
  /** Codes essayés. */
  essais: string[]
}

/** Faux serveur d'authentification : le code `123456` est le seul accepté ; une session valide une heure est rendue. */
async function fauxSupabase(page: Page): Promise<FauxServeur> {
  const etat: FauxServeur = { codes: [], essais: [] }
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const session = () => {
    const exp = Math.floor(Date.now() / 1000) + 3600
    const user = { id: USER_ID, email: 'marie@example.fr', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-10-30T00:00:00Z' }
    return { access_token: `e2e.${b64({ sub: USER_ID, exp, role: 'authenticated', aud: 'authenticated' })}.e2e`, refresh_token: `r${Date.now()}`, token_type: 'bearer', expires_in: 3600, expires_at: exp, user }
  }
  await page.route(`${HOTE}/**`, async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    const json = (status: number, body: unknown) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) })
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } })
    if (url.pathname === '/auth/v1/otp') {
      const body = JSON.parse(req.postData() || '{}') as { email?: string }
      if (body.email) etat.codes.push(body.email)
      return json(200, {})
    }
    if (url.pathname === '/auth/v1/verify') {
      const body = JSON.parse(req.postData() || '{}') as { token?: string }
      etat.essais.push(String(body.token))
      if (body.token === BON_CODE) return json(200, session())
      return json(403, { code: 403, error_code: 'otp_expired', msg: 'Token has expired or is invalid' })
    }
    if (url.pathname === '/auth/v1/user') return json(200, session().user)
    if (url.pathname === '/auth/v1/token') return json(200, session())
    if (url.pathname.startsWith('/rest/v1/')) return json(200, [])
    return json(200, {})
  })
  return etat
}

test('entraide : accord, code par e-mail, mauvais code, bon code, création du profil', async ({ page, baseURL }) => {
  const externes = await mockNetwork(page, baseURL!)
  const faux = await fauxSupabase(page)
  const erreurs: string[] = []
  page.on('pageerror', (e) => erreurs.push(`pageerror : ${e.message}`))
  // Seul le consentement à l'entraide est laissé de côté : le test le donne lui-même.
  await page.addInitScript(() => {
    try {
      if (sessionStorage.getItem('e2e-init')) return
      sessionStorage.setItem('e2e-init', '1')
      localStorage.setItem('permajardin:consent', JSON.stringify({ v: 1, plantnet: new Date().toISOString() }))
      localStorage.setItem('pj.tourSeen', '1')
    } catch {
      /* stockage indisponible */
    }
  })

  await page.goto('/')
  await page.getByRole('button', { name: 'Visiter un jardin d’exemple' }).click()
  await expect(page.locator('[data-home=ajouter]')).toBeVisible({ timeout: 60_000 })

  // 1. L'onglet Voisins existe (l'entraide est configurée) ; rien ne part avant l'accord.
  await page.getByRole('button', { name: /^Voisins/ }).first().click()
  await expect(page.getByRole('heading', { name: 'Avant de commencer' })).toBeVisible()
  expect(faux.codes, 'aucun code demandé avant l’accord').toEqual([])
  await page.getByRole('button', { name: 'J’accepte et je continue' }).click()

  // 2. Adresse e-mail -> un code est demandé pour CETTE adresse.
  await expect(page.getByRole('heading', { name: 'Votre adresse e-mail' })).toBeVisible()
  await page.getByLabel('Adresse e-mail').fill('marie@example.fr')
  await page.getByRole('button', { name: /Recevoir un code par e-mail/ }).click()
  await expect(page.getByRole('heading', { name: 'Regardez vos e-mails' })).toBeVisible()
  expect(faux.codes).toEqual(['marie@example.fr'])

  // 3. Mauvais code : message clair, on reste sur l'écran.
  const champ = page.getByLabel('Code reçu par e-mail')
  await champ.fill('000000')
  await page.getByRole('button', { name: /^Me connecter/ }).click()
  await expect(page.getByText(/Code incorrect ou expiré/)).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Regardez vos e-mails' })).toBeVisible()

  // 4. Bon code (saisi avec une espace, comme sur un téléphone) : on est connecté, l'écran du profil s'ouvre.
  await champ.fill('123 456')
  await page.getByRole('button', { name: /^Me connecter/ }).click()
  await expect(page.getByRole('heading', { name: 'Créez votre profil' })).toBeVisible()
  expect(faux.essais).toEqual(['000000', BON_CODE])

  // 5. La session reste ouverte après un rechargement (pas de nouveau code demandé).
  await page.reload()
  await page.getByRole('button', { name: /^Voisins/ }).first().click()
  await expect(page.getByRole('heading', { name: 'Créez votre profil' })).toBeVisible()
  expect(faux.codes, 'aucun second code après le rechargement').toEqual(['marie@example.fr'])

  expect(Math.max(0, await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)), 'débordement horizontal').toBe(0)
  expect(externes, 'requêtes sorties vers un autre domaine').toEqual([])
  expect(erreurs).toEqual([])
})

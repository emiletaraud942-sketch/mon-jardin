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
  /** Corps reçus par la fonction publique d'événements (v10). */
  publics: { p_lat?: number; p_lon?: number }[]
}

interface Options {
  /** Faux : la base n'a pas la migration v10 (fonction introuvable). */
  v10?: boolean
}

/** Quatre événements ouverts : trois visibles d'emblée, le quatrième dans le repli. */
const EVENEMENTS = [0, 1, 2, 3].map((i) => ({ title: `Atelier public ${i + 1}`, starts_at: `2026-11-1${4 + i}T14:00:00Z`, ends_at: `2026-11-1${4 + i}T16:00:00Z`, place: `Salle ${i + 1}`, organizer_name: 'Les Jardiniers du quartier' }))

/** Faux serveur d'authentification : le code `123456` est le seul accepté ; une session valide une heure est rendue. */
async function fauxSupabase(page: Page, opts: Options = {}): Promise<FauxServeur> {
  const etat: FauxServeur = { codes: [], essais: [], publics: [] }
  const v10 = opts.v10 !== false
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
    if (url.pathname === '/rest/v1/rpc/neighbors_public_events') {
      etat.publics.push(JSON.parse(req.postData() || '{}') as { p_lat?: number; p_lon?: number })
      if (!v10) return json(404, { code: 'PGRST202', message: 'Could not find the function public.neighbors_public_events(p_lat, p_lon) in the schema cache', details: null, hint: null })
      return json(200, EVENEMENTS)
    }
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

  // 1 bis. Événements vus sans compte (v10) : seule la grande cellule du jardin (≈ 5 km) part, jamais la position exacte ; trois cartes, le reste dans un repli.
  const publics = page.locator('[data-feat=evenements]')
  await expect(publics.getByRole('heading', { name: 'Événements près de chez vous' })).toBeVisible()
  await expect(publics.locator('li')).toHaveCount(4)
  await expect(publics.getByText('Atelier public 1')).toBeVisible()
  await expect(publics.getByText('Atelier public 4')).toBeHidden()
  await publics.getByText('Voir l’autre événement').click()
  await expect(publics.getByText('Atelier public 4')).toBeVisible()
  expect(faux.publics, 'une seule demande, avec une cellule arrondie à 5 km (jardin d’exemple de Rezé : 47,176 / -1,556)').toEqual([{ p_lat: 47.2, p_lon: -1.54 }])
  await expect(publics.getByRole('button')).toHaveCount(0)

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
  await expect(page.getByRole('heading', { name: 'Événements près de chez vous' })).toBeHidden()
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

test('entraide : base sans la v10, aucune liste et aucun message avant la connexion', async ({ page, baseURL }) => {
  const externes = await mockNetwork(page, baseURL!)
  const faux = await fauxSupabase(page, { v10: false })
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
  await page.getByRole('button', { name: /^Voisins/ }).first().click()
  await page.getByRole('button', { name: 'J’accepte et je continue' }).click()
  await expect(page.getByRole('heading', { name: 'Votre adresse e-mail' })).toBeVisible()
  await expect.poll(() => faux.publics.length).toBeGreaterThan(0)
  await expect(page.getByRole('heading', { name: 'Événements près de chez vous' })).toBeHidden()
  await expect(page.getByText(/ne sont pas disponibles/)).toBeHidden()
  expect(externes, 'requêtes sorties vers un autre domaine').toEqual([])
})

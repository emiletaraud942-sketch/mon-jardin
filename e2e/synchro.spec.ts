import { expect, test, type Page } from '@playwright/test'
import { mockNetwork } from './mocks'

// Copie en ligne automatique entre deux appareils : deux navigateurs séparés (deux « téléphones »), un FAUX serveur Supabase en mémoire
// (authentification par code, table garden_snapshots, espace de fichiers « photos »). Site construit avec une URL et une clé FAUSSES
// (`npm run build:e2e-synchro`) : aucun vrai projet n'est joint. Ce test vérifie la chaîne côté appli (accord, envoi des plantes et des
// photos, reprise sur le second appareil, état affiché) ; il ne prouve rien sur le vrai Supabase.

const HOTE = 'https://e2e-synchro.supabase.co'
const BON_CODE = '123456'
const USER_ID = '22222222-2222-4222-8222-222222222222'
const EMAIL = 'marie@example.fr'

interface Ligne {
  user_id: string
  data: { plants?: { speciesId: string; photos: string[] }[]; gardens?: unknown[] }
  updated_at: string
}

/** Le faux serveur : partagé par les deux appareils. */
interface Serveur {
  ligne?: Ligne
  /** Fichiers de l'espace « photos » : nom → octets. */
  fichiers: Map<string, Buffer>
  codes: string[]
  horloge: number
}

function nouveauServeur(): Serveur {
  return { fichiers: new Map(), codes: [], horloge: Date.parse('2026-11-12T08:00:00Z') }
}

async function brancher(page: Page, srv: Serveur) {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const session = () => {
    const exp = Math.floor(Date.now() / 1000) + 3600
    const user = { id: USER_ID, email: EMAIL, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-10-30T00:00:00Z' }
    return { access_token: `e2e.${b64({ sub: USER_ID, exp, role: 'authenticated', aud: 'authenticated' })}.e2e`, refresh_token: `r${Date.now()}`, token_type: 'bearer', expires_in: 3600, expires_at: exp, user }
  }
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': '*' }
  await page.route(`${HOTE}/**`, async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    const json = (status: number, body: unknown) => route.fulfill({ status, contentType: 'application/json', headers: cors, body: JSON.stringify(body) })
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors })
    const p = url.pathname
    if (p === '/auth/v1/otp') {
      const body = JSON.parse(req.postData() || '{}') as { email?: string }
      if (body.email) srv.codes.push(body.email)
      return json(200, {})
    }
    if (p === '/auth/v1/verify') {
      const body = JSON.parse(req.postData() || '{}') as { token?: string }
      return body.token === BON_CODE ? json(200, session()) : json(403, { code: 403, error_code: 'otp_expired', msg: 'Token has expired or is invalid' })
    }
    if (p === '/auth/v1/user') return json(200, session().user)
    if (p === '/auth/v1/token') return json(200, session())

    // Table des copies : une ligne par utilisateur ; `updated_at` fixé par le « serveur » à chaque écriture, comme le déclencheur SQL.
    if (p === '/rest/v1/garden_snapshots') {
      const touche = () => new Date((srv.horloge += 60_000)).toISOString()
      const unique = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object')
      const rendu = (rows: unknown[]) => (unique ? (rows[0] ? json(200, rows[0]) : json(406, { code: 'PGRST116', message: 'no rows' })) : json(200, rows))
      if (req.method() === 'GET') {
        const champs = (url.searchParams.get('select') ?? '').split(',')
        const l = srv.ligne
        return rendu(l ? [Object.fromEntries(champs.map((c) => [c, (l as unknown as Record<string, unknown>)[c]]))] : [])
      }
      const body = JSON.parse(req.postData() || '{}') as { user_id?: string; data?: Ligne['data'] }
      if (req.method() === 'POST') {
        const upsert = (req.headers()['prefer'] ?? '').includes('merge-duplicates')
        if (srv.ligne && !upsert) return json(409, { code: '23505', message: 'duplicate key value violates unique constraint', details: null, hint: null })
        srv.ligne = { user_id: USER_ID, data: body.data ?? {}, updated_at: touche() }
        return route.fulfill({ status: 201, contentType: 'application/json', headers: cors, body: JSON.stringify([{ updated_at: srv.ligne.updated_at }]) })
      }
      if (req.method() === 'PATCH') {
        const attendu = (url.searchParams.get('updated_at') ?? '').replace(/^eq\./, '')
        if (!srv.ligne || srv.ligne.updated_at !== attendu) return json(200, [])
        srv.ligne = { ...srv.ligne, data: body.data ?? srv.ligne.data, updated_at: touche() }
        return json(200, [{ updated_at: srv.ligne.updated_at }])
      }
      return json(200, [])
    }

    // Espace de fichiers « photos » (privé, un dossier par utilisateur).
    if (p.startsWith('/storage/v1/object/list/photos')) {
      const body = JSON.parse(req.postData() || '{}') as { prefix?: string; limit?: number; offset?: number }
      const prefix = `${body.prefix ?? ''}/`
      const items = [...srv.fichiers.entries()]
        .filter(([nom]) => nom.startsWith(prefix))
        .map(([nom, octets]) => ({ name: nom.slice(prefix.length), id: nom, created_at: new Date().toISOString(), metadata: { size: octets.length, mimetype: 'image/jpeg' } }))
      return json(200, items.slice(body.offset ?? 0, (body.offset ?? 0) + (body.limit ?? 100)))
    }
    const objet = /^\/storage\/v1\/object\/(?:authenticated\/)?photos\/(.+)$/.exec(p)
    if (objet) {
      const nom = decodeURIComponent(objet[1])
      if (req.method() === 'GET') {
        const octets = srv.fichiers.get(nom)
        return octets ? route.fulfill({ status: 200, contentType: 'image/jpeg', headers: cors, body: octets }) : json(404, { statusCode: '404', error: 'not_found', message: 'Object not found' })
      }
      if (req.method() === 'POST' || req.method() === 'PUT') {
        if (srv.fichiers.has(nom) && req.method() === 'POST') return json(409, { statusCode: '409', error: 'Duplicate', message: 'The resource already exists' })
        // Corps « multipart » : on garde les octets de l'image (de l'en-tête JPEG FF D8 à la fin de la partie).
        const brut = req.postDataBuffer() ?? Buffer.alloc(0)
        const debut = brut.indexOf(Buffer.from([0xff, 0xd8, 0xff]))
        const fin = brut.lastIndexOf(Buffer.from('\r\n--'))
        srv.fichiers.set(nom, brut.subarray(debut < 0 ? 0 : debut, fin > debut ? fin : brut.length))
        return json(200, { Key: `photos/${nom}`, Id: nom })
      }
    }
    if (p === '/storage/v1/object/photos' && req.method() === 'DELETE') {
      const body = JSON.parse(req.postData() || '{}') as { prefixes?: string[] }
      for (const n of body.prefixes ?? []) srv.fichiers.delete(n)
      return json(200, [])
    }
    return json(200, [])
  })
}

async function preparer(page: Page, srv: Serveur) {
  const erreurs: string[] = []
  page.on('pageerror', (e) => erreurs.push(`pageerror : ${e.message}`))
  await mockNetwork(page, 'http://127.0.0.1:4795')
  await brancher(page, srv)
  await page.addInitScript(() => {
    try {
      if (sessionStorage.getItem('e2e-init')) return
      sessionStorage.setItem('e2e-init', '1')
      localStorage.setItem('pj.tourSeen', '1')
    } catch {
      /* stockage indisponible */
    }
  })
  return erreurs
}

/** Ajoute deux abricotiers (l'un avec une vraie petite photo JPEG) au jardin d'exemple, par la copie de secours synchrone reprise au rechargement. */
async function semer(page: Page) {
  await page.evaluate(async () => {
    const c = document.createElement('canvas')
    c.width = 320
    c.height = 240
    const g = c.getContext('2d')!
    g.fillStyle = '#d98a2b'
    g.fillRect(0, 0, 320, 240)
    const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b!), 'image/jpeg', 0.8))
    const db: IDBDatabase = await new Promise((res, rej) => {
      const rq = indexedDB.open('keyval-store')
      rq.onupgradeneeded = () => rq.result.createObjectStore('keyval')
      rq.onsuccess = () => res(rq.result)
      rq.onerror = () => rq.error && rej(rq.error)
    })
    await new Promise<void>((res, rej) => {
      const tx = db.transaction('keyval', 'readwrite')
      tx.objectStore('keyval').put(blob, 'photo:e2esyncA')
      tx.oncomplete = () => res()
      tx.onerror = () => rej(tx.error)
    })
    const key = Object.keys(localStorage).find((k) => k.endsWith(':miroir'))!
    const s = JSON.parse(localStorage.getItem(key)!)
    const gid = s.data.gardens[0].id as string
    const plante = (id: string, x: number, photos: string[]) => ({ id, gardenId: gid, speciesId: 'abricotier', position: { x, y: 2 }, plantedAt: '2026-03-01', status: 'en-place', photos })
    s.data.plants = [...s.data.plants, plante('e2e-abricot-1', 3, ['photo:e2esyncA']), plante('e2e-abricot-2', 6, [])]
    s.savedAt = Date.now() + 60_000
    localStorage.setItem(key, JSON.stringify(s))
  })
}

async function etatLocal(page: Page) {
  return page.evaluate(async () => {
    const key = Object.keys(localStorage).find((k) => k.endsWith(':miroir'))
    const s = key ? JSON.parse(localStorage.getItem(key)!) : undefined
    const abricotiers = ((s?.data?.plants ?? []) as { speciesId: string }[]).filter((p) => p.speciesId === 'abricotier').length
    const db: IDBDatabase = await new Promise((res, rej) => {
      const rq = indexedDB.open('keyval-store')
      rq.onupgradeneeded = () => rq.result.createObjectStore('keyval')
      rq.onsuccess = () => res(rq.result)
      rq.onerror = () => rq.error && rej(rq.error)
    })
    const photo: unknown = await new Promise((res) => {
      const rq = db.transaction('keyval').objectStore('keyval').get('photo:e2esyncA')
      rq.onsuccess = () => res(rq.result)
      rq.onerror = () => res(undefined)
    })
    return { abricotiers, photo: photo instanceof Blob ? photo.size : 0 }
  })
}

async function ouvrirSynchro(page: Page) {
  await page.locator('[data-home=tout]').click()
  const tout = page.getByRole('dialog', { name: /Tout ce que je peux faire/ })
  await expect(tout).toBeVisible()
  await tout.getByRole('searchbox').fill('autre appareil')
  await tout.getByRole('button', { name: /Retrouver mes jardins sur un autre appareil/ }).first().click()
  // La rubrique s'ouvre d'elle-même ; si elle reste repliée, on l'ouvre (un seul appui).
  const champ = page.getByRole('textbox', { name: 'Votre adresse e-mail' })
  await champ.waitFor({ state: 'visible', timeout: 4000 }).catch(async () => {
    await page.getByText('Retrouver mes jardins sur un autre appareil', { exact: true }).last().click()
  })
}

test('synchro : deux appareils, plantes et photo envoyées puis reprises', async ({ browser, baseURL }) => {
  test.setTimeout(180_000)
  const srv = nouveauServeur()

  // ---- Appareil A : un jardin avec deux abricotiers, dont un avec une photo ----
  const ctxA = await browser.newContext({ baseURL, locale: 'fr-FR', timezoneId: 'Europe/Paris', serviceWorkers: 'block', viewport: { width: 390, height: 844 } })
  const a = await ctxA.newPage()
  const erreursA = await preparer(a, srv)
  await a.goto('/')
  await a.getByRole('button', { name: 'Visiter un jardin d’exemple' }).click()
  await expect(a.locator('[data-home=ajouter]')).toBeVisible({ timeout: 60_000 })
  await semer(a)
  await a.reload()
  const passer = a.getByRole('button', { name: /Passer et découvrir/ })
  if (await passer.count()) await passer.click()
  await expect(a.locator('[data-home=ajouter]')).toBeVisible({ timeout: 60_000 })
  expect((await etatLocal(a)).abricotiers, 'les deux abricotiers sont bien là avant la connexion').toBe(2)
  expect(srv.ligne, 'rien en ligne avant l’accord et la connexion').toBeUndefined()

  await ouvrirSynchro(a)
  await a.getByRole('textbox', { name: 'Votre adresse e-mail' }).fill(EMAIL)
  await a.getByRole('button', { name: /Recevoir un code par e-mail/ }).click()
  // L'accord « copie en ligne » est demandé AVANT l'envoi du code.
  expect(srv.codes, 'aucun code avant l’accord').toEqual([])
  await a.getByRole('button', { name: /Accepter et continuer/ }).click()
  await expect(a.getByLabel('Code reçu par e-mail')).toBeVisible()
  expect(srv.codes).toEqual([EMAIL])
  await a.getByLabel('Code reçu par e-mail').fill(BON_CODE)
  await a.getByRole('button', { name: /^Me connecter/ }).click()
  await expect(a.getByText(/Copie en ligne à jour/).first()).toBeVisible({ timeout: 30_000 })

  // La copie en ligne a les deux abricotiers et la photo.
  await expect.poll(() => srv.ligne?.data.plants?.filter((p) => p.speciesId === 'abricotier').length, { timeout: 15_000 }).toBe(2)
  await expect.poll(() => [...srv.fichiers.keys()], { timeout: 20_000 }).toEqual([`${USER_ID}/e2esyncA.jpg`])
  expect(srv.fichiers.get(`${USER_ID}/e2esyncA.jpg`)![0], 'le fichier envoyé est bien un JPEG').toBe(0xff)

  // ---- Appareil B : un téléphone neuf, « J'ai déjà un compte » ----
  const ctxB = await browser.newContext({ baseURL, locale: 'fr-FR', timezoneId: 'Europe/Paris', serviceWorkers: 'block', viewport: { width: 390, height: 844 } })
  const b = await ctxB.newPage()
  const erreursB = await preparer(b, srv)
  await b.goto('/')
  await b.getByRole('button', { name: 'J’ai déjà un compte' }).click()
  await b.getByRole('textbox', { name: 'Votre adresse e-mail' }).fill(EMAIL)
  await b.getByRole('button', { name: /Recevoir un code par e-mail/ }).click()
  await b.getByRole('button', { name: /Accepter et continuer/ }).click()
  await b.getByLabel('Code reçu par e-mail').fill(BON_CODE)
  await b.getByRole('button', { name: /^Me connecter/ }).click()
  // L'écran de bienvenue disparaît dès que les jardins arrivent (le message « repris » n'a pas le temps d'être lu) : on vérifie les données.
  await expect.poll(async () => (await etatLocal(b)).abricotiers, { timeout: 20_000 }).toBe(2)
  // La photo arrive ensuite, à part.
  await expect.poll(async () => (await etatLocal(b)).photo, { timeout: 30_000, message: 'la photo doit arriver sur le second appareil' }).toBeGreaterThan(0)

  for (const [nom, page] of [['A', a], ['B', b]] as const) {
    expect(Math.max(0, await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)), `débordement horizontal (${nom})`).toBe(0)
  }
  expect(erreursA).toEqual([])
  expect(erreursB).toEqual([])
  await ctxA.close()
  await ctxB.close()
})

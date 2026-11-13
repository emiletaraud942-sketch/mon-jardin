import { expect, test, type Page } from '@playwright/test'
import { mockNetwork } from './mocks'

// Jardin partagé à deux appareils : Alice partage son jardin (deux abricotiers), invite par un code, Bob le rejoint, modifie une plante,
// Alice reprend la modification. Faux serveur Supabase en mémoire (site construit avec URL et clé FAUSSES : `npm run build:e2e-synchro`) :
// il applique les mêmes règles que la base (membres seulement, base de version, 20 membres…) mais ne prouve rien sur le vrai Supabase.

const HOTE = 'https://e2e-synchro.supabase.co'
const BON_CODE = '123456'
const ID: Record<string, string> = { 'alice@example.fr': 'aaaaaaaa-0000-4000-8000-000000000001', 'bob@example.fr': 'bbbbbbbb-0000-4000-8000-000000000002', 'carol@example.fr': 'cccccccc-0000-4000-8000-000000000003' }

interface Jardin { id: string; name: string; garden: unknown; updated_at: string }
interface Serveur {
  jardins: Map<string, Jardin>
  membres: { garden_id: string; user_id: string; role: string; display_name: string; joined_at: string }[]
  invitations: Map<string, string>
  plantes: Map<string, { garden_id: string; id: string; data: Record<string, unknown>; deleted: boolean; updated_at: string }>
  snapshots: Map<string, { data: unknown; updated_at: string }>
  horloge: number
}
const nouveau = (): Serveur => ({ jardins: new Map(), membres: [], invitations: new Map(), plantes: new Map(), snapshots: new Map(), horloge: Date.parse('2026-11-13T08:00:00Z') })

async function brancher(page: Page, srv: Serveur) {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const session = (email: string) => {
    const exp = Math.floor(Date.now() / 1000) + 3600
    const uid = ID[email]
    const user = { id: uid, email, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-10-30T00:00:00Z' }
    return { access_token: `e2e.${b64({ sub: uid, exp, role: 'authenticated', aud: 'authenticated', email })}.e2e`, refresh_token: `r|${email}`, token_type: 'bearer', expires_in: 3600, expires_at: exp, user }
  }
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': '*' }
  const stamp = () => new Date((srv.horloge += 1000)).toISOString().replace('Z', '123+00:00')
  await page.route(`${HOTE}/**`, async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    const json = (status: number, body: unknown) => route.fulfill({ status, contentType: 'application/json', headers: cors, body: JSON.stringify(body) })
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors })
    const p = url.pathname
    const bearer = (req.headers()['authorization'] ?? '').replace(/^Bearer /, '')
    let uid = ''
    try {
      uid = (JSON.parse(Buffer.from(bearer.split('.')[1] ?? '', 'base64url').toString()) as { sub?: string }).sub ?? ''
    } catch {
      /* pas de session */
    }
    const body = (() => {
      try {
        return JSON.parse(req.postData() || '{}') as Record<string, unknown>
      } catch {
        return {}
      }
    })()
    if (p === '/auth/v1/otp') return json(200, {})
    if (p === '/auth/v1/verify') return body.token === BON_CODE && ID[String(body.email)] ? json(200, session(String(body.email))) : json(403, { code: 403, error_code: 'otp_expired', msg: 'Token has expired or is invalid' })
    if (p === '/auth/v1/user') {
      const email = Object.keys(ID).find((e) => ID[e] === uid)
      return email ? json(200, session(email).user) : json(401, { msg: 'no session' })
    }
    if (p === '/auth/v1/token') {
      const email = String(body.refresh_token ?? '').split('|')[1] ?? ''
      return ID[email] ? json(200, session(email)) : json(401, { msg: 'bad refresh' })
    }
    const unique = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object')
    const rendu = (rows: unknown[]) => (unique ? (rows[0] ? json(200, rows[0]) : json(406, { code: 'PGRST116', message: 'no rows' })) : json(200, rows))
    const f = (k: string) => (url.searchParams.get(k) ?? '').replace(/^(eq|gte)\./, '')
    const membre = (gid: string) => srv.membres.some((m) => m.garden_id === gid && m.user_id === uid)

    // Copie en ligne personnelle (la synchro automatique tourne aussi) : une ligne par personne.
    if (p === '/rest/v1/garden_snapshots') {
      const ligne = srv.snapshots.get(uid)
      if (req.method() === 'GET') return rendu(ligne ? [{ updated_at: ligne.updated_at, data: ligne.data }] : [])
      if (req.method() === 'POST') {
        srv.snapshots.set(uid, { data: body.data, updated_at: stamp() })
        return route.fulfill({ status: 201, contentType: 'application/json', headers: cors, body: JSON.stringify([{ updated_at: srv.snapshots.get(uid)!.updated_at }]) })
      }
      if (req.method() === 'PATCH') {
        if (!ligne || ligne.updated_at !== f('updated_at')) return json(200, [])
        srv.snapshots.set(uid, { data: body.data, updated_at: stamp() })
        return json(200, [{ updated_at: srv.snapshots.get(uid)!.updated_at }])
      }
      return json(200, [])
    }
    if (p.startsWith('/storage/v1/object/list/photos')) return json(200, [])

    // Jardins partagés.
    if (p === '/rest/v1/rpc/create_shared_garden') {
      const gid = crypto.randomUUID()
      srv.jardins.set(gid, { id: gid, name: String(body.p_name), garden: body.p_garden, updated_at: stamp() })
      srv.membres.push({ garden_id: gid, user_id: uid, role: 'admin', display_name: String(body.p_display_name), joined_at: stamp() })
      return json(200, gid)
    }
    if (p === '/rest/v1/rpc/create_shared_invite') {
      const gid = String(body.p_garden_id)
      if (!srv.membres.some((m) => m.garden_id === gid && m.user_id === uid && m.role === 'admin')) return json(403, { code: '42501', message: 'Réservé aux responsables du jardin.' })
      const code = 'KJMNPQ' + String(srv.invitations.size + 23)
      srv.invitations.set(code, gid)
      return json(200, code)
    }
    if (p === '/rest/v1/rpc/join_shared_garden') {
      const code = String(body.p_code).toUpperCase().replace(/[^A-Z0-9]/g, '')
      const gid = srv.invitations.get(code)
      if (!gid) return json(400, { code: 'P0002', message: 'Ce code est invalide ou périmé.' })
      if (!membre(gid)) srv.membres.push({ garden_id: gid, user_id: uid, role: 'member', display_name: String(body.p_display_name), joined_at: stamp() })
      return json(200, gid)
    }
    if (p === '/rest/v1/rpc/push_shared_plants') {
      const gid = String(body.p_garden_id)
      if (!membre(gid)) return json(403, { code: '42501', message: 'new row violates row-level security policy' })
      const ok: { id: string; updated_at: string }[] = []
      const conflicts: string[] = []
      for (const r of body.p_rows as { id: string; data: Record<string, unknown>; deleted?: boolean; base?: string }[]) {
        const cle = `${gid}/${r.id}`
        const cur = srv.plantes.get(cle)
        if ((r.base === undefined && cur) || (r.base !== undefined && cur?.updated_at !== r.base)) {
          conflicts.push(r.id)
          continue
        }
        const at = stamp()
        srv.plantes.set(cle, { garden_id: gid, id: r.id, data: r.data, deleted: !!r.deleted, updated_at: at })
        ok.push({ id: r.id, updated_at: at })
      }
      return json(200, { ok, conflicts })
    }
    if (p === '/rest/v1/shared_gardens' && req.method() === 'GET') {
      const gid = f('id')
      const j = srv.jardins.get(gid)
      return rendu(j && membre(gid) ? [{ name: j.name, garden: j.garden, updated_at: j.updated_at }] : [])
    }
    if (p === '/rest/v1/shared_garden_members' && req.method() === 'GET') {
      const gid = f('garden_id')
      let rows = srv.membres.filter((m) => m.garden_id === gid && membre(gid))
      if (url.searchParams.get('user_id')) rows = rows.filter((m) => m.user_id === f('user_id'))
      return rendu(rows.map((m) => ({ user_id: m.user_id, role: m.role, display_name: m.display_name, joined_at: m.joined_at })))
    }
    if (p === '/rest/v1/shared_plants' && req.method() === 'GET') {
      const gid = f('garden_id')
      const since = f('updated_at')
      const rows = [...srv.plantes.values()].filter((r) => r.garden_id === gid && membre(gid) && (!since || r.updated_at >= since))
      return rendu(rows.map((r) => ({ id: r.id, data: r.data, deleted: r.deleted, updated_at: r.updated_at })))
    }
    return json(200, {})
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

/** Jardin d'exemple rendu « vrai » (adresse et nom), avec deux abricotiers, par la copie de secours reprise au rechargement. */
async function semer(page: Page) {
  await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => k.endsWith(':miroir'))!
    const s = JSON.parse(localStorage.getItem(key)!)
    s.data.gardens[0].address = '12 rue des Bruyères, Rouen'
    s.data.gardens[0].name = 'Jardin des Bruyères'
    const gid = s.data.gardens[0].id as string
    const plante = (id: string, x: number) => ({ id, gardenId: gid, speciesId: 'abricotier', position: { x, y: 2 }, plantedAt: '2026-03-01', status: 'en-place', photos: [] })
    s.data.plants = [plante('e2e-abricot-1', 3), plante('e2e-abricot-2', 6)]
    s.savedAt = Date.now() + 60_000
    localStorage.setItem(key, JSON.stringify(s))
  })
}

async function ouvrirReglagesPartage(page: Page) {
  await page.locator('[data-home=tout]').click()
  const tout = page.getByRole('dialog', { name: /Tout ce que je peux faire/ })
  await expect(tout).toBeVisible()
  await tout.getByRole('searchbox').fill('jardin partagé')
  await tout.getByRole('button', { name: /Partager un jardin avec d’autres/ }).first().click()
  const carte = page.locator('[data-feat=jardin-partage]')
  await expect(carte).toBeVisible({ timeout: 15_000 })
  if (!(await carte.locator('details').first().evaluate((d) => (d as HTMLDetailsElement).open))) await carte.locator('summary').click()
  return carte
}

async function seConnecter(page: Page, email: string) {
  await page.locator('[data-home=tout]').click()
  const tout = page.getByRole('dialog', { name: /Tout ce que je peux faire/ })
  await tout.getByRole('searchbox').fill('autre appareil')
  await tout.getByRole('button', { name: /Retrouver mes jardins sur un autre appareil/ }).first().click()
  const champ = page.getByRole('textbox', { name: 'Votre adresse e-mail' })
  await champ.waitFor({ state: 'visible', timeout: 4000 }).catch(async () => {
    await page.getByText('Retrouver mes jardins sur un autre appareil', { exact: true }).last().click()
  })
  await champ.fill(email)
  await page.getByRole('button', { name: /Recevoir un code par e-mail/ }).click()
  await page.getByRole('button', { name: /Accepter et continuer/ }).click()
  await page.getByLabel('Code reçu par e-mail').fill(BON_CODE)
  await page.getByRole('button', { name: /^Me connecter/ }).click()
  await expect(page.getByText(/Copie en ligne à jour/).first()).toBeVisible({ timeout: 30_000 })
}

const miroir = (page: Page) =>
  page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => k.endsWith(':miroir'))
    const s = key ? JSON.parse(localStorage.getItem(key)!) : undefined
    return { gardens: (s?.data?.gardens ?? []) as { id: string; name: string; shared?: { id: string; role: string } }[], plants: (s?.data?.plants ?? []) as { id: string; gardenId: string; speciesId: string; keeper?: string }[] }
  })

test('jardin partagé : Alice partage, Bob rejoint avec un code et modifie, Alice reprend', async ({ browser, baseURL }) => {
  test.setTimeout(240_000)
  const srv = nouveau()
  const ctx = { baseURL, locale: 'fr-FR', timezoneId: 'Europe/Paris', serviceWorkers: 'block' as const, viewport: { width: 390, height: 844 } }

  // ---- Alice : un vrai jardin avec deux abricotiers, connectée, le partage ----
  const a = await (await browser.newContext(ctx)).newPage()
  const erreursA = await preparer(a, srv)
  await a.goto('/')
  await a.getByRole('button', { name: 'Visiter un jardin d’exemple' }).click()
  await expect(a.locator('[data-home=ajouter]')).toBeVisible({ timeout: 60_000 })
  await semer(a)
  await a.reload()
  const passer = a.getByRole('button', { name: /Passer et découvrir/ })
  if (await passer.count()) await passer.click()
  await expect(a.locator('[data-home=tout]')).toBeVisible({ timeout: 60_000 })
  await seConnecter(a, 'alice@example.fr')
  await a.goto('/')
  await expect(a.locator('[data-home=tout]')).toBeVisible({ timeout: 60_000 })
  const carteA = await ouvrirReglagesPartage(a)
  await carteA.getByRole('button', { name: /Partager « Jardin des Bruyères »/ }).click()
  await a.getByLabel(/Votre nom dans ce jardin/).fill('Alice')
  await a.getByRole('button', { name: 'Partager ce jardin' }).click()
  await expect(carteA.getByText('est partagé. Vous y êtes responsable.')).toBeVisible({ timeout: 30_000 })
  await expect(carteA.getByRole('list', { name: 'Membres du jardin' }).getByText('Alice')).toBeVisible()
  expect([...srv.plantes.values()].filter((r) => r.data.speciesId === 'abricotier'), 'les deux abricotiers sont en ligne').toHaveLength(2)
  await carteA.getByRole('button', { name: 'Inviter quelqu’un' }).click()
  const code = (await a.getByTestId('invite-code').innerText()).replace(/\s/g, '')
  expect(code).toMatch(/^[A-Z0-9]{8}$/)

  // ---- Bob : un autre téléphone, rejoint avec le code ----
  const b = await (await browser.newContext(ctx)).newPage()
  const erreursB = await preparer(b, srv)
  await b.goto('/')
  await b.getByRole('button', { name: 'Visiter un jardin d’exemple' }).click()
  await expect(b.locator('[data-home=tout]')).toBeVisible({ timeout: 60_000 })
  await seConnecter(b, 'bob@example.fr')
  await b.goto('/')
  await expect(b.locator('[data-home=tout]')).toBeVisible({ timeout: 60_000 })
  const carteB = await ouvrirReglagesPartage(b)
  await carteB.getByRole('button', { name: 'Rejoindre un jardin partagé' }).click()
  await b.getByLabel('Code d’invitation').fill(code.slice(0, 4) + ' ' + code.slice(4).toLowerCase())
  await b.getByLabel(/Votre nom dans ce jardin/).fill('Bob')
  await b.getByRole('button', { name: 'Rejoindre', exact: true }).click()
  await expect.poll(async () => (await miroir(b)).plants.filter((p) => p.speciesId === 'abricotier').length, { timeout: 30_000 }).toBe(2)
  const etatB = await miroir(b)
  const jardinB = etatB.gardens.find((g) => g.shared)!
  expect(jardinB.name).toBe('Jardin des Bruyères')
  expect(jardinB.shared!.role).toBe('member')
  expect(etatB.plants.filter((p) => p.gardenId === jardinB.id)).toHaveLength(2)
  await expect(carteB.getByText('est partagé. Vous y êtes membre.')).toBeVisible({ timeout: 15_000 })
  await expect(carteB.getByRole('list', { name: 'Membres du jardin' }).getByText('Alice')).toBeVisible()
  await expect(carteB.getByRole('button', { name: 'Inviter quelqu’un' }), 'un simple membre n’invite pas').toHaveCount(0)

  // ---- Bob note « qui s'en occupe » sur un abricotier : Alice le reprend ----
  await b.goto('/#plantes')
  await b.getByRole('button', { name: /Abricotier/ }).first().click()
  await b.getByText('Date et notes', { exact: true }).first().click()
  await b.getByLabel(/Qui s’en occupe/).fill('Bob')
  await expect.poll(() => [...srv.plantes.values()].some((r) => r.data.keeper === 'Bob'), { timeout: 20_000 }).toBe(true)
  await a.getByRole('button', { name: 'Mettre à jour maintenant' }).click()
  await expect.poll(async () => (await miroir(a)).plants.some((p) => p.keeper === 'Bob'), { timeout: 30_000 }).toBe(true)

  // Un étranger ne peut rien : un code faux est refusé avec un message clair.
  const c = await (await browser.newContext(ctx)).newPage()
  await preparer(c, srv)
  await c.goto('/')
  await c.getByRole('button', { name: 'Visiter un jardin d’exemple' }).click()
  await expect(c.locator('[data-home=tout]')).toBeVisible({ timeout: 60_000 })
  await seConnecter(c, 'carol@example.fr')
  await c.goto('/')
  const carteC = await ouvrirReglagesPartage(c)
  await carteC.getByRole('button', { name: 'Rejoindre un jardin partagé' }).click()
  await c.getByLabel('Code d’invitation').fill('ZZZZ ZZZZ')
  await c.getByLabel(/Votre nom dans ce jardin/).fill('Carole')
  await c.getByRole('button', { name: 'Rejoindre', exact: true }).click()
  await expect(c.getByText(/Ce code est invalide ou périmé/)).toBeVisible({ timeout: 15_000 })

  for (const [nom, page] of [['Alice', a], ['Bob', b]] as const) {
    expect(Math.max(0, await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)), `débordement horizontal (${nom})`).toBe(0)
  }
  expect(erreursA).toEqual([])
  expect(erreursB).toEqual([])
})

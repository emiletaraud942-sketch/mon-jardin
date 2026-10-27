import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ---------- Faux client Supabase (table garden_snapshots en mémoire, updated_at posé « côté serveur ») ----------

type Row = { user_id: string; data: unknown; updated_at: string }
interface Fake {
  rows: Map<string, Row>
  calls: string[]
  session: { user: { id: string } } | null
  getSession: ReturnType<typeof vi.fn>
  getUser: ReturnType<typeof vi.fn>
  signInWithOtp: ReturnType<typeof vi.fn>
  signOut: ReturnType<typeof vi.fn>
  rpc: ReturnType<typeof vi.fn>
  options?: { auth?: Record<string, unknown> }
  afterRead?: () => void
  payloads: Record<string, unknown>[]
  from: (t: string) => unknown
  tick: () => string
}

let fake: Fake
let clock = 0

function makeFake(): Fake {
  const rows = new Map<string, Row>()
  const calls: string[] = []
  const tick = () => new Date(Date.UTC(2026, 9, 1, 12, 0, 0) + ++clock * 1000).toISOString()
  const f: Fake = {
    rows,
    calls,
    payloads: [],
    session: { user: { id: 'u1' } },
    getSession: vi.fn(async () => ({ data: { session: f.session }, error: null })),
    getUser: vi.fn(async () => ({ data: { user: f.session?.user ?? null }, error: null })),
    signInWithOtp: vi.fn(async () => ({ error: null })),
    signOut: vi.fn(async () => ({ error: null })),
    rpc: vi.fn(async () => ({ data: null, error: null })),
    tick,
    from: (table: string) => {
      const q = (op: 'select' | 'insert' | 'update' | 'upsert' | 'delete', payload?: Record<string, unknown>) => {
        if (payload) f.payloads.push(payload)
        const filters: [string, unknown][] = []
        let returning = op === 'select'
        let single = false
        const run = () => {
          calls.push(`${op}:${table}:${filters.map(([c, v]) => `${c}=${v}`).join(',')}`)
          const match = (r: Row) => filters.every(([c, v]) => (r as unknown as Record<string, unknown>)[c] === v)
          if (op === 'select') {
            const found = [...rows.values()].filter(match)
            const out = single ? { data: found[0] ? { ...found[0] } : null, error: null } : { data: found, error: null }
            f.afterRead?.()
            return out
          }
          if (op === 'insert') {
            const id = payload!.user_id as string
            if (rows.has(id)) return { data: null, error: { code: '23505', message: 'duplicate key' } }
            const row = { user_id: id, data: payload!.data, updated_at: tick() }
            rows.set(id, row)
            return { data: returning ? [{ updated_at: row.updated_at }] : null, error: null }
          }
          if (op === 'update') {
            const hit = [...rows.values()].filter(match)
            for (const r of hit) {
              r.data = payload!.data
              r.updated_at = tick()
            }
            return { data: returning ? hit.map((r) => ({ updated_at: r.updated_at })) : null, error: null }
          }
          if (op === 'delete') {
            for (const r of [...rows.values()].filter(match)) rows.delete(r.user_id)
            return { data: null, error: null }
          }
          const id = payload!.user_id as string
          const row = { user_id: id, data: payload!.data, updated_at: tick() }
          rows.set(id, row)
          return { data: returning ? [{ updated_at: row.updated_at }] : null, error: null }
        }
        const b = {
          eq(c: string, v: unknown) {
            filters.push([c, v])
            return b
          },
          select() {
            if (op !== 'select') returning = true
            return b
          },
          maybeSingle() {
            single = true
            return Promise.resolve(run())
          },
          then(res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) {
            return Promise.resolve(run()).then(res, rej)
          },
        }
        return b
      }
      return {
        select: () => q('select'),
        insert: (p: Record<string, unknown>) => q('insert', p),
        update: (p: Record<string, unknown>) => q('update', p),
        upsert: (p: Record<string, unknown>) => q('upsert', p),
        delete: () => q('delete'),
      }
    },
  }
  return f
}

// ---------- Faux navigateur ----------

const store = { replaceData: vi.fn(), state: { gardens: [{ id: 'g1' }], plants: [], tasksDone: [], loaded: true }, readFailed: false }
vi.mock('./store', () => ({
  getState: () => store.state,
  replaceData: (d: unknown) => store.replaceData(d),
  getStorageStatus: () => ({ persistent: undefined, readFailed: store.readFailed }),
}))
vi.mock('@supabase/supabase-js', () => ({
  createClient: (_u: string, _k: string, options: Fake['options']) => {
    fake.options = options
    return { auth: fake, from: fake.from, rpc: fake.rpc }
  },
}))

const garden = { id: 'g1', name: 'J', address: '', center: { lon: 4, lat: 45 }, createdAt: '2025-01-01T00:00:00.000Z' }
const validData = { version: 2, gardens: [garden], plants: [], tasksDone: [] }

let local: Map<string, string>
let replaceState: ReturnType<typeof vi.fn>

function stubBrowser(loc: { search?: string; hash?: string } = {}) {
  local = new Map()
  replaceState = vi.fn()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => local.get(k) ?? null,
    setItem: (k: string, v: string) => void local.set(k, v),
    removeItem: (k: string) => void local.delete(k),
    get length() {
      return local.size
    },
    key: (i: number) => [...local.keys()][i] ?? null,
  })
  vi.stubGlobal('location', { origin: 'https://app.test', pathname: '/', search: loc.search ?? '', hash: loc.hash ?? '' })
  vi.stubGlobal('history', { replaceState })
}

async function load(configured = true) {
  vi.resetModules()
  if (configured) {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://x.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon')
  } else {
    vi.stubEnv('VITE_SUPABASE_URL', '')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '')
  }
  return import('./sync')
}

beforeEach(() => {
  fake = makeFake()
  clock = 0
  store.readFailed = false
  store.replaceData.mockClear()
  stubBrowser()
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('sans Supabase configuré', () => {
  it('reste inerte', async () => {
    const s = await load(false)
    expect(s.syncAvailable()).toBe(false)
    expect(await s.currentUser()).toBeNull()
    expect(await s.initSync()).toEqual({ handled: false })
    await expect(s.pushSnapshot()).rejects.toThrow(/Connectez-vous|configurée/)
    await expect(s.sendMagicLink('a@b.fr')).rejects.toThrow(/non configurée/)
    await s.signOut() // ne plante pas
  })
})

describe('client et session', () => {
  it('crée le client en PKCE avec détection de session dans l’URL', async () => {
    const s = await load()
    expect(s.syncAvailable()).toBe(true)
    expect(fake.options?.auth).toMatchObject({ flowType: 'pkce', detectSessionInUrl: true, persistSession: true })
  })

  it('currentUser lit la session locale (pas d’appel réseau getUser)', async () => {
    const s = await load()
    expect((await s.currentUser())?.id).toBe('u1')
    expect(fake.getSession).toHaveBeenCalled()
    expect(fake.getUser).not.toHaveBeenCalled()
    fake.session = null
    expect(await s.currentUser()).toBeNull()
  })

  it('le lien magique redirige vers la racine du site', async () => {
    const s = await load()
    await s.sendMagicLink('a@b.fr')
    expect(fake.signInWithOtp).toHaveBeenCalledWith({ email: 'a@b.fr', options: { emailRedirectTo: 'https://app.test/' } })
  })

  it('une erreur Supabase à l’envoi du lien est relancée', async () => {
    const s = await load()
    fake.signInWithOtp.mockResolvedValueOnce({ error: new Error('limite') })
    await expect(s.sendMagicLink('a@b.fr')).rejects.toThrow('limite')
  })

  it('timeout de 15 s sur les appels réseau', async () => {
    vi.useFakeTimers()
    const s = await load()
    fake.getSession.mockImplementation(() => new Promise(() => undefined))
    const p = s.currentUser()
    const assertion = expect(p).rejects.toThrow(/trop de temps/)
    await vi.advanceTimersByTimeAsync(15_001)
    await assertion
  })
})

describe('initSync (retour du lien magique)', () => {
  it('ne touche pas à l’URL quand ce n’est pas un retour de connexion', async () => {
    stubBrowser({ hash: '#reglages' })
    const s = await load()
    expect(await s.initSync()).toEqual({ handled: false })
    expect(replaceState).not.toHaveBeenCalled()
  })

  it('laisse auth-js échanger ?code= puis nettoie l’URL vers #reglages', async () => {
    stubBrowser({ search: '?code=abc123' })
    const s = await load()
    const order: string[] = []
    fake.getSession.mockImplementation(async () => {
      order.push('getSession')
      return { data: { session: fake.session }, error: null }
    })
    replaceState.mockImplementation(() => order.push('replaceState'))
    const r = await s.initSync()
    expect(order).toEqual(['getSession', 'replaceState'])
    expect(replaceState).toHaveBeenCalledWith(null, '', '/#reglages')
    expect(r).toEqual({ handled: true, signedIn: true })
  })

  it('reconnaît aussi #access_token= (ancien flux implicite)', async () => {
    stubBrowser({ hash: '#access_token=a&refresh_token=b&expires_in=3600&token_type=bearer' })
    const s = await load()
    const r = await s.initSync()
    expect(r.handled).toBe(true)
    expect(replaceState).toHaveBeenCalledWith(null, '', '/#reglages')
  })

  it('lien expiré : message clair et URL nettoyée', async () => {
    stubBrowser({ hash: '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired' })
    const s = await load()
    const r = await s.initSync()
    expect(r.handled).toBe(true)
    expect(r.signedIn).toBe(false)
    expect(r.error).toMatch(/expiré|déjà été utilisé/)
    expect(replaceState).toHaveBeenCalledWith(null, '', '/#reglages')
  })

  it('code reçu mais pas de session (autre navigateur) : explique quoi faire', async () => {
    stubBrowser({ search: '?code=abc123' })
    const s = await load()
    fake.session = null
    const r = await s.initSync()
    expect(r.signedIn).toBe(false)
    expect(r.error).toMatch(/même navigateur/)
  })

  it('ne plante jamais : une erreur réseau devient un message', async () => {
    stubBrowser({ search: '?code=abc123' })
    const s = await load()
    fake.getSession.mockRejectedValueOnce(new Error('boum'))
    const r = await s.initSync()
    expect(r.handled).toBe(true)
    expect(r.error).toBeTruthy()
    expect(replaceState).toHaveBeenCalled()
  })

  it('n’est exécuté qu’une fois', async () => {
    stubBrowser({ search: '?code=abc123' })
    const s = await load()
    const a = s.initSync()
    const b = s.initSync()
    expect(a).toBe(b)
    await a
    expect(fake.getSession).toHaveBeenCalledTimes(1)
  })
})

describe('taille de l’envoi', () => {
  it('jsonBytes compte des octets UTF-8, pas des caractères', async () => {
    const s = await load()
    expect(s.jsonBytes({ n: 'abc' })).toBe(JSON.stringify({ n: 'abc' }).length)
    const accents = { n: 'é'.repeat(1000) }
    expect(s.jsonBytes(accents)).toBe(JSON.stringify(accents).length + 1000)
    expect(s.jsonBytes({ n: '🌱' })).toBe(JSON.stringify({ n: '🌱' }).length + 2)
  })
})

describe('pushSnapshot', () => {
  it('première synchro, rien à distance : insère et mémorise la date serveur', async () => {
    const s = await load()
    await s.pushSnapshot()
    const row = fake.rows.get('u1')!
    expect(row.data).toMatchObject({ version: 2, gardens: [{ id: 'g1' }] })
    expect(fake.calls.some((c) => c.startsWith('insert'))).toBe(true)
    expect(local.get('permajardin:last-synced:u1')).toBe(row.updated_at)
  })

  it('n’envoie pas updated_at depuis le client (posé par le trigger serveur)', async () => {
    const s = await load()
    await s.pushSnapshot()
    await s.pushSnapshot()
    await s.pushSnapshot({ force: true })
    expect(fake.payloads.length).toBeGreaterThanOrEqual(3)
    for (const p of fake.payloads) expect(Object.keys(p)).not.toContain('updated_at')
  })

  it('synchro suivante sans changement distant : met à jour', async () => {
    const s = await load()
    await s.pushSnapshot()
    const first = fake.rows.get('u1')!.updated_at
    await s.pushSnapshot()
    expect(fake.rows.get('u1')!.updated_at).not.toBe(first)
    expect(local.get('permajardin:last-synced:u1')).toBe(fake.rows.get('u1')!.updated_at)
  })

  it('distant plus récent que la dernière synchro : SyncConflictError avec la date distante, rien d’écrasé', async () => {
    const s = await load()
    await s.pushSnapshot()
    fake.rows.get('u1')!.data = { autre: 'appareil' }
    fake.rows.get('u1')!.updated_at = fake.tick() // un autre appareil a poussé
    const remote = fake.rows.get('u1')!.updated_at
    const err = await s.pushSnapshot().catch((e) => e)
    expect(err).toBeInstanceOf(s.SyncConflictError)
    expect((err as InstanceType<typeof s.SyncConflictError>).remoteUpdatedAt).toBe(remote)
    expect(fake.rows.get('u1')!.data).toEqual({ autre: 'appareil' })
  })

  it('distant déjà présent et jamais synchronisé ici : conflit', async () => {
    const s = await load()
    fake.rows.set('u1', { user_id: 'u1', data: validData, updated_at: fake.tick() })
    await expect(s.pushSnapshot()).rejects.toBeInstanceOf(s.SyncConflictError)
  })

  it('force:true écrase malgré le conflit et mémorise la nouvelle date', async () => {
    const s = await load()
    fake.rows.set('u1', { user_id: 'u1', data: { vieux: true }, updated_at: fake.tick() })
    await s.pushSnapshot({ force: true })
    expect(fake.rows.get('u1')!.data).toMatchObject({ version: 2 })
    expect(local.get('permajardin:last-synced:u1')).toBe(fake.rows.get('u1')!.updated_at)
  })

  it('course entre le contrôle et l’écriture : la mise à jour conditionnelle détecte le conflit', async () => {
    const s = await load()
    await s.pushSnapshot()
    fake.afterRead = () => {
      fake.afterRead = undefined
      fake.rows.get('u1')!.updated_at = fake.tick() // un autre appareil pousse juste après notre lecture
    }
    await expect(s.pushSnapshot()).rejects.toBeInstanceOf(s.SyncConflictError)
  })

  it('refuse d’envoyer si non connecté', async () => {
    const s = await load()
    fake.session = null
    await expect(s.pushSnapshot()).rejects.toThrow(/Connectez-vous/)
  })

  it('refuse d’envoyer un état que le stockage local n’a pas pu lire (évite d’écraser le distant par du vide)', async () => {
    const s = await load()
    store.readFailed = true
    await expect(s.pushSnapshot()).rejects.toThrow(/pas pu être lues/)
    expect(fake.rows.size).toBe(0)
  })
})

describe('pullSnapshot', () => {
  it('renvoie false quand il n’y a rien à distance', async () => {
    const s = await load()
    expect(await s.pullSnapshot()).toBe(false)
    expect(store.replaceData).not.toHaveBeenCalled()
  })

  it('importe via migrateState et mémorise la date', async () => {
    const s = await load()
    const at = fake.tick()
    fake.rows.set('u1', { user_id: 'u1', data: { gardens: [garden, { id: 'sans-centre' }], plants: [], tasksDone: 'x' }, updated_at: at })
    expect(await s.pullSnapshot()).toBe(true)
    const arg = store.replaceData.mock.calls[0][0] as { gardens: unknown[]; tasksDone: unknown[] }
    expect(arg.gardens).toHaveLength(1)
    expect(arg.tasksDone).toEqual([])
    expect(local.get('permajardin:last-synced:u1')).toBe(at)
  })

  it('refuse un snapshot invalide sans toucher aux données locales', async () => {
    const s = await load()
    fake.rows.set('u1', { user_id: 'u1', data: { foo: 'bar' }, updated_at: fake.tick() })
    await expect(s.pullSnapshot()).rejects.toThrow(/invalide|inutilisable|reconnu/i)
    expect(store.replaceData).not.toHaveBeenCalled()
  })

  it('refuse un snapshot d’une version plus récente', async () => {
    const s = await load()
    fake.rows.set('u1', { user_id: 'u1', data: { version: 99, gardens: [garden], plants: [] }, updated_at: fake.tick() })
    await expect(s.pullSnapshot()).rejects.toThrow(/plus récente/)
    expect(store.replaceData).not.toHaveBeenCalled()
  })

  it('un localStorage indisponible ne casse pas la synchro', async () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('bloqué')
      },
      setItem: () => {
        throw new Error('bloqué')
      },
    })
    const s = await load()
    fake.rows.set('u1', { user_id: 'u1', data: validData, updated_at: fake.tick() })
    expect(await s.pullSnapshot()).toBe(true)
  })
})

describe('effacement en ligne et déconnexion', () => {
  it('deleteRemoteSnapshot supprime seulement la ligne de l’utilisateur connecté', async () => {
    const s = await load()
    fake.rows.set('u1', { user_id: 'u1', data: validData, updated_at: fake.tick() })
    fake.rows.set('u2', { user_id: 'u2', data: validData, updated_at: fake.tick() })
    local.set('permajardin:last-synced:u1', 'x')
    await s.deleteRemoteSnapshot()
    expect([...fake.rows.keys()]).toEqual(['u2'])
    expect(fake.calls.at(-1)).toBe('delete:garden_snapshots:user_id=u1')
    expect(local.has('permajardin:last-synced:u1')).toBe(false)
  })

  it('deleteRemoteSnapshot exige une session et signale un refus serveur', async () => {
    const s = await load()
    fake.session = null
    await expect(s.deleteRemoteSnapshot()).rejects.toThrow(/Connectez-vous/)
  })

  it('deleteMyAccount appelle delete_my_account puis déconnecte localement', async () => {
    const s = await load()
    local.set('sb-x-auth-token', 'jwt')
    await s.deleteMyAccount()
    expect(fake.rpc).toHaveBeenCalledWith('delete_my_account')
    expect(fake.signOut).toHaveBeenCalledWith({ scope: 'local' })
    expect(local.has('sb-x-auth-token')).toBe(false)
  })

  it('deleteMyAccount : si le serveur refuse, on ne déconnecte pas', async () => {
    const s = await load()
    fake.rpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'x' } })
    await expect(s.deleteMyAccount()).rejects.toThrow(/Accès refusé/)
    expect(fake.signOut).not.toHaveBeenCalled()
  })

  it('signOutLocal retire jetons et repères même hors ligne, sans réseau obligatoire', async () => {
    const s = await load()
    fake.signOut.mockRejectedValueOnce(new Error('réseau'))
    local.set('sb-x-auth-token', 'jwt')
    local.set('sb-x-auth-token-code-verifier', 'v')
    local.set('permajardin:last-synced:u1', 'x')
    local.set('permajardin:theme', 'dark')
    await s.signOutLocal()
    expect([...local.keys()]).toEqual(['permajardin:theme'])
  })

  it('sendMagicLink refuse une adresse invalide avant tout appel réseau', async () => {
    const s = await load()
    for (const bad of ['', 'abc', 'a@b', 'a b@c.fr', 'a@b.fr,c@d.fr', 'x'.repeat(260) + '@b.fr', '<x>@b.fr']) {
      await expect(s.sendMagicLink(bad)).rejects.toThrow(/invalide/)
    }
    expect(fake.signInWithOtp).not.toHaveBeenCalled()
    await s.sendMagicLink('  a@b.fr ')
    expect(fake.signInWithOtp).toHaveBeenCalledWith({ email: 'a@b.fr', options: { emailRedirectTo: 'https://app.test/' } })
  })
})

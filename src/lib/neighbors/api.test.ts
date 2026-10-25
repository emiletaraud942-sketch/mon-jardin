import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---------- Faux client : un constructeur de requêtes qui enregistre les appels et renvoie des résultats préparés ----------

interface Call {
  table: string
  ops: [string, unknown[]][]
}
const state = vi.hoisted(() => ({
  calls: [] as Call[],
  results: new Map<string, { data: unknown; error: unknown; count?: number }>(),
  session: { user: { id: '11111111-1111-4111-8111-111111111111', email: 'moi@example.org' } } as { user: { id: string; email: string } } | null,
  signInWithOtp: vi.fn(async (_a: unknown) => ({ error: null as unknown })),
  exchange: vi.fn(async (_c: string) => ({ error: null as unknown })),
  rpc: vi.fn(async (_n: string) => ({ data: null, error: null as unknown })),
  upload: vi.fn(async (_p: string, _b: unknown, _o: unknown) => ({ data: {}, error: null as unknown })),
  remove: vi.fn(async (_p: string[]) => ({ data: [], error: null })),
  // Premier appel : deux fichiers ; ensuite le dossier est vide (comme après une suppression réussie).
  list: vi.fn(async (_d: string, _o: unknown): Promise<{ data: { name: string }[]; error: unknown }> => ({ data: [], error: null })),
  download: vi.fn(async (_p: string): Promise<{ data: Blob | null; error: unknown }> => ({ data: null, error: null })),
}))

function builder(table: string) {
  const call: Call = { table, ops: [] }
  state.calls.push(call)
  const b: Record<string, unknown> = {}
  for (const m of ['select', 'insert', 'update', 'delete', 'eq', 'in', 'gte', 'lte', 'order', 'limit', 'maybeSingle', 'single']) {
    b[m] = (...args: unknown[]) => {
      call.ops.push([m, args])
      return b
    }
  }
  b.then = (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) => {
    const kind = call.ops.find(([m]) => ['insert', 'update', 'delete'].includes(m))?.[0] ?? 'select'
    const r = state.results.get(`${table}:${kind}`) ?? { data: null, error: null }
    return Promise.resolve(r).then(ok, ko)
  }
  return b
}

vi.mock('./client', () => ({
  isNeighborsConfigured: () => true,
  NEIGHBORS_STORAGE_KEY: 'sb-neighbors-auth-token',
  neighborsClient: () => ({
    from: builder,
    rpc: state.rpc,
    auth: {
      getSession: async () => ({ data: { session: state.session } }),
      signInWithOtp: state.signInWithOtp,
      exchangeCodeForSession: state.exchange,
      signOut: async () => ({ error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
    storage: { from: () => ({ upload: state.upload, remove: state.remove, list: state.list, download: state.download }) },
  }),
}))

vi.mock('../photos', () => ({ compressToTarget: vi.fn(async (b: Blob) => b) }))

import { compressToTarget } from '../photos'
import * as api from './api'

const ME = { user_id: '11111111-1111-4111-8111-111111111111', pseudo: 'Jardinier', cell_lat: 48.86, cell_lon: 2.35, created_at: '2026-10-01T00:00:00Z' }
const postRow = (o: Record<string, unknown> = {}) => ({
  id: 'aaaaaaa1-0000-4000-8000-000000000001', author: '22222222-2222-4222-8222-222222222222', kind: 'don', title: 'Boutures', body: '', species_id: null, photo_path: null, status: 'open',
  cell_lat: 48.87, cell_lon: 2.35, created_at: '2026-10-02T00:00:00Z', expires_at: '2026-12-01T00:00:00Z', profiles: { pseudo: 'Voisine' }, ...o,
})
const set = (key: string, data: unknown, error: unknown = null, count?: number) => state.results.set(key, { data, error, count })
const opsOf = (table: string) => state.calls.filter((c) => c.table === table).flatMap((c) => c.ops)

beforeEach(async () => {
  state.calls.length = 0
  state.results.clear()
  state.session = { user: { id: '11111111-1111-4111-8111-111111111111', email: 'moi@example.org' } }
  vi.clearAllMocks()
  state.list.mockReset()
  state.list.mockResolvedValueOnce({ data: [{ name: 'a.jpg' }, { name: 'b.jpg' }], error: null }).mockResolvedValue({ data: [], error: null })
  await api.signOut() // vide le cache de profil
  set('profiles:select', ME)
})

/** En-tête JPEG minimal (SOI + SOF0) annonçant les dimensions données. */
function jpegHeader(width: number, height: number): Uint8Array {
  return new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 255, width >> 8, width & 255, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1])
}

describe('translateError', () => {
  it.each([
    [{ message: 'quota_exceeded:post' }, 'limite du jour'],
    [{ message: 'quota_exceeded:message' }, 'limite du jour'],
    [{ message: 'duplicate key value violates unique constraint "profiles_pseudo_key"', code: '23505' }, 'pseudo est déjà pris'],
    [{ message: 'duplicate key ... "reports_reporter_target_kind_target_id_key"' }, 'déjà signalé'],
    [{ message: 'new row violates row-level security policy for table "posts"', code: '42501' }, 'non autorisée'],
    [{ message: 'JWT expired' }, 'Session expirée'],
    [{ message: 'email rate limit exceeded', status: 429 }, 'Trop de demandes'],
    [{ message: 'Failed to fetch' }, 'Connexion impossible'],
    [{ message: 'not_member' }, 'profil'],
    [{ message: 'reply_not_allowed' }, 'question'],
    [{ message: 'new row violates check constraint "posts_cherche_category_check"', code: '23514' }, 'ce que vous cherchez'],
    [{ message: 'new row violates check constraint "posts_kind_check"', code: '23514' }, 'pas encore ouverte'],
    [{ message: "Could not find the 'category' column of 'posts' in the schema cache", code: 'PGRST204' }, 'pas encore ouverte'],
    [{ message: 'something obscure in english' }, 'Une erreur est survenue'],
  ])('%j', (e, expected) => {
    expect(api.translateError(e)).toContain(expected)
  })
  it('laisse passer un message déjà français (délai http.ts)', () => {
    expect(api.translateError(new Error('Le service met trop de temps à répondre. Réessayez dans un instant.'))).toContain('trop de temps')
  })
  it('reconnaît l’erreur réseau enveloppée par PostgREST (hors ligne)', () => {
    expect(api.translateError({ message: 'Error: Connexion impossible. Vérifiez votre accès à Internet.', details: '', hint: '', code: '' })).toContain('Connexion impossible')
  })
})

describe('validation', () => {
  it('pseudo', () => {
    expect(api.validatePseudo('  Léa  ')).toBe('Léa')
    expect(() => api.validatePseudo('ab')).toThrow(/entre 3 et 24/)
    expect(() => api.validatePseudo('a'.repeat(25))).toThrow(/entre 3 et 24/)
    expect(() => api.validatePseudo('<b>gras</b>')).toThrow(/interdits/)
  })
  it('annonce', () => {
    expect(api.validatePost({ kind: 'don', title: ' Tomates ', body: undefined })).toEqual({ kind: 'don', category: null, title: 'Tomates', body: '', speciesId: null })
    expect(() => api.validatePost({ kind: 'don', title: '   ' })).toThrow(/obligatoire/)
    expect(() => api.validatePost({ kind: 'don', title: 'x'.repeat(81) })).toThrow(/80 caractères/)
    expect(() => api.validatePost({ kind: 'don', title: 'ok', body: 'x'.repeat(1001) })).toThrow(/1000 caractères/)
    expect(() => api.validatePost({ kind: 'vente' as never, title: 'ok' })).toThrow(/inconnu/)
  })
  it('annonce : « Je cherche » exige une catégorie connue', () => {
    expect(() => api.validatePost({ kind: 'cherche', title: 'Une bêche' })).toThrow(/ce que vous cherchez/)
    expect(() => api.validatePost({ kind: 'cherche', title: 'Une bêche', category: 'voitures' as never })).toThrow(/Catégorie inconnue/)
    expect(() => api.validatePost({ kind: 'don', title: 'ok', category: 'voitures' as never })).toThrow(/Catégorie inconnue/)
    expect(api.validatePost({ kind: 'cherche', title: 'Une bêche', category: 'outils' })).toMatchObject({ kind: 'cherche', category: 'outils' })
    expect(api.validatePost({ kind: 'don', title: 'ok', category: 'graines' }).category).toBe('graines')
  })
  it('message', () => {
    expect(() => api.validateMessage('  ')).toThrow()
    expect(() => api.validateMessage('x'.repeat(1001))).toThrow()
    expect(api.validateMessage(' salut ')).toBe('salut')
  })
})

describe('connexion', () => {
  it('signIn envoie un lien magique avec le marqueur de retour', async () => {
    vi.stubGlobal('location', { origin: 'https://app.test', search: '' })
    await api.signIn(' a@b.fr ')
    expect(state.signInWithOtp).toHaveBeenCalledWith({ email: 'a@b.fr', options: { emailRedirectTo: 'https://app.test/?entraide=1' } })
    vi.unstubAllGlobals()
  })
  it('signIn refuse une adresse invalide sans appel réseau', async () => {
    await expect(api.signIn('pas-un-mail')).rejects.toThrow(/invalide/)
    expect(state.signInWithOtp).not.toHaveBeenCalled()
  })
  it('signIn traduit une limite d’envoi', async () => {
    state.signInWithOtp.mockResolvedValueOnce({ error: { message: 'email rate limit exceeded', status: 429 } })
    await expect(api.signIn('a@b.fr')).rejects.toThrow(/Trop de demandes/)
  })
  it('initNeighbors ignore une URL sans marqueur (retour de la synchro privée)', async () => {
    vi.stubGlobal('location', { origin: 'https://app.test', search: '?code=abc', pathname: '/' })
    expect(await api.initNeighbors()).toEqual({ handled: false })
    expect(state.exchange).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
  it('initNeighbors échange le code et nettoie l’URL', async () => {
    const replaceState = vi.fn()
    vi.stubGlobal('location', { origin: 'https://app.test', search: '?entraide=1&code=abc', pathname: '/' })
    vi.stubGlobal('history', { replaceState })
    expect(await api.initNeighbors()).toEqual({ handled: true, signedIn: true })
    expect(state.exchange).toHaveBeenCalledWith('abc')
    expect(replaceState).toHaveBeenCalledWith(null, '', '/#entraide')
    vi.unstubAllGlobals()
  })
  it('requiert une session', async () => {
    state.session = null
    await expect(api.getProfile()).rejects.toThrow(/Connectez-vous/)
  })
})

describe('profil', () => {
  it('saveProfile arrondit la position AVANT l’envoi', async () => {
    set('profiles:select', null)
    set('profiles:insert', ME)
    await api.saveProfile({ pseudo: 'Jardinier', lat: 48.856614, lon: 2.352222 })
    const ins = state.calls.find((c) => c.table === 'profiles' && c.ops.some(([m]) => m === 'insert'))!
    expect(ins.ops.find(([m]) => m === 'insert')![1][0]).toEqual({ user_id: '11111111-1111-4111-8111-111111111111', pseudo: 'Jardinier', cell_lat: 48.86, cell_lon: 2.35 })
  })
  it('saveProfile refuse une position invalide', async () => {
    await expect(api.saveProfile({ pseudo: 'Jardinier', lat: 200, lon: 0 })).rejects.toThrow(/Position invalide/)
  })
  it('pseudo déjà pris → message français', async () => {
    set('profiles:select', null)
    set('profiles:insert', null, { message: 'duplicate key value violates unique constraint "profiles_pseudo_key"', code: '23505' })
    await expect(api.saveProfile({ pseudo: 'Jardinier', lat: 48.8, lon: 2.3 })).rejects.toThrow(/déjà pris/)
  })
})

describe('annonces', () => {
  it('listPosts calcule la distance et filtre par type et zone', async () => {
    set('posts:select', [postRow(), postRow({ id: 'aaaaaaa2-0000-4000-8000-000000000002', cell_lat: 49.5, cell_lon: 2.35 })])
    const posts = await api.listPosts({ kind: 'don', radiusKm: 10 })
    expect(posts.map((p) => p.id)).toEqual(['aaaaaaa1-0000-4000-8000-000000000001']) // p2 est à ~70 km
    expect(posts[0]).toMatchObject({ authorPseudo: 'Voisine', mine: false, distanceLabel: 'dans votre quartier' })
    const ops = opsOf('posts')
    expect(ops).toContainEqual(['eq', ['kind', 'don']])
    expect(ops).toContainEqual(['eq', ['status', 'open']])
  })
  it('listPosts filtre par type « cherche » et par catégorie', async () => {
    set('posts:select', [postRow({ kind: 'cherche', category: 'outils' })])
    const posts = await api.listPosts({ kind: 'cherche', category: 'outils' })
    expect(posts[0]).toMatchObject({ kind: 'cherche', category: 'outils' })
    const ops = opsOf('posts')
    expect(ops).toContainEqual(['eq', ['kind', 'cherche']])
    expect(ops).toContainEqual(['eq', ['category', 'outils']])
  })
  it('listPosts sans catégorie n’envoie aucun filtre de catégorie ; une catégorie inconnue est refusée', async () => {
    set('posts:select', [postRow()])
    const posts = await api.listPosts({})
    expect(posts[0].category).toBeNull() // ancienne annonce, ou base pas encore mise à jour
    expect(opsOf('posts').some(([m, a]) => m === 'eq' && a[0] === 'category')).toBe(false)
    await expect(api.listPosts({ category: 'voitures' as never })).rejects.toThrow(/inconnue/)
  })
  it('createPost « Je cherche » envoie la catégorie ; sans catégorie, il est refusé avant tout envoi', async () => {
    set('posts:select', null, null, 0)
    set('posts:insert', postRow({ author: '11111111-1111-4111-8111-111111111111', kind: 'cherche', category: 'graines' }))
    const post = await api.createPost({ kind: 'cherche', category: 'graines', title: 'Graines de courge' })
    expect(post.category).toBe('graines')
    const payload = opsOf('posts').find(([m]) => m === 'insert')![1][0] as Record<string, unknown>
    expect(payload).toMatchObject({ kind: 'cherche', category: 'graines' })
    state.calls.length = 0
    await expect(api.createPost({ kind: 'cherche', title: 'Une bêche' })).rejects.toThrow(/ce que vous cherchez/)
    expect(opsOf('posts')).toHaveLength(0)
  })
  it('listPosts exige un profil', async () => {
    set('profiles:select', null)
    await expect(api.listPosts()).rejects.toThrow(/profil/)
  })
  it('createPost envoie le minimum : ni cellule, ni date, ni statut', async () => {
    set('posts:select', null, null, 0)
    set('posts:insert', postRow({ author: '11111111-1111-4111-8111-111111111111' }))
    await api.createPost({ kind: 'don', title: ' Boutures ', body: 'bien enracinées' })
    const payload = opsOf('posts').find(([m]) => m === 'insert')![1][0] as Record<string, unknown>
    expect(Object.keys(payload).sort()).toEqual(['author', 'body', 'kind', 'photo_path', 'species_id', 'title'])
    expect(payload).toMatchObject({ author: '11111111-1111-4111-8111-111111111111', title: 'Boutures' })
  })
  it('createPost valide avant tout envoi', async () => {
    await expect(api.createPost({ kind: 'don', title: '' })).rejects.toThrow(/obligatoire/)
    expect(opsOf('posts')).toHaveLength(0)
  })
  it('createPost refuse au-delà du quota du jour', async () => {
    set('posts:select', null, null, 5)
    await expect(api.createPost({ kind: 'don', title: 'x' })).rejects.toThrow(/limite du jour/)
    expect(opsOf('posts').some(([m]) => m === 'insert')).toBe(false)
  })
  it('createPost passe la photo par la fonction de nettoyage puis l’envoie dans le dossier de l’utilisateur', async () => {
    set('posts:select', null, null, 0)
    set('posts:insert', postRow({ author: '11111111-1111-4111-8111-111111111111' }))
    const photo = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type: 'image/jpeg' })
    await api.createPost({ kind: 'pret', title: 'Sécateur', photo })
    expect(compressToTarget).toHaveBeenCalledWith(photo, expect.objectContaining({ targetBytes: expect.any(Number) }))
    const path = state.upload.mock.calls[0][0] as string
    expect(path).toMatch(/^11111111-1111-4111-8111-111111111111\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.jpg$/)
    expect(state.upload.mock.calls[0][2]).toMatchObject({ contentType: 'image/jpeg', upsert: false })
  })
  it('createPost refuse une photo qui garde des métadonnées EXIF', async () => {
    set('posts:select', null, null, 0)
    const exif = new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x10, 0x45, 0x78, 0x69, 0x66, 0, 0, 0, 0, 0, 0, 0, 0, 0xff, 0xd9])
    vi.mocked(compressToTarget).mockResolvedValueOnce(new Blob([exif]))
    await expect(api.createPost({ kind: 'don', title: 'x', photo: new Blob([exif]) })).rejects.toThrow(/métadonnées/)
    expect(state.upload).not.toHaveBeenCalled()
  })
  it('createPost refuse une photo de plus de 1 Mo', async () => {
    set('posts:select', null, null, 0)
    vi.mocked(compressToTarget).mockResolvedValueOnce(new Blob([new Uint8Array(1024 * 1024 + 1)]))
    await expect(api.createPost({ kind: 'don', title: 'x', photo: new Blob(['a']) })).rejects.toThrow(/1 Mo/)
  })
  it('createPost retire la photo si l’insertion échoue', async () => {
    set('posts:select', null, null, 0)
    set('posts:insert', null, { message: 'quota_exceeded:post' })
    await expect(api.createPost({ kind: 'don', title: 'x', photo: new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])]) })).rejects.toThrow(/limite du jour/)
    expect(state.remove).toHaveBeenCalledTimes(1)
  })
  it('closePost / deletePost ne ciblent que mes annonces', async () => {
    set('posts:update', [{ id: 'aaaaaaa9-0000-4000-8000-000000000009' }])
    await api.closePost('aaaaaaa9-0000-4000-8000-000000000009')
    expect(opsOf('posts')).toContainEqual(['update', [{ status: 'closed' }]])
    expect(opsOf('posts')).toContainEqual(['eq', ['author', '11111111-1111-4111-8111-111111111111']])
    state.calls.length = 0
    set('posts:select', { photo_path: '11111111-1111-4111-8111-111111111111/x.jpg' })
    await api.deletePost('aaaaaaa9-0000-4000-8000-000000000009')
    expect(state.remove).toHaveBeenCalledWith(['11111111-1111-4111-8111-111111111111/x.jpg'])
  })
})

describe('défauts corrigés (audit)', () => {
  it('closePost signale une annonce masquée au lieu de réussir en silence', async () => {
    set('posts:update', [])
    await expect(api.closePost('aaaaaaa9-0000-4000-8000-000000000009')).rejects.toThrow(/ne peut plus être modifiée/)
    await expect(api.reopenPost('aaaaaaa9-0000-4000-8000-000000000009')).rejects.toThrow(/ne peut plus/)
  })
  it('tout identifiant envoyé au serveur doit être un UUID (aucune requête sinon)', async () => {
    const bad = 'x,id.neq.0)&select=*'
    await expect(api.closePost(bad)).rejects.toThrow(/invalide/)
    await expect(api.deletePost(bad)).rejects.toThrow(/invalide/)
    await expect(api.listReplies(bad)).rejects.toThrow(/invalide/)
    await expect(api.addReply(bad, 'x')).rejects.toThrow(/invalide/)
    await expect(api.deleteReply(bad)).rejects.toThrow(/invalide/)
    await expect(api.openThread(bad)).rejects.toThrow(/invalide/)
    await expect(api.listMessages(bad)).rejects.toThrow(/invalide/)
    await expect(api.sendMessage(bad, 'x')).rejects.toThrow(/invalide/)
    await expect(api.report('post', bad, 'spam')).rejects.toThrow(/invalide/)
    await expect(api.blockUser(bad)).rejects.toThrow(/invalide/)
    await expect(api.unblockUser(bad)).rejects.toThrow(/invalide/)
    expect(state.calls.filter((c) => c.table !== 'profiles')).toHaveLength(0)
  })
  it('assertUuid met en minuscules (l’ordre user_a < user_b de la base suppose des minuscules)', () => {
    expect(api.assertUuid('AAAAAAA1-0000-4000-8000-000000000001')).toBe('aaaaaaa1-0000-4000-8000-000000000001')
    expect(() => api.assertUuid('')).toThrow()
    expect(() => api.assertUuid(undefined as never)).toThrow()
  })
  it('report refuse les noms hérités de Object (« constructor ») et les cibles inconnues', async () => {
    await expect(api.report('post', 'aaaaaaa1-0000-4000-8000-000000000001', 'constructor' as never)).rejects.toThrow(/Motif/)
    await expect(api.report('compte' as never, 'aaaaaaa1-0000-4000-8000-000000000001', 'spam')).rejects.toThrow(/inconnu/)
  })
  it('pseudo : caractères invisibles ou de direction refusés', () => {
    expect(() => api.validatePseudo('Bo\u202Eb')).toThrow(/invisibles/)
    expect(() => api.validatePseudo('\u3164\u3164\u3164')).toThrow(/invisibles/)
    expect(() => api.validatePseudo('\u200bAlice')).toThrow(/invisibles/)
    expect(() => api.validatePseudo('...')).toThrow(/lettre ou un chiffre/)
    expect(() => api.validatePseudo('a\u0085b')).toThrow(/interdits/)
    expect(api.validatePseudo('Zoé 🌱')).toBe('Zoé 🌱')
  })
  it('textes : marques de direction et contrôles retirés, emojis (ZWJ) conservés', () => {
    expect(api.validateMessage('a\u202Eb\u2066c\u0000d')).toBe('abcd')
    expect(api.validateMessage('👩\u200d🌾')).toBe('👩\u200d🌾')
    expect(api.validateMessage('ligne1\r\nligne2')).toBe('ligne1\nligne2')
  })
  it('translateError ne renvoie jamais un message brut du serveur, même accentué', () => {
    expect(api.translateError({ message: 'détail interne : table posts, colonne secrète é' })).toBe('Une erreur est survenue. Réessayez dans un instant.')
  })
  it('translateError : quotas de profil et d’annonces ouvertes, usurpation', () => {
    expect(api.translateError({ message: 'quota_exceeded:profile' })).toContain('limite du jour')
    expect(api.translateError({ message: 'quota_exceeded:post_open' })).toContain('ouvertes')
    expect(api.translateError({ message: 'forbidden', code: '42501' })).toContain('non autorisée')
  })
  it('listPosts : un rayon NaN retombe sur le rayon par défaut', async () => {
    set('posts:select', [])
    await api.listPosts({ radiusKm: Number.NaN })
    const ops = opsOf('posts')
    for (const [m, args] of ops) if (m === 'gte' || m === 'lte') expect(Number.isFinite(args[1])).toBe(true)
  })
  it('listPosts refuse un type inconnu', async () => {
    await expect(api.listPosts({ kind: 'vente' as never })).rejects.toThrow(/inconnu/)
  })
  it('getPhotoUrl : télécharge avec la session (pas de lien signé) et rend une URL blob', async () => {
    const createObjectURL = vi.fn(() => 'blob:x')
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL }))
    state.download.mockResolvedValueOnce({ data: new Blob([jpegHeader(800, 600)], { type: 'image/jpeg' }), error: null })
    const path = '11111111-1111-4111-8111-111111111111/aaaaaaa1-0000-4000-8000-000000000001.jpg'
    expect(await api.getPhotoUrl(path)).toBe('blob:x')
    expect(state.download).toHaveBeenCalledWith(path)
    vi.unstubAllGlobals()
  })
  it('getPhotoUrl refuse une photo d’un autre membre qui n’est pas une vraie image ou qui est une bombe de décompression', async () => {
    const createObjectURL = vi.fn(() => 'blob:x')
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL }))
    const path = '11111111-1111-4111-8111-111111111111/aaaaaaa1-0000-4000-8000-000000000001.jpg'
    // Type annoncé « image/jpeg » mais contenu HTML / SVG : refusé.
    state.download.mockResolvedValueOnce({ data: new Blob(['<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>'], { type: 'image/jpeg' }), error: null })
    expect(await api.getPhotoUrl(path)).toBeNull()
    // En-tête JPEG valide mais 30 000 × 30 000 px (moins de 1 Mo de fichier) : refusé avant tout décodage.
    state.download.mockResolvedValueOnce({ data: new Blob([jpegHeader(30000, 30000)], { type: 'image/jpeg' }), error: null })
    expect(await api.getPhotoUrl(path)).toBeNull()
    // En-tête tronqué (aucune dimension lisible) : refusé.
    state.download.mockResolvedValueOnce({ data: new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: 'image/jpeg' }), error: null })
    expect(await api.getPhotoUrl(path)).toBeNull()
    expect(createObjectURL).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
  it('getPhotoUrl refuse un chemin hors modèle, un type non image et une erreur', async () => {
    expect(await api.getPhotoUrl('../autre/x.jpg')).toBeNull()
    expect(await api.getPhotoUrl('11111111-1111-4111-8111-111111111111/../x.jpg')).toBeNull()
    expect(await api.getPhotoUrl(null)).toBeNull()
    expect(state.download).not.toHaveBeenCalled()
    const path = '11111111-1111-4111-8111-111111111111/aaaaaaa1-0000-4000-8000-000000000001.jpg'
    state.download.mockResolvedValueOnce({ data: new Blob(['<svg onload=alert(1)>'], { type: 'image/svg+xml' }), error: null })
    expect(await api.getPhotoUrl(path)).toBeNull()
    state.download.mockResolvedValueOnce({ data: null, error: { message: 'x' } })
    expect(await api.getPhotoUrl(path)).toBeNull()
  })
  it('deleteMyAccount : une erreur de liste (sans exception) arrête tout, le compte est conservé', async () => {
    state.list.mockReset()
    state.list.mockResolvedValue({ data: null as never, error: { message: 'boom' } })
    await expect(api.deleteMyAccount()).rejects.toThrow(/conservé/)
    expect(state.rpc).not.toHaveBeenCalled()
  })
  it('deleteMyAccount : une erreur de suppression arrête tout', async () => {
    state.remove.mockResolvedValueOnce({ data: [], error: { message: 'denied' } } as never)
    await expect(api.deleteMyAccount()).rejects.toThrow(/conservé/)
    expect(state.rpc).not.toHaveBeenCalled()
  })
  it('deleteMyAccount : des fichiers qui ne partent pas ne bouclent pas à l’infini', async () => {
    state.list.mockReset()
    state.list.mockResolvedValue({ data: [{ name: 'a.jpg' }], error: null })
    await expect(api.deleteMyAccount()).rejects.toThrow(/conservé/)
    expect(state.list.mock.calls.length).toBeLessThanOrEqual(20)
    expect(state.rpc).not.toHaveBeenCalled()
  })
})

describe('réponses et messages', () => {
  it('addReply valide et publie', async () => {
    set('replies:insert', { id: 'ccccccc1-0000-4000-8000-000000000001', post_id: 'aaaaaaa1-0000-4000-8000-000000000001', author: '11111111-1111-4111-8111-111111111111', body: 'Oui', created_at: 't', profiles: { pseudo: 'Jardinier' } })
    const r = await api.addReply('aaaaaaa1-0000-4000-8000-000000000001', ' Oui ')
    expect(r).toMatchObject({ mine: true, body: 'Oui' })
    await expect(api.addReply('aaaaaaa1-0000-4000-8000-000000000001', '   ')).rejects.toThrow(/obligatoire/)
  })
  it('openThread ordonne les identifiants (user_a < user_b)', async () => {
    set('threads:select', null)
    set('threads:insert', { id: 'bbbbbbb1-0000-4000-8000-000000000001', user_a: '11111111-1111-4111-8111-111111111111', user_b: 'ffffffff-ffff-4fff-8fff-ffffffffffff', post_id: null, last_message_at: 't' })
    set('profiles:select', [{ user_id: 'ffffffff-ffff-4fff-8fff-ffffffffffff', pseudo: 'Zed' }])
    const t = await api.openThread('ffffffff-ffff-4fff-8fff-ffffffffffff')
    const ins = opsOf('threads').find(([m]) => m === 'insert')![1][0] as { user_a: string; user_b: string }
    expect(ins.user_a < ins.user_b).toBe(true)
    expect(t).toMatchObject({ otherId: 'ffffffff-ffff-4fff-8fff-ffffffffffff', otherPseudo: 'Zed' })
    await expect(api.openThread('11111111-1111-4111-8111-111111111111')).rejects.toThrow(/vous-même/)
  })
  it('sendMessage plafonne à 1000 caractères', async () => {
    await expect(api.sendMessage('bbbbbbb1-0000-4000-8000-000000000001', 'x'.repeat(1001))).rejects.toThrow(/1000/)
    set('messages:insert', { id: 'ddddddd1-0000-4000-8000-000000000001', thread_id: 'bbbbbbb1-0000-4000-8000-000000000001', sender: '11111111-1111-4111-8111-111111111111', body: 'Bonjour', created_at: 't' })
    expect(await api.sendMessage('bbbbbbb1-0000-4000-8000-000000000001', 'Bonjour')).toMatchObject({ mine: true })
  })
})

describe('modération et compte', () => {
  it('report : un doublon est signalé en français', async () => {
    set('reports:insert', null, { message: 'duplicate key ... "reports_reporter_target_kind_target_id_key"', code: '23505' })
    await expect(api.report('post', 'aaaaaaa1-0000-4000-8000-000000000001', 'spam')).rejects.toThrow(/déjà signalé/)
  })
  it('report refuse un motif inconnu et un détail trop long', async () => {
    await expect(api.report('post', 'aaaaaaa1-0000-4000-8000-000000000001', 'nimporte' as never)).rejects.toThrow(/Motif/)
    await expect(api.report('post', 'aaaaaaa1-0000-4000-8000-000000000001', 'autre', 'x'.repeat(301))).rejects.toThrow(/300/)
  })
  it('blockUser refuse de se bloquer soi-même', async () => {
    await expect(api.blockUser('11111111-1111-4111-8111-111111111111')).rejects.toThrow(/vous-même/)
    await api.blockUser('33333333-3333-4333-8333-333333333333')
    expect(opsOf('blocks')).toContainEqual(['insert', [{ blocker: '11111111-1111-4111-8111-111111111111', blocked: '33333333-3333-4333-8333-333333333333' }]])
  })
  it('unblockUser supprime mon blocage', async () => {
    await api.unblockUser('33333333-3333-4333-8333-333333333333')
    expect(opsOf('blocks')).toContainEqual(['delete', []])
    expect(opsOf('blocks')).toContainEqual(['eq', ['blocked', '33333333-3333-4333-8333-333333333333']])
  })
  it('deleteMyAccount supprime les photos puis appelle delete_my_account', async () => {
    await api.deleteMyAccount()
    expect(state.remove).toHaveBeenCalledWith(['11111111-1111-4111-8111-111111111111/a.jpg', '11111111-1111-4111-8111-111111111111/b.jpg'])
    expect(state.rpc).toHaveBeenCalledWith('delete_my_account')
  })
  it('deleteMyAccount conserve le compte si les photos ne partent pas', async () => {
    state.list.mockRejectedValueOnce(new Error('Failed to fetch'))
    await expect(api.deleteMyAccount()).rejects.toThrow(/conservé/)
    expect(state.rpc).not.toHaveBeenCalled()
  })
})

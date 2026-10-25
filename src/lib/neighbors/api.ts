// Entraide entre voisins : accès aux données (projet Supabase dédié). Toutes les fonctions lèvent `NeighborsError`
// avec un message en français. Les limites sont vérifiées AVANT l'envoi ; la base les impose de toute façon (RLS, triggers).
import type { SupabaseClient } from '@supabase/supabase-js'
import { compressToTarget } from '../photos'
import { imageSize, jpegMetadataSegments, sizeWithinLimits } from '../security/image'
import { cellBounds, cellDistanceKm, distanceLabel, isValidCoord, roundCell } from './cell'
import { isNeighborsConfigured, neighborsClient, NEIGHBORS_STORAGE_KEY } from './client'
import { unreadByThread } from './logic'
import {
  NEIGHBORS_LIMITS as L,
  POST_KINDS,
  isPostCategory,
  REPORT_REASONS,
  type BlockedUser,
  type Cell,
  type InitNeighborsResult,
  type ListPostsOptions,
  type Message,
  type NeighborsSession,
  type NewPost,
  type Post,
  type PostCategory,
  type PostKind,
  type Profile,
  type Reply,
  type ReportReason,
  type ReportTarget,
  type Thread,
} from './types'

export { isNeighborsConfigured }

// ---------- Erreurs ----------

export class NeighborsError extends Error {
  readonly code?: string
  constructor(message: string, code?: string) {
    super(message)
    this.name = 'NeighborsError'
    this.code = code
  }
}

interface RawError {
  message?: string
  code?: string
  status?: number
  name?: string
}

const REPORT_TARGETS: readonly ReportTarget[] = ['post', 'reply', 'profile', 'message']

const LIMIT_TEXT = 'Vous avez atteint votre limite du jour. Revenez demain.'
const QUOTA_TEXT: Record<string, string> = {
  post: LIMIT_TEXT,
  reply: LIMIT_TEXT,
  message: LIMIT_TEXT,
  report: LIMIT_TEXT,
  thread: LIMIT_TEXT,
  profile: LIMIT_TEXT,
  post_open: `Vous avez déjà ${L.openPostsMax} annonces ouvertes. Fermez-en une avant d’en publier une autre.`,
  block: LIMIT_TEXT,
}

/** Traduit une erreur Supabase / Postgres / réseau en message français lisible. */
export function translateError(e: unknown): string {
  const err = (e ?? {}) as RawError
  const msg = String(err.message ?? (typeof e === 'string' ? e : ''))
  const low = msg.toLowerCase()
  const quota = /quota_exceeded:(\w+)/.exec(msg)
  if (quota) return QUOTA_TEXT[quota[1]] ?? LIMIT_TEXT
  if (low.includes('profiles_pseudo_key')) return 'Ce pseudo est déjà pris. Choisissez-en un autre.'
  if (low.includes('reports_reporter_target_kind_target_id_key')) return 'Vous avez déjà signalé ce contenu. Merci.'
  if (low.includes('blocks_pkey')) return 'Cette personne est déjà bloquée.'
  if (low.includes('threads_user_a_user_b_key')) return 'Une conversation existe déjà avec cette personne.'
  if (low.includes('not_member')) return 'Votre profil est absent ou suspendu. Créez-le dans l’entraide, ou contactez l’éditeur.'
  if (low.includes('reply_not_allowed')) return 'On ne peut répondre qu’à une question encore ouverte.'
  if (low.includes('report_self')) return 'Vous ne pouvez pas vous signaler vous-même.'
  if (low.includes('report_target_not_found')) return 'Ce contenu n’existe plus.'
  if (low.includes('over_email_send_rate_limit') || low.includes('email rate limit') || err.status === 429 || low.includes('rate limit')) {
    return 'Trop de demandes. Patientez quelques minutes avant de réessayer.'
  }
  if (low.includes('jwt') || low.includes('refresh token') || low.includes('not authenticated') || err.code === 'PGRST301' || err.status === 401) {
    return 'Session expirée. Reconnectez-vous avec un nouveau lien.'
  }
  if (low.includes('forbidden') && err.code === '42501') return 'Action non autorisée.'
  if (err.code === '42501' || low.includes('row-level security') || low.includes('permission denied')) {
    return 'Action non autorisée. Vérifiez que vous êtes connecté et que votre profil existe.'
  }
  if (low.includes('posts_cherche_category_check')) return 'Choisissez ce que vous cherchez : graines, outils, plantes…'
  // Base pas encore mise à jour (migration v2 non collée) : « Je cherche » et les catégories n'existent pas encore.
  if (low.includes('posts_kind_check') || (low.includes('category') && (err.code === 'PGRST204' || low.includes('schema cache')))) {
    return 'Cette fonction n’est pas encore ouverte chez vous. Réessayez plus tard.'
  }
  if (err.code === '23514') return 'Les informations envoyées dépassent les limites autorisées.'
  if (err.code === '23503') return 'Ce contenu n’existe plus.'
  if (low.includes('signups not allowed') || (low.includes('email address') && low.includes('invalid'))) return 'Adresse e-mail refusée. Vérifiez-la.'
  if (low.includes('failed to fetch') || low.includes('networkerror') || low.includes('load failed')) return 'Connexion impossible. Vérifiez votre accès à Internet.'
  // Messages déjà en français (http.ts : délai dépassé, connexion impossible) ou erreurs locales.
  if (e instanceof NeighborsError) return e.message
  // Messages français produits par src/lib/http.ts (jamais un message brut du serveur).
  // PostgREST enveloppe l'erreur réseau dans un objet simple (« Error: Connexion impossible… ») : on reconnaît la phrase, on renvoie un texte fixe.
  if (/(?:^|: )Connexion impossible\./.test(msg)) return 'Connexion impossible. Vérifiez votre accès à Internet.'
  if (/(?:^|: )Le service met trop de temps à répondre\./.test(msg)) return 'Le service met trop de temps à répondre. Réessayez dans un instant.'
  return 'Une erreur est survenue. Réessayez dans un instant.'
}

const fail = (e: unknown): never => {
  if (e instanceof NeighborsError) throw e
  throw new NeighborsError(translateError(e), (e as RawError | undefined)?.code)
}

function sb(): SupabaseClient {
  const c = neighborsClient()
  if (!c) throw new NeighborsError('L’entraide entre voisins n’est pas activée sur cette installation.', 'not_configured')
  return c
}

/** Exécute une requête Supabase, renvoie `data` ou lève une erreur traduite. */
async function run<T>(q: PromiseLike<{ data: T | null; error: unknown }>): Promise<T | null> {
  let res: { data: T | null; error: unknown }
  try {
    res = await q
  } catch (e) {
    return fail(e)
  }
  if (res.error) fail(res.error)
  return res.data
}

// ---------- Validation (avant envoi) ----------

const CONTROL = /[\u0000-\u001f\u007f-\u009f<>]/
/** Caractères invisibles ou de direction : usurpation visuelle d'un pseudo (même liste que la contrainte SQL). */
const INVISIBLE = /[\u00ad\u034f\u061c\u115f\u1160\u17b4\u17b5\u180e\u200b-\u200f\u2028-\u202e\u2060-\u206f\u3164\ufeff\uffa0]/
/** Dans les textes libres : on retire contrôles (sauf retour à la ligne) et marques de direction (inversion d'affichage). */
const TEXT_STRIP = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/g

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** Identifiant envoyé au serveur : un UUID, en minuscules. Refuse tout le reste avant la requête. */
export function assertUuid(raw: string, label = 'Identifiant'): string {
  if (typeof raw !== 'string' || !UUID.test(raw)) throw new NeighborsError(`${label} invalide.`, 'invalid')
  return raw.toLowerCase()
}

export function validatePseudo(raw: string): string {
  const p = raw.trim()
  if (p.length < L.pseudoMin || p.length > L.pseudoMax) throw new NeighborsError(`Le pseudo doit faire entre ${L.pseudoMin} et ${L.pseudoMax} caractères.`, 'invalid')
  if (CONTROL.test(p)) throw new NeighborsError('Le pseudo contient des caractères interdits (< > ou caractères de contrôle).', 'invalid')
  if (INVISIBLE.test(p)) throw new NeighborsError('Le pseudo contient des caractères invisibles ou de direction.', 'invalid')
  if (!/[\p{L}\p{N}]/u.test(p)) throw new NeighborsError('Le pseudo doit contenir au moins une lettre ou un chiffre.', 'invalid')
  return p
}

function validateText(raw: string, label: string, max: number, required: boolean): string {
  const t = raw.replace(/\r\n/g, '\n').replace(TEXT_STRIP, '').trim()
  if (required && !t) throw new NeighborsError(`${label} : ce champ est obligatoire.`, 'invalid')
  if (t.length > max) throw new NeighborsError(`${label} : ${max} caractères au maximum (${t.length} saisis).`, 'invalid')
  return t
}

export interface ValidPost {
  kind: PostKind
  category: PostCategory | null
  title: string
  body: string
  speciesId: string | null
}

export function validatePost(input: Pick<NewPost, 'kind' | 'title' | 'body' | 'speciesId' | 'category'>): ValidPost {
  if (!POST_KINDS.includes(input.kind)) throw new NeighborsError('Type d’annonce inconnu.', 'invalid')
  if (input.category != null && !isPostCategory(input.category)) throw new NeighborsError('Catégorie inconnue.', 'invalid')
  if (input.kind === 'cherche' && !input.category) throw new NeighborsError('Choisissez ce que vous cherchez : graines, outils, plantes…', 'invalid')
  const species = input.speciesId?.trim() || null
  if (species && species.length > L.speciesIdMax) throw new NeighborsError('Espèce invalide.', 'invalid')
  return {
    kind: input.kind,
    category: input.category ?? null,
    title: validateText(input.title, 'Titre', L.titleMax, true),
    body: validateText(input.body ?? '', 'Description', L.bodyMax, false),
    speciesId: species,
  }
}

export const validateMessage = (raw: string, label = 'Message') => validateText(raw, label, L.messageMax, true)

// ---------- Connexion ----------

const isEmail = (e: string) => e.length <= 254 && /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]+$/.test(e)

/** Marqueur de retour d'un lien de l'entraide, pour ne pas le confondre avec celui de la synchro privée. */
const REDIRECT_MARK = 'entraide=1'

/** Envoie le lien magique. Le lien doit être ouvert dans le MÊME navigateur (PKCE). */
export async function signIn(email: string): Promise<void> {
  const client = sb()
  const address = email.trim()
  if (!isEmail(address)) throw new NeighborsError('Adresse e-mail invalide.', 'invalid')
  const redirect = typeof location !== 'undefined' ? `${location.origin}/?${REDIRECT_MARK}` : undefined
  await run(client.auth.signInWithOtp({ email: address, options: { emailRedirectTo: redirect } }).then((r) => ({ data: null, error: r.error })))
}

/**
 * À appeler UNE fois au démarrage, AVANT initSync() (synchro privée) : si l'URL est le retour d'un lien de l'entraide
 * (`?entraide=1&code=…`), échange le code, nettoie l'URL (→ `#entraide`) pour que la synchro ne le voie pas.
 * Ne lève jamais ; sans configuration, renvoie `{ handled: false }`.
 */
export async function initNeighbors(): Promise<InitNeighborsResult> {
  const client = neighborsClient()
  if (!client || typeof location === 'undefined') return { handled: false }
  const params = new URLSearchParams(location.search)
  if (params.get('entraide') !== '1') return { handled: false }
  const code = params.get('code')
  const urlError = params.get('error_description') ?? params.get('error')
  let result: InitNeighborsResult
  if (urlError) {
    result = { handled: true, signedIn: false, error: 'Le lien de connexion a expiré ou a déjà été utilisé. Demandez-en un nouveau.' }
  } else if (!code) {
    result = { handled: true, signedIn: false, error: 'La connexion a échoué. Demandez un nouveau lien.' }
  } else {
    try {
      const { error } = await client.auth.exchangeCodeForSession(code)
      result = error
        ? { handled: true, signedIn: false, error: 'Connexion impossible. Ouvrez le lien dans le même navigateur que celui où vous l’avez demandé, ou demandez-en un nouveau.' }
        : { handled: true, signedIn: true }
    } catch (e) {
      result = { handled: true, signedIn: false, error: translateError(e) }
    }
  }
  try {
    history.replaceState(null, '', location.pathname + '#entraide')
  } catch {
    /* historique indisponible */
  }
  return result
}

export async function getSession(): Promise<NeighborsSession | null> {
  if (!isNeighborsConfigured()) return null
  try {
    const { data } = await sb().auth.getSession()
    const u = data.session?.user
    return u ? { userId: u.id, email: u.email ?? null } : null
  } catch (e) {
    return fail(e)
  }
}

/** Abonnement aux changements de connexion. Renvoie la fonction de désabonnement. */
export function onSessionChange(cb: (s: NeighborsSession | null) => void): () => void {
  const client = neighborsClient()
  if (!client) return () => {}
  const { data } = client.auth.onAuthStateChange((_evt, session) => {
    const user = session?.user
    if (!user) profileCache = undefined
    cb(user ? { userId: user.id, email: user.email ?? null } : null)
  })
  return () => data.subscription.unsubscribe()
}

export async function signOut(): Promise<void> {
  profileCache = undefined
  const client = neighborsClient()
  if (!client) return
  try {
    await client.auth.signOut()
  } catch {
    // Hors ligne : on supprime quand même le jeton local.
    try {
      localStorage.removeItem(NEIGHBORS_STORAGE_KEY)
    } catch {
      /* stockage indisponible */
    }
  }
}

async function requireUserId(): Promise<string> {
  const s = await getSession()
  if (!s) throw new NeighborsError('Connectez-vous pour utiliser l’entraide.', 'auth')
  return s.userId
}

// ---------- Profil ----------

interface ProfileRow {
  user_id: string
  pseudo: string
  cell_lat: number | string
  cell_lon: number | string
  created_at: string
}
const PROFILE_COLS = 'user_id, pseudo, cell_lat, cell_lon, created_at'

const toProfile = (r: ProfileRow): Profile => ({
  userId: r.user_id,
  pseudo: r.pseudo,
  cell: { lat: Number(r.cell_lat), lon: Number(r.cell_lon) },
  createdAt: r.created_at,
})

let profileCache: Profile | null | undefined
let profileCacheUser: string | undefined

export async function getProfile(): Promise<Profile | null> {
  const uid = await requireUserId()
  const row = await run<ProfileRow>(sb().from('profiles').select(PROFILE_COLS).eq('user_id', uid).maybeSingle() as never)
  profileCacheUser = uid
  return (profileCache = row ? toProfile(row) : null)
}

async function myCell(): Promise<Cell | null> {
  const uid = await requireUserId()
  if (profileCache !== undefined && profileCacheUser === uid) return profileCache?.cell ?? null
  return (await getProfile())?.cell ?? null
}

/** Crée ou met à jour le profil. La position est arrondie ICI (cellule de ~1 km) avant tout envoi. */
export async function saveProfile(input: { pseudo: string; lat: number; lon: number }): Promise<Profile> {
  const uid = await requireUserId()
  const pseudo = validatePseudo(input.pseudo)
  if (!isValidCoord(input.lat, input.lon)) throw new NeighborsError('Position invalide. Choisissez votre quartier.', 'invalid')
  const cell = roundCell(input.lat, input.lon)
  const client = sb()
  const existing = await run<{ user_id: string }>(client.from('profiles').select('user_id').eq('user_id', uid).maybeSingle() as never)
  const q = existing
    ? client.from('profiles').update({ pseudo, cell_lat: cell.lat, cell_lon: cell.lon }).eq('user_id', uid).select(PROFILE_COLS).single()
    : client.from('profiles').insert({ user_id: uid, pseudo, cell_lat: cell.lat, cell_lon: cell.lon }).select(PROFILE_COLS).single()
  const row = await run<ProfileRow>(q as never)
  if (!row) throw new NeighborsError('Le profil n’a pas pu être enregistré.')
  profileCacheUser = uid
  return (profileCache = toProfile(row))
}

// ---------- Annonces ----------

interface PostRow {
  id: string
  author: string
  kind: PostKind
  category?: PostCategory | null
  title: string
  body: string
  species_id: string | null
  photo_path: string | null
  status: Post['status']
  cell_lat: number | string
  cell_lon: number | string
  created_at: string
  expires_at: string
  profiles?: { pseudo?: string } | null
}
const POST_SELECT = '*, profiles(pseudo)'

function toPost(r: PostRow, uid: string, from: Cell | null): Post {
  const cell = { lat: Number(r.cell_lat), lon: Number(r.cell_lon) }
  const km = from ? cellDistanceKm(from, cell) : null
  return {
    id: r.id,
    authorId: r.author,
    authorPseudo: r.profiles?.pseudo ?? 'Voisin',
    mine: r.author === uid,
    kind: r.kind,
    category: isPostCategory(r.category) ? r.category : null,
    title: r.title,
    body: r.body ?? '',
    speciesId: r.species_id,
    photoPath: r.photo_path,
    status: r.status,
    cell,
    createdAt: r.created_at,
    expiresAt: r.expires_at,
    distanceKm: km,
    distanceLabel: distanceLabel(km),
  }
}

/** Annonces ouvertes autour de mon quartier, les plus récentes d'abord. Les personnes bloquées en sont exclues par la base. */
export async function listPosts(opts: ListPostsOptions = {}): Promise<Post[]> {
  const uid = await requireUserId()
  const center = await myCell()
  if (!center) throw new NeighborsError('Créez d’abord votre profil (pseudo et quartier).', 'no_profile')
  const asked = Number.isFinite(opts.radiusKm) ? (opts.radiusKm as number) : L.defaultRadiusKm
  const radius = Math.min(L.maxRadiusKm, Math.max(1, asked))
  if (opts.kind !== undefined && !POST_KINDS.includes(opts.kind)) throw new NeighborsError('Type d’annonce inconnu.', 'invalid')
  const b = cellBounds(center, radius)
  let q = sb()
    .from('posts')
    .select(POST_SELECT)
    .eq('status', 'open')
    .gte('cell_lat', b.latMin)
    .lte('cell_lat', b.latMax)
    .gte('cell_lon', b.lonMin)
    .lte('cell_lon', b.lonMax)
  if (opts.category !== undefined && !isPostCategory(opts.category)) throw new NeighborsError('Catégorie inconnue.', 'invalid')
  if (opts.kind) q = q.eq('kind', opts.kind)
  if (opts.category) q = q.eq('category', opts.category)
  const rows = (await run<PostRow[]>(q.order('created_at', { ascending: false }).limit(100) as never)) ?? []
  return rows.map((r) => toPost(r, uid, center)).filter((p) => p.distanceKm == null || p.distanceKm <= radius + 0.8)
}

/** Mes propres annonces (tous statuts, y compris masquées). */
export async function listMyPosts(): Promise<Post[]> {
  const uid = await requireUserId()
  const center = await myCell()
  const rows = (await run<PostRow[]>(sb().from('posts').select(POST_SELECT).eq('author', uid).order('created_at', { ascending: false }).limit(100) as never)) ?? []
  return rows.map((r) => toPost(r, uid, center))
}

/** Redessine la photo (EXIF/GPS supprimés), la réduit sous 1 Mo et vérifie qu'aucune métadonnée ne subsiste. */
async function preparePhoto(photo: Blob): Promise<Blob> {
  let clean: Blob
  try {
    clean = await compressToTarget(photo, { maxSide: 1280, targetBytes: 800 * 1024 })
  } catch (e) {
    return fail(e)
  }
  if (clean.size > L.photoMaxBytes) throw new NeighborsError('La photo est trop lourde (1 Mo maximum). Essayez une autre image.', 'invalid')
  const bytes = new Uint8Array(await clean.arrayBuffer())
  if (jpegMetadataSegments(bytes).length > 0) throw new NeighborsError('La photo contient encore des métadonnées. Elle n’a pas été envoyée.', 'invalid')
  return clean
}

/** UUID v4 aléatoire (le chemin de stockage doit avoir ce format, la politique Storage l'impose). Jamais Math.random. */
function newId(): string {
  const c = globalThis.crypto
  if (!c?.getRandomValues) throw new NeighborsError('Ce navigateur ne permet pas d’envoyer une photo en toute sécurité.', 'invalid')
  const b = c.getRandomValues(new Uint8Array(16))
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

/** Publie une annonce. Valide, vérifie le quota du jour, nettoie la photo, l'envoie, puis crée l'annonce. */
export async function createPost(input: NewPost): Promise<Post> {
  const uid = await requireUserId()
  const v = validatePost(input)
  const center = await myCell()
  if (!center) throw new NeighborsError('Créez d’abord votre profil (pseudo et quartier).', 'no_profile')
  const client = sb()

  // Quota du jour (heure UTC, comme la base). La base reste l'arbitre.
  const day = new Date().toISOString().slice(0, 10)
  const { count, error: cErr } = await client.from('posts').select('id', { count: 'exact', head: true }).eq('author', uid).gte('created_at', `${day}T00:00:00Z`)
  if (cErr) fail(cErr)
  if ((count ?? 0) >= L.postsPerDay) throw new NeighborsError(QUOTA_TEXT.post, 'quota')

  let photoPath: string | null = null
  if (input.photo) {
    const clean = await preparePhoto(input.photo)
    photoPath = `${uid}/${newId()}.jpg`
    await run(client.storage.from(PHOTO_BUCKET).upload(photoPath, clean, { contentType: 'image/jpeg', upsert: false }) as never)
  }
  try {
    const row = await run<PostRow>(
      client
        .from('posts')
        // « category » n'est envoyée que si elle est choisie : une base pas encore mise à jour accepte alors les anciennes annonces.
        .insert({ author: uid, kind: v.kind, title: v.title, body: v.body, species_id: v.speciesId, photo_path: photoPath, ...(v.category ? { category: v.category } : {}) })
        .select(POST_SELECT)
        .single() as never,
    )
    if (!row) throw new NeighborsError('L’annonce n’a pas pu être publiée.')
    return toPost(row, uid, center)
  } catch (e) {
    if (photoPath) await removePhotos([photoPath]) // pas de photo orpheline
    throw e
  }
}

export const PHOTO_BUCKET = 'neighbors-photos'

async function removePhotos(paths: string[]): Promise<void> {
  if (!paths.length) return
  try {
    await sb().storage.from(PHOTO_BUCKET).remove(paths) // {error} ignoré : au mieux, l'éditeur purge les orphelins (docs/ENTRAIDE.md)
  } catch {
    /* hors ligne : idem */
  }
}

/** Notre appli envoie des photos de 1 280 px au plus : au-delà de 4 096 px (16 Mpx), le fichier ne vient pas de chez nous. */
const SHOWN_PHOTO_MAX_SIDE = 4096
const SHOWN_PHOTO_MAX_PIXELS = 16_000_000

/**
 * Photo d'annonce sous forme d'URL `blob:` (ou null). Le fichier est téléchargé avec la session (bucket privé) :
 * pas de lien signé qui circule, et la CSP `img-src 'self' data: blob:` n'a pas à être élargie.
 * L'interface doit appeler `URL.revokeObjectURL(url)` quand l'image n'est plus affichée.
 */
export async function getPhotoUrl(path: string | null): Promise<string | null> {
  if (!path || path.length > 200 || path.includes('..') || !/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.jpg$/i.test(path)) return null
  try {
    const { data, error } = await sb().storage.from(PHOTO_BUCKET).download(path)
    if (error || !data || !/^image\/(jpeg|png|webp)$/.test(data.type) || data.size > L.photoMaxBytes) return null
    // Le fichier vient d'un autre membre (son navigateur n'est pas le nôtre) : le type annoncé ne prouve rien. On lit l'en-tête
    // (JPEG, PNG ou WebP réel) et on refuse une « bombe de décompression » avant que <img> ne la décode (saturation mémoire).
    const size = imageSize(new Uint8Array(await data.slice(0, 65536).arrayBuffer()))
    if (!size || !sizeWithinLimits(size, SHOWN_PHOTO_MAX_SIDE, SHOWN_PHOTO_MAX_PIXELS)) return null
    return URL.createObjectURL(data)
  } catch {
    return null
  }
}

async function setStatus(rawId: string, status: 'open' | 'closed'): Promise<void> {
  const id = assertUuid(rawId, 'Annonce')
  const uid = await requireUserId()
  const rows = await run<{ id: string }[]>(sb().from('posts').update({ status }).eq('id', id).eq('author', uid).select('id') as never)
  // Une annonce masquée par la modération (ou supprimée) n'est plus modifiable : la base ne touche aucune ligne, sans erreur.
  if (!rows || rows.length === 0) throw new NeighborsError('Cette annonce ne peut plus être modifiée (masquée ou supprimée).', 'not_found')
}

/** Marque l'annonce comme terminée (donnée, échangée, résolue…). */
export const closePost = (id: string) => setStatus(id, 'closed')
export const reopenPost = (id: string) => setStatus(id, 'open')

export async function deletePost(rawId: string): Promise<void> {
  const id = assertUuid(rawId, 'Annonce')
  const uid = await requireUserId()
  const client = sb()
  const row = await run<{ photo_path: string | null }>(client.from('posts').select('photo_path').eq('id', id).eq('author', uid).maybeSingle() as never)
  await run(client.from('posts').delete().eq('id', id).eq('author', uid) as never)
  if (row?.photo_path) await removePhotos([row.photo_path])
}

// ---------- Réponses (questions) ----------

interface ReplyRow {
  id: string
  post_id: string
  author: string
  body: string
  created_at: string
  profiles?: { pseudo?: string } | null
}

const toReply = (r: ReplyRow, uid: string): Reply => ({
  id: r.id,
  postId: r.post_id,
  authorId: r.author,
  authorPseudo: r.profiles?.pseudo ?? 'Voisin',
  mine: r.author === uid,
  body: r.body,
  createdAt: r.created_at,
})

export async function listReplies(rawPostId: string): Promise<Reply[]> {
  const postId = assertUuid(rawPostId, 'Annonce')
  const uid = await requireUserId()
  const rows = (await run<ReplyRow[]>(sb().from('replies').select('*, profiles(pseudo)').eq('post_id', postId).order('created_at', { ascending: true }).limit(200) as never)) ?? []
  return rows.map((r) => toReply(r, uid))
}

export async function addReply(rawPostId: string, body: string): Promise<Reply> {
  const postId = assertUuid(rawPostId, 'Annonce')
  const uid = await requireUserId()
  const text = validateText(body, 'Réponse', L.bodyMax, true)
  const row = await run<ReplyRow>(sb().from('replies').insert({ post_id: postId, author: uid, body: text }).select('*, profiles(pseudo)').single() as never)
  if (!row) throw new NeighborsError('La réponse n’a pas pu être publiée.')
  return toReply(row, uid)
}

export async function deleteReply(rawId: string): Promise<void> {
  const id = assertUuid(rawId, 'Réponse')
  await requireUserId()
  await run(sb().from('replies').delete().eq('id', id) as never)
}

// ---------- Messages privés ----------

interface ThreadRow {
  id: string
  user_a: string
  user_b: string
  post_id: string | null
  last_message_at: string
}

async function pseudos(ids: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  if (!ids.length) return map
  const rows = (await run<{ user_id: string; pseudo: string }[]>(sb().from('profiles').select('user_id, pseudo').in('user_id', ids) as never)) ?? []
  for (const r of rows) map.set(r.user_id, r.pseudo)
  return map
}

const toThread = (r: ThreadRow, uid: string, names: Map<string, string>): Thread => {
  const otherId = r.user_a === uid ? r.user_b : r.user_a
  return { id: r.id, otherId, otherPseudo: names.get(otherId) ?? 'Voisin', postId: r.post_id, lastMessageAt: r.last_message_at }
}

export async function listThreads(): Promise<Thread[]> {
  const uid = await requireUserId()
  const rows = (await run<ThreadRow[]>(sb().from('threads').select('*').order('last_message_at', { ascending: false }).limit(100) as never)) ?? []
  const names = await pseudos(rows.map((r) => (r.user_a === uid ? r.user_b : r.user_a)))
  return rows.map((r) => toThread(r, uid, names))
}

/** Ouvre (ou retrouve) la conversation avec une personne. L'ordre des identifiants est imposé par la base (user_a < user_b). */
export async function openThread(rawOtherId: string, rawPostId?: string | null): Promise<Thread> {
  const otherId = assertUuid(rawOtherId, 'Personne')
  const postId = rawPostId ? assertUuid(rawPostId, 'Annonce') : null
  const uid = (await requireUserId()).toLowerCase()
  if (otherId === uid) throw new NeighborsError('Vous ne pouvez pas vous écrire à vous-même.', 'invalid')
  const [a, b] = uid < otherId ? [uid, otherId] : [otherId, uid]
  const client = sb()
  let row = await run<ThreadRow>(client.from('threads').select('*').eq('user_a', a).eq('user_b', b).maybeSingle() as never)
  if (!row) row = await run<ThreadRow>(client.from('threads').insert({ user_a: a, user_b: b, post_id: postId }).select('*').single() as never)
  if (!row) throw new NeighborsError('La conversation n’a pas pu être ouverte.')
  return toThread(row, uid, await pseudos([otherId]))
}

interface MessageRow {
  id: string
  thread_id: string
  sender: string
  body: string
  created_at: string
}
const toMessage = (r: MessageRow, uid: string): Message => ({ id: r.id, threadId: r.thread_id, mine: r.sender === uid, body: r.body, createdAt: r.created_at })

export async function listMessages(rawThreadId: string): Promise<Message[]> {
  const threadId = assertUuid(rawThreadId, 'Conversation')
  const uid = await requireUserId()
  const rows = (await run<MessageRow[]>(sb().from('messages').select('*').eq('thread_id', threadId).order('created_at', { ascending: true }).limit(500) as never)) ?? []
  return rows.map((r) => toMessage(r, uid))
}

export async function sendMessage(rawThreadId: string, body: string): Promise<Message> {
  const threadId = assertUuid(rawThreadId, 'Conversation')
  const uid = await requireUserId()
  const text = validateMessage(body)
  const row = await run<MessageRow>(sb().from('messages').insert({ thread_id: threadId, sender: uid, body: text }).select('*').single() as never)
  if (!row) throw new NeighborsError('Le message n’a pas pu être envoyé.')
  return toMessage(row, uid)
}

/** Date de dernière lecture de chaque conversation, pour moi seul (la base ne montre que ma ligne). */
async function myReads(): Promise<Record<string, string>> {
  const rows = (await run<{ thread_id: string; last_read_at: string }[]>(sb().from('thread_reads').select('thread_id, last_read_at').limit(200) as never)) ?? []
  const out: Record<string, string> = {}
  for (const r of rows) out[r.thread_id] = r.last_read_at
  return out
}

/** Messages reçus pas encore lus, par conversation (les 200 plus récents reçus sont regardés). */
export async function listUnread(): Promise<Record<string, number>> {
  const uid = await requireUserId()
  const [reads, rows] = await Promise.all([
    myReads(),
    run<{ thread_id: string; created_at: string }[]>(sb().from('messages').select('thread_id, created_at').neq('sender', uid).order('created_at', { ascending: false }).limit(200) as never),
  ])
  return unreadByThread((rows ?? []).map((r) => ({ threadId: r.thread_id, createdAt: r.created_at })), reads)
}

/** Note que la conversation a été lue maintenant (la date est posée par le serveur). */
export async function markThreadRead(rawThreadId: string): Promise<void> {
  const threadId = assertUuid(rawThreadId, 'Conversation')
  const uid = await requireUserId()
  await run(sb().from('thread_reads').upsert({ thread_id: threadId, user_id: uid, last_read_at: new Date().toISOString() }, { onConflict: 'thread_id,user_id' }) as never)
}

// ---------- Modération ----------

/** Signale un contenu. À 3 signalements de personnes distinctes, une annonce ou une réponse est masquée automatiquement. */
export async function report(target: ReportTarget, rawTargetId: string, reason: ReportReason, details?: string): Promise<void> {
  const targetId = assertUuid(rawTargetId, 'Contenu')
  const uid = await requireUserId()
  if (!REPORT_TARGETS.includes(target)) throw new NeighborsError('Type de contenu inconnu.', 'invalid')
  if (!Object.hasOwn(REPORT_REASONS, reason)) throw new NeighborsError('Motif de signalement inconnu.', 'invalid')
  const d = validateText(details ?? '', 'Précisions', L.detailsMax, false)
  await run(sb().from('reports').insert({ reporter: uid, target_kind: target, target_id: targetId, reason, details: d || null }) as never)
}

/** Bloque une personne : plus aucune annonce, réponse ni message dans les deux sens. */
export async function blockUser(rawUserId: string): Promise<void> {
  const userId = assertUuid(rawUserId, 'Personne')
  const uid = (await requireUserId()).toLowerCase()
  if (userId === uid) throw new NeighborsError('Vous ne pouvez pas vous bloquer vous-même.', 'invalid')
  await run(sb().from('blocks').insert({ blocker: uid, blocked: userId }) as never)
}

export async function unblockUser(rawUserId: string): Promise<void> {
  const userId = assertUuid(rawUserId, 'Personne')
  const uid = await requireUserId()
  await run(sb().from('blocks').delete().eq('blocker', uid).eq('blocked', userId) as never)
}

export async function listBlocks(): Promise<BlockedUser[]> {
  const uid = await requireUserId()
  const rows = (await run<{ blocked: string; blocked_pseudo: string | null }[]>(sb().from('blocks').select('blocked, blocked_pseudo').eq('blocker', uid) as never)) ?? []
  return rows.map((r) => ({ userId: r.blocked, pseudo: r.blocked_pseudo }))
}

// ---------- Compte ----------

/**
 * Supprime définitivement le compte de l'entraide : photos, puis (en cascade côté base) profil, annonces, réponses,
 * conversations, messages, signalements, blocages. Déconnecte ensuite l'appareil.
 */
export async function deleteMyAccount(): Promise<void> {
  const uid = await requireUserId()
  const client = sb()
  // Les fichiers doivent partir par l'API Storage (effacer les lignes SQL laisserait les fichiers).
  // Toute erreur (liste ou suppression) arrête l'opération : on ne supprime jamais le compte en laissant des photos.
  const photoError = (e: unknown): never => {
    throw new NeighborsError(`Vos photos n’ont pas pu être supprimées, le compte est conservé. ${translateError(e)}`)
  }
  try {
    let empty = false
    for (let round = 0; round < 20 && !empty; round++) {
      const { data, error } = await client.storage.from(PHOTO_BUCKET).list(uid, { limit: 100 })
      if (error) photoError(error)
      const paths = (data ?? []).map((f) => `${uid}/${f.name}`)
      if (!paths.length) {
        empty = true
        break
      }
      const { error: rmError } = await client.storage.from(PHOTO_BUCKET).remove(paths)
      if (rmError) photoError(rmError)
    }
    if (!empty) photoError(new Error('fichiers restants'))
  } catch (e) {
    if (e instanceof NeighborsError) throw e
    photoError(e)
  }
  await run(client.rpc('delete_my_account') as never)
  profileCache = undefined
  await signOut()
}

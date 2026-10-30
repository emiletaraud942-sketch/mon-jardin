// Synchronisation Supabase OPTIONNELLE : sans VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY, tout ce module est inerte.
//
// Connexion par lien magique (PKCE) : dans Supabase, Authentication → URL Configuration, ajouter
//   - Site URL : l'adresse de production (ex. https://permajardin.vercel.app)
//   - Redirect URLs : https://permajardin.vercel.app/** et http://localhost:5173/** (développement)
// Le lien doit être ouvert dans le MÊME navigateur que celui où il a été demandé (le « code verifier » PKCE y est stocké).
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js'
import { migrateState, serializeState } from './migrate'
import { getState, getStorageStatus, replaceData } from './store'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

const TABLE = 'garden_snapshots'
const TIMEOUT_MS = 15_000
/** Un peu en dessous de la contrainte SQL (pg_column_size(data) < 5 000 000), compté en octets UTF-8 (un accent en vaut 2). */
const MAX_JSON_BYTES = 4_800_000
/** Taille en octets UTF-8 du JSON envoyé (et non en caractères). */
export const jsonBytes = (data: unknown) => new TextEncoder().encode(JSON.stringify(data)).length
const lastSyncKey = (userId: string) => `permajardin:last-synced:${userId}`

let client: SupabaseClient | undefined
export function supabase(): SupabaseClient | undefined {
  if (!url || !key) return undefined
  return (client ??= createClient(url, key, {
    // PKCE : le jeton n'apparaît pas dans l'URL. Le client échange lui-même `?code=` au démarrage.
    auth: { flowType: 'pkce', detectSessionInUrl: true, persistSession: true, autoRefreshToken: true },
  }))
}

export const syncAvailable = () => !!supabase()

/** Les appels supabase-js n'acceptent pas de signal d'annulation : on borne l'attente à 15 s. */
function withTimeout<T>(p: PromiseLike<T>, ms = TIMEOUT_MS): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const limit = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('Le service met trop de temps à répondre. Réessayez dans un instant.')), ms)
  })
  return Promise.race([Promise.resolve(p), limit]).finally(() => clearTimeout(timer))
}

// ---------- Retour du lien magique ----------

export interface InitSyncResult {
  /** L'URL contenait un retour de connexion (traité et nettoyé). */
  handled: boolean
  signedIn?: boolean
  /** Message à afficher (lien expiré, autre navigateur…). */
  error?: string
}

let initPromise: Promise<InitSyncResult> | undefined

const CALLBACK_RE = /(?:^|[?&#])(code|access_token|error_description|error_code|error)=/
const urlParams = () => new URLSearchParams((location.search + '&' + location.hash.replace(/^#[^?=&]*[?&]?/, '')).replace(/^&/, ''))

function callbackError(p: URLSearchParams): string | undefined {
  const desc = p.get('error_description') ?? p.get('error')
  if (!desc && !p.get('error_code')) return undefined
  const text = `${p.get('error_code') ?? ''} ${desc ?? ''}`.toLowerCase()
  if (/expired|invalid|otp|used/.test(text)) return 'Le lien de connexion a expiré ou a déjà été utilisé. Demandez-en un nouveau.'
  return 'La connexion a échoué. Demandez un nouveau lien de connexion.'
}

/**
 * À appeler UNE fois au démarrage, avant tout changement d'interface qui lirait l'URL (`main.tsx`) :
 * crée le client, laisse auth-js échanger le `?code=` (ou `#access_token=`) du lien magique, puis nettoie l'URL vers `#reglages`.
 * Ne lève jamais d'exception ; sans Supabase configuré, renvoie `{ handled: false }`.
 */
export function initSync(): Promise<InitSyncResult> {
  return (initPromise ??= runInit())
}

async function runInit(): Promise<InitSyncResult> {
  const sb = supabase()
  if (!sb || typeof location === 'undefined') return { handled: false }
  if (!CALLBACK_RE.test(location.search + location.hash)) return { handled: false }

  const params = urlParams()
  const urlError = callbackError(params)
  const hadCode = params.has('code')
  let signedIn = false
  let error = urlError
  try {
    // getSession() attend la fin de l'initialisation d'auth-js, donc l'échange du code.
    const { data } = await withTimeout(sb.auth.getSession())
    signedIn = !!data.session && !urlError
    if (!signedIn && !error) {
      error = hadCode
        ? 'Connexion impossible. Ouvrez le lien de l’e-mail dans le même navigateur que celui où vous l’avez demandé, ou demandez-en un nouveau.'
        : 'La connexion a échoué. Demandez un nouveau lien de connexion.'
    }
  } catch (e) {
    error = (e as Error).message || 'La connexion a échoué. Réessayez.'
  } finally {
    try {
      history.replaceState(null, '', location.pathname + '#reglages')
    } catch {
      /* historique indisponible */
    }
  }
  return error ? { handled: true, signedIn: false, error } : { handled: true, signedIn }
}

// ---------- Session ----------

/** Utilisateur connecté, lu depuis la session locale (aucun appel réseau sauf renouvellement du jeton). */
export async function currentUser(): Promise<User | null> {
  const sb = supabase()
  if (!sb) return null
  const { data } = await withTimeout(sb.auth.getSession())
  return data.session?.user ?? null
}

/** Adresse plausible (la vraie validation est faite par Supabase) : évite d'envoyer n'importe quoi au service. */
export const isPlausibleEmail = (e: string) => e.length <= 254 && /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]+$/.test(e)

/**
 * Envoie un CODE à saisir dans l'appli (plutôt qu'un lien à ouvrir) : sur iPhone, l'appli épinglée à l'écran d'accueil et Safari
 * n'ont pas le même stockage, donc un lien ouvert dans Safari ne connecte jamais l'appli. Le code, lui, se tape là où on l'a demandé.
 * Le modèle d'e-mail Supabase doit contenir {{ .Token }} (voir docs/ACTIONS-PROPRIETAIRE.md).
 */
export async function sendLoginCode(email: string) {
  const sb = supabase()
  if (!sb) throw new Error('Synchronisation non configurée')
  const address = email.trim()
  if (!isPlausibleEmail(address)) throw new Error('Adresse e-mail invalide.')
  // Le lien éventuel du même e-mail revient toujours sur notre propre origine (liste blanche « Redirect URLs » de Supabase).
  const { error } = await withTimeout(sb.auth.signInWithOtp({ email: address, options: { shouldCreateUser: true, emailRedirectTo: location.origin + '/' } }))
  if (error) throw sendError(error)
}

/** Erreurs d'envoi de code les plus courantes, en français (Supabase les renvoie en anglais). */
function sendError(e: { message?: string; code?: string; status?: number }): Error {
  const low = `${e.message ?? ''} ${e.code ?? ''}`.toLowerCase()
  if (e.status === 429 || /rate.?limit|too many|seconds/.test(low)) return new Error('Trop de demandes. Patientez une minute ou deux avant de redemander un code.')
  if (/invalid.*email|email.*invalid|unable to validate email/.test(low)) return new Error('Adresse e-mail refusée. Vérifiez-la.')
  if (/signups? not allowed|not allowed/.test(low)) return new Error('Les nouveaux comptes sont fermés pour le moment.')
  return e instanceof Error ? e : new Error(e.message || 'Le code n’a pas pu être envoyé. Réessayez.')
}

const CODE_WRONG = 'Code incorrect ou expiré. Vérifiez-le, ou demandez-en un nouveau.'

/** Vérifie le code reçu par e-mail et ouvre la session sur cet appareil (elle reste ouverte : jeton renouvelé tout seul). */
export async function verifyLoginCode(email: string, code: string): Promise<User> {
  const sb = supabase()
  if (!sb) throw new Error('Synchronisation non configurée')
  const address = email.trim()
  if (!isPlausibleEmail(address)) throw new Error('Adresse e-mail invalide.')
  const token = code.replace(/[\s-]/g, '')
  if (!/^\d{6,10}$/.test(token)) throw new Error('Le code est fait de chiffres seulement (6 à 10).')
  const { data, error } = await withTimeout(sb.auth.verifyOtp({ email: address, token, type: 'email' }))
  if (error) {
    const low = `${error.message ?? ''} ${(error as { code?: string }).code ?? ''}`.toLowerCase()
    if (/expired|invalid|otp/.test(low)) throw new Error(CODE_WRONG)
    throw error
  }
  if (!data.session || !data.user) throw new Error(CODE_WRONG)
  return data.user
}

export async function signOut() {
  const sb = supabase()
  if (!sb) return
  await withTimeout(sb.auth.signOut())
}

/**
 * Déconnexion LOCALE : efface le jeton stocké par supabase-js sur cet appareil, sans réseau
 * (donc utilisable même hors ligne, par exemple pour « Effacer toutes mes données »).
 */
export async function signOutLocal() {
  const sb = supabase()
  if (sb) {
    try {
      await withTimeout(sb.auth.signOut({ scope: 'local' }), 5_000)
    } catch {
      /* hors ligne : on supprime quand même les jetons ci-dessous */
    }
  }
  try {
    const keys: string[] = []
    for (let i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i) ?? '')
    for (const k of keys) if (/^sb-.*-auth-token/.test(k) || k.startsWith('permajardin:last-synced:')) localStorage.removeItem(k)
  } catch {
    /* stockage indisponible */
  }
}

// ---------- Instantané ----------

/** Les données en ligne ont été modifiées (par un autre appareil) depuis notre dernière synchro. */
export class SyncConflictError extends Error {
  readonly remoteUpdatedAt: string
  constructor(remoteUpdatedAt: string) {
    const d = new Date(remoteUpdatedAt)
    const when = Number.isFinite(d.getTime()) ? ` (${d.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })})` : ''
    super(`Les données en ligne ont été modifiées plus récemment${when} depuis un autre appareil. Récupérez-les, ou écrasez-les par celles de cet appareil.`)
    this.name = 'SyncConflictError'
    this.remoteUpdatedAt = remoteUpdatedAt
  }
}

function readLastSynced(userId: string): string | null {
  try {
    return localStorage.getItem(lastSyncKey(userId))
  } catch {
    return null
  }
}

function writeLastSynced(userId: string, at: string | undefined) {
  if (!at) return
  try {
    localStorage.setItem(lastSyncKey(userId), at)
  } catch {
    /* stockage indisponible : la prochaine synchro demandera confirmation */
  }
}

interface DbError {
  code?: string
  message?: string
}

function dbFailure(e: DbError): Error {
  if (e.code === '23514') return new Error('Vos données dépassent la taille maximale de synchronisation (5 Mo).')
  if (e.code === '42501') return new Error('Accès refusé. Reconnectez-vous puis réessayez.')
  return new Error(e.message || 'La synchronisation a échoué.')
}

async function remoteDate(sb: SupabaseClient, userId: string): Promise<string | null> {
  const { data, error } = await withTimeout(sb.from(TABLE).select('updated_at').eq('user_id', userId).maybeSingle())
  if (error) throw dbFailure(error)
  return (data as { updated_at?: string } | null)?.updated_at ?? null
}

async function requireUser() {
  const sb = supabase()
  if (!sb) throw new Error('Synchronisation non configurée')
  const user = await currentUser()
  if (!user) throw new Error('Connectez-vous d’abord')
  return { sb, user }
}

/**
 * Envoie l'état local (jardins, plantes, tâches faites ; les photos restent sur l'appareil).
 * Sans `force`, refuse d'écraser des données en ligne plus récentes que notre dernière synchro :
 * lève `SyncConflictError` (l'interface propose alors « Récupérer » ou « Écraser » = `pushSnapshot({ force: true })`).
 */
export async function pushSnapshot(opts: { force?: boolean } = {}) {
  const { sb, user } = await requireUser()
  if (getStorageStatus().readFailed) {
    throw new Error('Les données de cet appareil n’ont pas pu être lues : la synchronisation est suspendue pour ne pas écraser votre sauvegarde en ligne.')
  }
  const { gardens, plants, tasksDone } = getState()
  const data = serializeState({ gardens, plants, tasksDone })
  if (jsonBytes(data) > MAX_JSON_BYTES) throw new Error('Vos données dépassent la taille maximale de synchronisation (5 Mo).')

  // `updated_at` n'est jamais envoyé : le trigger SQL le fixe à now() (horloge du serveur).
  const table = () => sb.from(TABLE)
  let result: { data: { updated_at?: string }[] | null; error: DbError | null }
  if (opts.force) {
    result = await withTimeout(table().upsert({ user_id: user.id, data }).select('updated_at'))
  } else {
    const remote = await remoteDate(sb, user.id)
    if (remote === null) {
      result = await withTimeout(table().insert({ user_id: user.id, data }).select('updated_at'))
      if (result.error?.code === '23505') throw new SyncConflictError((await remoteDate(sb, user.id)) ?? new Date().toISOString())
    } else {
      const last = readLastSynced(user.id)
      if (last === null || !(Date.parse(remote) <= Date.parse(last))) throw new SyncConflictError(remote)
      // Mise à jour conditionnelle : si un autre appareil a écrit entre-temps, aucune ligne ne correspond.
      result = await withTimeout(table().update({ data }).eq('user_id', user.id).eq('updated_at', remote).select('updated_at'))
      if (!result.error && (result.data?.length ?? 0) === 0) throw new SyncConflictError((await remoteDate(sb, user.id)) ?? remote)
    }
  }
  if (result.error) throw dbFailure(result.error)
  writeLastSynced(user.id, result.data?.[0]?.updated_at)
}

/**
 * Où en est la copie en ligne par rapport à cet appareil : connecté ?, date de la copie en ligne, date de notre dernière synchro.
 * Un seul petit appel réseau (la date). Sert à la synchronisation automatique pour décider : envoyer, reprendre ou signaler un conflit.
 */
export async function syncStatus(): Promise<{ signedIn: boolean; remote: string | null; last: string | null }> {
  const sb = supabase()
  if (!sb) return { signedIn: false, remote: null, last: null }
  const user = await currentUser()
  if (!user) return { signedIn: false, remote: null, last: null }
  return { signedIn: true, remote: await remoteDate(sb, user.id), last: readLastSynced(user.id) }
}

/**
 * Droit à l'effacement : supprime l'instantané en ligne de l'utilisateur connecté (jardins, plantes, adresse, position).
 * L'adresse e-mail du compte reste chez Supabase : `deleteMyAccount()` la supprime aussi.
 */
export async function deleteRemoteSnapshot(): Promise<void> {
  const { sb, user } = await requireUser()
  const { error } = await withTimeout(sb.from(TABLE).delete().eq('user_id', user.id))
  if (error) throw dbFailure(error)
  try {
    localStorage.removeItem(lastSyncKey(user.id))
  } catch {
    /* stockage indisponible */
  }
}

/**
 * Supprime le compte (adresse e-mail) ET l'instantané, puis déconnecte cet appareil.
 * Appelle la fonction SQL `delete_my_account()` (migration 20261019000000) : elle ne peut effacer que le compte de l'appelant.
 */
export async function deleteMyAccount(): Promise<void> {
  const { sb } = await requireUser()
  const { error } = await withTimeout(sb.rpc('delete_my_account'))
  if (error) throw dbFailure(error)
  await signOutLocal()
}

/** Remplace les données locales par l'instantané en ligne. `false` s'il n'y en a pas. Refuse un instantané invalide. */
export async function pullSnapshot(): Promise<boolean> {
  const { sb, user } = await requireUser()
  const { data, error } = await withTimeout(sb.from(TABLE).select('data, updated_at').eq('user_id', user.id).maybeSingle())
  if (error) throw dbFailure(error)
  if (!data) return false
  const row = data as { data: unknown; updated_at?: string }
  const migrated = migrateState(row.data)
  if (!migrated.ok) throw new Error(`La sauvegarde en ligne est inutilisable (${migrated.error.replace(/\.$/, '')}). Vos données locales n’ont pas été modifiées.`)
  if (migrated.warnings.length) console.warn('Synchro : données corrigées', migrated.warnings)
  replaceData(migrated.data)
  writeLastSynced(user.id, row.updated_at)
  return true
}

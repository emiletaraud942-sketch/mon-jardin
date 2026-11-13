import type { SupabaseClient } from '@supabase/supabase-js'
import type { Garden } from '../../types'
import { currentUser, supabase } from '../sync'
import { remoteGardenData, type PushResult, type PushRow, type RemoteRow } from './model'

// Jardins partagés : les appels au serveur. Rien ici ne décide quoi envoyer (c'est `model.ts`) ; tout est borné dans le temps.

const TIMEOUT_MS = 20_000
const PAGE = 1000

export interface Member {
  userId: string
  role: 'admin' | 'member'
  displayName: string
  joinedAt: string
  me: boolean
}

export class SharedError extends Error {
  constructor(message: string, readonly code?: string) {
    super(message)
    this.name = 'SharedError'
  }
}

function withTimeout<T>(p: PromiseLike<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const limit = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new SharedError('Le service met trop de temps à répondre. Réessayez dans un instant.')), TIMEOUT_MS)
  })
  return Promise.race([Promise.resolve(p), limit]).finally(() => clearTimeout(timer))
}

/** Message clair pour l'utilisateur : les textes écrits par la base sont déjà en français, le reste est remplacé. */
export function sharedErrorText(e: { code?: string; message?: string } | null | undefined): string {
  const m = e?.message ?? ''
  switch (e?.code) {
    case 'P0002':
      return 'Ce code est invalide ou périmé. Demandez-en un nouveau à la personne qui vous invite.'
    case '42501':
      return /Réservé/.test(m) ? m : 'Vous n’avez pas le droit de faire cela dans ce jardin.'
    case '28000':
      return 'Connectez-vous d’abord (Réglages > Retrouver mes jardins…).'
    case '23514':
    case '22023':
      return m || 'Cette demande dépasse une limite du jardin partagé.'
    default:
      return 'Le jardin partagé n’a pas pu être joint. Réessayez dans un instant.'
  }
}

function client(): SupabaseClient {
  const sb = supabase()
  if (!sb) throw new SharedError('La copie en ligne n’est pas disponible sur cette version de l’appli.')
  return sb
}

async function me(): Promise<string> {
  const u = await currentUser()
  if (!u) throw new SharedError('Connectez-vous d’abord (Réglages > Retrouver mes jardins…).', '28000')
  return u.id
}

function fail(e: { code?: string; message?: string }): never {
  throw new SharedError(sharedErrorText(e), e.code)
}

export async function createSharedGarden(garden: Garden, displayName: string): Promise<string> {
  const sb = client()
  await me()
  const { data, error } = await withTimeout(sb.rpc('create_shared_garden', { p_name: garden.name.slice(0, 60), p_garden: remoteGardenData(garden), p_display_name: displayName }))
  if (error) fail(error)
  return String(data)
}

export async function createInvite(gardenId: string): Promise<string> {
  const { data, error } = await withTimeout(client().rpc('create_shared_invite', { p_garden_id: gardenId }))
  if (error) fail(error)
  return String(data)
}

export async function joinSharedGarden(code: string, displayName: string): Promise<string> {
  await me()
  const { data, error } = await withTimeout(client().rpc('join_shared_garden', { p_code: code, p_display_name: displayName }))
  if (error) fail(error)
  return String(data)
}

export async function leaveSharedGarden(gardenId: string): Promise<void> {
  const { error } = await withTimeout(client().rpc('leave_shared_garden', { p_garden_id: gardenId }))
  if (error) fail(error)
}

export async function removeMember(gardenId: string, userId: string): Promise<void> {
  const { error } = await withTimeout(client().rpc('remove_shared_member', { p_garden_id: gardenId, p_user_id: userId }))
  if (error) fail(error)
}

export async function setMemberRole(gardenId: string, userId: string, role: 'admin' | 'member'): Promise<void> {
  const { error } = await withTimeout(client().rpc('set_shared_role', { p_garden_id: gardenId, p_user_id: userId, p_role: role }))
  if (error) fail(error)
}

export async function renameMe(gardenId: string, displayName: string): Promise<void> {
  const { error } = await withTimeout(client().rpc('rename_me_in_shared_garden', { p_garden_id: gardenId, p_display_name: displayName }))
  if (error) fail(error)
}

export async function deleteSharedGarden(gardenId: string): Promise<void> {
  const { error } = await withTimeout(client().rpc('delete_shared_garden', { p_garden_id: gardenId }))
  if (error) fail(error)
}

export async function listMembers(gardenId: string): Promise<Member[]> {
  const sb = client()
  const mine = await me()
  const { data, error } = await withTimeout(sb.from('shared_garden_members').select('user_id, role, display_name, joined_at').eq('garden_id', gardenId).order('joined_at'))
  if (error) fail(error)
  return (data ?? []).map((r) => ({ userId: String(r.user_id), role: r.role === 'admin' ? 'admin' : 'member', displayName: String(r.display_name), joinedAt: String(r.joined_at), me: r.user_id === mine }))
}

export interface RemoteGarden {
  name: string
  garden: Record<string, unknown>
  updated_at: string
}

/** La fiche du jardin en ligne ; `null` si on n'en est plus membre (ou si le jardin n'existe plus). */
export async function fetchGarden(gardenId: string): Promise<RemoteGarden | null> {
  const { data, error } = await withTimeout(client().from('shared_gardens').select('name, garden, updated_at').eq('id', gardenId).maybeSingle())
  if (error) fail(error)
  return data ? { name: String(data.name), garden: data.garden as Record<string, unknown>, updated_at: String(data.updated_at) } : null
}

/** Mon rôle dans ce jardin ; `null` si je n'en suis pas membre. */
export async function fetchMyRole(gardenId: string): Promise<'admin' | 'member' | null> {
  const mine = await me()
  const { data, error } = await withTimeout(client().from('shared_garden_members').select('role').eq('garden_id', gardenId).eq('user_id', mine).maybeSingle())
  if (error) fail(error)
  return data ? (data.role === 'admin' ? 'admin' : 'member') : null
}

/** Les plantes modifiées depuis `since` (comprise : une même heure peut avoir été coupée entre deux pages), par pages de 1 000. */
export async function pullPlants(gardenId: string, since?: string): Promise<RemoteRow[]> {
  const sb = client()
  const out = new Map<string, RemoteRow>()
  let from = since
  for (let guard = 0; guard < 20; guard++) {
    let q = sb.from('shared_plants').select('id, data, deleted, updated_at').eq('garden_id', gardenId).order('updated_at', { ascending: true }).limit(PAGE)
    if (from) q = q.gte('updated_at', from)
    const { data, error } = await withTimeout(q)
    if (error) fail(error)
    const rows = (data ?? []) as { id: string; data: Record<string, unknown>; deleted: boolean; updated_at: string }[]
    for (const r of rows) out.set(r.id, { id: String(r.id), data: r.data && typeof r.data === 'object' ? r.data : {}, deleted: !!r.deleted, updated_at: String(r.updated_at) })
    if (rows.length < PAGE) break
    const last = rows[rows.length - 1].updated_at
    if (last === from) break
    from = last
  }
  return [...out.values()]
}

/** Envoie des plantes, 100 à la fois. Une ligne refusée parce que quelqu'un l'a modifiée entre-temps est rendue dans `conflicts`. */
export async function pushPlants(gardenId: string, rows: PushRow[]): Promise<PushResult> {
  const sb = client()
  const res: PushResult = { ok: [], conflicts: [] }
  for (let i = 0; i < rows.length; i += 100) {
    const chunk = rows.slice(i, i + 100)
    const { data, error } = await withTimeout(sb.rpc('push_shared_plants', { p_garden_id: gardenId, p_rows: chunk }))
    if (error) fail(error)
    const r = data as { ok?: { id: string; updated_at: string }[]; conflicts?: string[] } | null
    res.ok.push(...(r?.ok ?? []))
    res.conflicts.push(...(r?.conflicts ?? []))
  }
  return res
}

/** Met à jour la fiche du jardin en ligne (responsables seulement : la base refuse les autres). Rend la nouvelle heure. */
export async function pushGarden(gardenId: string, garden: Garden): Promise<string | undefined> {
  const { data, error } = await withTimeout(client().from('shared_gardens').update({ name: garden.name.slice(0, 60), garden: remoteGardenData(garden) }).eq('id', gardenId).select('updated_at'))
  if (error) fail(error)
  return data?.[0]?.updated_at ? String(data[0].updated_at) : undefined
}

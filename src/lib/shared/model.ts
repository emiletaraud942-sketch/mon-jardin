import type { Garden, Plant } from '../../types'

// Jardins partagés : la partie PURE (aucun réseau, aucun stockage). Elle décide quoi envoyer, quoi reprendre et quoi faire en cas de conflit.
// Une plante = une ligne en ligne. « Dernier envoi gagne » est refusé : chaque envoi porte l'heure de la version qu'on connaissait (`base`) ;
// si quelqu'un a modifié la plante entre-temps, c'est SA version qui est gardée et la personne en est prévenue.

/** Ce que cet appareil sait d'une plante en ligne : l'heure de sa dernière version connue (texte tel que reçu) et son empreinte locale à ce moment. */
export interface KnownPlant {
  base: string
  hash: string
  /** Version en ligne « supprimée » : on la garde pour pouvoir annuler une suppression (la plante revient avec la même identité). */
  deleted?: boolean
}

export interface SharedSyncState {
  /** Heure de la dernière ligne reçue (texte) : on redemande à partir d'ici. */
  since?: string
  known: Record<string, KnownPlant>
  /** Empreinte et heure de la fiche du jardin (nom, contour, bâtiments…) à la dernière synchro. */
  gardenHash?: string
  gardenBase?: string
}

export const emptySyncState = (): SharedSyncState => ({ known: {} })

export interface RemoteRow {
  id: string
  data: Record<string, unknown>
  deleted: boolean
  updated_at: string
}

export interface PushRow {
  id: string
  data: Record<string, unknown>
  deleted: boolean
  /** Absent : nouvelle plante. */
  base?: string
}

// ---------- Ce qui voyage, et ce qui reste sur l'appareil ----------

/**
 * Une plante telle qu'elle part en ligne. Restent sur l'appareil : les photos et leur journal (les images ne sont pas partagées), les
 * informations d'achat (lieu, prix : elles sont personnelles) et l'identifiant du jardin local.
 */
export function remotePlantData(p: Plant): Record<string, unknown> {
  const { gardenId: _g, photos: _p, photoMeta: _m, purchase: _a, ...rest } = p
  void _g
  void _p
  void _m
  void _a
  return rest as Record<string, unknown>
}

/** Le jardin tel qu'il part en ligne : sans le recalage de cet appareil, sans les photos des points de vue, sans le lien de partage lui-même. */
export function remoteGardenData(g: Garden): Record<string, unknown> {
  const { shared: _s, panoramas: _p, calibration: _c, ...rest } = g
  void _s
  void _p
  void _c
  return rest as Record<string, unknown>
}

/** JSON à clés triées : deux objets égaux ont la même empreinte, quel que soit l'ordre des champs. */
export function stableJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableJson).join(',')}]`
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>
    return `{${Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableJson(o[k])}`)
      .join(',')}}`
  }
  return JSON.stringify(v) ?? 'null'
}

export const plantHash = (p: Plant): string => stableJson(remotePlantData(p))
export const gardenHash = (g: Garden): string => stableJson(remoteGardenData(g))

/** Clé de tri d'une heure reçue du serveur (« 2026-11-13T20:53:47.37+00:00 ») : les fractions sont complétées à 6 chiffres. */
export function tsKey(s: string): string {
  return s.replace(/\.(\d+)/, (_m, f: string) => '.' + f.padEnd(6, '0').slice(0, 6))
}
export const laterTs = (a: string | undefined, b: string): string => (a === undefined || tsKey(b) > tsKey(a) ? b : a)

// ---------- Envoi ----------

/** Les lignes à envoyer : plantes nouvelles ou modifiées, plantes retirées (suppression douce), plantes remises après une suppression annulée. */
export function planPush(plants: Plant[], st: SharedSyncState): PushRow[] {
  const rows: PushRow[] = []
  const here = new Set<string>()
  for (const p of plants) {
    here.add(p.id)
    const k = st.known[p.id]
    const h = plantHash(p)
    if (!k) rows.push({ id: p.id, data: remotePlantData(p), deleted: false })
    else if (k.deleted) rows.push({ id: p.id, data: remotePlantData(p), deleted: false, base: k.base }) // suppression annulée
    else if (k.hash !== h) rows.push({ id: p.id, data: remotePlantData(p), deleted: false, base: k.base })
  }
  for (const [id, k] of Object.entries(st.known)) {
    if (!here.has(id) && !k.deleted) rows.push({ id, data: {}, deleted: true, base: k.base })
  }
  return rows
}

export interface PushResult {
  ok: { id: string; updated_at: string }[]
  conflicts: string[]
}

/** Après l'envoi : les lignes acceptées deviennent la nouvelle version connue ; les conflits sont rendus pour être repris tels qu'ils sont en ligne. */
export function applyPush(st: SharedSyncState, sent: PushRow[], res: PushResult, plants: Plant[]): SharedSyncState {
  const known = { ...st.known }
  for (const o of res.ok) {
    const row = sent.find((r) => r.id === o.id)
    if (!row) continue
    if (row.deleted) known[o.id] = { base: o.updated_at, hash: '', deleted: true }
    else {
      const p = plants.find((x) => x.id === o.id)
      known[o.id] = { base: o.updated_at, hash: p ? plantHash(p) : '' }
    }
  }
  return { ...st, known }
}

// ---------- Reprise ----------

export interface PullOutcome {
  /** Les plantes du jardin après reprise (les autres jardins ne sont pas touchés). */
  plants: Plant[]
  state: SharedSyncState
  /** Plantes que quelqu'un d'autre a modifiées en même temps que vous : sa version a été gardée. Noms pour le message. */
  conflicts: { id: string; name: string }[]
  changed: boolean
}

/**
 * Reprend les lignes reçues. `make(data, existing)` valide une plante en ligne (elle vient d'un autre appareil : jamais crue sur parole) et
 * rend la plante locale, ou `undefined` si elle est inutilisable. Les photos locales d'une plante sont gardées.
 */
export function planPull(
  plants: Plant[],
  rows: RemoteRow[],
  st: SharedSyncState,
  make: (id: string, data: Record<string, unknown>, existing?: Plant) => Plant | undefined,
  name: (p: Plant | undefined, data: Record<string, unknown>) => string,
): PullOutcome {
  const byId = new Map(plants.map((p) => [p.id, p]))
  const known = { ...st.known }
  const conflicts: { id: string; name: string }[] = []
  let since = st.since
  let changed = false
  const ordered = [...rows].sort((a, b) => (tsKey(a.updated_at) < tsKey(b.updated_at) ? -1 : tsKey(a.updated_at) > tsKey(b.updated_at) ? 1 : 0))
  for (const r of ordered) {
    since = laterTs(since, r.updated_at)
    const k = known[r.id]
    if (k && k.base === r.updated_at) continue // cette version, on la connaît déjà (c'est souvent la nôtre qui revient)
    const mine = byId.get(r.id)
    // Modification locale pas encore envoyée sur une plante déjà connue ? Alors quelqu'un d'autre est passé avant nous.
    const dirty = k && !k.deleted ? (mine ? plantHash(mine) !== k.hash : true) : false
    if (dirty) conflicts.push({ id: r.id, name: name(mine, r.data) })
    if (r.deleted) {
      if (mine) {
        byId.delete(r.id)
        changed = true
      }
      known[r.id] = { base: r.updated_at, hash: '', deleted: true }
      continue
    }
    const made = make(r.id, r.data, mine)
    if (!made) continue // illisible : on la laisse de côté, sans la remplacer
    byId.set(r.id, made)
    known[r.id] = { base: r.updated_at, hash: plantHash(made) }
    changed = true
  }
  return { plants: [...byId.values()], state: { ...st, since, known }, conflicts, changed }
}

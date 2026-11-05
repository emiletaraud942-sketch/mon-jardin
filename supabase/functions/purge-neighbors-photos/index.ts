// Fonction Edge Supabase (Deno) : purge quotidienne de l'entraide ET effacement des fichiers photo orphelins du bucket.
// Appelée par pg_cron + pg_net (supabase/neighbors/cron.sql, à activer par le propriétaire). Voir docs/ENTRAIDE.md.
//
// Pourquoi une fonction : la purge SQL supprime les annonces, mais un DELETE SQL sur storage.objects laisserait les fichiers.
// Seule l'API Storage les efface, avec la clé « service_role », qui ne doit exister QUE dans l'environnement de cette fonction.
//
// Sécurité :
// - En-tête x-purge-secret (secret partagé PURGE_SECRET, 16 caractères au moins) comparé sans fuite de temps. Déployée avec
//   --no-verify-jwt : la clé « anon » est publique, un contrôle de jeton ne protégerait rien.
// - Aucun secret dans ce fichier : SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont fournis par Supabase, PURGE_SECRET par `supabase secrets set`.
// - Seuls des chemins « <uuid>/<uuid>.jpg » du bucket « neighbors-photos » peuvent être effacés (jamais un autre bucket ni un autre nom).
// - Au plus 500 fichiers par appel (reprise le lendemain) ; journal = compteurs seulement (les chemins contiennent des identifiants).
//
// Fichier volontairement UNIQUE et sans dépendance. Les fonctions pures sont exportées pour les tests (src/lib/neighbors/purgePhotos.test.ts).

declare const Deno: { env: { get(name: string): string | undefined }; serve(handler: (req: Request) => Response | Promise<Response>): unknown } | undefined

export const BUCKET = 'neighbors-photos'
export const MAX_FILES_PER_RUN = 500
export const CHUNK = 100
const TIMEOUT_MS = 15_000

const PHOTO_PATH = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$/

/** Compare deux secrets sans révéler, par le temps de réponse, combien de caractères sont justes. */
export async function secretsMatch(given: string | null | undefined, expected: string | undefined): Promise<boolean> {
  if (!given || !expected || expected.length < 16) return false
  const enc = new TextEncoder()
  const [a, b] = await Promise.all([crypto.subtle.digest('SHA-256', enc.encode(given)), crypto.subtle.digest('SHA-256', enc.encode(expected))])
  const x = new Uint8Array(a)
  const y = new Uint8Array(b)
  let diff = 0
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i]
  return diff === 0
}

/** Ne garde que de vrais chemins de photos d'entraide (dédoublonnés, plafonnés). Le reste est compté, jamais effacé. */
export function selectPaths(raw: unknown, max = MAX_FILES_PER_RUN): { paths: string[]; ignored: number } {
  if (!Array.isArray(raw)) return { paths: [], ignored: 0 }
  const seen = new Set<string>()
  let ignored = 0
  for (const p of raw) {
    if (typeof p === 'string' && PHOTO_PATH.test(p)) seen.add(p)
    else ignored++
  }
  return { paths: [...seen].slice(0, max), ignored }
}

export const chunks = <T>(list: T[], size = CHUNK): T[][] => {
  const out: T[][] = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

export interface Env {
  SUPABASE_URL?: string
  SUPABASE_SERVICE_ROLE_KEY?: string
  PURGE_SECRET?: string
}
export interface Deps {
  fetch: typeof fetch
}

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })

export async function handle(req: Request, env: Env, deps: Deps): Promise<Response> {
  if (req.method !== 'POST') return json(405, { error: 'méthode' })
  if (!(await secretsMatch(req.headers.get('x-purge-secret'), env.PURGE_SECRET))) return json(401, { error: 'refusé' })
  const base = env.SUPABASE_URL?.replace(/\/+$/, '')
  const key = env.SUPABASE_SERVICE_ROLE_KEY
  if (!base || !key || !/^https:\/\//.test(base)) return json(500, { error: 'configuration' })

  const auth = { apikey: key, Authorization: `Bearer ${key}` }
  const rpc = (name: string) =>
    deps.fetch(`${base}/rest/v1/rpc/${name}`, { method: 'POST', headers: { ...auth, 'content-type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(TIMEOUT_MS) })

  try {
    // 1. Purge SQL (idempotente) : les annonces expirées disparaissent, leurs photos deviennent orphelines.
    const purged = await rpc('neighbors_purge_expired')
    if (!purged.ok) return json(502, { error: 'purge' })
    // 2. Fichiers qu'aucune annonce ne référence depuis plus d'un jour.
    const listed = await rpc('neighbors_orphan_photos')
    if (!listed.ok) return json(502, { error: 'liste' })
    const { paths, ignored } = selectPaths(await listed.json())

    // 3. Effacement par l'API Storage (le SDK fait exactement cet appel : DELETE /object/<bucket> {prefixes}).
    let removed = 0
    for (const part of chunks(paths)) {
      const res = await deps.fetch(`${base}/storage/v1/object/${BUCKET}`, {
        method: 'DELETE',
        headers: { ...auth, 'content-type': 'application/json' },
        body: JSON.stringify({ prefixes: part }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
      if (!res.ok) {
        console.log(JSON.stringify({ removed, failed_chunk: true }))
        return json(502, { error: 'stockage', removed })
      }
      const done = (await res.json().catch(() => [])) as unknown
      removed += Array.isArray(done) ? done.length : 0
    }
    const summary = { removed, listed: paths.length, ignored, capped: paths.length >= MAX_FILES_PER_RUN }
    console.log(JSON.stringify(summary))
    return json(200, summary)
  } catch {
    // Pas de détail (une erreur réseau peut contenir l'adresse du projet).
    return json(502, { error: 'réseau' })
  }
}

// Sous Deno : démarre le serveur. Sous Node (tests) : rien ne se lance.
if (typeof Deno !== 'undefined') {
  const d = Deno
  d.serve((req) =>
    handle(
      req,
      { SUPABASE_URL: d.env.get('SUPABASE_URL'), SUPABASE_SERVICE_ROLE_KEY: d.env.get('SUPABASE_SERVICE_ROLE_KEY'), PURGE_SECRET: d.env.get('PURGE_SECRET') },
      { fetch },
    ),
  )
}

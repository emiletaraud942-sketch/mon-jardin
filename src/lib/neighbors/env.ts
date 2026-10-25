// Configuration publique de l'entraide (URL du projet Supabase dédié + clé « anon / publishable », publiques par conception).
// Noms acceptés, du préféré au plus ancien. Les deux premiers n'ont pas le préfixe VITE_ (vite.config.ts : envPrefix) et
// aucun mot « KEY » / « TOKEN » / « SECRET », que Vercel refuse ou signale dans un nom de variable.
const e = import.meta.env

export const neighborsUrl: string | undefined = e.NEIGHBORS_SUPABASE_URL || e.VITE_NEIGHBORS_SUPABASE_URL || undefined
export const neighborsKey: string | undefined =
  e.NEIGHBORS_SUPABASE_PUBLISHABLE || e.VITE_NEIGHBORS_SUPABASE_PUBLIC_TOKEN || e.VITE_NEIGHBORS_SUPABASE_ANON_KEY || undefined

/**
 * Clé publique VAPID des alertes (publique par conception, comme l'URL Supabase). La clé privée vit seulement dans l'environnement de la
 * fonction notify-message. Une valeur mal formée est ignorée : les alertes restent masquées et le reste marche.
 */
export const neighborsVapidPublic: string | undefined = isVapidPublicKey(e.NEIGHBORS_VAPID_PUBLIC) ? e.NEIGHBORS_VAPID_PUBLIC : undefined

/** Une clé publique VAPID : 65 octets en base64url (87 caractères), le premier octet vaut 4 (point non compressé). */
export function isVapidPublicKey(v: unknown): v is string {
  if (typeof v !== 'string' || !/^[A-Za-z0-9_-]{87}$/.test(v)) return false
  try {
    const bin = atob(v.replace(/-/g, '+').replace(/_/g, '/') + '=')
    return bin.length === 65 && bin.charCodeAt(0) === 4
  } catch {
    return false
  }
}

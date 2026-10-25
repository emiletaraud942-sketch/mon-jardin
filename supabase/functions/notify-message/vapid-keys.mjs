// Génère une paire de clés VAPID (courbe P-256), sans aucune dépendance : `node supabase/functions/notify-message/vapid-keys.mjs`
// Même format que `npx web-push generate-vapid-keys`. La clé PUBLIQUE va dans NEIGHBORS_VAPID_PUBLIC (Vercel) et dans
// VAPID_PUBLIC_KEY (secret de la fonction). La clé PRIVÉE ne va QUE dans le secret VAPID_PRIVATE_KEY de la fonction.
// Ne jamais la coller dans le dépôt, un message ou un fichier .env versionné. Le script n'écrit aucun fichier.
import { generateKeyPairSync, randomBytes } from 'node:crypto'

const b64url = (buf) => Buffer.from(buf).toString('base64url')
const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
const jwk = privateKey.export({ format: 'jwk' })
const publicKey = b64url(Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x, 'base64url'), Buffer.from(jwk.y, 'base64url')]))

console.log('VAPID_PUBLIC_KEY=' + publicKey)
console.log('VAPID_PRIVATE_KEY=' + jwk.d)
console.log('NOTIFY_WEBHOOK_SECRET=' + b64url(randomBytes(32)))
console.log('')
console.log('La clé publique (aussi pour NEIGHBORS_VAPID_PUBLIC sur Vercel) peut être montrée. Les deux autres valeurs sont secrètes.')

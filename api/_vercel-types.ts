// Types minimaux d'une requête et d'une réponse de fonction Vercel (Node). Remplacent « import type … from '@vercel/node' » :
// ce paquet n'était utilisé que pour ces deux types et apportait ses propres dépendances d'outillage vulnérables (tar, undici…).
// Le préfixe « _ » empêche Vercel d'en faire une fonction. Import de types seulement : rien n'est chargé à l'exécution.
import type { IncomingMessage, ServerResponse } from 'node:http'

export interface VercelRequest extends IncomingMessage {
  /** Corps déjà lu par Vercel (JSON analysé, texte ou tampon). Propriété paresseuse : un JSON invalide LÈVE à la lecture. */
  body?: unknown
}

export interface VercelResponse extends ServerResponse {
  status(code: number): VercelResponse
  json(body: unknown): VercelResponse
}

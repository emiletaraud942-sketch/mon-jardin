// « Faire connaître l'appli » : texte d'invitation neutre et lien du site. Logique pure, testée sans navigateur.
// Rien n'est envoyé par l'appli : l'utilisateur choisit lui-même la personne et le message dans sa messagerie.
// Aucune donnée personnelle : ni pseudo, ni adresse, ni quartier, ni jardin.

export const INVITE_TITLE = 'PermaJardin'
export const INVITE_TEXT = 'Je prépare mon jardin avec PermaJardin. C’est gratuit, en français, et on peut l’essayer sans compte.'

/** Lien de l'appli : l'adresse du site seulement (pas de chemin, pas de paramètre). Vide si l'adresse n'est pas web. */
export function inviteUrl(origin: string | undefined | null): string {
  try {
    const u = new URL(origin ?? '')
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return ''
    return `${u.origin}/`
  } catch {
    return ''
  }
}

export interface InvitePayload {
  title: string
  text: string
  url: string
}
export const invitePayload = (origin: string | undefined | null): InvitePayload => ({ title: INVITE_TITLE, text: INVITE_TEXT, url: inviteUrl(origin) })

/** Texte copié quand le partage du téléphone n'existe pas : le message et le lien. */
export const inviteCopyText = (origin: string | undefined | null): string => {
  const url = inviteUrl(origin)
  return url ? `${INVITE_TEXT} ${url}` : INVITE_TEXT
}

/**
 * shared : la feuille de partage s'est ouverte et l'envoi a été fait.
 * cancelled : la personne a fermé la feuille de partage (rien à dire).
 * copied : le lien est dans le presse-papiers.
 * manual : ni partage ni copie possibles ; on montre le lien à copier à la main.
 */
export type InviteResult = 'shared' | 'cancelled' | 'copied' | 'manual'

export interface InviteEnv {
  origin: string
  share?: (data: InvitePayload) => Promise<void>
  writeText?: (text: string) => Promise<void>
}

export async function runInvite(env: InviteEnv): Promise<InviteResult> {
  if (env.share) {
    try {
      await env.share(invitePayload(env.origin))
      return 'shared'
    } catch (e) {
      if ((e as { name?: string } | null)?.name === 'AbortError') return 'cancelled'
      // Partage refusé ou impossible : on essaie la copie.
    }
  }
  if (env.writeText) {
    try {
      await env.writeText(inviteCopyText(env.origin))
      return 'copied'
    } catch {
      /* presse-papiers refusé */
    }
  }
  return 'manual'
}

/** Environnement réel du navigateur (vide hors navigateur). */
export function browserInviteEnv(): InviteEnv {
  const nav = typeof navigator === 'undefined' ? undefined : navigator
  const share = nav && typeof nav.share === 'function' ? (d: InvitePayload) => nav.share(d) : undefined
  const writeText = nav?.clipboard && typeof nav.clipboard.writeText === 'function' ? (t: string) => nav.clipboard.writeText(t) : undefined
  return { origin: typeof location === 'undefined' ? '' : location.origin, share, writeText }
}

export const canShareInvite = (): boolean => !!browserInviteEnv().share

/** Phrase de confirmation, selon le résultat. Vide si la personne a annulé. */
export function inviteMessage(r: InviteResult): string {
  if (r === 'shared') return 'Merci ! Votre invitation est partie.'
  if (r === 'copied') return 'Lien copié. Collez-le dans un message pour votre voisin.'
  if (r === 'manual') return 'Copiez ce lien, puis collez-le dans un message.'
  return ''
}

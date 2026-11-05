// Partager ou copier un texte (liste de courses…). Rien n'est envoyé par l'appli : l'utilisateur choisit où il va.

export type ShareResult = 'shared' | 'cancelled' | 'copied' | 'manual'

export interface ShareEnv {
  share?: (data: { title?: string; text: string }) => Promise<void>
  writeText?: (text: string) => Promise<void>
}

export function browserShareEnv(): ShareEnv {
  const nav = typeof navigator === 'undefined' ? undefined : navigator
  return {
    share: nav && typeof nav.share === 'function' ? (d) => nav.share(d) : undefined,
    writeText: nav?.clipboard && typeof nav.clipboard.writeText === 'function' ? (t) => nav.clipboard.writeText(t) : undefined,
  }
}

export const canShareText = (env: ShareEnv = browserShareEnv()) => typeof env.share === 'function'

/** Partage du téléphone d'abord, sinon copie ; en dernier recours « manual » (on montre le texte à copier à la main). */
export async function shareOrCopy(text: string, title: string, env: ShareEnv = browserShareEnv()): Promise<ShareResult> {
  if (env.share) {
    try {
      await env.share({ title, text })
      return 'shared'
    } catch (e) {
      if ((e as { name?: string })?.name === 'AbortError') return 'cancelled'
      // Le partage a échoué autrement : on essaie la copie.
    }
  }
  if (env.writeText) {
    try {
      await env.writeText(text)
      return 'copied'
    } catch {
      /* copie refusée */
    }
  }
  return 'manual'
}

export async function copyText(text: string, env: ShareEnv = browserShareEnv()): Promise<'copied' | 'manual'> {
  if (env.writeText) {
    try {
      await env.writeText(text)
      return 'copied'
    } catch {
      /* copie refusée */
    }
  }
  return 'manual'
}

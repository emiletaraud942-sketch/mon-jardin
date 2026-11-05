// Diagnostic local : les 20 dernières erreurs gardées en mémoire (jamais écrites, jamais envoyées).
// L'utilisateur peut exporter un fichier pour l'envoyer lui-même s'il demande de l'aide.
// Le texte est nettoyé : adresses web sans paramètres, e-mails, coordonnées et identifiants longs retirés.

export const RING_SIZE = 20

export type ErrorKind = 'erreur' | 'promesse' | 'ecran' | 'morceau'

export interface ErrorEntry {
  /** Heure de l'erreur (ISO). */
  at: string
  kind: ErrorKind
  message: string
  /** Quelques lignes de la pile d'appels, sans adresse de serveur. */
  stack?: string
}

const ring: ErrorEntry[] = []

/** Retire ce qui pourrait identifier quelqu'un : e-mails, adresses web, coordonnées, longs identifiants. */
export function scrub(text: string, max = 240): string {
  return text
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[e-mail]')
    .replace(/https?:\/\/[^\s)'"]+/g, (u) => {
      try {
        return new URL(u).pathname.replace(/^\/+/, '/')
      } catch {
        return '[adresse]'
      }
    })
    .replace(/-?\d{1,3}\.\d{4,}/g, '[nombre]')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f-]{4,}\b/gi, '[id]')
    .replace(/\b(?:photo|garden|plant|jardin):[\w-]{6,}\b/gi, '[id]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
}

function stackOf(e: unknown): string | undefined {
  const s = e instanceof Error ? e.stack : undefined
  if (!s) return undefined
  return s
    .split('\n')
    .slice(1, 4)
    .map((l) => scrub(l, 120))
    .join(' | ')
}

function messageOf(e: unknown): string {
  if (e instanceof Error) return `${e.name}: ${e.message}`
  if (typeof e === 'string') return e
  try {
    return JSON.stringify(e) ?? String(e)
  } catch {
    return String(e)
  }
}

export function recordError(kind: ErrorKind, e: unknown, at: Date = new Date()) {
  ring.push({ at: at.toISOString(), kind, message: scrub(messageOf(e)), stack: stackOf(e) })
  while (ring.length > RING_SIZE) ring.shift()
}

export const getErrors = (): readonly ErrorEntry[] => ring
export function clearErrors() {
  ring.length = 0
}

/** Branche les écouteurs globaux. Renvoie la fonction qui les retire. */
export function installDiagnostics(win: Pick<Window, 'addEventListener' | 'removeEventListener'> = window): () => void {
  const onError = (ev: Event) => {
    const e = ev as ErrorEvent
    // Les erreurs de chargement d'une image ou d'un script (ev.target) n'ont pas de message : on les ignore.
    if (!e.message && !e.error) return
    recordError('erreur', e.error ?? e.message)
  }
  const onRejection = (ev: Event) => recordError('promesse', (ev as PromiseRejectionEvent).reason)
  const onChunk = () => recordError('morceau', 'Chargement d’un morceau de code échoué (nouvelle version ?)')
  win.addEventListener('error', onError)
  win.addEventListener('unhandledrejection', onRejection)
  win.addEventListener('vite:preloadError', onChunk)
  return () => {
    win.removeEventListener('error', onError)
    win.removeEventListener('unhandledrejection', onRejection)
    win.removeEventListener('vite:preloadError', onChunk)
  }
}

export interface DiagnosticContext {
  now: Date
  userAgent: string
  language: string
  online: boolean
  viewport: { w: number; h: number }
  standalone: boolean
  stateVersion: number
  counts: { jardins: number; plantes: number; tachesFaites: number }
  storage?: { usedMo: number; quotaMo: number; persistent?: boolean }
  theme: string
  textSize: string
}

/** Contenu du fichier de diagnostic. Aucun nom, adresse, position, note ni photo. */
export function buildDiagnostic(ctx: DiagnosticContext, errors: readonly ErrorEntry[] = ring) {
  return {
    fichier: 'Diagnostic PermaJardin (local, rien n’a été envoyé)',
    date: ctx.now.toISOString(),
    appareil: { navigateur: scrub(ctx.userAgent, 200), langue: ctx.language, enLigne: ctx.online, ecran: ctx.viewport, appInstallee: ctx.standalone },
    reglages: { theme: ctx.theme, tailleTexte: ctx.textSize },
    donnees: { versionFormat: ctx.stateVersion, ...ctx.counts },
    stockage: ctx.storage,
    erreurs: errors.map((x) => ({ ...x })),
  }
}

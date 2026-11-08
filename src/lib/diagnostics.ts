// Diagnostic local : les 20 dernières erreurs gardées en mémoire et dans sessionStorage (clé `pj.errors`), jamais envoyées.
// La copie de session survit à un rechargement de la page (par exemple après « Recharger » d'une mise à jour) et disparaît à la fermeture de l'onglet.
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

const ERRORS_KEY = 'pj.errors'
const KINDS: readonly string[] = ['erreur', 'promesse', 'ecran', 'morceau']

/** Relit les erreurs de la session (valide chaque entrée ; stockage absent, bloqué ou abîmé = liste vide). */
function loadSaved(): ErrorEntry[] {
  try {
    const raw = sessionStorage.getItem(ERRORS_KEY)
    if (!raw) return []
    const data: unknown = JSON.parse(raw)
    if (!Array.isArray(data)) return []
    const out: ErrorEntry[] = []
    for (const x of data) {
      if (!x || typeof x !== 'object') continue
      const e = x as Record<string, unknown>
      if (typeof e.at !== 'string' || typeof e.message !== 'string' || typeof e.kind !== 'string' || !KINDS.includes(e.kind)) continue
      out.push({ at: scrub(e.at, 40), kind: e.kind as ErrorKind, message: scrub(e.message), stack: typeof e.stack === 'string' ? scrub(e.stack, 400) : undefined })
    }
    return out.slice(-RING_SIZE)
  } catch {
    return []
  }
}

const ring: ErrorEntry[] = loadSaved()

function persist() {
  try {
    if (ring.length === 0) sessionStorage.removeItem(ERRORS_KEY)
    else sessionStorage.setItem(ERRORS_KEY, JSON.stringify(ring))
  } catch {
    /* stockage plein ou bloqué : la liste reste en mémoire */
  }
}

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
  persist()
}

export const getErrors = (): readonly ErrorEntry[] => ring
export function clearErrors() {
  ring.length = 0
  persist()
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
  /** Version de l'appli (package.json) et commit du build. */
  appVersion: string
  appCommit: string
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
    donnees: { versionAppli: ctx.appVersion, commitAppli: ctx.appCommit, versionFormat: ctx.stateVersion, ...ctx.counts },
    stockage: ctx.storage,
    erreurs: errors.map((x) => ({ ...x })),
  }
}

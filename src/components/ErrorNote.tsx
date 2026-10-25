import { friendlyError, type FriendlyError } from '../lib/http'

/**
 * Message d'erreur pour l'écran : une phrase simple, puis « Détails » replié pour le texte technique
 * (utile si l'on demande de l'aide, inutile pour le reste).
 */
export function ErrorNote({ error, className = 'alert error small', role = 'alert' }: { error: unknown | FriendlyError; className?: string; role?: 'alert' | 'status' }) {
  const f: FriendlyError =
    error && typeof error === 'object' && 'message' in error && typeof (error as FriendlyError).message === 'string' && !(error instanceof Error)
      ? (error as FriendlyError)
      : friendlyError(error)
  return (
    <div className={className} role={role}>
      <span>{f.message}</span>
      {f.detail && <TechDetails detail={f.detail} />}
    </div>
  )
}

/** « Détails » replié : le texte technique d'une erreur. */
export function TechDetails({ detail }: { detail: string }) {
  return (
    <details className="tech-details">
      <summary>Détails</summary>
      <p className="small muted">{detail}</p>
    </details>
  )
}

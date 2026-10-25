import { Component, type ReactNode } from 'react'
import { exportCurrentState } from '../lib/backup'
import { getState } from '../lib/store'
import { TechDetails } from './ErrorNote'

/** Vrai si l'erreur vient d'un chargement de morceau de code échoué (hors ligne, nouvelle version déployée). */
export function isChunkLoadError(err: unknown): boolean {
  const e = err as { name?: string; message?: string } | null
  const text = `${e?.name ?? ''} ${e?.message ?? ''}`
  return /ChunkLoadError|Loading chunk|Loading CSS chunk|dynamically imported module|Importing a module script failed|Failed to fetch dynamically/i.test(text)
}

interface Props {
  children: ReactNode
  /** Quand cette valeur change (changement d'onglet…), l'erreur est effacée. */
  resetKey?: unknown
  /** Affichage compact (dans la zone de contenu) plutôt que plein écran. */
  inline?: boolean
}

/** Texte technique d'une erreur, pour le lien « Détails ». */
function describe(err: unknown): string {
  const e = err as { name?: string; message?: string } | null
  return [e?.name, e?.message].filter(Boolean).join(' : ') || String(err)
}

export class ErrorBoundary extends Component<Props, { error?: unknown }> {
  state: { error?: unknown } = {}

  static getDerivedStateFromError(error: unknown) {
    return { error: error ?? new Error('Erreur inconnue') }
  }

  componentDidCatch(err: unknown) {
    console.error('[ErrorBoundary]', err)
  }

  componentDidUpdate(prev: Props) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: undefined })
  }

  private exportData() {
    try {
      exportCurrentState('permajardin-secours', false)
    } catch (e) {
      console.error('Export impossible', e)
    }
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    const chunk = isChunkLoadError(error)
    const s = getState()
    const canExport = s.gardens.length > 0 || s.plants.length > 0
    return (
      <div className={this.props.inline ? 'empty error-screen' : 'hero error-screen'} role="alert">
        <div className="card" style={{ maxWidth: 480 }}>
          <h2>Cet écran ne s’affiche pas</h2>
          <p className="muted">
            {chunk
              ? 'L’appli n’a pas pu charger cet écran. Vérifiez votre connexion, puis rechargez. Vos données sont intactes.'
              : 'Un problème est survenu. Vos données sont intactes sur cet appareil.'}
          </p>
          <TechDetails detail={describe(error)} />
          <div className="row" style={{ justifyContent: 'center', marginTop: 8 }}>
            <button className="btn primary" onClick={() => location.reload()}>
              Recharger
            </button>
            {canExport && (
              <button className="btn" onClick={() => this.exportData()}>
                Faire une sauvegarde
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }
}

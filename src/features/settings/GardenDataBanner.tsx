import { useState } from 'react'
import type { Garden } from '../../types'
import { useBanner } from '../../lib/banners'
import { TechDetails } from '../../components/ErrorNote'
import { FAIL_HELP, missingSources, type Step } from './createGarden'
import { useRefreshGarden } from './useRefreshGarden'

const SHORT: Record<Step['id'], string> = { parcelle: 'plan du terrain', batiments: 'maisons voisines', relief: 'pente', climat: 'gel et pluie' }

/**
 * Bandeau persistant tant que le plan du terrain, la pente ou les maisons voisines manquent. Rien si tout est là.
 * `compact` (sur la carte) : une petite puce discrète (« Il manque : pente ») qui ne cache pas la carte ; un toucher l'ouvre pour « Réessayer ».
 * Elle passe par la file d'attente des bandeaux (jamais pendant un placement). Sinon (Réglages) : l'explication de chaque source.
 */
export function GardenDataBanner({ garden, compact }: { garden: Garden; compact?: boolean }) {
  const { steps, refresh, busy } = useRefreshGarden(garden)
  const missing = missingSources(garden)
  const [open, setOpen] = useState(false)
  const myTurn = useBanner('donnees', !!compact && (missing.length > 0 || busy))
  if (missing.length === 0 && !busy) return null
  if (compact && !myTurn) return null
  const noParcel = missing.includes('parcelle')
  const failedAgain = steps && !busy ? steps.filter((s) => s.state === 'echec') : []
  const others = missing.filter((m) => m !== 'parcelle')
  if (compact && !open && !busy && failedAgain.length === 0) {
    const names = [...(noParcel ? ['plan du terrain'] : []), ...others.map((m) => SHORT[m])]
    // Une puce tient sur une ligne : au-delà de deux manques, le détail est dans la puce ouverte.
    const what = names.length > 2 ? 'des informations' : names.join(', ')
    return (
      <button className="data-chip" aria-expanded={false} onClick={() => setOpen(true)}>
        <span aria-hidden>⚠</span> Il manque : {what}
      </button>
    )
  }
  return (
    <div className={'alert data-banner' + (compact ? ' compact' : '')} role="status">
      <div>
        <strong>{compact ? (noParcel ? 'Le plan du terrain manque.' : `Il manque : ${others.map((m) => SHORT[m]).join(', ')}.`) : noParcel ? 'Le plan de votre terrain manque : la carte est cadrée à peu près.' : 'Il manque quelques informations sur votre jardin.'}</strong>
        {compact ? (
          noParcel && others.length > 0 && <div className="small">Il manque aussi : {others.map((m) => SHORT[m]).join(', ')}.</div>
        ) : (
          <ul className="small" style={{ margin: '4px 0 0', paddingLeft: 18 }}>
            {missing.map((m) => (
              <li key={m}>{FAIL_HELP[m]}</li>
            ))}
          </ul>
        )}

        {failedAgain.length > 0 && (
          <div className="small">
            Nouvel essai sans succès. Vérifiez votre connexion.
            <TechDetails detail={failedAgain.map((s) => `${s.label} : ${s.detail || 'sans réponse'}`).join(' · ')} />
          </div>
        )}
      </div>
      <button className="btn small" onClick={refresh} disabled={busy}>
        {busy ? <span className="spinner" /> : null} Réessayer
      </button>
      {compact && !busy && (
        <button className="btn small ghost" aria-expanded onClick={() => setOpen(false)}>
          Réduire
        </button>
      )}
    </div>
  )
}

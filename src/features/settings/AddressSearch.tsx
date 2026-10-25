import { useEffect, useId, useRef, useState } from 'react'
import { ErrorNote } from '../../components/ErrorNote'
import { friendlyError, type FriendlyError } from '../../lib/http'
import { geocode, type GeocodeResult } from '../../lib/ign'

type Status = 'idle' | 'loading' | 'empty' | 'error'

/**
 * Recherche d'adresse. Le choix d'une suggestion ne relance pas de recherche ; retaper efface le choix
 * (`onClear`) ; une réponse arrivée trop tard est ignorée.
 */
export function AddressSearch({ onSelect, onClear, autoFocus }: { onSelect: (r: GeocodeResult) => void; onClear?: () => void; autoFocus?: boolean }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<GeocodeResult[]>([])
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState<FriendlyError>()
  /** Valeur choisie dans la liste : tant que le champ la contient, on ne cherche plus. */
  const chosen = useRef<string>()
  const listId = useId()

  useEffect(() => {
    const term = q.trim()
    if (term.length < 3 || term === chosen.current) {
      setResults([])
      setStatus('idle')
      return
    }
    const ctrl = new AbortController()
    setStatus('loading')
    const t = setTimeout(() => {
      geocode(term, { signal: ctrl.signal }).then(
        (r) => {
          if (ctrl.signal.aborted) return
          setResults(r)
          setError(undefined)
          setStatus(r.length ? 'idle' : 'empty')
        },
        (e) => {
          if (ctrl.signal.aborted || (e as Error).name === 'AbortError') return
          setResults([])
          setError(friendlyError(e))
          setStatus('error')
        },
      )
    }, 250)
    return () => {
      clearTimeout(t)
      ctrl.abort() // la recherche précédente est abandonnée : sa réponse tardive ne compte pas
    }
  }, [q])

  return (
    <div>
      <label className="field">
        <span>Votre adresse</span>
        <div className="input-wrap">
          <input
            className="input"
            type="text"
            inputMode="search"
            autoFocus={autoFocus}
            placeholder="ex. 12 rue des Lilas, Nantes"
            value={q}
            role="combobox"
            aria-expanded={results.length > 0}
            aria-controls={listId}
            aria-autocomplete="list"
            onChange={(e) => {
              if (chosen.current !== undefined) {
                chosen.current = undefined
                onClear?.() // le champ ne correspond plus à l'adresse choisie
              }
              setQ(e.target.value)
            }}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
          />
          {status === 'loading' && <span className="spinner input-spinner" role="status" aria-label="Recherche en cours" />}
        </div>
      </label>
      <div aria-live="polite">
        {status === 'error' && error && <ErrorNote error={error} className="alert error" />}
        {status === 'empty' && <p className="alert small" style={{ marginTop: 8 }}>Aucune adresse trouvée. Essayez avec le nom de la commune seul.</p>}
      </div>
      <ul className="suggestions" id={listId} role="listbox" aria-live="polite" aria-label="Adresses proposées : touchez la vôtre" hidden={results.length === 0}>
        {results.map((r) => (
          <li key={`${r.lon},${r.lat},${r.label}`} role="presentation">
            <button
              type="button"
              role="option"
              aria-selected={false}
              onClick={() => {
                chosen.current = r.label.trim()
                setQ(r.label)
                setResults([])
                setStatus('idle')
                onSelect(r)
              }}
            >
              {r.label}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

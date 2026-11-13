import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { Icon } from '../../components/Icon'
import { SPECIES } from '../../data/species'
import { addSeed, MAX_SEEDS, readSeeds, removeSeed, restoreSeeds, seedsShareText, subscribeSeeds, toggleGive } from '../../lib/seeds'
import { canShareText, copyText, shareOrCopy } from '../../lib/shareText'
import { showToast } from '../../lib/toast'

const MONTH_FORMAT = (at: string) => new Date(`${at}T00:00:00`).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })

/**
 * « Mes graines » : un petit stock de sachets (nom, date de récolte, à donner ou échanger), et un texte à partager.
 * Enregistré sur cet appareil seulement : ni envoyé, ni synchronisé, ni dans les sauvegardes (le texte de l'écran le dit).
 */
export function SeedsCard() {
  const seeds = useSyncExternalStore(subscribeSeeds, readSeeds, readSeeds)
  const [name, setName] = useState('')
  const [at, setAt] = useState('')
  const [give, setGive] = useState(false)
  const [manual, setManual] = useState(false)
  const field = useRef<HTMLTextAreaElement>(null)
  const names = useMemo(() => SPECIES.map((s) => s.nomCommun), [])
  const share = canShareText()
  const text = seedsShareText(seeds)
  useEffect(() => {
    if (manual) field.current?.select()
  }, [manual])

  function add() {
    const made = addSeed({ name, at: at || undefined, toGive: give })
    if (!made) {
      showToast({ message: name.trim() ? 'La liste est pleine : retirez un sachet avant d’en ajouter.' : 'Écrivez le nom du sachet.', tone: 'error' })
      return
    }
    setName('')
    setAt('')
    setGive(false)
  }
  function remove(id: string) {
    const before = removeSeed(id)
    showToast({ message: 'Sachet retiré.', actionLabel: 'Annuler', onAction: () => restoreSeeds(before) })
  }
  async function go() {
    const r = share ? await shareOrCopy(text, 'Mes graines') : await copyText(text)
    if (r === 'copied') showToast({ message: 'Liste copiée. Collez-la dans un message.' })
    if (r === 'manual') setManual(true)
  }

  return (
    <div className="card" data-feat="mes-graines">
      <h2>Mes graines</h2>
      <p className="small muted">Notez vos sachets, et ceux que vous voulez donner ou échanger. Cette liste reste sur cet appareil : elle n’est pas envoyée en ligne.</p>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault()
          add()
        }}
      >
        <label className="field">
          <span>Nom du sachet</span>
          <input className="input" list="seed-names" value={name} maxLength={40} placeholder="Tomate, haricot de ma grand-mère…" onChange={(e) => setName(e.target.value)} />
          <datalist id="seed-names">
            {names.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
        </label>
        <label className="field">
          <span>Date de récolte ou d’achat (facultatif)</span>
          <input className="input" type="date" value={at} onChange={(e) => setAt(e.target.value)} />
        </label>
        <label className="row" style={{ gap: 8, alignItems: 'center' }}>
          <input type="checkbox" checked={give} onChange={(e) => setGive(e.target.checked)} /> À donner ou échanger
        </label>
        <button type="submit" className="btn primary" disabled={!name.trim() || seeds.length >= MAX_SEEDS}>
          <Icon name="plus" /> Ajouter ce sachet
        </button>
      </form>
      {seeds.length === 0 ? (
        <p className="small muted" style={{ marginTop: 10 }}>Aucun sachet pour l’instant.</p>
      ) : (
        <>
          <ul className="list" style={{ marginTop: 10 }}>
            {seeds.map((s) => (
              <li key={s.id} className="row" style={{ justifyContent: 'space-between', gap: 8 }}>
                <span style={{ minWidth: 0 }}>
                  <strong>{s.name}</strong>
                  {s.at && <span className="small muted"> · {MONTH_FORMAT(s.at)}</span>}
                  {s.toGive && <span className="badge" style={{ marginLeft: 6 }}>À donner</span>}
                </span>
                <span className="row" style={{ gap: 4 }}>
                  <button type="button" className="btn small" aria-pressed={s.toGive} aria-label={`${s.toGive ? 'Ne plus donner' : 'À donner'} : ${s.name}`} onClick={() => toggleGive(s.id)}>
                    {s.toGive ? 'Garder' : 'À donner'}
                  </button>
                  <button type="button" className="btn small ghost" aria-label={`Retirer le sachet ${s.name}`} onClick={() => remove(s.id)}>
                    <Icon name="x" size={16} /> Retirer
                  </button>
                </span>
              </li>
            ))}
          </ul>
          <div className="row" style={{ marginTop: 8 }}>
            <button type="button" className="btn" data-feat="partager-graines" onClick={() => void go()}>
              <Icon name="users" /> {share ? 'Partager la liste' : 'Copier la liste'}
            </button>
          </div>
          {manual && <textarea ref={field} className="input" readOnly rows={6} value={text} aria-label="Liste de graines à copier" onFocus={(e) => e.currentTarget.select()} />}
        </>
      )}
    </div>
  )
}

import { useState } from 'react'
import { listSafetyCopies, restoreFromSafetyCopies, type SafetyCopySummary } from '../../lib/safetyRestore'
import { showToast } from '../../lib/toast'

/** Montre ce que contiennent les copies de sécurité de ce téléphone et remet ce qui manque (jamais d'effacement). */
export function SafetyRestore() {
  const [copies, setCopies] = useState<SafetyCopySummary[]>()
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  async function look() {
    setBusy(true)
    setMsg('')
    try {
      setCopies(await listSafetyCopies())
    } finally {
      setBusy(false)
    }
  }

  async function restore(list: SafetyCopySummary[]) {
    setBusy(true)
    const r = await restoreFromSafetyCopies(list.map((c) => c.data))
    setBusy(false)
    if (!r) {
      const text = 'Impossible de garder une copie de vos données actuelles (stockage plein ?). Rien n’a été modifié.'
      setMsg(text)
      return
    }
    const parts: string[] = []
    if (r.gardens) parts.push(`${r.gardens} jardin${r.gardens > 1 ? 's' : ''}`)
    if (r.plants) parts.push(`${r.plants} plante${r.plants > 1 ? 's' : ''}`)
    if (r.points) parts.push(`${r.points} point${r.points > 1 ? 's' : ''} de vue en photos`)
    const text = parts.length ? `Remis : ${parts.join(', ')}.` : 'Rien à remettre : tout est déjà là.'
    setMsg(text)
    showToast({ message: text })
    void look()
  }

  return (
    <div className="stack" data-feat="copie-restaurer">
      <button className="btn" disabled={busy} onClick={() => void look()}>
        {busy ? 'Recherche…' : 'Voir ce que contiennent les copies de sécurité'}
      </button>
      {copies && copies.length === 0 && <p className="small muted">Aucune copie de sécurité sur ce téléphone.</p>}
      {copies?.map((c) => (
        <div key={c.id} className="card">
          <strong>{c.id === 'recente' ? 'Copie la plus récente' : 'Copie précédente'}</strong>
          <ul className="small" style={{ margin: '6px 0', paddingLeft: 18 }}>
            {c.gardens.map((g) => (
              <li key={g.id}>
                « {g.name} » : {g.plants} plante{g.plants > 1 ? 's' : ''}, {g.points} point{g.points > 1 ? 's' : ''} de vue
                {g.points > 0 ? ` (photos sur ce téléphone : ${g.photosHere} sur ${g.photosTotal})` : ''}
                {g.here ? '' : ' · absent de vos jardins actuels'}
              </li>
            ))}
          </ul>
        </div>
      ))}
      {copies && copies.length > 0 && (
        <button className="btn primary" disabled={busy} onClick={() => void restore(copies)}>
          Remettre ce qui manque (toutes les copies)
        </button>
      )}
      {msg && (
        <p className="small" role="status">
          {msg}
        </p>
      )}
      <p className="small muted">Rien n’est effacé : les jardins, plantes et points de vue qui manquent sont ajoutés à ce que vous avez déjà.</p>
    </div>
  )
}

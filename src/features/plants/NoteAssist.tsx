import { useState } from 'react'
import { recordWithToast } from '../../lib/history'
import { hasFacts, mergePurchase, parseNote, type NoteFacts } from '../../lib/noteParse'
import { formsFor, purchaseFormLabel, purchasePatch } from '../../lib/purchase'
import { getState, updatePlant } from '../../lib/store'
import type { Plant, Species } from '../../types'

const NOTHING_FOUND = 'Je n’ai rien reconnu. Essayez : forme (scion, demi-tige…), hauteur en cm, prix en €, « acheté chez… », date comme 12/03/2026.'
const NOTHING_NEW = 'Tout ce que j’ai trouvé est déjà dans « Achat et plantation ».'

/** Lignes lisibles de ce qui a été trouvé : « Forme : demi-tige ». */
function lines(f: NoteFacts): string[] {
  const out: string[] = []
  if (f.form) out.push(`Forme : ${purchaseFormLabel(f.form).toLowerCase()}`)
  if (f.heightCm) out.push(`Hauteur à l’achat : ${f.heightCm} cm`)
  if (f.priceEur !== undefined) out.push(`Prix : ${String(f.priceEur).replace('.', ',')} €`)
  if (f.shop) out.push(`Acheté : ${f.shop}`)
  if (f.boughtAt) out.push(`Date d’achat : ${new Date(f.boughtAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}`)
  return out
}

/** Ne garde que ce qui change quelque chose (déjà renseigné à l'identique : rien à proposer) et que l'espèce permet. */
function newFacts(found: NoteFacts, plant: Plant, species: Species | undefined): NoteFacts {
  const cur = plant.purchase
  const out: NoteFacts = {}
  if (found.form && formsFor(species).some((f) => f.id === found.form) && cur?.form !== found.form) out.form = found.form
  if (found.heightCm && cur?.heightCm !== found.heightCm) out.heightCm = found.heightCm
  if (found.priceEur !== undefined && cur?.priceEur !== found.priceEur) out.priceEur = found.priceEur
  if (found.shop && cur?.shop !== found.shop) out.shop = found.shop
  if (found.boughtAt && cur?.boughtAt !== found.boughtAt) out.boughtAt = found.boughtAt
  return out
}

/**
 * « Remplir depuis ma note » : lit la note libre, propose forme, hauteur, prix, lieu et date d'achat, et ne les enregistre
 * qu'après « Appliquer » (annulable). La note elle-même n'est jamais modifiée. Règles de lecture de mots, pas d'IA : rien ne sort de l'appareil.
 */
export function NoteAssist({ plant, species }: { plant: Plant; species: Species | undefined }) {
  const [proposal, setProposal] = useState<{ facts: NoteFacts; message?: string }>()
  const notes = plant.notes?.trim() ?? ''

  function read() {
    const found = parseNote(notes)
    if (!hasFacts(found)) return setProposal({ facts: {}, message: NOTHING_FOUND })
    const facts = newFacts(found, getState().plants.find((p) => p.id === plant.id) ?? plant, species)
    setProposal({ facts, message: hasFacts(facts) ? undefined : NOTHING_NEW })
  }

  function apply() {
    if (!proposal) return
    const cur = getState().plants.find((p) => p.id === plant.id)
    if (!cur) return
    const before = { purchase: cur.purchase, ageAtPlanting: cur.ageAtPlanting, measurements: cur.measurements }
    const patch = purchasePatch(cur, species, mergePurchase(cur.purchase, proposal.facts))
    updatePlant(plant.id, patch)
    const after = { purchase: patch.purchase, ageAtPlanting: patch.ageAtPlanting ?? cur.ageAtPlanting, measurements: patch.measurements ?? cur.measurements }
    recordWithToast(
      { label: 'Achat rempli depuis la note', undo: () => updatePlant(plant.id, before), redo: () => updatePlant(plant.id, after) },
      'Achat rempli depuis votre note.',
    )
    setProposal(undefined)
  }

  if (!notes) return null
  return (
    <div className="stack note-assist" style={{ gap: 8 }}>
      <button type="button" className="btn small" onClick={read}>
        Remplir l’achat depuis ma note
      </button>
      {proposal && (
        <section className="card stack" style={{ gap: 8 }} role="status" aria-label="Ce que j’ai trouvé dans la note">
          {proposal.message ? (
            <p className="small" style={{ margin: 0 }}>
              {proposal.message}
            </p>
          ) : (
            <>
              <p className="small" style={{ margin: 0 }}>
                <strong>J’ai trouvé :</strong>
              </p>
              <ul className="list small">
                {lines(proposal.facts).map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
              <p className="small muted" style={{ margin: 0 }}>
                Vous pourrez corriger dans « Achat et plantation ». Votre note ne change pas.
              </p>
            </>
          )}
          <div className="row">
            {!proposal.message && (
              <button type="button" className="btn primary small" onClick={apply}>
                Appliquer
              </button>
            )}
            <button type="button" className="btn small" onClick={() => setProposal(undefined)}>
              {proposal.message ? 'Fermer' : 'Ignorer'}
            </button>
          </div>
        </section>
      )}
    </div>
  )
}

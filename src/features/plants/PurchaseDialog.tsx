import { useEffect, useState } from 'react'
import { Modal } from '../../components/Modal'
import { Icon } from '../../components/Icon'
import { parseLabel, type LabelFacts } from '../../lib/labelParse'
import { OcrUnavailableError, readLabelText, type OcrStage } from '../../lib/labelOcr'
import { SPECIES_BY_ID } from '../../data/species'
import { isoDate } from '../../lib/dates'
import { askPurchaseEnabled, formsFor, isTree, purchaseFormLabel, purchasePatch, purchaseSummary, setAskPurchaseEnabled, suggestedAgeYears, suggestedHeightCm } from '../../lib/purchase'
import { getState, updatePlant, useStore } from '../../lib/store'
import { setUi, useUi } from '../../lib/ui'
import type { PlantPurchase, PurchaseForm } from '../../types'
import { plantName } from './PlantPanel'

const num = (t: string): number | undefined => {
  const n = Number(t.replace(',', '.'))
  return t.trim() !== '' && Number.isFinite(n) && n >= 0 ? n : undefined
}

/** Texte lu à l'étiquette (scan) : le formulaire le propose, jamais sans que la personne le voie et le corrige. */
export interface PurchaseDraft {
  form?: PurchaseForm
  heightCm?: number
  shop?: string
  priceEur?: number
  note?: string
}

/**
 * « Comment l'avez-vous achetée ? » : demandé juste après le placement d'une plante, entièrement facultatif.
 * Trois sorties : Enregistrer, Plus tard (on le redemandera depuis la fiche), « Je ne veux pas le renseigner » (jamais redemandé).
 */
export function PurchaseDialog() {
  const { purchasePlantId } = useUi()
  const plant = useStore((s) => s.plants.find((p) => p.id === purchasePlantId))
  if (!purchasePlantId || !plant) return null
  return <PurchaseForm key={plant.id} plantId={plant.id} />
}

function PurchaseForm({ plantId }: { plantId: string }) {
  const plant = useStore((s) => s.plants.find((p) => p.id === plantId))!
  const species = SPECIES_BY_ID[plant.speciesId]
  const forms = formsFor(species)
  const existing = plant.purchase
  const [form, setForm] = useState<PurchaseForm | undefined>(existing?.form)
  const [height, setHeight] = useState(existing?.heightCm ? String(existing.heightCm) : '')
  const [shop, setShop] = useState(existing?.shop ?? '')
  const [price, setPrice] = useState(existing?.priceEur !== undefined ? String(existing.priceEur) : '')
  const [boughtAt, setBoughtAt] = useState(existing?.boughtAt ?? '')
  const [note, setNote] = useState(existing?.note ?? '')
  const [always, setAlways] = useState(askPurchaseEnabled)
  const [ocr, setOcr] = useState<{ busy: boolean; stage?: OcrStage; ratio?: number; error?: string; facts?: LabelFacts; read?: string[] }>({ busy: false })

  useEffect(() => {
    // Quand on choisit une forme d'arbre, on propose la hauteur d'achat habituelle (modifiable).
    if (!height && form) {
      const h = suggestedHeightCm(form, species)
      if (h) setHeight(String(h))
    }
    // La hauteur n'est proposée que si le champ est vide.
  }, [form]) // eslint-disable-line react-hooks/exhaustive-deps

  /** Photo d'étiquette → texte → champs proposés (jamais enregistrés sans que la personne les voie et les corrige). */
  async function readLabel(input: HTMLInputElement) {
    const file = input.files?.[0]
    input.value = ''
    if (!file) return
    setOcr({ busy: true, stage: 'preparation' })
    try {
      const text = await readLabelText(file, (stage, ratio) => setOcr((o) => ({ ...o, busy: true, stage, ratio })))
      const facts = parseLabel(text)
      const read: string[] = []
      if (facts.form && forms.some((f) => f.id === facts.form)) {
        setForm(facts.form)
        read.push(`forme : ${purchaseFormLabel(facts.form).toLowerCase()}`)
      }
      if (facts.heightCm) {
        setHeight(String(facts.heightCm))
        read.push(`hauteur : ${facts.heightCm} cm`)
      }
      if (facts.priceEur !== undefined) {
        setPrice(String(facts.priceEur).replace('.', ','))
        read.push(`prix : ${String(facts.priceEur).replace('.', ',')} €`)
      }
      if (facts.noteLines.length && !note.trim()) {
        setNote(facts.noteLines.join(' · '))
        read.push('variété ou nom latin')
      }
      setOcr({ busy: false, facts, read })
    } catch (e) {
      setOcr({ busy: false, error: e instanceof OcrUnavailableError ? e.message : 'L’étiquette n’a pas pu être lue. Essayez une photo plus nette, bien éclairée, ou saisissez les informations.' })
    }
  }

  const close = () => {
    setAskPurchaseEnabled(always)
    setUi({ purchasePlantId: undefined })
  }
  const age = suggestedAgeYears(form, species)

  function save() {
    const purchase: PlantPurchase = { form, heightCm: num(height), shop, priceEur: num(price), boughtAt: boughtAt || undefined, note }
    const cur = getState().plants.find((p) => p.id === plantId)
    if (cur) updatePlant(plantId, purchasePatch(cur, species, purchase))
    close()
  }
  function never() {
    const cur = getState().plants.find((p) => p.id === plantId)
    if (cur) updatePlant(plantId, purchasePatch(cur, species, { skipped: true }))
    close()
  }

  return (
    <Modal title="Comment l’avez-vous achetée ?" onClose={close}>
      <div className="stack purchase-form">
        <p className="small" style={{ margin: 0 }}>
          {plantName(plant)} : tout est facultatif. Ces informations rendent sa taille plus juste sur la carte et en 3D.
        </p>
        <div className="label-scan stack" style={{ gap: 6 }}>
          <label className={'btn file-btn' + (ocr.busy ? ' disabled' : '')}>
            <Icon name="camera" size={18} /> {ocr.busy ? 'Lecture en cours…' : 'Lire l’étiquette avec l’appareil photo'}
            <input className="sr-only" type="file" accept="image/*" capture="environment" disabled={ocr.busy} onChange={(e) => void readLabel(e.target)} />
          </label>
          <p className="small muted" style={{ margin: 0 }}>
            Cette étape demande internet la première fois (environ 5 Mo). Ensuite, elle marche sans connexion. La photo reste sur votre appareil.
          </p>
          {ocr.busy && (
            <p className="small" role="status" style={{ margin: 0 }}>
              {ocr.stage === 'telechargement' ? 'Téléchargement du module de lecture…' : ocr.stage === 'lecture' ? 'Lecture du texte…' : 'Préparation de la photo…'}
              {ocr.ratio !== undefined && ` ${Math.round(ocr.ratio * 100)} %`}
            </p>
          )}
          {ocr.error && (
            <p className="alert error small" role="alert" style={{ margin: 0 }}>
              {ocr.error}
            </p>
          )}
          {ocr.facts && !ocr.busy && (
            <div className="alert info small" role="status">
              {ocr.read && ocr.read.length > 0 ? <p style={{ margin: 0 }}>Lu sur l’étiquette : {ocr.read.join(', ')}. Vérifiez avant d’enregistrer.</p> : <p style={{ margin: 0 }}>Rien d’utilisable n’a été lu. Essayez une photo plus nette.</p>}
              {ocr.facts.speciesId && ocr.facts.speciesId === plant.speciesId && <p style={{ margin: '4px 0 0' }}>✓ L’étiquette correspond à votre plante.</p>}
              {ocr.facts.speciesId && ocr.facts.speciesId !== plant.speciesId && (
                <p style={{ margin: '4px 0 0' }}>
                  ⚠ L’étiquette parle de « {SPECIES_BY_ID[ocr.facts.speciesId]?.nomCommun ?? ocr.facts.speciesId} », vous avez placé « {plantName(plant)} ». Vérifiez l’espèce.
                </p>
              )}
            </div>
          )}
        </div>
        <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend>
            <strong>Sous quelle forme ?</strong>
          </legend>
          <div className="purchase-forms" role="radiogroup" aria-label="Forme d’achat">
            {forms.map((f) => (
              <label key={f.id} className={'purchase-form-choice' + (form === f.id ? ' on' : '')}>
                <input className="sr-only" type="radio" name="purchase-form" checked={form === f.id} onChange={() => setForm(f.id)} />
                {f.label}
              </label>
            ))}
            <label className={'purchase-form-choice' + (form === undefined ? ' on' : '')}>
              <input className="sr-only" type="radio" name="purchase-form" checked={form === undefined} onChange={() => setForm(undefined)} />
              Je ne sais pas
            </label>
          </div>
          <p className="small muted" style={{ margin: 0, minHeight: '2.6em' }}>
            {form ? forms.find((f) => f.id === form)?.hint : 'Choisissez la forme qui ressemble le plus à votre achat.'}
          </p>
        </fieldset>
        {form && age !== undefined && isTree(species) && (
          <p className="small muted" style={{ margin: 0 }}>
            {purchaseFormLabel(form)} : âge estimé {age < 1 ? 'moins d’un an' : `${age} an${age > 1 ? 's' : ''}`}. Vous pourrez le corriger dans la fiche.
          </p>
        )}
        <label className="field">
          <span>Hauteur à l’achat, en centimètres</span>
          <input className="input" inputMode="decimal" placeholder="ex. 120" value={height} onChange={(e) => setHeight(e.target.value)} />
        </label>
        <label className="field">
          <span>Où l’avez-vous achetée ?</span>
          <input className="input" maxLength={120} placeholder="ex. Pépinière Martin" value={shop} onChange={(e) => setShop(e.target.value)} />
        </label>
        <div className="row" style={{ gap: 12 }}>
          <label className="field" style={{ flex: 1 }}>
            <span>Date d’achat</span>
            <input className="input" type="date" max={isoDate()} value={boughtAt} onChange={(e) => setBoughtAt(e.target.value)} />
          </label>
          <label className="field" style={{ flex: 1 }}>
            <span>Prix, en euros</span>
            <input className="input" inputMode="decimal" placeholder="ex. 24,90" value={price} onChange={(e) => setPrice(e.target.value)} />
          </label>
        </div>
        <label className="field">
          <span>Une note (variété, conseil du vendeur…)</span>
          <textarea className="input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        <div className="row confirm-actions">
          <button className="btn primary" onClick={save}>
            Enregistrer
          </button>
          <button className="btn" onClick={close}>
            Plus tard
          </button>
        </div>
        <button className="btn ghost small" onClick={never}>
          Je ne veux pas le renseigner pour cette plante
        </button>
        <label className="check-row">
          <input type="checkbox" checked={!always} onChange={(e) => setAlways(!e.target.checked)} /> Ne plus me poser cette question après chaque plante
        </label>
      </div>
    </Modal>
  )
}


/** Fiche de la plante : ce qui est renseigné sur l'achat, et le bouton pour le remplir ou le corriger. */
export function PurchaseSummary({ plantId }: { plantId: string }) {
  const plant = useStore((s) => s.plants.find((p) => p.id === plantId))
  if (!plant) return null
  const lines = purchaseSummary(plant.purchase)
  return (
    <section className="stack purchase-summary" style={{ gap: 6 }}>
      <h3>Achat et plantation</h3>
      {lines.length > 0 ? (
        <ul className="list small">
          {lines.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      ) : (
        <p className="muted small" style={{ margin: 0 }}>
          {plant.purchase?.skipped ? 'Vous avez choisi de ne pas le renseigner.' : 'Rien de renseigné : forme, hauteur, lieu et prix d’achat.'}
        </p>
      )}
      <button className="btn small" onClick={() => setUi({ purchasePlantId: plant.id })}>
        {lines.length > 0 ? 'Modifier' : 'Renseigner'}
      </button>
    </section>
  )
}

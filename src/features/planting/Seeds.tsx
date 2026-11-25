import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { Fold } from '../../components/Fold'
import { Icon } from '../../components/Icon'
import { SPECIES } from '../../data/species'
import { OcrUnavailableError, readLabelText, type OcrStage } from '../../lib/labelOcr'
import { monthsText, parseSeedText, seedProposal } from '../../lib/seedParse'
import { scanLabelOpen } from '../../lib/overlays'
import { addSeed, MAX_SEEDS, readSeeds, removeSeed, restoreSeeds, seedsShareText, subscribeSeeds, toggleGive, type SeedInfo } from '../../lib/seeds'
import { canShareText, copyText, shareOrCopy } from '../../lib/shareText'
import { showToast } from '../../lib/toast'

/** Une ligne qui résume ce qui a été lu sur le sachet : « Semis mars, avril et mai · 1 cm · levée 10 jours ». */
function infoLine(i?: SeedInfo): string {
  if (!i) return ''
  const bits: string[] = []
  if (i.semis?.length) bits.push(`Semis ${monthsText(i.semis)}`)
  if (i.recolte?.length) bits.push(`récolte ${monthsText(i.recolte)}`)
  if (i.profondeurCm) bits.push(`profondeur ${String(i.profondeurCm).replace('.', ',')} cm`)
  if (i.espacementCm) bits.push(`${i.espacementCm} cm entre plants`)
  if (i.leveeJours) bits.push(`levée ${i.leveeJours} jours`)
  if (i.soleil) bits.push(i.soleil === 'soleil' ? 'plein soleil' : i.soleil)
  if (i.contenu) bits.push(i.contenu)
  const t = bits.join(' · ')
  return t.charAt(0).toUpperCase() + t.slice(1)
}

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
  const [note, setNote] = useState('')
  const [ocr, setOcr] = useState<{ busy: boolean; stage?: OcrStage; ratio?: number; error?: string; read?: string[]; sow?: string; empty?: boolean }>({ busy: false })
  const field = useRef<HTMLTextAreaElement>(null)
  const names = useMemo(() => SPECIES.map((s) => s.nomCommun), [])
  const share = canShareText()
  const text = seedsShareText(seeds)
  useEffect(() => {
    if (manual) field.current?.select()
  }, [manual])

  /** Photo du sachet -> texte -> champs PROPOSÉS (jamais d'ajout tout seul). La photo est lue puis oubliée : rien n'est gardé ni envoyé. */
  async function readPacket(input: HTMLInputElement) {
    const file = input.files?.[0]
    input.value = ''
    if (!file) return
    setOcr({ busy: true, stage: 'preparation' })
    try {
      const text = await readLabelText(file, (stage, ratio) => setOcr((o) => ({ ...o, busy: true, stage, ratio })))
      const facts = parseSeedText(text)
      const p = seedProposal(facts)
      const read: string[] = []
      if (p.name) {
        setName(p.name)
        read.push(`nom : ${p.name}`)
      }
      if (p.at) {
        setAt(p.at)
        read.push(`date : ${MONTH_FORMAT(p.at)}`)
      }
      setNote(p.note ?? '')
      if (p.note) {
        read.push(p.note.charAt(0).toLowerCase() + p.note.slice(1))
      }
      setOcr({ busy: false, read, empty: read.length === 0 && facts.sowMonths.length === 0, sow: facts.sowMonths.length ? monthsText(facts.sowMonths) : undefined })
    } catch (e) {
      setOcr({ busy: false, error: e instanceof OcrUnavailableError ? e.message : 'Le sachet n’a pas pu être lu. Essayez une photo plus nette, bien éclairée, ou écrivez le nom à la main.' })
    }
  }

  function add() {
    const made = addSeed({ name, at: at || undefined, toGive: give, note: note.trim() || undefined })
    if (!made) {
      showToast({ message: name.trim() ? 'La liste est pleine : retirez un sachet avant d’en ajouter.' : 'Écrivez le nom du sachet.', tone: 'error' })
      return
    }
    setName('')
    setAt('')
    setGive(false)
    setNote('')
    setOcr({ busy: false })
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
    <Fold title="Mes graines" feat="mes-graines">
      <p className="small muted">Notez vos sachets, et ceux que vous voulez donner ou échanger. Cette liste reste sur cet appareil : elle n’est pas envoyée en ligne.</p>
      <div className="row" style={{ marginBottom: 8 }}>
        <button type="button" className="btn primary" onClick={() => scanLabelOpen.set(true)}>
          <Icon name="scan" size={18} /> Scanner un sachet complet
        </button>
      </div>
      <div className="stack" style={{ gap: 6, marginBottom: 10 }} data-feat="lire-sachet">
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <label className={'btn file-btn' + (ocr.busy ? ' disabled' : '')}>
            <Icon name="camera" size={18} /> {ocr.busy ? 'Lecture en cours…' : 'Lire le sachet en photo'}
            <input className="sr-only" type="file" accept="image/*" capture="environment" disabled={ocr.busy} onChange={(e) => void readPacket(e.target)} />
          </label>
          <label className={'btn file-btn' + (ocr.busy ? ' disabled' : '')}>
            Choisir une photo
            <input className="sr-only" type="file" accept="image/*" disabled={ocr.busy} onChange={(e) => void readPacket(e.target)} />
          </label>
        </div>
        <p className="small muted" style={{ margin: 0 }}>
          La photo n’est pas gardée et ne quitte pas l’appareil. La première lecture demande internet (environ 5 Mo).
        </p>
        {ocr.busy && (
          <p className="small" role="status" style={{ margin: 0 }}>
            {ocr.stage === 'telechargement' ? 'Téléchargement du module de lecture…' : ocr.stage === 'lecture' ? 'Lecture du texte…' : 'Préparation de la photo…'}
            {ocr.ratio !== undefined && ` ${Math.round(ocr.ratio * 100)} %`}
          </p>
        )}
        {ocr.error && (
          <p className="alert error small" role="alert" style={{ margin: 0 }}>
            {ocr.error} Vous pouvez aussi remplir les champs à la main.
          </p>
        )}
        {!ocr.busy && !ocr.error && ocr.read && (
          <div className="alert info small" role="status">
            {ocr.empty ? (
              <p style={{ margin: 0 }}>Rien d’utilisable n’a été lu. Essayez une photo plus nette, ou remplissez les champs à la main.</p>
            ) : (
              <>
                {ocr.read.length > 0 && <p style={{ margin: 0 }}>Lu sur le sachet : {ocr.read.join(', ')}. Vérifiez, corrigez, puis touchez « Ajouter ce sachet ».</p>}
                {ocr.sow && <p style={{ margin: '4px 0 0' }}>Semis indiqué sur le sachet : {ocr.sow}. C’est une information : rien n’est ajouté au calendrier.</p>}
              </>
            )}
          </div>
        )}
      </div>
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
        {note && (
          <label className="field">
            <span>Note lue sur le sachet</span>
            <input className="input" value={note} maxLength={80} onChange={(e) => setNote(e.target.value)} />
          </label>
        )}
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
                  {infoLine(s.info) && <span className="small muted" style={{ display: 'block' }}>{infoLine(s.info)}</span>}
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
    </Fold>
  )
}

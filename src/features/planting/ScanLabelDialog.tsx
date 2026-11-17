import { useEffect, useMemo, useState } from 'react'
import { Icon } from '../../components/Icon'
import { Modal } from '../../components/Modal'
import { SPECIES, SPECIES_BY_ID } from '../../data/species'
import { parseLabelScan, type LabelKind, type Sun } from '../../lib/labelFacts'
import { OcrUnavailableError, readLabelData, type OcrStage } from '../../lib/labelOcr'
import type { GridMonths } from '../../lib/monthGrid'
import { seedProposal } from '../../lib/seedParse'
import { addSeed, MAX_SEEDS, readSeeds, type SeedInfo } from '../../lib/seeds'
import { showToast } from '../../lib/toast'
import { startPlacing } from '../../lib/ui'
import { setPurchaseDraft } from '../../lib/purchaseDraft'

const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']
const KIND_LABEL: Record<LabelKind, string> = { sachet: 'Sachet de graines', plante: 'Étiquette de plante', autre: 'Autre fiche' }
const SUN_LABEL: Record<Sun, string> = { soleil: 'Plein soleil', 'mi-ombre': 'Mi-ombre', ombre: 'Ombre' }

const asNum = (s: string) => {
  const n = Number(s.replace(',', '.'))
  return s.trim() !== '' && Number.isFinite(n) && n > 0 ? n : undefined
}

function MonthPicker({ label, value, onChange }: { label: string; value: number[]; onChange: (v: number[]) => void }) {
  return (
    <fieldset className="scan-months">
      <legend className="small">{label}</legend>
      <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
        {MONTHS.map((m, i) => {
          const on = value.includes(i + 1)
          return (
            <button key={m} type="button" className={'chip-filter' + (on ? ' on' : '')} aria-pressed={on} onClick={() => onChange(on ? value.filter((x) => x !== i + 1) : [...value, i + 1].sort((a, b) => a - b))}>
              {m}
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}

/**
 * « Scanner un sachet ou une étiquette » : une ou deux photos (recto, verso) -> texte lu dans l'appareil -> tout est proposé dans un
 * formulaire modifiable (nom, mois de semis et de récolte, profondeur, distance, levée, soleil, contenu, hauteur, prix).
 * Rien n'est ajouté sans « Ajouter » ; la photo n'est ni gardée ni envoyée.
 */
export function ScanLabelDialog({ onClose }: { onClose: () => void }) {
  const [texts, setTexts] = useState<string[]>([])
  const [grids, setGrids] = useState<GridMonths[]>([])
  const [busy, setBusy] = useState<{ stage?: OcrStage; ratio?: number } | null>(null)
  const [error, setError] = useState<string>()
  const scan = useMemo(() => {
    if (!texts.length) return undefined
    const grid: GridMonths | undefined = grids.length ? { semis: [...new Set(grids.flatMap((g) => g.semis))].sort((a, b) => a - b), recolte: [...new Set(grids.flatMap((g) => g.recolte))].sort((a, b) => a - b) } : undefined
    return parseLabelScan(texts.join('\n'), new Date(), undefined, grid)
  }, [texts, grids])
  // Formulaire (rempli par la lecture, modifiable).
  const [kind, setKind] = useState<LabelKind>('autre')
  const [name, setName] = useState('')
  const [at, setAt] = useState('')
  const [note, setNote] = useState('')
  const [semis, setSemis] = useState<number[]>([])
  const [recolte, setRecolte] = useState<number[]>([])
  const [prof, setProf] = useState('')
  const [esp, setEsp] = useState('')
  const [levee, setLevee] = useState('')
  const [soleil, setSoleil] = useState<Sun | ''>('')
  const [haut, setHaut] = useState('')
  const [contenu, setContenu] = useState('')
  const [give, setGive] = useState(false)
  const [speciesId, setSpeciesId] = useState<string | undefined>()
  const names = useMemo(() => SPECIES.map((s) => s.nomCommun), [])

  useEffect(() => {
    if (!scan) return
    const p = seedProposal(scan.seed)
    const e = scan.extras
    setKind(scan.kind)
    setName(p.name ?? '')
    setAt(p.at ?? '')
    setNote([p.note, ...scan.label.noteLines].filter(Boolean).join(' · ').slice(0, 80))
    setSemis(scan.seed.sowMonths)
    setRecolte(e.recolteMois)
    setProf(e.profondeurCm !== undefined ? String(e.profondeurCm).replace('.', ',') : '')
    setEsp(e.espacementCm !== undefined ? String(e.espacementCm) : '')
    setLevee(e.leveeJours !== undefined ? String(e.leveeJours) : '')
    setSoleil(e.soleil ?? '')
    setHaut(e.hauteurCm !== undefined ? String(e.hauteurCm) : '')
    setContenu(e.contenu ?? '')
    setSpeciesId(scan.species?.id)
  }, [scan])

  async function read(input: HTMLInputElement) {
    const file = input.files?.[0]
    input.value = ''
    if (!file) return
    setError(undefined)
    setBusy({})
    try {
      const r = await readLabelData(file, (stage, ratio) => setBusy({ stage, ratio }))
      setTexts((prev) => [...prev, r.text])
      if (r.grid) setGrids((prev) => [...prev, r.grid!])
    } catch (e) {
      setError(e instanceof OcrUnavailableError ? e.message : 'La photo n’a pas pu être lue. Essayez une photo plus nette, bien éclairée, bien cadrée.')
    } finally {
      setBusy(null)
    }
  }

  function info(): SeedInfo {
    return {
      speciesId,
      semis,
      recolte,
      profondeurCm: asNum(prof),
      espacementCm: asNum(esp),
      leveeJours: asNum(levee),
      soleil: soleil || undefined,
      hauteurCm: asNum(haut),
      contenu: contenu.trim() || undefined,
    }
  }
  function addToSeeds() {
    const made = addSeed({ name, at: at || undefined, toGive: give, note: note.trim() || undefined, info: info() })
    if (!made) {
      showToast({ message: name.trim() ? 'La liste de graines est pleine : retirez un sachet avant d’en ajouter.' : 'Écrivez le nom, même court.', tone: 'error' })
      return
    }
    showToast({ message: `« ${made.name} » est dans Mes graines.` })
    onClose()
  }
  function addPlant() {
    if (!speciesId) return
    // Étiquette de plante : forme, hauteur, prix lus sont proposés dans « Comment l'avez-vous achetée ? » après le placement.
    setPurchaseDraft(
      kind === 'plante'
        ? { speciesId, form: scan?.label.form, heightCm: asNum(haut), priceEur: scan?.extras.prixEur, note: scan?.label.noteLines.join(' · ').slice(0, 80) || undefined }
        : undefined,
    )
    onClose()
    window.setTimeout(() => startPlacing(speciesId), 160)
  }

  const waiting = busy !== null
  const full = readSeeds().length >= MAX_SEEDS
  const picker = (
    <div className="stack" style={{ gap: 8 }}>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <label className={'btn primary file-btn' + (waiting ? ' disabled' : '')}>
          <Icon name="camera" size={18} /> {texts.length ? 'Photographier l’autre face' : 'Prendre en photo'}
          <input className="sr-only" type="file" accept="image/*" capture="environment" disabled={waiting} onChange={(e) => void read(e.target)} />
        </label>
        <label className={'btn file-btn' + (waiting ? ' disabled' : '')}>
          Choisir une photo
          <input className="sr-only" type="file" accept="image/*" disabled={waiting} onChange={(e) => void read(e.target)} />
        </label>
      </div>
      <p className="small muted" style={{ margin: 0 }}>
        Une étiquette, un sachet (recto puis verso), une fiche : le texte est lu sur votre appareil. La photo n’est ni gardée ni envoyée. La première lecture demande internet (environ 5 Mo).
      </p>
      {busy && (
        <p className="small" role="status" style={{ margin: 0 }}>
          {busy.stage === 'telechargement' ? 'Téléchargement du module de lecture…' : busy.stage === 'lecture' ? 'Lecture du texte…' : 'Préparation de la photo…'}
          {busy.ratio !== undefined && ` ${Math.round(busy.ratio * 100)} %`}
        </p>
      )}
      {error && (
        <p className="alert error small" role="alert" style={{ margin: 0 }}>
          {error}
        </p>
      )}
    </div>
  )

  return (
    <Modal title="Scanner un sachet ou une étiquette" feat="scanner-etiquette" onClose={onClose}>
      <div className="stack" style={{ gap: 12 }}>
        {picker}
        {scan && (
          <form
            className="stack"
            style={{ gap: 10 }}
            onSubmit={(e) => {
              e.preventDefault()
              if (kind === 'plante' && speciesId) addPlant()
              else addToSeeds()
            }}
          >
            <p className="alert info small" role="status" style={{ margin: 0 }}>
              {scan.seed.name || scan.extras.profondeurCm || scan.seed.sowMonths.length
                ? 'Voici ce que l’appli a lu. Vérifiez, corrigez ce qui est faux, puis ajoutez.'
                : 'Peu de choses lues. Essayez une photo plus nette, ou remplissez à la main.'}
            </p>
            <div className="row" role="group" aria-label="Type de fiche" style={{ gap: 6, flexWrap: 'wrap' }}>
              {(Object.keys(KIND_LABEL) as LabelKind[]).map((k) => (
                <button key={k} type="button" className={'chip-filter' + (kind === k ? ' on' : '')} aria-pressed={kind === k} onClick={() => setKind(k)}>
                  {KIND_LABEL[k]}
                </button>
              ))}
            </div>
            <label className="field">
              <span>Nom</span>
              <input className="input" list="scan-names" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder="Tomate, haricot de ma grand-mère…" />
              <datalist id="scan-names">
                {names.map((n) => (
                  <option key={n} value={n} />
                ))}
              </datalist>
            </label>
            <label className="field">
              <span>Plante du catalogue</span>
              <select className="input" value={speciesId ?? ''} onChange={(e) => setSpeciesId(e.target.value || undefined)}>
                <option value="">Aucune</option>
                {SPECIES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nomCommun}
                  </option>
                ))}
              </select>
            </label>
            {scan.extras.fromGrid && (
              <p className="small muted" role="status" style={{ margin: 0 }}>
                Mois lus dans le calendrier en grille du sachet (cases cochées ou colorées) : vérifiez-les.
              </p>
            )}
            <MonthPicker label="Mois de semis" value={semis} onChange={setSemis} />
            <MonthPicker label="Mois de récolte" value={recolte} onChange={setRecolte} />
            <div className="scan-grid">
              <label className="field">
                <span>Profondeur (cm)</span>
                <input className="input" inputMode="decimal" value={prof} onChange={(e) => setProf(e.target.value)} />
              </label>
              <label className="field">
                <span>Distance entre plants (cm)</span>
                <input className="input" inputMode="numeric" value={esp} onChange={(e) => setEsp(e.target.value)} />
              </label>
              <label className="field">
                <span>Levée (jours)</span>
                <input className="input" inputMode="numeric" value={levee} onChange={(e) => setLevee(e.target.value)} />
              </label>
              <label className="field">
                <span>Hauteur (cm)</span>
                <input className="input" inputMode="numeric" value={haut} onChange={(e) => setHaut(e.target.value)} />
              </label>
              <label className="field">
                <span>Soleil</span>
                <select className="input" value={soleil} onChange={(e) => setSoleil(e.target.value as Sun | '')}>
                  <option value="">Non indiqué</option>
                  {(Object.keys(SUN_LABEL) as Sun[]).map((s) => (
                    <option key={s} value={s}>
                      {SUN_LABEL[s]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Contenu</span>
                <input className="input" value={contenu} maxLength={20} placeholder="2 g, 100 graines" onChange={(e) => setContenu(e.target.value)} />
              </label>
            </div>
            <label className="field">
              <span>Date de récolte ou d’achat (facultatif)</span>
              <input className="input" type="date" value={at} onChange={(e) => setAt(e.target.value)} />
            </label>
            <label className="field">
              <span>Note</span>
              <input className="input" value={note} maxLength={80} onChange={(e) => setNote(e.target.value)} />
            </label>
            {scan.extras.prixEur !== undefined && <p className="small muted" style={{ margin: 0 }}>Prix lu : {scan.extras.prixEur.toLocaleString('fr-FR')} €. Il sera proposé dans l’achat de la plante, à vérifier.</p>}
            <label className="row" style={{ gap: 8, alignItems: 'center' }}>
              <input type="checkbox" checked={give} onChange={(e) => setGive(e.target.checked)} /> À donner ou échanger
            </label>
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              <button type="submit" className="btn primary" disabled={!name.trim() || full}>
                <Icon name="plus" /> Ajouter à mes graines
              </button>
              {speciesId && (
                <button type="button" className="btn" onClick={addPlant}>
                  <Icon name="leaf" /> Ajouter « {SPECIES_BY_ID[speciesId]?.nomCommun} » au jardin
                </button>
              )}
              <button
                type="button"
                className="btn ghost"
                onClick={() => {
                  setTexts([])
                  setGrids([])
                  setError(undefined)
                }}
              >
                Recommencer
              </button>
            </div>
            <details>
              <summary>Texte lu sur la photo</summary>
              <pre className="small" style={{ whiteSpace: 'pre-wrap' }}>{texts.join('\n— — —\n')}</pre>
            </details>
          </form>
        )}
      </div>
    </Modal>
  )
}

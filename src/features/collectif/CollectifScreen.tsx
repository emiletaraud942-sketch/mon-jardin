import { useEffect, useMemo, useRef, useState } from 'react'
import { Icon } from '../../components/Icon'
import { bilanAnnuel, bilanYears, compostStatus, GESTE_LABEL, GESTE_ORDER, GESTE_UNIT, HABITATS, plotAt } from '../../engine/collectif'
import { downloadBlob } from '../../lib/backup'
import { goHome } from '../../lib/goHome'
import { useInertBehind } from '../../lib/inert'
import { isoDate } from '../../lib/dates'
import { buildEventIcs, eventIcsFilename } from '../../lib/neighbors/eventIcs'
import { collectifOpen } from '../../lib/overlays'
import { copyText, shareOrCopy } from '../../lib/shareText'
import { useActiveGarden, useGardenPlants } from '../../lib/store'
import { showToast } from '../../lib/toast'
import { useBackLayer } from '../../lib/ui'
import type { Garden, GesteType } from '../../types'
import { addComposteur, addGeste, clearPlots, createPlots, removeComposteur, removeGeste, setCollectif, setHolder, toggleHabitat, turnComposteur } from './actions'
import { INVASIVES } from '../../data/species/invasives'
import { chantierEvent, chantierText, chantierValid, EMPTY_CHANTIER, type ChantierForm } from './chantier'
import { DossierSheet, printDossier } from './DossierSheet'
import '../../styles/novice-pages.css'
import '../../styles/ennuis.css'
import '../../styles/collectif.css'

export const COLLECTIF_TITLE = 'Jardin collectif'
export type SectionId = 'responsable' | 'parcelles' | 'gestes' | 'composteurs' | 'biodiversite' | 'chantier' | 'dossier'

const close = () => collectifOpen.set(undefined)
const num = (n: number) => n.toLocaleString('fr-FR', { maximumFractionDigits: 1 })

function Layer({ onBack }: { onBack: () => void }) {
  useBackLayer(true, onBack)
  return null
}

function Section({ id, title, feat, open, onOpen, children }: { id: SectionId; title: string; feat: string; open: boolean; onOpen: (id: SectionId | undefined) => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null)
  useEffect(() => {
    if (open) ref.current?.scrollIntoView?.({ block: 'start' })
  }, [open])
  return (
    <details ref={ref} className="coll-section" data-feat={feat} open={open} onToggle={(e) => {
        const isOpen = (e.currentTarget as HTMLDetailsElement).open
        if (isOpen && !open) onOpen(id)
        else if (!isOpen && open) onOpen(undefined)
      }}>
      <summary>{title}</summary>
      <div className="coll-body">{children}</div>
    </details>
  )
}

function Responsable({ garden }: { garden: Garden }) {
  const c = garden.collectif
  const [coord, setCoord] = useState(c?.coordinateur ?? '')
  const [asso, setAsso] = useState(c?.association ?? '')
  return (
    <>
      <p className="small muted">Les dispositifs de la Métropole demandent une seule personne qui coordonne le jardin. Les prénoms restent sur votre appareil et votre copie en ligne : ils ne sont pas partagés avec les autres membres.</p>
      <label className="field">
        <span>Personne qui coordonne</span>
        <input className="input" value={coord} maxLength={60} placeholder="Prénom ou surnom" onChange={(e) => setCoord(e.target.value)} />
      </label>
      <label className="field">
        <span>Association ou groupe (facultatif)</span>
        <input className="input" value={asso} maxLength={80} onChange={(e) => setAsso(e.target.value)} />
      </label>
      <label className="check-row">
        <input type="checkbox" checked={!!c?.charteAt} onChange={(e) => setCollectif(garden.id, { charteAt: e.target.checked ? isoDate() : undefined })} />
        <span>
          La charte du jardin collectif est affichée au jardin{c?.charteAt ? ` (le ${new Date(c.charteAt + 'T12:00:00').toLocaleDateString('fr-FR')})` : ''}.
        </span>
      </label>
      <button className="btn" onClick={() => setCollectif(garden.id, { coordinateur: coord.trim(), association: asso.trim() })}>
        Enregistrer
      </button>
    </>
  )
}

function Parcelles({ garden }: { garden: Garden }) {
  const plants = useGardenPlants(garden.id)
  const plots = garden.plots ?? []
  const [cols, setCols] = useState(4)
  const [rows, setRows] = useState(3)
  const [w, setW] = useState(2)
  const [h, setH] = useState(5)
  const [gap, setGap] = useState(0.5)
  const origin = useMemo(() => {
    const ring = garden.parcel
    if (ring && ring.length) return { x: Math.min(...ring.map((p) => p.x)), y: Math.min(...ring.map((p) => p.y)) }
    return { x: -(cols * (w + gap)) / 2, y: -(rows * (h + gap)) / 2 }
  }, [garden.parcel, cols, rows, w, h, gap])
  const [dx, setDx] = useState(0)
  const [dy, setDy] = useState(0)
  const count = (n: number) => plants.filter((p) => plotAt(p.position, plots)?.n === n).length
  return (
    <>
      <p className="small muted">Découpez le jardin en carrés alignés sur le nord, puis écrivez qui cultive chaque parcelle. Le plan s’imprime dans le dossier.</p>
      {plots.length === 0 ? (
        <div className="coll-grid">
          {(
            [
              ['Parcelles côte à côte', cols, setCols, 1],
              ['Rangées', rows, setRows, 1],
              ['Largeur d’une parcelle (m)', w, setW, 0.5],
              ['Longueur d’une parcelle (m)', h, setH, 0.5],
              ['Écart entre parcelles (m)', gap, setGap, 0.1],
              ['Décalage vers l’est (m)', dx, setDx, 0.5],
              ['Décalage vers le nord (m)', dy, setDy, 0.5],
            ] as [string, number, (n: number) => void, number][]
          ).map(([label, v, set, step]) => (
            <label key={label} className="field">
              <span>{label}</span>
              <input className="input" type="number" inputMode="decimal" step={step} value={v} onChange={(e) => set(Number(e.target.value))} />
            </label>
          ))}
          <button
            className="btn primary"
            onClick={() => {
              const n = createPlots(garden.id, { cols, rows, w, h, gap, origin: { x: origin.x + dx, y: origin.y + dy } })
              if (n === 0) showToast({ message: 'Ces valeurs ne marchent pas : 200 parcelles au plus, des tailles positives.' })
            }}
          >
            Créer {Number.isFinite(cols * rows) ? cols * rows : 0} parcelles
          </button>
          <p className="small muted">Le premier carré est dans le coin sud-ouest de la parcelle du jardin. Vous pouvez le décaler.</p>
        </div>
      ) : (
        <>
          <ul className="coll-plots">
            {plots.map((q) => (
              <li key={q.id}>
                <strong>Parcelle {q.n}</strong>
                <span className="small muted">
                  {num(q.w)} × {num(q.h)} m · {count(q.n)} plante{count(q.n) > 1 ? 's' : ''}
                </span>
                <input
                  className="input"
                  aria-label={`Cultivée par, parcelle ${q.n}`}
                  placeholder="Cultivée par…"
                  maxLength={30}
                  defaultValue={q.holder ?? ''}
                  onBlur={(e) => e.target.value.trim() !== (q.holder ?? '') && setHolder(garden.id, q.id, e.target.value)}
                />
              </li>
            ))}
          </ul>
          <button className="btn danger" onClick={() => clearPlots(garden.id)}>
            Retirer toutes les parcelles
          </button>
        </>
      )}
    </>
  )
}

function Gestes({ garden, today }: { garden: Garden; today: Date }) {
  const years = bilanYears(garden.gestes, today)
  const [year, setYear] = useState(years[0])
  const [type, setType] = useState<GesteType>('compost')
  const [qty, setQty] = useState('')
  const [date, setDate] = useState(isoDate(today))
  const [note, setNote] = useState('')
  const bilan = bilanAnnuel(garden.gestes, year)
  const list = (garden.gestes ?? []).filter((g) => g.date.startsWith(String(year))).sort((a, b) => b.date.localeCompare(a.date))
  const [all, setAll] = useState(false)
  const shown = all ? list : list.slice(0, 5)
  const submit = () => {
    const q = Number(qty.replace(',', '.'))
    if (!Number.isFinite(q) || q <= 0 || q > 100_000) return showToast({ message: 'Écrivez une quantité, par exemple 12.' })
    addGeste(garden.id, { date, type, quantite: q, note: note.trim() || undefined })
    setYear(Number(date.slice(0, 4)))
    setQty('')
    setNote('')
  }
  return (
    <>
      <p className="small muted">Notez ce que le jardin évite de jeter : c’est ce que demandent les bilans annuels. Ce sont des estimations, à la main.</p>
      <div className="coll-grid">
        <label className="field">
          <span>Quoi</span>
          <select className="input" value={type} onChange={(e) => setType(e.target.value as GesteType)}>
            {GESTE_ORDER.map((t) => (
              <option key={t} value={t}>
                {GESTE_LABEL[t]}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Quantité ({GESTE_UNIT[type] === 'kg' ? 'kilos' : 'litres'})</span>
          <input className="input" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="12" />
        </label>
        <label className="field">
          <span>Date</span>
          <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="field">
          <span>Note (facultatif)</span>
          <input className="input" value={note} maxLength={80} onChange={(e) => setNote(e.target.value)} />
        </label>
        <button className="btn primary" onClick={submit}>
          Ajouter ce geste
        </button>
      </div>
      <label className="field">
        <span>Bilan de l’année</span>
        <select className="input" value={year} onChange={(e) => setYear(Number(e.target.value))}>
          {years.map((y) => (
            <option key={y}>{y}</option>
          ))}
        </select>
      </label>
      <table className="coll-bilan">
        <tbody>
          {GESTE_ORDER.map((t) => (
            <tr key={t}>
              <td>{GESTE_LABEL[t]}</td>
              <td>
                {num(bilan.parType[t])} {GESTE_UNIT[t]}
              </td>
            </tr>
          ))}
          <tr className="coll-total">
            <td>Déchets végétaux évités ou réemployés</td>
            <td data-testid="bilan-total">{num(bilan.dechetsEvitesKg)} kg</td>
          </tr>
        </tbody>
      </table>
      {shown.length > 0 && (
        <ul className="coll-list">
          {shown.map((g) => (
            <li key={g.id}>
              <span>
                {new Date(g.date + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} : {GESTE_LABEL[g.type]}, {num(g.quantite)} {GESTE_UNIT[g.type]}
                {g.note ? ` (${g.note})` : ''}
              </span>
              <button className="btn small" aria-label={`Retirer le geste du ${g.date}`} onClick={() => removeGeste(garden.id, g.id)}>
                Retirer
              </button>
            </li>
          ))}
        </ul>
      )}
      {list.length > 5 && (
        <button className="btn small" onClick={() => setAll((v) => !v)}>
          {all ? 'Voir moins' : `Voir les ${list.length - 5} autres`}
        </button>
      )}
    </>
  )
}

function Composteurs({ garden, today }: { garden: Garden; today: Date }) {
  const [nom, setNom] = useState('')
  const [debut, setDebut] = useState(isoDate(today))
  const list = garden.composteurs ?? []
  return (
    <>
      <p className="small muted">Repères de la Métropole (à titre indicatif) : on retourne le compost toutes les 4 à 6 semaines ; il est mûr en 6 à 12 mois.</p>
      <ul className="coll-list">
        {list.map((c) => {
          const s = compostStatus(c, today)
          return (
            <li key={c.id} className={'coll-compost ' + s.state}>
              <strong>{c.nom}</strong>
              <span>{s.text}</span>
              <span className="row">
                <button className="btn small" onClick={() => turnComposteur(garden.id, c.id, isoDate(today))}>
                  Je l’ai retourné aujourd’hui
                </button>
                <button className="btn small" aria-label={`Retirer le composteur ${c.nom}`} onClick={() => removeComposteur(garden.id, c.id)}>
                  Retirer
                </button>
              </span>
            </li>
          )
        })}
      </ul>
      {list.length < 6 && (
        <div className="coll-grid">
          <label className="field">
            <span>Nom du composteur</span>
            <input className="input" value={nom} maxLength={40} placeholder="Bac 1" onChange={(e) => setNom(e.target.value)} />
          </label>
          <label className="field">
            <span>Mis en route le</span>
            <input className="input" type="date" value={debut} onChange={(e) => setDebut(e.target.value)} />
          </label>
          <button className="btn" onClick={() => (addComposteur(garden.id, nom, debut), setNom(''))}>
            Ajouter un composteur
          </button>
        </div>
      )}
    </>
  )
}

function Biodiversite({ garden }: { garden: Garden }) {
  const have = new Set(garden.habitats ?? [])
  return (
    <>
      <p className="small muted">Cochez ce que vous avez déjà. Chaque aménagement donne une idée simple.</p>
      <ul className="coll-list">
        {HABITATS.map((h) => (
          <li key={h.id}>
            <label className="check-row">
              <input type="checkbox" checked={have.has(h.id)} onChange={(e) => toggleHabitat(garden.id, h.id, e.target.checked)} />
              <span>
                <strong>{h.label}</strong>
                <br />
                <span className="small muted">{h.idea}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>
      <h3 className="coll-h3">Deux plantes à ne pas planter</h3>
      <p className="small muted">La Métropole Rouen Normandie les signale comme très communes et nuisibles à la nature en Normandie.</p>
      <ul className="coll-list">
        {INVASIVES.map((i) => (
          <li key={i.id}>
            <strong>{i.titre}</strong>
            <span className="small">{i.texte}</span>
          </li>
        ))}
      </ul>
    </>
  )
}

function Chantier({ garden }: { garden: Garden }) {
  const [f, setF] = useState<ChantierForm>({ ...EMPTY_CHANTIER, organisateur: garden.collectif?.coordinateur ?? '' })
  const [manual, setManual] = useState('')
  const set = (patch: Partial<ChantierForm>) => setF((x) => ({ ...x, ...patch }))
  const check = () => {
    const err = chantierValid(f)
    if (err) showToast({ message: err })
    return !err
  }
  return (
    <>
      <p className="small muted">Préparez une invitation à envoyer par message. Les réponses se font par message : l’appli ne compte pas les inscriptions.</p>
      <div className="coll-grid">
        <label className="field">
          <span>Titre</span>
          <input className="input" value={f.titre} maxLength={80} placeholder="Plantation de la haie" onChange={(e) => set({ titre: e.target.value })} />
        </label>
        <label className="field">
          <span>Jour</span>
          <input className="input" type="date" value={f.date} onChange={(e) => set({ date: e.target.value })} />
        </label>
        <label className="field">
          <span>Heure</span>
          <input className="input" type="time" value={f.heure} onChange={(e) => set({ heure: e.target.value })} />
        </label>
        <label className="field">
          <span>Durée (heures)</span>
          <input className="input" type="number" min={1} max={12} value={f.dureeH} onChange={(e) => set({ dureeH: Number(e.target.value) })} />
        </label>
        <label className="field">
          <span>Où</span>
          <input className="input" value={f.lieu} maxLength={120} placeholder="Devant le portail du jardin" onChange={(e) => set({ lieu: e.target.value })} />
        </label>
        <label className="field">
          <span>À apporter (facultatif)</span>
          <input className="input" value={f.apporter} maxLength={200} placeholder="Gants, pelle, bonne humeur" onChange={(e) => set({ apporter: e.target.value })} />
        </label>
        <label className="field">
          <span>Organisé par</span>
          <input className="input" value={f.organisateur} maxLength={60} onChange={(e) => set({ organisateur: e.target.value })} />
        </label>
      </div>
      <div className="row">
        <button
          className="btn primary"
          onClick={async () => {
            if (!check()) return
            const text = chantierText(f)
            const r = await shareOrCopy(text, f.titre)
            if (r === 'copied') showToast({ message: 'Invitation copiée. Collez-la dans un message.' })
            if (r === 'manual') setManual(text)
          }}
        >
          Partager l’invitation
        </button>
        <button
          className="btn"
          onClick={() => {
            if (!check()) return
            const e = chantierEvent(f, 'chantier-' + f.date + '-' + f.heure.replace(':', ''))
            const ics = e && buildEventIcs(e)
            if (!e || !ics) return showToast({ message: 'Cette date n’est pas lisible.' })
            downloadBlob(new Blob([ics], { type: 'text/calendar;charset=utf-8' }), eventIcsFilename(f.titre))
            showToast({ message: 'Fichier enregistré. Ouvrez-le pour l’ajouter à votre agenda.' })
          }}
        >
          <Icon name="calendar" size={16} /> Ajouter à mon calendrier
        </button>
      </div>
      {manual && <textarea className="input" readOnly rows={6} value={manual} aria-label="Invitation à copier" onFocus={(e) => e.currentTarget.select()} />}
    </>
  )
}

export default function CollectifScreen({ section }: { section?: SectionId }) {
  const garden = useActiveGarden()
  const plants = useGardenPlants(garden?.id)
  const today = useMemo(() => new Date(), [])
  const ref = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState<SectionId | undefined>(section)
  const [year] = useState(today.getFullYear())
  useInertBehind(true)
  const backRef = useRef(close)
  useEffect(() => ref.current?.focus({ preventScroll: true }), [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !document.querySelector('dialog[open]') && backRef.current()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  return (
    <div ref={ref} className="tf-overlay ennuis collectif" role="dialog" aria-modal="true" aria-label={COLLECTIF_TITLE} data-feat="jardin-collectif" tabIndex={-1}>
      <Layer onBack={() => backRef.current()} />
      <header className="tf-head">
        <button className="btn tf-top" onClick={close}>
          <Icon name="back" size={18} /> Retour
        </button>
        <button className="btn tf-top" onClick={goHome}>
          <Icon name="home" size={18} /> Accueil
        </button>
        <h1>{COLLECTIF_TITLE}</h1>
      </header>
      <div className="tf-body ennui-body">
        {!garden ? (
          <p>Ajoutez d’abord un jardin.</p>
        ) : (
          <>
            <p className="small muted">Pour un jardin partagé, familial ou de quartier : responsable, parcelles, gestes de compostage, bilan et dossier à imprimer. Tout reste dans l’appli : rien n’est envoyé à une collectivité.</p>
            <Section id="responsable" title="Qui coordonne le jardin" feat="collectif-responsable" open={open === 'responsable'} onOpen={setOpen}>
              <Responsable garden={garden} />
            </Section>
            <Section id="parcelles" title="Parcelles individuelles" feat="parcelles" open={open === 'parcelles'} onOpen={setOpen}>
              <Parcelles garden={garden} />
            </Section>
            <Section id="gestes" title="Gestes et bilan de l’année" feat="bilan-gestes" open={open === 'gestes'} onOpen={setOpen}>
              <Gestes garden={garden} today={today} />
            </Section>
            <Section id="composteurs" title="Composteurs" feat="suivi-compost" open={open === 'composteurs'} onOpen={setOpen}>
              <Composteurs garden={garden} today={today} />
            </Section>
            <Section id="biodiversite" title="Pour la biodiversité" feat="biodiversite" open={open === 'biodiversite'} onOpen={setOpen}>
              <Biodiversite garden={garden} />
            </Section>
            <Section id="chantier" title="Inviter à un chantier" feat="chantier-participatif" open={open === 'chantier'} onOpen={setOpen}>
              <Chantier garden={garden} />
            </Section>
            <Section id="dossier" title="Dossier à imprimer" feat="dossier-jardin" open={open === 'dossier'} onOpen={setOpen}>
              <p className="small muted">Une feuille avec le plan du jardin, les parcelles, les plantes, le bilan de {year} et le responsable. Vérifiez-la avant de la donner.</p>
              <div className="row">
                <button className="btn primary" onClick={printDossier}>
                  <Icon name="download" size={16} /> Imprimer le dossier
                </button>
                <button className="btn" onClick={() => void copyText(`${garden.name} : ${plants.length} plantes`).then(() => showToast({ message: 'Résumé copié.' }))}>
                  Copier un résumé
                </button>
              </div>
            </Section>
            <DossierSheet garden={garden} plants={plants} year={year} today={today} />
          </>
        )}
      </div>
    </div>
  )
}

import { useEffect, useMemo, useRef, useState } from 'react'
import { Icon } from '../../components/Icon'
import { ENNUIS, getEnnui } from '../../data/ravageurs'
import type { Ennui } from '../../data/ravageurs/types'
import { SPECIES_BY_ID } from '../../data/species'
import { MONTH_NAMES } from '../../engine/calendar'
import { goHome } from '../../lib/goHome'
import { useInertBehind } from '../../lib/inert'
import { ennuisOpen } from '../../lib/overlays'
import { openSpecies, useBackLayer } from '../../lib/ui'
import { useActiveGarden, useGardenPlants } from '../../lib/store'
import { RUN_DELAY_MS } from '../aide/ToutFaire'
import { EnnuiIcon } from './EnnuiIcon'
import { filterEnnuis, GROUPS, monthsText, NO_FILTER, touchesMyPlants, TYPE_LABEL, type EnnuiFilter, type EnnuiGroup } from './filter'
import '../../styles/novice-pages.css'
import '../../styles/ennuis.css'

export const ENNUIS_TITLE = 'Reconnaître un ennui du jardin'

/** Vrai tant qu'un jardinier n'a pas relu les fiches (voir docs/RELECTURE-ENNUIS.md) : la mention s'affiche. */
export const A_RELIRE = true
export const NOTE_CONTENU = A_RELIRE ? 'Conseils généraux, sans produit chimique de synthèse. Contenu à relire par un jardinier.' : 'Conseils généraux, sans produit chimique de synthèse.'

const close = () => ennuisOpen.set(undefined)

/** Un calque de Retour par écran : fermé puis rouvert dans le même tour, il réutilise son entrée d'historique. */
function Layer({ onBack }: { onBack: () => void }) {
  useBackLayer(true, onBack)
  return null
}

/** Ferme le guide, puis ouvre la fiche de la plante (le Retour d'Android a fini de retirer son entrée). */
function goToSpecies(id: string) {
  close()
  window.setTimeout(() => openSpecies(id), RUN_DELAY_MS)
}

function Lines({ items }: { items: string[] }) {
  return (
    <ul className="ennui-lines">
      {items.map((t, i) => (
        <li key={i}>{t}</li>
      ))}
    </ul>
  )
}

/** La fiche d'un ennui : ce que je vois, quand, comment l'éviter, que faire, quand demander conseil. */
export function EnnuiSheet({ e, mine, onSpecies }: { e: Ennui; mine: ReadonlySet<string>; onSpecies: (id: string) => void }) {
  // Les plantes du jardin d'abord ; un identifiant inconnu du catalogue n'est jamais proposé.
  const plants = e.planteIds.filter((id) => SPECIES_BY_ID[id]).sort((a, b) => Number(mine.has(b)) - Number(mine.has(a)))
  return (
    <article className="ennui-sheet" data-ennui={e.id}>
      <p className="ennui-type">
        <EnnuiIcon type={e.type} size={22} /> {TYPE_LABEL[e.type]}
      </p>
      <section aria-labelledby={`ennui-${e.id}-voir`}>
        <h2 id={`ennui-${e.id}-voir`}>Ce que je vois</h2>
        <Lines items={e.signes} />
      </section>
      <section aria-labelledby={`ennui-${e.id}-quand`}>
        <h2 id={`ennui-${e.id}-quand`}>Quand</h2>
        <p>On le voit surtout {monthsText(e.mois)}.</p>
      </section>
      <section aria-labelledby={`ennui-${e.id}-eviter`}>
        <h2 id={`ennui-${e.id}-eviter`}>Pour l’éviter</h2>
        <Lines items={e.prevenir} />
      </section>
      <section aria-labelledby={`ennui-${e.id}-agir`}>
        <h2 id={`ennui-${e.id}-agir`}>Que faire</h2>
        <Lines items={e.agir} />
      </section>
      {e.avertissement && (
        <aside className="ennui-warn" role="note">
          <Icon name="alert" size={22} />
          <div>
            <strong>Attention</strong>
            <p>{e.avertissement}</p>
          </div>
        </aside>
      )}
      <section aria-labelledby={`ennui-${e.id}-conseil`}>
        <h2 id={`ennui-${e.id}-conseil`}>Quand demander conseil</h2>
        <p>{e.inquietude}</p>
      </section>
      {plants.length > 0 && (
        <section aria-labelledby={`ennui-${e.id}-plantes`}>
          <h2 id={`ennui-${e.id}-plantes`}>Plantes concernées</h2>
          <ul className="ennui-chips">
            {plants.map((id) => (
              <li key={id}>
                <button className="btn chip-filter ennui-chip" aria-label={mine.has(id) ? `${SPECIES_BY_ID[id].nomCommun} (dans votre jardin)` : undefined} onClick={() => onSpecies(id)}>
                  {mine.has(id) && <Icon name="check" size={16} />}
                  {SPECIES_BY_ID[id].nomCommun}
                </button>
              </li>
            ))}
          </ul>
          {plants.some((id) => mine.has(id)) && <p className="small muted">Les plantes marquées d’une coche sont dans votre jardin.</p>}
        </section>
      )}
      <p className="small muted ennui-source">Source : {e.source}.</p>
      <p className="small muted">{NOTE_CONTENU}</p>
    </article>
  )
}

/** Guide « bestioles et maladies du jardin » : une liste qu'on cherche par un signe ou un nom, et une fiche par ennui. */
export default function EnnuisScreen({ initialId }: { initialId?: string }) {
  const garden = useActiveGarden()
  const plants = useGardenPlants(garden?.id)
  const ref = useRef<HTMLDivElement>(null)
  const [f, setF] = useState<EnnuiFilter>(NO_FILTER)
  const [openId, setOpenId] = useState<string | undefined>(() => (initialId && getEnnui(initialId) ? initialId : undefined))
  const month = new Date().getMonth() + 1
  const mine = useMemo<ReadonlySet<string>>(() => new Set(plants.map((p) => p.speciesId)), [plants])
  const list = useMemo(() => filterEnnuis(ENNUIS, f, { month, speciesIds: mine }), [f, month, mine])
  const current = openId ? getEnnui(openId) : undefined
  const filtered = f.groups.length > 0 || f.thisMonth || f.mine
  const set = (patch: Partial<EnnuiFilter>) => setF((x) => ({ ...x, ...patch }))
  const toggleGroup = (g: EnnuiGroup) => set({ groups: f.groups.includes(g) ? f.groups.filter((x) => x !== g) : [...f.groups, g] })

  const back = () => (current ? setOpenId(undefined) : close())
  const backRef = useRef(back)
  backRef.current = back
  useInertBehind(true)
  const sheetRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current?.focus({ preventScroll: true })
    if (current) sheetRef.current?.scrollTo?.({ top: 0 })
  }, [openId]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !document.querySelector('dialog[open]') && backRef.current()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div ref={ref} className="tf-overlay ennuis" role="dialog" aria-modal="true" aria-label={current ? current.nom : ENNUIS_TITLE} data-feat="guide-ennuis" tabIndex={-1}>
      <Layer key={openId ?? 'liste'} onBack={() => backRef.current()} />
      <header className="tf-head">
        <button className="btn tf-top" onClick={back}>
          <Icon name="back" size={18} /> {current ? 'Retour à la liste' : 'Retour'}
        </button>
        <button className="btn tf-top" onClick={goHome}>
          <Icon name="home" size={18} /> Accueil
        </button>
        <h1>{current ? current.nom : ENNUIS_TITLE}</h1>
      </header>

      <div className="tf-body ennui-body" hidden={!!current}>
        <label className="ennui-ask" htmlFor="ennui-q">
          Chercher un signe ou un nom : feuilles collantes, taches brunes, trous…
        </label>
        <div className="tf-search ennui-search">
          <Icon name="search" size={20} />
          <input
            id="ennui-q"
            className="input"
            type="search"
            inputMode="search"
            enterKeyHint="search"
            autoComplete="off"
            placeholder="Un signe ou un nom"
            value={f.query}
            onChange={(e) => set({ query: e.target.value })}
          />
        </div>
        <div className="row chip-filters" role="group" aria-label="Type d’ennui">
          {GROUPS.map((g) => (
            <button key={g.id} className={'btn chip-filter' + (f.groups.includes(g.id) ? ' primary' : '')} aria-pressed={f.groups.includes(g.id)} onClick={() => toggleGroup(g.id)}>
              {f.groups.includes(g.id) && <Icon name="check" size={16} />}
              {g.label}
            </button>
          ))}
        </div>
        <label className="check-row">
          <input type="checkbox" checked={f.thisMonth} onChange={(e) => set({ thisMonth: e.target.checked })} />
          <span>Seulement ce que je peux voir ce mois-ci ({MONTH_NAMES[month - 1]})</span>
        </label>
        <label className="check-row">
          <input type="checkbox" checked={f.mine && mine.size > 0} disabled={mine.size === 0} onChange={(e) => set({ mine: e.target.checked })} />
          <span>Seulement pour mes plantes{mine.size === 0 ? ' (ajoutez d’abord une plante)' : ''}</span>
        </label>
        <p className="small muted ennui-count" role="status" aria-live="polite">
          {list.length === 0 ? '' : `${list.length} fiche${list.length > 1 ? 's' : ''}.`}
        </p>
        {list.length === 0 ? (
          <div className="ennui-none" role="status">
            <p>Rien ne correspond : essayez un autre mot.</p>
            {(filtered || f.query.trim() !== '') && (
              <button className="btn" onClick={() => setF(NO_FILTER)}>
                Tout effacer
              </button>
            )}
          </div>
        ) : (
          <ul className="ennui-list">
            {list.map((e) => (
              <li key={e.id}>
                <button className="ennui-row" data-ennui-id={e.id} onClick={() => setOpenId(e.id)}>
                  <span className="ennui-row-icon">
                    <EnnuiIcon type={e.type} />
                  </span>
                  <span className="ennui-row-text">
                    <strong>{e.nom}</strong>
                    <span>
                      {TYPE_LABEL[e.type]}
                      {e.mois.includes(month) ? ' · à voir ce mois-ci' : ''}
                      {touchesMyPlants(e, mine) ? ' · vos plantes' : ''}
                    </span>
                  </span>
                  <Icon name="forward" size={20} />
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="small muted ennui-note">{NOTE_CONTENU}</p>
      </div>

      {current && (
        <div className="tf-body ennui-body ennui-read" ref={sheetRef}>
          <EnnuiSheet e={current} mine={mine} onSpecies={goToSpecies} />
          <button className="btn ennui-back" onClick={() => setOpenId(undefined)}>
            <Icon name="back" size={18} /> Retour à la liste
          </button>
        </div>
      )}
    </div>
  )
}

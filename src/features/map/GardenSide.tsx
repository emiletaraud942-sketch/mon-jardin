import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { SPECIES_BY_ID } from '../../data/species'
import { STATUS_LABEL } from '../../data/labels'
import { Icon } from '../../components/Icon'
import { SpeciesPicker } from '../../components/SpeciesPicker'
import { UNKNOWN_SPECIES_ID, yourPlant } from '../../lib/customName'
import { useInertBehind } from '../../lib/inert'
import { useGardenPlants, useStore } from '../../lib/store'
import { identifyOpen } from '../../lib/overlays'
import { closeFiche, closePlantSheet, openHelp, setUi, startPlacing, stopPlacing, useUi } from '../../lib/ui'
import type { Garden } from '../../types'
import { PlantPanel, plantName } from '../plants/PlantPanel'
import { openScan } from '../scan/scanUi'
import { openPanorama } from '../panorama/panoUi'
import { useIsMobile } from '../../components/useMedia'
import { confirmBeforePlacing, nudgeAim, placeAtAim, usePlacingInfo } from './aimBridge'
import { AIM_NUDGE_M } from './nudge'
import { usePlacingReserve } from './placingReserve'
import { SiteNote } from './SiteNote'

const MAX_LISTED = 60

/** Titre et résumé de l'en-tête de la feuille du bas : la plante choisie, sinon le jardin et le nombre de plantes. */
export function useSheetHead(garden: Garden): { title: string; summary: string } {
  const plants = useGardenPlants(garden.id)
  const { selectedPlantId } = useUi()
  const sel = plants.find((p) => p.id === selectedPlantId)
  if (sel) return { title: plantName(sel), summary: STATUS_LABEL[sel.status] }
  return { title: garden.name, summary: `${plants.length} plante${plants.length > 1 ? 's' : ''}` }
}

/** Fiche plante en plein écran (carte) : fenêtre modale, le reste de la page est inerte. */
function FicheOverlay({ label, children }: { label: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useInertBehind(true)
  useEffect(() => ref.current?.focus({ preventScroll: true }), [])
  return (
    <div ref={ref} className="fiche-overlay" role="dialog" aria-modal="true" aria-label={`Fiche : ${label}`} tabIndex={-1}>
      {children}
    </div>
  )
}

/** Panneau latéral de la carte. */
export function GardenSide({ garden, hint }: { garden: Garden; hint: string }) {
  const plants = useGardenPlants(garden.id)
  const { selectedPlantId, movingPlantId, placingSpeciesId, ficheOpenId } = useUi()
  const [picking, setPicking] = useState(false)
  const mobile = useIsMobile()
  const selected = plants.find((p) => p.id === selectedPlantId)

  // Téléphone : toucher une plante la CHOISIT seulement (petite carte d'infos sur la carte : `PlantPeek`). La fiche plein écran ne s'ouvre que
  // sur « Fiche » : avant, elle recouvrait la carte à chaque toucher et après chaque déplacement.
  if (selected && mobile) {
    if (movingPlantId || placingSpeciesId || ficheOpenId !== selected.id) return null
    return createPortal(
      <FicheOverlay label={plantName(selected)}>
        <PlantPanel garden={garden} plant={selected} onClose={closeFiche} fiche onShowOnMap={() => setUi({ tab: 'carte', focusPlantId: selected.id, selectedPlantId: undefined })} />
      </FicheOverlay>,
      document.body,
    )
  }
  if (selected) return <PlantPanel garden={garden} plant={selected} onClose={closePlantSheet} />

  return (
    <div className="stack plants-ui" style={{ gap: 12 }}>
      <div className="gs-head">
        <h2 style={{ marginBottom: 2 }}>{garden.name}</h2>
        <div className="muted small">
          {garden.areaM2 ? `${garden.areaM2} m² · ` : ''}
          {plants.length} plante{plants.length > 1 ? 's' : ''}
        </div>
      </div>
      <button className="btn primary" onClick={() => setPicking(true)}>
        <Icon name="plus" /> Ajouter une plante au jardin
      </button>
      <button className="btn" aria-haspopup="dialog" onClick={() => openPanorama('home')}>
        <Icon name="camera" /> Photos du jardin{(garden.panoramas?.length ?? 0) > 0 ? ` (${garden.panoramas!.length})` : ''}
      </button>
      <details className="np-details">
        <summary>Scanner, identifier par photo</summary>
        <div className="stack" style={{ gap: 8 }}>
          <button className="btn" onClick={() => openScan('menu')}>
            <Icon name="camera" /> Scanner mon jardin
          </button>
          <button className="btn" aria-haspopup="dialog" onClick={() => identifyOpen.set(true)}>
            <Icon name="camera" /> Identifier une plante par photo
          </button>
        </div>
      </details>
      <p className="muted small">{hint}</p>
      <button className="btn ghost small" aria-haspopup="dialog" onClick={openHelp}>
        Aide sur cet écran
      </button>
      {plants.length > 0 && (
        <ul className="list small">
          {plants.slice(0, MAX_LISTED).map((p) => {
            const s = SPECIES_BY_ID[p.speciesId]
            return (
              <li key={p.id}>
                <button className="btn ghost small tall plant-row" style={{ width: '100%', justifyContent: 'flex-start' }} onClick={() => setUi({ selectedPlantId: p.id, focusPlantId: p.id })}>
                  <span className="dot" style={{ background: s?.couleurAccent ?? s?.couleur ?? 'var(--accent-2)' }} /> {plantName(p)}
                  {p.status !== 'en-place' && <span className="badge">{STATUS_LABEL[p.status]}</span>}
                </button>
              </li>
            )
          })}
          {plants.length > MAX_LISTED && (
            <li className="muted">
              + {plants.length - MAX_LISTED} autres : voir l’écran « Plantes ».
            </li>
          )}
        </ul>
      )}
      {picking && (
        <SpeciesPicker
          title="Quelle plante ajouter ?"
          onClose={() => setPicking(false)}
          onScan={() => {
            setPicking(false)
            openScan('menu')
          }}
          onPick={(s) => {
            setPicking(false)
            startPlacing(s.id)
          }}
          onPickCustom={(name) => {
            setPicking(false)
            startPlacing(UNKNOWN_SPECIES_ID, { customName: name })
          }}
        />
      )}
    </div>
  )
}

/**
 * Consigne affichée tant qu'une plante est à placer ou à déplacer : grande, avec « Valider » et « Annuler » toujours visibles.
 * Trois gestes : « Ajouter une plante » (2 touchers pour la choisir), toucher la carte (ou viser), « Valider ».
 */
export function PlacingBanner() {
  const { placingSpeciesId, placingCustomName, placingSeries, movingPlantId, aim, placingSpot } = useUi()
  const moving = useStore((s) => (movingPlantId ? s.plants.find((p) => p.id === movingPlantId) : undefined))
  const info = usePlacingInfo()
  const reserve = usePlacingReserve()
  if (!placingSpeciesId && !movingPlantId) return null
  const name = movingPlantId
    ? moving
      ? plantName(moving)
      : 'plante'
    : placingCustomName || (placingSpeciesId && placingSpeciesId !== UNKNOWN_SPECIES_ID ? SPECIES_BY_ID[placingSpeciesId]?.nomCommun : undefined) || 'plante'
  const confirm = aim || confirmBeforePlacing()
  const ready = aim || !!placingSpot
  const text = aim
    ? `Mettez la croix sur ${yourPlant(name)}.`
    : ready
      ? 'C’est bien là ? Touchez Valider, ou un autre endroit.'
      : movingPlantId
        ? `Touchez le nouvel endroit de ${yourPlant(name)}.`
        : `Touchez l’endroit de ${yourPlant(name)}.`
  return (
    <div className="floating placing-banner" role="status" ref={reserve}>
      <Icon name={movingPlantId ? 'move' : 'pin'} size={28} />
      <span className="placing-text">
        <strong>{text}</strong>
        {placingSeries && placingSeries.count > 0 && (
          <span className="small muted" style={{ display: 'block' }}>
            {placingSeries.count} plante{placingSeries.count > 1 ? 's' : ''} placée{placingSeries.count > 1 ? 's' : ''}. Touchez encore pour en ajouter.
          </span>
        )}
        {info.summary && <span className="small placing-dist">{info.summary}</span>}
        <SiteNote />
        {info.note && <span className="small placing-note">{info.note}</span>}
        {confirm && !aim && !ready && !info.note && <span className="small muted placing-hint">Pour viser avec précision : touchez « Loupe » ou « Viser ».</span>}
      </span>
      {ready && confirm && (
        <span className="placing-nudge" role="group" aria-label="Ajuster l’endroit de 10 centimètres" data-feat="ajuster-placement">
          <span className="placing-nudge-word">Ajuster 10 cm</span>
          <button className="btn small" aria-label="Un peu à gauche" onClick={() => nudgeAim(-AIM_NUDGE_M, 0)}>
            ←
          </button>
          <button className="btn small" aria-label="Un peu vers le haut" onClick={() => nudgeAim(0, AIM_NUDGE_M)}>
            ↑
          </button>
          <button className="btn small" aria-label="Un peu vers le bas" onClick={() => nudgeAim(0, -AIM_NUDGE_M)}>
            ↓
          </button>
          <button className="btn small" aria-label="Un peu à droite" onClick={() => nudgeAim(AIM_NUDGE_M, 0)}>
            →
          </button>
        </span>
      )}
      <span className="placing-actions">
        {confirm && (
          <button className="btn primary placing-ok" disabled={!ready} onClick={placeAtAim}>
            <Icon name="check" size={20} /> Valider
          </button>
        )}
        <button className={'btn placing-cancel' + (placingSeries && placingSeries.count > 0 ? ' primary' : '')} onClick={stopPlacing}>
          {placingSeries && placingSeries.count > 0 ? 'Terminé' : 'Annuler'}
        </button>
      </span>
    </div>
  )
}

import { useState } from 'react'
import { Icon } from '../../components/Icon'
import { PageHead } from '../../components/PageHead'
import { SPECIES_BY_ID } from '../../data/species'
import { PHOTO_IDS } from '../../data/species/photoIds'
import { FEATURES, visibleFeatures } from '../../lib/features'
import { HUBS, hubById, readyToHarvest, type Hub, type HubId, type HubItem } from '../../lib/hubs'
import { homeHub } from '../../lib/overlays'
import { useBackLayer } from '../../lib/ui'
import { PendingScanButton } from '../scan/PendingScanButton'
import { useGardenPlants } from '../../lib/store'
import type { Garden } from '../../types'
import '../../styles/hubs.css'

/** Photo d'une plante pour décorer un choix (une photo libre déjà dans l'appli, voir `public/plantes/credits.json`). */
const ITEM_PHOTO: Record<string, string> = {
  'ajouter-plante': 'lilas',
  'ou-planter': 'romarin',
  carte: 'tilleul',
  'mes-plantes': 'hortensia',
  catalogue: 'hemerocalle',
  'apprendre-jardiner': 'lavande',
  'scanner-etiquette': 'cardon',
  identifier: 'camomille',
  scanner: 'bouleau',
  'rotation-potager': 'rutabaga',
  'a-faire': 'basilic',
  meteo: 'bouleau',
  'guide-ravageurs': 'ortie',
  'conseils-compost-eau': 'sureau-noir',
  calendrier: 'camomille',
  'semer-mois': 'cresson-alenois',
  rappels: 'laurier-palme',
  'imprimer-semaine': 'charme',
  'journal-jardin': 'hetre',
  'mes-graines': 'cardon',
  'liste-courses': 'robinier',
}
const HUB_PHOTO: Record<HubId, string> = { cultiver: 'lavande', entretenir: 'romarin', consommer: 'pommier' }

const photoSrc = (id: string | undefined) => (id && PHOTO_IDS.has(id) ? `/plantes/${id}.jpg` : undefined)

function runFeature(featureId: string) {
  FEATURES.find((f) => f.id === featureId)?.run()
}

/** Zones de la feuille, de haut en bas : le fruit (consommer), la feuille (entretenir), la tige (cultiver). */
const ZONES: { id: HubId; t: number; h: number }[] = [
  { id: 'consommer', t: 0, h: 0.34 },
  { id: 'entretenir', t: 0.34, h: 0.33 },
  { id: 'cultiver', t: 0.67, h: 0.33 },
]

/** L'accueil : une vraie feuille de chêne (photo) découpée en trois parties à toucher. */
export function LeafHome({ who, alertText, onAlert, onHelp }: { who?: string; alertText?: string; onAlert: () => void; onHelp: () => void }) {
  return (
    <section className="leafhome" aria-label="Que voulez-vous faire ?">
      <PageHead compact title={who ? `Bonjour ${who}` : 'Bonjour'} onHelp={onHelp} />
      {alertText && (
        <button className="leafhome-alert" onClick={onAlert}>
          <Icon name="alert" size={20} />
          <span>{alertText}</span>
        </button>
      )}
      <div className="leaf" role="group" aria-label="Les trois parties de votre jardin">
        <img className="leaf-img" src="/accueil/feuille-chene.webp" alt="" width={466} height={612} decoding="async" />
        <span className="leaf-tint-all" aria-hidden />
        {ZONES.map((z) => {
          const hub = hubById(z.id)
          return (
            <button
              key={z.id}
              className={'leaf-zone leaf-' + z.id}
              style={{ ['--t' as string]: z.t, ['--h' as string]: z.h }}
              data-hub={z.id}
              aria-label={`${hub.mot} : ${hub.phrase}`}
              onClick={() => homeHub.set(z.id)}
            >
              <span className="leaf-text" aria-hidden>
                <span className="leaf-word">{hub.mot}</span>
                <span className="leaf-sub">{hub.phrase}</span>
              </span>
            </button>
          )
        })}
      </div>
      <p className="leafhome-hint">Que voulez-vous faire ? Touchez une partie de la feuille.</p>
      <button className="leafhome-more" data-home-more onClick={() => homeHub.set('plus')}>
        Plus de choses
      </button>
    </section>
  )
}

function ItemCard({ item }: { item: HubItem }) {
  const src = photoSrc(ITEM_PHOTO[item.featureId])
  return (
    <button className="hub-card" data-feat-run={item.featureId} onClick={() => runFeature(item.featureId)}>
      {src ? <img className="hub-card-photo" src={src} alt="" loading="lazy" decoding="async" /> : <span className="hub-card-icon" aria-hidden><Icon name={item.icon} size={26} /></span>}
      <span className="hub-card-text">
        <strong>{item.mot.replace(/ ([?!:;])/g, '\u202F$1')}</strong>
        <span>{item.phrase}</span>
      </span>
      <span className="hub-card-chev" aria-hidden>
        <span style={{ display: 'inline-flex', transform: 'rotate(-90deg)' }}>
          <Icon name="chevron" size={18} />
        </span>
      </span>
    </button>
  )
}

/** « Prêt à récolter » : les plantes en place dont le mois de récolte est celui d'aujourd'hui. */
function HarvestNow({ garden }: { garden: Garden }) {
  const plants = useGardenPlants(garden.id)
  const names = readyToHarvest(plants, SPECIES_BY_ID, new Date().getMonth() + 1)
  return (
    <section className="hub-harvest" aria-label="Prêt à récolter">
      <img className="hub-harvest-photo" src="/plantes/pommier.jpg" alt="" loading="lazy" decoding="async" />
      <div className="hub-harvest-text">
        <h2>Prêt à récolter</h2>
        {names.length > 0 ? (
          <ul>
            {names.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        ) : (
          <p>Rien n’est prêt ce mois-ci. Voyez le calendrier ci-dessous.</p>
        )}
      </div>
    </section>
  )
}

/** Une des trois parties : jusqu'à trois gros choix, le reste derrière « Voir plus ». */
export function HubPage({ hub, garden }: { hub: Hub; garden: Garden }) {
  const [more, setMore] = useState(false)
  const shown = new Set(visibleFeatures().map((f) => f.id))
  const main = hub.main.filter((i) => shown.has(i.featureId))
  const rest = hub.more.filter((i) => shown.has(i.featureId))
  useBackLayer(true, () => homeHub.set(undefined))
  return (
    <div className="page hub" data-hub-page={hub.id}>
      <button className="hub-back" onClick={() => homeHub.set(undefined)}>
        <span style={{ display: 'inline-flex', transform: 'rotate(90deg)' }}>
          <Icon name="chevron" size={20} />
        </span>
        Accueil
      </button>
      <header className={'hub-banner hub-banner-' + hub.id}>
        <img src={photoSrc(HUB_PHOTO[hub.id])} alt="" decoding="async" />
        <div className="hub-banner-text">
          <span className="hub-banner-tag">{hub.mot}</span>
          <h1>{hub.title}</h1>
        </div>
      </header>
      {hub.id === 'consommer' && <HarvestNow garden={garden} />}
      {hub.id === 'cultiver' && <PendingScanButton gardenId={garden.id} className="btn primary big" />}
      <div className="hub-cards">
        {main.map((i) => (
          <ItemCard key={i.featureId} item={i} />
        ))}
      </div>
      {rest.length > 0 && (
        <>
          <button className="hub-more" aria-expanded={more} onClick={() => setMore(!more)}>
            {more ? 'Voir moins' : 'Voir plus'}
          </button>
          {more && (
            <div className="hub-cards hub-cards-more">
              {rest.map((i) => (
                <ItemCard key={i.featureId} item={i} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

export { HUBS }

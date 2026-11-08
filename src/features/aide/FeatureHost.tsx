import { SpeciesPicker } from '../../components/SpeciesPicker'
import { Modal } from '../../components/Modal'
import { UNKNOWN_SPECIES_ID } from '../../lib/customName'
import { applyToPlant, plantsFor } from '../../lib/features'
import { addPicker, identifyOpen, plantChoice, shoppingOpen, type PlantAsk } from '../../lib/overlays'
import { reveal } from '../../lib/reveal'
import { useActiveGarden, useGardenPlants } from '../../lib/store'
import { startPlacing } from '../../lib/ui'
import { IdentifyDialog } from '../plants/IdentifyDialog'
import { plantName } from '../plants/PlantPanel'
import { ShoppingListDialog } from '../plants/ShoppingListDialog'
import { openScan } from '../scan/scanUi'

const ASK_TITLE: Record<PlantAsk, string> = {
  fiche: 'Quelle plante voulez-vous ouvrir ?',
  photos: 'À quelle plante ajouter une photo ?',
  croissance: 'Quelle plante voulez-vous suivre ?',
  recoltee: 'Quelle plante est récoltée ?',
  supprimer: 'Quelle plante voulez-vous supprimer ?',
  deplacer: 'Quelle plante voulez-vous déplacer ?',
}

/** Fenêtres qu'on ouvre depuis « Tout ce que je peux faire » ou « Je suis perdu », sur n'importe quel écran. */
export function FeatureHost() {
  const picker = addPicker.use()
  const identify = identifyOpen.use()
  const shopping = shoppingOpen.use()
  const ask = plantChoice.use()
  const garden = useActiveGarden()
  const plants = useGardenPlants(garden?.id)
  if (!garden) return null
  return (
    <>
      {picker && (
        <SpeciesPicker
          feat="picker"
          title="Quelle plante ajouter ?"
          onClose={() => addPicker.set(undefined)}
          onScan={() => {
            addPicker.set(undefined)
            openScan('menu')
          }}
          onPick={(s) => {
            addPicker.set(undefined)
            startPlacing(s.id)
            if (picker.then) void reveal(picker.then)
          }}
          onPickCustom={(name) => {
            addPicker.set(undefined)
            startPlacing(UNKNOWN_SPECIES_ID, { customName: name })
            if (picker.then) void reveal(picker.then)
          }}
        />
      )}
      {identify && <IdentifyDialog onClose={() => identifyOpen.set(false)} />}
      {shopping && <ShoppingListDialog garden={garden} plants={plants} onClose={() => shoppingOpen.set(false)} />}
      {ask && (
        <Modal title={ASK_TITLE[ask]} feat="choisir-plante" onClose={() => plantChoice.set(undefined)}>
          <ul className="list tf-plants">
            {plantsFor(ask).map((p) => (
              <li key={p.id}>
                <button
                  className="btn tf-plant"
                  onClick={() => {
                    plantChoice.set(undefined)
                    window.setTimeout(() => applyToPlant(ask, p.id), 160)
                  }}
                >
                  {plantName(p)}
                </button>
              </li>
            ))}
          </ul>
        </Modal>
      )}
    </>
  )
}

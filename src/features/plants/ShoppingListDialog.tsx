import { useRef, useState } from 'react'
import { Icon } from '../../components/Icon'
import { Modal } from '../../components/Modal'
import { SPECIES_BY_ID } from '../../data/species'
import { copyText, canShareText, shareOrCopy } from '../../lib/shareText'
import { showToast } from '../../lib/toast'
import type { Garden, Month, Plant } from '../../types'
import { buildShoppingList, itemWhen, shoppingText } from './shoppingList'

/** « Liste de courses et de semis » : les plantes prévues, regroupées par espèce, avec la bonne période. */
export function ShoppingListDialog({ garden, plants, onClose }: { garden: Garden; plants: Plant[]; onClose: () => void }) {
  const items = buildShoppingList(plants, SPECIES_BY_ID, garden, (new Date().getMonth() + 1) as Month)
  const text = shoppingText(items, garden.name)
  const [manual, setManual] = useState(false)
  const field = useRef<HTMLTextAreaElement>(null)
  const share = canShareText()

  async function go(mode: 'share' | 'copy') {
    const r = mode === 'share' ? await shareOrCopy(text, 'Liste de courses et de semis') : await copyText(text)
    if (r === 'copied') showToast({ message: 'Liste copiée. Collez-la dans vos notes ou un message.' })
    if (r === 'manual') {
      setManual(true)
      setTimeout(() => field.current?.select(), 0)
    }
  }

  return (
    <Modal title="Liste de courses et de semis" feat="shopping" onClose={onClose}>
      <div className="stack">
        {items.length === 0 ? (
          <p>Aucune plante prévue. Ajoutez une plante avec l’état « Prévue » pour la voir ici.</p>
        ) : (
          <ul className="list shop-list">
            {items.map((i) => (
              <li key={i.speciesId} className="shop-item">
                <strong>
                  {i.count} × {i.name}
                </strong>
                <span className="small muted shop-when">{itemWhen(i)}.{i.now ? ' À faire ce mois-ci.' : ''}</span>
                {i.note && <span className="small muted">{i.note}</span>}
              </li>
            ))}
          </ul>
        )}
        {items.length > 0 && (
          <div className="row">
            <button className="btn primary" onClick={() => void go(share ? 'share' : 'copy')}>
              <Icon name={share ? 'users' : 'download'} /> {share ? 'Partager la liste' : 'Copier la liste'}
            </button>
            {share && (
              <button className="btn" onClick={() => void go('copy')}>
                Copier
              </button>
            )}
          </div>
        )}
        {manual && <textarea ref={field} className="input" readOnly rows={6} value={text} aria-label="Liste à copier" onFocus={(e) => e.currentTarget.select()} />}
      </div>
    </Modal>
  )
}

// Changements du jardin collectif : chacun se fait en un geste et s'annule (↶, Ctrl/⌘+Z ou « Annuler » du message).
import { gridPlots, type GridOptions } from '../../engine/collectif'
import { uid } from '../../lib/geo'
import { recordWithToast } from '../../lib/history'
import { getState, updateGarden } from '../../lib/store'
import type { Collectif, Composteur, Garden, Geste, HabitatKind, Plot } from '../../types'

const garden = (id: string): Garden | undefined => getState().gardens.find((g) => g.id === id)

type Key = 'collectif' | 'gestes' | 'plots' | 'composteurs' | 'habitats'

/** Remplace un champ du jardin par `next` (undefined = le retire), avec annulation. */
function change<K extends Key>(gardenId: string, key: K, next: Garden[K], label: string, message: string) {
  const before = garden(gardenId)?.[key]
  const apply = (v: Garden[K]) => updateGarden(gardenId, { [key]: v } as Partial<Garden>)
  apply(next)
  recordWithToast({ label, undo: () => apply(before as Garden[K]), redo: () => apply(next) }, message)
}

const empty = <T,>(l: T[]): T[] | undefined => (l.length ? l : undefined)

export function setCollectif(gardenId: string, patch: Partial<Collectif>) {
  const cur = garden(gardenId)?.collectif ?? {}
  const merged: Collectif = { ...cur, ...patch }
  for (const k of Object.keys(merged) as (keyof Collectif)[]) if (!merged[k]) delete merged[k]
  change(gardenId, 'collectif', Object.keys(merged).length ? merged : undefined, 'Jardin collectif : informations', 'Informations du jardin collectif enregistrées.')
}

export function addGeste(gardenId: string, g: Omit<Geste, 'id'>) {
  const list = garden(gardenId)?.gestes ?? []
  change(gardenId, 'gestes', [...list, { ...g, id: uid() }], 'Geste ajouté', 'Geste ajouté au bilan.')
}
export function removeGeste(gardenId: string, id: string) {
  const list = (garden(gardenId)?.gestes ?? []).filter((g) => g.id !== id)
  change(gardenId, 'gestes', empty(list), 'Geste retiré', 'Geste retiré du bilan.')
}

export function createPlots(gardenId: string, o: GridOptions): number {
  const plots = gridPlots(o, uid)
  if (plots.length === 0) return 0
  change(gardenId, 'plots', plots, 'Parcelles créées', `${plots.length} parcelle${plots.length > 1 ? 's' : ''} créée${plots.length > 1 ? 's' : ''}.`)
  return plots.length
}
export function setHolder(gardenId: string, plotId: string, holder: string) {
  const list = (garden(gardenId)?.plots ?? []).map((p): Plot => (p.id === plotId ? { ...p, holder: holder.trim() || undefined } : p))
  change(gardenId, 'plots', empty(list), 'Parcelle attribuée', holder.trim() ? 'Parcelle attribuée.' : 'Attribution retirée.')
}
export function clearPlots(gardenId: string) {
  change(gardenId, 'plots', undefined, 'Parcelles retirées', 'Parcelles retirées.')
}

export function addComposteur(gardenId: string, nom: string, debut: string) {
  const list = garden(gardenId)?.composteurs ?? []
  change(gardenId, 'composteurs', [...list, { id: uid(), nom: nom.trim() || 'Composteur', debut }], 'Composteur ajouté', 'Composteur ajouté.')
}
export function turnComposteur(gardenId: string, id: string, today: string) {
  const list = (garden(gardenId)?.composteurs ?? []).map((c): Composteur => (c.id === id ? { ...c, retourne: today } : c))
  change(gardenId, 'composteurs', list, 'Composteur retourné', 'Retournement noté.')
}
export function removeComposteur(gardenId: string, id: string) {
  const list = (garden(gardenId)?.composteurs ?? []).filter((c) => c.id !== id)
  change(gardenId, 'composteurs', empty(list), 'Composteur retiré', 'Composteur retiré.')
}

export function toggleHabitat(gardenId: string, kind: HabitatKind, on: boolean) {
  const cur = garden(gardenId)?.habitats ?? []
  const list = on ? [...new Set([...cur, kind])] : cur.filter((k) => k !== kind)
  change(gardenId, 'habitats', empty(list), 'Habitats', on ? 'Aménagement noté.' : 'Aménagement retiré.')
}

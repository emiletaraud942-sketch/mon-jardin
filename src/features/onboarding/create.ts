import { DEMO_PLACE, demoPlants } from '../../data/demo'
import { uid } from '../../lib/geo'
import type { GeocodeResult } from '../../lib/ign'
import { addGarden, addPlant, getState } from '../../lib/store'
import type { Garden } from '../../types'
import { buildGarden, type Step } from '../settings/createGarden'
import { DEMO_GARDEN_NAME } from '../settings/demo'
import { uniqueGardenName } from '../settings/gardenName'

type OnStep = (id: Step['id'], state: Step['state'], detail?: string) => void

/** Crée le jardin à partir d'une adresse et l'ajoute (il devient le jardin actif). Les sources IGN en échec n'empêchent rien. */
export async function createRealGarden(place: GeocodeResult, name: string, onStep: OnStep): Promise<Garden> {
  const finalName = uniqueGardenName(name, getState().gardens.map((g) => g.name))
  const garden = await buildGarden(place, finalName, onStep)
  addGarden(garden)
  return garden
}

/** Ajoute le jardin d'exemple, avec ses plantes. */
export async function createDemoGarden(onStep: OnStep): Promise<Garden> {
  const finalName = uniqueGardenName(DEMO_GARDEN_NAME, getState().gardens.map((g) => g.name))
  const garden = await buildGarden(DEMO_PLACE, finalName, onStep)
  addGarden(garden)
  for (const pl of demoPlants(garden)) addPlant({ ...pl, id: uid() })
  return garden
}

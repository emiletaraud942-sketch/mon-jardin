import { FAMILY_INFO, type RotationZone } from '../../engine/rotation'

export interface PlantLine {
  key: string
  name: string
  count: number
  year: number
  simple: string
}

/** Plusieurs pieds du même légume la même année : une seule ligne (« Carotte, 5 pieds »). */
export function groupPlants(plants: RotationZone['plants']): PlantLine[] {
  const lines = new Map<string, PlantLine>()
  for (const p of plants) {
    const key = `${p.speciesId}|${p.year}`
    const line = lines.get(key)
    if (line) line.count += 1
    else lines.set(key, { key, name: p.name, count: 1, year: p.year, simple: FAMILY_INFO[p.family].simple })
  }
  return [...lines.values()]
}

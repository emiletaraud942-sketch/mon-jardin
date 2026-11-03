// TEMPORAIRE (revue visuelle) : à supprimer avant rendu.
import { createRoot } from 'react-dom/client'
import { useMemo, useState } from 'react'
import '../../styles/app.css'
import { SPECIES_BY_ID } from '../../data/species'
import { Garden3D } from './Garden3D'
import type { Garden, Plant } from '../../types'
import type { DetectedTree } from '../../lib/lidar'

const q = new URLSearchParams(location.search)
const N = +(q.get('n') ?? 300)
const NB = +(q.get('b') ?? 150)
const NT = +(q.get('trees') ?? 60)
let s = 12345
const r = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296)
const rect = (x: number, y: number, w: number, h: number) => [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }]

function make() {
  const n = 33, size = 60
  const heights: number[] = []
  for (let i = 0; i < n; i++) { const y = -size + (2 * size * i) / (n - 1); for (let j = 0; j < n; j++) { const x = -size + (2 * size * j) / (n - 1); heights.push(0.03 * y + 1.2 * Math.exp(-((x + 18) ** 2 + (y - 20) ** 2) / 120)) } }
  const buildings = []
  for (let i = 0; i < NB; i++) {
    let x = 0, y = 0
    const w = 5 + r() * 8, h = 5 + r() * 8
    do { const a = r() * Math.PI * 2, d = 22 + r() * 55; x = Math.cos(a) * d; y = Math.sin(a) * d } while (x < 24 && x + w > -22 && y < 24 && y + h > -20)
    buildings.push({ id: 'b' + i, ring: rect(x, y, w, h), heightM: 3 + r() * 9 })
  }
  buildings.push({ id: 'maison', ring: rect(-12, 6, 11, 8), heightM: 7 })
  const garden: Garden = { id: 'g1', name: 'Test 3D', address: '1 rue', center: { lon: 4.8357, lat: 45.764 }, altitudeM: 175, parcel: [{ x: -16, y: -14 }, { x: 17, y: -15 }, { x: 19, y: 16 }, { x: -14, y: 18 }], areaM2: 1050, buildings, terrain: { size, n, heights }, sol: 'limoneux', createdAt: '2024-03-01T00:00:00.000Z', panoramas: [{ id: 'pv1', x: -5, y: -8, takenAt: '2026-05-03T10:00:00.000Z', kind: 'guide', shots: [] } as never] } as Garden
  const ids = q.get('ids')?.split(',') ?? ['pommier', 'cerisier', 'noisetier', 'chene', 'framboisier', 'tomate', 'courgette', 'lavande', 'vigne', 'fraisier', 'bouleau', 'tilleul', 'thym', 'romarin', 'sauge', 'menthe', 'ciboulette', 'persil', 'laurier-sauce', 'charme']
  const plants: Plant[] = []
  const spread = q.get('sparse') ? 0.35 : 1
  for (let i = 0; i < N; i++) plants.push({ id: 'p' + i, gardenId: 'g1', speciesId: ids[i % ids.length], position: { x: (-15 + r() * 32) * spread, y: (-13 + r() * 30) * spread }, plantedAt: '2022-11-20', ageAtPlanting: 2, status: 'en-place', photos: [] } as Plant)
  const trees: DetectedTree[] = []
  for (let i = 0; i < NT; i++) { const a = r() * Math.PI * 2, d = 22 + r() * 40; trees.push({ x: Math.cos(a) * d, y: Math.sin(a) * d, heightM: 5 + r() * 14, radiusM: 2 + r() * 3.5 }) }
  return { garden, plants, trees }
}

function App() {
  const d = useMemo(make, [])
  const [sel, setSel] = useState<string | undefined>()
  return (
    <div style={{ height: '100vh' }}>
      <Garden3D garden={d.garden} plants={d.plants} speciesById={SPECIES_BY_ID} selectedPlantId={sel} onSelectPlant={setSel} onMovePlant={() => {}} neighborTrees={d.trees} defaultView={(q.get('view') as never) ?? 'perspective'} />
    </div>
  )
}
createRoot(document.getElementById('root')!).render(<App />)

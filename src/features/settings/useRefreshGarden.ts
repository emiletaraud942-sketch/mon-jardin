import { useCallback, useRef, useState } from 'react'
import { updateGarden } from '../../lib/store'
import type { Garden } from '../../types'
import { buildGarden, INITIAL_STEPS, type Step } from './createGarden'

/** Relance les sources IGN et météo d'un jardin existant (sans toucher au nom, au sol ni aux plantes). */
export function useRefreshGarden(garden: Garden) {
  const [steps, setSteps] = useState<Step[]>()
  const [busy, setBusy] = useState(false)
  const running = useRef(false)

  const refresh = useCallback(async () => {
    if (running.current) return
    running.current = true
    setBusy(true)
    setSteps(INITIAL_STEPS.map((s) => ({ ...s })))
    try {
      const g = await buildGarden(
        { label: garden.address, lon: garden.center.lon, lat: garden.center.lat },
        garden.name,
        (id, state, detail) => setSteps((prev) => prev?.map((s) => (s.id === id ? { ...s, state, detail } : s))),
        garden,
      )
      updateGarden(garden.id, {
        center: g.center,
        parcel: g.parcel,
        parcelRefs: g.parcelRefs,
        areaM2: g.areaM2,
        buildings: g.buildings,
        terrain: g.terrain,
        altitudeM: g.altitudeM,
        lastFrostDoy: g.lastFrostDoy,
        firstFrostDoy: g.firstFrostDoy,
        minAbsC: g.minAbsC,
      })
    } finally {
      running.current = false
      setBusy(false)
    }
  }, [garden])

  return { steps, refresh, busy }
}

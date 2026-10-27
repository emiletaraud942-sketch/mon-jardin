import { useActiveGarden, useGardenPlants, useStore } from '../../lib/store'
import { neighborsEnabled } from '../../lib/neighbors/enabled'
import { deriveOnboarding, type OnboardingState } from '../../lib/onboarding'
import { useUi } from '../../lib/ui'
import { isDemoGarden } from '../settings/demo'

/** État du parcours d'accueil : celui qui est enregistré, sinon celui que l'on déduit des jardins et des plantes. */
export function useOnboarding(): { state: OnboardingState; neighbors: boolean } {
  const { guide } = useUi()
  const garden = useActiveGarden()
  const gardenCount = useStore((s) => s.gardens.length)
  const plantCount = useGardenPlants(garden?.id).length
  const state = guide.onboarding ?? deriveOnboarding({ hasGarden: gardenCount > 0, demo: !!garden && isDemoGarden(garden), plantCount })
  return { state, neighbors: neighborsEnabled }
}

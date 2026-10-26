import { useSyncExternalStore } from 'react'

/** État de l'installation de l'appli sur l'écran d'accueil. */
export type InstallState = 'installed' | 'can-prompt' | 'ios-manual' | 'other-manual'

/** Événement `beforeinstallprompt` (pas dans les types DOM). */
export interface InstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

/** Morceaux de `window` utilisés (injectables pour les tests). */
export interface InstallEnv {
  addEventListener(type: string, fn: (e: Event) => void): void
  matchMedia?: (q: string) => { matches: boolean; addEventListener?: (t: 'change', fn: () => void) => void }
  navigator?: { userAgent?: string; platform?: string; maxTouchPoints?: number; standalone?: boolean }
}

/** iPhone, iPad, iPod. Un iPad récent se présente comme un Mac mais a un écran tactile. */
export function isIos(ua: string, platform = '', touchPoints = 0): boolean {
  if (/iPhone|iPad|iPod/.test(ua)) return true
  return platform === 'MacIntel' && touchPoints > 1
}

/** L'appli tourne déjà comme une appli (écran d'accueil). */
export function isStandalone(env: InstallEnv): boolean {
  if (env.navigator?.standalone === true) return true
  try {
    return !!env.matchMedia?.('(display-mode: standalone)').matches
  } catch {
    return false
  }
}

export function computeInstallState(p: { standalone: boolean; hasPrompt: boolean; ios: boolean }): InstallState {
  if (p.standalone) return 'installed'
  if (p.hasPrompt) return 'can-prompt'
  return p.ios ? 'ios-manual' : 'other-manual'
}

export function createInstallStore(env: InstallEnv) {
  let promptEvent: InstallPromptEvent | undefined
  let installed = false
  const listeners = new Set<() => void>()
  const nav = env.navigator
  const ios = isIos(nav?.userAgent ?? '', nav?.platform, nav?.maxTouchPoints)
  const compute = () => computeInstallState({ standalone: installed || isStandalone(env), hasPrompt: !!promptEvent, ios })
  let state = compute()
  const refresh = () => {
    const next = compute()
    if (next === state) return
    state = next
    listeners.forEach((l) => l())
  }

  env.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    promptEvent = e as InstallPromptEvent
    refresh()
  })
  env.addEventListener('appinstalled', () => {
    installed = true
    promptEvent = undefined
    refresh()
  })
  try {
    env.matchMedia?.('(display-mode: standalone)').addEventListener?.('change', refresh)
  } catch {
    /* ancien navigateur */
  }

  return {
    getState: () => state,
    subscribe(l: () => void) {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    /** Lance la fenêtre d'installation du navigateur. Renvoie le choix, ou `unavailable` sans événement. */
    async promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
      const e = promptEvent
      if (!e) return 'unavailable'
      promptEvent = undefined // l'événement ne sert qu'une fois
      refresh()
      try {
        await e.prompt()
        const { outcome } = await e.userChoice
        return outcome
      } catch {
        return 'dismissed'
      }
    },
  }
}

const store = typeof window !== 'undefined' ? createInstallStore(window as unknown as InstallEnv) : undefined

export const promptInstall = () => store?.promptInstall() ?? Promise.resolve('unavailable' as const)

/** État courant, mis à jour quand le navigateur propose l'installation ou qu'elle se termine. */
export function useInstallState(): InstallState {
  return useSyncExternalStore(
    (l) => store?.subscribe(l) ?? (() => undefined),
    () => store?.getState() ?? 'installed',
    () => 'installed',
  )
}

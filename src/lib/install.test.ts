import { describe, expect, it, vi } from 'vitest'
import { computeInstallState, createInstallStore, isIos, isStandalone, type InstallEnv } from './install'

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1'
const ANDROID = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36'

function fakeEnv(opts: { ua?: string; standalone?: boolean; navStandalone?: boolean; platform?: string; touch?: number } = {}) {
  const handlers = new Map<string, (e: Event) => void>()
  const env: InstallEnv = {
    addEventListener: (t, fn) => void handlers.set(t, fn),
    matchMedia: () => ({ matches: !!opts.standalone }),
    navigator: { userAgent: opts.ua ?? ANDROID, platform: opts.platform, maxTouchPoints: opts.touch, standalone: opts.navStandalone },
  }
  const fire = (t: string, e: Event) => handlers.get(t)?.(e)
  return { env, fire }
}

function fakePrompt(outcome: 'accepted' | 'dismissed' = 'accepted') {
  return { preventDefault: vi.fn(), prompt: vi.fn().mockResolvedValue(undefined), userChoice: Promise.resolve({ outcome }) } as unknown as Event & {
    preventDefault: ReturnType<typeof vi.fn>
    prompt: ReturnType<typeof vi.fn>
  }
}

describe('détection', () => {
  it('iOS : iPhone, iPad, iPadOS en mode Mac tactile ; pas Android ni Mac', () => {
    expect(isIos(IPHONE)).toBe(true)
    expect(isIos('Mozilla/5.0 (iPad; CPU OS 16_0)')).toBe(true)
    expect(isIos('Mozilla/5.0 (Macintosh)', 'MacIntel', 5)).toBe(true)
    expect(isIos('Mozilla/5.0 (Macintosh)', 'MacIntel', 0)).toBe(false)
    expect(isIos(ANDROID)).toBe(false)
  })
  it('standalone : display-mode ou navigator.standalone', () => {
    expect(isStandalone(fakeEnv({ standalone: true }).env)).toBe(true)
    expect(isStandalone(fakeEnv({ navStandalone: true }).env)).toBe(true)
    expect(isStandalone(fakeEnv().env)).toBe(false)
  })
  it('états calculés', () => {
    expect(computeInstallState({ standalone: true, hasPrompt: true, ios: true })).toBe('installed')
    expect(computeInstallState({ standalone: false, hasPrompt: true, ios: false })).toBe('can-prompt')
    expect(computeInstallState({ standalone: false, hasPrompt: false, ios: true })).toBe('ios-manual')
    expect(computeInstallState({ standalone: false, hasPrompt: false, ios: false })).toBe('other-manual')
  })
})

describe('store', () => {
  it('démarre sur le bon état', () => {
    expect(createInstallStore(fakeEnv({ standalone: true }).env).getState()).toBe('installed')
    expect(createInstallStore(fakeEnv({ ua: IPHONE }).env).getState()).toBe('ios-manual')
    expect(createInstallStore(fakeEnv().env).getState()).toBe('other-manual')
  })
  it('beforeinstallprompt : preventDefault, état can-prompt, abonnés prévenus', () => {
    const { env, fire } = fakeEnv()
    const s = createInstallStore(env)
    const l = vi.fn()
    s.subscribe(l)
    const e = fakePrompt()
    fire('beforeinstallprompt', e)
    expect(e.preventDefault).toHaveBeenCalled()
    expect(s.getState()).toBe('can-prompt')
    expect(l).toHaveBeenCalledTimes(1)
  })
  it('promptInstall lance le prompt puis rend l’événement', async () => {
    const { env, fire } = fakeEnv()
    const s = createInstallStore(env)
    const e = fakePrompt('accepted')
    fire('beforeinstallprompt', e)
    expect(await s.promptInstall()).toBe('accepted')
    expect(e.prompt).toHaveBeenCalledTimes(1)
    expect(s.getState()).toBe('other-manual')
    expect(await s.promptInstall()).toBe('unavailable')
  })
  it('promptInstall refusé', async () => {
    const { env, fire } = fakeEnv()
    const s = createInstallStore(env)
    fire('beforeinstallprompt', fakePrompt('dismissed'))
    expect(await s.promptInstall()).toBe('dismissed')
  })
  it('appinstalled passe à installed', () => {
    const { env, fire } = fakeEnv()
    const s = createInstallStore(env)
    fire('beforeinstallprompt', fakePrompt())
    fire('appinstalled', new Event('appinstalled'))
    expect(s.getState()).toBe('installed')
  })
})

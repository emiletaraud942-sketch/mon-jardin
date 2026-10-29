import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ACTION_MS, clearToasts, dismissToast, getToasts, INFO_MS, MAX_TOASTS, pauseToast, resumeToast, runToastAction, showToast } from './toast'

beforeEach(() => {
  vi.useFakeTimers()
  clearToasts()
})
afterEach(() => {
  clearToasts()
  vi.useRealTimers()
})

describe('toast', () => {
  it('appelle onExpire à l’expiration, pas onAction', () => {
    const onAction = vi.fn()
    const onExpire = vi.fn()
    showToast({ message: 'Plante supprimée', actionLabel: 'Annuler', onAction, onExpire })
    expect(getToasts()).toHaveLength(1)
    vi.advanceTimersByTime(ACTION_MS + 1)
    expect(onExpire).toHaveBeenCalledTimes(1)
    expect(onAction).not.toHaveBeenCalled()
    expect(getToasts()).toHaveLength(0)
  })

  it('l’action annule la finalisation', () => {
    const onAction = vi.fn()
    const onExpire = vi.fn()
    const id = showToast({ message: 'x', actionLabel: 'Annuler', onAction, onExpire })
    runToastAction(id)
    vi.advanceTimersByTime(30000)
    expect(onAction).toHaveBeenCalledTimes(1)
    expect(onExpire).not.toHaveBeenCalled()
  })

  it('fermer finalise une seule fois', () => {
    const onExpire = vi.fn()
    const id = showToast({ message: 'x', onExpire })
    dismissToast(id)
    dismissToast(id)
    vi.advanceTimersByTime(30000)
    expect(onExpire).toHaveBeenCalledTimes(1)
  })

  it('au-delà du maximum, le plus ancien est finalisé', () => {
    const first = vi.fn()
    showToast({ message: 'premier', onExpire: first })
    for (let i = 0; i < MAX_TOASTS; i++) showToast({ message: 'n' + i })
    expect(first).toHaveBeenCalledTimes(1)
    expect(getToasts()).toHaveLength(MAX_TOASTS)
  })

  it('message simple : 7 s ; avec Annuler : 30 s', () => {
    showToast({ message: 'Enregistré' })
    showToast({ message: 'Supprimée', actionLabel: 'Annuler', onAction: () => undefined })
    expect(INFO_MS).toBe(7000)
    expect(ACTION_MS).toBe(30000)
    vi.advanceTimersByTime(7001)
    expect(getToasts().map((t) => t.message)).toEqual(['Supprimée'])
    vi.advanceTimersByTime(23000)
    expect(getToasts()).toHaveLength(0)
  })

  it('une erreur ne disparaît jamais toute seule, même avec une durée demandée', () => {
    showToast({ message: 'Échec', tone: 'error', durationMs: 5000 })
    vi.advanceTimersByTime(10 * 60 * 1000)
    expect(getToasts()).toHaveLength(1)
  })

  it('la pause suspend le compte à rebours, la reprise le relance avec le temps restant', () => {
    const id = showToast({ message: 'x' })
    vi.advanceTimersByTime(5000)
    pauseToast(id)
    vi.advanceTimersByTime(60000)
    expect(getToasts()).toHaveLength(1)
    resumeToast(id)
    vi.advanceTimersByTime(1500)
    expect(getToasts()).toHaveLength(1)
    vi.advanceTimersByTime(1000)
    expect(getToasts()).toHaveLength(0)
  })

  it('n’évince jamais un message avec Annuler', () => {
    const undo = vi.fn()
    const expire = vi.fn()
    showToast({ message: 'a', actionLabel: 'Annuler', onAction: undo, onExpire: expire })
    for (let i = 0; i < MAX_TOASTS + 2; i++) showToast({ message: 'n' + i })
    expect(getToasts().some((t) => t.message === 'a')).toBe(true)
    expect(expire).not.toHaveBeenCalled()
    // Rien d'autre à retirer : tous ont un Annuler, la liste peut dépasser le maximum.
    clearToasts()
    for (let i = 0; i < MAX_TOASTS + 1; i++) showToast({ message: 'u' + i, actionLabel: 'Annuler', onAction: undo })
    expect(getToasts()).toHaveLength(MAX_TOASTS + 1)
  })
})

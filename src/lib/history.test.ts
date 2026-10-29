import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearToasts, getToasts } from './toast'
import { clearHistory, getHistory, historyKeyHandler, recordAction, recordWithToast, redoAction, redoWithToast, undoAction, undoWithToast } from './history'

function counter() {
  const log: string[] = []
  const entry = (name: string) => ({ label: name, undo: () => void log.push('undo ' + name), redo: () => void log.push('redo ' + name) })
  return { log, entry }
}

beforeEach(() => {
  vi.useFakeTimers()
  clearHistory()
  clearToasts()
})
afterEach(() => vi.useRealTimers())

describe('historique annuler / rétablir', () => {
  it('annule dans l’ordre inverse, puis rétablit dans l’ordre', () => {
    const { log, entry } = counter()
    recordAction(entry('A'))
    recordAction(entry('B'))
    expect(getHistory()).toMatchObject({ canUndo: true, canRedo: false, undoLabel: 'B' })
    undoAction()
    undoAction()
    expect(log).toEqual(['undo B', 'undo A'])
    expect(getHistory()).toMatchObject({ canUndo: false, canRedo: true, redoLabel: 'A' })
    redoAction()
    redoAction()
    expect(log).toEqual(['undo B', 'undo A', 'redo A', 'redo B'])
  })
  it('une nouvelle action efface ce qu’on pouvait rétablir', () => {
    const { entry } = counter()
    recordAction(entry('A'))
    undoAction()
    expect(getHistory().canRedo).toBe(true)
    recordAction(entry('B'))
    expect(getHistory().canRedo).toBe(false)
  })
  it('rien à annuler ou à rétablir : sans erreur', () => {
    expect(undoAction()).toBeUndefined()
    expect(redoAction()).toBeUndefined()
  })
  it('garde 50 actions au plus', () => {
    const { log, entry } = counter()
    for (let i = 0; i < 60; i++) recordAction(entry('a' + i))
    let n = 0
    while (undoAction()) n++
    expect(n).toBe(50)
    expect(log[0]).toBe('undo a59')
    expect(log[49]).toBe('undo a10')
  })
  it('le message d’une action propose « Annuler », qui marche même longtemps après le premier message', () => {
    const { log, entry } = counter()
    recordWithToast(entry('A'), '« A » placée.')
    expect(getToasts().at(-1)?.actionLabel).toBe('Annuler')
    getToasts().at(-1)!.onAction!()
    expect(log).toEqual(['undo A'])
    expect(getToasts().at(-1)).toMatchObject({ actionLabel: 'Rétablir' })
    getToasts().at(-1)!.onAction!()
    expect(log).toEqual(['undo A', 'redo A'])
    expect(getToasts().at(-1)).toMatchObject({ actionLabel: 'Annuler' })
  })
  it('le bouton fonctionne sans aucun message à l’écran (message expiré, fermé ou caché)', () => {
    const { log, entry } = counter()
    recordWithToast(entry('A'), '« A » placée.')
    vi.advanceTimersByTime(60_000) // le message a disparu
    expect(getToasts()).toHaveLength(0)
    undoWithToast()
    expect(log).toEqual(['undo A'])
    redoWithToast()
    expect(log).toEqual(['undo A', 'redo A'])
  })
  it('vide : message « Rien à annuler » au lieu d’un silence', () => {
    undoWithToast()
    expect(getToasts().at(-1)?.message).toBe('Rien à annuler.')
    redoWithToast()
    expect(getToasts().at(-1)?.message).toBe('Rien à rétablir.')
  })
  it('une erreur dans undo ne bloque pas l’historique', () => {
    recordAction({ label: 'X', undo: () => { throw new Error('boum') }, redo: () => undefined })
    expect(() => undoAction()).toThrow()
    expect(getHistory().canRedo).toBe(true)
  })
})

describe('raccourcis clavier', () => {
  const key = (k: string, mods: Partial<{ ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }> = {}, target: unknown = { tagName: 'DIV' }) => {
    const prevent = vi.fn()
    const handled = historyKeyHandler({ key: k, ctrlKey: false, metaKey: false, shiftKey: false, ...mods, target: target as EventTarget, preventDefault: prevent })
    return { handled, prevent }
  }
  it('Ctrl+Z annule, Ctrl+Maj+Z et Ctrl+Y rétablissent, ⌘ comme Ctrl', () => {
    const { log, entry } = counter()
    recordAction(entry('A'))
    expect(key('z', { ctrlKey: true }).handled).toBe(true)
    expect(log).toEqual(['undo A'])
    expect(key('Z', { metaKey: true, shiftKey: true }).handled).toBe(true)
    expect(log).toEqual(['undo A', 'redo A'])
    key('z', { ctrlKey: true })
    expect(key('y', { ctrlKey: true }).handled).toBe(true)
    expect(log.at(-1)).toBe('redo A')
  })
  it('ignorés dans un champ de saisie, sans Ctrl ou ⌘, et pour les autres touches', () => {
    const { log, entry } = counter()
    recordAction(entry('A'))
    expect(key('z', { ctrlKey: true }, { tagName: 'INPUT' }).handled).toBe(false)
    expect(key('z', { ctrlKey: true }, { tagName: 'TEXTAREA' }).handled).toBe(false)
    expect(key('z', { ctrlKey: true }, { tagName: 'DIV', isContentEditable: true }).handled).toBe(false)
    expect(key('z').handled).toBe(false)
    expect(key('a', { ctrlKey: true }).handled).toBe(false)
    expect(log).toEqual([])
  })
})

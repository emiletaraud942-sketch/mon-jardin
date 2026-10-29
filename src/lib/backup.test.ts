import { describe, expect, it } from 'vitest'
import { shouldRemindExport } from './backup'

const DAY = 86400000
const now = Date.UTC(2026, 9, 18)

describe('shouldRemindExport', () => {
  it('jamais sans données', () => {
    expect(shouldRemindExport({ now, hasData: false, firstUse: now - 90 * DAY })).toBe(false)
  })
  it('pas pendant les 30 premiers jours', () => {
    expect(shouldRemindExport({ now, hasData: true, firstUse: now - 10 * DAY })).toBe(false)
  })
  it('après 30 jours sans export', () => {
    expect(shouldRemindExport({ now, hasData: true, firstUse: now - 31 * DAY })).toBe(true)
  })
  it('un export récent repousse le rappel', () => {
    expect(shouldRemindExport({ now, hasData: true, firstUse: now - 200 * DAY, lastExport: now - 5 * DAY })).toBe(false)
  })
  it('un seul rappel par mois', () => {
    expect(shouldRemindExport({ now, hasData: true, firstUse: now - 90 * DAY, lastReminder: now - 3 * DAY })).toBe(false)
    expect(shouldRemindExport({ now, hasData: true, firstUse: now - 90 * DAY, lastReminder: now - 40 * DAY })).toBe(true)
  })
  it('sans point de départ, pas de rappel', () => {
    expect(shouldRemindExport({ now, hasData: true })).toBe(false)
  })
})

describe('premier rappel plus tôt quand il y a déjà du travail (3 plantes ou plus, jamais sauvegardé)', () => {
  const DAY = 86400000
  const now = 100 * DAY
  it('rappelle après 2 jours, pas avant', () => {
    expect(shouldRemindExport({ now, hasData: true, plantCount: 5, firstUse: now - 1 * DAY })).toBe(false)
    expect(shouldRemindExport({ now, hasData: true, plantCount: 5, firstUse: now - 2 * DAY })).toBe(true)
  })
  it('pas avant 3 plantes : l’ancienne règle de 30 jours s’applique', () => {
    expect(shouldRemindExport({ now, hasData: true, plantCount: 2, firstUse: now - 5 * DAY })).toBe(false)
    expect(shouldRemindExport({ now, hasData: true, plantCount: 2, firstUse: now - 31 * DAY })).toBe(true)
  })
  it('puis une fois par semaine tant qu’il n’y a pas de sauvegarde', () => {
    expect(shouldRemindExport({ now, hasData: true, plantCount: 5, firstUse: now - 20 * DAY, lastReminder: now - 3 * DAY })).toBe(false)
    expect(shouldRemindExport({ now, hasData: true, plantCount: 5, firstUse: now - 20 * DAY, lastReminder: now - 8 * DAY })).toBe(true)
  })
  it('jamais si une sauvegarde existe déjà (règle des 30 jours)', () => {
    expect(shouldRemindExport({ now, hasData: true, plantCount: 5, lastExport: now - 3 * DAY, firstUse: now - 20 * DAY })).toBe(false)
  })
})

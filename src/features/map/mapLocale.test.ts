import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { MAP_LOCALE_FR } from './mapLocale'

describe('MAP_LOCALE_FR', () => {
  const dts = readFileSync(join(__dirname, '../../../node_modules/maplibre-gl/dist/maplibre-gl.d.ts'), 'utf8')
  const block = dts.slice(dts.indexOf('declare const defaultLocale'), dts.indexOf('//#endregion', dts.indexOf('declare const defaultLocale')))
  const valid = new Set([...block.matchAll(/"([A-Za-z]+\.[A-Za-z]+)"/g)].map((m) => m[1]))

  it('ne contient que des clés connues de MapLibre', () => {
    expect(valid.size).toBeGreaterThan(10)
    for (const k of Object.keys(MAP_LOCALE_FR)) expect(valid.has(k), k).toBe(true)
  })
  it('traduit les boutons de zoom et de boussole', () => {
    for (const k of ['NavigationControl.ZoomIn', 'NavigationControl.ZoomOut', 'NavigationControl.ResetBearing', 'AttributionControl.ToggleAttribution']) {
      expect(MAP_LOCALE_FR[k]).toBeTruthy()
      expect(MAP_LOCALE_FR[k]).not.toMatch(/zoom in|zoom out|drag|toggle/i)
    }
  })
})

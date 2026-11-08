import { describe, expect, it } from 'vitest'
import { CADASTRE_MAXZOOM, ORTHO_MAXZOOM, PLAN_MAXZOOM } from '../../lib/ign'
import {
  CADASTRE_FADE_FROM,
  CADASTRE_FADE_TO,
  CADASTRE_OPACITY,
  CADASTRE_OPACITY_FAR,
  PHOTO_MAX_MAP_ZOOM,
  PLAN_MAP_MAXZOOM,
  PLAN_USEFUL_ZOOM,
  cadastreOpacityAt,
  cadastreOpacityExpression,
  mapMaxZoomFor,
  maxMapZoomForSource,
  PHOTO_NOTE_ZOOM,
  PHOTO_USEFUL_ZOOM,
  MAP_MAXZOOM,
  PHOTO_MAP_MAXZOOM,
  gridStepM,
  mapZoomForTileZoom,
  orthoPaint,
  parseReview,
  photoPixelM,
  photoStretch,
  photoUsefulMapZoom,
  tileZoomRequested,
} from './photoZoom'

describe('zoom utile de la photo', () => {
  it('photo z19 (vérifiée) : zoom de carte utile 18, +1 niveau toléré', () => {
    expect(ORTHO_MAXZOOM).toBe(19)
    expect(photoUsefulMapZoom()).toBe(ORTHO_MAXZOOM - 1)
    expect(PHOTO_USEFUL_ZOOM).toBe(18)
    expect(PHOTO_MAX_MAP_ZOOM).toBe(19)
  })
  it('la relation dépend de la taille des tuiles : 512 px = un niveau de moins', () => {
    expect(mapZoomForTileZoom(19, 256)).toBe(18)
    expect(mapZoomForTileZoom(19, 512)).toBe(19)
  })
  it('la dernière tuile demandée est z19, dès le zoom de carte 17,5 ; jamais z20', () => {
    expect(tileZoomRequested(17.4)).toBe(18)
    expect(tileZoomRequested(17.5)).toBe(19)
    expect(tileZoomRequested(18)).toBe(19)
    expect(tileZoomRequested(19)).toBe(19) // z20 serait demandé : plafonné par maxzoom de la source
    expect(tileZoomRequested(22)).toBe(19)
    expect(tileZoomRequested(-3)).toBe(0)
  })
  it('étirement : 1 au zoom utile, ×2 par niveau au-delà', () => {
    expect(photoStretch(18)).toBe(1)
    expect(photoStretch(19)).toBe(2)
    expect(photoStretch(20)).toBe(4)
    expect(photoStretch(22)).toBe(16)
    expect(photoStretch(17)).toBe(0.5)
  })
  it('un pixel de photo mesure ≈ 0,19 m à 49,5° N', () => {
    expect(photoPixelM(49.5328)).toBeGreaterThan(0.18)
    expect(photoPixelM(49.5328)).toBeLessThan(0.2)
  })
  it('plan z19 (mesuré le 27 oct.) et cadastre z18 (non vérifié) : zooms de carte utiles 18 et 17', () => {
    expect(photoUsefulMapZoom(PLAN_MAXZOOM)).toBe(18)
    expect(photoUsefulMapZoom(CADASTRE_MAXZOOM)).toBe(17)
  })
})

describe('grille d\'aide', () => {
  it('5 m dès 18,3 environ, 1 m dès 19 à 49,5° N, rien en dessous', () => {
    expect(gridStepM(17.5, 49.5)).toBeNull()
    expect(gridStepM(18.5, 49.5)).toBe(5)
    expect(gridStepM(19, 49.5)).toBe(1)
    expect(gridStepM(20, 49.5)).toBe(1)
  })
  it('la grille 1 m reste disponible au zoom plafond de la variante « repères »', () => {
    expect(gridStepM(PHOTO_MAX_MAP_ZOOM, 49.5)).toBe(1)
  })
})

describe('réglages de revue masqués', () => {
  it('lit ?ortho et ?debug ; ?zoom n\'existe plus', () => {
    expect(parseReview('')).toEqual({ ortho: [], debug: false })
    expect(parseReview('?zoom=plan&zoom=reperes')).toEqual({ ortho: [], debug: false })
    expect(parseReview('?debug=map')).toEqual({ ortho: [], debug: true })
    expect(parseReview('?ortho=net,nearest,x').ortho).toEqual(['net', 'nearest'])
  })
  it('aucun réglage de peinture par défaut', () => {
    expect(orthoPaint([])).toEqual({})
    expect(orthoPaint(['net'])).toEqual({ 'raster-contrast': 0.2, 'raster-saturation': 0.1 })
    expect(orthoPaint(['nearest'])).toEqual({ 'raster-resampling': 'nearest' })
  })
})

describe('plafond de zoom de la photo (par défaut)', () => {
  it('19 : l\'étirement ne dépasse jamais ×2 ; 22 sans photo', () => {
    expect(PHOTO_MAP_MAXZOOM).toBe(19)
    expect(photoStretch(PHOTO_MAP_MAXZOOM)).toBeLessThanOrEqual(2)
    expect(MAP_MAXZOOM).toBe(22)
  })
  it('la mention s\'affiche juste avant le plafond', () => {
    expect(PHOTO_NOTE_ZOOM).toBeLessThan(PHOTO_MAP_MAXZOOM)
    expect(PHOTO_NOTE_ZOOM).toBeGreaterThan(PHOTO_USEFUL_ZOOM)
  })
})

describe('vue plan : maxzoom de la source ↔ zoom de carte utile', () => {
  it('relation : zoom utile = maxzoom − 1 (tuiles de 256 px), plafond = utile + 1, étirement ≤ ×2', () => {
    for (const z of [17, 18, 19, 20]) {
      expect(photoUsefulMapZoom(z)).toBe(z - 1)
      expect(maxMapZoomForSource(z)).toBe(z)
      expect(photoStretch(maxMapZoomForSource(z), photoUsefulMapZoom(z))).toBe(2)
    }
    expect(maxMapZoomForSource(19, 512)).toBe(20) // tuiles de 512 px (non utilisées) : un niveau de plus
  })
  it('plan IGN v2 : tuile z19 → zoom utile 18, plafond de carte 19', () => {
    expect(PLAN_MAXZOOM).toBe(19)
    expect(PLAN_USEFUL_ZOOM).toBe(18)
    expect(PLAN_MAP_MAXZOOM).toBe(19)
    expect(photoStretch(PLAN_MAP_MAXZOOM, PLAN_USEFUL_ZOOM)).toBeLessThanOrEqual(2)
  })
  it('à ce plafond MapLibre demande z19, jamais z20 (même au zoom 22 du fond simple)', () => {
    for (const z of [16, 17.5, 18, 18.6, PLAN_MAP_MAXZOOM, 21, 22]) {
      expect(tileZoomRequested(z, PLAN_MAXZOOM)).toBeLessThanOrEqual(19)
    }
    expect(tileZoomRequested(PLAN_MAP_MAXZOOM, PLAN_MAXZOOM)).toBe(19)
    expect(tileZoomRequested(20, PLAN_MAXZOOM)).toBe(19) // sans plafond de carte, z21 serait demandé
  })
  it('zoom de carte maximal selon le fond', () => {
    expect(mapMaxZoomFor('ortho', false)).toBe(19)
    expect(mapMaxZoomFor('plan', false)).toBe(19)
    expect(mapMaxZoomFor('plan', true)).toBe(MAP_MAXZOOM)
    expect(mapMaxZoomFor('ortho', true)).toBe(MAP_MAXZOOM)
  })
})

describe('cadastre en image estompé', () => {
  it('opacité pleine jusqu’à 18,5, décroissante ensuite, plancher à 19', () => {
    expect(cadastreOpacityAt(18)).toBe(CADASTRE_OPACITY)
    expect(cadastreOpacityAt(CADASTRE_FADE_FROM)).toBe(CADASTRE_OPACITY)
    expect(cadastreOpacityAt(18.75)).toBeCloseTo((CADASTRE_OPACITY + CADASTRE_OPACITY_FAR) / 2, 9)
    expect(cadastreOpacityAt(CADASTRE_FADE_TO)).toBe(CADASTRE_OPACITY_FAR)
    expect(cadastreOpacityAt(22)).toBe(CADASTRE_OPACITY_FAR)
    expect(cadastreOpacityAt(18.9)).toBeLessThan(cadastreOpacityAt(18.6))
  })
  it('expression MapLibre = même courbe (zoom de carte)', () => {
    expect(cadastreOpacityExpression()).toEqual(['interpolate', ['linear'], ['zoom'], 18.5, CADASTRE_OPACITY, 19, CADASTRE_OPACITY_FAR])
  })
})

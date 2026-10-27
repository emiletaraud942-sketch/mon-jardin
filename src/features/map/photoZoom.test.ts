import { describe, expect, it } from 'vitest'
import { CADASTRE_MAXZOOM, ORTHO_MAXZOOM, PLAN_MAXZOOM } from '../../lib/ign'
import {
  PHOTO_MAX_MAP_ZOOM,
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
  it('plan et cadastre z18 (non vérifiés) : zoom de carte utile 17', () => {
    expect(photoUsefulMapZoom(PLAN_MAXZOOM)).toBe(17)
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

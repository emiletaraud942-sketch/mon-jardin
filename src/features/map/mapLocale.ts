/**
 * Textes français des commandes de MapLibre (noms lus par les lecteurs d'écran, info-bulles).
 * Partagé par toutes les cartes : la clé `locale` de `new maplibregl.Map({...})`. Seules des clés du paquet sont valides
 * (test `mapLocale.test.ts` : elles sont relues dans `maplibre-gl.d.ts`).
 */
export const MAP_LOCALE_FR: Record<string, string> = {
  'AttributionControl.ToggleAttribution': 'Afficher les sources de la carte',
  'AttributionControl.MapFeedback': 'Signaler un défaut de la carte',
  'LogoControl.Title': 'Logo MapLibre',
  'Map.Title': 'Carte',
  'Marker.Title': 'Repère sur la carte',
  'NavigationControl.ResetBearing': 'Remettre le nord en haut',
  'NavigationControl.ZoomIn': 'Zoomer',
  'NavigationControl.ZoomOut': 'Dézoomer',
  'Popup.Close': 'Fermer',
  'ScaleControl.Meters': 'm',
  'ScaleControl.Kilometers': 'km',
  'CooperativeGesturesHandler.WindowsHelpText': 'Ctrl + molette pour zoomer la carte',
  'CooperativeGesturesHandler.MacHelpText': '⌘ + molette pour zoomer la carte',
  'CooperativeGesturesHandler.MobileHelpText': 'Utilisez deux doigts pour déplacer la carte',
}

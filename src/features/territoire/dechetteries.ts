// Déchetteries de la Métropole Rouen Normandie : 15 points, relevés le 16 nov. 2026 dans le jeu de données ouvert
// « Points d'apport volontaire (PAV) déchets » (type « Déchetteries », Licence Ouverte v2.0, data.metropole-rouen-normandie.fr).
// Données copiées dans l'appli : aucun appel réseau, utilisables hors ligne. Les horaires ne sont PAS dans ce jeu : on renvoie vers la Métropole.
import type { LonLat } from '../../types'

export interface Dechetterie {
  nom: string
  adresse: string
  commune: string
  lat: number
  lon: number
}

export const DECHETTERIES_SOURCE = 'Points d’apport volontaire (PAV) déchets, Métropole Rouen Normandie, Licence Ouverte v2.0, relevé du 16 novembre 2026'

export const DECHETTERIES: Dechetterie[] = [
  { nom: "Anneville Ambourville", adresse: "Route de Bourg-Achard", commune: "Anneville Ambourville", lat: 49.4332, lon: 0.8927 },
  { nom: "Bois Guillaume", adresse: "Rue Herbeuse", commune: "Bois Guillaume", lat: 49.475, lon: 1.1353 },
  { nom: "Boos", adresse: "Rue des Canadiens", commune: "Boos", lat: 49.3757, lon: 1.1815 },
  { nom: "Caudebec lès elbeuf", adresse: "Rue de la Chaussée", commune: "Caudebec lès Elbeuf", lat: 49.2914, lon: 1.0308 },
  { nom: "Cléon", adresse: "Rue Marie-Louise et Raymond Boucher", commune: "Cléon", lat: 49.3191, lon: 1.0554 },
  { nom: "Darnétal", adresse: "Sente de la Ravine", commune: "Darnétal", lat: 49.4457, lon: 1.158 },
  { nom: "Duclair", adresse: "Impasse du Maupas", commune: "Duclair", lat: 49.4908, lon: 0.8667 },
  { nom: "Déville lès Rouen", adresse: "Impasse Barbet", commune: "Déville lès Rouen", lat: 49.4589, lon: 1.0468 },
  { nom: "Grand Couronne", adresse: "Allée de la Côte Mutel", commune: "Grand Couronne", lat: 49.3668, lon: 1.0155 },
  { nom: "Le Trait", adresse: "Boulevard Industriel", commune: "Le Trait", lat: 49.486, lon: 0.7934 },
  { nom: "Maromme", adresse: "Côte de la Valette", commune: "Saint Jean du Cardonnay", lat: 49.4875, lon: 1.0248 },
  { nom: "Petit Quevilly", adresse: "Chemin du Gord", commune: "Le Petit Quevilly", lat: 49.4273, lon: 1.0387 },
  { nom: "Rouen", adresse: "Quai du Pré aux Loups", commune: "Rouen", lat: 49.4351, lon: 1.1034 },
  { nom: "Saint Etienne du Rouvray", adresse: "Rue Désiré Granet", commune: "Saint Etienne du Rouvray", lat: 49.37, lon: 1.1104 },
  { nom: "Saint Martin de Boscherville", adresse: "Rue Chaussée Saint Georges", commune: "Saint Martin de Boscherville", lat: 49.4473, lon: 0.9578 },
]

/** Distance à vol d'oiseau en km (formule de haversine). */
export function distanceKm(a: LonLat, b: { lat: number; lon: number }): number {
  const rad = Math.PI / 180
  const dLat = (b.lat - a.lat) * rad
  const dLon = (b.lon - a.lon) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2
  return 2 * 6371 * Math.asin(Math.sqrt(h))
}

/** Les `n` déchetteries les plus proches d'un point, avec la distance à vol d'oiseau (pas le trajet). */
export function nearestDechetteries(p: LonLat, n = 3): { d: Dechetterie; km: number }[] {
  return DECHETTERIES.map((d) => ({ d, km: distanceKm(p, d) }))
    .sort((a, b) => a.km - b.km)
    .slice(0, n)
}

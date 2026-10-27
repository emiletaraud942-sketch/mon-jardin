// Contrat de données partagé par toute l'appli.
// Mois : 1 = janvier … 12 = décembre.
import type { Calibration } from '../lib/calibration'

export type Month = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12

export type Category =
  | 'legume'
  | 'fruitier'
  | 'petit-fruit'
  | 'aromatique'
  | 'fleur'
  | 'engrais-vert'
  | 'arbre'
  | 'haie'
  | 'vivace-comestible'

/** Strates de la forêt-jardin (permaculture). */
export type Strate =
  | 'canopee' // grands arbres > 10 m
  | 'arbre-bas' // fruitiers, petits arbres 3–10 m
  | 'arbuste' // 1–3 m
  | 'herbacee'
  | 'couvre-sol'
  | 'grimpante'
  | 'racine'

export type Sun = 'plein-soleil' | 'mi-ombre' | 'ombre'
export type Water = 'faible' | 'moyen' | 'eleve'
export type SoilTexture = 'argileux' | 'limoneux' | 'sableux' | 'calcaire' | 'humifere'

export type TaskType =
  | 'semis'
  | 'plantation'
  | 'taille'
  | 'desherbage'
  | 'arrosage'
  | 'paillage'
  | 'recolte'
  | 'fertilisation'
  | 'traitement'
  | 'division'
  | 'protection'
  | 'tuteurage'

/** Condition météo ou culturale qui conditionne une tâche. */
export type TaskCondition =
  | 'hors-gel' // pas de gel prévu (min > 0 °C) sur 3 jours
  | 'apres-pluie' // pluie > 2 mm dans les 3 derniers jours (désherbage facile)
  | 'temps-sec' // pas de pluie prévue sur 2 jours (taille, traitement)
  | 'chaleur' // max > 25 °C
  | 'apres-recolte'

export interface TaskRule {
  type: TaskType
  /** Fenêtre de mois pendant laquelle la tâche est possible. */
  months: Month[]
  condition?: TaskCondition
  /** Répétition en jours dans la fenêtre (ex. arrosage tous les 3 j). Absent = une fois par saison. */
  frequencyDays?: number
  /** Ne concerne que les plantes d'au moins N années (ex. taille de formation). */
  minAgeYears?: number
  /** Ne concerne plus les plantes de plus de N années (ex. arrosage des jeunes plants : 3). */
  maxAgeYears?: number
  /** Comment faire : geste, outil, précaution. 1 à 3 phrases. */
  howTo: string
  tool?: string
}

export interface Species {
  id: string // slug, ex. "pommier"
  nomCommun: string
  nomLatin: string
  famille: string
  categorie: Category
  strate: Strate
  vivace: boolean
  comestible: boolean
  partiesComestibles?: string[]
  soleil: Sun[]
  eau: Water
  solPrefere?: SoilTexture[]
  ph?: [number, number]
  /** Température minimale supportée (°C). */
  rusticiteC: number
  hauteurAdulteM: number
  envergureAdulteM: number
  /** Années pour atteindre la taille adulte (1 pour les annuelles). */
  anneesMaturite: number
  /** Distance conseillée entre deux pieds (cm). */
  espacementCm: number
  fixateurAzote?: boolean
  mellifere?: boolean
  /** Fonctions permaculturelles : "attire les auxiliaires", "brise-vent", "accumulateur dynamique"… */
  fonctions?: string[]
  /** ids d'espèces de la base. */
  compagnons: string[]
  antagonistes: string[]
  semisAbri?: Month[]
  semisPleineTerre?: Month[]
  plantation?: Month[]
  recolte?: Month[]
  taches: TaskRule[]
  /** Fiche « comment entretenir » : 2 à 5 phrases. */
  entretien: string
  /** Couleur de feuillage pour la 3D (hex). */
  couleur: string
  /** Couleur de fleur ou de fruit (hex), optionnelle. */
  couleurAccent?: string
}

// ---------- Jardin de l'utilisateur ----------

export interface LonLat {
  lon: number
  lat: number
}

/** Coordonnées locales en mètres : x vers l'est, y vers le nord, origine = centre du jardin. */
export interface XY {
  x: number
  y: number
}

export interface Building {
  id: string
  /** Contour en coordonnées locales (m). */
  ring: XY[]
  heightM: number
}

export interface Garden {
  id: string
  name: string
  address: string
  center: LonLat
  /** Altitude du centre (m). */
  altitudeM?: number
  /** Contour de la (des) parcelle(s) en coordonnées locales. */
  parcel?: XY[]
  parcelRefs?: string[]
  areaM2?: number
  buildings?: Building[]
  /** Grille d'altitudes relatives (m) autour du centre, pour le relief 3D. */
  terrain?: TerrainGrid
  sol?: SoilTexture
  /** Date moyenne de dernière gelée (jour de l'année), calculée sur l'historique. */
  lastFrostDoy?: number
  firstFrostDoy?: number
  /** Recalage GPS (similitude 2D en mètres locaux), appliqué aux positions mesurées. */
  calibration?: Calibration
  /** Points de vue en photos (façon Street View). Métadonnées seulement : les photos sont dans IndexedDB (src/lib/photos.ts), jamais exportées ni synchronisées. */
  panoramas?: Panorama[]
  createdAt: string
}

/** Une photo d'un point de vue : son cap (0 = nord, sens horaire) et sa largeur de champ (degrés). */
export interface PanoramaShot {
  photoId: string
  headingDeg: number
  fovDeg: number
}

export interface Panorama {
  id: string
  /** Position du point (coordonnées locales, m). */
  x: number
  y: number
  takenAt: string // ISO
  shots: PanoramaShot[]
  /** 'guide' : photos prises tour à tour. 'import' : une seule photo large (mode Panorama du téléphone). */
  kind: 'guide' | 'import'
  /** Faux si la boussole n'était pas fiable : les caps sont relatifs, les noms de plantes ne sont pas affichés. */
  northOk?: boolean
}

export interface TerrainGrid {
  /** Demi-largeur couverte (m) : la grille couvre [-size, +size] en x et y. */
  size: number
  /** Nombre de points par côté. */
  n: number
  /** Altitudes relatives au centre, ligne par ligne du sud vers le nord, ouest → est. */
  heights: number[]
}

export type PlantStatus = 'projet' | 'en-place' | 'malade' | 'mort'

export interface Plant {
  id: string
  gardenId: string
  speciesId: string
  /** Pour une plante non identifiée dans la base. */
  customName?: string
  position: XY
  plantedAt: string // ISO date
  /** Âge au moment de la plantation (années), pour un arbre acheté en pot. */
  ageAtPlanting?: number
  status: PlantStatus
  notes?: string
  photos: string[] // ids de photos (IndexedDB)
  /** Mesures saisies (hauteur, envergure en m) : recalent la courbe de croissance. */
  measurements?: PlantMeasurement[]
}

export interface PlantMeasurement {
  at: string // ISO date
  heightM?: number
  spreadM?: number
}

export interface TaskDone {
  id: string
  gardenId: string
  /** Clé stable de la tâche générée (voir engine/tasks). */
  taskKey: string
  doneAt: string
}

// ---------- Météo ----------

export interface DailyWeather {
  date: string // YYYY-MM-DD
  tMin: number
  tMax: number
  rainMm: number
  et0Mm: number
}

export interface WeatherBundle {
  fetchedAt: string
  past: DailyWeather[] // 7 derniers jours
  forecast: DailyWeather[] // 7 prochains jours
  /** true si les données viennent du cache expiré (réseau indisponible) ; `fetchedAt` date alors les données. */
  stale?: boolean
}

// ---------- Tâches générées ----------

export interface GeneratedTask {
  key: string
  type: TaskType
  title: string
  howTo: string
  tool?: string
  plantIds: string[]
  speciesId?: string
  priority: 'haute' | 'normale' | 'basse'
  /** Explication de pourquoi la tâche est proposée maintenant (météo, saison). */
  reason: string
  /** Faisable aujourd'hui selon la météo ? Sinon, raison du report. */
  blockedBy?: string
  /** Détail chiffré (météo) à afficher en option ; `reason` et `blockedBy` restent en langage simple. */
  detail?: string
}

// Plafonds appliqués à toute donnée venue de l'extérieur (import JSON, synchronisation, stockage).
// Un fichier hostile ne doit pouvoir ni saturer la mémoire du navigateur, ni bloquer l'interface.

export const LIMITS = {
  /** Taille maximale d'un fichier d'import, vérifiée AVANT de le lire. */
  importBytes: 10 * 1024 * 1024,
  /** Sauvegarde complète (avec photos) : taille totale du fichier, d'un en-tête JSON, d'une photo, et nombre de photos. */
  fullBackupBytes: 300 * 1024 * 1024,
  fullBackupPhotoBytes: 8 * 1024 * 1024,
  fullBackupPhotos: 2_000,
  /** Taille maximale d'une photo à traiter (avant décodage). */
  photoInputBytes: 40 * 1024 * 1024,
  /** Dimensions maximales d'une photo à décoder (côté, pixels totaux) : protège contre les « bombes de décompression ». */
  photoMaxSide: 16_000,
  photoMaxPixels: 120_000_000,
  gardens: 50,
  plants: 20_000,
  tasksDone: 50_000,
  /** Noms, adresses, libellés. */
  shortText: 500,
  /** Notes libres et autres textes longs. */
  longText: 5_000,
  /** Identifiants (jardin, plante, tâche, espèce). */
  idLength: 128,
  taskKeyLength: 256,
  photosPerPlant: 20,
  /** Points de vue en photos par jardin, et photos par point. */
  panoramasPerGarden: 6,
  shotsPerPanorama: 12,
  parcelRefs: 50,
  parcelRefLength: 100,
  /** Points d'un contour (parcelle, bâtiment). */
  ringPoints: 5_000,
  buildingsPerGarden: 1_000,
  /** Grille de relief : côté maximal (n × n points) et demi-largeur maximale (m). */
  terrainN: 129,
  terrainSizeM: 5_000,
  /** Coordonnées locales plausibles (m) : 1 000 km autour du centre du jardin. */
  coordM: 1_000_000,
  /** Champs inconnus conservés tels quels (compatibilité avec de futures versions) : bornes. */
  extraDepth: 6,
  extraKeys: 200,
  extraArray: 20_000,
  extraNodes: 100_000,
} as const

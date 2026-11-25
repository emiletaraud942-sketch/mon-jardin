// Les trois grandes parties de l'accueil (feuille) : Cultiver, Entretenir, Consommer.
// Module pur : textes et identifiants du registre (`features.ts`). Trois gros choix au plus par page ;
// le reste se découvre derrière « Voir plus » (progressif). Rien de stocké.

export type HubId = 'cultiver' | 'entretenir' | 'consommer'

export interface HubItem {
  /** Identifiant d'une fonction du registre (`features.ts`), lancée au toucher. */
  featureId: string
  mot: string
  /** Une phrase d'au plus 20 mots. */
  phrase: string
  /** Nom d'icône de `Icon`. */
  icon: string
}

export interface Hub {
  id: HubId
  mot: string
  /** Sous-titre de la feuille et de la page. */
  phrase: string
  title: string
  /** Les gros choix de la page (3 au plus). */
  main: HubItem[]
  /** Derrière « Voir plus ». */
  more: HubItem[]
}

export const HUBS: Hub[] = [
  {
    id: 'cultiver',
    mot: 'Cultiver',
    phrase: 'choisir, planter',
    title: 'Que voulez-vous planter ?',
    main: [
      { featureId: 'ajouter-plante', mot: 'Ajouter une plante', phrase: 'La choisir, puis la poser sur la carte.', icon: 'plus' },
      { featureId: 'ou-planter', mot: 'Où planter ?', phrase: 'Le bon endroit selon le soleil.', icon: 'leaf' },
      { featureId: 'carte', mot: 'Voir mon jardin', phrase: 'Votre terrain, vu du ciel.', icon: 'map' },
    ],
    more: [
      { featureId: 'visite-photos', mot: 'Visiter mon jardin en photos', phrase: 'Comme si vous étiez sur la terrasse.', icon: 'camera' },
      { featureId: 'mes-plantes', mot: 'Mes plantes', phrase: 'La liste de tout ce que vous avez planté.', icon: 'list' },
      { featureId: 'catalogue', mot: 'Catalogue de plantes', phrase: 'Chercher une plante et lire sa fiche.', icon: 'book' },
      { featureId: 'apprendre-jardiner', mot: 'Apprendre à jardiner', phrase: 'Des leçons courtes et un petit quiz.', icon: 'book' },
      { featureId: 'scanner-etiquette', mot: 'Scanner un sachet', phrase: 'Photo d’un sachet ou d’une étiquette.', icon: 'scan' },
      { featureId: 'identifier', mot: 'Reconnaître une plante', phrase: 'Une photo, et on cherche son nom.', icon: 'camera' },
      { featureId: 'scanner', mot: 'Scanner mon jardin', phrase: 'Placez vos plantes en marchant.', icon: 'scan' },
      { featureId: 'rotation-potager', mot: 'Rotation du potager', phrase: 'Que remettre où, d’une année à l’autre.', icon: 'leaf' },
    ],
  },
  {
    id: 'entretenir',
    mot: 'Entretenir',
    phrase: 'arroser, tailler',
    title: 'Cette semaine',
    main: [
      { featureId: 'a-faire', mot: 'Ce qu’il y a à faire', phrase: 'Arroser, tailler, désherber.', icon: 'check' },
      { featureId: 'meteo', mot: 'La météo', phrase: 'Les 7 prochains jours chez vous.', icon: 'sun' },
      { featureId: 'guide-ravageurs', mot: 'Un souci au jardin ?', phrase: 'Reconnaître une bestiole ou une maladie.', icon: 'alert' },
    ],
    more: [
      { featureId: 'conseils-compost-eau', mot: 'Compost et eau', phrase: 'Faire son compost, arroser moins.', icon: 'drop' },
      { featureId: 'calendrier', mot: 'Calendrier de l’année', phrase: 'Les gestes mois par mois.', icon: 'calendar' },
      { featureId: 'semer-mois', mot: 'Que semer ce mois-ci', phrase: 'Les semis du moment.', icon: 'sprout' },
      { featureId: 'rappels', mot: 'Rappels', phrase: 'Être prévenu sur le téléphone.', icon: 'bell' },
      { featureId: 'imprimer-semaine', mot: 'Imprimer ma semaine', phrase: 'Une feuille à garder au jardin.', icon: 'list' },
      { featureId: 'journal-jardin', mot: 'Journal d’une plante', phrase: 'Ses photos, au fil du temps.', icon: 'camera' },
    ],
  },
  {
    id: 'consommer',
    mot: 'Consommer',
    phrase: 'récolter, cuisiner',
    title: 'Mon jardin dans l’assiette',
    // Le premier choix est la liste « Prêt à récolter » (calculée dans l'écran, pas une fonction du registre).
    main: [
      { featureId: 'calendrier', mot: 'Calendrier de l’année', phrase: 'Quand récolter, mois par mois.', icon: 'calendar' },
      { featureId: 'mes-graines', mot: 'Mes graines', phrase: 'Vos sachets, à garder ou à donner.', icon: 'sprout' },
    ],
    more: [
      { featureId: 'semer-mois', mot: 'Que semer ce mois-ci', phrase: 'Les semis du moment.', icon: 'sprout' },
      { featureId: 'liste-courses', mot: 'Liste de courses', phrase: 'Ce qu’il faut acheter ou semer.', icon: 'list' },
      { featureId: 'conseils-compost-eau', mot: 'Compost et eau', phrase: 'Rendre au sol ce qu’il a donné.', icon: 'drop' },
    ],
  },
]

export const hubById = (id: HubId): Hub => HUBS.find((h) => h.id === id)!

/**
 * Les plantes en place dont le mois de récolte est celui d'aujourd'hui (une fois par espèce, 6 au plus).
 * `species` : `recolte` (mois) et `nomCommun` par identifiant ; une plante sans fiche utilise son nom libre.
 */
export function readyToHarvest(
  plants: ReadonlyArray<{ speciesId: string; customName?: string; status: string }>,
  species: Record<string, { nomCommun: string; recolte?: readonly number[] } | undefined>,
  month: number,
  max = 6,
): string[] {
  const names: string[] = []
  for (const p of plants) {
    if (p.status !== 'en-place') continue
    const sp = species[p.speciesId]
    if (!sp?.recolte?.includes(month)) continue
    if (!names.includes(sp.nomCommun)) names.push(sp.nomCommun)
    if (names.length >= max) break
  }
  return names
}

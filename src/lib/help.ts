import type { Tab } from './ui'
import { SPECIES } from '../data/species'

// Textes de l'aide contextuelle (bouton « ? »). Données pures : un contenu par écran.

export interface HelpContent {
  title: string
  /** 3 à 6 étapes, une phrase courte chacune. */
  steps: string[]
}

export const HELP: Record<Tab, HelpContent> = {
  accueil: {
    title: 'L’accueil',
    steps: [
      'Touchez un gros bouton pour ouvrir une partie de l’appli. Chaque bouton dit ce qu’il fait.',
      '« Chez » résume votre jardin : plantes et choses à faire. « Prochaine étape » propose quoi faire ensuite.',
      '« Je ne sais pas par où commencer » pose quelques questions simples, une à la fois.',
      '« Tout ce que je peux faire » liste chaque fonction. Tapez un mot pour la trouver : photo, tailler.',
      'Touchez Accueil, en bas, ou le nom PermaJardin, en haut, pour revenir ici.',
    ],
  },
  carte: {
    title: 'La carte',
    steps: [
      'Touchez « Ajouter une plante », puis choisissez la plante.',
      'Touchez la carte à l’endroit où elle pousse (ou « Viser »), puis « Valider ». « Annuler » arrête.',
      '« Aides au placement » ouvre « Placer au mètre », « Je suis ici », « Coller aux bords », « Grille » et « Fond simple ».',
      'Touchez une plante pour ouvrir sa fiche : état, photos, soins. Un message permet de défaire après coup.',
      'Pour la déplacer, touchez « Déplacer cette plante », le nouvel endroit, puis « Valider ».',
      'Pour zoomer, pincez avec deux doigts ou touchez + et −. Le trait jaune montre les limites du terrain.',
    ],
  },
  '3d': {
    title: 'La Vue 3D',
    steps: [
      'Faites tourner la vue avec deux doigts, ou avec la souris.',
      'Choisissez « Vue de dessus », « Vue en perspective » ou « Se promener ».',
      'Le curseur montre vos arbres dans quelques années, avec leur ombre.',
      '« Se promener » vous place dans le jardin, à hauteur d’yeux.',
      'Pour déplacer une plante, glissez-la. Ou ouvrez sa fiche et touchez « Déplacer cette plante ».',
    ],
  },
  plantes: {
    title: 'Mes plantes',
    steps: [
      'Vos plantes sont rangées par type : légumes, fruitiers, fleurs…',
      '« Ajouter » vous fait choisir une plante, puis la placer.',
      '« Identifier » reconnaît une plante grâce à une photo.',
      'Touchez une plante pour ouvrir sa fiche et tenir son journal de photos datées.',
      '« Voir sur la carte » montre où elle se trouve.',
      '« Liste de courses et de semis » regroupe les plantes prévues, avec la bonne période.',
    ],
  },
  entretien: {
    title: 'À faire',
    steps: [
      'La liste dit quoi faire cette semaine : tailler, désherber, arroser, récolter. « Urgent » passe en premier.',
      '« Voir tout » montre toutes les tâches et celles mises de côté.',
      'La météo et la saison sont prises en compte. Canicule, sécheresse et vent fort passent en « Urgent ».',
      'Cochez une tâche quand elle est faite. « Annuler » la remet dans la liste.',
      'Touchez le nom d’une plante pour la voir sur la carte.',
      'Le calendrier de l’année montre les mois à venir.',
    ],
  },
  planter: {
    title: 'Où planter ?',
    steps: [
      'Touchez un endroit sur la carte.',
      'L’appli regarde le soleil, la pente et les voisins de cet endroit.',
      'Les plantes sont classées de la plus adaptée à la moins adaptée.',
      '« Prévoir ici » ajoute la plante comme prévue.',
      'Plus bas, voyez ce que vous pouvez semer ou planter ce mois-ci.',
    ],
  },
  catalogue: {
    title: 'Le catalogue',
    steps: [
      'Cherchez une plante par son nom ou son type. Les pastilles trient : comestible, utile aux abeilles, ombre, facile, ce mois-ci.',
      'Sa fiche dit le soleil, l’eau, le sol et les bonnes plantes voisines.',
      'Le calendrier montre quand semer, planter et récolter.',
      'Le bouton sous la fiche la pose sur la carte de votre jardin.',
      '« Retour à la liste » ferme la fiche.',
    ],
  },
  reglages: {
    title: 'Mon compte et réglages',
    steps: [
      'Choisissez la nature du sol : nos conseils en tiennent compte.',
      'Faites une sauvegarde de vos données de temps en temps.',
      'Agrandissez le texte avec « Taille du texte ».',
      'Choisissez l’apparence : clair, sombre ou automatique.',
      'Créez un autre jardin avec « Nouveau jardin ».',
    ],
  },
  voisins: {
    title: 'L’entraide',
    steps: [
      'Entrez votre e-mail : un code arrive par e-mail. Saisissez-le ici. Choisissez ensuite un pseudo et votre quartier : une zone d’environ 2 km, ou environ 5 km à la campagne.',
      '« Nouveautés » résume ce qui est arrivé depuis votre dernière visite. Touchez une ligne pour la voir.',
      'Les annonces montrent les dons, échanges, prêts, demandes et questions près de chez vous. « Publier » en crée une. Rien ne se vend ici.',
      '« Écrire en privé » ouvre une conversation. « J’ai ce qu’il cherche » répond à une demande. « Signaler » et « Bloquer » protègent le groupe.',
      'Les événements sont des rendez-vous près de chez vous. « Je suis intéressé(e) » ajoute 1 au compteur. « S’inscrire » ouvre le site de l’organisateur. Pour en publier, touchez « Devenir organisateur » : nous vérifions votre demande.',
      '« Inviter un voisin » partage le lien de l’appli. Dans Profil, « Mes notifications » active une alerte sans texte pour les nouveaux messages. Vous pouvez aussi y supprimer votre compte.',
    ],
  },
}

export const HELP_SCREENS = Object.keys(HELP) as Tab[]

/** Écrans qui ne sont pas un onglet : le scanner, les photos du jardin et la promenade en 3D. */
export type HelpExtra = 'scanner' | 'photos' | 'promenade'

export const HELP_EXTRA: Record<HelpExtra, HelpContent> = {
  scanner: {
    title: 'Le scanner',
    steps: [
      '« Filmer en marchant » : marchez dans le jardin, l’appli propose le nom des plantes, avec votre accord.',
      '« Placer une plante en la photographiant » : une photo, et la plante est posée là où vous êtes.',
      '« Placer avec un mètre » : mesurez la distance à deux repères, sans GPS.',
      '« Ajuster la carte à ma position » est facultatif. Il améliore la précision de la carte.',
      'Touchez « Accueil » pour tout quitter et revenir au début.',
    ],
  },
  photos: {
    title: 'Les photos du jardin',
    steps: [
      '« Prendre un point de vue » : choisissez un endroit, puis tournez sur vous-même. L’appli prend 8 à 12 photos.',
      'Touchez un point de la liste pour vous y promener. Glissez le doigt pour tourner la vue.',
      'Les flèches mènent à un autre point. « Légendes » écrit sur la photo le nom et la distance de vos plantes.',
      'Avec deux points ou plus, « Lancer la visite » passe d’un point à l’autre toute seule. Touchez la vue pour mettre en pause.',
      'Ces photos restent sur ce téléphone. Elles ne reconnaissent pas les plantes toutes seules.',
      'Touchez « Accueil » pour revenir au début, ou « Fermer » pour revenir à la carte.',
    ],
  },
  promenade: {
    title: 'La promenade en 3D',
    steps: [
      'Poussez le rond pour marcher. Glissez sur la scène pour regarder autour.',
      '« Courir » va plus vite. Les flèches rondes tournent la vue.',
      '« Aller à » vous place près d’une plante ou d’un point photo. Vous pouvez aussi toucher la mini-carte.',
      '« Mouvement réduit » avance par bonds, pour éviter le vertige.',
      '« Quitter » revient à la vue en perspective. « Accueil » revient au début de l’appli.',
    ],
  },
}

/** Écran d'aide à ouvrir d'après ce qu'on voit : promenade, scanner ou photos du jardin d'abord, sinon l'onglet. */
export function helpExtraNow(doc: { documentElement: { dataset: DOMStringMap }; querySelector(s: string): unknown } = document): HelpExtra | undefined {
  if (doc.querySelector('.pano-overlay')) return 'photos'
  if (doc.querySelector('dialog.modal.full[open]')) return 'scanner'
  if (doc.documentElement.dataset.immersive) return 'promenade'
  return undefined
}

export const RAYONS_HELP = {
  title: 'À quoi servent les 4 parties de l’appli ?',
  intro: 'Les boutons du bas rangent l’appli en 4 parties, plus l’Accueil. Rien n’est bloqué.',
  rayons: [
    { name: 'Mon jardin', text: 'La carte, vos plantes et la vue 3D. Touchez Carte, Plantes ou Vue 3D, en haut.' },
    { name: 'À faire', text: 'Quoi faire cette semaine : tailler, désherber, arroser, récolter. Avec la météo et le calendrier.' },
    { name: 'Où planter ?', text: `Où planter chaque plante, et le catalogue des ${SPECIES.length} plantes.` },
    { name: 'Voisins', text: 'Dons, questions et rendez-vous près de chez vous. Facultatif.' },
  ],
  optional: 'Placer vos plantes est facultatif : vous pouvez aller directement à « À faire ».',
  account: 'Sauvegarde, réglages et changement de jardin sont sous « Compte », en haut à droite. « Tout » liste toutes les fonctions.',
}

export function helpFor(tab: Tab): HelpContent {
  return HELP[tab]
}

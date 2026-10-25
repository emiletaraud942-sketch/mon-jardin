import type { Tab } from './ui'

// Textes de l'aide contextuelle (bouton « ? »). Données pures : un contenu par écran.

export interface HelpContent {
  title: string
  /** 3 à 6 étapes, une phrase courte chacune. */
  steps: string[]
}

export const HELP: Record<Tab, HelpContent> = {
  carte: {
    title: 'La carte',
    steps: [
      'Touchez « Ajouter une plante au jardin », puis choisissez la plante.',
      'Touchez la carte à l’endroit où elle pousse.',
      'Touchez une plante pour ouvrir sa fiche : état, photos, soins.',
      'Pour la déplacer, touchez « Déplacer cette plante », puis le nouvel endroit.',
      'Pour zoomer, pincez avec deux doigts ou touchez + et −.',
      'Le trait jaune montre les limites du terrain. Il est facultatif.',
    ],
  },
  '3d': {
    title: 'La Vue 3D',
    steps: [
      'Faites tourner la vue avec deux doigts, ou avec la souris.',
      'Choisissez « Vue de dessus », « Vue en perspective » ou « Se promener ».',
      'Le curseur montre vos arbres dans quelques années, avec leur ombre.',
      '« Se promener » vous place dans le jardin, à hauteur d’yeux.',
      'Glissez une plante pour la déplacer.',
    ],
  },
  plantes: {
    title: 'Mes plantes',
    steps: [
      'Vos plantes sont rangées par type : légumes, fruitiers, fleurs…',
      '« Ajouter » vous fait choisir une plante, puis la placer.',
      '« Identifier » reconnaît une plante grâce à une photo.',
      'Touchez une plante pour ouvrir sa fiche et ajouter des photos.',
      '« Voir sur la carte » montre où elle se trouve.',
    ],
  },
  entretien: {
    title: 'Entretien',
    steps: [
      'La liste dit quoi faire cette semaine : tailler, désherber, arroser, récolter.',
      'La météo et la saison sont prises en compte.',
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
      'Cherchez une plante par son nom ou son type.',
      'Sa fiche dit le soleil, l’eau, le sol et les bonnes plantes voisines.',
      'Le calendrier montre quand semer, planter et récolter.',
      'Le bouton sous la fiche la pose sur la carte de votre jardin.',
    ],
  },
  reglages: {
    title: 'Réglages',
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
      'Entrez votre e-mail : un lien arrive. Ouvrez-le sur ce téléphone. Choisissez ensuite un pseudo et votre quartier.',
      '« Nouveautés » résume ce qui est arrivé depuis votre dernière visite. Touchez une ligne pour la voir.',
      'Les annonces montrent les dons, échanges, prêts, demandes et questions près de chez vous. « Publier » en crée une. Rien ne se vend ici.',
      '« Écrire en privé » ouvre une conversation. « J’ai ce qu’il cherche » répond à une demande. « Signaler » et « Bloquer » protègent le groupe.',
      'Les événements sont des rendez-vous près de chez vous. « Je suis intéressé(e) » ajoute 1 au compteur. « S’inscrire » ouvre le site de l’organisateur. Pour en publier, touchez « Devenir organisateur » : nous vérifions votre demande.',
      '« Inviter un voisin » partage le lien de l’appli. Dans Profil, « Mes notifications » active une alerte sans texte pour les nouveaux messages. Vous pouvez aussi y supprimer votre compte.',
    ],
  },
}

export const HELP_SCREENS = Object.keys(HELP) as Tab[]

export const MODES_HELP = {
  title: 'À quoi servent les 3 modes ?',
  intro: 'Les trois boutons sous le titre montrent seulement ce qui sert à votre étape. Rien n’est bloqué.',
  modes: [
    { name: 'Mon jardin', text: 'Placer vos plantes sur la carte de votre jardin.' },
    { name: 'Entretenir', text: 'Voir quoi faire cette semaine : tailler, désherber, arroser, récolter.' },
    { name: 'Planifier', text: 'Choisir quoi planter où, et voir le jardin grandir en 3D.' },
  ],
  optional: 'Placer vos plantes est facultatif : vous pouvez aller directement à Entretenir ou Planifier.',
}

export function helpFor(tab: Tab): HelpContent {
  return HELP[tab]
}

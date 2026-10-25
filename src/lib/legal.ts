import { DATA_INVENTORY, type LegalBasis } from './security/inventory'

// Textes juridiques de PermaJardin : source unique. L'interface les rend en React (aucun HTML injecté) et
// docs/{CONFIDENTIALITE,MENTIONS-LEGALES,CGU}.md en reprennent les titres (vérifié par legal.test.ts).
// Ce sont des BROUILLONS : ils ne constituent pas un avis juridique.

export const DRAFT_BANNER = 'BROUILLON À FAIRE VALIDER PAR UN PROFESSIONNEL'
export const DRAFT_NOTE = 'Texte provisoire, à faire valider par un professionnel avant publication. Il ne constitue pas un avis juridique.'

export const LEGAL_VERSION = '1.2'
/** Dernière mise à jour (AAAA-MM-JJ). */
export const LEGAL_UPDATED = '2026-10-25'

// ---------- Champs à compléter par l'éditeur (aucune donnée personnelle pré-remplie) ----------
export const TO_COMPLETE = '[à compléter]'
export const EDITEUR_NOM = TO_COMPLETE
export const EDITEUR_STATUT = TO_COMPLETE
export const EDITEUR_ADRESSE = TO_COMPLETE
export const CONTACT_EMAIL = TO_COMPLETE
export const DIRECTEUR_PUBLICATION = TO_COMPLETE

export const LEGAL_FIELDS = {
  EDITEUR_NOM,
  EDITEUR_STATUT,
  EDITEUR_ADRESSE,
  CONTACT_EMAIL,
  DIRECTEUR_PUBLICATION,
} as const

/** Noms des champs encore à compléter (vide quand le texte est prêt). */
export function getMissingFields(fields: Record<string, string> = LEGAL_FIELDS): string[] {
  return Object.entries(fields)
    .filter(([, v]) => !v.trim() || v.includes(TO_COMPLETE) || /\[.*\]/.test(v))
    .map(([k]) => k)
}

/** Vrai quand tous les champs de l'éditeur sont remplis : le texte n'a plus rien de provisoire à montrer. */
export const isLegalReady = (fields: Record<string, string> = LEGAL_FIELDS) => getMissingFields(fields).length === 0

/** Ce que l'utilisateur lit à la place d'un champ vide : une phrase neutre, jamais « [à compléter] ». */
export const PENDING_FIELD_TEXT = 'information à venir'

/** Texte d'un document tel qu'affiché : les champs vides deviennent « information à venir ». */
export const legalText = (text: string): string => text.split(TO_COMPLETE).join(PENDING_FIELD_TEXT)

// ---------- Structure des documents ----------
export type Block = { t: 'p'; text: string } | { t: 'ul'; items: string[] }
export interface LegalSection {
  titre: string
  blocs: Block[]
}
export type LegalId = 'confidentialite' | 'mentions' | 'cgu'
export interface LegalDoc {
  id: LegalId
  titre: string
  /** Nom du fichier dans docs/. */
  fichier: string
  sections: LegalSection[]
}

const p = (text: string): Block => ({ t: 'p', text })
const ul = (...items: string[]): Block => ({ t: 'ul', items })

const BASE_LABEL: Record<LegalBasis, string> = {
  execution: 'exécution du service demandé',
  consentement: 'votre consentement',
  'interet-legitime': 'intérêt légitime (sécurité, confort d’usage)',
}

const inventoryItems = DATA_INVENTORY.map(
  (d) =>
    `${d.donnee}. Stockage : ${d.stockage}. ` +
    (d.destinataires.length ? `Destinataires : ${d.destinataires.join(' ; ')}. ` : 'Aucun destinataire extérieur. ') +
    `Finalité : ${d.finalite}. Base : ${BASE_LABEL[d.base]}. Durée : ${d.duree}. Effacement : ${d.effacement}.`,
)

export const CONFIDENTIALITE: LegalDoc = {
  id: 'confidentialite',
  titre: 'Politique de confidentialité',
  fichier: 'CONFIDENTIALITE.md',
  sections: [
    {
      titre: 'En bref',
      blocs: [
        ul(
          'Vos jardins, plantes et photos restent sur votre appareil, dans votre navigateur.',
          'Pas de compte obligatoire, pas de publicité, pas de cookie, pas de traceur.',
          'Quelques services extérieurs reçoivent une partie de vos données uniquement quand la fonction l’exige : carte, météo, identification d’une plante, sauvegarde en ligne facultative, entraide entre voisins facultative.',
          'L’entraide entre voisins demande un compte (adresse e-mail) et un âge minimum de 15 ans. Elle ne reçoit ni votre adresse ni votre position exacte, seulement un quartier arrondi à environ 1 km.',
          'Vous pouvez tout exporter ou tout effacer à tout moment depuis les Réglages.',
        ),
      ],
    },
    {
      titre: 'Qui est responsable',
      blocs: [
        p(`Éditeur et responsable du traitement : ${EDITEUR_NOM} (${EDITEUR_STATUT}), ${EDITEUR_ADRESSE}. Contact : ${CONTACT_EMAIL}.`),
        p('Les données conservées uniquement sur votre appareil ne sont pas accessibles à l’éditeur.'),
      ],
    },
    {
      titre: 'Données, finalités, destinataires et durées',
      blocs: [p('Pour chaque donnée : où elle est stockée, qui la reçoit, pourquoi, sur quelle base et combien de temps.'), { t: 'ul', items: inventoryItems }, p('Aucune de ces données n’est vendue, ni utilisée pour de la publicité ou du profilage.')],
    },
    {
      titre: 'Bases légales',
      blocs: [
        ul(
          'Exécution du service que vous demandez : carte, météo locale, calendrier d’entretien (RGPD, art. 6.1.b).',
          'Votre consentement : envoi d’une photo à Pl@ntNet pour l’identification, sauvegarde en ligne, et entraide entre voisins (compte, pseudo, quartier, annonces, messages). Il est demandé avant le premier envoi et vous pouvez le retirer à tout moment dans Réglages > Vie privée (art. 6.1.a).',
          'Intérêt légitime : journaux techniques de sécurité de l’hébergeur, préférences d’usage, modération de l’entraide (signalements, blocages, limites d’usage contre les abus) (art. 6.1.f).',
          'Obligation légale : conservation des données d’identification et traitement des signalements de contenus illicites, dans les limites prévues par la loi pour la confiance dans l’économie numérique (art. 6.1.c).',
        ),
        p('Information sans blocage : pour afficher la carte et la météo, les coordonnées de votre jardin sont envoyées à l’IGN (Géoplateforme, API Carto) et à Open-Meteo, par l’intermédiaire de notre hébergeur. Ces envois ne contiennent ni votre nom ni votre e-mail.'),
      ],
    },
    {
      titre: 'Destinataires',
      blocs: [
        ul(
          'Vercel Inc. (États-Unis) : hébergement du site, relais des requêtes vers l’IGN et Open-Meteo, fonction d’identification.',
          'IGN Géoplateforme et API Carto : cartes, géocodage, parcelles, altitude.',
          'Open-Meteo : prévisions et historique météo.',
          'Pl@ntNet (Cirad, INRAE, Inria, IRD) : identification des plantes à partir des photos que vous envoyez.',
          'Supabase : compte et sauvegarde en ligne, seulement si vous activez la synchronisation.',
          'Supabase (projet distinct, dédié à l’entraide) : compte, profil, annonces, photos, messages, signalements, seulement si vous rejoignez l’entraide. Supabase est notre sous-traitant (RGPD, art. 28).',
          'Prestataire d’envoi d’e-mails (à renseigner par l’éditeur) : envoi du lien de connexion de l’entraide.',
          'Les autres membres de l’entraide : voir la section « Entraide entre voisins ».',
        ),
        p('Chaque service applique sa propre politique de confidentialité.'),
      ],
    },
    {
      titre: 'Transferts hors Union européenne',
      blocs: [
        p('Vercel est une société américaine : des données techniques (adresse IP, requêtes) peuvent être traitées aux États-Unis. Les garanties applicables (clauses contractuelles types ou cadre de protection des données UE-États-Unis) sont à confirmer par l’éditeur auprès de Vercel.'),
        p('Le lieu d’hébergement des projets Supabase (synchronisation et entraide) et d’Open-Meteo est également à confirmer : la région Union européenne doit être vérifiée dans le tableau de bord Supabase avant l’ouverture au public. Supabase est une société américaine : les mêmes garanties (clauses contractuelles types, accord de traitement des données) sont à confirmer.'),
      ],
    },
    {
      titre: 'Entraide entre voisins',
      blocs: [
        p('L’entraide est facultative. Elle permet de publier des annonces de don, d’échange, de prêt, des demandes (« Je cherche ») ou des questions, et d’écrire en privé à d’autres jardiniers proches. Elle est réservée aux personnes de 15 ans et plus.'),
        ul(
          'Compte : votre adresse e-mail sert uniquement à vous envoyer un lien de connexion. Elle n’est visible d’aucun autre membre.',
          'Profil public : un pseudo et un quartier. Le quartier est une position arrondie à environ 1 km, jamais votre adresse ni votre position exacte. Choisissez un pseudo qui ne révèle pas votre identité.',
          'Annonces et réponses : type (don, échange, prêt, demande ou question), catégorie éventuelle, titre, description, espèce et photo éventuelle. Elles sont visibles des membres situés à moins de 55 km environ, sauf ceux que vous avez bloqués. N’y écrivez ni votre adresse, ni votre téléphone, ni de données concernant d’autres personnes.',
          'Photos : redessinées dans votre navigateur avant l’envoi (position GPS et métadonnées supprimées), 1 Mo au plus, stockées dans un espace privé. Une photo de jardin peut elle-même révéler un lieu : regardez l’arrière-plan.',
          'Messages privés : lisibles seulement par vous et votre correspondant. L’éditeur ne les lit pas, sauf pour traiter un signalement visant l’un d’eux.',
          'Signalements et blocages : un signalement est lu par l’éditeur ; il n’est pas communiqué à la personne signalée. Un blocage masque réciproquement annonces, réponses et conversations.',
        ),
        p('Durées de conservation : les annonces (et leurs photos) sont supprimées 60 jours après leur publication. Le compte, le profil, les réponses et les messages sont conservés jusqu’à la suppression du compte, que vous pouvez faire à tout moment dans l’entraide : tout est alors effacé, y compris vos photos. Les signalements sont conservés 12 mois. Certaines données d’identification peuvent être conservées plus longtemps par l’hébergeur lorsque la loi l’impose (un an pour les données permettant d’identifier l’auteur d’un contenu).'),
        p('Aucune donnée de l’entraide n’est vendue, cédée à des fins publicitaires, ni utilisée pour du profilage. L’entraide n’utilise ni cookie ni traceur publicitaire ; seul un jeton de connexion est gardé dans le stockage de votre navigateur.'),
        p('Exercer vos droits : suppression du compte dans l’appli ; accès, rectification, portabilité, opposition ou limitation par e-mail à l’éditeur. Nous répondons dans un délai d’un mois. Vos annonces et réponses peuvent être exportées sur demande.'),
      ],
    },
    {
      titre: 'Âge minimum',
      blocs: [
        p('L’entraide est réservée aux personnes de 15 ans et plus, âge du consentement numérique en France (loi Informatique et Libertés, art. 45). En dessous, l’accord d’un parent est nécessaire et l’entraide n’est pas proposée. Si vous pensez qu’un mineur de moins de 15 ans a créé un compte, écrivez à l’éditeur : le compte sera supprimé.'),
      ],
    },
    {
      titre: 'Cookies et traceurs',
      blocs: [p('PermaJardin ne dépose aucun cookie et n’utilise ni mesure d’audience ni traceur publicitaire. Le stockage du navigateur (IndexedDB, localStorage, cache de l’appli) sert uniquement à faire fonctionner l’appli.')],
    },
    {
      titre: 'Vos droits',
      blocs: [
        ul(
          'Accès et portabilité : Réglages > Sauvegarde > Exporter (fichier JSON lisible).',
          'Rectification : directement dans l’appli.',
          'Effacement : Réglages > Vie privée > Effacer toutes mes données, avec suppression de la sauvegarde en ligne si vous êtes connecté.',
          'Opposition, limitation et retrait du consentement : Réglages > Vie privée > Retirer mon consentement, ou par e-mail à l’éditeur.',
          'Entraide : suppression définitive du compte, des annonces, des photos et des messages depuis l’entraide ; accès et portabilité des données de l’entraide par e-mail à l’éditeur.',
          'Réclamation : auprès de la CNIL (www.cnil.fr).',
        ),
        p(`Pour toute demande : ${CONTACT_EMAIL}. Pour les données détenues par un prestataire (par exemple Pl@ntNet), vous pouvez aussi vous adresser à lui.`),
      ],
    },
    {
      titre: 'Sécurité',
      blocs: [p('Connexions chiffrées (HTTPS), aucune clé secrète dans l’appli, accès à la sauvegarde en ligne limité à son propriétaire, validation de tout fichier importé. Entraide : base séparée de la sauvegarde, règles d’accès appliquées par la base elle-même (chaque membre ne lit que ce qui lui est destiné), quartier arrondi côté appli puis de nouveau côté base, photos privées sans métadonnées, limites quotidiennes contre les abus. En cas de violation de données à risque pour vous, l’éditeur prévient la CNIL et les personnes concernées dans les conditions prévues par le RGPD.')],
    },
    {
      titre: 'Modifications',
      blocs: [p('Toute modification importante de cette politique sera signalée dans l’appli. La date de dernière mise à jour figure en haut de la page.')],
    },
  ],
}

export const MENTIONS: LegalDoc = {
  id: 'mentions',
  titre: 'Mentions légales',
  fichier: 'MENTIONS-LEGALES.md',
  sections: [
    {
      titre: 'Éditeur du service',
      blocs: [
        ul(`Nom ou raison sociale : ${EDITEUR_NOM}`, `Statut : ${EDITEUR_STATUT}`, `Adresse ou domiciliation : ${EDITEUR_ADRESSE}`, `Contact : ${CONTACT_EMAIL}`),
      ],
    },
    { titre: 'Directeur de la publication', blocs: [p(DIRECTEUR_PUBLICATION)] },
    {
      titre: 'Hébergeur',
      blocs: [
        p('Site et application : Vercel Inc., 440 N Barranca Ave #4133, Covina, CA 91723, États-Unis. Site : vercel.com.'),
        p(`Données de l’entraide entre voisins (comptes, annonces, photos, messages) : Supabase, projet dédié. Raison sociale, adresse et région d’hébergement : ${TO_COMPLETE} (à confirmer par l’éditeur dans le tableau de bord Supabase).`),
      ],
    },
    {
      titre: 'Contenus publiés par les membres',
      blocs: [
        p('Les annonces, réponses, photos et messages de l’entraide sont publiés par leurs auteurs, qui en sont seuls responsables. L’éditeur intervient comme hébergeur de ces contenus au sens de l’article 6 de la loi n° 2004-575 du 21 juin 2004 (LCEN) : il ne les contrôle pas avant publication et n’en est pas l’auteur.'),
        p('Il retire promptement tout contenu manifestement illicite dès qu’il en a connaissance, ou dès qu’il lui est notifié.'),
        p(`Pour signaler un contenu : bouton « Signaler » de l’appli, ou par e-mail à ${CONTACT_EMAIL} en indiquant la date, la description du contenu et son adresse (identifiant de l’annonce), le motif et votre identité. Un signalement abusif engage la responsabilité de son auteur.`),
        p('Point de contact pour les autorités et les utilisateurs (règlement (UE) 2022/2065, dit DSA) : voir l’adresse de contact ci-dessus. Les langues acceptées sont le français et l’anglais.'),
      ],
    },
    {
      titre: 'Sources de données et licences',
      blocs: [
        ul(
          'Photo aérienne, plan, cadastre, bâtiments (BD TOPO), relief (RGE ALTI) : © IGN – Géoplateforme, Licence Ouverte 2.0.',
          'Météo et historique climatique : Open-Meteo, licence CC BY 4.0.',
          'Identification des plantes : Pl@ntNet (Cirad, INRAE, Inria, IRD).',
          'Fonds de carte et logiciels libres : voir leurs licences respectives.',
        ),
      ],
    },
    {
      titre: 'Propriété intellectuelle',
      blocs: [p('Le code, les fiches espèces et les textes de PermaJardin sont protégés. Les données tierces restent soumises à leurs licences.')],
    },
    {
      titre: 'Données personnelles',
      blocs: [p('Voir la politique de confidentialité, accessible depuis les Réglages.')],
    },
  ],
}

export const CGU: LegalDoc = {
  id: 'cgu',
  titre: 'Conditions d’utilisation',
  fichier: 'CGU.md',
  sections: [
    {
      titre: 'Objet du service',
      blocs: [p('PermaJardin est une application gratuite pour cartographier un jardin, y placer ses plantes et savoir quand tailler, désherber, arroser et récolter.')],
    },
    {
      titre: 'Gratuité et absence de compte',
      blocs: [p('Le service est gratuit et s’utilise sans compte. Un compte n’est nécessaire que pour la synchronisation facultative entre appareils et pour l’entraide entre voisins.')],
    },
    {
      titre: 'Conseils indicatifs',
      blocs: [
        p('Les calendriers, tailles, associations de plantes et distances de plantation sont fournis à titre indicatif. Ils ne remplacent ni l’observation de votre jardin ni l’avis d’un professionnel.'),
        p('Les distances de plantation s’appuient sur l’article 671 du Code civil. Des règlements locaux, des usages ou un règlement de copropriété peuvent s’appliquer : vérifiez-les.'),
      ],
    },
    {
      titre: 'Identification de plantes',
      blocs: [
        p('L’identification par photo est fournie par Pl@ntNet et peut être fausse. Aucune garantie n’est donnée sur son exactitude.'),
        p('Ne consommez jamais une plante, un fruit ou un champignon sur la seule foi de l’application : certaines plantes sont toxiques.'),
      ],
    },
    {
      titre: 'Entraide entre voisins : accès',
      blocs: [
        ul(
          'Réservée aux personnes de 15 ans et plus. Un compte par personne, avec une adresse e-mail qui vous appartient.',
          'Pseudo libre, mais il ne doit ni usurper une autre personne, ni révéler votre identité contre votre gré, ni être trompeur ou offensant.',
          'Le quartier que vous indiquez est le vôtre. Il est arrondi à environ 1 km.',
          'L’entraide est gratuite et non commerciale : dons, échanges, prêts, demandes et questions entre particuliers.',
        ),
      ],
    },
    {
      titre: 'Règles de conduite',
      blocs: [
        p('Il est interdit de publier :'),
        ul(
          'des contenus illicites, haineux, discriminatoires, violents, sexuellement explicites, ou portant atteinte à la vie privée, à l’image ou aux droits d’autrui ;',
          'du harcèlement, des menaces, de l’usurpation d’identité ;',
          'de la publicité, du démarchage, des ventes ou des services payants : l’entraide est gratuite ;',
          'des produits ou conseils dangereux : produits phytosanitaires interdits ou non autorisés, plantes, graines ou champignons toxiques présentés comme comestibles, plantes protégées ou espèces exotiques envahissantes interdites ;',
          'votre adresse exacte, des numéros de téléphone, ou des informations personnelles sur d’autres personnes ;',
          'des contenus dont vous n’avez pas les droits (photos d’autrui, textes copiés).',
        ),
        p('Il est interdit de perturber le service : création de faux comptes, envoi en masse, collecte automatisée des annonces ou des pseudos, tentative de contourner les limites quotidiennes, les blocages ou la modération.'),
      ],
    },
    {
      titre: 'Contenus publiés et licence',
      blocs: [
        p('Vous restez propriétaire de vos contenus. En les publiant, vous accordez à l’éditeur, gratuitement et pour la durée de leur publication, le droit de les héberger et de les afficher aux autres membres de l’entraide, uniquement pour faire fonctionner le service.'),
        p('Vous garantissez avoir le droit de les publier et en êtes seul responsable. Les annonces sont supprimées au bout de 60 jours ; vous pouvez les supprimer avant, ainsi que votre compte, à tout moment.'),
      ],
    },
    {
      titre: 'Signalement, blocage et modération',
      blocs: [
        ul(
          'Chaque membre peut signaler une annonce, une réponse, un profil ou un message qu’il reçoit, avec un motif.',
          'Trois signalements de membres distincts masquent automatiquement une annonce ou une réponse, en attendant l’examen de l’éditeur. Le masquage n’est pas une sanction.',
          'Chaque membre peut bloquer une personne : plus aucune annonce, réponse ni message n’est visible dans un sens comme dans l’autre.',
          'L’éditeur examine les signalements, peut retirer un contenu, avertir ou bannir un compte, notamment en cas de manquement aux règles de conduite. Il indique à la personne concernée le motif de la décision, sauf si la loi ou une enquête l’interdit.',
          'Pour contester une décision, écrivez à l’éditeur : le dossier est réexaminé.',
        ),
        p('L’éditeur n’est pas tenu de surveiller les contenus. Il ne peut pas garantir qu’un contenu illicite soit retiré avant d’avoir été signalé.'),
      ],
    },
    {
      titre: 'Hébergeur et responsabilité',
      blocs: [
        p('L’éditeur est hébergeur des contenus de l’entraide (loi n° 2004-575 du 21 juin 2004, art. 6) : sa responsabilité n’est engagée que s’il a connaissance d’un contenu manifestement illicite et ne le retire pas promptement.'),
        p('Les dons, échanges, prêts et demandes se font entre particuliers, sous leur seule responsabilité : l’éditeur n’est partie à aucun accord, ne garantit ni la qualité, ni la sécurité, ni l’identification d’une plante, ni la fiabilité d’une personne. Rencontrez-vous dans un lieu public, ne communiquez pas votre adresse à la légère, lavez et inspectez ce que vous recevez. Un prêt de matériel est un contrat entre vous.'),
        p('Vous restez responsable du respect de la réglementation sur les plantes et les semences que vous donnez ou échangez.'),
      ],
    },
    {
      titre: 'Suspension et suppression du compte',
      blocs: [
        p('Vous pouvez supprimer votre compte à tout moment depuis l’entraide : profil, annonces, réponses, photos et messages sont effacés définitivement. L’éditeur peut suspendre ou supprimer un compte qui enfreint ces conditions, sans préavis en cas de manquement grave. Un compte suspendu ne peut plus ni publier, ni lire les annonces.'),
      ],
    },
    {
      titre: 'Disponibilité',
      blocs: [p('Le service est fourni « en l’état », sans garantie de disponibilité continue. Il peut être interrompu ou modifié. Exportez régulièrement une sauvegarde de vos données.')],
    },
    {
      titre: 'Données de sources tierces',
      blocs: [p('Les cartes, le cadastre, le relief et la météo viennent de services tiers (IGN, Open-Meteo). Ils peuvent être inexacts, incomplets ou indisponibles.')],
    },
    {
      titre: 'Propriété intellectuelle',
      blocs: [p('Vos données (jardins, plantes, photos) vous appartiennent. Le code et les contenus de PermaJardin restent la propriété de l’éditeur, sauf licences contraires.')],
    },
    {
      titre: 'Droit applicable',
      blocs: [p('Les présentes conditions sont soumises au droit français.')],
    },
    {
      titre: 'Contact',
      blocs: [p(`Pour toute question : ${CONTACT_EMAIL}.`)],
    },
  ],
}

export const LEGAL_DOCS: readonly LegalDoc[] = [CONFIDENTIALITE, MENTIONS, CGU]
export const LEGAL_DOC: Record<LegalId, LegalDoc> = { confidentialite: CONFIDENTIALITE, mentions: MENTIONS, cgu: CGU }
export const LEGAL_LINK_LABEL: Record<LegalId, string> = { confidentialite: 'Confidentialité', mentions: 'Mentions légales', cgu: 'Conditions d’utilisation' }

export function formatLegalDate(iso = LEGAL_UPDATED): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
}

/** Rendu texte d'un document (même contenu que docs/*.md). */
export function toMarkdown(doc: LegalDoc): string {
  const out = [
    `# ${doc.titre}`,
    '',
    `> **${DRAFT_BANNER}.** ${DRAFT_NOTE}`,
    `> Version ${LEGAL_VERSION} · Dernière mise à jour : ${formatLegalDate()}.`,
    '',
  ]
  for (const s of doc.sections) {
    out.push(`## ${s.titre}`, '')
    for (const b of s.blocs) {
      out.push(...(b.t === 'p' ? [b.text] : b.items.map((i) => `- ${i}`)), '')
    }
  }
  return out.join('\n')
}

// ---------- Textes de consentement ----------
export interface ConsentText {
  titre: string
  paragraphes: string[]
  accepter: string
}

const compte = DATA_INVENTORY.find((d) => d.id === 'compte')

export const CONSENT_TEXT: Record<'plantnet' | 'sync' | 'voisins', ConsentText> = {
  plantnet: {
    titre: 'Envoyer la photo à Pl@ntNet ?',
    paragraphes: [
      'Votre photo part vers Pl@ntNet, un service d’identification européen. Elle est ré-encodée, sans position GPS, et n’est pas conservée par PermaJardin.',
      'Vous pourrez retirer votre autorisation dans Réglages, rubrique « Ce que j’ai autorisé ».',
    ],
    accepter: 'Oui, identifier la plante',
  },
  sync: {
    titre: 'Enregistrer vos données en ligne ?',
    paragraphes: [
      'Vos jardins, plantes et tâches (sans les photos) seront enregistrés sur un serveur (Supabase, UE) lié à votre adresse e-mail, pour les retrouver sur un autre appareil.',
      `Destinataire : ${(compte?.destinataires ?? []).join(' ; ')}.`,
      'Vous pouvez retirer votre autorisation et supprimer vos données en ligne à tout moment dans Réglages.',
    ],
    accepter: 'Accepter et continuer',
  },
  voisins: {
    titre: 'Rejoindre l’entraide entre voisins ?',
    paragraphes: [
      'Votre adresse e-mail (pour le lien de connexion), votre pseudo, votre quartier arrondi à ~1 km, vos annonces, photos, réponses et messages privés seront enregistrés sur un serveur dédié (Supabase, UE). Votre adresse et votre position exacte ne sont jamais envoyées.',
      'Votre pseudo, votre quartier, vos annonces et vos réponses sont visibles des autres membres. Vos messages ne sont lus que par votre correspondant. Les annonces disparaissent après 60 jours.',
      'Vous pouvez retirer votre autorisation dans Réglages, et supprimer votre compte et vos annonces à tout moment dans l’entraide.',
    ],
    accepter: 'Accepter et continuer',
  },
}

/** Information sans blocage affichée dans Réglages > Vie privée. */
export const NETWORK_INFO =
  'Pour afficher la carte et la météo, les coordonnées de votre jardin sont envoyées à l’IGN (Géoplateforme) et à Open-Meteo, par l’intermédiaire de notre hébergeur. Ni votre nom ni votre e-mail ne sont transmis.'

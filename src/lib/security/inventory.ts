// Inventaire des données personnelles et des permissions de PermaJardin.
// Source unique pour la page « Confidentialité » (l'interface l'affiche) et pour docs/CONFIDENTIALITE.md.
// Tout changement de flux de données (nouvel appel réseau, nouvelle clé de stockage) doit modifier ce fichier.

export type LegalBasis = 'execution' | 'consentement' | 'interet-legitime'

export interface DataItem {
  id: string
  /** Quelle donnée. */
  donnee: string
  /** Où elle est stockée. */
  stockage: string
  /** Qui la reçoit en dehors de l'appareil (vide = personne). */
  destinataires: string[]
  finalite: string
  base: LegalBasis
  duree: string
  /** Comment l'utilisateur l'efface. */
  effacement: string
}

export const DATA_INVENTORY: readonly DataItem[] = [
  {
    id: 'jardins',
    donnee: 'Jardins : nom, adresse, position du centre, contour de parcelle, bâtiments, relief, plantes (position au mètre près, notes, informations d’achat facultatives : forme, hauteur, lieu et prix), tâches faites',
    stockage: 'IndexedDB du navigateur (clé permajardin:state:v1) ; copie « avant migration » en cas de correction au chargement ; copie de secours dans le localStorage (clé permajardin:state:v1:miroir) qui évite de perdre la dernière modification si le navigateur se ferme trop vite',
    destinataires: [],
    finalite: 'Fournir le service : carte, 3D, calendrier d’entretien',
    base: 'execution',
    duree: 'Jusqu’à effacement par l’utilisateur (ou par le navigateur si le stockage n’est pas persistant)',
    effacement: 'Réglages > Effacer toutes mes données (eraseAllData), ou supprimer un jardin',
  },
  {
    id: 'photos',
    donnee: 'Photos de plantes (réduites à 1280 px maximum, sans EXIF ni position GPS : elles sont ré-encodées par le navigateur)',
    stockage: 'IndexedDB du navigateur (clés photo:…)',
    destinataires: [],
    finalite: 'Illustrer les plantes',
    base: 'execution',
    duree: 'Jusqu’à suppression de la plante ou effacement',
    effacement: 'Supprimer la plante, ou Effacer toutes mes données. Les photos ne sont jamais synchronisées.',
  },
  {
    id: 'identification',
    donnee: 'Photos envoyées pour identification (1 à 5 images, organe choisi)',
    stockage: 'Aucun stockage chez nous : relayées en mémoire par la fonction /api/identify',
    destinataires: ['Vercel (hébergeur de la fonction)', 'Pl@ntNet (identification ; leur politique de confidentialité s’applique)'],
    finalite: 'Identifier une plante, uniquement quand l’utilisateur clique sur « Identifier »',
    base: 'consentement',
    duree: 'Non conservées par PermaJardin. Conservation par Pl@ntNet : voir my.plantnet.org',
    effacement: 'Demande à Pl@ntNet ; rien à effacer chez PermaJardin',
  },
  {
    id: 'adresse',
    donnee: 'Adresse recherchée (texte saisi)',
    stockage: 'Dans le jardin créé (voir « jardins »)',
    destinataires: ['Vercel (proxy /ext/geopf)', 'IGN Géoplateforme (géocodage)'],
    finalite: 'Trouver l’emplacement du jardin',
    base: 'execution',
    duree: 'Non conservée par PermaJardin hors du jardin créé',
    effacement: 'Effacer toutes mes données',
  },
  {
    id: 'position',
    donnee: 'Coordonnées du jardin (parcelle, altitude, bâtiments, orthophoto, tuiles de carte ; relief fin et arbres des environs LiDAR HD : seule une zone carrée autour du jardin est demandée)',
    stockage: 'Dans le jardin créé ; tuiles IGN dans le cache du service worker (ign-tuiles, ign-ortho-3d) ; relevé LiDAR dans IndexedDB (clé lidar:…)',
    destinataires: ['Vercel (proxys /ext/geopf, /ext/apicarto)', 'IGN Géoplateforme et API Carto'],
    finalite: 'Afficher la carte, la parcelle, le relief et le bâti',
    base: 'execution',
    duree: 'Tuiles : 60 jours au plus dans le cache ; orthophoto 3D : 14 jours ; relevé LiDAR : 90 jours',
    effacement: 'Effacer toutes mes données (vide aussi les caches de tuiles)',
  },
  {
    id: 'meteo',
    donnee: 'Coordonnées du jardin envoyées pour la météo et le climat local (arrondies à 2 décimales, soit environ 1 km)',
    stockage: 'localStorage (clés pj-meteo:…, pj-climat:… : coordonnées arrondies à 2 décimales dans la clé)',
    destinataires: ['Vercel (proxys /ext/meteo, /ext/meteo-archive)', 'Open-Meteo'],
    finalite: 'Prévisions et calcul des dates de gel pour proposer les tâches',
    base: 'execution',
    duree: 'Cache de 3 h (prévisions) et 30 jours (climat)',
    effacement: 'Effacer toutes mes données',
  },
  {
    id: 'compte',
    donnee: 'Adresse e-mail du compte, instantané en ligne des jardins (sans photos), jeton de session',
    stockage: 'Supabase (table garden_snapshots, protégée par RLS) ; jeton dans le localStorage (clé sb-…-auth-token)',
    destinataires: ['Supabase (sous-traitant : hébergement et authentification)'],
    finalite: 'Sauvegarder et retrouver ses jardins sur un autre appareil. Fonction facultative.',
    base: 'consentement',
    duree: 'Jusqu’à suppression du compte ou de l’instantané',
    effacement: 'Réglages > Vie privée > Effacer toutes mes données, avec la case « Supprimer aussi ma sauvegarde en ligne » (supprime l’instantané). Pour supprimer aussi le compte (adresse e-mail), écrire à l’éditeur',
  },
  {
    id: 'entraide-compte',
    donnee: 'Entraide entre voisins : adresse e-mail du compte (lien de connexion), jeton de session, adresse IP et navigateur des connexions (conservés par le service d’authentification Supabase)',
    stockage: 'Projet Supabase DÉDIÉ à l’entraide (authentification, distinct de la synchronisation) ; jeton dans le localStorage (clé sb-neighbors-auth-token)',
    destinataires: ['Supabase (sous-traitant : hébergement et authentification de l’entraide)', 'Prestataire d’envoi d’e-mails choisi par l’éditeur (lien de connexion)'],
    finalite: 'Se connecter à l’entraide sans mot de passe. Fonction facultative, réservée aux personnes de 15 ans et plus.',
    base: 'consentement',
    duree: 'Jusqu’à suppression du compte. L’adresse n’est jamais visible des autres membres.',
    effacement: 'Entraide > Mon compte > Supprimer mon compte (deleteMyAccount : photos, puis compte et tout ce qui s’y rattache)',
  },
  {
    id: 'entraide-profil',
    donnee: 'Entraide : pseudo et quartier (position arrondie sur une grille : zone d’environ 2 km, ou d’environ 5 km au choix). Jamais d’adresse ni de position exacte',
    stockage: 'Supabase de l’entraide, table profiles (protégée par RLS ; arrondi et taille de zone refaits par la base)',
    destinataires: ['Supabase (sous-traitant)', 'Autres membres de l’entraide à moins de ~55 km (pseudo et quartier, à travers vos annonces, réponses et conversations)'],
    finalite: 'Afficher qui publie et à quelle distance approximative, pour s’entraider entre voisins',
    base: 'consentement',
    duree: 'Jusqu’à suppression du compte',
    effacement: 'Supprimer mon compte ; le pseudo et le quartier se modifient dans Entraide > Mon profil (5 modifications par jour)',
  },
  {
    id: 'entraide-annonces',
    donnee: 'Entraide : annonces (type, titre, description, espèce), réponses publiques aux questions, photo d’annonce (redessinée, sans EXIF ni GPS, 1 Mo au plus)',
    stockage: 'Supabase de l’entraide (tables posts et replies ; photos dans un bucket privé neighbors-photos)',
    destinataires: ['Supabase (sous-traitant)', 'Autres membres de l’entraide à moins de ~55 km, sauf personnes que vous avez bloquées'],
    finalite: 'Donner, échanger, prêter, poser des questions entre jardiniers voisins',
    base: 'consentement',
    duree: 'Annonces : 60 jours puis suppression automatique (photos comprises). Réponses : tant que l’annonce existe',
    effacement: 'Entraide > Mes annonces > Supprimer (photo comprise) ; suppression du compte',
  },
  {
    id: 'entraide-jardin',
    donnee: 'Entraide : la liste des espèces de votre jardin (par exemple pommier, romarin), seulement si vous choisissez de la montrer. Jamais les positions, les nombres, les photos ni l’adresse',
    stockage: 'Supabase de l’entraide (table garden_shares ; une ligne par membre ; RLS ; seuls des identifiants de fiches sont acceptés, jamais de texte libre)',
    destinataires: ['Supabase (sous-traitant)', 'Autres membres de l’entraide à moins de ~55 km, sauf personnes que vous avez bloquées : ils voient la liste et votre pseudo, et peuvent vous écrire pour demander une bouture'],
    finalite: 'Savoir quelles plantes les voisins ont, pour demander une bouture',
    base: 'consentement',
    duree: 'Jusqu’à ce que vous cessiez de montrer votre jardin ou supprimiez votre compte',
    effacement: 'Entraide > Jardins > Ne plus montrer mon jardin ; suppression du compte',
  },
  {
    id: 'entraide-evenements',
    donnee: 'Entraide : demande d’organisateur (nom public, courte description), événements (titre, description, dates, lieu en texte libre, lien d’inscription https, nombre de places, quartier arrondi) et « Je suis intéressé(e) » (une ligne par membre et par événement)',
    stockage: 'Supabase de l’entraide (tables organizers, events et event_interest ; RLS ; chaque membre ne voit que sa propre ligne d’intérêt, les autres voient seulement le total)',
    destinataires: ['Supabase (sous-traitant)', 'Autres membres de l’entraide à moins de ~55 km (nom de l’organisateur et événement ; seulement le nombre de personnes intéressées)', 'L’éditeur (validation des organisateurs et modération)'],
    finalite: 'Faire connaître des rendez-vous entre jardiniers voisins, publiés par des organisateurs vérifiés',
    base: 'consentement',
    duree: 'Événements : 30 jours après leur fin, puis suppression automatique (marques d’intérêt comprises). Demande d’organisateur : jusqu’à son retrait ou la suppression du compte',
    effacement: 'Entraide > Événements > Ma demande > Retirer ma demande ou Ne plus être organisateur (efface aussi les événements) ; « Je suis intéressé(e) » se retire d’un toucher ; suppression du compte',
  },
  {
    id: 'entraide-messages',
    donnee: 'Entraide : messages privés entre deux membres, et pour chaque conversation la date de votre dernière lecture (pour compter les messages non lus)',
    stockage: 'Supabase de l’entraide (tables threads, messages et thread_reads ; RLS : seuls les deux participants lisent les messages, chacun ne voit que sa propre date de lecture)',
    destinataires: ['Supabase (sous-traitant)', 'Votre correspondant', 'L’éditeur, uniquement pour traiter un signalement visant ce message'],
    finalite: 'Se mettre d’accord pour un don, un échange ou un prêt',
    base: 'consentement',
    duree: 'Jusqu’à suppression du compte de l’un des deux participants (la conversation disparaît alors pour les deux)',
    effacement: 'Supprimer mon compte ; bloquer une personne masque la conversation des deux côtés',
  },
  {
    id: 'entraide-alertes',
    donnee: 'Entraide : alertes de nouveaux messages (facultatives) : adresse technique de l’appareil fournie par le service d’alertes du programme internet, deux clés techniques de cet appareil, et vos préférences de notification',
    stockage: 'Supabase de l’entraide (tables push_subscriptions et notification_prefs ; RLS : chacun ne voit que les siennes, les clés ne sont jamais lisibles par l’appli) ; l’abonnement est aussi gardé par le programme internet de l’appareil',
    destinataires: ['Supabase (sous-traitant)', 'Service d’alertes de votre programme internet (Google, Mozilla, Apple ou Microsoft : sous-traitant technique ; il reçoit l’adresse de l’appareil et un signal vide, jamais de texte ni de pseudo)'],
    finalite: 'Prévenir qu’un message privé est arrivé, par une alerte neutre « Vous avez un nouveau message »',
    base: 'consentement',
    duree: 'Jusqu’à la désactivation de l’appareil, la suppression du compte, ou la disparition de l’adresse chez le service d’alertes (retrait automatique). 5 appareils au plus par personne',
    effacement: 'Entraide > Profil > Mes notifications > Se désabonner de cet appareil ; Réglages > Ce que j’ai autorisé > Ne plus autoriser ; suppression du compte',
  },
  {
    id: 'entraide-moderation',
    donnee: 'Entraide : signalements envoyés (motif, précisions facultatives), personnes bloquées, compteurs d’usage par jour, journal de modération (identifiants et décision, sans le contenu)',
    stockage: 'Supabase de l’entraide (tables reports, blocks, quotas, moderation_log ; non lisibles par les autres membres)',
    destinataires: ['Supabase (sous-traitant)', 'L’éditeur (modération)'],
    finalite: 'Modérer les contenus (loi pour la confiance dans l’économie numérique), protéger les membres, limiter les abus',
    base: 'interet-legitime',
    duree: 'Signalements et journal de modération : 12 mois. Blocages : jusqu’au déblocage ou à la suppression du compte. Compteurs : 7 jours',
    effacement: 'Débloquer une personne ; suppression du compte (vos signalements et blocages disparaissent)',
  },
  {
    id: 'preferences',
    donnee: 'Préférences et repères : thème, date du dernier export, première utilisation, dernière notification, dernière synchronisation, date de votre dernière visite à l’entraide (pour afficher les nouveautés)',
    stockage: 'localStorage (clés permajardin:…)',
    destinataires: [],
    finalite: 'Confort d’usage (rappel de sauvegarde, une notification par jour au plus)',
    base: 'interet-legitime',
    duree: 'Jusqu’à effacement',
    effacement: 'Effacer toutes mes données',
  },
  {
    id: 'journaux',
    donnee: 'Adresse IP, date, URL et navigateur de chaque requête (journaux techniques d’hébergement)',
    stockage: 'Vercel',
    destinataires: ['Vercel (hébergeur)'],
    finalite: 'Sécurité et exploitation du site',
    base: 'interet-legitime',
    duree: 'Selon l’offre Vercel du propriétaire (à vérifier dans le tableau de bord)',
    effacement: 'Demande à l’éditeur du site',
  },
]

export interface PermissionInfo {
  permission: string
  ou: string
  pourquoi: string
  siRefusee: string
}

/** Permissions du navigateur utilisées (ou volontairement non utilisées). */
export const PERMISSIONS: readonly PermissionInfo[] = [
  {
    permission: 'Notifications',
    ou: 'Tâches > « Activer les rappels » ; Entraide > Profil > Mes notifications > « Activer les alertes » (clic uniquement, jamais au chargement)',
    pourquoi: 'Un rappel local par jour au plus quand des tâches urgentes existent. Si vous activez les alertes de l’entraide : une alerte neutre, sans texte, quand un message privé arrive.',
    siRefusee: 'Aucun rappel ; tout le reste fonctionne.',
  },
  {
    permission: 'Photos (choix d’un fichier ou prise de vue)',
    ou: 'Fiche d’une plante > Ajouter une photo ; Identifier une plante (sélecteur de fichier du système)',
    pourquoi: 'Choisir une photo vous-même. Le navigateur ne donne accès qu’aux fichiers que vous sélectionnez.',
    siRefusee: 'Pas de photo ; la plante se place quand même.',
  },
  {
    permission: 'Stockage persistant',
    ou: 'Au démarrage (navigator.storage.persist) ; Firefox peut afficher une demande',
    pourquoi: 'Éviter que le navigateur efface vos jardins si l’espace manque.',
    siRefusee: 'Les données restent, mais peuvent être effacées par le navigateur : exportez une sauvegarde (Réglages).',
  },
  {
    permission: 'Géolocalisation',
    ou: 'Scan du jardin, « Je suis ici » et photos du jardin, seulement après un appui',
    pourquoi: 'Placer une plante ou un point photo à votre position. La position reste sur cet appareil.',
    siRefusee: 'Vous placez à la main sur la carte.',
  },
  {
    permission: 'Caméra',
    ou: 'Photos du jardin et scan, seulement après un appui. Le microphone n’est jamais utilisé.',
    pourquoi: 'Prendre les photos. Elles restent sur cet appareil (rien n’est envoyé, sauf une photo que vous choisissez d’identifier).',
    siRefusee: 'Vous choisissez une photo déjà prise dans vos fichiers.',
  },
  {
    permission: 'Capteurs de mouvement (boussole)',
    ou: 'Photos du jardin, seulement après un appui',
    pourquoi: 'Connaître la direction vers laquelle vous regardez pour ranger les photos. Rien n’est enregistré en dehors du cap de chaque photo.',
    siRefusee: 'Vous indiquez la direction de départ à la main.',
  },
  {
    permission: 'Écran allumé',
    ou: 'Prise des photos du jardin et scan, tant que l’écran de prise de vue est ouvert (aucune demande à l’écran)',
    pourquoi: 'Éviter que l’écran s’éteigne et coupe la caméra en pleine prise.',
    siRefusee: 'L’écran suit les réglages du téléphone ; reprenez la photo si la caméra s’est arrêtée.',
  },
]

/** Clés localStorage effacées par « Effacer toutes mes données ». */
export const ERASABLE_LOCAL_KEY = /^(permajardin:|pj[-.]|sb-)/
/** Caches du service worker contenant des lieux consultés. Les caches du code de l’appli sont conservés. */
export const ERASABLE_CACHE = /^ign-/

/** Inventaire des données personnelles (pur, sans effet de bord). */
export function getDataInventory(): readonly DataItem[] {
  return DATA_INVENTORY
}

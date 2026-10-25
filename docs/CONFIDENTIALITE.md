# Politique de confidentialité

> **BROUILLON À FAIRE VALIDER PAR UN PROFESSIONNEL.** Texte provisoire, à faire valider par un professionnel avant publication. Il ne constitue pas un avis juridique.
> Version 1.2 · Dernière mise à jour : 25 octobre 2026.

## En bref

- Vos jardins, plantes et photos restent sur votre appareil, dans votre navigateur.
- Pas de compte obligatoire, pas de publicité, pas de cookie, pas de traceur.
- Quelques services extérieurs reçoivent une partie de vos données uniquement quand la fonction l’exige : carte, météo, identification d’une plante, sauvegarde en ligne facultative, entraide entre voisins facultative (annonces et événements).
- L’entraide entre voisins demande un compte (adresse e-mail) et un âge minimum de 15 ans. Elle ne reçoit ni votre adresse ni votre position exacte, seulement un quartier arrondi à environ 1 km.
- Vous pouvez tout exporter ou tout effacer à tout moment depuis les Réglages.

## Qui est responsable

Éditeur et responsable du traitement : [à compléter] ([à compléter]), [à compléter]. Contact : [à compléter].

Les données conservées uniquement sur votre appareil ne sont pas accessibles à l’éditeur.

## Données, finalités, destinataires et durées

Pour chaque donnée : où elle est stockée, qui la reçoit, pourquoi, sur quelle base et combien de temps.

- Jardins : nom, adresse, position du centre, contour de parcelle, bâtiments, relief, plantes (position au mètre près, notes), tâches faites. Stockage : IndexedDB du navigateur (clé permajardin:state:v1) ; copie « avant migration » en cas de correction au chargement. Aucun destinataire extérieur. Finalité : Fournir le service : carte, 3D, calendrier d’entretien. Base : exécution du service demandé. Durée : Jusqu’à effacement par l’utilisateur (ou par le navigateur si le stockage n’est pas persistant). Effacement : Réglages > Effacer toutes mes données (eraseAllData), ou supprimer un jardin.
- Photos de plantes (réduites à 1280 px maximum, sans EXIF ni position GPS : elles sont ré-encodées par le navigateur). Stockage : IndexedDB du navigateur (clés photo:…). Aucun destinataire extérieur. Finalité : Illustrer les plantes. Base : exécution du service demandé. Durée : Jusqu’à suppression de la plante ou effacement. Effacement : Supprimer la plante, ou Effacer toutes mes données. Les photos ne sont jamais synchronisées..
- Photos envoyées pour identification (1 à 5 images, organe choisi). Stockage : Aucun stockage chez nous : relayées en mémoire par la fonction /api/identify. Destinataires : Vercel (hébergeur de la fonction) ; Pl@ntNet (identification ; leur politique de confidentialité s’applique). Finalité : Identifier une plante, uniquement quand l’utilisateur clique sur « Identifier ». Base : votre consentement. Durée : Non conservées par PermaJardin. Conservation par Pl@ntNet : voir my.plantnet.org. Effacement : Demande à Pl@ntNet ; rien à effacer chez PermaJardin.
- Adresse recherchée (texte saisi). Stockage : Dans le jardin créé (voir « jardins »). Destinataires : Vercel (proxy /ext/geopf) ; IGN Géoplateforme (géocodage). Finalité : Trouver l’emplacement du jardin. Base : exécution du service demandé. Durée : Non conservée par PermaJardin hors du jardin créé. Effacement : Effacer toutes mes données.
- Coordonnées du jardin (parcelle, altitude, bâtiments, orthophoto, tuiles de carte). Stockage : Dans le jardin créé ; tuiles IGN dans le cache du service worker (ign-tuiles, ign-ortho-3d). Destinataires : Vercel (proxys /ext/geopf, /ext/apicarto) ; IGN Géoplateforme et API Carto. Finalité : Afficher la carte, la parcelle, le relief et le bâti. Base : exécution du service demandé. Durée : Tuiles : 60 jours au plus dans le cache ; orthophoto 3D : 14 jours. Effacement : Effacer toutes mes données (vide aussi les caches de tuiles).
- Coordonnées du jardin envoyées pour la météo et le climat local (arrondies à 2 décimales, soit environ 1 km). Stockage : localStorage (clés pj-meteo:…, pj-climat:… : coordonnées arrondies à 2 décimales dans la clé). Destinataires : Vercel (proxys /ext/meteo, /ext/meteo-archive) ; Open-Meteo. Finalité : Prévisions et calcul des dates de gel pour proposer les tâches. Base : exécution du service demandé. Durée : Cache de 3 h (prévisions) et 30 jours (climat). Effacement : Effacer toutes mes données.
- Adresse e-mail du compte, instantané en ligne des jardins (sans photos), jeton de session. Stockage : Supabase (table garden_snapshots, protégée par RLS) ; jeton dans le localStorage (clé sb-…-auth-token). Destinataires : Supabase (sous-traitant : hébergement et authentification). Finalité : Sauvegarder et retrouver ses jardins sur un autre appareil. Fonction facultative.. Base : votre consentement. Durée : Jusqu’à suppression du compte ou de l’instantané. Effacement : Réglages > Vie privée > Effacer toutes mes données, avec la case « Supprimer aussi ma sauvegarde en ligne » (supprime l’instantané). Pour supprimer aussi le compte (adresse e-mail), écrire à l’éditeur.
- Entraide entre voisins : adresse e-mail du compte (lien de connexion), jeton de session, adresse IP et navigateur des connexions (conservés par le service d’authentification Supabase). Stockage : Projet Supabase DÉDIÉ à l’entraide (authentification, distinct de la synchronisation) ; jeton dans le localStorage (clé sb-neighbors-auth-token). Destinataires : Supabase (sous-traitant : hébergement et authentification de l’entraide) ; Prestataire d’envoi d’e-mails choisi par l’éditeur (lien de connexion). Finalité : Se connecter à l’entraide sans mot de passe. Fonction facultative, réservée aux personnes de 15 ans et plus.. Base : votre consentement. Durée : Jusqu’à suppression du compte. L’adresse n’est jamais visible des autres membres.. Effacement : Entraide > Mon compte > Supprimer mon compte (deleteMyAccount : photos, puis compte et tout ce qui s’y rattache).
- Entraide : pseudo et quartier (position arrondie à 0,01°, environ 1 km). Jamais d’adresse ni de position exacte. Stockage : Supabase de l’entraide, table profiles (protégée par RLS ; arrondi refait par la base). Destinataires : Supabase (sous-traitant) ; Autres membres de l’entraide à moins de ~55 km (pseudo et quartier, à travers vos annonces, réponses et conversations). Finalité : Afficher qui publie et à quelle distance approximative, pour s’entraider entre voisins. Base : votre consentement. Durée : Jusqu’à suppression du compte. Effacement : Supprimer mon compte ; le pseudo et le quartier se modifient dans Entraide > Mon profil (5 modifications par jour).
- Entraide : annonces (type, titre, description, espèce), réponses publiques aux questions, photo d’annonce (redessinée, sans EXIF ni GPS, 1 Mo au plus). Stockage : Supabase de l’entraide (tables posts et replies ; photos dans un bucket privé neighbors-photos). Destinataires : Supabase (sous-traitant) ; Autres membres de l’entraide à moins de ~55 km, sauf personnes que vous avez bloquées. Finalité : Donner, échanger, prêter, poser des questions entre jardiniers voisins. Base : votre consentement. Durée : Annonces : 60 jours puis suppression automatique (photos comprises). Réponses : tant que l’annonce existe. Effacement : Entraide > Mes annonces > Supprimer (photo comprise) ; suppression du compte.
- Entraide : demande d’organisateur (nom public, courte description), événements (titre, description, dates, lieu en texte libre, lien d’inscription https, nombre de places, quartier arrondi) et « Je suis intéressé(e) » (une ligne par membre et par événement). Stockage : Supabase de l’entraide (tables organizers, events et event_interest ; RLS ; chaque membre ne voit que sa propre ligne d’intérêt, les autres voient seulement le total). Destinataires : Supabase (sous-traitant) ; Autres membres de l’entraide à moins de ~55 km (nom de l’organisateur et événement ; seulement le nombre de personnes intéressées) ; L’éditeur (validation des organisateurs et modération). Finalité : Faire connaître des rendez-vous entre jardiniers voisins, publiés par des organisateurs vérifiés. Base : votre consentement. Durée : Événements : 30 jours après leur fin, puis suppression automatique (marques d’intérêt comprises). Demande d’organisateur : jusqu’à son retrait ou la suppression du compte. Effacement : Entraide > Événements > Ma demande > Retirer ma demande ou Ne plus être organisateur (efface aussi les événements) ; « Je suis intéressé(e) » se retire d’un toucher ; suppression du compte.
- Entraide : messages privés entre deux membres, et pour chaque conversation la date de votre dernière lecture (pour compter les messages non lus). Stockage : Supabase de l’entraide (tables threads, messages et thread_reads ; RLS : seuls les deux participants lisent les messages, chacun ne voit que sa propre date de lecture). Destinataires : Supabase (sous-traitant) ; Votre correspondant ; L’éditeur, uniquement pour traiter un signalement visant ce message. Finalité : Se mettre d’accord pour un don, un échange ou un prêt. Base : votre consentement. Durée : Jusqu’à suppression du compte de l’un des deux participants (la conversation disparaît alors pour les deux). Effacement : Supprimer mon compte ; bloquer une personne masque la conversation des deux côtés.
- Entraide : signalements envoyés (motif, précisions facultatives), personnes bloquées, compteurs d’usage par jour, journal de modération (identifiants et décision, sans le contenu). Stockage : Supabase de l’entraide (tables reports, blocks, quotas, moderation_log ; non lisibles par les autres membres). Destinataires : Supabase (sous-traitant) ; L’éditeur (modération). Finalité : Modérer les contenus (loi pour la confiance dans l’économie numérique), protéger les membres, limiter les abus. Base : intérêt légitime (sécurité, confort d’usage). Durée : Signalements et journal de modération : 12 mois. Blocages : jusqu’au déblocage ou à la suppression du compte. Compteurs : 7 jours. Effacement : Débloquer une personne ; suppression du compte (vos signalements et blocages disparaissent).
- Préférences et repères : thème, date du dernier export, première utilisation, dernière notification, dernière synchronisation, date de votre dernière visite à l’entraide (pour afficher les nouveautés). Stockage : localStorage (clés permajardin:…). Aucun destinataire extérieur. Finalité : Confort d’usage (rappel de sauvegarde, une notification par jour au plus). Base : intérêt légitime (sécurité, confort d’usage). Durée : Jusqu’à effacement. Effacement : Effacer toutes mes données.
- Adresse IP, date, URL et navigateur de chaque requête (journaux techniques d’hébergement). Stockage : Vercel. Destinataires : Vercel (hébergeur). Finalité : Sécurité et exploitation du site. Base : intérêt légitime (sécurité, confort d’usage). Durée : Selon l’offre Vercel du propriétaire (à vérifier dans le tableau de bord). Effacement : Demande à l’éditeur du site.

Aucune de ces données n’est vendue, ni utilisée pour de la publicité ou du profilage.

## Bases légales

- Exécution du service que vous demandez : carte, météo locale, calendrier d’entretien (RGPD, art. 6.1.b).
- Votre consentement : envoi d’une photo à Pl@ntNet pour l’identification, sauvegarde en ligne, et entraide entre voisins (compte, pseudo, quartier, annonces, messages). Il est demandé avant le premier envoi et vous pouvez le retirer à tout moment dans Réglages > Vie privée (art. 6.1.a).
- Intérêt légitime : journaux techniques de sécurité de l’hébergeur, préférences d’usage, modération de l’entraide (signalements, blocages, limites d’usage contre les abus) (art. 6.1.f).
- Obligation légale : conservation des données d’identification et traitement des signalements de contenus illicites, dans les limites prévues par la loi pour la confiance dans l’économie numérique (art. 6.1.c).

Information sans blocage : pour afficher la carte et la météo, les coordonnées de votre jardin sont envoyées à l’IGN (Géoplateforme, API Carto) et à Open-Meteo, par l’intermédiaire de notre hébergeur. Ces envois ne contiennent ni votre nom ni votre e-mail.

## Destinataires

- Vercel Inc. (États-Unis) : hébergement du site, relais des requêtes vers l’IGN et Open-Meteo, fonction d’identification.
- IGN Géoplateforme et API Carto : cartes, géocodage, parcelles, altitude.
- Open-Meteo : prévisions et historique météo.
- Pl@ntNet (Cirad, INRAE, Inria, IRD) : identification des plantes à partir des photos que vous envoyez.
- Supabase : compte et sauvegarde en ligne, seulement si vous activez la synchronisation.
- Supabase (projet distinct, dédié à l’entraide) : compte, profil, annonces, photos, messages, signalements, seulement si vous rejoignez l’entraide. Supabase est notre sous-traitant (RGPD, art. 28).
- Prestataire d’envoi d’e-mails (à renseigner par l’éditeur) : envoi du lien de connexion de l’entraide.
- Les autres membres de l’entraide : voir la section « Entraide entre voisins ».

Chaque service applique sa propre politique de confidentialité.

## Transferts hors Union européenne

Vercel est une société américaine : des données techniques (adresse IP, requêtes) peuvent être traitées aux États-Unis. Les garanties applicables (clauses contractuelles types ou cadre de protection des données UE-États-Unis) sont à confirmer par l’éditeur auprès de Vercel.

Le lieu d’hébergement des projets Supabase (synchronisation et entraide) et d’Open-Meteo est également à confirmer : la région Union européenne doit être vérifiée dans le tableau de bord Supabase avant l’ouverture au public. Supabase est une société américaine : les mêmes garanties (clauses contractuelles types, accord de traitement des données) sont à confirmer.

## Entraide entre voisins

L’entraide est facultative. Elle permet de publier des annonces de don, d’échange, de prêt, des demandes (« Je cherche ») ou des questions, de consulter des événements près de chez vous, et d’écrire en privé à d’autres jardiniers proches. Elle est réservée aux personnes de 15 ans et plus.

- Compte : votre adresse e-mail sert uniquement à vous envoyer un lien de connexion. Elle n’est visible d’aucun autre membre.
- Profil public : un pseudo et un quartier. Le quartier est une position arrondie à environ 1 km, jamais votre adresse ni votre position exacte. Choisissez un pseudo qui ne révèle pas votre identité.
- Annonces et réponses : type (don, échange, prêt, demande ou question), catégorie éventuelle, titre, description, espèce et photo éventuelle. Elles sont visibles des membres situés à moins de 55 km environ, sauf ceux que vous avez bloqués. N’y écrivez ni votre adresse, ni votre téléphone, ni de données concernant d’autres personnes.
- Photos : redessinées dans votre navigateur avant l’envoi (position GPS et métadonnées supprimées), 1 Mo au plus, stockées dans un espace privé. Une photo de jardin peut elle-même révéler un lieu : regardez l’arrière-plan.
- Événements : seuls les organisateurs validés par l’éditeur en publient. Un organisateur donne un nom public et une courte description, jamais d’adresse ni d’e-mail. Un événement montre ce nom, un titre, des dates, un lieu en texte libre (à choisir public), un lien d’inscription éventuel, un nombre de places éventuel et le quartier arrondi de l’organisateur. Il est visible des membres situés à moins de 55 km environ, sauf ceux que l’organisateur a bloqués.
- « Je suis intéressé(e) » : enregistre une ligne à votre nom, que vous seul pouvez lire. Les autres membres et l’organisateur voient seulement le nombre de personnes intéressées, jamais leurs noms. Cela ne vaut pas inscription.
- Liens d’inscription : ils mènent vers des sites extérieurs que l’éditeur ne contrôle pas et dont la politique de confidentialité s’applique. L’appli affiche un avertissement « Vous quittez l’appli » avant de les ouvrir ; elle n’accepte que les liens en https.
- Messages privés : lisibles seulement par vous et votre correspondant. L’éditeur ne les lit pas, sauf pour traiter un signalement visant l’un d’eux. Pour compter vos messages non lus, le serveur garde la date de votre dernière lecture de chaque conversation ; vous seul pouvez la voir.
- Nouveautés : le nombre de nouvelles annonces et de nouveaux messages est calculé dans votre appareil. La date de votre dernière visite reste sur votre appareil et n’est pas envoyée.
- Inviter un voisin : l’appli ouvre le partage de votre téléphone ou copie un lien. Le texte ne contient aucune donnée vous concernant. Rien n’est envoyé par l’appli et aucun contact n’est lu.
- Signalements et blocages : un signalement est lu par l’éditeur ; il n’est pas communiqué à la personne signalée. Un blocage masque réciproquement annonces, réponses et conversations.

Durées de conservation : les annonces (et leurs photos) sont supprimées 60 jours après leur publication. Les événements sont supprimés 30 jours après leur fin, avec les marques d’intérêt. La demande d’organisateur est conservée jusqu’à son retrait ou la suppression du compte. Le compte, le profil, les réponses et les messages sont conservés jusqu’à la suppression du compte, que vous pouvez faire à tout moment dans l’entraide : tout est alors effacé, y compris vos photos. Les signalements sont conservés 12 mois. Certaines données d’identification peuvent être conservées plus longtemps par l’hébergeur lorsque la loi l’impose (un an pour les données permettant d’identifier l’auteur d’un contenu).

Aucune donnée de l’entraide n’est vendue, cédée à des fins publicitaires, ni utilisée pour du profilage. L’entraide n’utilise ni cookie ni traceur publicitaire ; seul un jeton de connexion est gardé dans le stockage de votre navigateur.

Exercer vos droits : suppression du compte dans l’appli ; accès, rectification, portabilité, opposition ou limitation par e-mail à l’éditeur. Nous répondons dans un délai d’un mois. Vos annonces et réponses peuvent être exportées sur demande.

## Âge minimum

L’entraide est réservée aux personnes de 15 ans et plus, âge du consentement numérique en France (loi Informatique et Libertés, art. 45). En dessous, l’accord d’un parent est nécessaire et l’entraide n’est pas proposée. Si vous pensez qu’un mineur de moins de 15 ans a créé un compte, écrivez à l’éditeur : le compte sera supprimé.

## Cookies et traceurs

PermaJardin ne dépose aucun cookie et n’utilise ni mesure d’audience ni traceur publicitaire. Le stockage du navigateur (IndexedDB, localStorage, cache de l’appli) sert uniquement à faire fonctionner l’appli.

## Vos droits

- Accès et portabilité : Réglages > Sauvegarde > Exporter (fichier JSON lisible).
- Rectification : directement dans l’appli.
- Effacement : Réglages > Vie privée > Effacer toutes mes données, avec suppression de la sauvegarde en ligne si vous êtes connecté.
- Opposition, limitation et retrait du consentement : Réglages > Vie privée > Retirer mon consentement, ou par e-mail à l’éditeur.
- Entraide : suppression définitive du compte, des annonces, des photos et des messages depuis l’entraide ; accès et portabilité des données de l’entraide par e-mail à l’éditeur.
- Réclamation : auprès de la CNIL (www.cnil.fr).

Pour toute demande : [à compléter]. Pour les données détenues par un prestataire (par exemple Pl@ntNet), vous pouvez aussi vous adresser à lui.

## Sécurité

Connexions chiffrées (HTTPS), aucune clé secrète dans l’appli, accès à la sauvegarde en ligne limité à son propriétaire, validation de tout fichier importé. Entraide : base séparée de la sauvegarde, règles d’accès appliquées par la base elle-même (chaque membre ne lit que ce qui lui est destiné), quartier arrondi côté appli puis de nouveau côté base, photos privées sans métadonnées, limites quotidiennes contre les abus. En cas de violation de données à risque pour vous, l’éditeur prévient la CNIL et les personnes concernées dans les conditions prévues par le RGPD.

## Modifications

Toute modification importante de cette politique sera signalée dans l’appli. La date de dernière mise à jour figure en haut de la page.

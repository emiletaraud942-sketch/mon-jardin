# Plan : tout reprendre, une étape à la fois

Fait le 29 octobre 2026, à partir de vos 19 remarques. Chaque étape est **livrable seule** : code, tests, essai dans un vrai navigateur, documentation, puis je vous dis ce qui est fait et ce que je n'ai pas pu vérifier. On passe à la suivante quand vous dites « suivant ».

Légende : ✅ constaté dans le code ou par un essai · ❓ question pour vous · 📱 à essayer sur votre téléphone (je ne peux pas).

---

## Ce que j'ai constaté (avant d'écrire le plan)

| Votre remarque | Constat |
| --- | --- |
| « Les données disparaissent quand je ferme le navigateur » (ordinateur, Safari, Chrome, Firefox) | ✅ **Sur Chromium, ça ne disparaît pas** : je place une plante, j'attends 0,4 s, je ferme brutalement, je rouvre : la plante est là (testé à 0,4 s, 1 s, 3 s). ✅ **Une perte existe** si on ferme moins de 0,2 s après une action (l'écriture est différée de 200 ms). ✅ **La synchronisation est entièrement manuelle** (deux boutons dans Réglages) et **les données sont rangées par navigateur et par adresse** : ouvrir l'appli dans un autre navigateur, ou sur une autre adresse (aperçu Vercel, `www`, `http` / `https`), montre un jardin vide. C'est la cause la plus probable de ce que vous voyez. ❓ voir les questions en bas |
| « On n'a pas retrouvé la sauvegarde sur le téléphone » | ✅ La sauvegarde est un **téléchargement** : sur iPhone, elle va dans Fichiers > Téléchargements (ou « Sur mon iPhone »), et l'appli ne dit pas où. Aucune ouverture du menu « Partager » (Fichiers, Drive, e-mail) |
| Grand écran | ✅ À 2560 px : texte minuscule (tailles pensées pour téléphone), panneau de droite étroit, jardin réduit à un petit carré au milieu d'une carte vide |
| Fenêtre trop volumineuse au placement | ✅ Sur ordinateur, le panneau de droite se remplit du long message de l'art. 671 (**je l'ai rallongé au lot 4**). Sur téléphone, la fiche s'ouvre en plein écran et cache la carte |
| Annuler / rétablir / fermer le message | ✅ Un message « placée · Annuler · ✕ » existe (20 s) et je le vois sur ordinateur. ❌ Pas de « rétablir », pas d'annulation après les 20 s, rien sur le raccourci Ctrl+Z. ❓ voir les questions |
| Caractéristiques à la plantation, type d'achat | ✅ Un champ « âge à la plantation (années) » existe, enfoui dans la fiche. ❌ Pas de type d'achat (graine, godet, racines nues, scion, baliveau, demi-tige, haute tige) |
| Note de l'utilisateur | ✅ Une zone de texte libre (« variété, où vous l'avez achetée ») existe. ❌ Rien de structuré (date, lieu, prix) |
| « Google Street View » | ✅ Ce sont les « Photos du jardin » : points de vue, vue circulaire, noms des plantes affichés dessus. **Elles ne scannent pas le jardin et ne reconnaissent pas les plantes.** La reconnaissance est dans « Scanner mon jardin » (vidéo, puis Pl@ntNet une image à la fois). 📱 Rien n'est testé sur un vrai téléphone |
| Saison du jardin | ✅ La vue 3D a un curseur de saison. ❌ Pas sur la carte ni sur les photos, et pas de boutons Hiver / Printemps / Été / Automne |
| Tâche cochée qui disparaît | ✅ Aucun retour visuel : la tâche sort de la liste |
| « Je ne veux pas le faire / pas maintenant » | ❌ N'existe pas |
| Scan de l'étiquette | ❌ N'existe pas |
| Boutures entre voisins | ❌ N'existe pas (les annonces « don » existent, mais pas la composition du jardin) |
| Note de positionnement | ✅ Elle existe mais noyée dans le panneau |
| Vidéo de promo | Je ne peux pas filmer ; je peux écrire le scénario et préparer les captures |

---

## Étape 1 : ne plus jamais perdre de données (priorité absolue)

1. **Écriture immédiate** pour les actions importantes (placer, supprimer, valider) et vidage sur `pagehide`, `visibilitychange` et `beforeunload` ; demande de stockage persistant renouvelée. Test : fermeture brutale 20 ms après un placement.
2. **Un témoin visible** : « Enregistré sur cet appareil ✓ » dans l'en-tête, « Pas enregistré » en rouge si l'écriture échoue (navigation privée, espace plein).
3. **Dire la vérité sur le stockage** : bandeau à la première ouverture et dans Réglages : « Vos jardins sont dans ce navigateur, sur cette adresse. Pour les retrouver ailleurs : créez un compte, ou faites une sauvegarde. » Détection d'une **navigation privée** et d'un jardin vide ouvert sur une autre adresse.
4. **Synchronisation automatique** (si un compte est connecté) : envoi quelques secondes après chaque changement, reprise au démarrage, **jamais d'écrasement silencieux** : si les deux côtés ont changé, on demande (garder cet appareil, garder la copie en ligne, fusionner les plantes). Témoin « Synchronisé à 14 h 32 ».
5. **Vérification** : deux navigateurs réels (Chromium + Firefox) sur la même base de test, avec un faux Supabase local ; scénarios : création, modification des deux côtés, hors ligne, conflit, déconnexion. ❓ Le vrai projet Supabase n'est pas joignable d'ici : vous ferez l'essai de bout en bout avec deux appareils.

## Étape 2 : retrouver la sauvegarde

1. Sur téléphone : **menu « Partager »** (Web Share avec fichier) pour choisir Fichiers, Drive, Mail, AirDrop ; sinon téléchargement.
2. Message précis après la sauvegarde : nom du fichier, où il est (« Fichiers > Téléchargements » sur iPhone, « Téléchargements » sur Android), bouton « Montrer comment le retrouver ».
3. Écran **« Dernière sauvegarde : … »**, rappel plus visible, et option « Garder une copie automatique dans cet appareil » (dernière sauvegarde en mémoire, rien d'envoyé).
4. 📱 Essai iPhone et Android par vous.

## Étape 3 : placement plus clair

1. **Annuler / Rétablir** : historique d'actions (placer, déplacer, supprimer, modifier), boutons ↶ ↷ dans l'en-tête de la carte, Ctrl+Z et Ctrl+Maj+Z, jamais limités à 20 s.
2. **Message de confirmation** : plus visible, plus long à l'écran (reste tant qu'on ne le ferme pas quand il porte « Annuler »), ✕ toujours présent, couleur franche.
3. **Panneau moins envahissant** : après un placement, on garde la carte visible (feuille basse réductible sur téléphone au lieu d'un plein écran ; panneau latéral qui résume sur grand écran).
4. **Avertissement de position** mis en valeur (distance, art. 671) mais **court** : une phrase, le reste sous « En savoir plus ». Je raccourcis le texte que j'ai rallongé.

## Étape 4 : grand écran

1. Échelle de l'interface selon la largeur (au-delà de ≈ 1600 px, texte et boutons plus grands), largeur du panneau de droite adaptée.
2. Carte : le jardin remplit mieux l'écran (réglage du cadrage ; la limite de zoom de la photo aérienne reste respectée), repères plus lisibles.
3. Essais à 1440, 1920, 2560 px avec captures avant / après.

## Étape 5 : fiche de la plante « à la plantation »

1. Petit assistant juste après le placement, **toutes les questions passables** (« je ne sais pas », « plus tard ») : **forme d'achat** (graine, godet, motte, racines nues, scion, baliveau, demi-tige, haute tige), **hauteur à l'achat**, **âge connu ou non**, date de plantation, lieu d'achat, prix, note.
2. Le modèle de croissance utilise la forme d'achat (un baliveau n'est pas un scion) ; l'âge devient optionnel.
3. **Note d'achat structurée** (lieu, date, prix) en plus de la note libre.
4. **Quand mesurer** : la fiche dit « Mesurez-la maintenant / dans 3 mois / à la fin de l'été » et rappelle (tâche) ; explication de comment mesurer.
5. **Format de données** : champs optionnels ajoutés au format stocké, avec étape de migration et test (`CLAUDE.md` : « pas de changement de format sans migration »).
6. **Scan de l'étiquette** : ❓ voir les questions.

## Étape 6 : tâches

1. **Retour visuel** quand on valide : la carte passe au vert avec ✓ avant de se replier, et un message « Fait ✓ · Annuler ».
2. **Pas maintenant** (repousser d'une semaine, d'un mois) et **Je ne veux pas le faire** (ne plus proposer pour cette plante), toujours annulables ; visibles dans « Historique ».
3. Format : état de la tâche (`fait`, `reporte`, `refuse`) avec migration et test.

## Étape 7 : choisir la saison du jardin (✅ fait le 29 oct.)

Boutons **Hiver · Printemps · Été · Automne · Aujourd'hui** sur la vue 3D et sur la carte (aspect des plantes : feuilles, fleurs, fruits), pour montrer son jardin en été même en janvier. Réponse : aussi sur la carte et sur les photos du jardin. Fait : mêmes boutons partout (`SeasonPicker`) ; sur les photos, l’image reste celle du jour de la prise de vue et chaque nom dit l’état de la plante à la saison choisie.

## Étape 8 : boutures entre voisins (✅ code fait le 29 oct. ; migration v8 à coller par vous)

1. Option **« Montrer ce que j'ai dans mon jardin »** (désactivée par défaut) : liste des **espèces** seulement, jamais les positions.
2. Annonces « don de bouture » liées à une espèce de mon jardin ; un voisin voit « Marie a : lavande, romarin, rosier » dans sa zone.
3. **Migration Supabase** (entraide v8) à appliquer par vous, mise à jour des textes de confidentialité (consentement), modération (signalement).

## Étape 9 : « Street View » et reconnaissance

1. Dire clairement dans l'appli ce que font « Photos du jardin » et « Scanner mon jardin ».
2. Voir avec vous si on relie les deux (reconnaître les plantes sur les photos d'un point de vue). 📱 Je ne peux pas tester caméra et boussole : essai par vous d'abord.

## Étape 10 : vidéo de promo

Scénario écrit (30 à 60 secondes), liste des écrans à montrer dans l'ordre, textes à l'écran, captures préparées avec un jardin de démonstration. Je ne produis pas la vidéo elle-même.

---

## Questions ouvertes

1. **Adresse d'ouverture** : sur quelle adresse ouvrez-vous l'appli (celle de Vercel du projet, un aperçu, un domaine à vous) ? Utilisez-vous toujours la même ?
2. **Compte** : avez-vous un compte de synchronisation ? Le bouton « Mon compte » propose-t-il la connexion par e-mail chez vous ? (Supabase est facultatif : s'il n'est pas configuré en production, il n'y a **aucune** synchronisation.)
3. **« Annuler »** : sur quel appareil ne le voyez-vous pas, et au bout de combien de temps le message disparaît-il ?
4. **Scan de l'étiquette** : l'étiquette est-elle surtout un nom de plante en texte, un code-barres ou un QR code ? (Lire un QR ou un code-barres est simple ; lire du texte demande un module de reconnaissance de 2 à 4 Mo, qui marche moins bien hors ligne.)
5. **Saison** : voulez-vous les saisons sur la vue 3D seulement, ou aussi sur la carte et les photos du jardin ?
6. **Boutures** : la composition du jardin doit-elle être visible de **tous** les voisins de la zone, ou seulement après une demande ?

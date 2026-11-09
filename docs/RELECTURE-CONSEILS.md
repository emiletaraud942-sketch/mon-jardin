# Relecture des conseils « compost » et « économiser l'eau »

Contenu à relire par un jardinier avant diffusion large. Les fiches sont rédigées d'après des savoirs de jardinage courants et des principes généraux (ADEME, INRAE) : aucune citation précise, aucun lien, et les faits n'ont pas été revérifiés en ligne pour cette version.

Données : `src/data/conseils/` (types dans `types.ts`, fiches dans `compost.ts` et `eau.ts`, export dans `index.ts`, tests dans `conseils.test.ts`). Règles appliquées : phrases de 20 mots au plus, aucune dose chiffrée, aucun produit chimique, formules prudentes (« souvent », « en général »), pas de jargon (« matières vertes (fraîches) » et « matières brunes (sèches) » expliquées dans chaque fiche qui les emploie).

| id | Titre | Points à vérifier |
| --- | --- | --- |
| compost-demarrer | Démarrer un tas ou un bac de compost | « Environ un mètre de côté » (taille minimale pour qu'un tas travaille bien) ; emplacement mi-ombre ; bacs communaux « à prix réduit ou prêtés » (formulé comme une possibilité). |
| compost-quoi-mettre | Quoi mettre : matières vertes et brunes | « À peu près autant de brun que de vert, en volume » ; ortie et consoude comme activateurs ; feuilles de chêne et de noyer lentes. |
| compost-a-eviter | Ce qu'il ne faut pas mettre au compost | Liste des refus (viande, laitiers, plantes malades, graines, bois traité, litière de chat) ; agrumes et oignons « en petite quantité ». |
| compost-entretenir | Entretenir son compost : aérer et arroser | Test de la poignée (éponge pressée) ; brassage « de temps en temps », sans fréquence chiffrée. |
| compost-problemes | Trop humide, trop sec ou qui sent mauvais | Remèdes par symptôme ; grillage fin sous le bac contre les rongeurs. |
| compost-mur | Reconnaître un compost mûr et l'utiliser | Délai « souvent six mois à un an » ; compost jeune seulement en paillage ; épaisseur « quelques centimètres ». |
| compost-petit-espace | En appartement ou dans un petit jardin | Lombricomposteur : vers spéciaux (pas les vers de terre du jardin), température tempérée ; liquide « dilué beaucoup » sans dosage ; aliments à limiter. |
| compost-feuilles-tonte | Feuilles mortes et tonte : par couches fines | Tonte en couches de quelques centimètres ; terreau de feuilles « un à deux ans » ; refus de la tonte d'une pelouse traitée. |
| eau-pailler | Pailler pour garder l'humidité | Épaisseur « cinq à dix centimètres » ; paillage après réchauffement du sol ; limaces sous paillage épais. |
| eau-matin-ou-soir | Arroser le matin ou le soir | Matin préféré, soir acceptable ; aucun avis tranché sur « les gouttes qui brûlent » (volontairement absent) ; limaces et maladies si feuilles mouillées le soir. |
| eau-au-pied-profondeur | Arroser au pied, en profondeur, moins souvent | Principe général (racines profondes) ; « deux premiers étés » pour les plantations récentes (« souvent »). |
| eau-pluie | Récupérer l'eau de pluie | Couvercle, filtre, trop-plein ; « pas potable » ; aucune règle légale précise : renvoi à la mairie pour les usages et déclarations. Vérifier les règles locales avant diffusion. |
| eau-plantes-seches | Plantes qui aiment la chaleur et la sécheresse | Plantes citées (lavande, romarin, thym, sauge, origan, achillée, figuier, olivier : ids du catalogue) ; plantation d'automne ; sol drainant en hiver. |
| eau-biner | Biner : un binage vaut deux arrosages | Dicton présenté comme tel (« il y a du vrai, surtout en sol qui croûte ») ; profondeur « quelques centimètres ». |
| eau-buttes | Potager en butte | Affirmation prudente (« peut mieux retenir l'eau ») ; flancs et sommet plus secs ; paillage indispensable. |
| eau-pots | Pots et jardinières : arroser plus souvent | Test du doigt de deux ou trois centimètres ; soucoupe vidée en hiver ; terre cuite plus sèche que le plastique. |
| eau-plante-soif | Reconnaître une plante qui a soif | Signes (feuilles molles le matin, bords bruns) ; rappel que trop d'eau donne aussi des feuilles jaunes et molles. |
| eau-canicule | Pendant une canicule : protéger le jardin | Priorités d'arrosage ; pelouse jaunie qui « repart souvent » ; arrêtés de restriction (renvoi à la mairie). |

## Points sensibles à valider

- **Eau de pluie et règles locales** : les fiches ne citent aucune règle légale (usages permis, déclaration, dispositifs en intérieur, redevances) et renvoient à la mairie. Vérifier qu'aucune phrase ne laisse croire qu'une cuve est toujours autorisée ou qu'une eau de toiture convient à tous les usages.
- **Compost et déchets à éviter** : liste de refus à confronter aux consignes des collectivités (certaines acceptent ou refusent des restes cuits, du carton, des agrumes). La fiche reste volontairement stricte.
- **Mois** : valables pour la moitié nord et le centre de la France ; plus précoces dans le Sud.
- **Plantes citées** : seulement des ids de `src/data/species` (vérifié par le test) ; leur résistance à la sécheresse reste à confirmer par un jardinier pour les régions très humides.
- **Pas d'écran de relecture** : dès que l'écran existe, y ajouter la mention « Contenu à relire par un jardinier » tant que ce tableau n'est pas validé.

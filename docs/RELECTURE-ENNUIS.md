# Relecture du guide « bestioles et maladies du jardin »

Contenu à relire par un jardinier ou un agronome avant diffusion large. Les fiches sont rédigées d'après des savoirs de jardinage courants et des principes généraux (INRAE, Ecophyto) : aucune citation précise, aucun lien, et les faits n'ont pas été revérifiés en ligne pour cette version.

Écran : `src/features/ravageurs/` ; tant que ce tableau n'est pas validé, l'écran affiche « Contenu à relire par un jardinier » (constante `A_RELIRE` de `EnnuisScreen.tsx`, à passer à `false` après la relecture).

Données : `src/data/ravageurs/` (types dans `types.ts`, tests dans `ennuis.test.ts`). Règles appliquées : phrases de 20 mots au plus, aucune dose chiffrée, aucun produit cité hors cuivre, soufre, savon insecticide, huile de colza, Bacillus thuringiensis, phosphate ferrique et engrais riche en fer (toujours « selon l'étiquette du produit »), rappel pour les abeilles.

| id | Nom | Plantes | Points à vérifier |
| --- | --- | --- | --- |
| puceron | Pucerons | rosier, fève, haricots, capucine, cerisier, pêcher, pommier, chou, laitue | Pincer le haut des fèves ; savon insecticide du commerce (le « savon noir » maison n'est pas cité volontairement). |
| limace-escargot | Limaces et escargots | laitue, chicorée, fraisier, haricot nain, courgette, basilic, chou, blette, épinard, dahlia, hortensia | Piège à bière (« peut aider ») ; phosphate ferrique admis en bio ; aucun autre produit cité. |
| mildiou | Mildiou (tomate, pomme de terre) | tomate, pomme de terre | Délai d'environ deux semaines après avoir coupé les fanes ; rotation de 3 à 4 ans ; cuivre préventif. |
| oidium | Oïdium | courgette, concombre, potiron, melon, rosier, vigne, pommier, fraisier, pois, groseillier à maquereau | Soufre déconseillé par forte chaleur ; prêle « en prévention, peut aider ». |
| rouille | Rouille (poireau, rosier) | poireau, ail, ciboulette, rosier | Poireau mangeable après épluchage ; aucun traitement proposé. |
| tavelure | Tavelure (pommier, poirier) | pommier, poirier | Feuilles ramassées puis poubelle ou broyage ; cuivre ou soufre avant floraison. |
| moniliose | Moniliose (monilia) | cerisier, prunier, mirabellier, abricotier, pêcher, pommier, poirier | Coupe des rameaux flétris au printemps par temps sec (compatible avec « pas de taille en hiver » des fruits à noyau) ; rappel des périodes de taille. |
| cloque-pecher | Cloque du pêcher | pêcher, amandier, abricotier | Abri de la pluie en fin d'hiver ; cuivre à la chute des feuilles et en fin d'hiver ; abricotier concerné « légèrement » (à confirmer). |
| carpocapse | Carpocapse (ver des pommes et des poires) | pommier, poirier, noyer | Bande de carton ondulé en juin-juillet ; piège à phéromone : indicateur seulement ; noyer concerné (noix véreuses). |
| pieride-chou | Piéride du chou | choux, capucine | Bacillus thuringiensis : tue aussi les chenilles de papillons utiles (écrit dans la fiche). |
| doryphore | Doryphore | pomme de terre, aubergine | Ramassage à la main, eau savonneuse pour les noyer ; aucun produit. |
| mouche-carotte | Mouche de la carotte | carotte, panais, céleri-rave, céleri-branche, persil, cerfeuil | Association carotte-poireau « peut aider » ; semis clair ; plantes concernées autres que la carotte (panais, persil, céleri). |
| altise | Altises | radis, roquette, navet, chou-rave, cresson alénois, pak-choï, radis noir, rutabaga, chou kale | Dates de semis conseillées (début de printemps, fin d'été) ; aucun produit. |
| taupin | Taupins (vers fil de fer) | pomme de terre, carotte, salsifis, oignon, maïs, fraisier | Piège à pomme de terre enterrée ; conseil « haricots la première année après prairie ». |
| cochenille | Cochenilles | citronnier, olivier, laurier-sauce, vigne, figuier | Frottage à l'eau savonneuse ou alcool ménager ; huile de colza en fin d'hiver (étiquette) ; laurier-sauce et figuier concernés à confirmer. |
| araignee-rouge | Araignées rouges | tomate, aubergine, haricot nain, concombre, courgette, fraisier, rosier | Savon insecticide du commerce, le soir ; aucune dose. |
| taches-noires-rosier | Taches noires du rosier | rosier | Soufre ou cuivre selon l'étiquette ; ramassage des feuilles à l'automne. |
| campagnol-taupe | Campagnols et taupes | pomme de terre, carotte, tulipe, topinambour, pommier | Piégeage du campagnol (pièges à pincer) ; règles locales éventuelles sur le piégeage des taupes ; « taupe utile ». Aucun poison. |
| oiseaux-fruits | Oiseaux qui mangent les fruits | cerisier, framboisier, groseillier, cassissier, myrtillier, fraisier, vigne, prunier | Filet à mailles fines tendu (risque de piéger un oiseau) ; oiseaux protégés ; nidification du 15 mars au 31 juillet. |
| feuilles-jaunes | Feuilles jaunes | tomate, courgette, laitue, rosier, hortensia, citronnier, myrtillier, pêcher | Quatre causes résumées (faim, fer, trop d'eau, pas assez d'eau) ; engrais riche en fer selon l'étiquette ; terre de bruyère pour myrtillier et hortensia bleu. |
| pyrale-buis | Pyrale du buis | buis | Bacillus thuringiensis ; piège à phéromone ; remplacement par l'if proposé. |

## Points transversaux à valider

- Produits : vérifier que chaque produit cité est bien en vente libre pour les jardiniers amateurs au moment de la diffusion (la réglementation évolue). Le « savon noir » n'est pas cité, seulement un « savon insecticide vendu en jardinerie ».
- Mois d'apparition : valables pour la moitié nord et le centre de la France ; plus précoces dans le Sud.
- Le service « Jardinons » n'existe nulle part dans le dépôt : les fiches renvoient à « une jardinerie, un voisin jardinier ou un conseiller ». À remplacer si un service précis doit être nommé.

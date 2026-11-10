# Relecture de la rotation du potager

Contenu à relire par un jardinier avant diffusion large. Les durées et le cycle ci-dessous viennent de règles courantes des guides de jardinage français, volontairement simples : **aucune source précise n'est citée** et rien n'a été revérifié en ligne pour cette version. L'écran dit toujours « souvent » et « conseils généraux » (`ROTATION_CAUTION`) ; il ne promet jamais un résultat.

Code : `src/engine/rotation.ts` (familles, durées, cycle, phrases ; pur, testé dans `rotation.test.ts`), écran `src/features/rotation/` (`RotationScreen.tsx`, `groups.ts`), avertissement doux dans Où planter ? (`RotationNote`). Rien n'est stocké : zones et dates sont recalculées à chaque ouverture à partir des plantes en place. **Il n'y a pas de marqueur « à relire » à l'écran pour la rotation** (`A_RELIRE` n'existe que pour les ennuis, les conseils et les leçons) : à ajouter si vous le souhaitez, avant une diffusion large.

## Ce que l'écran fait

- Il ne regarde que les **légumes et aromatiques annuels**. Les vivaces, les arbres, les fleurs et les engrais verts sont ignorés ; une plante marquée « récoltée » compte comme précédent.
- Une **zone** regroupe les cultures à 3 m ou moins de la première culture de la zone (`ZONE_RADIUS_M`) ; elle est nommée d'après sa place par rapport au centre du jardin.
- Une culture « occupe » sa place jusqu'à la fin de sa fenêtre de récolte (même règle que les tâches du jardin) ; sans date de récolte, un an.
- Pour chaque famille déjà cultivée dans la zone, il dit : « Ne remettez pas ici la famille de la tomate avant 2029 (souvent 3 ans). »
- Il propose une suite d'après le **cycle classique** : « légumes-feuilles, puis légumes-fruits, puis légumes-racines, puis pois et haricots » (`CYCLE_SENTENCE`).

## Durées d'attente par famille (`FamilyInfo.years`)

| Famille (nom affiché) | Années | Exemples cités | Justification donnée dans le code | À vérifier |
| --- | --- | --- | --- | --- |
| Brassicacées (le chou) | 4 | chou, radis, navet, roquette | Hernie du chou, qui reste longtemps dans le sol (« souvent 4 ans, parfois plus »). | 4 ans pour tout (radis et roquette compris) ou seulement pour les choux ? |
| Solanacées (la tomate) | 3 | tomate, pomme de terre, aubergine, poivron | Mildiou, nématodes (« souvent 3 à 4 ans »). | On prend 3 : confirmer. |
| Apiacées (la carotte) | 3 | carotte, panais, céleri, persil | Mouche de la carotte et maladies communes (« souvent 3 à 4 ans »). | Persil inclus : confirmer. |
| Cucurbitacées (la courge) | 3 | courgette, courge, concombre, melon | Oïdium, fusariose (« souvent 2 à 3 ans », on prend le plus prudent). | 3 ou 2 ans ? |
| Liliacées et Alliacées (l'oignon) | 3 | oignon, ail, poireau, échalote | Rouille, pourriture blanche, mouche de l'oignon (« souvent 2 à 3 ans », on prend 3). | 3 ou 2 ans ? |
| Chénopodiacées (la betterave) | 3 | betterave, épinard, blette | Mêmes maladies (« souvent 3 ans »). | Confirmer. |
| Fabacées (le pois) | 2 | pois, haricot, fève | Pression plus faible (« souvent 2 ans »). | Certains jardiniers attendent-ils plus longtemps pour le pois ? |
| Astéracées (la laitue) | 2 | laitue, chicorée, salsifis | Pression plus faible (« souvent 2 ans »). | Confirmer. |
| Poacées (le maïs) | 2 | maïs | « Souvent 2 ans ». | Confirmer. |
| Rosacées (le pommier) | 3 | pommier, fraisier, rosier | « Fatigue du sol » des arbres fruitiers et du fraisier. **Sans effet ici** : l'écran ne traite aucune annuelle de cette famille. | Aucune action ; durée gardée pour mémoire. |
| Lamiacées (la menthe) | 0 | basilic, menthe, sauge | Pas de règle connue : rien n'est dit. | Basilic : une règle utile ? |
| Autres familles | 0 | — | Rien n'est dit. | — |

La famille d'une espèce est lue dans le champ `famille` de sa fiche (latin ou français, accents, singulier ou pluriel ; ex. « Crucifères » = Brassicacées, « Ombellifères » = Apiacées, « Liliacées » = Alliacées, « Amaranthacées » = Chénopodiacées). Une valeur inconnue donne « Autres familles » : aucun conseil. Les 173 fiches n'ont pas été modifiées.

## Cycle classique et groupes (`CropGroup`)

Chaque famille est rangée dans un groupe pour proposer la suite :

| Groupe | Familles rangées dedans | Suite proposée (exemples cités) |
| --- | --- | --- |
| feuilles | Brassicacées, Astéracées | chou, laitue, épinard |
| fruits | Solanacées, Cucurbitacées, Poacées | tomate, courgette, poivron |
| racines | Apiacées, Alliacées, Chénopodiacées | carotte, betterave, oignon |
| légumineuses | Fabacées | « pois, haricot ou fève : ils nourrissent le sol » |

## Points sensibles à valider

- **Rangements discutables** : le **maïs** est rangé avec les légumes-fruits ; le **poireau** (Alliacées) avec les racines ; l'**épinard** et la **blette** (Chénopodiacées) avec les racines, alors que la suite « légumes-feuilles » propose justement l'épinard. Une culture d'épinard compte donc comme « racines » pour savoir quoi mettre ensuite. Est-ce acceptable ou faut-il séparer ?
- **Radis, navet et roquette** (Brassicacées) sont rangés avec les feuilles et reçoivent la durée de 4 ans du chou.
- **Une seule durée par famille** : aucune nuance par espèce, par sol, par région ni par pression de maladie.
- **Zone de 3 m** : choix de simplicité. Dans un petit jardin, tout peut tomber dans une seule zone ; dans un grand, deux planches voisines peuvent être comptées comme deux zones.
- **Dates** : la fin de culture est celle de la fenêtre de récolte de la fiche ; une culture arrachée plus tôt ou plus tard n'est pas connue.
- **Phrases** : « Souvent, on attend N ans avant de la remettre au même endroit » et « Pour la suite, essayez… » : vérifier qu'aucune ne se lit comme une obligation. Les phrases de l'interface font 20 mots au plus (test) ; aucune dose, aucun produit.
- **Climat et sol** : valables pour un potager de jardin familial en métropole ; la prudence « votre sol et votre climat peuvent demander autre chose » est affichée avec chaque conseil.

Quand ce tableau est validé : corriger les durées ou les groupes dans `FAMILIES` (`src/engine/rotation.ts`), mettre à jour les tests, puis noter ici la date et le nom de la personne qui a relu.

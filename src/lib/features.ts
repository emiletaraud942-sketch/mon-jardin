import { neighborsEnabled } from './neighbors/enabled'
import { speechSupported } from './speech'
import { getState } from './store'
import { addPicker, ennuisOpen, guideOpen, identifyOpen, plantChoice, postIntent, rotationOpen, shoppingOpen, tourOpen, type PlantAsk } from './overlays'
import { reveal } from './reveal'
import { redoWithToast, undoWithToast } from './history'
import { showToast } from './toast'
import { getUi, openHelp, restartOnboarding, setUi, startMoving, type Tab } from './ui'
import { openScan } from '../features/scan/scanUi'
import { openPanorama } from '../features/panorama/panoUi'
import { SPECIES_BY_ID } from '../data/species'
import { canMarkHarvested } from '../engine/annuelles'

// Registre unique des fonctions de l'appli : « Tout ce que je peux faire », « Je suis perdu » et la recherche de fonctions le lisent.
// Chaque fonction a un mot court, une phrase d'au plus 20 mots, une rubrique, des mots-clés de recherche et une action qui amène
// l'écran à la fonction depuis n'importe où (une fenêtre s'ouvre, ou l'écran défile et clignote : `data-feat="<cible>"`).
// Pas de fonction retirée : toute nouvelle fonction de l'appli s'ajoute ici (un test vérifie que chaque `cible` existe dans le code).

export type RubriqueId = 'jardin' | 'plantes' | 'promener' | 'afaire' | 'voisins' | 'compte'

export interface Rubrique {
  id: RubriqueId
  titre: string
  phrase: string
}

export const RUBRIQUES: Rubrique[] = [
  { id: 'jardin', titre: 'Mon jardin', phrase: 'La carte, le placement des plantes, le scanner.' },
  { id: 'plantes', titre: 'Mes plantes', phrase: 'Vos plantes, leurs photos, leur croissance, le catalogue.' },
  { id: 'promener', titre: 'Se promener et regarder', phrase: 'La 3D, les saisons, le soleil, les photos du jardin.' },
  { id: 'afaire', titre: 'À faire et conseils', phrase: 'Les tâches, la météo, quoi semer, où planter.' },
  { id: 'voisins', titre: 'Voisins', phrase: 'L’entraide entre voisins et le partage de l’appli.' },
  { id: 'compte', titre: 'Mon compte et mes données', phrase: 'Texte, sauvegardes, jardins, vie privée.' },
]

export interface Feature {
  id: string
  /** Libellé court du bouton. */
  mot: string
  /** Une phrase d'au plus 20 mots. */
  phrase: string
  rubrique: RubriqueId
  /** Mots qu'on pourrait taper pour la trouver (« tailler », « photo », « sauvegarde »). */
  motsCles: string[]
  /** `data-feat` de ce qu'on voit en arrivant : sert au défilement, au clignotement et aux tests. */
  cible: string
  /** Amène l'écran à la fonction. Appelable hors React. */
  run: () => void
  /** Absente : toujours proposée. */
  visibleSi?: () => boolean
}

// ---------- Aides à l'écriture des actions ----------

/** Va sur un écran (en refermant la fiche ou l'espèce ouverte), puis demande un panneau et montre la cible. */
function go(tab: Tab, o: { intent?: string; path?: string[]; activate?: boolean } = {}): () => void {
  return () => {
    setUi({ tab, selectedPlantId: undefined, speciesId: undefined })
    if (o.intent) postIntent(o.intent)
    if (o.path) void reveal(o.path, { activate: o.activate })
  }
}

const isPlacing = () => !!(getUi().placingSpeciesId || getUi().movingPlantId)

/** Aides au placement : elles n'existent que pendant un placement. Sans placement, on choisit d'abord la plante. */
function aid(path: string[]): () => void {
  return () => {
    if (isPlacing()) {
      if (getUi().tab !== 'carte') setUi({ tab: 'carte' })
      void reveal(path)
    } else addPicker.set({ then: path })
  }
}

const gardenPlants = () => {
  const s = getState()
  return s.plants.filter((p) => p.gardenId === s.activeGardenId)
}

/** Ce qu'on fait d'une plante une fois choisie. */
export function applyToPlant(ask: PlantAsk, plantId: string) {
  if (ask === 'deplacer') return startMoving(plantId)
  setUi({ tab: 'plantes', selectedPlantId: plantId, speciesId: undefined })
  const path: Record<Exclude<PlantAsk, 'deplacer'>, string> = { fiche: 'fiche', photos: 'photos-plante', journal: 'journal', croissance: 'croissance', recoltee: 'recoltee', supprimer: 'supprimer' }
  void reveal([path[ask]])
}

/** Choisit la plante (sans question s'il n'y en a qu'une), puis applique l'action. */
export function askPlant(ask: PlantAsk): void {
  let list = gardenPlants()
  if (ask === 'recoltee') {
    const now = new Date()
    list = list.filter((p) => canMarkHarvested(p, SPECIES_BY_ID[p.speciesId], now).ok)
    if (list.length === 0) {
      showToast({ message: 'Aucune plante n’a fini sa saison. Les annuelles apparaissent ici à la fin de la récolte.' })
      return
    }
  }
  if (list.length === 0) {
    showToast({ message: 'Ajoutez d’abord une plante au jardin.' })
    addPicker.set({})
    return
  }
  if (list.length === 1) applyToPlant(ask, list[0].id)
  else plantChoice.set(ask)
}

/** Plantes proposées pour une action (même filtre que `askPlant`). */
export function plantsFor(ask: PlantAsk) {
  const now = new Date()
  return gardenPlants().filter((p) => ask !== 'recoltee' || canMarkHarvested(p, SPECIES_BY_ID[p.speciesId], now).ok)
}

const F = (id: string, mot: string, rubrique: RubriqueId, phrase: string, motsCles: string[], cible: string, run: () => void, visibleSi?: () => boolean): Feature => ({ id, mot, rubrique, phrase, motsCles, cible, run, visibleSi })

// ---------- Les fonctions ----------

export const FEATURES: Feature[] = [
  // Mon jardin
  F('carte', 'Voir ma carte', 'jardin', 'Votre terrain vu du ciel, avec vos plantes placées au mètre près.', ['plan', 'terrain', 'photo aérienne', 'carte'], 'carte', go('carte', { path: ['carte'] })),
  F('ajouter-plante', 'Ajouter une plante', 'jardin', 'Choisissez la plante, puis touchez la carte à l’endroit où elle pousse.', ['planter', 'placer', 'ajouter', 'nouvelle plante', 'semer'], 'picker', () => addPicker.set({})),
  F('vue-plan', 'Vue photo ou vue plan', 'jardin', 'Passez de la photo aérienne au plan dessiné, plus facile à lire.', ['photo', 'plan', 'fond de carte', 'aérienne'], 'fond-carte', go('carte', { path: ['fond-carte'] })),
  F('options-carte', 'Options de la carte', 'jardin', 'Recentrer, limites du terrain, saison, taille adulte, noms et légende.', ['options', 'réglages carte', 'noms', 'taille adulte', 'limites'], 'map-options', go('carte', { intent: 'carte:options', path: ['map-options'] })),
  F('recentrer', 'Recentrer sur mon terrain', 'jardin', 'Ramène la carte sur votre terrain si vous vous êtes perdu.', ['recentrer', 'perdu', 'revenir', 'centrer'], 'recentrer', go('carte', { intent: 'carte:options', path: ['recentrer'] })),
  F('legende', 'Légende de la carte', 'jardin', 'Explique les traits jaunes, les disques et les pointillés.', ['légende', 'signification', 'traits', 'couleurs'], 'legende', go('carte', { intent: 'carte:legende', path: ['legende'] })),
  F('viser', 'Viser avec la croix', 'jardin', 'Déplacez la carte sous une croix fixe pour poser une plante au centimètre.', ['viser', 'croix', 'précis', 'viseur'], 'viser', aid(['viser'])),
  F('loupe', 'Loupe', 'jardin', 'Agrandit l’endroit visé pour placer une plante sans que le doigt le cache.', ['loupe', 'agrandir', 'zoom', 'appui long'], 'loupe', aid(['loupe'])),
  F('par-mesures', 'Placer au mètre', 'jardin', 'Placez une plante en mesurant sa distance à deux repères avec un mètre.', ['mesures', 'mètre', 'distance', 'repères', 'placer'], 'scan-mesures', () => openScan('mesures', { kind: 'new' })),
  F('je-suis-ici', 'Je suis ici', 'jardin', 'Place la plante là où vous vous tenez, grâce au GPS du téléphone.', ['gps', 'position', 'ici', 'localiser'], 'je-suis-ici', aid(['aides-toggle', 'je-suis-ici'])),
  F('coller', 'Coller aux bords', 'jardin', 'La plante s’aligne sur les limites, les maisons et les autres plantes.', ['aimant', 'bords', 'aligner', 'coller', 'accrocher'], 'coller-bords', aid(['aides-toggle', 'coller-bords'])),
  F('grille', 'Grille', 'jardin', 'Affiche un quadrillage de 1 ou 5 mètres sur la carte.', ['grille', 'quadrillage', 'mètres'], 'grille', aid(['aides-toggle', 'grille'])),
  F('fond-simple', 'Fond simple', 'jardin', 'Remplace la photo par un fond uni, plus lisible pendant le placement.', ['fond', 'schéma', 'simple', 'uni'], 'fond-simple', aid(['aides-toggle', 'fond-simple'])),
  F('annuler', 'Annuler mon dernier geste', 'jardin', 'Défait la dernière action : une plante placée, déplacée ou supprimée.', ['annuler', 'défaire', 'erreur', 'retour arrière', 'oups'], 'toast', () => undoWithToast()),
  F('retablir', 'Rétablir', 'jardin', 'Refait ce que vous venez d’annuler.', ['rétablir', 'refaire', 'annuler l’annulation'], 'toast', () => redoWithToast()),
  F('scanner', 'Scanner mon jardin', 'jardin', 'Placez vos plantes avec le téléphone, en marchant dans le jardin.', ['scanner', 'scan', 'caméra', 'marcher', 'filmer'], 'scan-menu', () => openScan('menu')),
  F('scan-filmer', 'Filmer en marchant', 'jardin', 'Marchez dans le jardin : l’appli propose le nom des plantes, avec votre accord.', ['filmer', 'vidéo', 'marcher', 'reconnaître'], 'scan-scanner', () => openScan('scanner', undefined, { video: true })),
  F('scan-photo', 'Placer une plante en la photographiant', 'jardin', 'Photographiez une plante pour la placer là où vous êtes.', ['photographier', 'photo', 'placer', 'scanner'], 'scan-scanner', () => openScan('scanner')),
  F('recalage', 'Ajuster la carte à ma position', 'jardin', 'Améliore la précision de la carte avec quelques repères sur place (facultatif).', ['recaler', 'recalage', 'précision', 'repère', 'décalage'], 'scan-recaler', () => openScan('recaler')),
  F('infos-terrain', 'Infos du terrain et du sol', 'jardin', 'Adresse, surface, nature du sol, dates de gel et maisons voisines.', ['sol', 'terrain', 'argile', 'surface', 'gel', 'adresse', 'parcelle'], 'infos-terrain', go('reglages', { path: ['infos-terrain'] })),
  F('test-sol', 'Reconnaître mon sol', 'jardin', 'Trois questions avec une poignée de terre : l’appli propose la nature de votre sol.', ['sol', 'terre', 'boudin', 'argile', 'sable', 'limon', 'reconnaître', 'test'], 'test-sol', go('reglages', { path: ['infos-terrain', 'test-sol'] })),
  F('relief', 'Relief et arbres des environs', 'jardin', 'Choisissez d’utiliser le relevé IGN pour la pente et les arbres voisins.', ['relief', 'lidar', 'pente', 'arbres voisins', 'ombre', 'actualiser'], 'lidar', go('reglages', { path: ['lidar'] })),

  // Mes plantes
  F('mes-plantes', 'Voir mes plantes', 'plantes', 'La liste de vos plantes, rangées par type, avec leur état.', ['liste', 'plantes', 'jardin', 'rechercher'], 'liste-plantes', go('plantes', { path: ['liste-plantes'] })),
  F('fiche-plante', 'Ouvrir la fiche d’une plante', 'plantes', 'Son état, ses tâches, ses voisines, son journal de photos et ses réglages.', ['fiche', 'plante', 'détail', 'état'], 'fiche', () => askPlant('fiche')),
  F('photo-plante', 'Ajouter une photo à une plante', 'plantes', 'Gardez le souvenir de sa pousse avec des photos prises sur place.', ['photo', 'ajouter une photo', 'image', 'appareil photo'], 'photos-plante', () => askPlant('photos')),
  F('journal-jardin', 'Voir le journal d’une plante', 'plantes', 'Les photos d’une plante rangées par date, avec une comparaison avant et après.', ['journal', 'photo', 'avant', 'après', 'croissance', 'évolution', 'comparer', 'date'], 'journal', () => askPlant('journal')),
  F('deplacer', 'Déplacer une plante', 'plantes', 'Choisissez la plante, puis touchez la carte au nouvel endroit.', ['déplacer', 'changer de place', 'bouger', 'glisser'], 'placing-banner', () => askPlant('deplacer')),
  F('croissance', 'Suivre la croissance d’une plante', 'plantes', 'Notez sa hauteur et sa largeur : la prévision s’ajuste à la réalité.', ['mesurer', 'croissance', 'hauteur', 'largeur', 'grandir', 'suivre'], 'croissance', () => askPlant('croissance')),
  F('recoltee', 'Marquer une plante comme récoltée', 'plantes', 'Pour une annuelle arrachée : elle ne génère plus de tâches.', ['récoltée', 'fin de saison', 'arracher', 'annuelle'], 'recoltee', () => askPlant('recoltee')),
  F('supprimer-plante', 'Supprimer une plante', 'plantes', 'Retire la plante du jardin. Vous pouvez annuler pendant 30 secondes.', ['supprimer', 'enlever', 'effacer', 'retirer', 'morte'], 'supprimer', () => askPlant('supprimer')),
  F('liste-courses', 'Liste de courses et de semis', 'plantes', 'Les plantes prévues, avec la bonne période pour les semer ou les acheter.', ['courses', 'acheter', 'semis', 'liste', 'prévues', 'partager'], 'shopping', () => shoppingOpen.set(true)),
  F('identifier', 'Identifier une plante par photo', 'plantes', 'Photographiez une feuille ou une fleur : l’appli propose un nom.', ['identifier', 'reconnaître', 'nom', 'photo', 'plantnet', 'quelle plante'], 'identify', () => identifyOpen.set(true)),
  F('catalogue', 'Catalogue de plantes', 'plantes', 'Les fiches des plantes : soleil, eau, sol, voisines, calendrier.', ['catalogue', 'fiches', 'espèces', 'chercher une plante', 'tailler', 'semer', 'récolter'], 'catalogue', go('catalogue', { path: ['catalogue'] })),
  F('filtres-catalogue', 'Filtrer le catalogue', 'plantes', 'Triez par comestible, mellifère, ombre, facile ou ce mois-ci.', ['filtres', 'comestible', 'ombre', 'facile', 'mellifère', 'exposition', 'trier'], 'catalogue-filtres', go('catalogue', { path: ['catalogue-filtres'] })),

  // Se promener et regarder
  F('vue-3d', 'Voir mon jardin en 3D', 'promener', 'Faites tourner votre jardin, vu de dessus ou en perspective.', ['3d', 'relief', 'tourner', 'perspective', 'maquette'], 'vue-3d', go('3d', { path: ['vue-3d'] })),
  F('promenade', 'Me promener dans le jardin', 'promener', 'Marchez dans le jardin 3D, à hauteur d’yeux, avec le doigt.', ['promenade', 'marcher', 'visite', 'se promener', 'street view'], 'promenade-ui', go('3d', { intent: '3d:promenade', path: ['promenade-ui'] })),
  F('aller-a', 'Aller à une plante ou un point photo', 'promener', 'Dans la promenade, allez tout de suite à un endroit choisi.', ['aller à', 'téléporter', 'plante', 'point photo', 'minicarte'], 'aller-a', go('3d', { intent: '3d:aller-a', path: ['aller-a'] })),
  F('mouvement-reduit', 'Mouvement réduit', 'promener', 'Dans la promenade, avance par bonds au lieu de glisser (moins de vertige).', ['mouvement réduit', 'vertige', 'bonds', 'nausée', 'confort'], 'mouvement-reduit', go('3d', { intent: '3d:aller-a', path: ['mouvement-reduit'] })),
  F('heure-soleil', 'Régler l’heure et le soleil', 'promener', 'Voyez les ombres du jardin à l’heure et au jour de votre choix.', ['heure', 'soleil', 'ombre', 'jour', 'horloge'], 'heure', go('3d', { intent: '3d:heure', path: ['heure'] })),
  F('saison', 'Voir mon jardin à une autre saison', 'promener', 'Hiver, printemps, été ou automne : feuilles, fleurs et fruits changent.', ['saison', 'hiver', 'printemps', 'été', 'automne', 'feuilles', 'fleurs'], 'saison', go('3d', { intent: '3d:heure', path: ['saison'] })),
  F('annees', 'Voir mes plantes dans quelques années', 'promener', 'Un curseur fait grandir les plantes jusqu’à 20 ans plus tard.', ['années', 'grandir', 'avenir', 'croissance', 'plus tard'], 'annees', go('3d', { intent: '3d:reglages', path: ['annees'] })),
  F('qualite-3d', 'Réglages 3D : qualité', 'promener', 'Choisissez « Simple » si la 3D ralentit sur votre téléphone.', ['qualité', 'lent', 'ralentit', 'simple', 'performance', 'réglages 3d'], 'qualite', go('3d', { intent: '3d:reglages', path: ['qualite'] })),
  F('ensoleillement', 'Voir l’ensoleillement du terrain', 'promener', 'Colore le terrain selon les heures de soleil reçues le jour choisi.', ['ensoleillement', 'soleil', 'ombre', 'lumière', 'heures de soleil'], 'ensoleillement', go('3d', { path: ['ensoleillement'] })),
  F('photos-jardin', 'Photos du jardin', 'promener', 'Promenez-vous dans de vraies photos de votre jardin, prises en tournant.', ['photos', 'street view', '360', 'panorama', 'points de vue'], 'pano-home', () => openPanorama('home')),
  F('prendre-photos', 'Prendre un point de vue en photos', 'promener', 'Tournez sur vous-même : l’appli prend 8 à 12 photos.', ['prendre', 'photos', 'tourner', '360', 'point de vue'], 'pano-place', () => openPanorama('place', { mode: 'guide' })),
  F('importer-pano', 'Importer un panorama', 'promener', 'Ajoutez une grande photo prise avec le mode panorama du téléphone.', ['importer', 'panorama', 'photo large'], 'pano-place', () => openPanorama('place', { mode: 'import' })),

  // À faire et conseils
  F('a-faire', 'Voir ce qu’il y a à faire', 'afaire', 'Tailler, désherber, arroser, récolter : les tâches de la semaine.', ['tâches', 'tailler', 'désherber', 'arroser', 'récolter', 'semaine', 'entretien'], 'taches', go('entretien', { path: ['taches'] })),
  F('tache-faite', 'Cocher une tâche faite', 'afaire', 'Touchez « Fait » : la tâche disparaît et vous pouvez l’annuler 30 secondes.', ['fait', 'terminé', 'cocher', 'tâche'], 'tache-fait', go('entretien', { path: ['tache-fait'] })),
  F('plus-tard', 'Mettre une tâche de côté', 'afaire', 'Repoussez une tâche, ou dites que vous ne voulez pas la faire.', ['plus tard', 'reporter', 'pas maintenant', 'refuser'], 'tache-plus-tard', go('entretien', { path: ['tache-plus-tard'] })),
  F('mises-de-cote', 'Retrouver les tâches mises de côté', 'afaire', 'La liste des tâches repoussées ou refusées, avec « Remettre ».', ['mises de côté', 'remettre', 'reportées', 'refusées'], 'mises-de-cote', go('entretien', { intent: 'taches:tout', path: ['mises-de-cote'] })),
  F('lire', 'Écouter une tâche', 'afaire', 'Le téléphone lit à voix haute comment faire la tâche.', ['lire', 'voix', 'écouter', 'audio', 'haut-parleur'], 'lire', go('entretien', { path: ['lire'] }), () => speechSupported()),
  F('calendrier', 'Calendrier de l’année', 'afaire', 'Mois par mois, ce qu’il y aura à faire dans le jardin.', ['calendrier', 'année', 'mois', 'planning'], 'calendrier', go('entretien', { intent: 'taches:annee', path: ['calendrier'] })),
  F('agenda', 'Ajouter à mon agenda', 'afaire', 'Un fichier .ics pour mettre les tâches dans l’agenda du téléphone.', ['agenda', 'ics', 'rappel', 'calendrier', 'exporter'], 'agenda', go('entretien', { intent: 'taches:annee', path: ['agenda'] })),
  F('rappels', 'Rappels sur le téléphone', 'afaire', 'Une alerte le matin quand il y a du travail urgent.', ['rappels', 'notification', 'alerte', 'prévenir'], 'rappels', go('entretien', { path: ['rappels'] })),
  F('imprimer-semaine', 'Imprimer ma semaine', 'afaire', 'Une page à imprimer avec les tâches de la semaine et une case à cocher pour chacune.', ['imprimer', 'papier', 'semaine', 'feuille', 'liste', 'cocher'], 'imprimer-semaine', go('entretien', { path: ['imprimer-semaine'] })),
  F('partager-semaine', 'Partager ma semaine', 'afaire', 'Envoyez ou copiez la liste des tâches de la semaine, par message ou dans vos notes.', ['partager', 'envoyer', 'copier', 'semaine', 'message', 'liste'], 'partager-semaine', go('entretien', { path: ['partager-semaine'] })),
  F('meteo', 'Météo des 7 jours', 'afaire', 'La météo de votre jardin, avec le gel et la pluie à venir.', ['météo', 'pluie', 'gel', 'température', 'prévisions'], 'meteo', go('entretien', { path: ['meteo'] })),
  F('ou-planter', 'Où planter ?', 'afaire', 'Touchez un endroit : l’appli classe les plantes qui s’y plairont.', ['où planter', 'conseil', 'emplacement', 'soleil', 'pente', 'recommander'], 'ou-planter', go('planter', { path: ['ou-planter'] })),
  F('semer-mois', 'Que semer ce mois-ci', 'afaire', 'Les semis, plantations et récoltes possibles ce mois-ci chez vous.', ['semer', 'planter', 'mois', 'semis', 'quand', 'récolter'], 'semer-ce-mois', go('planter', { path: ['semer-ce-mois'] })),
  F('guide-ravageurs', 'Reconnaître un ennui du jardin', 'afaire', 'Pucerons, limaces, taches sur les feuilles : cherchez ce que vous voyez, et que faire.', ['puceron', 'limace', 'maladie', 'feuilles', 'mildiou', 'bestiole', 'traitement', 'insecte', 'champignon', 'taches', 'trous', 'jaunes', 'ennui', 'oïdium'], 'guide-ennuis', () => ennuisOpen.set({})),
  F('rotation-potager', 'Voir la rotation de mon potager', 'afaire', 'Quels légumes ne pas remettre au même endroit, et quoi planter l’an prochain.', ['rotation', 'potager', 'famille', 'légumes', 'assolement', 'cultures', 'an prochain', 'tomate'], 'rotation', () => rotationOpen.set(true)),
  F('aide-ecran', 'Aide de cet écran', 'afaire', 'Explique l’écran où vous êtes, en quelques phrases.', ['aide', 'comment faire', 'explication', 'besoin d’aide', 'problème'], 'help', () => openHelp()),
  F('guide', 'Je ne sais pas par où commencer', 'afaire', 'Quelques questions simples, une à la fois : l’appli vous amène au bon endroit.', ['guide', 'commencer', 'par où', 'aide', 'débuter', 'perdu', 'questions'], 'guide', () => guideOpen.set(true)),
  F('lire-ecran', 'Lire cet écran à voix haute', 'afaire', 'Le téléphone lit l’aide de l’écran où vous êtes. Un bouton arrête la lecture.', ['lire', 'voix', 'écouter', 'audio', 'haut-parleur', 'aide', 'écran'], 'lire-ecran', () => {
    openHelp()
    void reveal(['lire-ecran'])
  }, () => speechSupported()),

  // Voisins
  F('voisins', 'Entraide entre voisins', 'voisins', 'Dons, échanges, questions et rendez-vous près de chez vous.', ['voisins', 'entraide', 'dons', 'échanges', 'événements', 'boutures'], 'voisins', go('voisins', { path: ['voisins'] }), () => neighborsEnabled),
  F('inviter', 'Faire connaître l’appli', 'voisins', 'Envoyez le lien de l’appli à un proche ou à un voisin.', ['inviter', 'partager', 'lien', 'faire connaître', 'ami'], 'inviter', go('reglages', { path: ['inviter'] })),

  // Mon compte et mes données
  F('compte', 'Mon compte et réglages', 'compte', 'Tous les réglages au même endroit : texte, jardins, sauvegardes, vie privée.', ['compte', 'réglages', 'paramètres', 'options'], 'reglages', go('reglages', { path: ['reglages'] })),
  F('taille-texte', 'Agrandir le texte', 'compte', 'Texte normal, grand ou très grand, pour lire sans effort.', ['texte', 'agrandir', 'taille', 'police', 'lire', 'vue'], 'taille-texte', go('reglages', { path: ['taille-texte'] })),
  F('theme', 'Clair ou sombre', 'compte', 'Choisissez l’apparence : clair, sombre ou comme le téléphone.', ['thème', 'sombre', 'clair', 'couleurs', 'nuit'], 'theme', go('reglages', { path: ['theme'] })),
  F('rouvrir', 'Rouvrir l’appli où j’étais', 'compte', 'Au lancement, l’appli peut revenir sur le dernier écran utilisé.', ['rouvrir', 'démarrage', 'lancement', 'accueil', 'dernier écran'], 'rouvrir', go('reglages', { path: ['rouvrir'] })),
  F('visite', 'Refaire les 5 étapes de départ', 'compte', 'Reprend « Votre jardin en 5 étapes » depuis le début : adresse, terrain, plantes.', ['étapes', 'départ', 'bienvenue', 'adresse', 'recommencer', 'guide'], 'parcours', () => restartOnboarding()),
  F('visite-fonctions', 'Revoir la visite des fonctions', 'compte', 'Six écrans rapides pour retrouver les boutons importants : Tout, Aide, Je suis perdu.', ['visite', 'tutoriel', 'présentation', 'boutons', 'découvrir', 'revoir'], 'visite-fonctions', () => tourOpen.set(true)),
  F('grandes-touches', 'Grandes touches', 'compte', 'Des boutons plus hauts, plus faciles à toucher avec un gros doigt.', ['touches', 'boutons', 'gros', 'taille', 'toucher', 'doigt', 'agrandir', 'trembler'], 'grandes-touches', go('reglages', { path: ['grandes-touches'] })),
  F('sauvegarde', 'Sauvegarder mes données', 'compte', 'Un fichier à garder : vos jardins et vos plantes, sans les images des photos.', ['sauvegarde', 'exporter', 'fichier', 'copie', 'données', 'json'], 'sauvegarde', go('reglages', { path: ['sauvegarde'] })),
  F('sauvegarde-photos', 'Sauvegarde avec photos', 'compte', 'Un seul fichier avec vos données et toutes vos photos.', ['sauvegarde', 'photos', 'permajardin', 'tout sauvegarder'], 'sauvegarde-complete', go('reglages', { path: ['sauvegarde-complete'] })),
  F('reprise', 'Reprendre une sauvegarde', 'compte', 'Retrouvez vos données depuis un fichier de sauvegarde.', ['restaurer', 'reprendre', 'importer', 'récupérer', 'nouveau téléphone'], 'reprise', go('reglages', { path: ['reprise'] })),
  F('copie-securite', 'Récupérer la copie de sécurité', 'compte', 'L’appli garde une copie avant chaque remplacement de vos données.', ['copie de sécurité', 'récupérer', 'perdu', 'erreur', 'secours'], 'copie-securite', go('reglages', { path: ['copie-securite'] })),
  F('zone-hors-ligne', 'Télécharger ma zone', 'compte', 'Gardez la carte de votre quartier pour l’utiliser sans internet.', ['hors ligne', 'sans internet', 'télécharger', 'carte', 'zone', 'réseau'], 'zone-hors-ligne', go('reglages', { path: ['zone-hors-ligne'] })),
  F('rapport-erreurs', 'Exporter un rapport d’erreurs', 'compte', 'Un fichier à envoyer si l’appli ne marche pas. Rien n’est envoyé tout seul.', ['diagnostic', 'erreur', 'bug', 'panne', 'rapport', 'problème'], 'diagnostic', go('reglages', { path: ['diagnostic'] })),
  F('synchro', 'Retrouver mes jardins sur un autre appareil', 'compte', 'Un compte par e-mail pour garder vos jardins sur plusieurs appareils.', ['synchro', 'compte', 'e-mail', 'autre appareil', 'connexion', 'code'], 'synchro', go('reglages', { path: ['synchro'] }), () => !!import.meta.env.VITE_SUPABASE_URL && !!import.meta.env.VITE_SUPABASE_ANON_KEY),
  F('nouveau-jardin', 'Créer un nouveau jardin', 'compte', 'Ajoutez un autre jardin avec son adresse.', ['nouveau jardin', 'créer', 'adresse', 'autre jardin'], 'nouveau-jardin', () => {
    setUi({ tab: 'reglages', newGarden: true, selectedPlantId: undefined, speciesId: undefined })
    void reveal(['nouveau-jardin'])
  }),
  F('changer-jardin', 'Changer de jardin', 'compte', 'Passez d’un de vos jardins à un autre.', ['changer', 'jardin', 'plusieurs jardins', 'basculer'], 'mes-jardins', go('reglages', { path: ['mes-jardins'] })),
  F('installer', 'Installer l’appli sur mon téléphone', 'compte', 'Une icône sur l’écran d’accueil, et l’appli s’ouvre comme les autres.', ['installer', 'icône', 'écran d’accueil', 'application', 'ajouter'], 'installer', go('reglages', { path: ['installer'] })),
  F('vie-privee', 'Vie privée et tout effacer', 'compte', 'Ce que garde l’appli, vos accords, et l’effacement complet.', ['vie privée', 'effacer', 'supprimer mes données', 'rgpd', 'confidentialité', 'accords'], 'vie-privee', go('reglages', { path: ['vie-privee'] })),
]

/** Fonctions proposées sur cet appareil (la synthèse vocale ou l’entraide peuvent manquer). */
export const visibleFeatures = (): Feature[] => FEATURES.filter((f) => !f.visibleSi || f.visibleSi())

// ---------- Recherche ----------

/** Minuscules, sans accents, « œ » devenu « oe », apostrophes en espaces. */
export function normalizeSearch(s: string): string {
  return s
    .replace(/œ/gi, 'oe')
    .replace(/æ/gi, 'ae')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Retire le « s » ou « x » final des mots de plus de 3 lettres (pluriels). */
function singular(w: string): string {
  return w.length > 3 ? w.replace(/[sx]$/, '') : w
}

const words = (s: string) => normalizeSearch(s).split(' ').filter(Boolean)

/** Les fonctions qui répondent à la recherche, la plus pertinente d'abord. Tous les mots tapés doivent se retrouver (début de mot ou pluriel). */
export function searchFeatures(query: string, list: Feature[] = visibleFeatures()): Feature[] {
  const q = words(query).map(singular)
  if (q.length === 0) return list
  const scored: { f: Feature; score: number; i: number }[] = []
  list.forEach((f, i) => {
    const rub = RUBRIQUES.find((r) => r.id === f.rubrique)?.titre ?? ''
    const fields: { text: string; weight: number }[] = [
      { text: f.mot, weight: 3 },
      { text: f.motsCles.join(' '), weight: 2 },
      { text: f.phrase, weight: 1 },
      { text: rub, weight: 0.5 },
    ]
    let total = 0
    for (const w of q) {
      let best = 0
      for (const fld of fields) {
        const ws = words(fld.text).map(singular)
        if (ws.some((x) => x === w)) best = Math.max(best, fld.weight * 2)
        else if (ws.some((x) => x.startsWith(w))) best = Math.max(best, fld.weight * 1.5)
        else if (w.length >= 4 && ws.some((x) => x.includes(w))) best = Math.max(best, fld.weight)
      }
      if (best === 0) return
      total += best
    }
    scored.push({ f, score: total, i })
  })
  return scored.sort((a, b) => b.score - a.score || a.i - b.i).map((x) => x.f)
}

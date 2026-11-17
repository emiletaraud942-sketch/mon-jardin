// Noms anglais courants (sachets et étiquettes importés) -> fiche du catalogue. Lus seulement pour reconnaître une plante.
export const ENGLISH_NAMES: Record<string, string[]> = {
  basilic: ['basil'], persil: ['parsley'], coriandre: ['coriander', 'cilantro'], aneth: ['dill'], cerfeuil: ['chervil'], ciboulette: ['chives'],
  thym: ['thyme'], romarin: ['rosemary'], sauge: ['sage'], menthe: ['mint'], origan: ['oregano'], estragon: ['tarragon'], lavande: ['lavender'],
  capucine: ['nasturtium'], souci: ['calendula', 'pot marigold'], 'oeillet-d-inde': ['french marigold', 'marigold'], bourrache: ['borage'],
  tournesol: ['sunflower'], coquelicot: ['poppy'], cosmos: ['cosmos'], tomate: ['tomato'], poivron: ['sweet pepper', 'bell pepper'], piment: ['chilli', 'chili', 'hot pepper'],
  aubergine: ['aubergine', 'eggplant'], 'pomme-de-terre': ['potato'], courgette: ['zucchini', 'courgette'], concombre: ['cucumber'], cornichon: ['gherkin', 'pickling cucumber'],
  'courge-butternut': ['butternut squash', 'butternut'], potiron: ['pumpkin'], melon: ['melon', 'cantaloupe'], pasteque: ['watermelon'],
  'haricot-nain': ['beans', 'bush bean', 'dwarf bean', 'french bean', 'green bean'], 'haricot-grimpant': ['pole bean', 'runner bean', 'climbing bean'], feve: ['broad bean', 'fava bean'], pois: ['pea', 'peas'],
  laitue: ['lettuce'], mache: ['lamb s lettuce', 'corn salad'], epinard: ['spinach'], roquette: ['rocket', 'arugula'], chicoree: ['chicory', 'endive'], blette: ['chard', 'swiss chard'],
  'chou-pomme': ['cabbage'], 'chou-fleur': ['cauliflower'], brocoli: ['broccoli'], 'chou-de-bruxelles': ['brussels sprout', 'brussels sprouts'], 'chou-kale': ['kale'], 'chou-rave': ['kohlrabi'],
  radis: ['radish'], navet: ['turnip'], carotte: ['carrot'], panais: ['parsnip'], 'celeri-rave': ['celeriac'], 'celeri-branche': ['celery'], fenouil: ['fennel'], betterave: ['beetroot', 'beet'],
  poireau: ['leek'], oignon: ['onion'], echalote: ['shallot'], ail: ['garlic'], mais: ['sweet corn', 'corn', 'maize'], fraisier: ['strawberry'], framboisier: ['raspberry'],
  artichaut: ['artichoke'], asperge: ['asparagus'], rhubarbe: ['rhubarb'], topinambour: ['jerusalem artichoke'], pommier: ['apple tree', 'apple'], poirier: ['pear tree', 'pear'],
  cerisier: ['cherry tree', 'cherry'], prunier: ['plum tree', 'plum'], abricotier: ['apricot'], pecher: ['peach'], figuier: ['fig'], noyer: ['walnut'], noisetier: ['hazelnut', 'hazel'],
  rosier: ['rose', 'rose bush'], hortensia: ['hydrangea'], lilas: ['lilac'], dahlia: ['dahlia'], pivoine: ['peony'], buis: ['boxwood', 'box'], myrtillier: ['blueberry'], groseillier: ['redcurrant', 'currant'],
  cassissier: ['blackcurrant'], vigne: ['grape vine', 'grapevine'], tulipe: ['tulip'], narcisse: ['daffodil'], melisse: ['lemon balm'], 'patate-douce': ['sweet potato']
}

const strip = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/['’]/g, ' ').replace(/\s+/g, ' ').trim()
export const englishNamesOf = (id: string): string[] => (ENGLISH_NAMES[id] ?? []).map(strip).filter((n) => n.length >= 3)

import type { Avertissement } from '../../types'

// Risques à connaître avant de planter ou de manger : toxique, envahissante, épineuse, allergène, irritante.
// Un avertissement dit le risque en une ou deux phrases et le bon réflexe. Ce n'est pas un avis médical ou vétérinaire :
// en cas d'ingestion suspecte, appeler un centre antipoison (Paris : 01 40 05 48 48) ou le 15.
// Un test vérifie que chaque identifiant existe et que chaque texte est court.

const T = (texte: string): Avertissement => ({ type: 'toxique', texte })
const E = (texte: string): Avertissement => ({ type: 'envahissante', texte })
const P = (texte: string): Avertissement => ({ type: 'epineuse', texte })
const A = (texte: string): Avertissement => ({ type: 'allergene', texte })
const I = (texte: string): Avertissement => ({ type: 'irritante', texte })

const ALLIACEES = 'Toxique pour les chiens et les chats (Alliacées) : gardez-la hors de portée des animaux.'
const COURGE_AMERE = 'Un fruit au goût très amer contient des cucurbitacines, toxiques : ne le mangez pas, jetez-le.'

export const AVERTISSEMENTS: Record<string, Avertissement[]> = {
  // Toxiques
  'ail-des-ours': [T('Ses feuilles ressemblent à celles du muguet et du colchique, très toxiques. Ne cueillez que si chaque feuille sent l’ail quand on la froisse.')],
  aubergine: [T('Feuilles et tiges toxiques (solanine). Le fruit se mange cuit.')],
  tomate: [T('Feuilles, tiges et fruits verts crus : ne les mangez pas (tomatine).')],
  'pomme-de-terre': [T('Tubercules verdis, germes, feuilles et baies contiennent de la solanine, toxique. Jetez toutes les parties vertes.')],
  physalis: [T('Le fruit ne se mange que mûr, quand sa lanterne est sèche. Feuilles, tiges et fruits verts sont toxiques.')],
  rhubarbe: [T('Les feuilles sont toxiques (acide oxalique). Ne mangez que les tiges, cuites.')],
  feve: [T('Déconseillée aux personnes atteintes de favisme (déficit en G6PD, maladie génétique).')],
  'haricot-nain': [T('Les haricots ne se mangent pas crus : ils contiennent de la phasine, toxique. Cuisez-les.')],
  'haricot-grimpant': [T('Les haricots ne se mangent pas crus : ils contiennent de la phasine, toxique. Cuisez-les.')],
  'sureau-noir': [T('Baies, feuilles et écorce crues sont toxiques (nausées). Seules les fleurs et les baies cuites se consomment.')],
  'viorne-obier': [T('Les baies sont légèrement toxiques crues : ne les mangez pas.')],
  robinier: [T('Écorce, feuilles et graines sont toxiques, surtout pour les chevaux. Seules les fleurs se mangent (beignets).'), E('Il drageonne et envahit les milieux ouverts : signalé envahissant en France. Évitez-le près d’un milieu naturel.'), P('Branches épineuses : gants et manches longues pour le tailler.')],
  tanaisie: [T('Toxique si on la mange (thuyone), pour les personnes comme pour les animaux. Ne l’utilisez pas en cuisine.'), E('Ses rhizomes la font s’étendre : limitez-la dans un bac ou un coin dédié.')],
  consoude: [T('Ne la mangez pas : alcaloïdes toxiques pour le foie. Elle sert au purin et au paillage.'), E('Le moindre morceau de racine repart. Préférez la variété stérile « Bocking 14 ».')],
  bourrache: [T('Usage alimentaire occasionnel seulement (alcaloïdes pyrrolizidiniques, nocifs pour le foie à forte dose). Évitez-la pendant la grossesse.')],
  lupin: [T('Les graines amères sont toxiques (alcaloïdes) : ne les mangez pas.')],
  'laurier-sauce': [T('Ne le confondez pas avec le laurier-rose ou le laurier-palme, qui sont toxiques.')],
  amandier: [T('Les amandes amères sont toxiques (cyanure) : ne croquez pas les amandes d’un arbre issu de semis.')],
  ail: [T(ALLIACEES)],
  oignon: [T(ALLIACEES)],
  echalote: [T(ALLIACEES)],
  ciboulette: [T(ALLIACEES)],
  poireau: [T(ALLIACEES)],
  courgette: [T(COURGE_AMERE)],
  'courge-butternut': [T(COURGE_AMERE)],
  potiron: [T(COURGE_AMERE)],
  potimarron: [T(COURGE_AMERE)],
  // Envahissantes
  menthe: [E('Ses rhizomes courent partout. Plantez-la en pot enterré ou dans un bac sans fond.')],
  topinambour: [E('Le moindre tubercule oublié repart. Réservez-lui un coin et récoltez tout en fin d’hiver.')],
  goji: [E('Il drageonne beaucoup : plantez-le là où il peut s’étendre, et arrachez les rejets.')],
  argousier: [E('Il drageonne beaucoup : prévoyez de la place et arrachez les rejets.'), P('Rameaux épineux : gants pour la cueillette et la taille.')],
  prunellier: [E('Il drageonne et forme vite un fourré dense.'), P('Épines très piquantes : gants épais.')],
  // Épineuses
  aubepine: [P('Épines longues : gants et lunettes pour la taille.')],
  'groseillier-maquereau': [P('Rameaux épineux : gants pour la cueillette et la taille.')],
  // Irritantes
  piment: [I('Le piment brûle la peau et les yeux : portez des gants et ne vous touchez pas le visage.')],
  panais: [I('La sève peut brûler la peau au soleil (photosensibilisation) : gants et manches longues à la récolte.')],
  // Allergènes (pollens)
  bouleau: [A('Pollen très allergisant en mars et avril. À éviter près d’une terrasse si quelqu’un est allergique.')],
  'aulne-glutineux': [A('Pollen allergisant en fin d’hiver.')],
  noisetier: [A('Pollen allergisant de janvier à mars.')],
  olivier: [A('Pollen allergisant en mai et juin.')],

  // Ajouts de l'audit du 27 octobre 2026
  rosier: [P('Épines : gants épais pour la taille et la cueillette.')],
  hortensia: [T('Feuilles et boutons toxiques si on les mange (glycosides cyanogènes). Ne les utilisez pas en tisane.')],
  thuya: [T('Le feuillage est toxique si on le mange (thuyone), pour les personnes comme pour les animaux.'), A('Pollen allergisant (Cupressacées) en fin d’hiver.')],
  'laurier-palme': [T('Feuilles et noyaux toxiques (composés cyanogènes). Ne les mettez ni dans la cuisine ni dans le compost des animaux.'), E('Les oiseaux sèment ses graines dans les bois voisins : signalé envahissant dans certaines régions.')],
  lilas: [E('Il drageonne : arrachez les rejets à la base et prévoyez de la place.')],
  camomille: [A('Astéracée : peut provoquer des allergies chez les personnes sensibles à l’ambroisie ou à l’armoise.')],
  ortie: [I('Poils urticants : gants pour la cueillette.'), E('Elle s’étend par ses rhizomes dans les sols riches : gardez-lui un coin.')],
  hemerocalle: [T('Très toxique pour les chats (reins), même en petite quantité. Ne la plantez pas si un chat sort au jardin.')],
  pivoine: [T('Racines, graines et feuilles toxiques si on les mange.')],
  'courge-spaghetti': [T(COURGE_AMERE)],
}

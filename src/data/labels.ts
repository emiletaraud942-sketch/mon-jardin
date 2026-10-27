import type { Category, PlantStatus, RisqueType, Strate, Sun, TaskType, Water } from '../types'

export const CATEGORY_LABEL: Record<Category, string> = {
  legume: 'Légume',
  fruitier: 'Fruitier',
  'petit-fruit': 'Petit fruit',
  aromatique: 'Aromatique',
  fleur: 'Fleur',
  'engrais-vert': 'Engrais vert',
  arbre: 'Arbre',
  haie: 'Haie',
  'vivace-comestible': 'Vivace comestible',
}

export const STRATE_LABEL: Record<Strate, string> = {
  canopee: 'Canopée',
  'arbre-bas': 'Petit arbre',
  arbuste: 'Arbuste',
  herbacee: 'Herbacée',
  'couvre-sol': 'Couvre-sol',
  grimpante: 'Grimpante',
  racine: 'Racine / tubercule',
}

export const SUN_LABEL: Record<Sun, string> = { 'plein-soleil': 'Plein soleil', 'mi-ombre': 'Mi-ombre', ombre: 'Ombre' }
export const WATER_LABEL: Record<Water, string> = { faible: 'Peu d’eau', moyen: 'Arrosage moyen', eleve: 'Beaucoup d’eau' }

export const STATUS_LABEL: Record<PlantStatus, string> = {
  projet: 'Prévue',
  'en-place': 'Plantée',
  malade: 'Malade',
  mort: 'Morte',
}

export const TASK_LABEL: Record<TaskType, string> = {
  semis: 'Semis',
  plantation: 'Plantation',
  taille: 'Taille',
  desherbage: 'Désherbage',
  arrosage: 'Arrosage',
  paillage: 'Paillage',
  recolte: 'Récolte',
  fertilisation: 'Fertilisation',
  traitement: 'Traitement',
  division: 'Division',
  protection: 'Protection',
  tuteurage: 'Tuteurage',
}

export const TASK_ICON: Record<TaskType, string> = {
  semis: '🌱',
  plantation: '🪴',
  taille: '✂️',
  desherbage: '🌾',
  arrosage: '💧',
  paillage: '🍂',
  recolte: '🧺',
  fertilisation: '🪱',
  traitement: '🧪',
  division: '➗',
  protection: '🛡️',
  tuteurage: '🎋',
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}

export const RISQUE_LABEL: Record<RisqueType, string> = {
  toxique: 'Toxique',
  envahissante: 'Envahissante',
  epineuse: 'Épineuse',
  allergene: 'Allergène',
  irritante: 'Irritante',
}

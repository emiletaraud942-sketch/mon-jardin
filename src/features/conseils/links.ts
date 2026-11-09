import type { AlertKind } from '../../engine/alerts'

/** La fiche de conseils à proposer sous une alerte de À faire (le vent n'en a pas). Les identifiants sont vérifiés par un test. */
export const ALERT_CONSEIL: Partial<Record<AlertKind, { id: string; label: string }>> = {
  secheresse: { id: 'eau-pailler', label: 'Voir les conseils pour économiser l’eau' },
  canicule: { id: 'eau-canicule', label: 'Voir les conseils pour économiser l’eau' },
}

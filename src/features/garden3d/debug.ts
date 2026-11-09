// Mesures de développement (data-* sur la racine 3D). Voir `src/lib/debugFlag.ts` : jamais lues dans l'adresse.
import { reviewToolsEnabled } from '../../lib/debugFlag'

export const DEBUG_3D: boolean = reviewToolsEnabled()

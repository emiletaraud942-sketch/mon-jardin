// Ombres portées à la demande : la carte d'ombres n'est redessinée que si le soleil ou la scène change
// (et non à chaque image de la caméra), ce qui économise le gros du coût sur téléphone.
import type * as THREE from 'three'

/** Active le rendu à la demande des ombres (à appeler une fois à la création du rendu). */
export function enableOnDemandShadows(gl: THREE.WebGLRenderer): void {
  gl.shadowMap.autoUpdate = false
  gl.shadowMap.needsUpdate = true
}

/** Demande un nouveau calcul des ombres au prochain rendu. */
export function markShadowsDirty(gl: THREE.WebGLRenderer): void {
  gl.shadowMap.needsUpdate = true
}

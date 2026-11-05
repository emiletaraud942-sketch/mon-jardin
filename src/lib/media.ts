// Caméra : un flux obtenu après la sortie de l'écran est arrêté tout de suite (sinon la caméra reste allumée).

export function stopStream(stream: MediaStream | undefined | null) {
  stream?.getTracks().forEach((t) => t.stop())
}

/**
 * Demande la caméra. Si l'écran a été quitté pendant l'attente (`isAlive()` faux au retour),
 * le flux reçu est arrêté et `undefined` est renvoyé. Les refus du navigateur remontent tels quels.
 */
export async function requestCamera(request: () => Promise<MediaStream>, isAlive: () => boolean): Promise<MediaStream | undefined> {
  const stream = await request()
  if (!isAlive()) {
    stopStream(stream)
    return undefined
  }
  return stream
}

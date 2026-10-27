// MapLibre 6 charge son worker depuis un fichier voisin de son code (« maplibre-gl-worker.mjs »). Une fois le code mis en paquet par Vite,
// ce voisin n'existe plus et la carte perd ses couches (parcelle, bâtiments, cercles : « Worker failed to load »).
// `?worker&url` fait de ce worker un fichier à part, empaqueté avec ses dépendances, hashé, précaché par le service worker
// (la carte doit s'ouvrir hors ligne) et servi par notre origine (CSP : `worker-src 'self' blob:`).
import { setWorkerUrl } from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'

setWorkerUrl(workerUrl)

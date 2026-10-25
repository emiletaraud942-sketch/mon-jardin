// Alertes de nouveaux messages de l'entraide. Ce fichier est chargé par le service worker de l'appli
// (vite.config.ts : workbox.importScripts) ; il ajoute seulement deux gestionnaires, sans toucher au cache.
//
// Règle de vie privée : on ne lit JAMAIS le contenu d'une alerte reçue. Le texte est fixe et neutre.
// Le serveur envoie une alerte vide (supabase/functions/notify-message) : rien du message ne passe par le service d'alerte du navigateur.

const ALERT_TITLE = 'PermaJardin'
const ALERT_BODY = 'Vous avez un nouveau message'
const ALERT_TAG = 'permajardin-message'
// Ouvre l'entraide sur l'onglet Messages (voir src/features/neighbors/NeighborsPage.tsx).
const OPEN_URL = '/#entraide/messages'

async function openClients() {
  return self.clients.matchAll({ type: 'window', includeUncontrolled: true })
}

self.addEventListener('push', (event) => {
  event.waitUntil(
    (async () => {
      // Un navigateur exige qu'une alerte reçue soit montrée : elle l'est toujours, avec le même texte.
      await self.registration.showNotification(ALERT_TITLE, {
        body: ALERT_BODY,
        icon: '/icon-192.png',
        tag: ALERT_TAG,
        lang: 'fr',
        data: { url: OPEN_URL },
      })
      // Si l'appli est ouverte quelque part, elle met à jour sa pastille.
      for (const client of await openClients()) client.postMessage({ type: 'permajardin:nouveau-message' })
    })(),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(
    (async () => {
      for (const client of await openClients()) {
        if (new URL(client.url).origin !== self.location.origin) continue
        try {
          await client.focus()
        } catch (e) {
          /* mise au premier plan refusée : le message suffit */
        }
        client.postMessage({ type: 'permajardin:ouvrir-messages' })
        return
      }
      await self.clients.openWindow(OPEN_URL)
    })(),
  )
})

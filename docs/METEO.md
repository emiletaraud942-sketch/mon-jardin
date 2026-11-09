# Météo : fournisseurs et licences

La météo et le climat passent par un fournisseur interchangeable (`src/lib/weatherProviders/`). `src/lib/weather.ts` garde le cache, le re-découpage par date locale et le calcul du climat.

## Fournisseurs

| Id | État | Licence | Usage commercial |
| --- | --- | --- | --- |
| `open-meteo` (défaut) | Actif | API gratuite sous CC BY 4.0, réservée à l'usage non commercial (moins de 10 000 appels/jour). Offre commerciale payante (`customer-api.open-meteo.com`). | NON |
| `meteo-france` | Squelette : lève « Fournisseur Météo-France non configuré » | À VÉRIFIER sur le portail officiel avant tout usage commercial. Le registre porte `commercialUse: true` par hypothèse. | À confirmer |

Mention exposée à l'interface : `getWeatherLicense()` renvoie `{ id, label, commercialUse, attribution, url }`. Exemple : « Météo : Open-Meteo (CC BY 4.0, usage non commercial) ». L'affichage reste à brancher côté interface.

## Champs demandés à Open-Meteo (prévision)

Une seule requête, route `/ext/meteo/v1/forecast` (aucun nouveau domaine, CSP inchangée), 7 jours passés et 7 jours de prévision, `timezone=auto` :
`daily=temperature_2m_max, temperature_2m_min, precipitation_sum, et0_fao_evapotranspiration, wind_gusts_10m_max` et `wind_speed_unit=kmh`.

- `wind_gusts_10m_max` (rafale maximale du jour, km/h) est le champ ajouté pour l'alerte « Vent fort » (lot 4A). Il devient `DailyWeather.gustKmh`, champ **optionnel** : absent d'un cache écrit avant ce lot (3 h au plus), d'une réponse sans cette valeur ou d'un autre fournisseur. Valeur manquante = champ absent (jamais 0) : l'alerte de vent ne se déclenche pas, sans erreur.
- **Non vérifié sur le service réel** (Open-Meteo injoignable depuis le conteneur de travail) : le nom du paramètre et l'unité par défaut viennent de la documentation. Testé avec des réponses simulées (`weather.test.ts`, `providers.test.ts`). À contrôler une fois en ligne : `curl "https://api.open-meteo.com/v1/forecast?latitude=45.76&longitude=4.83&daily=wind_gusts_10m_max&wind_speed_unit=kmh&forecast_days=2&timezone=auto"`.

## Alertes de jardin (canicule, sécheresse, vent fort)

Calculées dans `src/engine/alerts.ts` (module pur, `alerts.test.ts`) sur la météo déjà chargée, sans appel de plus. Seuils (`ALERT_THRESHOLDS`) :

| Alerte | Règle | Pourquoi ce seuil |
| --- | --- | --- |
| Canicule | maximale de 32 °C ou plus, 3 jours de suite (jours passés de la vague compris, un jour manquant la coupe) | Météo-France fixe un seuil par département (31 à 36 °C, trois jours et trois nuits) : 32 °C est un seuil unique au milieu de cette fourchette. |
| Sécheresse | manque d'eau d'au moins 30 mm sur 7 jours (bilan de `waterBalance`), au moins 5 jours passés connus, et moins de 5 mm de pluie prévue sous 5 jours | 3 fois le seuil de l'arrosage météo (10 mm) : en été l'évaporation est de 4 à 6 mm par jour, donc presque aucune pluie pendant une semaine chaude. |
| Vent fort | rafale de 60 km/h ou plus, sur les 3 prochains jours | Beaufort 8 (coup de vent) ; la prévision des rafales est peu fiable au-delà de 3 jours. |

Clés de tâche : `date:jardin:protection:canicule` (1er jour de la vague), `date:jardin:arrosage:secheresse` (jour même), `date:jardin:protection:vent` (1er jour de vent fort). Comme l'alerte de gel, elles sont « Urgent » et « Pas maintenant » ou « Je ne veux pas » ne valent que pour leur clé. Aucune alerte sans plante en place.

## Changer de fournisseur

1. Définir `VITE_WEATHER_PROVIDER` (ex. `meteo-france`) dans les variables d'environnement Vercel.
2. Redéployer (la variable est lue au build).
3. Valeur absente : `open-meteo`. Valeur inconnue : repli sur `open-meteo` et `console.warn`, sans plantage.

Il n'y a PAS de bascule automatique : si un fournisseur tombe, l'appli utilise le cache expiré (`stale`) mais ne change jamais de source toute seule (licences et unités différentes).

## Confidentialité

Les coordonnées envoyées au fournisseur et utilisées dans les clés de cache sont arrondies à 2 décimales (environ 1 km), voir `docs/SECURITE.md`. Les clés de cache `pj-meteo:` et `pj-climat:` contiennent l'id du fournisseur : changer de source ne mélange pas les données.

## Météo-France : prérequis (NON VÉRIFIÉS)

Rien de ce qui suit n'a été testé ni confirmé.
- Compte sur portail-api.meteofrance.fr et abonnement à une API de prévision et à une API de données climatiques.
- Authentification (clé ou jeton) : mécanisme à vérifier.
- Endpoints, quotas, format de réponse, couverture outre-mer, disponibilité de l'évapotranspiration (`et0Mm`) : à vérifier sur une adresse réelle avant d'écrire le parseur, avec une réponse courte en fixture de test.
- Conditions de réutilisation commerciale et attribution exigée.

## Clé d'API : jamais dans le navigateur

Si le fournisseur exige une clé, l'appel passe par une fonction serveur `api/` (à écrire, comme `api/identify.ts`) qui garde la clé côté Vercel. Le navigateur n'appelle alors que cette fonction.

## Checklist pour une version commerciale

- [ ] Confirmer la licence du fournisseur visé (ou souscrire l'offre commerciale Open-Meteo).
- [ ] Implémenter `fetchForecast` et `fetchArchive` du fournisseur (retour `ForecastResult` et `ArchiveDaily[]`), avec tests sur fixtures réelles.
- [ ] Fonction serveur `api/` si clé requise.
- [ ] Nouveau préfixe `/ext/...` dans `vite.config.ts` (plus long d'abord) ET `vercel.json` (chemins exacts), mise à jour de `src/lib/security/vercel-config.test.ts` et de la CSP si besoin.
- [ ] Afficher la mention `getWeatherLicense()` dans l'interface.
- [ ] Positionner `VITE_WEATHER_PROVIDER` et redéployer.
- [ ] Mettre à jour les mentions de licence de `CLAUDE.md` et des conditions d'utilisation.

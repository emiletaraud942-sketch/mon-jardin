#!/usr/bin/env bash
# Mesure le zoom maximal réel de l'orthophoto IGN (WMTS Géoplateforme, TileMatrixSet PM).
# Lecture seule : aucune modification du projet. Nécessite bash, curl, awk, sed.
#
# Usage : bash docs/mesure-ortho-ign.sh LON LAT
# Exemple : bash docs/mesure-ortho-ign.sh 2.3522 48.8566
# Prenez les coordonnées de VOTRE jardin (lon lat, point décimal) : l'orthophoto n'a pas
# la même résolution partout (20 cm, 10 cm ou 5 cm selon les départements).
#
# Variable facultative : BASE (défaut https://data.geopf.fr), utile pour un test local.
set -u

LON="${1:-}"
LAT="${2:-}"
BASE="${BASE:-https://data.geopf.fr}"
LAYER="ORTHOIMAGERY.ORTHOPHOTOS"

if [[ -z "$LON" || -z "$LAT" ]]; then
  echo "Usage : bash $0 LON LAT   (ex. 2.3522 48.8566)" >&2
  exit 2
fi
if ! [[ "$LON" =~ ^-?[0-9]+(\.[0-9]+)?$ && "$LAT" =~ ^-?[0-9]+(\.[0-9]+)?$ ]]; then
  echo "LON et LAT doivent être des nombres décimaux avec un point (ex. 2.3522 48.8566)." >&2
  exit 2
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# ---------- 1. GetCapabilities ----------
echo "== 1. GetCapabilities WMTS ($BASE/wmts)"
CAPS_CODE="$(curl -sS -m 90 -o "$TMP/caps.xml" -w '%{http_code}' \
  "$BASE/wmts?SERVICE=WMTS&REQUEST=GetCapabilities&VERSION=1.0.0" 2>"$TMP/err")" || true
CAPS_SIZE="$(wc -c <"$TMP/caps.xml" 2>/dev/null || echo 0)"
echo "HTTP $CAPS_CODE, $CAPS_SIZE octets"
if [[ "$CAPS_CODE" != "200" || "$CAPS_SIZE" -lt 1000 ]]; then
  echo "ECHEC : GetCapabilities inaccessible. $(head -c 200 "$TMP/err")"
  echo "Collez ce message tel quel."
  exit 1
fi

# Une balise par ligne, sans espaces de tête : l'analyse reste valable que le XML soit compact ou indenté.
tr -d '\r' <"$TMP/caps.xml" | sed -e 's/>[[:space:]]*</>\n</g' -e 's/^[[:space:]]*//' >"$TMP/caps.lines"

# ---------- 2. Limites de la couche en PM + liste des couches ORTHO ----------
# Sorties : limits.txt (z minRow maxRow minCol maxCol pour $LAYER), layers.txt (une ligne par couche ORTHO).
awk -v want="$LAYER" -v limfile="$TMP/limits.txt" -v layfile="$TMP/layers.txt" '
  function val(s) { gsub(/<[^>]*>/, "", s); return s }
  /^<Layer([ >]|$)/ { inlayer = 1; id = ""; title = ""; lic = ""; pmmax = ""; pmmin = ""; inpm = 0; intml = 0; next }
  inlayer && /^<\/Layer>/ {
    if (id ~ /ORTHO/) printf "%s\t%s\t%s\t%s\n", id, (pmmax == "" ? "?" : pmmax), title, (lic == "" ? "non indiquée dans le GetCapabilities" : lic) >> layfile
    inlayer = 0; next
  }
  !inlayer { next }
  /^<ows:Identifier>/ && id == "" { id = val($0); next }
  /^<ows:Title/ && title == "" { title = val($0); next }
  tolower($0) ~ /licen[cs]e|etalab|accessconstraints|droits? d.usage/ && lic == "" { lic = substr(val($0), 1, 110) }
  /^<TileMatrixSetLink>/ { inlink = 1; inpm = 0; next }
  /^<\/TileMatrixSetLink>/ { inlink = 0; inpm = 0; next }
  inlink && /^<TileMatrixSet>/ { inpm = (val($0) == "PM"); next }
  inlink && inpm && /^<TileMatrixLimits>/ { intml = 1; z = ""; a = ""; b = ""; c = ""; d = ""; next }
  inlink && inpm && intml && /^<TileMatrix>/ { z = val($0) + 0; next }
  inlink && inpm && intml && /^<MinTileRow>/ { a = val($0); next }
  inlink && inpm && intml && /^<MaxTileRow>/ { b = val($0); next }
  inlink && inpm && intml && /^<MinTileCol>/ { c = val($0); next }
  inlink && inpm && intml && /^<MaxTileCol>/ { d = val($0); next }
  inlink && inpm && intml && /^<\/TileMatrixLimits>/ {
    intml = 0
    if (z != "" && (pmmax == "" || z > pmmax)) pmmax = z
    if (id == want) print z, a, b, c, d >> limfile
  }
' "$TMP/caps.lines"

echo
echo "== 2. $LAYER, TileMatrixSet PM : zoom maximal annoncé (TileMatrixSetLimits)"
if [[ -s "$TMP/limits.txt" ]]; then
  sort -n "$TMP/limits.txt" | awk 'NR == 1 { mn = $1 } { mx = $1 } END { print "zooms annoncés : " mn " à " mx }'
  echo "(Les limites donnent l'emprise des tuiles ; une tuile annoncée peut être un agrandissement, voir l'étape 3.)"
else
  echo "Aucune limite PM trouvée pour $LAYER (couche absente ou format inattendu)."
fi

# ---------- 3. Tuiles z17..z21 au point demandé ----------
echo
echo "== 3. Tuiles z17..z21 en ($LON, $LAT)"
printf '%-4s %-8s %-8s %-6s %-18s %-9s %s\n' z col row HTTP type octets "dans les limites"
for Z in 17 18 19 20 21; do
  read -r X Y < <(awk -v lon="$LON" -v lat="$LAT" -v z="$Z" 'BEGIN {
    pi = atan2(0, -1); n = 2 ^ z; r = lat * pi / 180
    x = int((lon + 180) / 360 * n)
    y = int((1 - log(sin(r) / cos(r) + 1 / cos(r)) / pi) / 2 * n)
    print x, y }')
  URL="$BASE/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=$LAYER&STYLE=normal&FORMAT=image/jpeg&TILEMATRIXSET=PM&TILEMATRIX=$Z&TILEROW=$Y&TILECOL=$X"
  OUT="$(curl -sS -m 30 -o "$TMP/tile$Z.bin" -w '%{http_code} %{content_type} %{size_download}' "$URL" 2>/dev/null)" || OUT="000 - 0"
  read -r CODE CTYPE SIZE <<<"$OUT"
  INLIM="?"
  if [[ -s "$TMP/limits.txt" ]]; then
    INLIM="$(awk -v z="$Z" -v x="$X" -v y="$Y" '$1 == z { f = 1; ok = (y >= $2 && y <= $3 && x >= $4 && x <= $5) } END { print (!f ? "z absent" : ok ? "oui" : "NON") }' "$TMP/limits.txt")"
  fi
  printf '%-4s %-8s %-8s %-6s %-18s %-9s %s\n' "$Z" "$X" "$Y" "$CODE" "${CTYPE:--}" "$SIZE" "$INLIM"
done
echo "Lecture : HTTP 200 + image/jpeg + taille de même ordre que z18 = tuile réelle ; 400/404 ou taille minuscule = pas de tuile à ce zoom."
echo "Si z20 ou z21 répondent 200 avec une taille proche de z19, ce sont probablement des agrandissements : jugez à l'oeil (étape 4)."

# ---------- 4. Contrôle visuel ----------
echo
echo "== 4. Contrôle visuel (facultatif)"
KEEP="${KEEP:-}"
if [[ -n "$KEEP" ]]; then
  mkdir -p "$KEEP" && for Z in 17 18 19 20 21; do cp "$TMP/tile$Z.bin" "$KEEP/tuile-z$Z.jpg" 2>/dev/null; done
  echo "Copiées dans $KEEP (tuile-z17.jpg ... tuile-z21.jpg)."
else
  echo "Pour les garder : KEEP=./tuiles bash $0 $LON $LAT   (puis comparez tuile-z19.jpg et tuile-z21.jpg)."
fi

# ---------- 5. Couches ORTHO du GetCapabilities ----------
echo
echo "== 5. Couches dont le nom contient ORTHO (détection seulement, rien n'est adopté)"
if [[ -s "$TMP/layers.txt" ]]; then
  sort "$TMP/layers.txt" | awk -F'\t' '{ printf "- %s | zoom PM max %s | %s\n    licence : %s\n", $1, $2, $3, $4 }'
else
  echo "Aucune couche ORTHO trouvée."
fi
echo
echo "Fin. Collez toute cette sortie dans la conversation."

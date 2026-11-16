#!/usr/bin/env bash
# Montage : images + musique -> mp4 (H.264 yuv420p, faststart, AAC), 30 i/s, 30 s. Usage : monter.sh 16x9|9x16 [crf]
set -euo pipefail
FMT=${1:?format 16x9 ou 9x16}; CRF=${2:-21}
WORK=${TEASER_WORK:-/tmp/permajardin-teaser}
OUT="$WORK/PermaJardin-teaser-30s-$FMT.mp4"
ffmpeg -v error -y -framerate 30 -i "$WORK/frames-$FMT/f%04d.jpg" -i "$WORK/musique.wav" \
  -c:v libx264 -preset slow -crf "$CRF" -pix_fmt yuv420p -r 30 -movflags +faststart \
  -c:a aac -b:a 160k -ar 44100 -t 30 -shortest "$OUT"
ls -l "$OUT"

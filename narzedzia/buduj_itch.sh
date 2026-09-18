#!/usr/bin/env bash
# buduj_itch.sh — paczka HTML5 na itch.io.
#
# itch rozpakowuje zipa i otwiera `index.html` Z KORZENIA — jeśli w środku jest
# folder, gra się nie uruchomi. Dlatego pakujemy z katalogu projektu, a nie
# katalog projektu.
#
# Numer wersji bierzemy z `main.js?v=N` w index.html, żeby nazwa pliku sama się
# zgadzała z tym, co właściciel wgrywa (i żeby nie dało się wysłać „tego samego"
# zipa dwa razy pod różnymi wersjami).
#
# Użycie:  narzedzia/buduj_itch.sh
set -euo pipefail

KAT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$KAT"

# ---------- 1. wersja z index.html ----------
WER="$(sed -n 's/.*main\.js?v=\([0-9][0-9]*\).*/\1/p' index.html | head -1)"
if [ -z "$WER" ]; then
  echo "BŁĄD: nie znalazłem 'main.js?v=N' w index.html" >&2
  exit 1
fi

# ---------- 2. ścieżki absolutne = śmierć na itch ----------
# Pages serwuje z /horda3d-demo/, itch z losowego adresu html.itch.zone — każde
# `/coś` wskaże korzeń cudzego serwera. Lepiej wyłapać to tutaj niż po wgraniu.
echo "-- szukam ścieżek absolutnych…"
if grep -nE "[\"']/assets|url\(/|src=\"/|href=\"/" \
     index.html main.js audio.js icons.js spritedata.js sw.js manifest.webmanifest; then
  echo "BŁĄD: powyższe ścieżki są absolutne — na itch/Pages nic się z nich nie wczyta." >&2
  exit 1
fi
echo "   czysto."

# ---------- 3. zip ----------
mkdir -p dist
ZIP="dist/veggie-famiglia-itch-v${WER}.zip"
rm -f "$ZIP"

# `assets/portrety` NIE wchodzi: to rendery robocze do dokumentacji, w kodzie
# nikt się do nich nie odwołuje (sprawdzone grepem) — 550 KB za darmo.
zip -r -q -X "$ZIP" \
  index.html main.js spritedata.js icons.js audio.js \
  manifest.webmanifest sw.js \
  lib/three.module.js \
  assets fonts \
  -x '.DS_Store' '*/.DS_Store' 'assets/portrety/*' '__MACOSX/*'

# ---------- 4. kontrola ----------
# Listę czytamy RAZ do zmiennej: `unzip | grep -q` kończy grepa wcześniej, unzip
# dostaje SIGPIPE i przy `set -o pipefail` cały skrypt wywala się bez powodu.
LISTA="$(unzip -Z1 "$ZIP")"
if ! grep -qx 'index.html' <<< "$LISTA"; then
  echo "BŁĄD: index.html nie leży w korzeniu zipa — itch tego nie uruchomi." >&2
  exit 1
fi

PLIKI="$(grep -cv '/$' <<< "$LISTA")"
BAJTY="$(wc -c < "$ZIP" | tr -d ' ')"
MB=$(( BAJTY / 1048576 ))

echo
echo "GOTOWE: $ZIP"
echo "  plików: $PLIKI"
echo "  rozmiar: ${MB} MB (${BAJTY} B)"
if [ "$BAJTY" -gt 524288000 ]; then
  echo "  ⚠ UWAGA: ponad 500 MB. itch przyjmuje HTML5 do 1 GB, ale powyżej ~500 MB"
  echo "    gra ładuje się w przeglądarce boleśnie długo — warto przyciąć dźwięk."
fi
echo
echo "Wgrywanie: itch.io → Edit game → Uploads → dodaj zipa → zaznacz"
echo "\"This file will be played in the browser\". Szczegóły ustawień: INFO-PROJEKT.md, Etap 1."

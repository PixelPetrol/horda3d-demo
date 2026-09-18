#!/usr/bin/env python3
"""Pixel-artowe kafle tekstur UI „Warzywniak Nonny" (etap 3, 18.09.2026).

Deterministyczne (własny RNG), 1 px = 1 piksel kafla; w CSS skalować ×2/×3 z
`image-rendering: pixelated`. Wynik: assets/ui/*.png. Paleta spójna z tokenami
w ui-base.css: drewno #8b5a2b / #b07a3f / #5a3618, kontur #1b1b22, tablica #223328.

  python3 narzedzia/generuj_ui_tekstury.py
"""
from pathlib import Path
from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / 'assets' / 'ui'
OUT.mkdir(parents=True, exist_ok=True)


class Rng:
    def __init__(self, s): self.s = s & 0xffffffff
    def f(self):
        self.s = (self.s * 1664525 + 1013904223) & 0xffffffff
        return self.s / 4294967296


def hexc(h): return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))


DREWNO, DREWNO_J, DREWNO_C, KONTUR = hexc('#8b5a2b'), hexc('#b07a3f'), hexc('#5a3618'), hexc('#1b1b22')
DREWNO_S = hexc('#a06a35')          # średni ton słojów
TABLICA, TABLICA_J, TABLICA_C = hexc('#223328'), hexc('#2b3f30'), hexc('#1a281f')


def deska(nazwa, w=64, h=32, seed=7, jasnosc=1.0):
    """Jedna deska w poziomie: jasna krawędź u góry, ciemna szczelina u dołu, słoje."""
    im = Image.new('RGB', (w, h)); d = ImageDraw.Draw(im); r = Rng(seed)
    mul = lambda c: tuple(min(255, int(x * jasnosc)) for x in c)
    d.rectangle((0, 0, w, h), fill=mul(DREWNO))
    # słoje: 4-6 falujących linii w dwóch tonach
    for k in range(5):
        y0 = 4 + int(r.f() * (h - 8)); ton = mul(DREWNO_S if r.f() < 0.55 else DREWNO_C)
        y = y0
        for x in range(w):
            if r.f() < 0.18: y += 1 if r.f() < 0.5 else -1
            y = max(2, min(h - 3, y))
            d.point((x, y), fill=ton)
    # sęk
    if r.f() < 0.8:
        cx, cy = int(8 + r.f() * (w - 16)), int(6 + r.f() * (h - 12))
        d.ellipse((cx - 3, cy - 2, cx + 3, cy + 2), outline=mul(DREWNO_C), fill=mul(DREWNO_S))
        d.point((cx, cy), fill=mul(DREWNO_C))
    # krawędzie deski: światło u góry, cień + szczelina u dołu
    d.line((0, 0, w, 0), fill=mul(DREWNO_J)); d.line((0, 1, w, 1), fill=mul(DREWNO_J))
    d.line((0, h - 2, w, h - 2), fill=mul(DREWNO_C)); d.line((0, h - 1, w, h - 1), fill=KONTUR)
    im.save(OUT / nazwa, optimize=True)


def skrzynka(nazwa, s=64, seed=11):
    """Front skrzynki na warzywa: 3 poziome listwy z prześwitami + pionowe ramy."""
    im = Image.new('RGB', (s, s)); d = ImageDraw.Draw(im); r = Rng(seed)
    d.rectangle((0, 0, s, s), fill=DREWNO_C)                       # tło = wnętrze (cień)
    lw = 16
    for i in range(3):                                             # listwy poziome
        y = 4 + i * 20
        d.rectangle((0, y, s, y + lw - 1), fill=DREWNO)
        d.line((0, y, s, y), fill=DREWNO_J)
        d.line((0, y + lw - 1, s, y + lw - 1), fill=KONTUR)
        for x in range(s):                                         # delikatne słoje
            if r.f() < 0.12: d.point((x, y + 3 + int(r.f() * (lw - 6))), fill=DREWNO_S)
    for x0 in (0, s - 10):                                         # pionowe ramy z gwoździami
        d.rectangle((x0, 0, x0 + 9, s), fill=DREWNO_S)
        d.line((x0, 0, x0, s), fill=DREWNO_J); d.line((x0 + 9, 0, x0 + 9, s), fill=KONTUR)
        for y in (10, 30, 50):
            d.point((x0 + 4, y), fill=KONTUR); d.point((x0 + 5, y), fill=(230, 230, 220))
    im.save(OUT / nazwa, optimize=True)


def skrzynka_mala(nazwa, s=20, seed=29):
    """Mały front skrzynki — slot broni w HUD (#wpns .wp).

    `skrzynka.png` ma 64 px i sensowne krawędzie dopiero w skali ×1; zmniejszona
    do ~40 px przez `background-size` gubi co drugą linię listwy (nearest neighbour).
    Ten kafel jest narysowany OD RAZU na 20 px, więc w CSS idzie czystym ×2.
    """
    im = Image.new('RGB', (s, s)); d = ImageDraw.Draw(im); r = Rng(seed)
    d.rectangle((0, 0, s, s), fill=DREWNO_C)                       # prześwity między listwami
    for i in range(3):                                             # listwy poziome: 5 px + 1 px szpary
        y = 1 + i * 6
        d.rectangle((0, y, s, y + 4), fill=DREWNO)
        d.line((0, y, s, y), fill=DREWNO_J)
        d.line((0, y + 4, s, y + 4), fill=KONTUR)
        for x in range(s):
            if r.f() < 0.10: d.point((x, y + 2), fill=DREWNO_S)
    for x0 in (0, s - 3):                                          # pionowe ramy z gwoździami
        d.rectangle((x0, 0, x0 + 2, s), fill=DREWNO_S)
        d.line((x0, 0, x0, s), fill=DREWNO_J); d.line((x0 + 2, 0, x0 + 2, s), fill=KONTUR)
        for y in (3, 15):
            d.point((x0 + 1, y), fill=KONTUR)
    im.save(OUT / nazwa, optimize=True)


def tablica(nazwa, s=64, seed=3):
    """Kredowa tablica: ciemna zieleń z lekkim szumem i smugami po gąbce."""
    im = Image.new('RGB', (s, s)); r = Rng(seed); px = im.load()
    for y in range(s):
        for x in range(s):
            v = r.f()
            px[x, y] = TABLICA_J if v < 0.10 else (TABLICA_C if v < 0.20 else TABLICA)
    d = ImageDraw.Draw(im)
    for k in range(3):                                             # smugi
        y = int(r.f() * s); x0 = int(r.f() * s * 0.5)
        d.line((x0, y, x0 + int(20 + r.f() * 30), y + int(r.f() * 3)), fill=TABLICA_J)
    im.save(OUT / nazwa, optimize=True)


def papier(nazwa, s=32, seed=5):
    """Kremowy papier na etykiety cen (jaśniejszy akcent na drewnie)."""
    im = Image.new('RGB', (s, s)); r = Rng(seed); px = im.load()
    base, ciem = hexc('#f5e6c8'), hexc('#e6d4b0')
    for y in range(s):
        for x in range(s):
            px[x, y] = ciem if r.f() < 0.08 else base
    im.save(OUT / nazwa, optimize=True)


deska('deska.png')
deska('deska_ciemna.png', seed=19, jasnosc=0.72)
deska('deska_jasna.png', seed=23, jasnosc=1.18)
skrzynka('skrzynka.png')
skrzynka_mala('skrzynka_mala.png')
tablica('tablica.png')
papier('papier.png')
print('OK:', sorted(p.name for p in OUT.iterdir()))

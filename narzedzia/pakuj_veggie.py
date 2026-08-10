#!/usr/bin/env python3
"""
Pakuje paczki postaci VEGGIE FAMIGLIA (eksport PixelLab: pojedyncze klatki
w katalogach animacja/kierunek) do arkuszy sprite'ów + wpisów SPRITEDATA,
czyli formatu, który rozumie silnik HORDA 3D.

Układ arkusza: wiersz = (animacja, kierunek), kolumna = klatka.
Uruchomienie:  python3 narzedzia/pakuj_veggie.py <katalog_z_zipami> <katalog_wyjsciowy>
"""
import json
import os
import re
import shutil
import sys
import tempfile
import zipfile

from PIL import Image

DIRS = ['south', 'south-east', 'east', 'north-east',
        'north', 'north-west', 'west', 'south-west']

# nazwa katalogu animacji w zipie -> nazwa używana w silniku + fps
ANIM_MAP = {
    'Idle': ('idle', 6),
    'Running': ('run', 12),
    'Two-Footed_Jump': ('jump', 14),
    'Jump': ('jump', 14),
    'Attack': ('punch', 14),
    'Death': ('death', 10),
}


def klucz(nazwa: str) -> str:
    """Nazwa pliku zip -> klucz w SPRITEDATA (małe litery, podkreślenia)."""
    n = os.path.splitext(os.path.basename(nazwa))[0]
    n = n.replace(' ', '_').lower()
    return re.sub(r'[^a-z0-9_]', '', n)


def znajdz_anim_root(root: str):
    """Zwraca katalog zawierający podkatalog 'animations' (zipy mają go zagnieżdżonego)."""
    for base, dirs, _ in os.walk(root):
        if 'animations' in dirs:
            return os.path.join(base, 'animations')
    return None


def pakuj(zip_path: str, out_dir: str):
    key = klucz(zip_path)
    tmp = tempfile.mkdtemp()
    try:
        with zipfile.ZipFile(zip_path) as z:
            z.extractall(tmp)
        anim_root = znajdz_anim_root(tmp)
        if not anim_root:
            print(f'  ! {key}: brak katalogu animations — pomijam')
            return None

        # zbierz: anim -> dir -> [ścieżki klatek]
        zebrane = {}
        for anim_dir in sorted(os.listdir(anim_root)):
            if anim_dir not in ANIM_MAP:
                continue
            nazwa, fps = ANIM_MAP[anim_dir]
            per_dir = {}
            for d in DIRS:
                p = os.path.join(anim_root, anim_dir, d)
                if not os.path.isdir(p):
                    continue
                klatki = sorted(f for f in os.listdir(p) if f.endswith('.png'))
                if klatki:
                    per_dir[d] = [os.path.join(p, f) for f in klatki]
            if per_dir:
                zebrane[nazwa] = (fps, per_dir)

        if not zebrane:
            print(f'  ! {key}: brak rozpoznanych animacji')
            return None

        # rozmiar klatki z pierwszego pliku
        pierwsza = next(iter(next(iter(zebrane.values()))[1].values()))[0]
        with Image.open(pierwsza) as im:
            size = im.width

        # policz wiersze i maksymalną liczbę klatek
        wiersze = []            # (anim, dir, [klatki])
        for anim, (fps, per_dir) in zebrane.items():
            for d in DIRS:
                if d in per_dir:
                    wiersze.append((anim, d, per_dir[d]))
        maks_klatek = max(len(w[2]) for w in wiersze)

        arkusz = Image.new('RGBA', (maks_klatek * size, len(wiersze) * size), (0, 0, 0, 0))
        anims_meta = {}
        for r, (anim, d, klatki) in enumerate(wiersze):
            for c, kl in enumerate(klatki):
                with Image.open(kl) as im:
                    arkusz.paste(im.convert('RGBA'), (c * size, r * size))
            meta = anims_meta.setdefault(anim, {'fps': zebrane[anim][0], 'frames': {}, 'rows': {}})
            meta['frames'][d] = len(klatki)
            meta['rows'][d] = r

        os.makedirs(out_dir, exist_ok=True)
        plik = f'{key}.png'
        sciezka = os.path.join(out_dir, plik)
        # kwantyzacja: te arkusze są duże, a paleta 256 wystarcza (konwencja projektu)
        kw = arkusz.convert('RGBA')
        alpha = kw.getchannel('A')
        kw = kw.convert('RGB').quantize(colors=255, method=Image.FASTOCTREE, dither=Image.NONE)
        kw = kw.convert('RGBA')
        kw.putalpha(alpha)
        kw.save(sciezka, optimize=True)

        wpis = {
            'img': f'assets/veggie/{plik}',
            'size': size,
            'footOff': 0,
            'anims': anims_meta,
        }
        kb = os.path.getsize(sciezka) // 1024
        print(f'  + {key}: {len(wiersze)} wierszy, {maks_klatek} klatek, '
              f'{size}px, {kb} kB, anim: {", ".join(anims_meta)}')
        return key, wpis
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def main():
    zrodlo = sys.argv[1]
    cel = sys.argv[2]
    wyniki = {}
    for base, _, files in os.walk(zrodlo):
        for f in sorted(files):
            if f.endswith('.zip'):
                out = pakuj(os.path.join(base, f), cel)
                if out:
                    wyniki[out[0]] = out[1]
    print(json.dumps(wyniki, ensure_ascii=False)[:200] + '...')
    with open(os.path.join(cel, '_spritedata_veggie.json'), 'w', encoding='utf-8') as fh:
        json.dump(wyniki, fh, ensure_ascii=False, indent=1)
    print(f'\nZapakowano {len(wyniki)} postaci → {cel}')


if __name__ == '__main__':
    main()

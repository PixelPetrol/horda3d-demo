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
# (stara struktura eksportu PixelLaba: krótkie, przewidywalne nazwy — dopasowanie dokładne)
ANIM_MAP = {
    'Idle': ('idle', 6),
    'Running': ('run', 12),
    'Two-Footed_Jump': ('jump', 14),
    'Jump': ('jump', 14),
    'Attack': ('punch', 14),
    'Death': ('death', 10),
}

# Nowsze paczki PixelLaba nazywają katalogi animacji z promptu, więc nazwy są długie
# i CZĘSTO OBCIĘTE (np. 'pixel_art_explosion_animation_sprite_sheet_horizon' bez
# '..tal_strip'). Dlatego dopasowujemy po fragmencie nazwy. Kolejność ma znaczenie —
# pierwszy trafiony wzorzec wygrywa, a fragmenty są coraz krótsze, żeby przetrwać obcięcie.
ANIM_WZORCE = [
    # UMIEJETNOSCI AKTYWNE. Garlicino Stinkerino ma katalog
    # 'ladowanie_smrodliwej_aury' — bez tego wzorca packer POMIJAL cala animacje
    # umiejetnosci (ostrzezenie „nierozpoznana animacja") i postac nie miala czym
    # zagrac wlasnej mechaniki. Fragment 'aura' jest odporny na obciecie nazwy.
    ('aura', ('aura', 10)),
    ('smrod', ('aura', 10)),
    ('explosion', ('death', 12)),
    ('explod', ('death', 12)),          # 'explode'/'exploding'/obcięte 'explos'
    ('death', ('death', 10)),
    ('dying', ('death', 10)),
    # PixelLab nazywa katalog z promptu, wiec animacja ataku moze nazywac sie dowolnie
    # (Ketchupino: 'squeezes_its_own_body_hard_with_tiny_arms_compress'). Bez tych
    # wzorcow packer ja PO CICHU POMIJAL i atak wroga nie mial animacji.
    ('squeez', ('punch', 14)),
    ('squirt', ('punch', 14)),
    ('spit', ('punch', 14)),
    ('shoot', ('punch', 14)),
    ('throw', ('punch', 14)),
    ('attack', ('punch', 14)),
    ('punch', ('punch', 14)),
    ('jump', ('jump', 14)),
    ('sprint', ('run', 12)),            # 'Full_Sprint'
    ('running', ('run', 12)),
    ('run', ('run', 12)),
    ('walk', ('walk', 10)),
    ('idle', ('idle', 6)),              # 'Breathing_Idle', 'idle_breathing'
    ('breath', ('idle', 6)),
    ('animation_sprite_sheet', ('idle', 6)),   # bazowa animacja z promptu
    ('animation_sprite', ('idle', 6)),
    ('sprite_sheet', ('idle', 6)),
    ('sprite_she', ('idle', 6)),
]


def rozpoznaj_anim(nazwa_katalogu: str):
    """Katalog animacji -> (nazwa w silniku, fps) albo None."""
    if nazwa_katalogu in ANIM_MAP:            # stara struktura — bez zmian
        return ANIM_MAP[nazwa_katalogu]
    n = nazwa_katalogu.lower()
    for frag, wynik in ANIM_WZORCE:
        if frag in n:
            return wynik
    return None


def klucz(nazwa: str) -> str:
    """Nazwa pliku zip -> klucz w SPRITEDATA (małe litery, podkreślenia)."""
    n = os.path.splitext(os.path.basename(nazwa))[0]
    n = n.replace(' ', '_').lower()
    return re.sub(r'[^a-z0-9_]', '', n)


def znajdz_katalogi(root: str, nazwa: str):
    """Wszystkie katalogi o danej nazwie ('animations' / 'rotations') w rozpakowanym zipie.

    Stara struktura: <cokolwiek>/animations/<Anim>/<kierunek>/*.png
    Nowa struktura:  <Poza>/animations/<Anim>/<kierunek>/*.png + <Poza>/rotations/<kierunek>.png
    Oba przypadki obsługuje ten sam spacer po drzewie.
    """
    znalezione = []
    for base, dirs, _ in os.walk(root):
        if nazwa in dirs:
            znalezione.append(os.path.join(base, nazwa))
    return sorted(znalezione)


def klatki_rotacji(root: str):
    """kierunek -> [pojedyncza klatka] z katalogów 'rotations' (nowe paczki)."""
    per_dir = {}
    for rot in znajdz_katalogi(root, 'rotations'):
        for d in DIRS:
            p = os.path.join(rot, d + '.png')
            if os.path.isfile(p) and d not in per_dir:
                per_dir[d] = [p]
    return per_dir


def pakuj(zip_path: str, out_dir: str):
    key = klucz(zip_path)
    ostrzezenia = []
    tmp = tempfile.mkdtemp()
    try:
        with zipfile.ZipFile(zip_path) as z:
            z.extractall(tmp)
        anim_rooty = znajdz_katalogi(tmp, 'animations')
        rotacje = klatki_rotacji(tmp)
        if not anim_rooty and not rotacje:
            print(f'  ! {key}: brak katalogu animations/rotations — pomijam')
            return None

        # zbierz: anim -> dir -> [ścieżki klatek]
        zebrane = {}
        for anim_root in anim_rooty:
            for anim_dir in sorted(os.listdir(anim_root)):
                if not os.path.isdir(os.path.join(anim_root, anim_dir)):
                    continue
                rozpoznane = rozpoznaj_anim(anim_dir)
                if not rozpoznane:
                    ostrzezenia.append(f'nierozpoznana animacja "{anim_dir}" — pominięta')
                    continue
                nazwa, fps = rozpoznane
                per_dir = {}
                for d in DIRS:
                    p = os.path.join(anim_root, anim_dir, d)
                    if not os.path.isdir(p):
                        continue
                    klatki = sorted(f for f in os.listdir(p) if f.endswith('.png'))
                    if klatki:
                        per_dir[d] = [os.path.join(p, f) for f in klatki]
                if not per_dir:
                    continue
                if nazwa in zebrane:
                    # dwa katalogi mapują się na tę samą animację silnika — wygrywa
                    # bogatszy wariant (więcej kierunków, potem więcej klatek)
                    stary = zebrane[nazwa][1]
                    lepszy = (len(per_dir), max(len(v) for v in per_dir.values())) > \
                             (len(stary), max(len(v) for v in stary.values()))
                    ostrzezenia.append(
                        f'"{anim_dir}" też mapuje się na {nazwa} — '
                        f'{"nadpisuję poprzedni wariant" if lepszy else "pomijam (uboższy)"}')
                    if not lepszy:
                        continue
                zebrane[nazwa] = (fps, per_dir)

        # idle: uzupełnij brakujące kierunki pojedynczymi klatkami z 'rotations'
        # (nowe paczki mają tam pełne 8 kierunków pozy bazowej)
        if rotacje:
            if 'idle' not in zebrane:
                zebrane['idle'] = (6, dict(rotacje))
                ostrzezenia.append('brak animacji idle — zbudowano 1-klatkowe idle z rotations')
            else:
                braki = [d for d in DIRS if d not in zebrane['idle'][1] and d in rotacje]
                if braki:
                    for d in braki:
                        zebrane['idle'][1][d] = rotacje[d]
                    ostrzezenia.append(
                        f'idle nie miało kierunków {braki} — dopełnione klatkami z rotations')

        if not zebrane:
            print(f'  ! {key}: brak rozpoznanych animacji')
            return None

        # rozmiar klatki: dominująca szerokość (klatki o innym rozmiarze odrzucamy,
        # bo arkusz ma sztywną siatkę size×size)
        rozmiary = {}
        for _, per_dir in zebrane.values():
            for klatki in per_dir.values():
                for kl in klatki:
                    with Image.open(kl) as im:
                        rozmiary[im.width] = rozmiary.get(im.width, 0) + 1
        # NAJWIEKSZY, nie dominujacy: mniejsze klatki DOPELNIAMY (patrz `wstaw` nizej).
        # Poprzednio brany byl rozmiar dominujacy, a klatki innego rozmiaru albo
        # wypadaly, albo — gdy cala animacja byla „inna" — trafialy do arkusza w zlym
        # rozmiarze i rozlazily sie po sasiednich komorkach siatki. PixelLab potrafi
        # wyeksportowac jedna animacje w innej rozdzielczosci niz reszta (Don Chipso:
        # 64 px run/jump + 92 px idle; Ketchupino: 64 px idle/run + 92 px punch).
        size = max(rozmiary)
        if len(rozmiary) > 1:
            ostrzezenia.append(
                f'niejednolite rozmiary klatek {rozmiary} — arkusz {size}px, '
                f'mniejsze klatki dopelnione (bez przeskalowania, piksele nietkniete)')

        # policz wiersze i maksymalną liczbę klatek
        wiersze = []            # (anim, dir, [klatki])
        for anim, (fps, per_dir) in zebrane.items():
            for d in DIRS:
                if d in per_dir:
                    wiersze.append((anim, d, per_dir[d]))
        maks_klatek = max(len(w[2]) for w in wiersze)

        arkusz = Image.new('RGBA', (maks_klatek * size, len(wiersze) * size), (0, 0, 0, 0))
        anims_meta = {}
        MARG_DOL = 1        # ile pustych rzedow zostawiamy pod stopami w komorce

        for r, (anim, d, klatki) in enumerate(wiersze):
            # WYROWNUJEMY STOPY, NIE KRAWEDZIE KLATEK. PixelLab daje roznym animacjom
            # rozna ilosc pustego miejsca pod postacia (Ketchupino: bieg 1 pusty rzad,
            # atak 15) — przy wyrownaniu krawedzi butla PODNOSILA SIE o 14 px w trakcie
            # strzalu. Silnik liczy `footOff` z alfy RAZ NA CALY ARKUSZ, wiec wszystkie
            # animacje musza stac na tej samej linii.
            # Przesuniecie liczymy RAZ NA WIERSZ (nie na klatke), bo inaczej skasowalibysmy
            # ruch W OBREBIE animacji — np. luk skoku spłaszczylby sie do miejsca.
            # 1) najnizszy nieprzezroczysty rzad W CALYM WIERSZU
            dol_wiersza = 0
            for kl in klatki:
                with Image.open(kl) as im:
                    bb = im.convert('RGBA').getchannel('A').getbbox()
                    if bb:
                        dol_wiersza = max(dol_wiersza, bb[3])
            # 2) ODCINAMY puste rzedy pod trescia (te same dla calego wiersza, wiec ruch
            #    W OBREBIE animacji zostaje), a potem wyrownujemy do dolu komorki.
            #    Samo przesuwanie nie wystarczylo: klatki w rozmiarze komorki wypelniaja
            #    ja bez reszty i nie ma ich gdzie zjechac — dlatego crop, nie offset.
            for c, kl in enumerate(klatki):
                with Image.open(kl) as im:
                    im = im.convert('RGBA')
                    if dol_wiersza and dol_wiersza < im.height:
                        im = im.crop((0, 0, im.width, dol_wiersza))
                    if im.height > size - MARG_DOL:      # tresc wyzsza niz komorka: obetnij od gory
                        im = im.crop((0, im.height - (size - MARG_DOL), im.width, im.height))
                    ox = c * size + (size - im.width) // 2
                    oy = r * size + (size - MARG_DOL) - im.height
                    arkusz.paste(im, (ox, oy))
            meta = anims_meta.setdefault(anim, {'fps': zebrane[anim][0], 'frames': {}, 'rows': {}})
            meta['frames'][d] = len(klatki)
            meta['rows'][d] = r

        # silnik przy braku kierunku spada na 'south' (main.js: DIR_ROWS[idx] in A.dirs
        # ? ... : 'south'), więc animacja bez 'south' wywaliłaby grę. Aliasujemy
        # 'south' na jedyny/pierwszy dostępny kierunek — bez dodatkowych pikseli w arkuszu.
        for anim, meta in anims_meta.items():
            if 'south' not in meta['rows']:
                zrodlowy = next(iter(meta['rows']))
                meta['rows']['south'] = meta['rows'][zrodlowy]
                meta['frames']['south'] = meta['frames'][zrodlowy]
                ostrzezenia.append(
                    f'{anim}: brak kierunku south — alias south→{zrodlowy} (fallback silnika)')
            braki = [d for d in DIRS if d not in meta['rows']]
            if braki:
                ostrzezenia.append(f'{anim}: brak kierunków {braki} (silnik pokaże south)')

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
        opis = ', '.join(f'{a}@{m["fps"]}fps×{max(m["frames"].values())}kl/{len(m["frames"])}kier'
                         for a, m in anims_meta.items())
        print(f'  + {key}: {len(wiersze)} wierszy, {maks_klatek} klatek, '
              f'{size}px, {kb} kB, anim: {opis}')
        for o in ostrzezenia:
            print(f'      ! {o}')
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

    # scalamy z istniejącym indeksem — pakowanie pojedynczej paczki nie może zgubić
    # wpisów postaci zapakowanych wcześniej
    plik_json = os.path.join(cel, '_spritedata_veggie.json')
    scalone = {}
    if os.path.isfile(plik_json):
        with open(plik_json, encoding='utf-8') as fh:
            scalone = json.load(fh)
    nowe = [k for k in wyniki if k not in scalone]
    scalone.update(wyniki)
    with open(plik_json, 'w', encoding='utf-8') as fh:
        json.dump(scalone, fh, ensure_ascii=False, indent=1)
    print(f'\nZapakowano {len(wyniki)} postaci ({len(nowe)} nowych: {", ".join(nowe) or "-"}) '
          f'→ {cel}; indeks ma {len(scalone)} wpisów')


if __name__ == '__main__':
    main()

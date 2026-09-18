#!/usr/bin/env python3
"""Generator plansz komiksu wprowadzającego (Gemini image API) + przeróbka na pixel art.

Klucz API czytany z ~/.veggie_google_key (NIGDY z repo — plik jest w .gitignore).
Surowe obrazy lądują w dist/komiks_raw/planszaN_vK.png (poza gitem), a wybrane,
przerobione na pixel art 640×360, w assets/komiks/planszaN.png (to czyta silnik).

Użycie:
  python3 narzedzia/generuj_komiks.py gen  [numery plansz] [--warianty 2] [--model gemini-3.1-flash-image]
  python3 narzedzia/generuj_komiks.py pick 1:2 2:1 3:1 ...   # plansza:wariant → assets/komiks/
  python3 narzedzia/generuj_komiks.py pix dist/komiks_raw/plansza1_v1.png assets/komiks/plansza1.png

Pixel art: zmniejszenie do 160×90 (LANCZOS), kwantyzacja do 40 kolorów, powiększenie ×4
bez wygładzania (NEAREST) → 640×360, jak wymaga dokumenty/komiks-intro.md.
"""
import base64, json, os, sys, time, urllib.request, urllib.error
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / 'dist' / 'komiks_raw'
OUT = ROOT / 'assets' / 'komiks'
KEY_FILE = Path.home() / '.veggie_google_key'

# Wspólny blok stylu — ten sam dla wszystkich plansz, żeby komiks był spójny.
STYL = (
    'Retro 16-bit pixel art illustration, 16:9 widescreen comic panel, chunky visible pixels, '
    'limited palette, thick dark outlines, flat cel shading, bright saturated colors like '
    'Zelda Breath of the Wild: lime green grass (#9adf58), clear blue sky (#9cc8ec), '
    'vegetables in juicy fresh colors, junk food in greasy yellows, beiges and browns. '
    'Absolutely NO text, NO letters, NO speech bubbles, NO logos, NO watermarks. '
    'Leave the bottom 22% of the frame calm and uncluttered (caption area). '
)

PLANSZE = {
    1: 'Wide establishing shot of a sunny Polish housing estate: a prefab concrete block of flats, '
       'a metal carpet-beating rack and a sandbox in front, a small wooden vegetable stand with a '
       'striped awning on the corner, fluffy stylized trees, peaceful morning, no characters.',
    2: 'A black mafia limousine arriving on the estate lawn; leaning out of the window a giant '
       'crumpled potato-chip-bag character in a pinstripe suit, fedora, dark sunglasses, gold chain '
       'and a cigar; behind the car a marching row of small crumpled potato chip soldiers with mean '
       'stupid faces and tiny arms; salt crystals glittering on the lime green grass.',
    3: 'A small wooden vegetable stand being buried under a pile of white salt and sugar poured from '
       'a dump truck (no logos); crumpled potato chip workers installing a huge glowing snack vending '
       'machine next to it; a tiny old green-apple grandma character in a headscarf holding a slipper; '
       'in the background a ketchup bottle character spitting a red puddle onto the grass.',
    4: 'Heroic low-angle shot: a muscular bare-chested carrot character with a swept-back leafy green '
       'hairdo, gold chain, navy tracksuit pants with two white stripes, flip-flops and white socks, '
       'rising from a squat next to a metal carpet-beating rack; behind him shoulder to shoulder a bulky '
       'beetroot bouncer in a black t-shirt, a slim radish girl with a pencil case, and a garlic '
       'character with a faint green stink cloud; an approaching horde of crumpled potato chip soldiers '
       'far in the background.',
    5: 'Three-quarter top-down action shot: the muscular carrot character in navy tracksuit pants '
       'running through a bright lime green meadow, glowing yellow vitamin pellets and capsules flying '
       'around him, a horde of crumpled potato chips, pink marshmallow thugs and gummy bears closing in '
       'from all sides, dynamic motion, bright saturated colors.',
}


def klucz():
    if not KEY_FILE.exists():
        sys.exit(f'Brak klucza: {KEY_FILE}')
    return KEY_FILE.read_text().strip()


def generuj(nr, wariant, model):
    RAW.mkdir(parents=True, exist_ok=True)
    cel = RAW / f'plansza{nr}_v{wariant}.png'
    body = {
        'contents': [{'parts': [{'text': STYL + PLANSZE[nr]}]}],
        'generationConfig': {'responseModalities': ['IMAGE'], 'imageConfig': {'aspectRatio': '16:9'}},
    }
    url = f'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={klucz()}'
    # curl zamiast urllib: python.org-owy Python 3.12 na tym Macu nie ma certyfikatów
    # (CERTIFICATE_VERIFY_FAILED), a systemowy curl ma. Klucz idzie w URL-u tylko do
    # curla (nie do logów — nie drukujemy komendy).
    import subprocess
    d = None
    for proba in range(3):
        r = subprocess.run(['curl', '-s', '-S', '--max-time', '240', '-w', '\n%{http_code}',
                            '-H', 'Content-Type: application/json', '-d', json.dumps(body), url],
                           capture_output=True, text=True)
        tresc, _, kod = r.stdout.rpartition('\n')
        if kod == '200':
            d = json.loads(tresc); break
        print(f'  HTTP {kod} (próba {proba + 1}): {tresc[:400]}')
        if kod == '429' and 'limit: 0' in tresc:
            sys.exit('\nSTOP: darmowy plan tego projektu ma limit 0 dla modeli obrazkowych. Włącz rozliczanie\n'
                     '(Google Cloud Billing) przy projekcie, do którego należy klucz — patrz aistudio.google.com/apikey,\n'
                     'kolumna Project / Plan. Klucz zostaje ten sam.')
        if kod in ('429', '500', '503') and proba < 2:
            time.sleep(8 * (proba + 1)); continue
        return None
    for c in d.get('candidates', []):
        for p in c.get('content', {}).get('parts', []):
            if 'inlineData' in p:
                cel.write_bytes(base64.b64decode(p['inlineData']['data']))
                print(f'  zapisano {cel.relative_to(ROOT)} ({cel.stat().st_size // 1024} KB)')
                return cel
    print('  brak obrazu w odpowiedzi:', json.dumps(d)[:300])
    return None


def pixeluj(src, dst, kolory=40):
    from PIL import Image
    im = Image.open(src).convert('RGB')
    # przycięcie do 16:9 (model czasem oddaje 1376×768 lub podobne)
    w, h = im.size
    if abs(w / h - 16 / 9) > 0.01:
        if w / h > 16 / 9:
            nw = int(h * 16 / 9); im = im.crop(((w - nw) // 2, 0, (w - nw) // 2 + nw, h))
        else:
            nh = int(w * 9 / 16); im = im.crop((0, (h - nh) // 2, w, (h - nh) // 2 + nh))
    maly = im.resize((160, 90), Image.LANCZOS)
    maly = maly.quantize(colors=kolory, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).convert('RGB')
    duzy = maly.resize((640, 360), Image.NEAREST)
    Path(dst).parent.mkdir(parents=True, exist_ok=True)
    duzy.save(dst, optimize=True)
    print(f'  pixel art → {Path(dst).relative_to(ROOT) if str(dst).startswith(str(ROOT)) else dst}')


def main(argv):
    if not argv or argv[0] not in ('gen', 'pick', 'pix'):
        print(__doc__); return
    tryb, args = argv[0], argv[1:]
    if tryb == 'gen':
        warianty, model = 2, 'gemini-3.1-flash-image'
        if '--warianty' in args:
            i = args.index('--warianty'); warianty = int(args[i + 1]); del args[i:i + 2]
        if '--model' in args:
            i = args.index('--model'); model = args[i + 1]; del args[i:i + 2]
        numery = [int(a) for a in args] or sorted(PLANSZE)
        for nr in numery:
            for v in range(1, warianty + 1):
                print(f'plansza {nr} wariant {v} ({model})')
                generuj(nr, v, model)
    elif tryb == 'pick':
        for para in args:
            nr, v = para.split(':')
            pixeluj(RAW / f'plansza{nr}_v{v}.png', OUT / f'plansza{nr}.png')
    elif tryb == 'pix':
        pixeluj(args[0], args[1])


if __name__ == '__main__':
    main(sys.argv[1:])
